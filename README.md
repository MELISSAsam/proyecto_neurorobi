# NeuroRobi - Plataforma Terapéutica IoT (Oso NeuroRobi)

El sistema ha sido completamente adaptado para trabajar **únicamente con el Oso Terapéutico NeuroRobi**, con sensores de flexión, finales de carrera y MPU6050.

---

## Arranque local en Windows

Usa Node.js 22. La aplicación corre con PostgreSQL y servicios locales.

1. En `backend_NeuroRobi-main/neurorobi_backend`, copia `.env.example` a `.env`. Configura `DATABASE_URL` para PostgreSQL local, un `JWT_SECRET` aleatorio, una `TELEMETRY_API_KEY` y credenciales `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` con una contraseña de al menos 12 caracteres. Para habilitar varias cuentas, usa `MULTI_USER_ENABLED=true`.
2. En la carpeta del backend, ejecuta:

   ```powershell
   docker compose up -d postgres
   npm.cmd ci
   npx.cmd prisma generate
   npm.cmd run admin:prepare
   ```

3. En `fronted_NeuroRobi-main/neurorobi_fronted`, ejecuta `npm.cmd ci`.
4. Abre `iniciar-todo.bat` desde la raíz. La interfaz estará en `http://127.0.0.1:5173` y la API en `http://localhost:3001`.

Inicia sesión con las credenciales `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD` que configuraste en el `.env` del backend. Consulta [DESPLIEGUE.md](DESPLIEGUE.md) para Railway, Vercel y la importación opcional de datos SQLite.

---

## 🐻 Hardware del Oso NeuroRobi (ESP32 38 Pines)

El firmware oficial adaptado está guardado en:
📁 `esp32_firmware/NeuroRobi_Oso/NeuroRobi_Oso.ino`

### Mapeo de Pines y Sensores
| Sensor | Pin ESP32 | Función / Métricas |
| --- | --- | --- |
| **Flex Apretón** | `GPIO 32` (ADC) | Apretón afectivo (ON cuando ADC > 600, OFF cuando < 600) |
| **Final de Carrera Izq** | `GPIO 18` (PULLUP) | Brazo izquierdo presionado / libre |
| **Final de Carrera Der** | `GPIO 19` (PULLUP) | Brazo derecho presionado / libre |
| **I2C SDA** | `GPIO 16` | Pantalla OLED SSD1306 (0x3C) y Sensor MPU6050 (0x68) |
| **I2C SCL** | `GPIO 4` | Pantalla OLED SSD1306 (0x3C) y Sensor MPU6050 (0x68) |

---

## 📡 Modos de Conexión del Oso con la Plataforma Web

El ESP32 usa la red Wi-Fi de 2.4 GHz definida en `telemetry.local.h` y envía telemetría a `http://<IP_DE_TU_PC>:3001/api/telemetry`. Conecta la PC a esa misma red.

Consulta la [guía del firmware](esp32_firmware/README.md) para configurar la IP y la clave del dispositivo, cargar el sketch y conectar el oso.

---

## 📊 Dashboards Adaptados

- **Psicología Clínica:** Afecto y co-regulación emocional mediante el **Apretón Afectivo (GPIO 32)**, detección de abrazo y nivel de confort.
- **Fisioterapia:** Coordinación bilateral con los **Finales de Carrera (GPIO 18 y 19)**.
- **Educación Especial / Neurología:** Estabilidad psicomotora, detección de agitación motora y tics estereotipados mediante el **MPU6050** (Intensidad de movimiento 0-100%).
- **Reportes Clínicos:** Impresión y exportación de expediente PDF enfocado exclusivamente en las métricas del Oso NeuroRobi.
