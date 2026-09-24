# EDIFIKA · Especificación funcional y técnica (MVP v1)

Versión 1.6 · Setiembre 2026 (1.1: jerarquía de administración RN-19 a RN-25 · 1.2: autoregistro y depuración RN-26 a RN-29, Áreas comunes RN-30 a RN-37 · 1.3: página de bienvenida · 1.4: áreas y método en la configuración de la cobranza, cuota mixta con monto fijo, medidores de agua RN-38 · 1.5: alícuota sobre la suma de áreas, cuota = base × agua, reparto del agua por % de consumo, redondeo exacto · 1.6: el producto se llama EDIFIKA, lema "Administra tus edificios, sin complicaciones") · Product Owner: David

El prototipo navegable (`docs/prototipo.html`) es la referencia visual y funcional. Si este documento y el prototipo difieren, manda este documento.

---

## 1. Producto

EDIFIKA es un SaaS para administrar edificios residenciales en Perú. El administrador calcula y cobra las cuotas de mantenimiento, registra gastos y emite estados de cuenta y recibos. El habitante consulta lo que debe, paga subiendo su comprobante y ve en qué se gasta el dinero del edificio.

Modelo comercial: suscripción mensual por edificio con módulos base incluidos y módulos adicionales con prueba gratuita de 14 días (Product-Led Growth).

## 2. Usuarios y roles

La administración puede estar a cargo de un vecino del edificio o de un externo (persona o empresa administradora). En ambos casos se organiza en dos niveles.

| Rol | Quién es | Qué puede hacer |
|---|---|---|
| Administrador titular (nivel 1) | Vecino o externo; uno solo por edificio | Todo: configuración, departamentos, usuarios, equipo de administración, confirmar gastos, abrir mes, extraordinarios, anulaciones, módulos y plan |
| Coadministrador (nivel 2) | Vecino o externo; hasta 2 por edificio | Solo datos operativos: gastos, agua y lecturas, validar pagos, pagos en efectivo, generar y enviar recibos, chat. Ve todo lo del administrador |
| Administrador saliente | Quien entregó la titularidad | Solo lectura durante 15 días |
| Vecino validador | Habitante designado por el titular | Valida los pagos del departamento del titular cuando no hay coadministrador |
| Habitante | Propietario residente o inquilino con acceso | Ver sus cuentas, pagar y subir comprobantes, pedir adelantos, ver estado de cuenta, reportes y chat |
| Plataforma | Equipo de EDIFIKA | Transferencias forzadas con acta; alta de organizaciones y planes (fuera de v1) |

Un departamento tiene como máximo **un habitante con acceso activo**. Los propietarios que no viven en el edificio se registran como personas, sin cuenta. Un vecino administrador tiene los dos accesos: el de su departamento y el de administración.

### Matriz de permisos

| Acción | Titular | Coadministrador | Saliente (15 días) |
|---|---|---|---|
| Ver todas las pantallas de administración | Sí | Sí | Sí |
| Registrar y corregir gastos no confirmados, agua y lecturas | Sí | Sí | No |
| Validar o rechazar pagos y registrar efectivo (RN-22) | Sí | Sí | No |
| Generar y enviar recibos | Sí | Sí | No |
| Confirmar gastos y abrir el mes | Sí | No | No |
| Emitir extraordinarios y anular compromisos | Sí | No | No |
| Configuración del edificio y departamentos | Sí | No | No |
| Crear o modificar usuarios, ocupantes y equipo | Sí | No | No |
| Designar vecino validador y transferir la titularidad | Sí | No | No |
| Activar pruebas de módulos y solicitar planes | Sí | No | No |

## 3. Alcance

**Incluido en v1:** autoregistro de edificios con importación de departamentos, depuración de edificios inactivos, módulos base (Gestión del edificio, Finanzas y cuotas, Comunicación), dashboard de módulos con prueba de 14 días, módulo Áreas comunes completo, recibos en PDF y envío por correo.

