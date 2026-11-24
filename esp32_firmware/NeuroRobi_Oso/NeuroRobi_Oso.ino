#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include "telemetry.local.h"
#include <math.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

// =========================================================================
// NEUROROBI ESP32 38 PINES - OSO TERAPÉUTICO CON ENVÍO AL SERVIDOR
// =========================================================================

// La red Wi-Fi fija se configura en telemetry.local.h.
const char* SERVER_URL = "http://" NEUROROBI_SERVER_IP ":3001/api/telemetry";
const char* DEVICE_ID = "oso-principal"; // Identificador registrado en NeuroRobi
const char* DEVICE_KEY = NEUROROBI_DEVICE_KEY;

// Pines de Hardware (100% tus pines originales sin cambios)
const int FLEX_APRETON   = 32;
const int SWITCH_IZQ     = 18;
const int SWITCH_DER     = 19;
const int SDA_PIN        = 16;
const int SCL_PIN        = 4;
const int UMBRAL_APRETON = 600; // ON solo cuando ADC > 600

struct Packet { char json[768]; };
QueueHandle_t telemetryQueue;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOK = false;
bool mpuOK = false;
volatile bool servidorOK = false;
volatile bool therapyActive = false;
uint8_t mpuAddress = 0x68;

int flexIzq = 0;
bool apreton = false, switchIzq = false, switchDer = false;
float accX = 0, accY = 0, accZ = 0;
float giroX = 0, giroY = 0, giroZ = 0, movimiento = 0;
unsigned long tSensores = 0, tOLED = 0, tSerial = 0, tMPU = 0, tServer = 0;


bool i2cPresente(uint8_t dir) {
  Wire.beginTransmission(dir);
  return Wire.endTransmission() == 0;
}

void iniciarOLED() {
  uint8_t dir;
  if (i2cPresente(0x3C)) dir = 0x3C;
  else if (i2cPresente(0x3D)) dir = 0x3D;
  else { Serial.println("OLED no detectada (0x3C / 0x3D)"); return; }
  // Wire ya usa los pines SDA16/SCL4 definidos en setup().
  oledOK = display.begin(SSD1306_SWITCHCAPVCC, dir, true, false);
  if (!oledOK) { Serial.println("Error iniciando OLED"); return; }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(7, 12);
  display.print("NEUROROBI");
  display.setTextSize(1);
  display.setCursor(20, 45);
  display.print("Conectando...");
  display.display();
  Serial.printf("OLED OK 0x%02X\n", dir);
}

void iniciarMPU() {
  mpuOK = false;
  if (i2cPresente(0x68)) mpuAddress = 0x68;
  else if (i2cPresente(0x69)) mpuAddress = 0x69;
  else { Serial.println("MPU6050 no detectado"); return; }
  Wire.beginTransmission(mpuAddress);
  Wire.write(0x6B);
  Wire.write(0x00);
  mpuOK = (Wire.endTransmission() == 0);
  Serial.println(mpuOK ? "MPU6050 OK" : "Error al iniciar MPU6050");
}

void leerMPU() {
  if (!mpuOK) {
    movimiento = 0;
    if (millis() - tMPU >= 5000) { tMPU = millis(); iniciarMPU(); }
    return;
  }
  Wire.beginTransmission(mpuAddress);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(mpuAddress, (uint8_t)14) != 14) {
    mpuOK = false;
    movimiento = 0;
    return;
  }
  int16_t ax = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t ay = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t az = (int16_t)((Wire.read() << 8) | Wire.read());
  Wire.read(); Wire.read(); // temperatura
  int16_t gx = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t gy = (int16_t)((Wire.read() << 8) | Wire.read());
  int16_t gz = (int16_t)((Wire.read() << 8) | Wire.read());
  accX = ax / 16384.0f; accY = ay / 16384.0f; accZ = az / 16384.0f;
  giroX = gx / 131.0f; giroY = gy / 131.0f; giroZ = gz / 131.0f;
  movimiento = constrain(sqrtf(giroX*giroX + giroY*giroY + giroZ*giroZ) / 3.0f, 0.0f, 100.0f);
}

void leerSensores() {
  long sumaI = 0;
  for (int i = 0; i < 16; ++i) {
    sumaI += analogRead(FLEX_APRETON);
  }
  flexIzq = sumaI / 16;
  apreton = flexIzq > UMBRAL_APRETON;
  switchIzq = digitalRead(SWITCH_IZQ) == LOW;
  switchDer = digitalRead(SWITCH_DER) == LOW;
  leerMPU();
}

// Dashboard OLED original: alterna dos pantallas cada 3 segundos
const char* nivelSacudida() {
  if (movimiento < 10) return "EN REPOSO";
  if (movimiento < 30) return "SUAVE";
  if (movimiento < 60) return "MODERADA";
  return "FUERTE";
}

