import React, { useEffect, useState } from 'react';
import { documentosApi } from '../services/documentosApi';

interface DocumentChecklistProps {
  convocatoriaId: string;
  beneficios: string[];
  tipoTramite: string;
}

export const DocumentChecklist: React.FC<DocumentChecklistProps> = ({
  convocatoriaId, beneficios, tipoTramite
}) => {
  const [requisitos, setRequisitos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequisitos = async () => {
      setLoading(true);
      try {
        const data = await documentosApi.getRequisitos(convocatoriaId, beneficios, tipoTramite);
        setRequisitos(data);
      } catch (err) {
        console.error('Error fetching requisitos', err);
      } finally {
        setLoading(false);
      }
    };
    
    if (convocatoriaId && beneficios.length > 0 && tipoTramite) {
      fetchRequisitos();
    }
  }, [convocatoriaId, beneficios, tipoTramite]);

  if (loading) return <div>Cargando requisitos...</div>;

  return (
    <div className="bg-white p-4 rounded shadow-md">
      <h2 className="text-lg font-bold mb-4">Documentos Exigibles</h2>
      {requisitos.length === 0 ? (
        <p>No se encontraron requisitos para los beneficios seleccionados.</p>
      ) : (
        <ul className="space-y-3">
          {requisitos.map((req, i) => (
            <li key={i} className="flex justify-between items-center p-3 border rounded">
              <div>
                <p className="font-semibold">{req.nombre}</p>
                <p className="text-xs text-gray-500">
                  {req.obligatorio ? 'Obligatorio' : 'Opcional'} • 
                  Exigido por: {req.beneficios_que_lo_exigen.join(', ')}
                </p>
              </div>
              <div className="text-sm">
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded">
                  Pendiente
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