**Fuera de v1:** pagos en línea con tarjeta, WhatsApp automático (en v1 solo enlace para compartir), módulos Mantenimiento y Marketplace funcionales, facturación electrónica SUNAT, app nativa, acceso de solo lectura para la junta de propietarios.

## 4. Arquitectura

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend y servidor web | Next.js 15 (App Router) + TypeScript + Tailwind CSS | Estándar, rápido de construir, despliegue simple en Vercel |
| Base de datos | Supabase PostgreSQL | Reglas de negocio en SQL y seguridad por fila (RLS) |
| Autenticación | Supabase Auth (correo + contraseña) | Contraseñas cifradas, recuperación por correo |
| Archivos | Supabase Storage (buckets privados) | Comprobantes y recibos PDF |
| Lógica privilegiada | Supabase Edge Functions | Login por departamento, invitaciones, PDF y correo |
| Tareas programadas | pg_cron | Corte automático diario |
| Correo | Resend | Envío de recibos e invitaciones |
| Hosting | Vercel | Despliegue automático desde GitHub |

Principio clave: **las reglas de negocio viven en la base de datos** (funciones SQL en `supabase/migrations`). El frontend llama a esas funciones y nunca calcula dinero por su cuenta.

## 5. Modelo de datos

Definido en `supabase/migrations/`: `0001_esquema_inicial.sql` (núcleo), `0002_alta_y_depuracion.sql` (autoregistro, importación, inactividad) y `0003_areas_comunes.sql` (zonas y reservas). Resumen:

- **organizaciones** → **edificios** (datos, área total, tipo de cálculo, día de corte, mora, cuenta bancaria)
- **departamentos** (número, piso, área) · **personas** · **ocupaciones** (historial propietario/inquilino)
- **perfiles** (cuenta de Auth) · **membresias** (rol por edificio: habitante ligado a un departamento, o admin con nivel titular, operador o lectura) · **plataforma_admins**
- **edificios.validador_designado_id** (vecino que valida los pagos del titular)
- **periodos** (un mes contable; uno abierto a la vez) · **gastos** · **recibos_agua** · **lecturas_agua** (m³ por departamento y periodo)
- **medidores** (número de serie por departamento, con historial) · **lecturas_medidor** (lectura del día de lectura; de ella salen los m³) · **edificios.monto_fijo_mensual / dia_lectura**
- **compromisos** (cuentas por cobrar: cuota, mora, extraordinario, adelanto, ajuste) · **pagos** · **cortes**
- **recibos** (PDF y envío) · **mensajes** (chat) · **modulos_edificio** · **auditoria**
- **edificios.ultima_actividad / suscripcion_pagada / aviso_inactividad** · **depuraciones** (rastro técnico sin datos personales)
- **zonas_comunes** · **bloqueos_zona** · **reservas** (con cargos de tarifa y garantía como compromisos)

Montos en `numeric(12,2)`, soles. Fechas de negocio en zona horaria `America/Lima` (función `hoy_lima()`).

## 6. Reglas de negocio

**RN-01 Identificador.** El número de departamento identifica al habitante dentro de su edificio. Es único por edificio.

**RN-02 Alícuota.** Alícuota = área del departamento ÷ suma de las áreas de todos los departamentos. El sistema la calcula solo: no hay un "área total" que declarar, así que las alícuotas siempre suman 100 %. Las **áreas comunes** (m²) se registran solo como dato informativo: cada departamento muestra su "área asignada" = su área + (su área ÷ suma de áreas) × áreas comunes, lo que da el mismo porcentaje. Las áreas se registran en la configuración de la cobranza, no al registrar el edificio (RN-26). Mientras falte el área de algún departamento no se pueden calcular cuotas que se repartan por área.

**RN-03 Cómo se calcula la cuota.** Cuota del mes = **parte fija** + **parte variable (agua)**. El titular toma dos decisiones independientes en la configuración de la cobranza; mientras no las tome, la cobranza queda "sin configurar" y no se pueden calcular cuotas.

*1. Base de la cuota:*
- **Monto fijo por área:** el titular define el monto fijo mensual del edificio; cada departamento paga monto × alícuota.
- **Monto fijo igual para todos:** el titular define el monto por departamento; todos pagan lo mismo. No necesita áreas.
- **Gastos reales del mes por área:** el total de gastos confirmados del mes se reparte por alícuota.

