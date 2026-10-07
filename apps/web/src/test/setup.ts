import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

// Se registran los matchers a mano (en lugar de `@testing-library/jest-dom/vitest`)
// porque ese modulo importa 'vitest' desde la raiz del monorepo, y npm instala
// vitest 5 anidado en apps/web/node_modules.
expect.extend(matchers);

afterEach(() => {
  cleanup();
});
