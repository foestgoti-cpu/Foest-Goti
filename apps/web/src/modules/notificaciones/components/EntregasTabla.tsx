import { useState } from 'react';
import { CATALOGO_TIPOS_NOTIFICACION, ESTADOS_ENTREGA_CORREO } from '@foest/shared';
import { Alert, Badge, Button, Card, Input, Select, Table, type Columna } from '../../../components/ui';
import { useEntregas } from '../hooks/useNotificacionesAdmin';
import type { EntregaCorreo, EstadoEntregaCorreo } from '../types';
import { textoFechaHora } from './formato';

const TEXTO_ESTADO: Record<EstadoEntregaCorreo, string> = { ENVIADO: 'Enviado', ENTREGADO: 'Entregado', REBOTADO: 'Rebotado', QUEJA: 'Queja', FALLIDO: 'Fallido' };
const TEXTO_ROL = { PRINCIPAL: 'Principal', ALTERNATIVO: 'Alternativo', ACUDIENTE: 'Acudiente' } as const;

/** Entregas por destinatario (estado del proveedor, rebotes y quejas). */
export function EntregasTabla() {
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState('');
  const [email, setEmail] = useState('');
  const [emailAplicado, setEmailAplicado] = useState('');
  const entregas = useEntregas({ page, estado: estado || undefined, email: emailAplicado || undefined });

  const columnas: Columna<EntregaCorreo>[] = [
    { clave: 'enviado', titulo: 'Enviado', render: (e) => <time dateTime={e.enviado_en}>{textoFechaHora(e.enviado_en)}</time> },
    { clave: 'tipo', titulo: 'Tipo', render: (e) => (e.tipo ? (CATALOGO_TIPOS_NOTIFICACION[e.tipo as keyof typeof CATALOGO_TIPOS_NOTIFICACION]?.etiqueta ?? e.tipo) : '-') },
    { clave: 'email', titulo: 'Destinatario', className: 'break-all', render: (e) => e.destinatario_email },
    { clave: 'rol', titulo: 'Rol', render: (e) => TEXTO_ROL[e.rol_destinatario] },
    {
      clave: 'estado',
      titulo: 'Estado',
      render: (e) => <Badge tono="neutro" className={e.estado === 'REBOTADO' || e.estado === 'QUEJA' || e.estado === 'FALLIDO' ? 'border-danger! bg-danger-10! text-danger!' : undefined}>{TEXTO_ESTADO[e.estado]}</Badge>,
    },
    { clave: 'rebote', titulo: 'Rebote', render: (e) => (e.codigo_rebote ? `${e.codigo_rebote === 'HARD' ? 'Duro' : 'Blando'}${e.detalle_rebote ? `: ${e.detalle_rebote}` : ''}` : '-') },
    { clave: 'proveedor', titulo: 'ID proveedor', className: 'break-all text-xs', render: (e) => e.id_mensaje_proveedor ?? '-' },
  ];

  return (
    <Card titulo="Entregas de correo">
      <form
        className="mb-4 flex flex-wrap items-end gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          setEmailAplicado(email.trim());
          setPage(1);
        }}
      >
        <label className="block text-sm font-semibold">
          Estado
          <Select
            className="mt-1"
            value={estado}
            placeholder="Todos"
            opciones={ESTADOS_ENTREGA_CORREO.map((e) => ({ valor: e, etiqueta: TEXTO_ESTADO[e] }))}
            onChange={(ev) => {
              setEstado(ev.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="block text-sm font-semibold">
          Correo contiene
          <Input className="mt-1" value={email} onChange={(ev) => setEmail(ev.target.value)} autoComplete="off" />
        </label>
        <Button type="submit" variante="secundario">
          Buscar
        </Button>
      </form>
      {entregas.error && <Alert tipo="error">{(entregas.error as Error).message}</Alert>}
      <Table
        columnas={columnas}
        filas={entregas.data?.data ?? []}
        obtenerId={(e) => e.id}
        cargando={entregas.isLoading}
        caption="Entregas de correo por destinatario"
        vacio={{ titulo: 'Sin entregas', descripcion: 'No hay entregas con el filtro actual.' }}
        paginacion={entregas.data ? { page: entregas.data.page, page_size: entregas.data.page_size, total: entregas.data.total, onCambiarPagina: setPage } : undefined}
      />
    </Card>
  );
}