*2. Agua:*
- **Por consumo:** el recibo se cobra aparte, según los medidores (RN-38). Si la base son los gastos reales, el gasto "Agua" no se suma a la base para no cobrarlo dos veces.
- **Incluida en la cuota:** no se cobra agua aparte. Con monto fijo, el monto ya la cubre; con gastos reales, el recibo es un gasto más.

| | Agua por consumo | Agua incluida |
|---|---|---|
| Monto fijo por área | Fijo × alícuota + agua medida | Se cobra lo mismo todos los meses |
| Monto fijo igual para todos | Monto por depto + agua medida | Monto por depto, sin variable |
| Gastos reales por área | (Gastos − agua) × alícuota + agua medida | Gastos × alícuota |

*Redondeo:* cada parte se reparte al céntimo y los céntimos que sobran se asignan, de uno en uno, a los departamentos con mayor fracción. Así la parte fija suma exactamente el monto fijo (o los gastos) y el agua suma exactamente el recibo.

**RN-04 Mes vencido.** Las cuotas de un mes se calculan con los datos confirmados del mes anterior: sus gastos, su recibo de agua y sus lecturas.

**RN-05 Recibo de agua.** Registrar el recibo de agua (monto y consumo total en m³ del medidor general) crea o actualiza automáticamente un gasto "Agua" del periodo. No se edita a mano.

**RN-38 Medidores y reparto del agua.**
- Cada departamento puede tener **un medidor activo**, identificado por su **número de serie**, único dentro del edificio. Se registra la lectura inicial y la fecha de instalación. Al cambiar un medidor, el anterior queda en el historial y el nuevo empieza con su propia lectura inicial.
- El edificio define un **día de lectura** del mes (1 a 28). Ese día la administración ingresa la lectura de cada medidor.
- **Consumo del departamento (m³)** = lectura actual − lectura anterior del mismo medidor (o la lectura inicial, si es la primera). Una lectura menor que la anterior se rechaza con el nombre del medidor y del departamento.
- **Reparto del recibo:** % de prorrateo = consumo del departamento ÷ suma del consumo de todos los departamentos. Cuota de agua = recibo × % de prorrateo. Todo el recibo se reparte así: el agua común (medidor general − suma de los departamentos: riego, limpieza, áreas comunes) queda incluida en proporción al consumo de cada uno.
- El sistema muestra el agua común en m³ como dato informativo. Si no hay lecturas en el mes, el recibo se reparte por alícuota.

**RN-06 Confirmación de gastos.** Al confirmar, los gastos, el agua y las lecturas del periodo quedan bloqueados y el estado de cuenta pasa de "Borrador" a "Oficial".

**RN-07 Apertura de mes.** Requiere gastos confirmados del mes actual. Cierra el periodo, abre el siguiente, emite una cuota por departamento con su desglose y registra los gastos recurrentes del nuevo mes. Vencimiento = día de corte del nuevo mes.

**RN-08 Cuentas por cobrar.** Todo compromiso emitido y no pagado es una cuenta por cobrar. Los adelantos cuentan solo desde su vencimiento.

**RN-09 Corte automático.** Cada día a las 00:10 de Lima, las cuotas no pagadas después del día de corte se marcan como morosas y, si la mora es mayor que cero, se emite un compromiso de mora. Se ejecuta una sola vez por periodo. Un pago en revisión no genera mora.

**RN-10 Pago del habitante.** El habitante elige un compromiso pendiente, indica medio y número de operación y sube el comprobante (imagen o PDF, máximo 5 MB). El compromiso pasa a "En revisión". El monto del pago es siempre el del compromiso.

**RN-11 Validación.** Quien tenga permiso según RN-22 valida (compromiso "Pagado", se registra el ingreso) o rechaza con motivo obligatorio (compromiso vuelve a "Pendiente" y el habitante ve el motivo). Con el mismo permiso se registran pagos en efectivo. Cada pago muestra quién lo validó.

