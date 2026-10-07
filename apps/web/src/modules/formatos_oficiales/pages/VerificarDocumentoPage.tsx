import React, { useState } from 'react';
import { formatosApi } from '../services/formatosApi';

export const VerificarDocumentoPage: React.FC = () => {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleVerificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo) return;
    
    setLoading(true);
    setResultado(null);
    try {
      const res = await formatosApi.verificarPublico(codigo);
      setResultado(res);
    } catch (err) {
      console.error(err);
      alert('Error verificando el código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white rounded shadow-md">
      <h1 className="text-2xl font-bold mb-4">Verificar Formato Oficial</h1>
      <form onSubmit={handleVerificar} className="flex flex-col gap-4">
        <label className="text-sm font-semibold">Código de Verificación:</label>
        <input 
          type="text" 
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
          className="border p-2 rounded"
          placeholder="Ingrese el código impreso o escanee el QR"
        />
        <button 
          type="submit" 
          disabled={loading || !codigo}
          className="bg-blue-600 text-white p-2 rounded disabled:opacity-50"
        >
          {loading ? 'Verificando...' : 'Verificar'}
        </button>
      </form>

      {resultado && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">Resultado:</h2>
          {resultado.valido ? (
            <div className="text-green-700">
              <p>✅ <strong>Formato Válido</strong></p>
              <p>Tipo: {resultado.tipo}</p>
              <p>Generado el: {new Date(resultado.generado_en).toLocaleString()}</p>
              <p className="mt-2 text-xs text-gray-500 break-all">SHA-256: {resultado.sha256}</p>
            </div>
          ) : (
            <div className="text-red-600">
              <p>❌ <strong>Código no encontrado o formato inválido</strong></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

