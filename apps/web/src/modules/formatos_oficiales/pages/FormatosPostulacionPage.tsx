import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/ui';
import { DescargarFormulariosCard } from '../components/DescargarFormulariosCard';

/** /beneficiario/postulaciones/:id/formatos */
export function FormatosPostulacionPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <>
      <PageHeader
        titulo="Formatos oficiales de la postulación"
        migas={[
          { etiqueta: 'Mis postulaciones', ruta: '/beneficiario/postulaciones' },
          { etiqueta: 'Detalle', ruta: `/beneficiario/postulaciones/${id}` },
          { etiqueta: 'Formatos' },
        ]}
        descripcion="Genere los formatos GE-F041 y GE-F043, fírmelos a mano y cárguelos como soporte antes de enviar su postulación."
      />
      <DescargarFormulariosCard postulacionId={id} />
      <ol className="mt-6 list-decimal space-y-1 pl-6 text-base">
        <li>Complete su perfil y el formulario de la postulación.</li>
        <li>Genere y descargue cada formato.</li>
        <li>Imprima, firme de puño y letra y escanee cada formato.</li>
        <li>Suba el escaneo como soporte (FORM_INS o PAG_CART) en su postulación.</li>
        <li>Si cambia sus datos después de generar un formato, regenérelo y fírmelo de nuevo.</li>
      </ol>
      <p className="mt-4">
        <Link to={`/beneficiario/postulaciones/${id}`}>Volver a la postulación</Link>
      </p>
    </>
  );
}