**RN-12 Adelantos.** El habitante puede adelantar de 1 a 6 meses. El monto estimado es su última cuota. Al abrir ese mes, si la cuota real es mayor, se emite un ajuste por la diferencia.

**RN-13 Extraordinarios.** El administrador emite un compromiso a todos o a un departamento, repartiendo un monto total por alícuota o cobrando el mismo monto a cada uno.

**RN-14 Estado de cuenta.** Saldo anterior = saldo inicial + ingresos validados de meses previos − gastos de periodos previos. Monto acumulado = saldo anterior + ingresos del mes − gastos del mes. Los ingresos se cuentan en el mes de la fecha de pago. Debe mostrar: administrador titular a cargo (RN-24), total de ingresos, total de gastos, monto acumulado y, opcionalmente, cuentas por cobrar por departamento.

**RN-15 Transparencia.** Los habitantes ven los totales, gastos y estado de cuenta del edificio. El desglose de deudas por departamento es visible para ellos solo si el edificio lo publica.

**RN-16 Cambio de ocupante.** Lo registra solo el titular. El acceso anterior se desactiva y queda en el historial. La deuda pertenece al departamento, no a la persona. Una venta cierra también el alquiler vigente. Si el ocupante que sale era administrador, su nivel de administración no cambia automáticamente: el titular decide si lo mantiene, lo quita o, si era el titular, transfiere (RN-23).

**RN-17 Módulos.** Los módulos base siempre están activos. Cada módulo adicional admite una prueba de 14 días, una sola vez. Vencida la prueba, vuelve a bloquearse.

**RN-18 Auditoría.** Confirmar gastos, abrir periodo, validar o rechazar pagos, pagos en efectivo, extraordinarios, anulaciones, cambios de ocupante, cambios del equipo, designación del validador, transferencias y cortes quedan registrados con autor y fecha.

**RN-19 Niveles de administración.** Cada edificio tiene exactamente un administrador titular (nivel 1) y hasta dos coadministradores (nivel 2). El titular y los coadministradores pueden ser vecinos o externos. Nunca puede quedar un edificio sin titular.

**RN-20 Alcance del nivel 2.** El coadministrador solo ingresa datos operativos según la matriz de permisos de la sección 2. No confirma, no cierra periodos, no emite cargos, no anula y no toca la estructura del edificio ni los usuarios.

**RN-21 Gestión de usuarios.** Solo el titular crea, modifica, activa, desactiva o restablece la clave de cualquier usuario: habitantes, ocupantes y coadministradores. Los externos se invitan por correo.

**RN-22 Segregación en la validación de pagos.**
- Nadie valida, rechaza ni registra en efectivo pagos de su propio departamento.
- Los pagos del departamento del titular los valida un coadministrador. Si no hay coadministrador activo, los valida el vecino validador designado por el titular.
- El vecino validador solo ve y valida los pagos del departamento del titular. No puede vivir en ese departamento.
- Si no hay coadministrador ni validador, los pagos del titular quedan en revisión y el sistema le avisa que designe uno.
- El titular tampoco puede anular compromisos de su propio departamento.

**RN-23 Transferencia de la titularidad.**
- *Voluntaria:* el titular elige al nuevo titular (un coadministrador, un vecino o un externo invitado). El saliente queda con acceso de solo lectura por 15 días o, si hay cupo, como coadministrador. Si era vecino, conserva siempre su acceso de habitante.
- *Forzada:* si el titular no entrega el cargo, el equipo de EDIFIKA hace la transferencia con el acta de la junta de propietarios, que queda archivada. El saliente queda en lectura por 15 días.
- Los periodos abiertos, pagos en revisión y tareas pendientes continúan con el nuevo titular. Si el vecino validador vive con el nuevo titular, pierde la designación.

**RN-24 Nombre en los documentos.** El estado de cuenta y los recibos muestran solo al titular. El estado de cuenta oficial guarda el nombre del titular que confirmó los gastos, y el recibo el del titular vigente al generarse. Una transferencia posterior no cambia documentos ya emitidos.

