import { PageHeader } from '../../../components/ui';
import { DeclaracionesEditor } from '../components/DeclaracionesEditor';

export function DeclaracionesPage() {
  return (
    <>
      <PageHeader
        titulo="Declaraciones juramentadas y consentimiento"
        descripcion="Textos legales versionados que acepta el beneficiario: las seis declaraciones del formato GE-F041 y el consentimiento de tratamiento de datos (Ley 1581 de 2012). Cada publicacion crea una version inmutable."
        migas={[{ etiqueta: 'Panel', ruta: '/admin' }, { etiqueta: 'Declaraciones juramentadas' }]}
      />
      <DeclaracionesEditor />
    </>
  );
}
