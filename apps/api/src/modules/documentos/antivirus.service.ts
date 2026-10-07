import net from 'node:net';
import { z } from 'zod';

/**
 * Antivirus detras de un puerto (documentos.md). `ClamavTcpScanner` habla el protocolo INSTREAM
 * de clamd por socket (sin dependencias externas); `NoopScanner` se usa cuando CLAMAV_HOST no esta
 * definido y marca el soporte con metadato `escaneo: 'OMITIDO'`.
 *
 * Falla cerrada: si clamd no responde se lanza `AntivirusNoDisponibleError` y la version queda en
 * ESCANEANDO (el job de rescate la reintenta); nunca pasa a DISPONIBLE sin escaneo cuando hay clamd.
 */
export interface ResultadoEscaneo {
  limpio: boolean;
  /** Firma detectada cuando `limpio` es false. */
  firma?: string;
  motor: 'CLAMAV' | 'OMITIDO';
}

export interface AntivirusPort {
  escanear(contenido: Buffer): Promise<ResultadoEscaneo>;
}

export class AntivirusNoDisponibleError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'AntivirusNoDisponibleError';
  }
}

export class NoopScanner implements AntivirusPort {
  async escanear(): Promise<ResultadoEscaneo> {
    return { limpio: true, motor: 'OMITIDO' };
  }
}

const TAMANO_TROZO = 64 * 1024;

export class ClamavTcpScanner implements AntivirusPort {
  constructor(
    private readonly host: string,
    private readonly puerto: number,
    private readonly timeoutMs = 30_000,
  ) {}

  escanear(contenido: Buffer): Promise<ResultadoEscaneo> {
    return new Promise<ResultadoEscaneo>((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.puerto });
      const partes: Buffer[] = [];
      let terminado = false;

      const terminar = (fn: () => void) => {
        if (terminado) return;
        terminado = true;
        socket.destroy();
        fn();
      };

      socket.setTimeout(this.timeoutMs, () => terminar(() => reject(new AntivirusNoDisponibleError('clamd no respondio a tiempo'))));
      socket.on('error', (e) => terminar(() => reject(new AntivirusNoDisponibleError(`clamd no disponible: ${e.message}`))));
      socket.on('data', (d: Buffer) => partes.push(d));
      socket.on('end', () => {
        const respuesta = Buffer.concat(partes).toString('utf8').replace(/\0/g, '').trim();
        terminar(() => {
          if (/\bOK$/.test(respuesta)) return resolve({ limpio: true, motor: 'CLAMAV' });
          const infectado = /^stream:\s*(.+?)\s+FOUND$/.exec(respuesta);
          if (infectado) return resolve({ limpio: false, firma: infectado[1], motor: 'CLAMAV' });
          return reject(new AntivirusNoDisponibleError(`Respuesta inesperada de clamd: ${respuesta.slice(0, 120)}`));
        });
      });

      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let i = 0; i < contenido.length; i += TAMANO_TROZO) {
          const trozo = contenido.subarray(i, i + TAMANO_TROZO);
          const longitud = Buffer.alloc(4);
          longitud.writeUInt32BE(trozo.length, 0);
          socket.write(longitud);
          socket.write(trozo);
        }
        socket.write(Buffer.alloc(4)); // fin de flujo
      });
    });
  }
}

const EnvAntivirus = z.object({
  CLAMAV_HOST: z.string().trim().min(1).optional(),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
});

let escaner: AntivirusPort | null = null;

/** Escaner segun el entorno (CLAMAV_HOST / CLAMAV_PORT). */
export function obtenerAntivirus(): AntivirusPort {
  if (escaner) return escaner;
  const e = EnvAntivirus.parse({
    CLAMAV_HOST: process.env.CLAMAV_HOST?.trim() || undefined,
    CLAMAV_PORT: process.env.CLAMAV_PORT?.trim() || undefined,
  });
  escaner = e.CLAMAV_HOST ? new ClamavTcpScanner(e.CLAMAV_HOST, e.CLAMAV_PORT) : new NoopScanner();
  return escaner;
}

/** Permite inyectar un escaner (pruebas o integracion). `null` restablece el valor por entorno. */
export function __setAntivirusForTests(port: AntivirusPort | null): void {
  escaner = port;
}