**RN-25 Varios edificios.** Una misma cuenta puede administrar varios edificios, con un nivel distinto en cada uno. Al entrar, elige el edificio.

### Alta de edificios e inactividad

**RN-26 Autoregistro.** Cualquier persona con correo verificado puede registrar un edificio y queda como su titular. El asistente pide nombre, dirección, código de acceso (único, en minúsculas), cantidad de departamentos y mes de inicio. No pide áreas ni método de cálculo: quien registra el edificio no siempre tiene esos datos; se completan después en la configuración de la cobranza (RN-02, RN-03). Límite: 3 edificios sin plan pagado por persona. Un administrador externo agrega más edificios a su organización desde "Mis edificios".

**RN-27 Importación de departamentos.** Desde Excel o pegando la tabla: número, piso, propietario, inquilino, correo y teléfono; y, si ya se tienen, área m² y número de serie del medidor de agua (opcionales). Si la primera fila tiene encabezados, las columnas se reconocen por su nombre; si no, se leen en ese orden. La carga es todo o nada: si una fila tiene un error, no se guarda ninguna y el mensaje indica la fila y el problema. Máximo 500 filas. Las invitaciones a los vecinos se envían después, en bloque o por departamento.

**RN-28 Movimiento.** Cuenta como movimiento cualquier alta, cambio o baja hecha por una persona en periodos, gastos, cargos, pagos, departamentos, personas, mensajes, zonas o reservas. No cuentan los inicios de sesión ni los procesos automáticos (corte diario, expiración de reservas).

**RN-29 Depuración por inactividad.** Un edificio sin plan pagado que pasa 90 días sin movimiento se elimina por completo: datos, archivos y las cuentas de usuario que no pertenezcan a otro edificio.
- Aviso al titular por correo y dentro de la app en el día 60 y en el día 83, con el enlace para exportar sus datos.
- Cualquier movimiento reinicia el contador y cancela los avisos.
- Los edificios con plan pagado nunca se depuran automáticamente.
- Solo queda un rastro técnico sin datos personales (identificador, código, fechas y días inactivo) para responder consultas de soporte.

### Módulo Áreas comunes

**RN-30 Configuración (titular).** Por cada zona: nombre, descripción, aforo y reglamento; días y horario de atención; duración del turno; anticipación mínima y máxima; máximo de reservas por departamento al mes; si requiere aprobación; tarifa de uso; garantía reembolsable; si pueden reservar departamentos con deuda vencida (por defecto no); y plazo para pagar (por defecto 48 horas). Los bloqueos por mantenimiento o eventos los registra el titular o un coadministrador.

**RN-31 Reserva del vecino.** El vecino ve las zonas y, por día, los turnos libres u ocupados (sin saber quién reservó). Elige un turno, acepta el reglamento y envía la solicitud. El sistema valida horario, anticipación, límite mensual, deuda vencida y bloqueos. Dos vecinos no pueden reservar el mismo turno ni siquiera al mismo tiempo.

**RN-32 Estados.** solicitada → pendiente de pago → confirmada → usada; o cancelada, rechazada o expirada.
- Sin aprobación y sin costo: se confirma al instante.
- Con aprobación: queda "solicitada" hasta que la administración la apruebe o la rechace con motivo.
- Con costo: se emiten los cargos de tarifa y garantía en la cuenta del vecino, que los paga con el flujo normal (comprobante y validación, RN-22). Cuando todos los cargos están pagados, la reserva se confirma sola.

**RN-33 Expiración.** Si los cargos no se pagan en el plazo, la reserva expira, los cargos se anulan y el turno se libera. Si hay un pago en revisión, no expira hasta que se valide o se rechace.

**RN-34 Cancelación.** El vecino puede cancelar antes del inicio; la administración, siempre. Los cargos no pagados se anulan. La garantía pagada queda "por devolver". La tarifa pagada no se devuelve en v1; si la administración decide devolverla, lo registra como gasto.

**RN-35 Cierre y garantía.** Después del uso, la administración cierra la reserva: devuelve la garantía o retiene todo o parte por daños, con una descripción obligatoria. Nadie gestiona reservas de su propio departamento.

