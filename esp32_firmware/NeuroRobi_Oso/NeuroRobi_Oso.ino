#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <math.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>

// =========================================================================
// NEUROROBI ESP32 38 PINES - OSO TERAPÉUTICO CON ENVÍO AL SERVIDOR
// =========================================================================

// 1. Configuración de tu red Wi-Fi (para que el ESP32 tenga acceso al servidor):
const char* WIFI_STA_SSID = "TU_WIFI_AQUI";      // Nombre de tu red Wi-Fi
const char* WIFI_STA_PASS = "TU_PASSWORD_WIFI";  // Contraseña de tu red Wi-Fi

// 2. URL del Servidor Desplegado (o local):
// Si está en Railway/Render pon la URL HTTPS completa, por ejemplo:
// "https://neurorobi-backend-production.up.railway.app/api/telemetry"
// Si estás probando en tu PC local en la misma red Wi-Fi:
// "http://192.168.110.26:3001/api/telemetry"
const char* SERVER_URL = "https://neurorobi-backend-production.up.railway.app/api/telemetry";

// 3. Clave del dispositivo (debe coincidir con TELEMETRY_API_KEY en tu .env):
const char* DEVICE_KEY = "TU_TELEMETRY_API_KEY";

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

// Configuracion local independiente de Internet.
WebServer configServer(80);
Preferences wifiPreferences;
struct WifiCredentials { char ssid[33]; char pass[64]; };
String savedSsid, savedPass, pendingSsid, pendingPass;
String configName, configPassword, configToken;
bool configActive = false, wifiAttempt = false, applyPending = false;
bool credentialsPending = false, configGestureLatched = false;
unsigned long wifiAttemptAt = 0, disconnectedAt = 0, connectedAt = 0;
unsigned long submittedAt = 0, gestureAt = 0, lastReconnectAt = 0;
String configStatus = "Introduce la red Wi-Fi de 2.4 GHz del peluche.";

struct Packet { char json[768]; };
QueueHandle_t telemetryQueue;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOK = false;
bool mpuOK = false;
volatile bool servidorOK = false;
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
  if (configActive) {
    display.setTextColor(SSD1306_WHITE); display.setTextSize(1);
    display.setCursor(0, 0); display.print("CONFIGURAR WI-FI");
    display.setCursor(0, 12); display.print(configName);
    display.setCursor(0, 26); display.print("Clave: "); display.print(configPassword);
    display.setCursor(0, 40); display.print("192.168.4.1");
    display.setCursor(0, 54); display.print("Desde tu celular");
    display.display(); return;
  }
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
const char WIFI_FORM[] PROGMEM = R"wifihtml(
<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wi-Fi del peluche | NeuroRobi</title><style>body{font:16px system-ui;background:#f0fdfa;color:#134e4a;padding:24px}main{max-width:420px;margin:auto;background:white;padding:24px;border-radius:20px}label{display:block;margin-top:18px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;border:1px solid #99f6e4;border-radius:10px}button{background:#0f766e;color:white;font-weight:bold}small{display:block;margin-top:16px;color:#475569}</style>
<main><h1>Conectar el peluche</h1><p>No necesitas Internet para cambiar la red.</p>
<form method="POST" action="/wifi"><input type="hidden" name="token" value="TOKEN_VALUE">
<label>Nombre de la red (SSID)<input name="ssid" maxlength="32" required autocomplete="off"></label>
<label>Contrasena del Wi-Fi<input name="password" type="password" minlength="8" maxlength="63" required autocomplete="new-password"></label>
<button>Probar y guardar red</button></form>
<p id="status">STATUS_VALUE</p><small>Usa una red de 2.4 GHz. La red anterior se conserva si la nueva no conecta. Desactiva el cambio automatico a datos moviles y permanece en la red del peluche durante la prueba.</small></main>
<script>setInterval(async()=>{try{let r=await fetch('/estado',{cache:'no-store'});let d=await r.json();document.getElementById('status').textContent=d.message}catch{}},1500)</script></html>
)wifihtml";

