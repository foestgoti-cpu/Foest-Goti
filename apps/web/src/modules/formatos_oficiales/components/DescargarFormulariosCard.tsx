import React, { useState } from 'react';
import { TipoFormato } from '@foest/shared';
import { formatosApi } from '../services/formatosApi';

interface DescargarFormulariosCardProps {
  postulacionId: string;
}

export const DescargarFormulariosCard: React.FC<DescargarFormulariosCardProps> = ({ postulacionId }) => {
  const [generando, setGenerando] = useState<Record<string, boolean>>({});

  const handleGenerar = async (tipo: TipoFormato) => {
    setGenerando(prev => ({ ...prev, [tipo]: true }));
    try {
      const res = await formatosApi.generarFormato(postulacionId, tipo);
      
      // Si responde 200/201 (ya mockeamos getUrlDescarga pero requeriría logica de estado)
      if (res.formato_id) {
        const { url } = await formatosApi.getUrlDescarga(res.formato_id);
        window.open(url, '_blank');
      }
    } catch (err) {
      console.error(err);
      alert('Error generando formato');
    } finally {
      setGenerando(prev => ({ ...prev, [tipo]: false }));
    }
  };

  return (
    <div className="bg-white p-6 rounded shadow-md mt-6">
      <h2 className="text-xl font-bold mb-4">Formatos Oficiales</h2>
      <p className="mb-4 text-sm text-gray-600">
        Descargue, imprima y firme los formatos oficiales para adjuntarlos a su postulación.
      </p>
      <div className="flex gap-4">
        <button 
          onClick={() => handleGenerar(TipoFormato.GE_F041)}
          disabled={generando[TipoFormato.GE_F041]}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {generando[TipoFormato.GE_F041] ? 'Generando...' : 'Descargar GE-F041'}
        </button>
        <button 
          onClick={() => handleGenerar(TipoFormato.GE_F043)}
          disabled={generando[TipoFormato.GE_F043]}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          {generando[TipoFormato.GE_F043] ? 'Generando...' : 'Descargar GE-F043'}
        </button>
      </div>
    </div>
  );
};

