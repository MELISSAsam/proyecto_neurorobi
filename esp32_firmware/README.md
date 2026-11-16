# ESP32 Oso NeuroRobi

Abre NeuroRobi_Oso/NeuroRobi_Oso.ino en Arduino IDE. Selecciona ESP32 Dev Module e instala Adafruit GFX Library y Adafruit SSD1306 (con sus dependencias).

Completa WIFI_STA_SSID y WIFI_STA_PASS con una red de 2.4 GHz con Internet. Completa DEVICE_KEY con el valor TELEMETRY_API_KEY del backend Railway. No publiques el archivo con credenciales reales.

SERVER_URL apunta a https://neurorobi-backend-production.up.railway.app/api/telemetry. El dispositivo envia una lectura por segundo. El monitor serie a 115200 muestra SRV=OK(200) si el servidor acepta los datos.

Pines: flex apreton GPIO32 (ADC > 600), flex derecho GPIO33 (700 a 1300, nivel 1 a 10), switches GPIO18/19 a GND con INPUT_PULLUP, I2C SDA16/SCL4 para OLED SSD1306 y MPU6050. Alimenta y conecta los sensores segun sus especificaciones; entradas del ESP32 a 3.3V.

La red local NeuroRobi_ESP32 conserva la clave NeuroRobi2026. Su pagina esta en http://192.168.4.1 y las lecturas JSON en /datos. Para la aplicacion publicada usa el envio del ESP32 a Railway y abre una sesion de paciente en la aplicacion; el servidor cloud no puede consultar la IP privada del oso.

El oso no mide pulso ni frecuencia cardiaca. Los campos historicos de sesiones se conservan por compatibilidad; no son mediciones de este hardware. Las migraciones ya aplicadas se conservan para no alterar su historial.

Pendiente de validar con el dispositivo fisico. HTTPS del firmware actual usa setInsecure: cifra el trafico pero no verifica el certificado del servidor.