#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLE2902.h>

// UUIDs
#define SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define CHAR_CMD_UUID       "12345678-1234-5678-1234-56789abcdef1"
#define CHAR_STATUS_UUID    "12345678-1234-5678-1234-56789abcdef2"
#define CHAR_DATA_UUID      "12345678-1234-5678-1234-56789abcdef3"
#define CHAR_CONFIG_UUID    "12345678-1234-5678-1234-56789abcdef4"
#define CHAR_INFO_UUID      "12345678-1234-5678-1234-56789abcdef5"
#define CHAR_PARAMS_UUID    "12345678-1234-5678-1234-56789abcdef6"
#define CHAR_SYNC_UUID      "12345678-1234-5678-1234-56789abcdef7"

// Variables globales BLE
BLEServer* bleServer = NULL;
BLEService* bleService = NULL;
BLECharacteristic* bleCharCmd = NULL;
BLECharacteristic* bleCharStatus = NULL;
BLECharacteristic* bleCharData = NULL;
BLECharacteristic* bleCharConfig = NULL;
BLECharacteristic* bleCharInfo = NULL;
BLECharacteristic* bleCharParams = NULL;
BLECharacteristic* bleCharSync = NULL;

bool deviceConnected = false;
bool oldDeviceConnected = false;
unsigned long lastHeartbeat = 0;

// Callbacks del servidor
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("\n>>> BLE: Cliente conectado <<<");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("\n>>> BLE: Cliente desconectado <<<");
    }
};

// Callback para comandos
class MyCmdCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        std::string value = pCharacteristic->getValue();
        if (value.length() > 0) {
            Serial.print("BLE CMD: ");
            Serial.println(value.c_str());
            
            // Responder al comando con status
            String response = "{\"status\":\"CMD_OK\",\"cmd\":\"" + String(value.c_str()) + "\"}";
            bleCharStatus->setValue(response.c_str());
            bleCharStatus->notify();
        }
    }
};

