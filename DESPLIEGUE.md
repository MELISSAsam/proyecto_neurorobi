# NeuroRobi: Vercel + Render

Frontend React en Vercel; backend y sensores en un solo Web Service de Render. El backend conserva sus seis procesos internos y SQLite. La base y las fotos se guardan en un disco persistente. El archivo `render.yaml` de la raiz configura el servicio mediante Blueprint.

## Coste del almacenamiento

Esta configuracion necesita un servicio **de pago** en Render: el plan Free no admite discos persistentes y perderia SQLite y las fotos al reiniciar o desplegar. El Blueprint propone Starter y un disco de 1 GB. Revisa el coste mostrado por Render antes de confirmar la creacion. No se ha medido la memoria bajo carga de los seis procesos; aumenta el plan si observas falta de memoria.

Fuentes: [discos persistentes](https://render.com/docs/disks), [limites de Free](https://render.com/docs/free) y [precios](https://render.com/pricing).

Si necesitas alojamiento gratuito, antes de desplegar hay que adaptar la base a un servicio externo y las fotos a almacenamiento de objetos. No basta con cambiar el plan a Free.

## 1. Crear el backend

1. Entra en https://dashboard.render.com y conecta tu cuenta de GitHub.
2. Selecciona **New → Blueprint**.
3. Conecta `MELISSAsam/proyecto_neurorobi`, rama `main`.
4. Usa el archivo `render.yaml` de la raiz del repositorio.
5. Render mostrara el servicio `neurorobi-backend`, su disco y las variables que debes completar:
   - `INITIAL_ADMIN_EMAIL`: tu correo para iniciar sesion en NeuroRobi.
   - `INITIAL_ADMIN_PASSWORD`: una contrasena nueva de al menos 12 caracteres.
6. Revisa el plan y el coste antes de confirmar. Inicia la creacion cuando estes conforme.

El Blueprint configura automaticamente:

| Ajuste | Valor |
| --- | --- |
| Runtime | Node |
| Node | 22.20.0 |
| Root Directory | `backend_NeuroRobi-main/neurorobi_backend` |
| Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start Command | `npm run start:render` |
| Health Check Path | `/health` |
| Persistent Disk | `/var/data`, 1 GB |
| DATABASE_URL | `file:/var/data/neurorobi.db` |
| UPLOADS_DIR | `/var/data/uploads` |
| JWT_SECRET | Generado automaticamente por Render |

No uses el comando `npm start`: solo arranca el gateway. `start:render` aplica migraciones, prepara el administrador y arranca los seis procesos. Si alguno termina, se detienen los demas para que Render pueda reiniciar el servicio completo.

No crees PostgreSQL adicional para esta configuracion ni seis servicios separados. El gateway utiliza el PORT que proporciona Render y escucha en `0.0.0.0`. Conserva los puertos y URL internos por defecto. No necesitas instalar Docker en tu PC.

Las migraciones corren al arrancar, cuando el disco ya esta montado. No las muevas al build ni a un comando previo que no tenga acceso al disco. Esta configuracion crea una base nueva: importar una base anterior requiere comprobar el esquema y establecer su historial de migraciones.

Referencia: [Blueprint YAML](https://render.com/docs/blueprint-spec).

## 2. Comprobar el backend

Espera a que el servicio este Live. En los logs deben aparecer las migraciones aplicadas, el administrador preparado y los servicios arrancados.

Copia la URL HTTPS que muestra Render, por ejemplo `https://TU-BACKEND.onrender.com`. No adivines el dominio: usa el asignado a tu servicio.

Abre `https://TU-BACKEND.onrender.com/health`. Debe responder JSON con `status: "ok"`. Ese endpoint comprueba el gateway; verifica los demas servicios mediante las pruebas funcionales del paso 5.

## 3. Crear el frontend en Vercel

En https://vercel.com selecciona **Add New → Project**, importa `MELISSAsam/proyecto_neurorobi` y configura:

| Ajuste | Valor |
| --- | --- |
| Root Directory | `fronted_NeuroRobi-main/neurorobi_fronted` |
| Framework | Vite |
| Node | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Antes de Deploy, agrega estas variables con la URL real del backend:

```dotenv
VITE_API_URL=https://TU-BACKEND.onrender.com
VITE_WS_URL=https://TU-BACKEND.onrender.com
```

Ambas llevan HTTPS, sin barra final ni `/api`. El navegador se conecta directamente a Render para API y Socket.IO. No uses localhost ni la URL de Vercel en estas variables. No publiques JWT_SECRET ni la clave del administrador en Vercel.

Configura Production; para Preview, preferiblemente usa un backend separado de pruebas. Cada cambio en variables VITE requiere un nuevo despliegue del frontend.

Pulsa Deploy y abre la URL asignada por Vercel.

Referencia: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite).

## 4. Entrar como administrador

Inicia sesion en la web de Vercel con el correo y clave que configuraste en Render. Las cuentas de demostracion no se crean en produccion.

Cuando compruebes el acceso, elimina ambas variables INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD en Render y aplica el cambio. La cuenta permanece en SQLite. Si utilizas Blueprint, elimina tambien sus entradas `sync: false` de `render.yaml` y sube ese cambio para que la configuracion refleje que ya no hacen falta.

El script conserva las credenciales de una cuenta ya existente; cambiar estas variables no cambia su contrasena.

## 5. Pruebas

Usa datos ficticios para comprobar:

1. Inicio de sesion.
2. Creacion de un paciente y subida de foto.
3. Creacion y guardado de una sesion clinica.
4. Conexion Socket.IO al dominio Render.
5. Persistencia del usuario, paciente, sesion y foto despues de reiniciar o redesplegar Render.

Para el ESP32, el endpoint actual es `POST https://TU-BACKEND.onrender.com/api/telemetry`. Configura la URL y la validacion TLS en el firmware. El firmware no esta incluido aqui: hay que probarlo con el dispositivo real.

## 6. Datos y actualizaciones

Con GitHub conectado, los cambios en main pueden disparar nuevos despliegues segun la configuracion de cada plataforma. Los cambios del esquema necesitan migraciones Prisma versionadas. No uses `prisma db push` sobre la base publicada.

Solo lo que esta en `/var/data` persiste en Render. No borres el disco. Guarda copias coherentes de SQLite y de las fotos fuera del servicio y prueba la restauracion. No dependas exclusivamente de las instantaneas del disco como respaldo de una base en uso. Los servicios con disco no escalan a varias instancias y los despliegues interrumpen temporalmente las conexiones.

## Diagnostico

| Problema | Revisa |
| --- | --- |
| Build falla | Root Directory, Node 22 y logs de npm/Prisma |
| No aparecen tablas | Logs de `start:render`, DATABASE_URL y montaje del disco |
| Health check falla | Logs de arranque, `/health` y variable PORT sin sobrescribir |
| Datos o fotos desaparecen | Disco en `/var/data` y rutas DATABASE_URL/UPLOADS_DIR |
| Login falla | Variables VITE, nuevo despliegue Vercel y creacion del administrador |
| Sensor no conecta | URL Render, HTTPS/TLS y Socket.IO directo al backend |

## Limites antes de usar datos reales

El codigo actual no verifica JWT ni permisos en varias rutas de pacientes, sesiones, perfiles y telemetria; el registro permite solicitar el rol ADMIN. CORS no constituye autenticacion. Usa datos ficticios hasta implementar y verificar esos controles, incluidos dispositivos y Socket.IO.

Los componentes comunes se comprobaron localmente en la preparacion anterior: compilacion, migraciones, administrador, login y WebSocket a traves del gateway. Los recursos de Render, sus permisos de disco, la persistencia real y el firmware deben comprobarse tras el despliegue. No se ha contratado ni creado un servicio de Render desde esta sesion.
