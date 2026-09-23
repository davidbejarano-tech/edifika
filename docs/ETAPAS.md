# Building Buddy · Plan de construcción por etapas

Cada etapa termina con algo que puedes probar. Copia el prompt en Claude Code, deja que trabaje, prueba con la lista de verificación y recién entonces pasa a la siguiente. Si algo no cumple, díselo con precisión: qué hiciste, qué esperabas y qué pasó.

---

## Etapa 0 · Preparación (tú, una sola vez, 1 a 2 horas)

1. Crea cuentas gratuitas en **GitHub**, **Supabase**, **Vercel** (entra con GitHub) y **Resend**.
2. Instala **Node.js 20 o superior** y **Git**. **Docker Desktop** es opcional: solo hace falta si quieres una copia local de Supabase; sin Docker, Claude Code trabaja directo con tu proyecto de Supabase en la nube.
3. Instala **Claude Code**. Opción simple: la app de escritorio de Claude, pestaña **Code**. Opción terminal (instalador nativo): en Mac o Linux `curl -fsSL https://claude.ai/install.sh | bash`; en Windows, en PowerShell, `irm https://claude.ai/install.ps1 | iex`. Guía oficial: https://code.claude.com/docs/en/quickstart
4. Crea una carpeta `building-buddy`, copia dentro todo este kit y ábrela en la terminal.
5. En Supabase crea un proyecto (región São Paulo, la más cercana a Lima) y guarda la URL, la `anon key` y la `service_role key`.
6. Ejecuta `claude` dentro de la carpeta y pega el prompt de la Etapa 1.

---

## Etapa 1 · Base del proyecto, base de datos y login

**Prompt:**
> Lee CLAUDE.md, docs/SPEC.md y docs/ETAPAS.md. Ejecuta la Etapa 1: crea el proyecto Next.js 15 con TypeScript y Tailwind en esta carpeta sin borrar docs/ ni supabase/. Inicializa Supabase local, aplica las migraciones 0001, 0002 y 0003 y el seed.sql, y genera los tipos. Activa la verificación de correo en Supabase Auth. Crea la Edge Function `login-departamento` y la pantalla de login con dos modos: habitante (código de edificio, número de departamento y contraseña) y administrador (correo y contraseña). Agrega recuperación de contraseña. Crea un script `scripts/crear-usuarios-demo.ts` que registre en el edificio los-ficus: una titular externa, un coadministrador externo y los habitantes de los departamentos 101 y 302. Protege las rutas por rol y nivel: la administración va a /inicio y el habitante a /cuentas. Si la cuenta tiene varios edificios o es vecino administrador, muestra el selector correspondiente (RN-25). Al terminar, dime cómo probarlo.

**Verificación:**
- [ ] Entro como administrador y llego a una pantalla de inicio (vacía por ahora).
- [ ] Entro con `los-ficus` + `302` + clave y llego a "Mis cuentas".
- [ ] Una clave incorrecta muestra un error claro.
- [ ] Un habitante que escribe /inicio en la URL es redirigido.
- [ ] El coadministrador entra a /inicio pero no ve habilitadas las acciones exclusivas del titular.

---

## Etapa 2 · Gestión del edificio

**Prompt:**
> Ejecuta la Etapa 2 según docs/SPEC.md sección 7 y el prototipo. Empieza por el alta: pantalla Crear cuenta, asistente "Registrar edificio" con crear_edificio e importación de departamentos con importar_departamentos (Excel con SheetJS o pegando la tabla, vista previa y errores por fila) y pantalla Mis edificios (RN-25 a RN-27). Luego: pantalla de Configuración del edificio con sus 4 pasos (datos, departamentos, cálculo de cuota con vista previa del reparto del agua, cobranza) y pantalla Departamentos y ocupantes con área editable en la celda, alícuota recalculada, agregar y editar departamento, activar o desactivar el acceso, historial y "Cambio de ocupante" usando la función registrar_cambio_ocupante más una Edge Function `invitar-habitante` que crea la cuenta y envía la invitación con Resend. Crea también el layout del administrador con la navegación agrupada del prototipo, mostrando u ocultando acciones según el nivel (matriz de permisos de SPEC sección 2). Agrega la sección Equipo de administración (RN-19 a RN-23): invitar y quitar coadministradores con la Edge Function `invitar-administrador`, designar al vecino validador y transferir la titularidad con confirmación explícita. Crea la Edge Function `transferencia-forzada` (solo plataforma, con carga del acta).

