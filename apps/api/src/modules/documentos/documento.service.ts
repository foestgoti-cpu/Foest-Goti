import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { supabase } from '../../config/supabase';
import { TipoDocumento, EstadoCarga, UploadUrlDto, ConfirmarDocumentoDto } from '@foest/shared';
import crypto from 'node:crypto';

const s3Client = new S3Client({
  region: env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY || '',
    secretAccessKey: env.S3_SECRET_KEY || ''
  },
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
});

const BUCKET_NAME = env.S3_BUCKET || 'foest-documentos';

export class DocumentoService {
  async generateUploadUrl(postulacionId: string, dto: UploadUrlDto) {
    // 1. Verify postulacion and quota
    // ...

    // 2. Generate new document or version
    const documentoId = crypto.randomUUID();
    const version = 1;
    const key = `postulaciones/${postulacionId}/${documentoId}/v${version}.bin`;

    // 3. Register in DB
    /* 
    await supabase.from('documento').insert({
      id: documentoId,
      postulacion_id: postulacionId,
      tipo_id: (await this.getTipoId(dto.tipo_codigo)),
      version_actual: version,
      estado_carga: EstadoCarga.SUBIENDO,
    });
    */

    // 4. Generate presigned post
    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: BUCKET_NAME,
      Key: key,
      Conditions: [
        ['content-length-range', 1, 10485760], // up to 10MB
        ['eq', '$Content-Type', dto.mime]
      ],
      Fields: {
        'Content-Type': dto.mime
      },
      Expires: 600 // 10 minutes
    });

    return {
      documento_id: documentoId,
      version,
      upload: { url, fields },
      expira_en: new Date(Date.now() + 600000).toISOString()
    };
  }

  async confirmar(documentoId: string, dto: ConfirmarDocumentoDto) {
    // 1. Read object from S3 to verify it exists
    // 2. Compute SHA256
    // 3. Pass to file validator
    // 4. Update status to ESCANEANDO
    return { estado_carga: EstadoCarga.ESCANEANDO };
  }

  async getUrlLectura(documentoId: string) {
    // Check access, check if DISPONIBLE
    // Generate signed URL
    const key = `...`; // get from DB
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    return { url, expira_en: new Date(Date.now() + 300000).toISOString() };
  }
}

export const documentoService = new DocumentoService();

