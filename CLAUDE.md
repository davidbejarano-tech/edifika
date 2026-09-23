# CLAUDE.md · Building Buddy

Este archivo lo lee Claude Code al iniciar cada sesión. Define el proyecto, el stack y las reglas de trabajo.

## Proyecto

Building Buddy es un SaaS de administración de edificios para Perú: cálculo de cuotas por alícuota o mixto con agua, cobranza con comprobantes, estado de cuenta y recibos. Roles: administrador titular (nivel 1), coadministrador (nivel 2, solo datos operativos), administrador saliente en lectura, vecino validador y habitante. Ver SPEC sección 2 y RN-19 a RN-25.

Documentos de referencia (léelos antes de cada etapa):
- `docs/SPEC.md`: especificación y reglas de negocio (RN-01 a RN-18). Es la fuente de verdad.
- `docs/prototipo.html`: prototipo navegable. Es la referencia de pantallas, textos y flujo. Ábrelo en el navegador.
- `docs/ETAPAS.md`: plan de construcción por etapas.
- `supabase/migrations/`: 0001 núcleo, 0002 autoregistro y depuración, 0003 Áreas comunes. Esquema, funciones de negocio y RLS ya diseñados y probados.

## Stack

- Next.js 15 (App Router) + TypeScript estricto + Tailwind CSS
- Supabase: PostgreSQL, Auth, Storage, Edge Functions (Deno) y pg_cron
- `@supabase/ssr` para la sesión en el servidor
- Resend para correo; PDF de recibos con `@react-pdf/renderer` o Edge Function
- Despliegue en Vercel; repositorio en GitHub

## Estructura

```
app/
  (auth)/login/           login de habitante (código edificio + depto) y de administrador
  (admin)/                inicio, configuracion, departamentos, calculo, cobranza, gastos, ciclo, estado-cuenta, chat
  (habitante)/            cuentas, estado-cuenta, reportes, chat, perfil
components/               UI reutilizable (Tabla, Modal, Chip, Recibo, Fachada...)
lib/supabase/             clientes de servidor y navegador, tipos generados
lib/format.ts             soles, fechas y meses en español
supabase/migrations/      migraciones SQL numeradas
supabase/functions/       Edge Functions
docs/                     especificación, etapas y prototipo
```

## Reglas de trabajo

1. **El dinero se calcula en la base de datos.** Usa las funciones SQL (`calcular_cuotas`, `abrir_periodo`, `validar_pago`, `resumen_periodo`, etc.). No repliques fórmulas en TypeScript.
2. **Nunca edites una migración ya aplicada.** Para cambios crea `supabase/migrations/000N_descripcion.sql`.
3. **RLS siempre activa.** Toda tabla nueva lleva políticas. La `service_role` solo se usa dentro de Edge Functions, nunca en código que llegue al navegador ni en variables `NEXT_PUBLIC_*`.
4. **Tipos generados.** Tras cada migración: `npm run db:tipos` (genera `lib/supabase/types.ts` desde el proyecto vinculado).
5. **Formato peruano.** Soles como `S/ 1,234.56`; fechas "22 set 2026"; el mes 9 es "setiembre"; zona horaria `America/Lima`.
6. **Textos de interfaz en español**, en tono claro y directo, tomados del prototipo cuando existan. Los botones dicen la acción ("Validar pago", "Abrir octubre").
7. **Móvil primero.** Revisa cada pantalla a 360 px de ancho.
8. **Montos:** PostgreSQL devuelve `numeric` como texto; conviértelo con cuidado y formatea solo para mostrar.
9. **Errores de negocio:** las funciones SQL lanzan mensajes en español; muéstralos tal cual en un aviso.
10. **Permisos en dos capas:** la base de datos es la que protege (RLS y funciones con `es_titular`, `es_admin`, `es_lector_admin`, `puede_validar_pago`). La interfaz solo oculta o deshabilita botones para que la experiencia sea clara; nunca es la única barrera.
11. Trabaja **una etapa a la vez**. Al terminar, resume qué se hizo, cómo probarlo y qué queda pendiente, y espera la aprobación del Product Owner.

## Definición de terminado (por etapa)

- La funcionalidad cumple los criterios de `docs/SPEC.md` y se parece al prototipo.
- `npm run build` y `npm run lint` pasan sin errores.
- Probado con titular, coadministrador y habitante, y verificado que un habitante no ve datos de otro departamento ni un coadministrador ejecuta acciones del titular.
- Migraciones y Edge Functions versionadas en el repositorio.
- Instrucciones de prueba escritas para el Product Owner.

## Comandos

```bash
npm run dev                      # servidor local
npx supabase start               # Supabase local (requiere Docker)
npx supabase db reset            # aplica migraciones + seed.sql
npx supabase functions serve     # Edge Functions en local
npx supabase db push             # aplica migraciones al proyecto en la nube
```

## Variables de entorno (`.env.local`, nunca en el repositorio)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # clave publishable (sb_publishable_...)
SUPABASE_SERVICE_ROLE_KEY=       # clave secreta (sb_secret_...): solo Edge Functions y scripts locales
RESEND_API_KEY=
```
