import { PageHeader } from '../../../components/ui';
import { PreferenciasNotificaciones } from '../components/PreferenciasNotificaciones';

/** Preferencias de correo del beneficiario (/beneficiario/notificaciones/preferencias); el buzon vive en beneficiario_dashboard. */
export function PreferenciasBeneficiarioPage() {
  return (
    <>
      <PageHeader
        titulo="Preferencias de notificaciones"
        descripcion="Decida que correos opcionales desea recibir. Los avisos con efectos en plazos y derechos siempre se envian."
        migas={[{ etiqueta: 'Inicio', ruta: '/beneficiario' }, { etiqueta: 'Notificaciones', ruta: '/beneficiario/notificaciones' }, { etiqueta: 'Preferencias' }]}
      />
      <PreferenciasNotificaciones />
    </>
  );
}
