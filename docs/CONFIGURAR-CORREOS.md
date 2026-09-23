# Configurar los correos de Building Buddy

Los correos de verificación, invitación y recuperación de contraseña los envía **Supabase Auth**. Sin configuración, Supabase usa un servidor de prueba que solo entrega a los miembros de tu equipo en Supabase y unos pocos correos por hora. Para que lleguen a los vecinos hay que hacer dos cosas, una sola vez.

## 1. Conectar Resend como servidor de correo (SMTP)

1. En **resend.com → API Keys → Create API Key** crea una clave con permiso *Sending access*. Cópiala.
2. En **Supabase → Authentication → Emails → SMTP Settings** (o *Project Settings → Authentication → SMTP*), activa **Enable custom SMTP** y completa:

| Campo | Valor |
|---|---|
| Sender email | `no-responder@tudominio.pe` (mientras no verifiques tu dominio en Resend: `onboarding@resend.dev`) |
| Sender name | `Building Buddy` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | la clave de Resend |

3. Guarda. Mientras no verifiques un dominio propio en Resend, **solo se entregan correos a tu propia dirección** (la de tu cuenta de Resend). Para escribir a los vecinos, verifica tu dominio en **Resend → Domains** (Etapa 6).

## 2. Cambiar las plantillas de los correos

La aplicación valida los enlaces en el servidor (`/auth/callback`), así que los enlaces deben llevar el `token_hash`. En **Supabase → Authentication → Emails → Templates**, reemplaza el enlace de cada plantilla:

**Confirm signup** (verificación al crear cuenta)
```html
<h2>Confirma tu correo</h2>
<p>Hola, confirma tu correo para registrar tu edificio en Building Buddy:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/edificios/nuevo">Confirmar mi correo</a></p>
```

**Invite user** (invitación a un vecino)
```html
<h2>Te invitaron a Building Buddy</h2>
<p>La administración de tu edificio te dio acceso a Building Buddy, donde verás tus cuotas y podrás pagar.</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/nueva-clave">Crear mi contraseña</a></p>
<p>Luego ingresa con el código de tu edificio, tu número de departamento y tu contraseña.</p>
```

**Reset password** (recuperar contraseña)
```html
<h2>Crea una contraseña nueva</h2>
<p>Recibimos un pedido para cambiar tu contraseña de Building Buddy:</p>
<p><a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/nueva-clave">Crear contraseña nueva</a></p>
<p>Si no lo pediste, ignora este correo.</p>
```

## 3. URL del sitio

En **Authentication → URL Configuration**:
- **Site URL:** `http://localhost:3000` mientras pruebas; en producción, tu dominio.
- **Redirect URLs:** `http://localhost:3000/auth/callback` (y luego `https://tudominio.pe/auth/callback`).
