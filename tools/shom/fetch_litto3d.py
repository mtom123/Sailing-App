# Fetch only the MNT5 .asc files out of Shom Litto3D prepackages (.7z) using HTTP Range requests.
# usage: python3 -I shom_mnt5.py <libdir> <keyfile> <outdir> <group> <pkg> [<pkg> ...]
import sys, os, time, lzma, struct, gzip, urllib.request
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, sys.argv[1]); import sevenz
key = open(sys.argv[2]).read().strip(); out = sys.argv[3]; group = sys.argv[4]; pkgs = sys.argv[5:]
OUT1 = os.environ.get('MNT1_DIR')  # if set, also keep the 1 m grids gzipped there
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh) TIMONE-chart/1.0', 'Referer': 'https://diffusion.shom.fr/'}

def url(p): return f'https://services.data.shom.fr/{key}/telechargement/prepackageGroup/{group}/prepackage/{p}/file/{p}.7z'

def get(u, o, n):
    for a in range(8):
        try:
            req = urllib.request.Request(u, headers={**UA, 'Range': f'bytes={o}-{o+n-1}'})
            with urllib.request.urlopen(req, timeout=120) as r:
                if r.status != 206: raise IOError(f'status {r.status}')
                b = r.read()
                if len(b) != n: raise IOError(f'short {len(b)}/{n}')
                return b
        except Exception as e:
            err = e; time.sleep(3 * (a + 1))
    raise err

def decode(raw, f):
    cs = f['coders']
    if len(cs) != 1: raise ValueError('coders ' + str([c[0].hex() for c in cs]))
    cid, _, _, props = cs[0]
    if cid == b'\x03\x01\x01':
        return sevenz.decode_folder(raw, f)
    if cid == b'\x21':
        dec = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[{'id': lzma.FILTER_LZMA2, 'dict_size': 1 << 26}])
        return dec.decompress(raw, max_length=f['usizes'][0])
    if cid == b'\x00':
        return raw
    raise ValueError('coder ' + cid.hex())

def one(p):
    u = url(p); got = 0; total = 0
    try:
        h = sevenz.read_header(lambda o, n: get(u, o, n))
    except Exception as e:
        return f'{p} ERRORE header {e}'
    def dst_of(f):
        return os.path.join(out, p, f['name']) if 'MNT5' in f['name'].split('/')[-1] else os.path.join(OUT1, p, f['name']) + '.gz'
    want = {}
    for f in h['files']:
        if 'folder' in f and f['name'].lower().endswith('.asc') and ('MNT5' in f['name'].split('/')[-1] or (OUT1 and '/MNT1m/' in f['name'])):
            want.setdefault(f['folder'], []).append(f)
    if not want: return f'{p} nessun MNT5'
    got1 = 0
    for k, fs in want.items():
        todo = [f for f in fs if not os.path.exists(dst_of(f))]
        if not todo: continue
        o, s = h['pack'][k]
        raw = get(u, o, s); total += s
        data = decode(raw, h['folders'][k])
        for f in todo:
            dst = dst_of(f); os.makedirs(os.path.dirname(dst), exist_ok=True)
            tmp = dst + '.part'; body = data[f['start']:f['start'] + f['size']]
            if dst.endswith('.gz'):
                with open(tmp, 'wb') as w: w.write(gzip.compress(body, 6))
                got1 += 1
            else:
                with open(tmp, 'wb') as w: w.write(body)
                got += 1
            os.replace(tmp, dst)
    return f'{p} {got} lastre 5 m, {got1} da 1 m, {total/1e6:.1f} MB'

t0 = time.time()
with ThreadPoolExecutor(int(os.environ.get('WORKERS', '8'))) as ex:
    for i, msg in enumerate(ex.map(one, pkgs), 1):
        print(f'[{time.time()-t0:.0f} s] {i}/{len(pkgs)} {msg}', flush=True)
