import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EmailSchema } from '@foest/shared';
import { Card, FormField, Input, Button, Alert } from '../../../components/ui';
import { authApi, mensajeDeErrorApi } from '../api';

/** Recuperacion de contrasena (POST /auth/password/forgot). Respuesta siempre generica. */
export function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const r = EmailSchema.safeParse(email);
    if (!r.success) {
      setError(r.error.issues[0]?.message ?? 'Correo no valido');
      return;
    }
    setError(null);
    setCargando(true);
    try {
      await authApi.olvidePassword(r.data);
      setEnviado(true);
    } catch (err) {
      setError(mensajeDeErrorApi(err));
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card titulo="Recuperar contrasena">
        {enviado ? (
          <Alert tipo="info">
            Si el correo esta registrado, recibira un enlace para restablecer su contrasena. El enlace tiene una vigencia limitada.
          </Alert>
        ) : (
          <form onSubmit={(e) => void enviar(e)} noValidate>
            <p className="mb-4 text-sm">Indique el correo con el que se registro. Le enviaremos un enlace para definir una nueva contrasena.</p>
            <FormField etiqueta="Correo electronico" nombre="email" error={error} obligatorio>
              <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </FormField>
            <Button type="submit" bloque cargando={cargando}>
              Enviar enlace
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm">
          <Link to="/login">Volver a iniciar sesion</Link>
        </p>
      </Card>
    </div>
  );
}
