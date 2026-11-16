# NeuroRobi - Plataforma Terapéutica IoT (Oso NeuroRobi)

El sistema ha sido completamente adaptado para trabajar **únicamente con el Oso Terapéutico NeuroRobi**, con sensores de flexión, finales de carrera y MPU6050.

---

## 🚀 Cómo Iniciar el Proyecto

### Opción 1: Un solo clic (Recomendado)
Haz doble clic en:
- `iniciar-todo.bat`

Esto abrirá los microservicios del Backend y la interfaz de Frontend, abriendo tu navegador en `http://localhost:5173`.

### Opción 2: Desde terminal (npm)
- **Backend:** `npm run dev:backend`
- **Frontend:** `npm run dev:frontend`

---

## 🔐 Credenciales de Acceso Clínico

- **Usuario:** `melissa`
- **Contraseña:** `melissa12345`
- **Rol:** `ADMIN`

---

## 🐻 Hardware del Oso NeuroRobi (ESP32 38 Pines)

El firmware oficial adaptado está guardado en:
📁 `esp32_firmware/NeuroRobi_Oso/NeuroRobi_Oso.ino`

### Mapeo de Pines y Sensores
| Sensor | Pin ESP32 | Función / Métricas |
| --- | --- | --- |
| **Flex Apretón** | `GPIO 32` (ADC) | Apretón afectivo (ON cuando ADC > 600, OFF cuando < 600) |
| **Flex Brazo Derecho** | `GPIO 33` (ADC) | Flexión articular (ADC 700 a 1300 → Escala Nivel 1 a 10) |
| **Final de Carrera Izq** | `GPIO 18` (PULLUP) | Brazo izquierdo presionado / libre |
| **Final de Carrera Der** | `GPIO 19` (PULLUP) | Brazo derecho presionado / libre |
| **I2C SDA** | `GPIO 16` | Pantalla OLED SSD1306 (0x3C) y Sensor MPU6050 (0x68) |
| **I2C SCL** | `GPIO 4` | Pantalla OLED SSD1306 (0x3C) y Sensor MPU6050 (0x68) |

---

## 📡 Modos de Conexión del Oso con la Plataforma Web

### Modo 1: Conexión Directa al Hotspot del Oso (Sin Internet)
1. El ESP32 crea su propio Punto de Acceso WiFi:
   - **SSID:** `NeuroRobi_ESP32`
   - **Contraseña:** `NeuroRobi2026`
2. Conecta tu PC, laptop o tablet a esa red Wi-Fi.
3. En la pantalla de **Telemetría en Vivo**, pulsa el botón **"Modo AP"** (IP predeterminada: `192.168.4.1`).
4. ¡Los datos del oso se verán en tiempo real inmediatamente!

### Modo 2: Vía Red Wi-Fi Local (HTTP POST)
1. El ESP32 y la PC están en la misma red Wi-Fi de la clínica o consultorio.
2. El ESP32 envía sus datos por HTTP POST a:
   `POST http://<IP_DE_TU_PC>:3001/api/telemetry`
3. Encabezado requerido:
   `x-device-key: esp32-telemetry-key-neurorobi-cuenca-2026`

---

## 📊 Dashboards Adaptados

- **Psicología Clínica:** Afecto y co-regulación emocional mediante el **Apretón Afectivo (GPIO 32)**, detección de abrazo y nivel de confort.
- **Fisioterapia:** Amplitud y tono articular con el **Nivel de Flexión (GPIO 33)** y coordinación bilateral con los **Finales de Carrera (GPIO 18 y 19)**.
- **Educación Especial / Neurología:** Estabilidad psicomotora, detección de agitación motora y tics estereotipados mediante el **MPU6050** (Intensidad de movimiento 0-100%).
- **Reportes Clínicos:** Impresión y exportación de expediente PDF enfocado exclusivamente en las métricas del Oso NeuroRobi.
