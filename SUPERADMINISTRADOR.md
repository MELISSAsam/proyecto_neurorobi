# Administracion de NeuroRobi

El modulo utiliza React/Vite, Express, Socket.IO y Prisma/SQLite existentes. No requiere otro proveedor ni otra base. Las rutas administrativas viven en el servicio de autenticacion, bajo `/api/admin`; el Gateway las publica y cada servicio valida de nuevo la identidad.

## Activacion y datos existentes

1. Crea una copia del volumen persistente de Railway antes de aplicar la migracion.
2. La cuenta principal configurada en `SINGLE_USER_USERNAME` pasa a Superadministrador al primer arranque del modulo; se conserva su contrasena. Para elegir otra cuenta, configura `SUPERADMIN_EMAIL` con su identificador exacto.
3. Si la cuenta aun no existe, configura tambien `SUPERADMIN_PASSWORD` con al menos 12 caracteres. Las nuevas cuentas requieren correo valido.
4. Si mantienes `SINGLE_USER_USERNAME`, el modo de acceso unico sigue vigente mientras `MULTI_USER_ENABLED` no sea `true`. Para admitir otras cuentas, revisa los usuarios antiguos, desactiva los que no deben acceder y activa Permitir acceso a multiples usuarios desde Configuracion general. Alternativamente, configura `MULTI_USER_ENABLED=true` antes de la primera activacion desde el panel. La preferencia guardada en el panel tiene prioridad sobre esa variable. No se habilita el acceso multiple de forma silenciosa.
5. Compila y arranca mediante `npm run start:railway`. El arranque aplica migraciones, prepara la cuenta y registra el oso existente. Para preparar un entorno local configurado utiliza `npm run admin:prepare`, seguido del comando de desarrollo habitual.
6. Publica el frontend en Vercel y vuelve a iniciar sesion. La promocion inicial invalida los tokens anteriores. Elimina `SUPERADMIN_PASSWORD` una vez creada la cuenta.

La migracion crea la institucion `neurorobi-default` y asocia a ella usuarios y pacientes existentes. Conserva sesiones, lecturas, notas, fotos y hashes de contrasenas. Los roles `ADMIN` pasan a nivel Administrador; los roles profesionales pasan a Terapeuta y conservan su especialidad. Se recuperan las asignaciones terapeuta-paciente respaldadas por sesiones historicas; los administradores completan las restantes desde Gestion de usuarios.

El alta inicial de Superadministrador se ejecuta una sola vez y queda registrada. Los reinicios no revierten los cambios de roles ni de contrasena posteriores. No se crean usuarios ni contrasenas de demostracion.

## Permisos

- Superadministrador: usuarios, instituciones, dispositivos, estadisticas agregadas, auditoria y configuracion. No tiene acceso clinico automatico.
- Administrador: usuarios terapeutas, pacientes, asignaciones y sesiones de su institucion. Consulta los dispositivos de esa institucion.
- Terapeuta: pacientes asignados, sus sesiones autorizadas y osos de su institucion. Al crear un paciente queda asignado automaticamente.

La especialidad (Psicologia Clinica, Fisioterapia o Educacion Especial) es independiente del nivel de acceso. Cambiar el panel visual no cambia permisos.

El permiso `clinicalRead` del Superadministrador debe concederse explicitamente y se limita a su institucion. Las consultas clinicas quedan auditadas. Los paneles agregados no incluyen nombres, diagnosticos ni notas de pacientes. El formulario de usuarios permite cambiar la institucion; primero deben retirarse sus asignaciones. Los registros historicos permanecen en la institucion de sus pacientes.

Las peticiones HTTP vuelven a comprobar el estado de la cuenta y la version de sesion en la base. Los cambios de rol, institucion, estado o contrasena invalidan tokens anteriores. Socket.IO revalida el acceso en cada suscripcion y periodicamente; la ingestion comprueba tambien los permisos del propietario de la terapia antes de transmitir una lectura.

