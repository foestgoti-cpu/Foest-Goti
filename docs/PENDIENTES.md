# Puntos Abiertos y Validaciones Pendientes

Elementos que la especificación deja **parametrizados o marcados "a confirmar"** porque dependen de una decisión jurídica o institucional. Ninguno debe cablearse en código.

| # | Tema | Pregunta concreta | Quién decide | Dónde queda parametrizado |
|---|---|---|---|---|
| 1 | Pagaré y menores de edad | ¿El pagaré GE-F043 exige codeudor o acudiente como deudor solidario cuando el beneficiario es menor? | Jurídica | `CONFIG.PAGARE_REQUIERE_CODEUDOR_MENORES`, bloque opcional en `GE-F043.hbs` |
| 2 | Rechazo como acto administrativo | ¿El rechazo debe notificarse como acto administrativo con recurso de reposición y firma del funcionario competente? ¿Es compatible con el anonimato "Equipo FOEST"? | Jurídica | Recuadro en `evaluacion.md`; hoy el actor se conserva internamente y en auditoría |
| 3 | Concordancia normativa | Aplicabilidad exacta de los Acuerdos 023 y 037 de 2025 en el texto de los formatos | Jurídica / FOEST | `CONFIG.ACUERDO_VIGENTE_CODIGO` y `ACUERDO_VIGENTE_TEXTO` |
| 4 | Matriz de requisitos documentales | Validar la propuesta inicial de qué soporte exige cada beneficio y tipo de trámite | FOEST | Seed de `REQUISITO_DOCUMENTO` en `documentos.md` |
| 5 | Declaraciones juramentadas | Obtener el texto oficial de las 6 declaraciones del GE-F041 | FOEST | Catálogo `DECLARACION_JURAMENTADA` (versionado) |
| 6 | Renovación y reintegro | Reglas exactas de elegibilidad (período previo, interrupciones, promedio mínimo) | FOEST | `seguimiento_beneficios.md` (`validarElegibilidad`) |
| 7 | Labor social | Horas mínimas por semestre y quién puede certificar | FOEST | `CONFIG.LABOR_SOCIAL_HORAS_MINIMAS` |
| 8 | Convocatorias paralelas | ¿Puede haber más de una convocatoria por semestre (por línea o beneficio)? Hoy `UNIQUE(anio, semestre)` | FOEST | `convocatorias.md` |
| 9 | Retención y supresión de datos | Años de retención de documentos y postulaciones; alcance del derecho de supresión frente a la custodia probatoria | Jurídica | `CONFIG.RETENCION_DOCUMENTOS_ANIOS` |
| 10 | Plazo de subsanación | Días hábiles por defecto y máximo | FOEST | `CONFIG.SUBSANACION_DIAS_HABILES` |
| 11 | Presupuesto y cupos | ¿Exceder cupos o presupuesto bloquea o solo alerta? Hoy: alerta con confirmación explícita del administrador | FOEST | `seguimiento_beneficios.md` |
| 12 | Texto de consentimiento | Texto y versión vigentes de autorización de tratamiento de datos, incluido el de menores | Jurídica | `catalogos_configuracion.md` |
| 13 | Firma digital | Si se quiere equivalencia plena (Ley 527) habría que integrar firma certificada ONAC; el flujo actual es híbrido (firma física + escaneo) | Dirección FOEST | `formatos_oficiales.md` |
| 14 | Revocación y cobro | Procedimiento de revocación del apoyo y cobro del pagaré (fuera de la plataforma) | Jurídica | `seguimiento_beneficios.md` solo registra y notifica |
| 15 | Corrección de documento de identidad | Procedimiento y evidencia que se exige para corregir una cédula mal registrada | FOEST | `accounts.md` (corrección por administrador con motivo) |
