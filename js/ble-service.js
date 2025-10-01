// ble-service.js - Servicio de comunicación BLE

const BLEService = {
    // UUIDs
    SERVICE_UUID: '12345678-1234-5678-1234-56789abcdef0',
    CHAR_CMD_UUID: '12345678-1234-5678-1234-56789abcdef1',
    CHAR_STATUS_UUID: '12345678-1234-5678-1234-56789abcdef2',
    CHAR_DATA_UUID: '12345678-1234-5678-1234-56789abcdef3',
    CHAR_CONFIG_UUID: '12345678-1234-5678-1234-56789abcdef4',
    CHAR_INFO_UUID: '12345678-1234-5678-1234-56789abcdef5',
    CHAR_PARAMS_UUID: '12345678-1234-5678-1234-56789abcdef6',
    CHAR_SYNC_UUID: '12345678-1234-5678-1234-56789abcdef7',
    
    // Estado
    device: null,
    server: null,
    service: null,
    characteristics: {},
    isAuthenticated: false,
    onDisconnected: null,
    
    // Scan for devices
    async scan() {
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [{
                    namePrefix: 'HUELLA_'
                }],
                optionalServices: [this.SERVICE_UUID]
            });
            
            return device;
        } catch (error) {
            console.error('BLE Scan error:', error);
            throw error;
        }
    },
    
    // Connect to device