**RN-36 Tratamiento contable.** La tarifa es ingreso del edificio. La garantía no es ingreso: es dinero del vecino en custodia y se muestra aparte en el estado de cuenta ("Garantías en custodia"). Solo la parte retenida por daños pasa a ingreso, en el mes en que se retiene.

**RN-37 Disponibilidad del módulo.** El módulo funciona durante la prueba de 14 días o con el plan activo. Al vencer la prueba sin plan, no se aceptan reservas nuevas; las ya confirmadas se respetan y la administración puede seguir cerrándolas.

## 7. Pantallas y criterios de aceptación

### Registro y edificios

**Página de bienvenida (landing).** Es la página principal (`/`) y es pública.
- Explica en pocas frases qué es EDIFIKA y sus beneficios: cuotas calculadas solas, cobranza con comprobantes y transparencia para los vecinos.
- Ofrece dos caminos claros: **"Registrar mi edificio"** (lleva a Crear cuenta y al asistente) e **"Ingresar"** (lleva al login).
- Si el visitante ya tiene sesión, pasa directo a su edificio (selector de RN-25).
- La tarjeta de login mantiene el enlace "¿Administras un edificio? Crear cuenta y registrar mi edificio".
- Planes, precios y términos no van aquí en v1; llegan con el dashboard comercial (Etapa 6).

**Crear cuenta.** Nombre, correo y contraseña; verificación del correo antes de continuar.

**Asistente "Registrar edificio".** Dos pasos:
1. Datos del edificio (sin áreas ni método de cálculo).
2. Departamentos: importar desde Excel, pegar la tabla o agregar a mano, con vista previa y errores por fila antes de guardar. Se puede omitir y cargarlos después.

Al terminar, lleva a Inicio con el onboarding: el siguiente paso pendiente es "Configurar la cobranza".

**Mis edificios.** Lista de edificios de la cuenta con su nivel, morosidad, pagos por validar y días sin movimiento. Incluye el botón "Registrar otro edificio". Si un edificio está en aviso de inactividad, muestra cuántos días faltan para su eliminación.

**Aviso de inactividad.** Banner visible para el equipo de administración desde el día 60, con los días restantes y un enlace para exportar los datos.

### Administrador

Las pantallas y botones se muestran según el nivel (matriz de la sección 2). Un coadministrador ve las acciones del titular deshabilitadas, con una nota breve de quién puede hacerlas.

**Inicio (dashboard de módulos).** Tarjetas de los 6 módulos: activos a color con una métrica en vivo; bloqueados en gris con "Prueba gratis" o "Upgrade". Al tocar uno bloqueado se abre la ficha del módulo con precio y botón de prueba. Muestra el avance del onboarding y las cifras del mes.

**Configuración del edificio.** Pasos: datos del edificio, departamentos, configuración de la cobranza y datos de pago.
- Datos: nombre, dirección, administrador y cantidad de departamentos.
- *Configuración de la cobranza:* área de cada departamento (se puede cargar desde Excel) y áreas comunes; base de la cuota (monto fijo por área, monto fijo igual para todos o gastos reales) y tratamiento del agua (por consumo o incluida), con el monto fijo y el día de lectura cuando corresponda, y vista previa del reparto.
- Datos de pago: día de corte, mora, cuenta bancaria y Yape/Plin.
- Indicadores de departamentos registrados, m² asignados y medidores registrados.

**Departamentos y ocupantes.** Tabla con número, propietario, inquilino, área (editable en la celda), alícuota recalculada al instante y número de medidor.
- Registrar o cambiar el medidor de un departamento (número de serie, lectura inicial y fecha), con historial de medidores.
- Agregar y editar departamento.
- Cambio de ocupante con invitación por correo.
- Activar o desactivar el acceso y restablecer la clave.
- Historial de ocupantes dados de baja.

