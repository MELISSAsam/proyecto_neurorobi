# NeuroRobi: Vercel + Railway

El frontend React se publica en Vercel. El backend mantiene sus seis procesos en un solo servicio Docker de Railway, con SQLite y fotos en un volumen persistente. No crees seis servicios ni una base PostgreSQL: el adaptador actual usa SQLite.

## 1. Backend en Railway

1. Sube estos cambios al repositorio y conecta el repositorio desde Railway, en un proyecto nuevo.
2. En el servicio configura **Root Directory**: `backend_NeuroRobi-main/neurorobi_backend`.
3. En Settings configura **Railway Config File**: `/backend_NeuroRobi-main/neurorobi_backend/railway.json` (ruta desde la raiz del repositorio). El archivo selecciona Dockerfile, arranque y health check.
4. Agrega un **Volume** al mismo servicio, montado en `/app/data`. Configura una sola replica. Revisa el coste de servicio y almacenamiento en Railway antes de contratarlo.
5. Agrega las variables de `.env.railway.example`, reemplazando todos los ejemplos:

| Variable | Valor |
| --- | --- |
| NODE_ENV | production |
| DATABASE_URL | file:/app/data/neurorobi.db |
| UPLOADS_DIR | /app/data/uploads |
| RAILWAY_RUN_UID | 0 |
| SEED_DEMO_DATA | false |
| JWT_SECRET | Secreto aleatorio de al menos 32 caracteres |
| TELEMETRY_API_KEY | Otro secreto aleatorio para los sensores |
| INITIAL_ADMIN_EMAIL | Tu correo de administrador |
| INITIAL_ADMIN_PASSWORD | Clave nueva de al menos 12 caracteres |

Genera cada secreto por separado con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Nunca lo subas al repositorio ni a las variables VITE.

Railway asigna `PORT`: no lo fijes ni configures URLs internas. `start:railway` aplica migraciones con el volumen montado, crea el administrador si no existe y arranca todos los procesos; si uno termina, se detienen los demas. No uses `npm start`, que solo inicia el gateway. No ejecutes migraciones durante build o pre-deploy, porque necesitan el volumen.

6. Despliega y revisa los logs. En Networking genera el dominio publico del servicio, apuntando al puerto asignado por Railway. Guarda su URL HTTPS real.
7. Comprueba `https://TU-BACKEND.up.railway.app/health`: debe responder 200 y `status: "ok"`. Devuelve 503 mientras falta algun servicio interno.

El volumen conserva base y fotos entre despliegues. Sin volumen se perderian. No adjuntes una base antigua sin revisar esquema e historial de migraciones. Configura copias de seguridad del volumen antes de guardar datos reales.

Referencias oficiales: [Dockerfiles](https://docs.railway.com/guides/dockerfiles), [volumenes](https://docs.railway.com/volumes), [variables](https://docs.railway.com/variables/reference), [configuracion en codigo](https://docs.railway.com/guides/config-as-code).

## 2. Frontend en Vercel

Importa el mismo repositorio en Vercel y configura:

| Ajuste | Valor |
| --- | --- |
| Root Directory | fronted_NeuroRobi-main/neurorobi_fronted |
| Framework | Vite |
| Node | 22.x |
| Install Command | npm ci |
| Build Command | npm run build |
| Output Directory | dist |

Agrega en Production las variables de `.env.vercel.example`, con el dominio real de Railway:

```dotenv
VITE_API_URL=https://TU-BACKEND.up.railway.app
VITE_WS_URL=https://TU-BACKEND.up.railway.app
```

Ambas usan HTTPS, sin barra final ni `/api`. Vercel compila estos valores dentro del frontend; cualquier cambio requiere un nuevo despliegue. El build en Vercel comprueba su formato. Usa un backend de pruebas separado para previews que modifiquen datos.

`vercel.json` configura la compilacion y las rutas de la aplicacion. Socket.IO se conecta directamente a Railway.

Referencia: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## 3. Acceso y sensores

Inicia sesion con INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD. Despues elimina ambas variables en Railway y redespliega: la cuenta permanece en SQLite. Si ya existe, el arranque conserva su clave. Las cuentas de demostracion no se crean en produccion.

La API requiere `Authorization: Bearer TOKEN`, salvo login y recepcion de sensores. El frontend adjunta el token automaticamente; Socket.IO tambien lo valida. Solo ADMIN puede registrar especialistas y cada usuario solo puede editar su propio perfil.

El ESP32 debe enviar sus lecturas a `POST https://TU-BACKEND.up.railway.app/api/telemetry`, usando HTTPS, JSON y la cabecera `x-device-key` con TELEMETRY_API_KEY. Actualiza el firmware con el dominio y la clave antes de probar sensores. Sin esa clave la API devuelve 401. No expongas los puertos internos como servicios publicos.

## 4. Verificacion

Antes de subir los cambios, desde cada directorio ejecuta `npm ci` y `npm run build`. En el backend ejecuta ademas `npm run test:deploy`: usa base, fotos y puertos de prueba separados, sin modificar la base de desarrollo.

Despues de publicar, con datos ficticios comprueba:

1. Health 200 e inicio de sesion desde Vercel.
2. Registro de paciente con foto y edicion de perfil.
3. Creacion y guardado de sesion e informe.
4. Conexion Socket.IO y lecturas reales de pulsera/oso con la clave del dispositivo.
5. Persistencia de cuenta, pacientes, sesiones y fotos despues de redesplegar Railway.
6. Acceso sin token rechazado en `/api/patients` y dispositivos sin clave rechazados en `/api/telemetry`.

La compilacion local y las pruebas aisladas no sustituyen esta comprobacion en los dominios finales ni la prueba con hardware.

## Alternativas existentes

`render.yaml` conserva la alternativa anterior en Render y `compose.yaml` el despliegue Docker local. Para el flujo de esta guia utiliza Vercel y Railway.
