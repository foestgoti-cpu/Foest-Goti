// Marca dist/esm como modulo ES y dist/cjs como CommonJS para que Node y los
// empaquetadores resuelvan correctamente cada salida.
const fs = require('node:fs');
const path = require('node:path');
const dist = path.join(__dirname, '..', 'dist');
fs.writeFileSync(path.join(dist, 'esm', 'package.json'), JSON.stringify({ type: 'module' }, null, 2));
fs.writeFileSync(path.join(dist, 'cjs', 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