**Equipo de administración** (en Configuración, solo titular).
- Lista del titular, los coadministradores y el saliente en transición, con fecha de fin.
- Invitar coadministrador: vecino existente o externo por correo. Máximo 2.
- Quitar coadministrador.
- Designar o quitar al vecino validador, con aviso si el titular vive en el edificio y no hay coadministrador ni validador.
- Transferir la titularidad: elegir al nuevo titular y qué pasa con el saliente (lectura por 15 días o coadministrador), con confirmación explícita.

**Áreas comunes (administración).**
- *Reservas:* por atender (aprobar o rechazar), próximas, por cerrar (devolver o retener garantía) y garantías por devolver.
- *Zonas:* crear y editar zonas con todas las reglas de RN-30, y bloquear fechas.
- *Garantías en custodia:* total y detalle por reserva.

**Cálculo y recibos.**
- *Lecturas de agua:* en el día de lectura, lista de medidores con la lectura anterior; la administración escribe la lectura actual y el sistema calcula los m³ de cada departamento (RN-38).
- *Cálculo mensual:* elige el periodo base, registra el recibo de agua (monto y consumo general) y muestra una tabla por departamento con área, área asignada, alícuota, cuota fija, m³, % de prorrateo, cuota de agua y cuota del mes, más totales (como la planilla de referencia del Product Owner).
- *Recibos:* lista por departamento con total y estado de envío. "Generar y enviar recibo" abre la vista previa formal con Descargar PDF, Compartir, WhatsApp (enlace) y Enviar por correo. También hay "Generar y enviar todos".

**Ciclo mensual.** Pasos del mes con estado y botón "Abrir {mes siguiente}", que pide los montos recurrentes.

**Cobranza.** Pestañas "Por validar" (comprobante, validar, rechazar; los pagos que el usuario no puede validar por RN-22 se muestran con el motivo), "Cuentas por cobrar" (por departamento) y "Compromisos emitidos". Botón "Nuevo compromiso extraordinario".

**Gastos.** Lista por periodo (recurrentes y extraordinarios), alta, eliminación mientras no esté confirmado y botón "Confirmar gastos".

**Estado de cuenta.** Documento del periodo con sello "Oficial" o "Borrador", exportable a PDF.

**Resumen.** Fachada del edificio con cada departamento coloreado por estado de pago; al tocarlo se abre su cuenta corriente.

### Habitante

**Mis cuentas.** Total por pagar, vencido, lista de compromisos con "Pagar y subir comprobante", motivo de rechazo si lo hubo, historial de pagos, cuenta corriente, recibo del mes y adelantos.

**Estado de cuenta, Reportes y Chat.** Iguales al prototipo.

**Mi perfil.** Datos, área, alícuota y cambio de contraseña.

**Áreas comunes (vecino).** Tarjetas de zonas con tarifa, garantía y reglas. Al elegir una: calendario del día con turnos libres u ocupados, resumen de costos, casilla de aceptación del reglamento y botón "Reservar". En "Mis reservas", el estado de cada una, el botón para pagar los cargos y el de cancelar.

**Vecino validador.** Si está designado, ve una sección "Pagos del administrador por validar" con el comprobante y los botones Validar y Rechazar.

**Vecino administrador.** Tiene un selector "Mi departamento / Administración" en el encabezado.

### Generales

- Todo se ve bien en un celular de 360 px de ancho.
- Formato de soles `S/ 1,234.56`, fechas en español ("22 set 2026") y meses con "setiembre".
- Los errores dicen qué pasó y cómo corregirlo.

## 8. Autenticación

- **Login del habitante:** código del edificio + número de departamento + contraseña. La Edge Function `login-departamento` busca el correo de la cuenta activa de ese departamento con la service role, inicia sesión y devuelve la sesión. El correo nunca se expone al cliente.
- **Login del administrador:** correo + contraseña. Un vecino administrador puede entrar de las dos formas y cambia de vista con el selector.
- **Selector de edificio:** si la cuenta pertenece a más de un edificio (RN-25), elige el edificio al entrar; la función `mis_edificios()` devuelve la lista con el nivel en cada uno.
- **Alta de habitantes:** la Edge Function `invitar-habitante` crea la cuenta en Auth, el perfil y la membresía, y envía un correo con enlace para definir la contraseña.
- **Recuperación:** por correo (Supabase Auth).
- **Sesión:** cookies seguras con `@supabase/ssr`.

