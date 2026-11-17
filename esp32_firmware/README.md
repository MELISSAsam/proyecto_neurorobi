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

Pines originales: sensor unico de apreton GPIO32, switches18/19, I2C SDA16/SCL4. El firmware prepara lecturas cada 100 ms en una cola de longitud 1 y transmite la mas reciente en una tarea independiente. SRV=OK(200) significa que Railway acepto la lectura. HTTP401 indica DEVICE_KEY incorrecta.

HTTPS usa setInsecure y no verifica el certificado. Las pruebas fisicas de cambio de router, contrasena incorrecta, reinicio y recuperacion siguen pendientes.

El flex derecho GPIO33 ya no se utiliza. Apreton: solo GPIO32, umbral ADC > 600. La OLED muestra En reposo, Suave, Moderada o Fuerte. La web usa un indice relativo de sacudida 0 a 10; no muestra los ejes ni unidades tecnicas del giroscopio. No es una medicion de fuerza ni un diagnostico.


## Espera e inicio de terapia

Al conectarse al servidor, el peluche queda EN ESPERA. Envia una confirmacion ligera de conexion cada segundo, sin lecturas del flex/MPU ni registros en la base. Solo se consultan los interruptores necesarios para abrir la configuracion Wi-Fi.

En la web abre Telemetria en Vivo, selecciona el paciente y pulsa Empezar terapia. El servidor autoriza el muestreo y el ESP32 empieza a preparar y enviar lecturas cada 100 ms. Finalizar la terapia o salir de la vista detiene la autorizacion. Si el navegador pierde comunicacion, el permiso vence en unos 12 segundos. El ESP32 deja de medir al recibir la parada o si pierde conexion al servidor.

Es necesario cargar este firmware para ahorrar las lecturas y envios del dispositivo. Los firmwares anteriores siguen enviando continuamente, aunque el backend nuevo descarta los paquetes mientras no hay terapia activa. El modo de configuracion Wi-Fi sigue disponible con ambos interruptores durante 5 segundos.
