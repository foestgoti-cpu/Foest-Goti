import { NavLink } from 'react-router-dom';
import type { Rol } from '@foest/shared';
import { NAVEGACION, TITULO_ROL } from '../../navigation';
import { cn } from '../../lib/cn';

export function Sidebar({ rol }: { rol: Rol }) {
  const grupos = NAVEGACION[rol];
  return (
    <nav aria-label="Navegacion principal" className="border-ink bg-white md:w-64 md:shrink-0 md:border-r">
      <p className="border-b border-ink bg-primary-10 px-4 py-3 text-xs font-semibold uppercase tracking-widest">{TITULO_ROL[rol]}</p>
      {grupos.map((g, i) => (
        <div key={g.titulo ?? i} className="border-b border-ink/30 py-2">
          {g.titulo && <p className="px-4 py-1 text-xs uppercase tracking-wider text-ink/70">{g.titulo}</p>}
          <ul>
            {g.items.map((item) => (
              <li key={item.ruta}>
                <NavLink
                  to={item.ruta}
                  end={item.exacta}
                  className={({ isActive }) =>
                    cn(
                      'block border-l-4 px-4 py-2 text-base text-ink no-underline hover:bg-primary-10 hover:no-underline',
                      isActive ? 'border-primary bg-primary-20 font-semibold' : 'border-transparent',
                    )
                  }
                >
                  {item.etiqueta}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