bool createBLECharacteristic(const char* name, const char* uuid, uint32_t properties, BLECharacteristic** charPtr, bool addDescriptor = false) {
    Serial.print("  Creando ");
    Serial.print(name);
    Serial.print("... ");
    
    *charPtr = bleService->createCharacteristic(uuid, properties);
    
    if (*charPtr == NULL) {
        Serial.println("FALLO!");
        return false;
    }
    
    if (addDescriptor) {
        (*charPtr)->addDescriptor(new BLE2902());
    }
    
    // Verificar que se creó correctamente
    delay(10);
    if ((*charPtr)->getHandle() == 0) {
        Serial.println("ERROR: Handle inválido!");
        return false;
    }
    
    Serial.print("OK (handle: ");
    Serial.print((*charPtr)->getHandle());
    Serial.println(")");
    
    return true;
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    
    Serial.println("\n\n====================================");
    Serial.println("BLE Test Firmware v1.0");
    Serial.println("====================================\n");
    
    // Inicializar BLE
    String bleName = "HUELLA_TEST_001";
    Serial.println("1. Inicializando BLE: " + bleName);
    BLEDevice::init(bleName.c_str());
    delay(100);
    Serial.println("   OK\n");
    
    // Crear servidor
    Serial.println("2. Creando servidor BLE...");
    bleServer = BLEDevice::createServer();
    if (bleServer == NULL) {
        Serial.println("   ERROR: No se pudo crear servidor!");
        while(1) delay(1000);
    }
    bleServer->setCallbacks(new MyServerCallbacks());
    Serial.println("   OK\n");
    
    // Crear servicio
    Serial.println("3. Creando servicio...");
    bleService = bleServer->createService(SERVICE_UUID);
    if (bleService == NULL) {
        Serial.println("   ERROR: No se pudo crear servicio!");
        while(1) delay(1000);
    }
    Serial.println("   OK\n");
    
    // Crear TODAS las características con verificación
    Serial.println("4. Creando características:");
    
    bool allOk = true;
    
    allOk &= createBLECharacteristic(
        "CMD", CHAR_CMD_UUID,
        BLECharacteristic::PROPERTY_WRITE,
        &bleCharCmd
    );
    bleCharCmd->setCallbacks(new MyCmdCallbacks());
    
    allOk &= createBLECharacteristic(
        "STATUS", CHAR_STATUS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY,
        &bleCharStatus,
        true
    );
    
    allOk &= createBLECharacteristic(
        "DATA", CHAR_DATA_UUID,
        BLECharacteristic::PROPERTY_NOTIFY,
        &bleCharData,
        true
    );
    
    allOk &= createBLECharacteristic(
        "CONFIG", CHAR_CONFIG_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE,
        &bleCharConfig
    );
    
    allOk &= createBLECharacteristic(
        "INFO", CHAR_INFO_UUID,
        BLECharacteristic::PROPERTY_READ,
        &bleCharInfo
    );
    
    allOk &= createBLECharacteristic(
        "PARAMS", CHAR_PARAMS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE,
        &bleCharParams
    );
    
    allOk &= createBLECharacteristic(
        "SYNC", CHAR_SYNC_UUID,
        BLECharacteristic::PROPERTY_READ,
        &bleCharSync
    );
    
    if (!allOk) {
        Serial.println("\n   ERROR: Algunas características fallaron!");
        while(1) delay(1000);
    }
    
    Serial.println("\n   Todas las características creadas exitosamente!\n");
    
    // Establecer valores iniciales
    Serial.println("5. Estableciendo valores iniciales...");
    bleCharStatus->setValue("{\"status\":\"READY\",\"opMode\":\"Normal\"}");
    bleCharInfo->setValue("{\"version\":\"TEST_1.0\",\"uptime\":0,\"battery\":8000,\"temperature\":25.0}");
    bleCharConfig->setValue("{\"name\":\"TEST\",\"frequency\":250,\"fileInterval\":1}");
    bleCharParams->setValue("{\"calFactorX\":\"3.814697266E-06\",\"calFactorY\":\"3.814697266E-06\",\"calFactorZ\":\"3.814697266E-06\"}");
    String syncValue = "{\"synced\":true,\"timestamp\":" + String(millis()) + "}";
    bleCharSync->setValue(syncValue.c_str());
    Serial.println("   OK\n");
    
    // Iniciar servicio
    Serial.println("6. Iniciando servicio BLE...");
    bleService->start();
    delay(500); // CRÍTICO: Esperar a que el servicio esté completamente iniciado
    Serial.println("   OK\n");
    
    // Configurar advertising
    Serial.println("7. Configurando advertising...");
    BLEAdvertising *bleAdvertising = BLEDevice::getAdvertising();
    bleAdvertising->addServiceUUID(SERVICE_UUID);
    bleAdvertising->setScanResponse(true);
    bleAdvertising->setMinPreferred(0x06);
    bleAdvertising->setMaxPreferred(0x12);
    Serial.println("   OK\n");
    
    // Iniciar advertising
    Serial.println("8. Iniciando advertising...");
    BLEDevice::startAdvertising();
    delay(100);
    Serial.println("   OK\n");
    
    Serial.println("====================================");
    Serial.println("BLE LISTO - Esperando conexiones");
    Serial.println("Nombre: " + bleName);
    Serial.println("====================================\n");
    
    lastHeartbeat = millis();
}

void loop() {
    // Manejar desconexión
    if (!deviceConnected && oldDeviceConnected) {
        Serial.println("Reiniciando advertising...");
        delay(500);
        BLEDevice::startAdvertising();
        oldDeviceConnected = deviceConnected;
    }
    
    // Manejar nueva conexión
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
        Serial.println("Dispositivo listo para recibir comandos");
    }
    
    // Heartbeat cada 2 segundos si está conectado
    if (deviceConnected && (millis() - lastHeartbeat > 2000)) {
        lastHeartbeat = millis();
        
        String status = "{\"status\":\"ALIVE\",\"uptime\":" + String(millis()) + ",\"authenticated\":true}";
        bleCharStatus->setValue(status.c_str());
        bleCharStatus->notify();
        
        Serial.print(".");
    }
    
    delay(50);
}
