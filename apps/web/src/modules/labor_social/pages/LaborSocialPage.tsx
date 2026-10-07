import { Alert, EmptyState, PageHeader, Spinner } from '../../../components/ui';
import { CertificadoCard } from '../components/CertificadoCard';
import { NuevoCertificadoCard } from '../components/NuevoCertificadoCard';
import { mensajeError } from '../formato';
import { useMisCertificados } from '../hooks/useLaborSocial';

/** /beneficiario/labor-social: certificados por semestre, actividades, acumulado frente al mínimo y GE-F038. */
export function LaborSocialPage() {
  const { data, isLoading, isError, error } = useMisCertificados();

  return (
    <>
      <PageHeader
        titulo="Labor social"
        descripcion="Registre las actividades de labor social que cumple en las dependencias de la Alcaldía, lleve el acumulado de horas por semestre y genere el certificado GE-F038."
      />

      <Alert tipo="info" titulo="La firma es física" className="mb-6">
        La plataforma no sustituye la firma de los secretarios de despacho. Descargue el GE-F038 definitivo, imprímalo, solicite las firmas, escanee el
        documento firmado y súbalo en Documentos de su postulación como soporte LAB_SOC. Después podrá presentar el certificado.
      </Alert>

      <div className="space-y-6">
        <NuevoCertificadoCard />

        {isLoading && <Spinner />}
        {isError && <Alert tipo="error">{mensajeError(error)}</Alert>}
        {data && data.certificados.length === 0 && (
          <EmptyState titulo="Aún no tiene certificados de labor social" descripcion="Cree el certificado del semestre para empezar a registrar sus actividades." />
        )}
        {data?.certificados.map((c) => (
          <CertificadoCard key={c.id} certificado={c} maxHorasDia={data.horas_maximas_por_dia} />
        ))}
      </div>
    </>
  );
}