## 9. Edge Functions

| Función | Qué hace |
|---|---|
| `login-departamento` | Login por código de edificio y número de departamento |
| `invitar-habitante` | Solo titular. Invita al ocupante responsable (inquilino vigente o propietario): crea la cuenta, la membresía y envía la invitación; si la persona ya tiene cuenta, solo le da acceso. También envía el correo para restablecer la contraseña. Los correos los envía Supabase Auth con SMTP de Resend (ver `docs/CONFIGURAR-CORREOS.md`) |
| `invitar-administrador` | Solo titular. Crea la cuenta del externo si no existe y llama a `agregar_coadministrador` o `transferir_titularidad` |
| `transferencia-forzada` | Solo plataforma. Recibe el acta, la guarda en `actas/` y llama a `transferencia_forzada` |
| `depurar-edificios-inactivos` | Diaria, con service role. Envía los avisos del día 60 y 83, borra los archivos de Storage del edificio, llama a `depurar_edificio` y elimina de Auth las cuentas que quedaron sin edificio |
| `generar-recibo` | Genera el PDF del recibo, lo guarda en `recibos/` y registra la fila en `recibos` |
| `enviar-recibo` | Envía el PDF por Resend al correo del responsable y marca `enviado_en` |

## 10. Seguridad y cumplimiento

- RLS activa en todas las tablas y buckets privados. La service role solo se usa en Edge Functions, nunca en el navegador.
- Ley N.° 29733 de Protección de Datos Personales:
  - Política de privacidad y consentimiento al activar la cuenta.
  - Inscripción del banco de datos ante la ANPD.
  - Acceso limitado por rol.
- Copias de seguridad diarias (plan Pro de Supabase antes de tener clientes pagando).
- Auditoría de acciones sensibles (RN-18).

## 11. Requisitos no funcionales

- Diseño móvil primero, en español peruano.
- Accesibilidad: foco visible, contraste AA y etiquetas en formularios.
- Tiempo de carga menor a 2 s en 4G para las pantallas principales.
- Moneda soles; zona horaria America/Lima.

- Depuración por inactividad (RN-29): coherente con el principio de conservar datos solo mientras sean necesarios. La política de privacidad debe explicarla, incluidos los plazos y los avisos.

## 12. Decisiones pendientes de validar con el piloto

1. Cobro a mes vencido (RN-04) o por presupuesto anticipado.
2. Monto de la mora y si debe ser fija o porcentual.
3. Si los habitantes ven el desglose de deudas por departamento (RN-15).
4. Precios de los planes: Básico S/ 149, Pro S/ 249, Premium S/ 349 (valores de ejemplo).
5. Si la junta de propietarios necesita un acceso de solo lectura permanente.
6. Supuesto a confirmar: el coadministrador puede generar y enviar recibos (no modifica datos). Si no, se restringe al titular.
7. Si la tarifa de una reserva cancelada por el vecino con mucha anticipación (por ejemplo, más de 72 horas) debería devolverse.
8. Si los datos de un edificio depurado deben guardarse cifrados unos días más antes del borrado definitivo, por si el titular reclama.
9. Otros modelos de cuota: montos por tipo de unidad (RN-03).
10. Cambio de medidor a mitad de mes: en v1 el medidor nuevo empieza con su lectura inicial; falta decidir si se registra la lectura final del medidor retirado para sumar su consumo del mes.
11. **Consola de plataforma (súper administrador, equipo de EDIFIKA).** El Product Owner entregará el detalle completo al terminar los módulos actuales. Ya confirmado para v1: (a) ver un edificio en solo lectura para dar soporte, con registro en la auditoría del edificio (Ley 29733); (b) gestionar el equipo de EDIFIKA (agregar o quitar miembros de la plataforma); (c) depuración manual: ver los edificios por eliminar, posponer la eliminación o eliminar a pedido del titular. Existe hoy solo la transferencia forzada con acta (`/plataforma`).
