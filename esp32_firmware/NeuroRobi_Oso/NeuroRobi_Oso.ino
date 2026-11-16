#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <math.h>

// =========================================================================
// NEUROROBI ESP32 38 PINES - OSO TERAPÉUTICO CON ENVÍO AL SERVIDOR
// =========================================================================

// 1. Configuración de tu red Wi-Fi (para que el ESP32 tenga acceso al servidor):
const char* WIFI_STA_SSID = "TU_WIFI_AQUI";      // Nombre de tu red Wi-Fi
const char* WIFI_STA_PASS = "TU_PASSWORD_WIFI";  // Contraseña de tu red Wi-Fi

// 2. URL del Servidor Desplegado (o local):
// Si está en Railway/Render pon la URL HTTPS completa, por ejemplo:
// "https://TU-BACKEND.up.railway.app/api/telemetry"
// Si estás probando en tu PC local en la misma red Wi-Fi:
// "http://192.168.110.26:3001/api/telemetry"
const char* SERVER_URL = "https://TU-BACKEND.up.railway.app/api/telemetry";

// 3. Clave del dispositivo (debe coincidir con TELEMETRY_API_KEY en tu .env):
const char* DEVICE_KEY = "esp32-telemetry-key-neurorobi-cuenca-2026";

// 4. Modo Punto de Acceso propio del Oso (se mantiene activo):
const char* WIFI_SSID = "NeuroRobi_ESP32";
const char* WIFI_PASS = "NeuroRobi2026";

// Pines de Hardware (100% tus pines originales sin cambios)
const int FLEX_APRETON   = 32;
const int FLEX_DERECHO   = 33;
const int SWITCH_IZQ     = 18;
const int SWITCH_DER     = 19;
const int SDA_PIN        = 16;
const int SCL_PIN        = 4;
const int UMBRAL_APRETON = 600; // ON solo cuando ADC > 600
const int DER_MIN        = 700;
const int DER_MAX        = 1300;

WebServer server(80);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOK = false;
bool mpuOK = false;
bool servidorOK = false;
uint8_t mpuAddress = 0x68;

int flexIzq = 0, flexDer = 0, nivelDer = 1;
bool apreton = false, switchIzq = false, switchDer = false;
float accX = 0, accY = 0, accZ = 0;
float giroX = 0, giroY = 0, giroZ = 0, movimiento = 0;
unsigned long tSensores = 0, tOLED = 0, tSerial = 0, tMPU = 0, tServer = 0;

int nivelFlex(int adc) {
  float n = 1.0f + ((float)(adc - DER_MIN) * 9.0f) / (DER_MAX - DER_MIN);
  return constrain((int)roundf(n), 1, 10);
}

bool i2cPresente(uint8_t dir) {
  Wire.beginTransmission(dir);
  return Wire.endTransmission() == 0;
}

void iniciarOLED() {
  uint8_t dir;
  if (i2cPresente(0x3C)) dir = 0x3C;
  else if (i2cPresente(0x3D)) dir = 0x3D;
  else { Serial.println("OLED no detectada (0x3C / 0x3D)"); return; }
  oledOK = display.begin(SSD1306_SWITCHCAPVCC, dir);
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
  long sumaI = 0, sumaD = 0;
  for (int i = 0; i < 16; ++i) {
    sumaI += analogRead(FLEX_APRETON);
    sumaD += analogRead(FLEX_DERECHO);
  }
  flexIzq = sumaI / 16;
  flexDer = sumaD / 16;
  apreton = flexIzq > UMBRAL_APRETON;
  nivelDer = nivelFlex(flexDer);
  switchIzq = digitalRead(SWITCH_IZQ) == LOW;
  switchDer = digitalRead(SWITCH_DER) == LOW;
  leerMPU();
}

// Dashboard OLED original: alterna dos pantallas cada 3 segundos
void actualizarOLED() {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  if ((millis() / 3000) % 2 == 0) {
    display.setCursor(34, 0); display.print("NEUROROBI");
    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
    display.drawRoundRect(0, 13, 61, 32, 3, SSD1306_WHITE);
    display.drawRoundRect(66, 13, 62, 32, 3, SSD1306_WHITE);
    display.setCursor(9, 17); display.print("APRETON");
    display.setTextSize(2);
    display.setCursor(apreton ? 17 : 12, 28); display.print(apreton ? "ON" : "OFF");
    display.setTextSize(1);
    display.setCursor(72, 17); display.print("FLEX DER");
    display.setTextSize(2);
    display.setCursor(74, 28); display.print(nivelDer);
    display.setTextSize(1); display.print("/10");
    display.setCursor(0, 48); display.print("SW I:"); display.print(switchIzq ? "ON" : "OFF");
    display.print(" D:"); display.print(switchDer ? "ON" : "OFF");
    display.setCursor(0, 57); display.print("SRV: ");
    display.print(servidorOK ? "OK" : (WiFi.status() == WL_CONNECTED ? "ERR" : "NO-WIFI"));
    display.print(" | MOV:");
    display.print((int)movimiento);
  } else {
    display.setCursor(29, 0); display.print("MOVIMIENTO");
    display.drawLine(0, 10, 127, 10, SSD1306_WHITE);
    display.setCursor(0, 16); display.print("MPU6050: "); display.print(mpuOK ? "OK" : "ERROR");
    display.setCursor(0, 29); display.print("INTENSIDAD");
    display.drawRect(0, 41, 128, 13, SSD1306_WHITE);
    int ancho = constrain((int)(movimiento * 1.24f), 0, 124);
    display.fillRect(2, 43, ancho, 9, SSD1306_WHITE);
    display.setCursor(0, 57); display.print("GIRO: ");
    display.print((int)movimiento); display.print("/100");
  }
  display.display();
}