async connect(device) {
    try {
        this.device = device;
        this.server = await device.gatt.connect();
        this.service = await this.server.getPrimaryService(this.SERVICE_UUID);
        
        console.log('Servicio obtenido, obteniendo características...');
        
        // Get all characteristics with individual error handling
        try {
            this.characteristics.cmd = await this.service.getCharacteristic(this.CHAR_CMD_UUID);
            console.log('✓ CMD characteristic obtenida');
        } catch(error) {
            console.warn('⚠ CMD characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.status = await this.service.getCharacteristic(this.CHAR_STATUS_UUID);
            console.log('✓ STATUS characteristic obtenida');
        } catch(error) {
            console.warn('⚠ STATUS characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.data = await this.service.getCharacteristic(this.CHAR_DATA_UUID);
            console.log('✓ DATA characteristic obtenida');
        } catch(error) {
            console.warn('⚠ DATA characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.config = await this.service.getCharacteristic(this.CHAR_CONFIG_UUID);
            console.log('✓ CONFIG characteristic obtenida');
        } catch(error) {
            console.warn('⚠ CONFIG characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.info = await this.service.getCharacteristic(this.CHAR_INFO_UUID);
            console.log('✓ INFO characteristic obtenida');
        } catch(error) {
            console.warn('⚠ INFO characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.params = await this.service.getCharacteristic(this.CHAR_PARAMS_UUID);
            console.log('✓ PARAMS characteristic obtenida');
        } catch(error) {
            console.warn('⚠ PARAMS characteristic no disponible:', error.message);
        }
        
        try {
            this.characteristics.sync = await this.service.getCharacteristic(this.CHAR_SYNC_UUID);
            console.log('✓ SYNC characteristic obtenida');
        } catch(error) {
            console.warn('⚠ SYNC characteristic no disponible:', error.message);
        }
        
        // Verificar que al menos tengamos las características críticas
        const criticalChars = ['cmd', 'status'];
        const hasCritical = criticalChars.every(name => this.characteristics[name] !== undefined);
        
        if (!hasCritical) {
            throw new Error('Faltan características críticas (CMD o STATUS)');
        }
        
        console.log('Características disponibles:', Object.keys(this.characteristics).filter(k => this.characteristics[k]));
        
        // Setup notifications solo si las características existen
        if (this.characteristics.status) {
            await this.characteristics.status.startNotifications();
            this.characteristics.status.addEventListener('characteristicvaluechanged', 
                this.handleStatusNotification.bind(this));
            console.log('✓ Notificaciones STATUS activadas');
        }
        
        if (this.characteristics.data) {
            await this.characteristics.data.startNotifications();
            this.characteristics.data.addEventListener('characteristicvaluechanged', 
                this.handleDataNotification.bind(this));
            console.log('✓ Notificaciones DATA activadas');
        }
        
        // Handle disconnection
        device.addEventListener('gattserverdisconnected', this.handleDisconnection.bind(this));
        
        console.log('✓ Conexión BLE completada exitosamente');
        return true;
        
    } catch (error) {
        console.error('BLE Connect error:', error);
        throw error;
    }
},
    
    // Disconnect
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.cleanup();
    },
    
    // Send authentication PIN
    // En el método authenticate de BLEService
async authenticate(pin) {
    try {
        const command = {
            cmd: 'AUTH',
            pin: pin
        };
        
        console.log('Enviando comando AUTH:', command); // Debug
        
        // Primero configurar el callback
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log('Timeout de autenticación'); // Debug
                resolve(false);
            }, 5000);
            
            this.authCallback = (authenticated) => {
                console.log('Callback de autenticación ejecutado:', authenticated); // Debug
                clearTimeout(timeout);
                this.isAuthenticated = authenticated;
                resolve(authenticated);
            };
            
            // DESPUÉS enviar el comando
            this.sendCommand(command).then(() => {
                console.log('Comando AUTH enviado exitosamente');
            }).catch(err => {
                console.error('Error enviando AUTH:', err);
                clearTimeout(timeout);
                resolve(false);
            });
        });
    } catch (error) {
        console.error('BLE Auth error:', error);
        return false;
    }
},
    
    // Send command
    async sendCommand(commandObj) {
    if (!this.characteristics.cmd) {
        throw new Error('No command characteristic available');
    }
    
    try {
        const encoder = new TextEncoder();
        let json;
        
        // Si es un objeto, convertir a JSON
        if (typeof commandObj === 'object') {
            json = JSON.stringify(commandObj);
        } else {
            // Si es un comando simple, crear el objeto
            json = JSON.stringify({ cmd: commandObj });
        }
        
        console.log('Enviando comando BLE:', json); // Debug
        const data = encoder.encode(json);
        
        if (data.length > 512) {
            throw new Error('Command too large for BLE');
        }
        
        // Intenta primero con writeValue (sin respuesta)
        await this.characteristics.cmd.writeValue(data);
        return true;
    } catch (error) {
        console.error('BLE Send command error:', error);
        throw error;
    }
},
    
    // Get device status
    async getStatus() {
        if (!this.characteristics.status) {
            throw new Error('No status characteristic available');
        }
        
        try {
            const value = await this.characteristics.status.readValue();
            const decoder = new TextDecoder();
            const json = decoder.decode(value);
            return JSON.parse(json);
        } catch (error) {
            console.error('BLE Get status error:', error);
            throw error;
        }
    },
    
    // Get device info
    async getDeviceInfo() {
        if (!this.characteristics.info) {
            throw new Error('No info characteristic available');
        }
        
        try {
            const value = await this.characteristics.info.readValue();
            const decoder = new TextDecoder();
            const json = decoder.decode(value);
            return JSON.parse(json);
        } catch (error) {
            console.error('BLE Get info error:', error);
            throw error;
        }
    },
    
    // Get configuration
    async getConfiguration() {
        if (!this.characteristics.config) {
            throw new Error('No config characteristic available');
        }
        
        try {
            const value = await this.characteristics.config.readValue();
            const decoder = new TextDecoder();
            const json = decoder.decode(value);
            return JSON.parse(json);
        } catch (error) {
            console.error('BLE Get config error:', error);
            throw error;
        }
    },
    
    // Set configuration
    async setConfiguration(config) {
        if (!this.characteristics.config) {
            throw new Error('No config characteristic available');
        }
        
        try {
            const encoder = new TextEncoder();
            const json = JSON.stringify(config);
            const data = encoder.encode(json);
            
            if (data.length > 512) {
                throw new Error('Configuration too large for BLE');
            }
            
            await this.characteristics.config.writeValueWithResponse(data);
            return true;
        } catch (error) {
            console.error('BLE Set config error:', error);
            throw error;
        }
    },
    
    // Start streaming
    async startStreaming(duration, callback) {
        this.streamCallback = callback;
        
        const command = {
            cmd: 'STREAM_START',
            duration: duration
        };
        
        return await this.sendCommand(command);
    },
    
    // Stop streaming
    async stopStreaming() {
        const command = {
            cmd: 'STREAM_STOP'
        };
        
        this.streamCallback = null;
        return await this.sendCommand(command);
    },
    
    // Handle status notifications
    handleStatusNotification(event) {
        try {
            const value = event.target.value;
            const decoder = new TextDecoder();
            const json = decoder.decode(value);
            const status = JSON.parse(json);
            
            console.log('Status notification:', status);
            
            // Check for authentication response
            if (status.status === 'AUTH_OK' && this.authCallback) {
                this.authCallback(true);
            } else if (status.status === 'AUTH_FAIL' && this.authCallback) {
                this.authCallback(false);
            }
            
            // Update global status if needed
            if (window.updateDeviceStatus) {
                window.updateDeviceStatus(status);
            }
        } catch (error) {
            console.error('Error handling status notification:', error);
        }
    },
    
    // Handle data notifications
    handleDataNotification(event) {
        try {
            const value = event.target.value;
            const decoder = new TextDecoder();
            const json = decoder.decode(value);
            const data = JSON.parse(json);
            
            // Call streaming callback if active
            if (this.streamCallback) {
                this.streamCallback(data);
            }
        } catch (error) {
            console.error('Error handling data notification:', error);
        }
    },
    
    // Handle disconnection
    handleDisconnection() {
        console.log('BLE Device disconnected');
        this.cleanup();
        
        if (this.onDisconnected) {
            this.onDisconnected();
        }
    },
    
    // Cleanup
    cleanup() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {};
        this.isAuthenticated = false;
        this.authCallback = null;
        this.streamCallback = null;
    },
    
    // Check if connected
    isConnected() {
        return this.device && this.device.gatt.connected;
    },
    
    // Utility: Send simple command
    async sendSimpleCommand(cmd) {
        return await this.sendCommand({ cmd: cmd });
    }
};
