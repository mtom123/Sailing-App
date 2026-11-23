#!/usr/bin/env python3
"""Carica un file su Cloudflare R2 (API S3, firma AWS SigV4), solo libreria standard.

    python3 -I tools/chart/r2_upload.py <file locale> <chiave nel bucket> [content-type]

Le credenziali stanno FUORI dal progetto, in ~/.config/timone/r2.env (le scrive l'utente):
    R2_ACCOUNT_ID=...
    R2_ACCESS_KEY_ID=...
    R2_SECRET_ACCESS_KEY=...
    R2_BUCKET=timone-carta
Dopo il caricamento rilegge l'oggetto (HEAD) e controlla dimensione ed ETag (MD5).
"""
import datetime
import hashlib
import hmac
import http.client
import os
import sys

env = {}
with open(os.path.expanduser('~/.config/timone/r2.env')) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")

ACCOUNT, KEY, SECRET, BUCKET = env['R2_ACCOUNT_ID'], env['R2_ACCESS_KEY_ID'], env['R2_SECRET_ACCESS_KEY'], env.get('R2_BUCKET', 'timone-carta')
HOST = f'{ACCOUNT}.r2.cloudflarestorage.com'
REGION, SERVICE = 'auto', 's3'


def sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def request(method, obj_key, body_path=None, extra=None):
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date = now.strftime('%Y%m%dT%H%M%SZ')
    date = now.strftime('%Y%m%d')
    path = '/' + BUCKET + '/' + '/'.join(__import__('urllib.parse').parse.quote(p, safe='') for p in obj_key.split('/'))
    headers = {'host': HOST, 'x-amz-date': amz_date, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD'}
    headers.update({k.lower(): v for k, v in (extra or {}).items()})
    size = os.path.getsize(body_path) if body_path else 0
    if body_path:
        headers['content-length'] = str(size)
    names = sorted(headers)
    canonical = '\n'.join([method, path, '', ''.join(f'{n}:{headers[n].strip()}\n' for n in names), ';'.join(names), 'UNSIGNED-PAYLOAD'])
    scope = f'{date}/{REGION}/{SERVICE}/aws4_request'
    to_sign = '\n'.join(['AWS4-HMAC-SHA256', amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = sign(sign(sign(sign(('AWS4' + SECRET).encode(), date), REGION), SERVICE), 'aws4_request')
    signature = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    headers['authorization'] = f'AWS4-HMAC-SHA256 Credential={KEY}/{scope}, SignedHeaders={";".join(names)}, Signature={signature}'
    conn = http.client.HTTPSConnection(HOST, timeout=600)
    conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    for n, v in headers.items():
        conn.putheader(n, v)
    conn.endheaders()
    if body_path:
        sent = 0
        with open(body_path, 'rb') as f:
            while True:
                chunk = f.read(1 << 20)
                if not chunk:
                    break
                conn.send(chunk)
                sent += len(chunk)
                print(f'\r  {sent / 1e6:.0f}/{size / 1e6:.0f} MB', end='', flush=True)
        print()
    r = conn.getresponse()
    data = r.read()
    return r.status, dict((k.lower(), v) for k, v in r.getheaders()), data


local, key = sys.argv[1], sys.argv[2]
ctype = sys.argv[3] if len(sys.argv) > 3 else 'application/octet-stream'
md5 = hashlib.md5()
with open(local, 'rb') as f:
    for chunk in iter(lambda: f.read(1 << 20), b''):
        md5.update(chunk)
status, h, data = request('PUT', key, local, {'content-type': ctype, 'cache-control': 'public, max-age=300'})
if status != 200:
    sys.exit(f'PUT {status}: {data[:500]!r}')
status, h, _ = request('HEAD', key)
etag = h.get('etag', '').strip('"')
size = int(h.get('content-length', -1))
if status != 200 or size != os.path.getsize(local) or etag != md5.hexdigest():
    sys.exit(f'verifica fallita: HEAD {status}, dimensione {size}, etag {etag} vs md5 {md5.hexdigest()}')
print(f'caricato e verificato: {BUCKET}/{key}, {size / 1e6:.1f} MB, md5 {etag}')
