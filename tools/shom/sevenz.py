# Minimal 7z header reader: returns folders (coders, pack offsets/sizes, unpack sizes) and files mapped to folders.
import struct, lzma

class R:
    def __init__(s, b): s.b = b; s.p = 0
    def byte(s): v = s.b[s.p]; s.p += 1; return v
    def bytes(s, n): v = s.b[s.p:s.p+n]; s.p += n; return v
    def num(s):
        b = s.byte(); mask = 0x80; val = 0
        for i in range(8):
            if b & mask == 0:
                return val | ((b & (mask - 1)) << (8 * i))
            val |= s.byte() << (8 * i); mask >>= 1
        return val
    def bits(s, n):
        out = []; mask = 0; cur = 0
        for _ in range(n):
            if mask == 0: cur = s.byte(); mask = 0x80
            out.append(bool(cur & mask)); mask >>= 1
        return out
    def defbits(s, n):
        allon = s.byte()
        return [True]*n if allon else s.bits(n)

def pack_info(r):
    packpos = r.num(); n = r.num(); sizes = []
    while True:
        t = r.byte()
        if t == 0: break
        if t == 9: sizes = [r.num() for _ in range(n)]
        elif t == 10:
            d = r.defbits(n); [r.bytes(4) for x in d if x]
    return packpos, sizes

def folder(r):
    nc = r.num(); coders = []; tin = 0; tout = 0
    for _ in range(nc):
        f = r.byte(); idsz = f & 0xf; cid = r.bytes(idsz)
        nin, nout = (r.num(), r.num()) if f & 0x10 else (1, 1)
        props = r.bytes(r.num()) if f & 0x20 else b''
        coders.append((cid, nin, nout, props)); tin += nin; tout += nout
    bonds = [(r.num(), r.num()) for _ in range(tout - 1)]
    npacked = tin - len(bonds)
    packed = [r.num() for _ in range(npacked)] if npacked > 1 else [None]
    return {'coders': coders, 'tout': tout, 'bonds': bonds}

def unpack_info(r):
    assert r.byte() == 11
    n = r.num(); assert r.byte() == 0
    folders = [folder(r) for _ in range(n)]
    assert r.byte() == 12
    for f in folders: f['usizes'] = [r.num() for _ in range(f['tout'])]
    t = r.byte()
    if t == 10:
        d = r.defbits(n); [r.bytes(4) for x in d if x]; t = r.byte()
    assert t == 0
    return folders

def substreams(r, folders):
    nus = [1]*len(folders); sizes = []
    t = r.byte()
    if t == 13:
        nus = [r.num() for _ in folders]; t = r.byte()
    have = t == 9
    for f, k in zip(folders, nus):
        if k == 0: continue
        total = f['usizes'][-1] if True else 0
        # main output stream = the one not bound
        bound = {b[0] for b in f['bonds']}
        main = [i for i in range(f['tout']) if i not in bound][0]
        total = f['usizes'][main]
        s = 0; lst = []
        for _ in range(k - 1):
            v = r.num() if have else 0; lst.append(v); s += v
        lst.append(total - s); sizes.append(lst)
    if have: t = r.byte()
    while t != 0:
        if t == 10:
            nd = sum(nus)  # approximate: digests for streams w/o folder crc
            d = r.defbits(nd); [r.bytes(4) for x in d if x]
        t = r.byte()
    return nus, sizes

def streams_info(r):
    pk = None; folders = []; ss = None
    while True:
        t = r.byte()
        if t == 0: break
        if t == 6: pk = pack_info(r)
        elif t == 7: folders = unpack_info(r)
        elif t == 8: ss = substreams(r, folders)
    return pk, folders, ss

def decode_folder(raw, f):
    cid, nin, nout, props = f['coders'][0]
    assert len(f['coders']) == 1 and cid == b'\x03\x01\x01', ('coder', [c[0].hex() for c in f['coders']])
    d = props[0]; pb = d // 45; d %= 45; lp = d // 9; lc = d % 9
    dic = struct.unpack('<I', props[1:5])[0]
    dec = lzma.LZMADecompressor(lzma.FORMAT_RAW, filters=[{'id': lzma.FILTER_LZMA1, 'dict_size': dic, 'lc': lc, 'lp': lp, 'pb': pb}])
    return dec.decompress(raw, max_length=f['usizes'][0])

def read_header(read_at, total_size=None):
    """read_at(offset, length) -> bytes"""
    sig = read_at(0, 32)
    assert sig[:6] == b"7z\xbc\xaf'\x1c"
    nho, nhs = struct.unpack('<QQ', sig[12:28])
    h = read_at(32 + nho, nhs)
    r = R(h)
    t = r.byte()
    if t == 0x17:
        (pp, psz), folders, _ = streams_info(r)
        raw = read_at(32 + pp, psz[0])
        h = decode_folder(raw, folders[0]); r = R(h); t = r.byte()
    assert t == 1
    t = r.byte()
    if t == 2:  # archive props
        while r.byte() != 0: r.bytes(r.num())
        t = r.byte()
    if t == 3:  # additional streams
        streams_info(r); t = r.byte()
    pk, folders, ss = (None, [], None)
    if t == 4:
        pk, folders, ss = streams_info(r); t = r.byte()
    files = []
    if t == 5:
        n = r.num(); empty = [False]*n; names = []
        while True:
            pt = r.byte()
            if pt == 0: break
            sz = r.num(); body = R(r.bytes(sz))
            if pt == 14: empty = body.bits(n)
            elif pt == 17:
                body.byte(); raw = body.b[1:]
                names = raw.decode('utf-16-le').split('\x00')[:n]
        files = [{'name': names[i], 'empty': empty[i]} for i in range(n)]
    # map files to folders
    nus, sizes = ss if ss else ([1]*len(folders), [[f['usizes'][-1]] for f in folders])
    fi = 0; si = 0
    packpos, psizes = pk
    off = 32 + packpos; folder_pack = []
    for s in psizes: folder_pack.append((off, s)); off += s
    out = []
    for k, f in enumerate(folders):
        start = 0
        for j in range(nus[k]):
            while files[fi]['empty']: fi += 1
            files[fi].update(folder=k, start=start, size=sizes[k][j]); start += sizes[k][j]; fi += 1
    return {'folders': folders, 'pack': folder_pack, 'files': files}
