import fs from 'node:fs'; import path from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'; import Pbf from 'pbf'
const root = process.env.CARTA || 'tools/.cache/carta'; let n = 0, bad = 0, ex = []
for (const z of ['12','13','14']) for (const x of fs.readdirSync(path.join(root, z))) for (const f of fs.readdirSync(path.join(root, z, x))) {
  const t = new VectorTile(new Pbf(new Uint8Array(fs.readFileSync(path.join(root, z, x, f)))))
  for (const ln of ['soundg','depcnt','depare']) { const L = t.layers[ln]; if (!L) continue
    for (let i = 0; i < L.length; i++) { const d = L.feature(i).properties.d; n++
      if (!(typeof d === 'number' && d > -50 && d < 4000)) { bad++; if (ex.length < 8) ex.push([z, x, f, ln, d]) } } }
}
console.log('valori', n, 'anomali', bad, JSON.stringify(ex))