String construirJSON() {
  String j;
  j.reserve(320);
  j = "{";
  j += "\"deviceType\":\"oso\",";
  j += "\"flexIzq\":" + String(flexIzq) + ",";
  j += "\"flexDer\":" + String(flexDer) + ",";
  j += "\"apreton\":" + String(apreton ? "true" : "false") + ",";
  j += "\"nivelDer\":" + String(nivelDer) + ",";
  j += "\"switchIzq\":" + String(switchIzq ? "true" : "false") + ",";
  j += "\"switchDer\":" + String(switchDer ? "true" : "false") + ",";
  j += "\"mpu\":" + String(mpuOK ? "true" : "false") + ",";
  j += "\"accX\":" + String(accX, 2) + ",";
  j += "\"accY\":" + String(accY, 2) + ",";
  j += "\"accZ\":" + String(accZ, 2) + ",";
  j += "\"giroX\":" + String(giroX, 2) + ",";
  j += "\"giroY\":" + String(giroY, 2) + ",";
  j += "\"giroZ\":" + String(giroZ, 2) + ",";
  j += "\"movimiento\":" + String(movimiento, 1);
  j += "}";
  return j;
}

// ─────────────────────────────────────────────────────────────────────────
// ENVÍO DE DATOS AL SERVIDOR (HTTP POST a /api/telemetry)
// Soporta tanto HTTPS (servidor desplegado en nube) como HTTP (red local).
// ─────────────────────────────────────────────────────────────────────────
void enviarAlServidor() {
  if (WiFi.status() != WL_CONNECTED || strlen(WIFI_STA_SSID) == 0) {
    servidorOK = false;
    return;
  }

  String payload = construirJSON();
  bool esHttps = String(SERVER_URL).startsWith("https://");

  if (esHttps) {
    WiFiClientSecure client;
    client.setInsecure(); // No requiere certificados SSL quemados
    HTTPClient https;
    if (https.begin(client, SERVER_URL)) {
      https.addHeader("Content-Type", "application/json");
      https.addHeader("x-device-key", DEVICE_KEY);
      https.setTimeout(1200);
      int code = https.POST(payload);
      servidorOK = (code == 200 || code == 201);
      https.end();
    }
  } else {
    WiFiClient client;
    HTTPClient http;
    if (http.begin(client, SERVER_URL)) {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("x-device-key", DEVICE_KEY);
      http.setTimeout(1200);
      int code = http.POST(payload);
      servidorOK = (code == 200 || code == 201);
      http.end();
    }
  }
}

void enviarDatos() {
  String j = construirJSON();
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "application/json", j);
}

void paginaPrincipal() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Cache-Control", "no-store");
  server.send(200, "text/plain", "NeuroRobi Oso ESP32 activo. Datos en /datos o enviados al servidor.");
}

void setup() {
  Serial.begin(115200);
  delay(800);
  pinMode(SWITCH_IZQ, INPUT_PULLUP);
  pinMode(SWITCH_DER, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(FLEX_APRETON, ADC_11db);
  analogSetPinAttenuation(FLEX_DERECHO, ADC_11db);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  iniciarOLED();
  iniciarMPU();
  leerSensores();
  actualizarOLED();

  // 1. Iniciar conexión a tu red Wi-Fi para enviar al servidor
  WiFi.mode(WIFI_AP_STA);
  if (strlen(WIFI_STA_SSID) > 0) {
    WiFi.begin(WIFI_STA_SSID, WIFI_STA_PASS);
    Serial.print("Conectando al Wi-Fi: ");
    Serial.println(WIFI_STA_SSID);
  }

  // 2. Mantener activo el Hotspot propio del Oso por si deseas conexión directa
  if (WiFi.softAP(WIFI_SSID, WIFI_PASS, 1, 0, 2)) {
    Serial.print("WiFi AP OK: http://");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("ERROR AL CREAR WIFI AP");
  }

  server.on("/", HTTP_GET, paginaPrincipal);
  server.on("/datos", HTTP_GET, enviarDatos);
  server.begin();
  Serial.println("NeuroRobi Oso listo.");
}

void loop() {
  server.handleClient();
  
  // Lectura de sensores cada 100ms
  if (millis() - tSensores >= 100) { 
    tSensores = millis(); 
    leerSensores(); 
  }
  
  // Actualización de pantalla OLED cada 250ms
  if (millis() - tOLED >= 250) { 
    tOLED = millis(); 
    actualizarOLED(); 
  }

  // Envío al servidor remoto desplegado cada 200ms
  if (millis() - tServer >= 200) {
    tServer = millis();
    enviarAlServidor();
  }

  // Log serial cada segundo
  if (millis() - tSerial >= 1000) {
    tSerial = millis();
    Serial.printf("APRETON=%s (ADC %d) | FLEX DER=%d/10 | SW18=%d SW19=%d | MOV=%.1f | SRV=%s\n",
      apreton ? "ON" : "OFF", flexIzq, nivelDer,
      switchIzq, switchDer, movimiento, servidorOK ? "OK(200)" : "ERROR");
  }
}
