// app.js - Lógica principal de la aplicación

// Variables globales
let currentDevice = null;
let isStreaming = false;
let streamingInterval = null;
let pinModal = null;

// Inicialización
// Función de inicialización async
async function initializeApp() {
    try {
        // Inicializar servicios
        await StorageService.init();
        console.log('StorageService inicializado');
        
        // Cargar dispositivos recientes
        if (StorageService.db) {
            loadRecentDevices();
        }
    } catch(error) {
        console.error('Error inicializando StorageService:', error);
    }
    
    // Resto de inicializaciones
    ChartService.init('dataChart');
    pinModal = new bootstrap.Modal(document.getElementById('pinModal'));
    
    // Registrar Service Worker
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('/service-worker.js')
            .then(() => console.log('Service Worker registrado'))
            .catch(err => console.error('Error registrando Service Worker:', err));
    }
    
    setupEventHandlers();
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
}

// Document ready
$(document).ready(function() {
    console.log('Huella BLE Manager iniciado');
    
    // Verificar soporte de Web Bluetooth
    if (!navigator.bluetooth) {
        showError('Web Bluetooth no está soportado en este navegador. Use Chrome en Android.');
        $('#scanButton').prop('disabled', true);
        return;
    }
    
    // Llamar a la función async
    initializeApp();
});

