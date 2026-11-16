# Peluche ESP32

Abre NeuroRobi_Oso/NeuroRobi_Oso.ino en Arduino IDE. Instala Adafruit GFX Library y Adafruit SSD1306, y selecciona ESP32 Dev Module.

Completa WIFI_STA_SSID, WIFI_STA_PASS (red 2.4 GHz con Internet) y DEVICE_KEY con TELEMETRY_API_KEY de Railway. No publiques credenciales.

El firmware envia por HTTPS a Railway con conexion reutilizable. Prepara una lectura cada 100 ms; la velocidad efectiva depende de la red. La tarea de red usa solo la lectura mas reciente y no bloquea sensores ni OLED. No hay HTML, servidor web ni hotspot local. El backend almacena cada lectura recibida.

Pines: flex 32/33, switches 18/19 a GND con INPUT_PULLUP, I2C SDA16/SCL4. Monitor serie 115200. SRV=OK(200) indica lectura aceptada; HTTP 401 indica clave incorrecta.

La interfaz espera mientras el peluche esta desconectado. El dominio antiguo l9b7ucvwf esta bloqueado para HTTP y Socket.IO. Abre la version actual desde Vercel.

Pendiente compilar y validar en ESP32 fisico. HTTPS usa setInsecure, que no valida el certificado del servidor.