void actualizarOLED() {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  if (!therapyActive) {
    display.setCursor(0, 0); display.print("NEUROROBI LISTO");
    display.setCursor(0, 20); display.print(servidorOK ? "EN ESPERA" : "CONECTANDO...");
    display.setCursor(0, 38); display.print("EMPEZAR TERAPIA");
    display.setCursor(0, 52); display.print("DESDE LA WEB");
    display.display(); return;
  }
  display.setCursor(0, 0); display.print("PELUCHE NEUROROBI");
  display.setCursor(0, 16); display.print("APRETON: "); display.print(apreton ? "SI" : "NO");
  display.setCursor(0, 30); display.print("SACUDIDA:");
  display.setCursor(0, 42); display.print(mpuOK ? nivelSacudida() : "SIN SENSOR");
  display.setCursor(0, 55); display.print(servidorOK ? "SERVIDOR OK" : "CONECTANDO...");
  display.display();
}

String construirJSON() {
  String j;
  j.reserve(320);
  j = "{";
  j += "\"deviceType\":\"oso\",";
  j += "\"flexIzq\":" + String(flexIzq) + ",";
  j += "\"apreton\":" + String(apreton ? "true" : "false") + ",";
  j += "\"switchIzq\":" + String(switchIzq ? "true" : "false") + ",";
  j += "\"switchDer\":" + String(switchDer ? "true" : "false") + ",";
  j += "\"mpu\":" + String(mpuOK ? "true" : "false") + ",";
  j += "\"movimiento\":" + String(movimiento, 1);
  j += "}";
  return j;
}

void iniciarWiFi() {
  WiFi.persistent(false);
  Serial.println("Wi-Fi: conectando a la red fija");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(NEUROROBI_WIFI_SSID, NEUROROBI_WIFI_PASSWORD);
}


// Red en tarea independiente: no bloquea sensores ni OLED y no acumula retraso.
void telemetryTask(void*) {
  WiFiClient client;
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  if (!http.begin(client, SERVER_URL)) {
    Serial.println("URL de telemetria invalida");
    vTaskDelete(nullptr);
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  http.addHeader("x-device-id", DEVICE_ID);
  Packet packet;
  unsigned long lastRequest = 0;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      if (therapyActive) xQueueReset(telemetryQueue);
      servidorOK = false; therapyActive = false;
      client.stop();
      vTaskDelay(pdMS_TO_TICKS(100)); continue;
    }
    String payload;
    if (!therapyActive) {
      if (millis() - lastRequest < 1000) { vTaskDelay(pdMS_TO_TICKS(20)); continue; }
      payload = "{\"deviceType\":\"oso\",\"heartbeat\":true}";
    } else {
      if (xQueueReceive(telemetryQueue, &packet, pdMS_TO_TICKS(100)) != pdTRUE) continue;
      payload = packet.json;
    }
    int code = http.POST(payload);
    String response = code > 0 ? http.getString() : "";
    lastRequest = millis();
    servidorOK = code == 200;
    bool wasActive = therapyActive;
    therapyActive = servidorOK && response.indexOf("\"therapyActive\":true") >= 0;
    if (wasActive && !therapyActive) xQueueReset(telemetryQueue);
    if (!servidorOK) {
      client.stop();
      Serial.printf("Servidor HTTP: %d (401: revisar DEVICE_KEY)\n", code);
      vTaskDelay(pdMS_TO_TICKS(500));
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(800);
  Serial.printf("NEUROROBI Wi-Fi | motivo de arranque: %d\n", (int)esp_reset_reason());
  pinMode(SWITCH_IZQ, INPUT_PULLUP);
  pinMode(SWITCH_DER, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(FLEX_APRETON, ADC_11db);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  iniciarOLED();
  iniciarMPU();
  actualizarOLED();

  iniciarWiFi();

  telemetryQueue = xQueueCreate(1, sizeof(Packet));
  if (!telemetryQueue) { Serial.println("Error creando cola de telemetria"); while (true) delay(1000); }
  xTaskCreate(telemetryTask, "telemetry", 12288, nullptr, 1, nullptr);
  Serial.println("Peluche listo. Esperando conexion con NeuroRobi.");
}

void loop() {
  // Lectura de sensores cada 100ms
  if (millis() - tSensores >= 100) { 
    tSensores = millis(); 
    switchIzq = digitalRead(SWITCH_IZQ) == LOW;
    switchDer = digitalRead(SWITCH_DER) == LOW;
    if (therapyActive) leerSensores();
  }
  
  // Actualización de pantalla OLED cada 250ms
  if (millis() - tOLED >= 250) { 
    tOLED = millis(); 
    actualizarOLED(); 
  }

  // Envío al servidor local cada 100ms
  if (therapyActive && millis() - tServer >= 100) {
    tServer = millis();
    Packet packet;
    construirJSON().toCharArray(packet.json, sizeof(packet.json));
    xQueueOverwrite(telemetryQueue, &packet);
  }

  // Log serial cada segundo
  if (millis() - tSerial >= 1000) {
    tSerial = millis();
    Serial.printf("APRETON=%s | SW18=%d SW19=%d | SACUDIDA=%s | SRV=%s\n",
      apreton ? "SI" : "NO", switchIzq, switchDer, therapyActive ? nivelSacudida() : "EN ESPERA", servidorOK ? "OK(200)" : "ERROR");
  }
  delay(5);
}
