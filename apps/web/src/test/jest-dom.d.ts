import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/**
 * Vitest 5 cambio la firma de `Assertion` (dos parametros), por lo que el
 * `@testing-library/jest-dom/vitest` oficial ya no la aumenta. Se aumenta
 * `Matchers`, el punto de extension de Vitest 5.
 */
declare module 'vitest' {
  interface Matchers<R = void, T = unknown> extends TestingLibraryMatchers<unknown, R> {
    readonly __jestDomRecv?: T;
  }
}
