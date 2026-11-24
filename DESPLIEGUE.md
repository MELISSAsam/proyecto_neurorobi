# NeuroRobi: Vercel + Railway PostgreSQL

El backend usa PostgreSQL mediante Prisma y `@prisma/adapter-pg`. SQLite queda solo como fuente de importación de datos antiguos. El frontend React se publica en Vercel.

## Railway: base y backend

1. En el proyecto Railway crea un servicio **PostgreSQL**. La base debe permanecer privada dentro del proyecto.
2. Conecta el repositorio y configura el servicio del backend:
   - **Root Directory**: `backend_NeuroRobi-main/neurorobi_backend`
   - **Railway Config File**: `/backend_NeuroRobi-main/neurorobi_backend/railway.json`
   - `railway.json` configura `npm run db:migrate` como pre-deploy. Si Railway no aplica ese archivo a tu servicio, configura ese mismo comando en **Settings → Deploy → Pre-deploy Command**.
3. En las variables del backend establece `DATABASE_URL` como referencia al servicio PostgreSQL. Si el servicio se llama `Postgres`, usa `${{Postgres.DATABASE_URL}}`; usa el nombre exacto que aparece en tu proyecto Railway.
4. Configura las variables de `.env.railway.example`. Define `FRONTEND_URL` con el origen exacto de Vercel (sin ruta; puedes separar varios orígenes por coma), `INITIAL_ADMIN_EMAIL` y una contraseña nueva de al menos 12 caracteres para crear el primer acceso. Usa `MULTI_USER_ENABLED=true`. Genera `JWT_SECRET` y `TELEMETRY_API_KEY` por separado; no los pongas en Vercel ni en Git.
   Antes de producción, rota la contraseña PostgreSQL compartida en la conversación y renueva también JWT, clave del dispositivo y credenciales Wi-Fi si estuvieron dentro del ZIP. Cambiar `JWT_SECRET` cierra las sesiones activas.
5. Agrega un volumen al backend montado en `/app/data` para conservar las fotos de perfil (`UPLOADS_DIR=/app/data/uploads`). El volumen ya no guarda la base de datos.
6. Despliega y revisa los logs. El pre-deploy de Railway aplica las migraciones PostgreSQL; `start:railway` prepara el administrador inicial y arranca los servicios. Railway asigna `PORT`; no lo fijes. La ruta `/health` debe responder 200 cuando todos los servicios internos están disponibles.
7. En la pestaña **Backups** del servicio PostgreSQL activa copias programadas y Point-in-Time Recovery, y practica una restauración antes de guardar datos clínicos reales. Railway permite activar estas funciones desde el panel; revisa retención y costos para el proyecto. ([Backups de Railway](https://docs.railway.com/databases/postgresql), [PITR de Railway](https://docs.railway.com/volumes/point-in-time-recovery))

La migración base crea el esquema en una base PostgreSQL vacía. Si PostgreSQL ya tiene tablas creadas, detén el despliegue y revisa su estado antes de aplicar migraciones.

### Copiar los datos SQLite locales (opcional)

El script `npm run db:import-sqlite` copia cuentas, instituciones, pacientes, sesiones, lecturas, dispositivos y configuración. Conserva los hashes de contraseña. Requiere `SQLITE_DATABASE_URL` para la base local, `DATABASE_URL` para PostgreSQL y que el esquema PostgreSQL ya esté migrado y vacío.

El host `*.railway.internal` solo es accesible desde la red privada de Railway. Para importar desde Windows, hazlo **antes del primer despliegue del backend**: pausa su despliegue automático, habilita temporalmente el TCP Proxy público de PostgreSQL y, en PowerShell, ejecuta `$env:DATABASE_URL = Read-Host 'DATABASE_PUBLIC_URL temporal de Railway'`, luego `npm run db:migrate` y `npm run db:import-sqlite`; al terminar limpia la variable con `$env:DATABASE_URL = $null` y deshabilita el acceso público. Esto migra el esquema y los datos antes de que el arranque cree la cuenta inicial. No pegues la URL con contraseña en archivos, Git o Vercel. Si no necesitas conservar los datos locales, omite estos comandos y deja que el primer arranque cree la cuenta con `INITIAL_ADMIN_*`.

Tras confirmar el primer acceso, elimina `INITIAL_ADMIN_EMAIL` y `INITIAL_ADMIN_PASSWORD` de Railway; la cuenta queda guardada en PostgreSQL. Si importaste una cuenta existente, configura `SUPERADMIN_EMAIL` con su correo para asignarle permisos administrativos sin cambiar su contraseña.

## Vercel: frontend

Configura el proyecto con:

| Ajuste | Valor |
| --- | --- |
| Root Directory | `fronted_NeuroRobi-main/neurorobi_fronted` |
| Framework | Vite |
| Node | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

En Production agrega `VITE_API_URL` con el dominio HTTPS público del backend Railway, sin barra final ni `/api`. La API y Socket.IO usan el mismo host. Cada cambio requiere volver a desplegar el frontend.

## Desarrollo local

El `compose.yaml` de la raíz inicia PostgreSQL local en `localhost:5432`. El `.env.example` del backend contiene una URL local de ejemplo. Para arrancar los servicios Node desde Windows, levanta primero la base local con Docker Compose y configura `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/neurorobi?schema=public` en el `.env` ignorado del backend. La base SQLite anterior se conserva como `SQLITE_DATABASE_URL` para importarla si hace falta.

## Sensores y login

El firmware envía datos a `POST https://TU-BACKEND.up.railway.app/api/telemetry` por HTTPS, con la cabecera `x-device-key` igual a `TELEMETRY_API_KEY`. No publiques puertos internos.

El formulario identifica al usuario por correo y contraseña. Un 401 en `/api/auth/login` significa que el backend rechazó esas credenciales o el acceso de la cuenta; los errores de red y del servidor ahora se muestran aparte. En Vercel, comprueba que `VITE_API_URL` apunte al backend correcto y vuelve a desplegar tras cambiarla.

## Despliegue anterior en Render

`render.yaml` corresponde al despliegue SQLite anterior. Para esta versión PostgreSQL usa Railway. No despliegues el backend con el blueprint antiguo de Render.
