#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>

constexpr int FLEX = 32;
constexpr int IZQUIERDO = 18;
constexpr int DERECHO = 19;
Adafruit_SSD1306 pantalla(128, 64, &Wire, -1);
bool oled = false;
uint8_t mpu = 0;
unsigned long ultimoComando = 0;
bool conectado = false;

bool presente(uint8_t direccion) {
  Wire.beginTransmission(direccion);
  return Wire.endTransmission() == 0;
}

void mostrar(const char* estado) {
  if (!oled) return;
  pantalla.clearDisplay();
  pantalla.setTextColor(SSD1306_WHITE);
  pantalla.setTextSize(1);
  pantalla.setCursor(0, 0);
  pantalla.println("NEUROROBI USB");
  pantalla.println(estado);
  pantalla.display();
}

void enviarLectura() {
  int suma = 0;
  for (int i = 0; i < 16; ++i) suma += analogRead(FLEX);
  int flex = suma / 16;
  float movimiento = 0;
  bool mpuOK = false;
  if (mpu) {
    Wire.beginTransmission(mpu);
    Wire.write(0x43);
    if (Wire.endTransmission(false) == 0 && Wire.requestFrom(mpu, (uint8_t)6) == 6) {
      float sumaCuadrados = 0;
      for (int eje = 0; eje < 3; ++eje) {
        uint16_t alto = Wire.read();
        uint16_t bajo = Wire.read();
        float giro = static_cast<int16_t>((alto << 8) | bajo) / 131.0f;
        sumaCuadrados += giro * giro;
      }
      movimiento = constrain(sqrtf(sumaCuadrados) / 3.0f, 0.0f, 100.0f);
      mpuOK = true;
    }
  }
  Serial.printf("{\"deviceType\":\"oso\",\"flexIzq\":%d,\"apreton\":%s,"
                "\"switchIzq\":%s,\"switchDer\":%s,\"mpu\":%s,\"movimiento\":%.1f}\n",
                flex, flex > 600 ? "true" : "false",
                digitalRead(IZQUIERDO) == LOW ? "true" : "false",
                digitalRead(DERECHO) == LOW ? "true" : "false",
                mpuOK ? "true" : "false", movimiento);
}

void setup() {
  Serial.begin(115200);
  pinMode(IZQUIERDO, INPUT_PULLUP);
  pinMode(DERECHO, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetPinAttenuation(FLEX, ADC_11db);
  Wire.begin(16, 4);
  Wire.setClock(100000);
  Wire.setTimeOut(50);
  uint8_t direccionOLED = presente(0x3C) ? 0x3C : (presente(0x3D) ? 0x3D : 0);
  if (direccionOLED) oled = pantalla.begin(SSD1306_SWITCHCAPVCC, direccionOLED, true, false);
  mpu = presente(0x68) ? 0x68 : (presente(0x69) ? 0x69 : 0);
  if (mpu) {
    Wire.beginTransmission(mpu);
    Wire.write(0x6B);
    Wire.write(0);
    if (Wire.endTransmission() != 0) mpu = 0;
  }
  mostrar("ESPERANDO LA PC");
  Serial.println("NEUROROBI USB LISTO");
}

void loop() {
  if (Serial.available()) {
    int comando = Serial.read();
    if (comando == 'H' || comando == 'M') {
      ultimoComando = millis();
      if (!conectado) {
        conectado = true;
        mostrar("CONECTADO A LA PC");
      }
      if (comando == 'M') enviarLectura();
      else Serial.println("{\"deviceType\":\"oso\",\"heartbeat\":true}");
    }
  }
  if (conectado && millis() - ultimoComando > 4000) {
    conectado = false;
    mostrar("ESPERANDO LA PC");
  }
  delay(5);
}