void startWifiConfig() {
  if (configActive) return;
  char suffix[9], password[13], token[33];
  snprintf(suffix, sizeof(suffix), "%06lX", (unsigned long)(ESP.getEfuseMac() & 0xFFFFFF));
  snprintf(password, sizeof(password), "%08lX", (unsigned long)esp_random());
  snprintf(token, sizeof(token), "%08lX%08lX%08lX%08lX", (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  configName = String("NeuroRobi_Config_") + suffix;
  configPassword = password;
  configToken = token;
  WiFi.mode(WIFI_AP_STA);
  if (!WiFi.softAP(configName.c_str(), configPassword.c_str(), 1, false, 1)) {
    Serial.println("No se pudo iniciar configuracion Wi-Fi"); return;
  }
  configActive = true;
  connectedAt = 0;
  configStatus = "Introduce la nueva red Wi-Fi. La clave de esta pagina aparece en la OLED.";
  configServer.begin();
  Serial.printf("Config Wi-Fi: %s | clave: %s | http://192.168.4.1\n", configName.c_str(), configPassword.c_str());
}

void setupWifiConfig() {
  wifiPreferences.begin("neurorobi-wifi", false);
  WifiCredentials stored = {};
  if (wifiPreferences.getBytesLength("network") == sizeof(stored) &&
      wifiPreferences.getBytes("network", &stored, sizeof(stored)) == sizeof(stored)) {
    stored.ssid[32] = 0; stored.pass[63] = 0;
    savedSsid = stored.ssid; savedPass = stored.pass;
  }
  if (savedSsid.isEmpty() && String(WIFI_STA_SSID) != "TU_WIFI_AQUI") {
    savedSsid = WIFI_STA_SSID; savedPass = WIFI_STA_PASS;
  }
  configServer.on("/", HTTP_GET, []() {
    String page = FPSTR(WIFI_FORM);
    page.replace("TOKEN_VALUE", configToken);
    // Estado fijo del firmware: nunca insertar SSID o claves en HTML.
    page.replace("STATUS_VALUE", "Esperando configuracion. Si ya guardaste, espera el resultado.");
    configServer.sendHeader("Cache-Control", "no-store");
    configServer.send(200, "text/html; charset=utf-8", page);
  });
  configServer.on("/estado", HTTP_GET, []() {
    configServer.sendHeader("Cache-Control", "no-store");
    configServer.send(200, "application/json", String("{\"message\":\"") + configStatus + "\"}");
  });
  configServer.on("/wifi", HTTP_POST, []() {
    if (!configActive || configServer.arg("token") != configToken) { configServer.send(403, "text/plain", "Solicitud invalida. Abre la pagina de nuevo."); return; }
    if (credentialsPending || applyPending) { configServer.send(409, "text/plain", "Espera el resultado de la prueba anterior."); return; }
    String ssid = configServer.arg("ssid"), pass = configServer.arg("password");
    if (ssid.length() < 1 || ssid.length() > 32 || pass.length() < 8 || pass.length() > 63) { configServer.send(400, "text/plain", "SSID: 1 a 32 bytes. Contrasena: 8 a 63 caracteres."); return; }
    pendingSsid = ssid; pendingPass = pass;
    applyPending = true; submittedAt = millis();
    configStatus = "Probando la red. Espera hasta 25 segundos sin cerrar esta pagina.";
    configServer.sendHeader("Location", "/"); configServer.send(303, "text/plain", "Probando red");
  });
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);
  if (!savedSsid.isEmpty()) {
    WiFi.begin(savedSsid.c_str(), savedPass.c_str());
    wifiAttempt = true; wifiAttemptAt = millis();
  } else startWifiConfig();
}

void handleWifiConfig() {
  unsigned long now = millis();
  // Mantener AMBOS finales de carrera durante 5 s abre configuracion.
  if (switchIzq && switchDer) {
    if (gestureAt == 0) gestureAt = now;
    if (!configGestureLatched && now - gestureAt >= 5000) { configGestureLatched = true; startWifiConfig(); }
  } else { gestureAt = 0; configGestureLatched = false; }
  if (configActive) configServer.handleClient();
  if (applyPending && now - submittedAt >= 500) {
    applyPending = false; credentialsPending = true;
    WiFi.disconnect(false, false);
    WiFi.begin(pendingSsid.c_str(), pendingPass.c_str());
    wifiAttempt = true; wifiAttemptAt = now; connectedAt = 0;
  }
  if (credentialsPending && now - wifiAttemptAt < 1000) return;
  if (WiFi.status() == WL_CONNECTED) {
    wifiAttempt = false; disconnectedAt = 0;
    if (credentialsPending) {
      // Solo escribir en memoria despues de conectar correctamente.
      WifiCredentials candidate = {};
      pendingSsid.toCharArray(candidate.ssid, sizeof(candidate.ssid));
      pendingPass.toCharArray(candidate.pass, sizeof(candidate.pass));
      bool stored = wifiPreferences.putBytes("network", &candidate, sizeof(candidate)) == sizeof(candidate);
      if (!stored) {
        configStatus = "Error guardando la red. Intenta nuevamente.";
        credentialsPending = false; pendingPass = ""; connectedAt = 0;
        return;
      }
      savedSsid = pendingSsid; savedPass = pendingPass; pendingPass = "";
      credentialsPending = false;
      configStatus = "Red conectada y guardada. Vuelve a tu Wi-Fi habitual y abre NeuroRobi.";
      connectedAt = now;
    }
    if (configActive && connectedAt != 0 && now - connectedAt >= 15000) {
      configServer.stop(); WiFi.softAPdisconnect(true); WiFi.mode(WIFI_STA); configActive = false;
    }
    return;
  }
  if (wifiAttempt && now - wifiAttemptAt >= 25000) {
    wifiAttempt = false;
    if (credentialsPending) {
      credentialsPending = false; pendingPass = "";
      configStatus = "No se pudo conectar. Revisa nombre, clave y red de 2.4 GHz. La red anterior sigue guardada.";
    }
    startWifiConfig();
  }
  if (disconnectedAt == 0) disconnectedAt = now;
  if (!configActive && now - disconnectedAt >= 25000) startWifiConfig();
  if (!credentialsPending && !applyPending && !wifiAttempt && !savedSsid.isEmpty() && now - lastReconnectAt >= 10000) {
    lastReconnectAt = now; WiFi.begin(savedSsid.c_str(), savedPass.c_str());
  }
}

// Red en tarea independiente: no bloquea sensores ni OLED y no acumula retraso.
void telemetryTask(void*) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", DEVICE_KEY);
  Packet packet;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      servidorOK = false;
      // La conexion Wi-Fi la administra el bucle de configuracion.
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    if (xQueueReceive(telemetryQueue, &packet, pdMS_TO_TICKS(100)) == pdTRUE) {
      int code = http.POST(String(packet.json));
      servidorOK = code == 200;
      if (!servidorOK) {
        Serial.printf("Servidor HTTP: %d (401: revisar DEVICE_KEY)\n", code);
        vTaskDelay(pdMS_TO_TICKS(500));
      }
    }
  }
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

  setupWifiConfig();

  telemetryQueue = xQueueCreate(1, sizeof(Packet));
  if (!telemetryQueue) { Serial.println("Error creando cola de telemetria"); while (true) delay(1000); }
  xTaskCreate(telemetryTask, "telemetry", 12288, nullptr, 1, nullptr);
  Serial.println("Peluche listo. Mantener ambos switches 5 segundos para configurar Wi-Fi.");
}

void loop() {
  handleWifiConfig();

  
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

  // Envío al servidor remoto desplegado cada 100ms
  if (millis() - tServer >= 100) {
    tServer = millis();
    Packet packet;
    construirJSON().toCharArray(packet.json, sizeof(packet.json));
    xQueueOverwrite(telemetryQueue, &packet);
  }

  // Log serial cada segundo
  if (millis() - tSerial >= 1000) {
    tSerial = millis();
    Serial.printf("APRETON=%s (ADC %d) | FLEX DER=%d/10 | SW18=%d SW19=%d | MOV=%.1f | SRV=%s\n",
      apreton ? "ON" : "OFF", flexIzq, nivelDer,
      switchIzq, switchDer, movimiento, servidorOK ? "OK(200)" : "ERROR");
  }
}