**Verificación:**
- [ ] Creo una cuenta nueva, registro un edificio e importo 12 departamentos desde Excel.
- [ ] Un Excel con una fila errónea muestra la fila y el motivo, y no guarda nada.
- [ ] Desde Mis edificios registro un segundo edificio y cambio entre ambos.
- [ ] Cambio el área de un departamento y la alícuota se actualiza; si no suman 100 %, aparece el aviso.
- [ ] Registro un nuevo inquilino, le llega el correo y puede crear su clave.
- [ ] El inquilino anterior ya no puede entrar y aparece en el historial.
- [ ] Cambiar a "Mixta con agua" muestra los campos del recibo y la vista previa.
- [ ] Invito 2 coadministradores; el sistema no permite un tercero.
- [ ] Un coadministrador no puede crear usuarios ni cambiar la configuración, ni desde la pantalla ni llamando directamente a la base de datos.
- [ ] Transfiero la titularidad: el saliente solo puede leer y, pasados 15 días, pierde el acceso (se prueba cambiando la fecha en local).

---

## Etapa 3 · Finanzas del administrador

**Prompt:**
> Ejecuta la Etapa 3: pantallas Gastos, Cálculo mensual (agua, lecturas y tabla de cuotas usando calcular_cuotas), Ciclo mensual (pasos y "Abrir mes" con abrir_periodo y confirmar_gastos), Cobranza (por validar con vista del comprobante desde Storage, validar_pago, rechazar_pago con motivo, cuentas por cobrar con cuentas_por_cobrar, compromisos emitidos, nuevo extraordinario con emitir_extraordinario, pago en efectivo con registrar_pago_efectivo), Resumen con la fachada del edificio y cuenta corriente por departamento, y Estado de cuenta con resumen_periodo e ingresos_por_tipo. Programa el corte diario con pg_cron según la sección 9 de la migración y agrega en local un botón oculto de desarrollo para ejecutar ejecutar_cortes().

**Verificación:**
- [ ] Registro gastos, los confirmo y ya no puedo editarlos.
- [ ] Abro el mes siguiente y cada departamento recibe su cuota con el desglose correcto (compara con el prototipo).
- [ ] La suma de cuotas es igual al total de gastos, con diferencia de céntimos por redondeo.
- [ ] El estado de cuenta muestra administrador, ingresos, gastos, acumulado y el desglose opcional.
- [ ] Tras el corte, las cuotas impagas aparecen como vencidas y con mora.
- [ ] Un titular vecino no puede validar su propio pago; lo valida el coadministrador.
- [ ] Sin coadministrador, lo valida el vecino designado, que solo ve los pagos del titular.

---

## Etapa 4 · Experiencia del habitante

**Prompt:**
> Ejecuta la Etapa 4: layout del habitante y pantallas Mis cuentas (total, vencido, compromisos, pagar y subir comprobante a Storage en comprobantes/{edificio}/{departamento}/, motivo de rechazo, historial de pagos, cuenta corriente, adelantos con solicitar_adelanto), Estado de cuenta (desglose solo si el edificio lo publica), Reportes (gastos por categoría e ingresos y gastos por mes), Chat del edificio con Supabase Realtime y Mi perfil con cambio de contraseña. Verifica con dos habitantes que ninguno ve datos del otro.

**Verificación:**
- [ ] Como 302 pago una cuota con una foto del voucher; el administrador la ve y la valida; mi cuenta se actualiza.
- [ ] Si el administrador rechaza, veo el motivo y puedo reenviar.
- [ ] Un mensaje del chat aparece en el otro celular sin recargar.
- [ ] Como 302 no puedo ver pagos ni comprobantes del 101 (ni cambiando la URL).

---

## Etapa 5 · Recibos en PDF y envío

