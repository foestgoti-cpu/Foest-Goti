import { supabase } from '../../config/supabase';
import { TipoDocumento } from '@foest/shared';

export class RequisitosService {
  /**
   * Calcula los documentos exigibles dados unos beneficios y un tipo de trámite.
   */
  async calcularExigibles(beneficios: string[], tipoTramite: string) {
    if (!beneficios || beneficios.length === 0) return [];

    const { data, error } = await supabase
      .from('requisito_documento')
      .select('tipo_id, beneficio_codigo, obligatorio, tipo_tramite, tipo_documento(codigo, nombre)')
      .in('beneficio_codigo', beneficios)
      .eq('tipo_tramite', tipoTramite);

    if (error) {
      throw new Error(`Error calculando requisitos: ${error.message}`);
    }

    // Agrupar por tipo de documento
    const exigiblesMap = new Map<string, any>();
    
    for (const req of data) {
      const tipoCodigo = req.tipo_documento.codigo;
      if (!exigiblesMap.has(tipoCodigo)) {
        exigiblesMap.set(tipoCodigo, {
          tipo_codigo: tipoCodigo,
          nombre: req.tipo_documento.nombre,
          obligatorio: false,
          beneficios_que_lo_exigen: []
        });
      }
      
      const entry = exigiblesMap.get(tipoCodigo);
      if (req.obligatorio) entry.obligatorio = true;
      if (!entry.beneficios_que_lo_exigen.includes(req.beneficio_codigo)) {
        entry.beneficios_que_lo_exigen.push(req.beneficio_codigo);
      }
    }

    // SOP_ESP siempre admite carga voluntaria si los beneficios son LE1-LE6,
    // o podríamos agregarlo siempre opcional.
    const LE_BENEFICIOS = ['LE1', 'LE2', 'LE3', 'LE4', 'LE5', 'LE6'];
    const hasLE = beneficios.some(b => LE_BENEFICIOS.includes(b));
    if (hasLE && !exigiblesMap.has(TipoDocumento.SOP_ESP)) {
      exigiblesMap.set(TipoDocumento.SOP_ESP, {
        tipo_codigo: TipoDocumento.SOP_ESP,
        nombre: 'Soportes de línea especial',
        obligatorio: false,
        beneficios_que_lo_exigen: beneficios.filter(b => LE_BENEFICIOS.includes(b))
      });
    }

    return Array.from(exigiblesMap.values());
  }

  async getRequisitosByConvocatoria(convocatoriaId: string) {
    const { data: beneficiosConvocatoria, error: errorConv } = await supabase
      .from('convocatoria_beneficio')
      .select('beneficio_codigo')
      .eq('convocatoria_id', convocatoriaId);

    if (errorConv) {
      throw new Error(`Error obteniendo beneficios de convocatoria: ${errorConv.message}`);
    }

    const beneficios = beneficiosConvocatoria.map(b => b.beneficio_codigo);
    
    // Retornamos los requisitos para todos los trámites posibles (PV, RN, RI)
    // para los beneficios de esta convocatoria
    const { data, error } = await supabase
      .from('requisito_documento')
      .select('tipo_id, beneficio_codigo, obligatorio, tipo_tramite, tipo_documento(codigo, nombre)')
      .in('beneficio_codigo', beneficios);

    if (error) {
      throw new Error(`Error obteniendo requisitos: ${error.message}`);
    }

    return data;
  }
}

export const requisitosService = new RequisitosService();