Las fotos se sirven mediante `/api/media/:filename` con autenticacion y permisos. Las antiguas rutas publicas `/uploads` dejan de exponer archivos. Las exportaciones PDF se generan a partir de datos obtenidos por rutas clinicas protegidas.

## Usuarios y contrasenas

Los nuevos usuarios reciben una contrasena temporal de 12 a 128 caracteres elegida en el formulario. Debe entregarse por un canal privado; no se simula ningun correo. Vence a las 24 horas y obliga a cambiarla antes de acceder a los datos. El cambio exige la contrasena actual y revoca las sesiones anteriores. Todas las contrasenas se almacenan con bcrypt.

No se puede desactivar ni degradar al ultimo Superadministrador activo, ni desactivar su institucion si no existe otro Superadministrador en una institucion activa. Las listas administrativas tienen paginacion de 25 filas. La matriz de asignaciones permite buscar y paginar pacientes y terapeutas por separado, en grupos de 25.

## Osos y telemetria

`LEGACY_DEVICE_ID` identifica el oso existente; por defecto es `oso-principal`. Su credencial inicial se toma de `TELEMETRY_API_KEY`, que debe coincidir con la del firmware. El backend conserva solo SHA-256 de la clave. Reiniciar no sobrescribe una clave renovada desde el panel.

El firmware antiguo sigue funcionando: el servidor identifica el oso por su clave. La version actual del firmware tambien envia `x-device-id`. Para un oso nuevo, registra su identificador e institucion en Dispositivos NeuroRobi, copia la clave que se muestra una sola vez y configura `DEVICE_ID` y `DEVICE_KEY` antes de cargarlo al ESP32.

Cada oso tiene reserva de terapia independiente y persistida en SQLite. El inicio verifica paciente, institucion y disponibilidad; las renovaciones conservan la propiedad por usuario y controlador. La reserva vence al perder comunicacion. Se impide modificar un dispositivo mientras tenga una terapia vigente. El estado de conexion depende de la ultima comunicacion; no se confunde con estar habilitado o estar en terapia.

En espera solo se actualiza la presencia del oso. No se guardan mediciones terapeuticas hasta Empezar terapia. Cada lectura y sesion nueva conserva el identificador del oso. Los canales Socket.IO separan paciente y dispositivo.

## Metricas

- Pulsaciones: activaciones de los brazos, GPIO 18 y 19; no son latidos.
- Apretones: activaciones del estomago, GPIO 32; se cuentan como eventos, no como porcentaje de presion.
- Sacudidas fuertes: eventos del MPU6050 con intensidad relativa de al menos 6/10, conservando el umbral existente.

Mantener un sensor presionado cuenta una sola vez. Se conservan el tratamiento de datos ausentes, cortes de mas de dos segundos y eventos incompletos. Los conteos historicos se reconstruyen desde las lecturas al preparar el modulo, sin modificar las lecturas originales. No se infieren fuerza calibrada, emociones ni diagnosticos. Las dos implementaciones del analisis se comprueban mediante una prueba de igualdad.

Las estadisticas permiten filtrar por institucion y fechas en America/Guayaquil. Las sesiones recientes muestran dispositivo, duracion, conteos y cantidad de lecturas registradas. Los reportes clinicos conservan sus graficas, cortes observados y PDF.

## Verificacion

Backend:

```
npm run build
npm run test:admin
npm run test:deploy
```

Frontend:

```
npm run build
npm run test:interactions
npm run test:ui
```

Las pruebas del backend usan bases temporales y puertos separados. Cubren migracion de historicos, bootstrap idempotente, dos instituciones, cuentas temporales, permisos, asignaciones, separacion de dos osos, exclusividad de terapia, revocacion, auditoria y fotos privadas. Las pruebas de navegador usan fixtures sinteticos interceptados, revisan las ocho secciones, los reportes PDF, la terapia y el ancho movil. Requieren Chrome o `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. No se ha compilado ni cargado el firmware en una placa fisica desde este entorno.
