# NeuroRobi: Vercel + Railway

El frontend React se publica en Vercel. El backend completo se publica como un solo servicio Docker en Railway, con sus seis procesos internos y un volumen persistente para SQLite y fotos. No necesitas contratar un VPS, instalar Docker en tu PC ni comprar un dominio para empezar.

Los archivos `compose.yaml` y `Caddyfile` son una alternativa local; no se usan en este procedimiento.

## 1. Subir el proyecto a GitHub

Crea un repositorio privado en GitHub. Puedes subir la carpeta NEUROBI con GitHub Desktop mediante Add local repository → Publish repository. Debe contener las dos carpetas del proyecto, sus package-lock.json y los archivos nuevos de despliegue.

Si prefieres Git, desde PowerShell en NEUROBI:

```powershell
git status
git add .
git diff --cached --stat
git commit -m "Preparar despliegue en Vercel y Railway"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

Sustituye usuario y repositorio por los tuyos. Si `origin` ya existe, utiliza ese remoto. Revisa lo que se va a subir antes de confirmar: nunca incluyas claves, archivos `.env`, bases `.db`, fotos privadas o `node_modules`. El `.gitignore` raiz excluye esos archivos; las plantillas `.example` si se publican.

## 2. Crear el backend en Railway

1. En https://railway.com crea un proyecto y conecta el repositorio de GitHub. Puedes crear primero un proyecto vacio y agregar un servicio desde GitHub para configurar todo antes de desplegar.
2. Selecciona el servicio del backend. No necesitas seis servicios de Railway ni un PostgreSQL adicional para esta configuracion.
3. Configura estas rutas en Settings:

| Ajuste | Valor |
| --- | --- |
| Root Directory | `/backend_NeuroRobi-main/neurorobi_backend` |
| Config File Path | `/backend_NeuroRobi-main/neurorobi_backend/railway.json` |
| Builder | Dockerfile |
| Dockerfile | `Dockerfile` dentro de la raiz del servicio |
| Start Command | `npm run start:railway` |
| Healthcheck Path | `/health` |
| Replicas | `1` |

`railway.json` incluye constructor, arranque, healthcheck y reinicios. La ruta del archivo de configuracion se indica desde la raiz del repositorio, aunque hayas definido Root Directory. Si Railway intenta compilar desde NEUROBI o usa Railpack, revisa estas rutas y vuelve a desplegar.

Documentacion: [monorepos](https://docs.railway.com/deployments/monorepo) y [configuracion como codigo](https://docs.railway.com/config-as-code/reference).

## 3. Agregar almacenamiento persistente

En el proyecto Railway, agrega un Volume, conectalo al servicio backend y establece:

```text
Mount Path: /app/data
```

Dentro quedaran `/app/data/neurorobi.db` y `/app/data/uploads`. No crees el volumen en otro servicio. No uses el sistema de archivos temporal del contenedor para estos datos. Mantén una sola replica y una sola region con esta configuracion SQLite. Los reinicios cortaran temporalmente las conexiones de sensores.

Los volumenes se montan al iniciar el contenedor; por eso las migraciones estan en `start:railway`, no en Pre-deploy Command. La imagen usa un usuario sin privilegios por defecto y Railway monta el volumen como root; la variable `RAILWAY_RUN_UID=0` de abajo permite escribir en el volumen.

Fuente: [volumenes y permisos de Railway](https://docs.railway.com/volumes).

## 4. Configurar las variables del backend

En Railway → backend → Variables, configura lo siguiente. Puedes usar Raw Editor y la plantilla `backend_NeuroRobi-main/neurorobi_backend/.env.railway.example`.

```dotenv
NODE_ENV=production
PORT=8080
DATABASE_URL=file:/app/data/neurorobi.db
UPLOADS_DIR=/app/data/uploads
SEED_DEMO_DATA=false
RAILWAY_RUN_UID=0
JWT_SECRET=TU_SECRETO_ALEATORIO
INITIAL_ADMIN_EMAIL=tu-correo@ejemplo.com
INITIAL_ADMIN_PASSWORD=TU_CONTRASENA_NUEVA
```

Genera el valor real de JWT_SECRET con este comando en PowerShell y pegalo en Railway:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

La clave inicial del administrador debe tener al menos 12 caracteres. Estas variables son privadas del backend: no las pongas en Vercel ni les agregues el prefijo `VITE_`.

No configures los puertos ni las URL internas de los microservicios: comparten el mismo contenedor y usan localhost con sus valores predeterminados. El gateway publico escucha en PORT, en todas las interfaces. No lo configures en 3002–3005 o 4000, que estan ocupados por los servicios internos.

## 5. Desplegar Railway y obtener la URL

Despliega el servicio. En los logs debes ver la migracion aplicada o el mensaje de que no hay migraciones pendientes, la creacion del administrador y el arranque del gateway y los demas servicios.

En Settings → Networking → Public Networking, pulsa Generate Domain. Si pide Target Port, usa `8080`, el mismo PORT configurado arriba. Railway mostrara una direccion parecida a:

```text
https://TU-BACKEND.up.railway.app
```

Abre `https://TU-BACKEND.up.railway.app/health`. Debe responder JSON con `status: "ok"`. Este chequeo confirma el gateway; la prueba funcional del paso 8 confirma los otros servicios.

