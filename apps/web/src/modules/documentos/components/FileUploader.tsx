import React, { useState } from 'react';
import { TipoDocumento } from '@foest/shared';
import { documentosApi } from '../services/documentosApi';

interface FileUploaderProps {
  postulacionId: string;
  tipo: TipoDocumento;
  onSuccess: () => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ postulacionId, tipo, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // 1. Get presigned URL
      const { upload, documento_id, version } = await documentosApi.getUploadUrl(postulacionId, {
        tipo_codigo: tipo,
        mime: file.type,
        tamano_bytes: file.size
      });

      // 2. Upload to S3
      const formData = new FormData();
      Object.keys(upload.fields).forEach(key => {
        formData.append(key, upload.fields[key]);
      });
      formData.append('file', file);

      const response = await fetch(upload.url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload to S3 failed');
      }

      // 3. Confirm
      await documentosApi.confirmarUpload(documento_id, version);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert('Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 border border-dashed rounded bg-gray-50">
      <h3 className="font-semibold mb-2">Subir Documento: {tipo}</h3>
      <input 
        type="file" 
        accept="application/pdf,image/jpeg,image/png"
        onChange={e => setFile(e.target.files ? e.target.files[0] : null)}
      />
      <button 
        onClick={handleUpload} 
        disabled={!file || uploading}
        className="mt-2 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {uploading ? 'Subiendo...' : 'Subir'}
      </button>
    </div>
  );
};

