// Copia las plantillas Handlebars (.hbs) de los modulos a dist (tsc solo emite .js).
const fs = require('node:fs');
const path = require('node:path');

const MODULOS_CON_PLANTILLAS = ['formatos_oficiales', 'labor_social'];

for (const modulo of MODULOS_CON_PLANTILLAS) {
  const origen = path.join(__dirname, '..', 'src', 'modules', modulo, 'plantillas');
  if (!fs.existsSync(origen)) continue;
  const destino = path.join(__dirname, '..', 'dist', 'modules', modulo, 'plantillas');
  fs.mkdirSync(destino, { recursive: true });
  for (const archivo of fs.readdirSync(origen)) {
    if (archivo.endsWith('.hbs')) fs.copyFileSync(path.join(origen, archivo), path.join(destino, archivo));
  }
}