// Configurar manejadores de eventos
function setupEventHandlers() {
    // PIN input - solo números
    $('#pinInput').on('input', function() {
        this.value = this.value.replace(/[^0-9]/g, '');
        $(this).removeClass('is-invalid');
    });
    
    // Enter en PIN input
    $('#pinInput').on('keypress', function(e) {
        if (e.which === 13) {
            submitPIN();
        }
    });
    
    // Prevenir cierre accidental durante streaming
    window.addEventListener('beforeunload', function(e) {
        if (isStreaming || (currentDevice && BLEService.isConnected())) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
    
    // Detectar cambios de visibilidad para pausar streaming
    document.addEventListener('visibilitychange', function() {
        if (document.hidden && isStreaming) {
            console.log('App en background, pausando streaming');
            stopStreaming();
        }
    });
}

// Cargar dispositivos recientes
async function loadRecentDevices() {
    try {
        // Verificar que StorageService esté listo
        if (!StorageService.db) {
            console.warn('StorageService no está inicializado');
            return;
        }
        
        const devices = await StorageService.getRecentDevices();
        
        // Verificar que devices es un array
        if (!Array.isArray(devices)) {
            console.error('getRecentDevices no devolvió un array:', devices);
            return;
        }
        
        const container = $('#recentDevicesList');
        
        if (devices.length === 0) {
            return;
        }
        
        container.empty();
        
        devices.forEach(device => {
            const card = `
                <div class="col-md-6 col-lg-4 mb-3">
                    <div class="card device-card" onclick="connectToSavedDevice('${device.id}')">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-cpu"></i> ${device.name}
                            </h6>
                            <small class="text-muted">
                                ID: ${device.id}<br>
                                Última conexión: ${formatDate(device.lastConnected)}
                            </small>
                        </div>
                    </div>
                </div>
            `;
            container.append(card);
        });
    } catch(error) {
        console.error('Error cargando dispositivos recientes:', error);
        // No mostrar error al usuario, solo continuar
    }
}

// Escanear dispositivos
async function scanForDevices() {
    try {
        showLoading('Escaneando dispositivos...');
        
        const device = await BLEService.scan();
        
        if (device) {
            currentDevice = device;
            console.log('Dispositivo seleccionado:', device.name);
            
            // Intentar conectar
            const connected = await BLEService.connect(device);
            
            if (connected) {
                hideLoading();
                // Mostrar modal de PIN
                $('#pinInput').val('').removeClass('is-invalid');
                pinModal.show();
            } else {
                throw new Error('No se pudo conectar al dispositivo');
            }
        }
    } catch (error) {
        hideLoading();
        showError('Error al escanear: ' + error.message);
    }
}

// Conectar a dispositivo guardado
async function connectToSavedDevice(deviceId) {
    try {
        showLoading('Reconectando dispositivo...');
        
        // Intentar reconectar por ID
        const devices = await navigator.bluetooth.getDevices();
        const device = devices.find(d => d.id === deviceId);
        
        if (device) {
            currentDevice = device;
            const connected = await BLEService.connect(device);
            
            if (connected) {
                hideLoading();
                // Mostrar modal de PIN
                $('#pinInput').val('').removeClass('is-invalid');
                pinModal.show();
            } else {
                throw new Error('No se pudo reconectar');
            }
        } else {
            throw new Error('Dispositivo no encontrado');
        }
    } catch (error) {
        hideLoading();
        showError('Error al reconectar: ' + error.message);
        // Si falla, escanear nuevamente
        scanForDevices();
    }
}

// Enviar PIN
async function submitPIN() {
    const pin = $('#pinInput').val();
    
    if (pin.length !== 6) {
        $('#pinInput').addClass('is-invalid');
        return;
    }
    
    try {
        showLoading('Autenticando...');
        
        const authenticated = await BLEService.authenticate(pin);
        
        if (authenticated) {
            pinModal.hide();
            onDeviceConnected();
        } else {
            hideLoading();
            $('#pinInput').addClass('is-invalid');
            vibrate(200); // Vibración de error
        }
    } catch (error) {
        hideLoading();
        showError('Error de autenticación: ' + error.message);
    }
}

// Cancelar conexión
function cancelConnection() {
    pinModal.hide();
    if (currentDevice) {
        BLEService.disconnect();
        currentDevice = null;
    }
}

// Dispositivo conectado exitosamente
async function onDeviceConnected() {
    console.log('Dispositivo conectado y autenticado');
    
    // Guardar en dispositivos recientes
    if (currentDevice) {
        StorageService.saveDevice({
            id: currentDevice.id,
            name: currentDevice.name,
            lastConnected: Date.now()
        });
    }
    
    // Cambiar vista
    $('#dashboardView').hide();
    $('#deviceView').show();
    
    // Actualizar UI
    $('#deviceName').text(currentDevice.name);
    $('#deviceId').text(currentDevice.id);
    updateConnectionStatus(true);
    
    // Sincronizar información inicial
    await syncDevice();
    
    // Vibración de éxito
    vibrate([50, 30, 50]);
    
    hideLoading();
}

// Desconectar dispositivo
function disconnectDevice() {
    if (confirm('¿Desea desconectar el dispositivo?')) {
        if (isStreaming) {
            stopStreaming();
        }
        
        BLEService.disconnect();
        currentDevice = null;
        
        // Volver a vista principal
        $('#deviceView').hide();
        $('#dashboardView').show();
        
        updateConnectionStatus(false);
        
        // Recargar dispositivos recientes
        loadRecentDevices();
    }
}

// Sincronizar dispositivo
async function syncDevice() {
    try {
        showLoading('Sincronizando dispositivo...');
        
        // Obtener información del dispositivo
        const info = await BLEService.getDeviceInfo();
        if (info) {
            updateDeviceInfo(info);
        }
        
        // Obtener configuración
        const config = await BLEService.getConfiguration();
        if (config) {
            updateConfiguration(config);
        }
        
        // Obtener estado actual
        const status = await BLEService.getStatus();
        if (status) {
            updateDeviceStatus(status);
        }
        
        hideLoading();
        showSuccess('Dispositivo sincronizado');
        
    } catch (error) {
        hideLoading();
        showError('Error al sincronizar: ' + error.message);
    }
}

// Actualizar información del dispositivo
function updateDeviceInfo(info) {
    $('#infoVersion').text(info.version || '-');
    $('#infoUptime').text(formatUptime(info.uptime) || '-');
    $('#infoBattery').text(info.battery ? `${(info.battery / 1000).toFixed(1)} V` : '-');
    $('#infoTemperature').text(info.temperature ? `${info.temperature.toFixed(1)} °C` : '-');
    $('#infoSDFree').text(info.sdFree ? `${info.sdFree} MB` : '-');
    $('#infoMemory').text(info.freeHeap ? `${(info.freeHeap / 1024).toFixed(1)} KB` : '-');
}

// Actualizar configuración
function updateConfiguration(config) {
    $('#configName').val(config.name || '');
    $('#configFrequency').val(config.frequency || 250);
    $('#configInterval').val(config.fileInterval || 1);
    $('#configCalX').val(config.calFactorX || '3.814697266E-06');
    $('#configCalY').val(config.calFactorY || '3.814697266E-06');
    $('#configCalZ').val(config.calFactorZ || '3.814697266E-06');
    $('#configSSID').val(config.ssid || '');
    
    // No mostrar contraseña, solo indicar si existe
    $('#configPassword').attr('placeholder', 
        config.hasPassword ? 'Contraseña guardada (dejar vacío para mantener)' : 'Contraseña');
}

// Actualizar estado del dispositivo
function updateDeviceStatus(status) {
    const mode = status.opMode || '-';
    $('#deviceStatus').text(mode);
    
    // Actualizar color según estado
    $('#deviceStatus').removeClass('text-success text-warning text-danger');
    if (mode === 'M3' || mode === 'Normal') {
        $('#deviceStatus').addClass('text-success');
    } else if (mode === 'StandBy') {
        $('#deviceStatus').addClass('text-warning');
        enableConfigEditing(true);
    } else {
        $('#deviceStatus').addClass('text-danger');
    }
    
    // Verificar si puede editar configuración
    if (mode !== 'StandBy') {
        enableConfigEditing(false);
        $('#configEditMessage').show();
    } else {
        $('#configEditMessage').hide();
    }
}

// Habilitar/deshabilitar edición de configuración
function enableConfigEditing(enable) {
    $('#configForm input, #configForm select').prop('disabled', !enable);
    $('#saveConfigBtn').prop('disabled', !enable);
    
    if (enable) {
        $('#saveConfigBtn').removeClass('btn-secondary').addClass('btn-primary');
    } else {
        $('#saveConfigBtn').removeClass('btn-primary').addClass('btn-secondary');
    }
}

// Enviar comando
async function sendCommand(command) {
    try {
        showLoading(`Enviando comando ${command}...`);
        
        const result = await BLEService.sendCommand(command);
        
        if (result) {
            hideLoading();
            showSuccess(`Comando ${command} ejecutado`);
            
            // Vibración de confirmación
            vibrate(50);
            
            // Actualizar estado después de un momento
            setTimeout(() => {
                BLEService.getStatus().then(status => {
                    if (status) updateDeviceStatus(status);
                });
            }, 1000);
        } else {
            throw new Error('Error al enviar comando');
        }
    } catch (error) {
        hideLoading();
        showError('Error: ' + error.message);
    }
}

// Guardar configuración
async function saveConfiguration() {
    const config = {
        name: $('#configName').val(),
        frequency: parseInt($('#configFrequency').val()),
        fileInterval: parseInt($('#configInterval').val()),
        calFactorX: $('#configCalX').val(),
        calFactorY: $('#configCalY').val(),
        calFactorZ: $('#configCalZ').val(),
        ssid: $('#configSSID').val()
    };
    
    // Solo incluir contraseña si se ingresó una nueva
    const password = $('#configPassword').val();
    if (password) {
        config.password = password;
    }
    
    try {
        showLoading('Guardando configuración...');
        
        const result = await BLEService.setConfiguration(config);
        
        if (result) {
            hideLoading();
            showSuccess('Configuración guardada exitosamente');
            
            // Limpiar campo de contraseña
            $('#configPassword').val('');
            
            // Si cambió la frecuencia, advertir sobre reinicio
            if (config.frequency !== parseInt($('#configFrequency').data('original-value'))) {
                showWarning('Se requiere reiniciar el dispositivo para aplicar el cambio de frecuencia');
            }
        } else {
            throw new Error('Error al guardar configuración');
        }
    } catch (error) {
        hideLoading();
        showError('Error: ' + error.message);
    }
}

// Alternar streaming
async function toggleStreaming() {
    if (isStreaming) {
        stopStreaming();
    } else {
        startStreaming();
    }
}

// Iniciar streaming
async function startStreaming() {
    try {
        const duration = parseInt($('#streamDuration').val());
        
        showLoading('Iniciando streaming...');
        
        // Limpiar gráfico
        ChartService.clear();
        
        // Iniciar streaming
        const started = await BLEService.startStreaming(duration, (data) => {
            // Callback para datos recibidos
            updateStreamingData(data);
        });
        
        if (started) {
            isStreaming = true;
            $('#streamBtn').html('<i class="bi bi-stop-fill"></i> Detener');
            $('#streamBtn').removeClass('btn-primary').addClass('btn-danger');
            $('#streamDuration').prop('disabled', true);
            
            // Mantener pantalla activa durante streaming
            if ('wakeLock' in navigator) {
                navigator.wakeLock.request('screen').catch(err => {
                    console.log('Wake Lock error:', err);
                });
            }
            
            hideLoading();
            
            // Auto-detener después de la duración
            setTimeout(() => {
                if (isStreaming) {
                    stopStreaming();
                }
            }, duration * 1000);
        } else {
            throw new Error('No se pudo iniciar streaming');
        }
    } catch (error) {
        hideLoading();
        showError('Error: ' + error.message);
    }
}

// Detener streaming
function stopStreaming() {
    BLEService.stopStreaming();
    isStreaming = false;
    
    $('#streamBtn').html('<i class="bi bi-play-fill"></i> Iniciar');
    $('#streamBtn').removeClass('btn-danger').addClass('btn-primary');
    $('#streamDuration').prop('disabled', false);
    
    // Liberar wake lock
    if ('wakeLock' in navigator) {
        navigator.wakeLock.release().catch(() => {});
    }
}

// Actualizar datos de streaming
function updateStreamingData(data) {
    // Actualizar valores actuales
    $('#currentX').text(data.x || 0);
    $('#currentY').text(data.y || 0);
    $('#currentZ').text(data.z || 0);
    
    // Agregar al gráfico
    ChartService.addData(data.x, data.y, data.z);
    
    // Guardar en storage para exportación
    StorageService.addStreamingData({
        x: data.x,
        y: data.y,
        z: data.z,
        temperature: data.t,
        timestamp: data.ts || Date.now()
    });
}

// Exportar datos
function exportData() {
    const data = StorageService.getStreamingData();
    
    if (data.length === 0) {
        showWarning('No hay datos para exportar');
        return;
    }
    
    // Crear CSV
    let csv = 'Timestamp,X,Y,Z,Temperature\n';
    data.forEach(point => {
        csv += `${point.timestamp},${point.x},${point.y},${point.z},${point.temperature}\n`;
    });
    
    // Descargar archivo
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `huella_data_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    showSuccess('Datos exportados exitosamente');
}

// Actualizar estado de conexión
function updateConnectionStatus(connected) {
    const indicator = $('#connectionIndicator');
    
    if (connected) {
        indicator.removeClass('bg-danger').addClass('bg-success');
        indicator.html('<i class="bi bi-circle-fill"></i> Conectado');
        $('#scanButton').hide();
    } else {
        indicator.removeClass('bg-success').addClass('bg-danger');
        indicator.html('<i class="bi bi-circle-fill"></i> Desconectado');
        $('#scanButton').show();
    }
}

// Alternar tema
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Utilidades UI
function showLoading(message) {
    // Implementar loading overlay
    console.log('Loading:', message);
}

function hideLoading() {
    // Ocultar loading overlay
}

function showSuccess(message) {
    console.log('Success:', message);
    // Mostrar toast o notificación
}

function showError(message) {
    console.error('Error:', message);
    // Mostrar toast o alerta
}

function showWarning(message) {
    console.warn('Warning:', message);
    // Mostrar toast o alerta
}

// Vibración
function vibrate(pattern) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

// Formatear fecha
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Hace un momento';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} minutos`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} horas`;
    
    return date.toLocaleDateString();
}

// Formatear uptime
function formatUptime(ms) {
    if (!ms) return '-';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Manejar errores de BLE
BLEService.onDisconnected = () => {
    console.log('Dispositivo desconectado inesperadamente');
    updateConnectionStatus(false);
    
    if (isStreaming) {
        stopStreaming();
    }
    
    // Mostrar alerta
    showError('El dispositivo se ha desconectado');
    
    // Volver a la vista principal después de un momento
    setTimeout(() => {
        $('#deviceView').hide();
        $('#dashboardView').show();
        currentDevice = null;
    }, 2000);
};