Si Railway despliega automaticamente antes de que hayas creado el volumen o las variables, completa la configuracion y haz Redeploy.

## 6. Publicar el frontend en Vercel

1. En https://vercel.com selecciona Add New → Project e importa el mismo repositorio.
2. Configura:

| Ajuste | Valor |
| --- | --- |
| Root Directory | `fronted_NeuroRobi-main/neurorobi_fronted` |
| Framework Preset | Vite |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

3. Agrega estas variables antes de desplegar, sustituyendo la URL por la real de Railway:

```dotenv
VITE_API_URL=https://TU-BACKEND.up.railway.app
VITE_WS_URL=https://TU-BACKEND.up.railway.app
```

Ambas llevan `https://`, sin barra final ni `/api`. Socket.IO usa la URL HTTPS para establecer su conexion segura. La API y Socket.IO van directamente a Railway; no se enrutan por Vercel.

4. Aplica las variables a Production. Si quieres probar Preview, configuralas tambien alli, preferiblemente contra un backend de pruebas separado.
5. Pulsa Deploy. Vercel te entregara una URL `https://TU-FRONTEND.vercel.app`.

El archivo `vercel.json` ya configura la compilacion y la ruta de entrada de React al recargar una pagina. Cada cambio de variables VITE requiere un nuevo despliegue porque se incorporan al compilar.

Fuentes: [Vite en Vercel](https://vercel.com/docs/frameworks/frontend/vite) y [variables de entorno](https://vercel.com/docs/environment-variables).

## 7. Entrar por primera vez

Abre la URL de Vercel e inicia sesion con INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD. No se crean las cuentas de demostracion con claves fijas en produccion.

Despues de confirmar que puedes entrar, elimina **ambas** variables INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD en Railway y aplica el cambio. La cuenta permanece en SQLite. El script de arranque conserva las credenciales existentes; cambiar estas variables no restablece la contrasena de una cuenta ya creada.

## 8. Comprobar que todo funciona

Con datos ficticios:

1. Inicia sesion desde Vercel.
2. Crea un paciente y sube una foto. Recarga y comprueba ambos.
3. Inicia y guarda una sesion clinica.
4. Verifica en las herramientas del navegador que Socket.IO se conecta al dominio Railway y no a localhost o Vercel.
5. Reinicia o redespliega Railway y comprueba que siguen existiendo usuario, paciente, sesion y foto.

Para el ESP32, el endpoint actual de envio es `POST https://TU-BACKEND.up.railway.app/api/telemetry`. Cambia la direccion local del firmware por esa URL y configura validacion TLS con un certificado CA adecuado. No hace falta exponer 3005. El codigo del firmware no esta incluido en este proyecto, asi que esta parte debe verificarse en el dispositivo real.

## 9. Actualizaciones, copias y costes

Una vez conectados a GitHub, los despliegues pueden actualizarse con cada push a la rama configurada. Los cambios del esquema necesitan nuevas migraciones Prisma versionadas antes de subirlos. No uses `prisma db push` sobre la base publicada.

En Railway, configura las copias de seguridad del volumen y verifica una restauracion antes de depender de ellas. Conserva tambien las variables privadas en un gestor de secretos. Eliminar el volumen elimina la base y las fotos. Esta guia crea una base nueva; importar una base previa exige revisar el esquema y su historial de migraciones.

Revisa precios, limites, elegibilidad del plan y consumo en cada plataforma antes de activar un plan. No se presupone alojamiento gratuito ni se ha medido la carga maxima de este proyecto.

## Problemas habituales

| Problema | Revisa |
| --- | --- |
| Railway no compila | Root Directory, Config File Path y uso del Dockerfile |
| Permission denied o unable to open database | Volumen en `/app/data`, DATABASE_URL y `RAILWAY_RUN_UID=0` |
| Healthcheck falla | `PORT=8080`, Target Port 8080 y logs de migraciones/arranque |
| Login no funciona | Variables VITE con la URL real, nuevo deploy en Vercel y creacion del admin en logs |
| Peticiones van a localhost | Variables de Vercel ausentes o despliegue anterior |
| Fotos desaparecen | UPLOADS_DIR debe ser `/app/data/uploads`, dentro del volumen |
| Sensores no conectan | URL Railway, HTTPS/TLS del dispositivo y conexion Socket.IO directa a Railway |
| Cambio de variables no aparece | Aplica cambios y redespliega la plataforma correspondiente |

## Limites antes de usar datos reales

El codigo actual no verifica JWT ni permisos en varias rutas de pacientes, sesiones, perfiles y telemetria; el registro permite solicitar el rol ADMIN. CORS permite origenes externos y no constituye autenticacion. El despliegue publico sirve para pruebas con datos ficticios; antes de usar informacion real deben implementarse y verificarse esos controles de acceso, incluido Socket.IO y dispositivos.

Validado localmente: compilacion de frontend y backend, arranque con PORT=8080, migracion inicial y segunda ejecucion sin cambios, creacion del administrador, login desde otro origen, gateway, listado de pacientes, handshake Socket.IO y conexion WebSocket a traves del gateway. Los archivos JSON de despliegue tienen sintaxis valida. No se ha ejecutado el contenedor Docker en esta maquina.

La publicacion en tus cuentas, los dominios asignados, la persistencia real del volumen y los sensores fisicos deben comprobarse en las plataformas.
