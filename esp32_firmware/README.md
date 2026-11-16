# Configurar el Wi-Fi del peluche sin Internet

Carga NeuroRobi_Oso/NeuroRobi_Oso.ino una sola vez. Usa ESP32 Dev Module, Adafruit GFX Library, Adafruit SSD1306 y sus dependencias. Configura DEVICE_KEY con TELEMETRY_API_KEY del backend. No publiques credenciales reales.

No es necesario escribir WIFI_STA_SSID ni WIFI_STA_PASS: puedes dejarlos como ejemplo y configurar desde el celular.

1. Enciende el peluche. Si no tiene red guardada, abre configuracion automaticamente. Si pierde la red, espera unos 25 segundos.
2. Para cambiar de red aunque ya este conectado, mant?n ambos finales de carrera (GPIO18 y GPIO19) activados durante 5 segundos y sueltalos.
3. Conecta el celular o PC a NeuroRobi_Config_XXXXXX. La contrasena temporal aparece en la OLED y en el monitor serie a 115200.
4. Aunque el celular indique que la red no tiene Internet, permanece conectado. Abre http://192.168.4.1 en el navegador.
5. Escribe el nombre y contrasena de la nueva red Wi-Fi de 2.4 GHz y pulsa Probar y guardar red.
6. Espera el resultado hasta 25 segundos. Si conecta, guarda la red en memoria y cierra la red temporal 15 segundos despues. Si falla, conserva la red anterior y permite reintentar.
7. Vuelve al Wi-Fi habitual del celular y abre NeuroRobi.

La configuracion local funciona sin Internet y las credenciales quedan en el ESP32, no se envian a Railway. Para transmitir datos a Railway si hace falta una red con Internet. El portal local es exclusivamente para Wi-Fi y no muestra un dashboard de sensores. El cambio de red interrumpe temporalmente la transmision.

Pines originales: flex32/33, switches18/19, I2C SDA16/SCL4. El firmware prepara lecturas cada 100 ms en una cola de longitud 1 y transmite la mas reciente en una tarea independiente. SRV=OK(200) significa que Railway acepto la lectura. HTTP401 indica DEVICE_KEY incorrecta.

HTTPS usa setInsecure y no verifica el certificado. Las pruebas fisicas de cambio de router, contrasena incorrecta, reinicio y recuperacion siguen pendientes.