**Prompt:**
> Ejecuta la Etapa 5: diseño del recibo formal igual al del prototipo (número, datos del departamento, alícuota, detalle con comunes y agua, pagos aplicados, deuda anterior, total, vencimiento, gastos del edificio del mes base y datos de pago). Edge Functions `generar-recibo` (PDF en Storage y fila en recibos) y `enviar-recibo` (correo con Resend y adjunto). En la pantalla Recibos: "Generar y enviar recibo" con vista previa, Descargar PDF, Compartir (Web Share API), enlace de WhatsApp y "Generar y enviar todos". Exporta también el estado de cuenta a PDF. El habitante puede ver y descargar su recibo.

**Verificación:**
- [ ] El PDF se ve bien impreso en A4 y en el celular.
- [ ] El correo llega con el PDF adjunto y el envío queda registrado.
- [ ] Los montos del recibo coinciden con la cuenta corriente.

---

## Etapa 6 · Dashboard comercial y salida a producción

**Prompt:**
> Ejecuta la Etapa 6: pantalla Inicio con las tarjetas de módulos (activos a color, bloqueados en gris), ficha del módulo con precio, prueba de 14 días con activar_prueba, modal de planes y botón "Solicitar plan" que registre la solicitud y me avise por correo. Agrega política de privacidad y términos (incluida la depuración por inactividad, RN-29) y el consentimiento al activar la cuenta. Crea la Edge Function `depurar-edificios-inactivos` con sus correos de aviso del día 60 y 83, el banner de inactividad y la exportación de datos del edificio (Excel con departamentos, cargos, pagos y gastos). Luego prepara el despliegue: conecta el repositorio a Vercel, configura las variables de entorno, aplica las migraciones al proyecto Supabase en la nube, despliega las Edge Functions, activa pg_cron y verifica el dominio en Resend. Dame una lista de verificación final.

**Verificación:**
- [ ] La app funciona en la URL de Vercel y con mi dominio.
- [ ] Los correos salen desde mi dominio y no caen en spam.
- [ ] El corte diario corre solo (reviso la tabla cortes al día siguiente del vencimiento).
- [ ] En local, un edificio de prueba con la fecha de actividad retrocedida recibe los avisos y se elimina al día 90; uno con plan pagado no.

---

## Etapa 7 · Módulo Áreas comunes

**Prompt:**
> Ejecuta la Etapa 7 según RN-30 a RN-37 y el prototipo. Administración: pestañas Reservas (por atender, próximas, por cerrar, garantías por devolver), Zonas (formulario con todas las reglas y bloqueos de fechas) y Garantías en custodia. Vecino: zonas, calendario de turnos con disponibilidad(), reserva con aceptación del reglamento usando solicitar_reserva, Mis reservas con pago de cargos por el flujo normal y cancelación. Programa expirar_reservas cada 15 minutos con pg_cron. En el estado de cuenta agrega la línea "Garantías en custodia" fuera del saldo. Prueba dos vecinos reservando el mismo turno a la vez.

**Verificación:**
- [ ] Configuro la parrilla con tarifa S/ 50 y garantía S/ 100; un vecino reserva, paga, se valida y la reserva queda confirmada.
- [ ] Un vecino con deuda vencida no puede reservar.
- [ ] Si no paga en 48 horas, la reserva expira y el turno se libera.
- [ ] Al cerrar con daños retengo S/ 40: el estado de cuenta suma S/ 50 + S/ 40 como ingreso y la garantía restante no aparece como ingreso.

## Después del piloto

Prioriza según lo que pidan los administradores reales:
- Pagos en línea con Culqi, Niubiz o Mercado Pago (conciliación automática).
- WhatsApp Business API para recordatorios de vencimiento.
- Módulos Áreas comunes y Mantenimiento completos.
- Varios administradores por edificio y acceso de solo lectura para la junta de propietarios.
- Facturación de la suscripción.

## Cómo trabajar como Product Owner

- Una etapa por sesión. Antes de aceptar, prueba tú mismo cada punto de la verificación.
- Pide siempre "explícame qué cambiaste y cómo lo pruebo".
- Si una regla de negocio cambia, pide primero que actualice `docs/SPEC.md` y después el código.
- Haz commit al final de cada etapa aprobada (`git commit -m "Etapa N aprobada"`), así siempre puedes volver atrás.
