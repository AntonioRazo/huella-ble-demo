// storage-service.js - Servicio de almacenamiento local con IndexedDB

const StorageService = {
    dbName: 'HuellaBLEDB',
    dbVersion: 1,
    db: null,
    
    // Initialize IndexedDB
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('Error opening IndexedDB');
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('devices')) {
                    const devicesStore = db.createObjectStore('devices', { keyPath: 'id' });
                    devicesStore.createIndex('lastConnected', 'lastConnected', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('streamingData')) {
                    const dataStore = db.createObjectStore('streamingData', { autoIncrement: true });
                    dataStore.createIndex('timestamp', 'timestamp', { unique: false });
                    dataStore.createIndex('deviceId', 'deviceId', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('configurations')) {
                    const configStore = db.createObjectStore('configurations', { keyPath: 'deviceId' });
                    configStore.createIndex('savedAt', 'savedAt', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('logs')) {
                    const logsStore = db.createObjectStore('logs', { autoIncrement: true });
                    logsStore.createIndex('timestamp', 'timestamp', { unique: false });
                    logsStore.createIndex('level', 'level', { unique: false });
                }
            };
        });
    },
    
    // Save device to recent devices
    async saveDevice(device) {
        const transaction = this.db.transaction(['devices'], 'readwrite');
        const store = transaction.objectStore('devices');
        
        const deviceData = {
            id: device.id,
            name: device.name,
            lastConnected: device.lastConnected || Date.now(),
            connectionCount: 1
        };
        
        // Check if device exists
        const existing = await this.getDevice(device.id);
        if (existing) {
            deviceData.connectionCount = existing.connectionCount + 1;
        }
        
        return new Promise((resolve, reject) => {
            const request = store.put(deviceData);
            request.onsuccess = () => resolve(deviceData);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get device by ID
    async getDevice(deviceId) {
        const transaction = this.db.transaction(['devices'], 'readonly');
        const store = transaction.objectStore('devices');
        
        return new Promise((resolve, reject) => {
            const request = store.get(deviceId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get recent devices
    async getRecentDevices(limit = 5) {
        // Verificar que db esté inicializado
        if (!this.db) {
            console.warn('Database not initialized');
            return [];  // Retornar array vacío en lugar de fallar
        }
        
        const transaction = this.db.transaction(['devices'], 'readonly');
        const store = transaction.objectStore('devices');
        const index = store.index('lastConnected');
        
        const devices = [];
        
        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && devices.length < limit) {
                    devices.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(devices);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    // Save streaming data point
    async addStreamingData(data) {
        const transaction = this.db.transaction(['streamingData'], 'readwrite');
        const store = transaction.objectStore('streamingData');
        
        const dataPoint = {
            ...data,
            savedAt: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.add(dataPoint);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get streaming data
    async getStreamingData(deviceId, limit = 1000) {
        const transaction = this.db.transaction(['streamingData'], 'readonly');
        const store = transaction.objectStore('streamingData');
        const index = store.index('timestamp');
        
        const data = [];
        
        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && data.length < limit) {
                    if (!deviceId || cursor.value.deviceId === deviceId) {
                        data.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(data.reverse()); // Return in chronological order
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    // Clear streaming data
    async clearStreamingData(deviceId) {
        const transaction = this.db.transaction(['streamingData'], 'readwrite');
        const store = transaction.objectStore('streamingData');
        
        if (deviceId) {
            // Clear only for specific device
            const index = store.index('deviceId');
            const request = index.openCursor(IDBKeyRange.only(deviceId));
            
            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } else {
            // Clear all
            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    },
    
    // Save device configuration
    async saveConfiguration(deviceId, config) {
        const transaction = this.db.transaction(['configurations'], 'readwrite');
        const store = transaction.objectStore('configurations');
        
        const configData = {
            deviceId: deviceId,
            config: config,
            savedAt: Date.now()
        };
        
        return new Promise((resolve, reject) => {
            const request = store.put(configData);
            request.onsuccess = () => resolve(configData);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get device configuration
    async getConfiguration(deviceId) {
        const transaction = this.db.transaction(['configurations'], 'readonly');
        const store = transaction.objectStore('configurations');
        
        return new Promise((resolve, reject) => {
            const request = store.get(deviceId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    
    // Add log entry
    async addLog(level, message, data = null) {
        const transaction = this.db.transaction(['logs'], 'readwrite');
        const store = transaction.objectStore('logs');
        
        const logEntry = {
            timestamp: Date.now(),
            level: level,
            message: message,
            data: data
        };
        
        return new Promise((resolve, reject) => {
            const request = store.add(logEntry);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    
    // Get logs
    async getLogs(limit = 100, level = null) {
        const transaction = this.db.transaction(['logs'], 'readonly');
        const store = transaction.objectStore('logs');
        const index = store.index('timestamp');
        
        const logs = [];
        
        return new Promise((resolve, reject) => {
            const request = index.openCursor(null, 'prev');
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && logs.length < limit) {
                    if (!level || cursor.value.level === level) {
                        logs.push(cursor.value);
                    }
                    cursor.continue();
                } else {
                    resolve(logs);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    },
    
    // Clear old data (maintenance)
    async clearOldData(daysToKeep = 7) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        
        // Clear old streaming data
        const transaction1 = this.db.transaction(['streamingData'], 'readwrite');
        const dataStore = transaction1.objectStore('streamingData');
        const dataIndex = dataStore.index('timestamp');
        
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request1 = dataIndex.openCursor(range);
        
        request1.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        // Clear old logs
        const transaction2 = this.db.transaction(['logs'], 'readwrite');
        const logsStore = transaction2.objectStore('logs');
        const logsIndex = logsStore.index('timestamp');
        
        const request2 = logsIndex.openCursor(range);
        
        request2.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
    },
    
    // Export data to JSON
    async exportData(deviceId = null) {
        const exportData = {
            devices: [],
            configurations: [],
            streamingData: [],
            exportDate: new Date().toISOString()
        };
        
        // Get devices
        exportData.devices = await this.getRecentDevices(100);
        
        // Get configurations
        if (deviceId) {
            const config = await this.getConfiguration(deviceId);
            if (config) exportData.configurations.push(config);
        }
        
        // Get streaming data
        exportData.streamingData = await this.getStreamingData(deviceId, 10000);
        
        return exportData;
    },
    
    // Import data from JSON
    async importData(jsonData) {
        try {
            const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
            
            // Import devices
            if (data.devices && Array.isArray(data.devices)) {
                for (const device of data.devices) {
                    await this.saveDevice(device);
                }
            }
            
            // Import configurations
            if (data.configurations && Array.isArray(data.configurations)) {
                for (const config of data.configurations) {
                    await this.saveConfiguration(config.deviceId, config.config);
                }
            }
            
            // Import streaming data
            if (data.streamingData && Array.isArray(data.streamingData)) {
                for (const dataPoint of data.streamingData) {
                    await this.addStreamingData(dataPoint);
                }
            }
            
            return true;
        } catch (error) {
            console.error('Import error:', error);
            throw error;
        }
    }
};
