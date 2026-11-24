# Usar el peluche con NeuroRobi local

1. Inicia NeuroRobi en la PC con `iniciar-todo.bat`.
2. Copia `NeuroRobi_Oso/telemetry.local.h.example` a `NeuroRobi_Oso/telemetry.local.h`. Pon la IPv4 del adaptador Wi-Fi de la PC en `NEUROROBI_SERVER_IP` y copia `TELEMETRY_API_KEY` del `.env` del backend en `NEUROROBI_DEVICE_KEY`. El ESP32 enviará datos a `http://<IP_DE_LA_PC>:3001/api/telemetry` como `oso-principal`.
3. Abre `NeuroRobi_Oso/NeuroRobi_Oso.ino` en Arduino IDE. Selecciona **ESP32 Dev Module**, instala Adafruit GFX Library y Adafruit SSD1306 con sus dependencias, y carga el sketch por USB.

## Red Wi-Fi fija

Define el nombre y la clave de la red Wi-Fi de 2.4 GHz en `NEUROROBI_WIFI_SSID` y `NEUROROBI_WIFI_PASSWORD` dentro de `telemetry.local.h`. Conecta la PC a la misma red. Para cambiar de red, edita el archivo y vuelve a cargar el sketch.

Pines originales: sensor único de apretón GPIO32, switches GPIO18/19 e I2C SDA16/SCL4. Durante la terapia, el firmware prepara lecturas cada 100 ms y transmite la más reciente en una tarea independiente. `SRV=OK` indica que respondió el backend local. Si aparece HTTP 401, revisa la clave del dispositivo. Si no hay respuesta, comprueba que ambos estén en la misma red y que Windows permita el puerto 3001 desde ella.

El flex derecho GPIO33 ya no se utiliza. Apreton: solo GPIO32, umbral ADC > 600. La OLED muestra En reposo, Suave, Moderada o Fuerte. La web usa un indice relativo de sacudida 0 a 10; no muestra los ejes ni unidades tecnicas del giroscopio. No es una medicion de fuerza ni un diagnostico.


## Espera e inicio de terapia

Al conectarse al servidor, el peluche queda EN ESPERA. Envia una confirmacion ligera de conexion cada segundo, sin lecturas del flex/MPU ni registros en la base.

En la web abre Telemetria en Vivo, selecciona el paciente y pulsa Empezar terapia. El servidor autoriza el muestreo y el ESP32 empieza a preparar y enviar lecturas cada 100 ms. Finalizar la terapia o salir de la vista detiene la autorizacion. Si el navegador pierde comunicacion, el permiso vence en unos 12 segundos. El ESP32 deja de medir al recibir la parada o si pierde conexion al servidor.

Es necesario cargar este firmware para ahorrar las lecturas y envios del dispositivo. Los firmwares anteriores siguen enviando continuamente, aunque el backend nuevo descarta los paquetes mientras no hay terapia activa.
