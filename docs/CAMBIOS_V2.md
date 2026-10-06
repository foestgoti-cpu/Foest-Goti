# Cambios de la v2 respecto de la v1

Esta versión no tiene en cuenta la lista de requerimientos (RF/RNF/EP): se eliminaron las secciones "Requerimientos Asociados" y la trazabilidad a esos códigos. Se conservan las referencias normativas (Ley 1581, Ley 527, Acuerdo 023, formatos GE-F0xx).

## Contradicciones resueltas

| Hallazgo v1 | Resolución v2 |
|---|---|
| 403 vs 404 para recursos ajenos | Tabla única en DECISIONES §2: 403 por rol, 404 por recurso ajeno |
| `RECHAZADA` subsanable y a la vez "insubsanable" | `RECHAZADA` terminal; lo subsanable es `EN_CORRECCION` |
| `EN_EVALUACION` sin disparador | Se activa al **tomar** el expediente (`asignaciones`) |
| Beneficios `AS`, `AM`, `AI` sin definir | Eliminados; catálogo único de 12 códigos |
| Dos definiciones de `USUARIO`; `rol_id` y `USUARIO_ROL` | Una definición en `auth.md`; un solo rol por usuario |
| Funcionarios no podían iniciar sesión (sin verificación) | Alta por invitación que verifica el correo |
| Modal de cambio de clave sin endpoint | `POST /auth/password/change` |
| `/verificar-documento` pública fuera de la lista de rutas públicas | Lista cerrada de rutas públicas en `auth.md` |
| Alertas del backend distintas a las del panel | Alineadas en `admin_dashboard.md` |
| `resumen.pdf` sin plantilla | Plantilla `resumen.hbs` definida |

## Vacíos cubiertos (módulos y datos nuevos)

- **Nuevos módulos:** `catalogos_configuracion`, `auditoria`, `notificaciones`, `asignaciones`, `formatos_oficiales`, `labor_social`, `seguimiento_beneficios`.
- Asignación por expediente (tomar, liberar, reasignar, conflicto de interés con exclusión).
- Dictamen **por beneficio** con aprobación parcial.
- Montos, cupos, presupuesto, desembolsos y estados posteriores a la aprobación.
- Matriz `REQUISITO_DOCUMENTO` completa (propuesta inicial).
- Chequeo documental por tipo, lo que permite `NO_PRESENTA` sobre soportes no cargados.
- `fecha_limite_subsanacion` con expiración automática.
- Estados de convocatoria `SUSPENDIDA` y `ARCHIVADA` con transiciones y endpoints.
- Notificaciones para los tres roles y correo por outbox.
- Listado de postulaciones para el administrador, estado y descarga de reportes asíncronos, desistimiento, borrado de borrador, reenvío de verificación.
- Catálogo SNIES, calendario de festivos, catálogo de configuración con valores por defecto.
- Alta del primer administrador (`seed:admin`) y corrección de documento de identidad.
- Consentimiento de tratamiento de datos, menores de edad y acudiente.

## Errores técnicos corregidos

- **Vista materializada**: nuevo grano `(postulacion_id, ciclo)`, `COUNT(DISTINCT)`, p90 calculado en consulta, índice único para `REFRESH CONCURRENTLY` y programación de refresco.
- **Hash dentro del PDF**: ahora el QR lleva un código aleatorio y el SHA-256 del archivo final vive en BD.
- **Carga a S3**: POST prefirmado con límite de tamaño impuesto por S3, hash calculado por el servidor, antivirus y purga de cargas huérfanas.
- **Dependencia circular del envío**: la generación de GE-F041 y GE-F043 sube a P1 con control de `FORMATOS_DESACTUALIZADOS`.
- **Rotación del refresh token**: ventana de gracia para pestañas concurrentes.
- **Fuerza bruta**: contadores independientes por IP y por email; rate limit en registro, recuperación y subida.
- **RLS/Supabase**: se elimina como mecanismo principal; queda como endurecimiento opcional.
- **Correo en el envío**: outbox transaccional.
- **Días hábiles**: calendario de festivos como dependencia explícita.
- **Sanitización CSV**: solo celdas de texto; los campos numéricos y teléfonos no se corrompen.
- **Estructura del repo**: `apps/api`, `apps/web`, `packages/shared`.

## Seguridad y cumplimiento

- Auditoría de lecturas sensibles, descargas de documentos y exportaciones, además de eventos de autenticación.
- Cifrado a nivel de campo de los datos de pago.
- Anonimato del evaluador mediante serializador explícito, no solo sustitución de nombres.
- Política de retención parametrizada y derechos del titular (acceso, rectificación, supresión).
- Prioridades reordenadas: auditoría, notificaciones y configuración pasan a la fase P0.

Los puntos que requieren decisión jurídica o institucional están en [PENDIENTES.md](./PENDIENTES.md).
