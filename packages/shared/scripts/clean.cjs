// Elimina dist/ antes de compilar (compatible con Windows y POSIX).
const fs = require('node:fs');
const path = require('node:path');
fs.rmSync(path.join(__dirname, '..', 'dist'), { recursive: true, force: true });
