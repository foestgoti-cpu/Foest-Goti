import type { Config } from 'tailwindcss';

/**
 * Paleta ESTRICTA (DECISIONES section 19, diseno visual):
 *   blanco #ffffff, primario #238dc1 (tintes 10 % y 20 % por opacidad), texto negro #000000.
 * `theme.colors` se reemplaza por completo (no `extend`) para que ninguna
 * clase de color fuera de la paleta compile. Sin emojis ni iconos decorativos.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      primary: '#238dc1',
      'primary-10': 'rgba(35, 141, 193, 0.10)',
      'primary-20': 'rgba(35, 141, 193, 0.20)',
      ink: '#000000',
    },
    fontFamily: {
      sans: ['system-ui', '"Segoe UI"', 'Arial', 'sans-serif'],
      mono: ['Consolas', '"Courier New"', 'monospace'],
    },
    borderRadius: {
      none: '0',
      DEFAULT: '2px',
      sm: '2px',
      md: '2px',
      lg: '2px',
      full: '9999px',
    },
    borderWidth: {
      DEFAULT: '1px',
      0: '0',
      2: '2px',
      4: '4px',
    },
    extend: {
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      spacing: {
        gutter: '16px',
      },
      maxWidth: {
        content: '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
