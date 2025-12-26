# Aula Virtual CPG (MVP)

Aula virtual visualmente atractiva (estilo catálogo “Netflix”) para el Colegio de Psicólogos de Guatemala:
- Sección **Recién añadidos** y filas por **categoría**
- Cada video enlaza a **YouTube** (embed) con descripción breve
- **Evaluación** (10 preguntas, 3 opciones, autocorrección)
- Aprobación >= **80%** habilita **descarga de certificado** (PDF)
- **Administración**: categorías, videos/cursos, evaluación y preguntas, actualización de duración vía YouTube API
- **Supabase** como backend (Auth + Postgres con RLS)
- Listo para deploy en **Vercel** con GitHub

## Seguridad (importante)
- Este repositorio **NO** incluye contraseñas hardcodeadas.
- El acceso de administrador se controla por rol `profiles.role = 'admin'` en Supabase.
- Crea el usuario admin en **Supabase Auth** (con el correo que ya definiste) y luego actualiza su rol a `admin` desde SQL.

## Requisitos
- Node 20 LTS (Vercel lo soporta).
- Supabase Project (Auth + Database).
- (Opcional pero recomendado) YouTube Data API v3 para obtener duración real del video.

## 1) Configurar Supabase
1. Crear proyecto en Supabase.
2. Ir a **SQL Editor** y ejecutar: `supabase/schema.sql`.
3. Crear el usuario administrador:
   - Supabase > Authentication > Users > **Add user**
   - Ingresa el correo del admin y la contraseña que ya tienes definida (no se versiona).
4. Asignar rol admin (SQL Editor):
   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'TU_CORREO_ADMIN');
   ```

## 2) Variables de entorno (Vercel)
En Vercel > Project Settings > Environment Variables:

- `NEXT_PUBLIC_SUPABASE_URL` = URL del proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable key (o anon key en modo legacy)

Opcional (para duración automática desde YouTube):
- `YOUTUBE_API_KEY` = API key de YouTube Data API v3

Opcional (para un certificado más “oficial” con assets):
- `NEXT_PUBLIC_CERT_LOGO_URL` = URL pública del logo CPG (PNG)
- `NEXT_PUBLIC_CERT_SIGNATURE1_URL` = URL pública de firma (PNG transparente)
- `NEXT_PUBLIC_CERT_SIGNATURE2_URL` = URL pública de sello/firma secundaria (PNG transparente)
- `NEXT_PUBLIC_SITE_URL` = URL pública de tu app en producción (ej. https://tudominio.com).

> Tip: puedes subir logo/firmas a Supabase Storage (bucket público “assets”) y usar sus URLs públicas.

## 3) Deploy en Vercel vía GitHub
1. Subir este repo a GitHub.
2. En Vercel: **New Project** -> Import GitHub repo.
3. Build settings:
   - Framework: Next.js
   - Build command: `next build`
4. Agregar variables de entorno (paso 2).
5. Deploy.

## 4) Uso rápido
1. Entra con el usuario admin -> `/admin`.
2. Crea categorías.
3. Crea cursos/videos (pega URL de YouTube y URL de portada).
4. En “Evaluaciones”:
   - Selecciona curso -> “Crear evaluación” -> “Cargar plantilla 10 preguntas” -> edita -> “Guardar preguntas”
   - “Habilitar” para que esté disponible.
   - “Actualizar duración (YouTube API)” para que el certificado refleje el tiempo real.

## Notas de alcance (MVP)
- El sistema no valida que el usuario haya visto el 100% del video (se puede agregar tracking avanzado).
- Para operación institucional, se recomienda:
  - Deshabilitar signups públicos (crear cuentas solo para agremiados).
  - Añadir verificación de colegiado contra un padrón interno.
  - Emitir certificados con folio correlativo y registro histórico en tabla dedicada.

## V2: Folio correlativo + registro histórico + autoridades
Esta versión agrega:
- Tabla `certificate_settings` (configuración editable desde /admin → Certificados)
- Tabla `certificates` (registro histórico por evaluación aprobada)
- Folio correlativo automático: `CPG-AV-YYYY-000001`
- Verificación pública por código y descarga pública de PDF (solo con el código)
- “Snapshot” de la configuración del certificado por emisión (histórico)

### Acción requerida en Supabase
Ejecuta nuevamente `supabase/schema.sql` (incluye la sección V2).

Luego, en `/admin → Certificados`, actualiza:
- Logo URL (PNG)
- Marca de agua (opcional)
- Firmas (PNG)
- Nombres y cargos de autoridades

### Verificación pública
- Página: `/certificates/<codigo>`
- Descarga de PDF: `/api/public/certificates/<codigo>`
