import { useNavigate } from 'react-router-dom';
import { Card, PageHeader } from '../../../components/ui';
import { ConvocatoriaForm } from '../components/ConvocatoriaForm';
import { useMutacionesConvocatoria } from '../hooks/useConvocatorias';
import { mensajeDeError } from '../utils';

/** `/admin/convocatorias/nueva`: crea la convocatoria en BORRADOR. */
export function ConvocatoriaNuevaPage() {
  const navigate = useNavigate();
  const { crear } = useMutacionesConvocatoria();

  return (
    <>
      <PageHeader
        titulo="Nueva convocatoria"
        descripcion="La convocatoria se crea en estado Borrador. Para habilitarla debe ofertar al menos un beneficio y conformar el comite evaluador."
        migas={[{ etiqueta: 'Convocatorias', ruta: '/admin/convocatorias' }, { etiqueta: 'Nueva' }]}
      />
      <Card>
        <ConvocatoriaForm
          enviando={crear.isPending}
          errorApi={crear.error ? mensajeDeError(crear.error) : null}
          onEnviar={(datos) => crear.mutate(datos, { onSuccess: (c) => navigate(`/admin/convocatorias/${c.id}`) })}
          onCancelar={() => navigate('/admin/convocatorias')}
        />
      </Card>
    </>
  );
}
