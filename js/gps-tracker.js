/**
 * Módulo de Captura de GPS y Sensores Móviles en Tiempo Real
 * Frecuencia de actualización obligatoria: 1000 milisegundos (1 segundo)
 * Envío continuo a base de datos en la nube Firebase Firestore (DaaS)
 */

class GPSTracker {
  constructor() {
    this.isTracking = false;
    this.watchId = null;
    this.intervalId = null;
    this.updateIntervalMs = 1000; // 1000 ms = 1 segundo estricto
    this.deviceId = this.getOrCreateDeviceId();
    
    // Últimos datos de telemetría capturados del sensor
    this.currentTelemetry = {
      latitude: null,
      longitude: null,
      accuracy: null,
      altitude: null,
      altitudeAccuracy: null,
      speed: null,
      speedKmH: 0,
      heading: null,
      timestamp: null,
      batteryLevel: null,
      batteryCharging: null,
      orientation: { alpha: null, beta: null, gamma: null },
      isOnline: navigator.onLine,
      pingsSent: 0
    };

    // Cola de almacenamiento offline (Tolerancia a pérdida de internet)
    this.offlineQueue = this.loadOfflineQueue();

    this.wakeLock = null;
    this.battery = null;
    this.callbacks = {
      onTelemetryUpdate: null,
      onTransmissionSuccess: null,
      onOfflineQueueUpdate: null,
      onOfflineSynced: null,
      onError: null
    };

    this.initSensors();
  }

  loadOfflineQueue() {
    try {
      const saved = localStorage.getItem('geolive_offline_queue');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  }

  saveOfflineQueue() {
    try {
      // Limitar a los últimos 3000 puntos para optimizar almacenamiento en teléfono (~50 min de rastreo offline)
      if (this.offlineQueue.length > 3000) {
        this.offlineQueue = this.offlineQueue.slice(-3000);
      }
      localStorage.setItem('geolive_offline_queue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.warn('Error guardando cola offline:', e);
    }
  }

  queueOfflinePoint(payload) {
    this.offlineQueue.push(payload);
    this.saveOfflineQueue();
    if (this.callbacks.onOfflineQueueUpdate) {
      this.callbacks.onOfflineQueueUpdate(this.offlineQueue.length);
    }
  }

  // Identificador único del dispositivo (móvil)
  getOrCreateDeviceId() {
    let id = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID);
    if (!id) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      id = `Movil-GPS-${randomSuffix}`;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID, id);
    }
    return id;
  }

  setDeviceId(newId) {
    if (newId && newId.trim()) {
      this.deviceId = newId.trim();
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID, this.deviceId);
    }
  }

  // Inicializa sensores adicionales (Batería, Giroscopio, Red)
  async initSensors() {
    // 1. API de Batería (si el navegador móvil lo soporta)
    if ('getBattery' in navigator) {
      try {
        this.battery = await navigator.getBattery();
        this.updateBatteryInfo();
        this.battery.addEventListener('levelchange', () => this.updateBatteryInfo());
        this.battery.addEventListener('chargingchange', () => this.updateBatteryInfo());
      } catch (e) {
        console.warn('API de Batería no disponible:', e);
      }
    }

    // 2. Sensor de Orientación / Giroscopio (DeviceOrientationEvent)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (event) => {
        this.currentTelemetry.orientation = {
          alpha: event.alpha ? Math.round(event.alpha) : null, // Brújula (0 - 360°)
          beta: event.beta ? Math.round(event.beta) : null,   // Inclinación adelante/atrás (-180 a 180°)
          gamma: event.gamma ? Math.round(event.gamma) : null // Inclinación izquierda/derecha (-90 a 90°)
        };
      }, true);
    }

    // 3. Sensor de Conexión de Red y Sincronización Automática
    window.addEventListener('online', () => { 
      this.currentTelemetry.isOnline = true;
      console.log('📶 Conexión a internet restablecida. Vaciando cola offline...');
      this.flushOfflineQueue();
    });
    window.addEventListener('offline', () => { 
      this.currentTelemetry.isOnline = false;
      console.warn('⚠️ Se perdió la conexión a internet. Guardando coordenadas en cola local...');
      if (this.callbacks.onOfflineQueueUpdate) {
        this.callbacks.onOfflineQueueUpdate(this.offlineQueue.length);
      }
    });
  }

  updateBatteryInfo() {
    if (this.battery) {
      this.currentTelemetry.batteryLevel = Math.round(this.battery.level * 100);
      this.currentTelemetry.batteryCharging = this.battery.charging;
    }
  }

  // Solicitar Wake Lock para mantener encendida la pantalla del celular durante el rastreo
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Pantalla bloqueada para evitar suspensión (Wake Lock activo)');
        this.wakeLock.addEventListener('release', () => {
          console.log('Wake Lock liberado');
        });
      } catch (err) {
        console.warn('Wake Lock no permitido o error:', err);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock !== null) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
      });
    }
  }

  // Iniciar rastreo continuo cada 1000 milisegundos
  async startTracking() {
    if (this.isTracking) return;

    if (!('geolocation' in navigator)) {
      const errorMsg = 'La API de Geolocalización no es soportada por este navegador.';
      if (this.callbacks.onError) this.callbacks.onError(new Error(errorMsg));
      return false;
    }

    this.isTracking = true;
    await this.requestWakeLock();

    const geoOptions = {
      enableHighAccuracy: true, // Máxima precisión GPS por hardware
      timeout: 4500,            // Espera máxima por lectura
      maximumAge: 0             // No usar posiciones en caché
    };

    // 1. Escuchar activamente el sensor GPS del dispositivo
    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handleGeoSuccess(position),
      (error) => this.handleGeoError(error),
      geoOptions
    );

    // 2. Temporizador estricto de envío a Firebase cada 1000 milisegundos (1 segundo)
    this.intervalId = setInterval(() => {
      this.transmitToFirebase();
    }, this.updateIntervalMs);

    // Primer disparo inmediato
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.handleGeoSuccess(position);
        this.transmitToFirebase();
      },
      (error) => this.handleGeoError(error),
      geoOptions
    );

    return true;
  }

  // Detener el rastreo
  stopTracking() {
    this.isTracking = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.releaseWakeLock();

    // Actualizar estado en Firebase a offline
    this.markDeviceOffline();
  }

  // Manejo de lectura exitosa del GPS
  handleGeoSuccess(position) {
    const coords = position.coords;
    const speedMs = coords.speed !== null && coords.speed >= 0 ? coords.speed : 0;
    const speedKmH = (speedMs * 3.6).toFixed(1);

    this.currentTelemetry.latitude = coords.latitude;
    this.currentTelemetry.longitude = coords.longitude;
    this.currentTelemetry.accuracy = coords.accuracy ? Math.round(coords.accuracy * 10) / 10 : null;
    this.currentTelemetry.altitude = coords.altitude !== null ? Math.round(coords.altitude * 10) / 10 : null;
    this.currentTelemetry.altitudeAccuracy = coords.altitudeAccuracy ? Math.round(coords.altitudeAccuracy * 10) / 10 : null;
    this.currentTelemetry.speed = speedMs;
    this.currentTelemetry.speedKmH = parseFloat(speedKmH);
    this.currentTelemetry.heading = coords.heading !== null && !isNaN(coords.heading) ? Math.round(coords.heading) : null;
    this.currentTelemetry.timestamp = new Date(position.timestamp).toISOString();
    this.currentTelemetry.rawTimestamp = position.timestamp;

    if (this.callbacks.onTelemetryUpdate) {
      this.callbacks.onTelemetryUpdate(this.currentTelemetry);
    }
  }

  handleGeoError(error) {
    let msg = 'Error desconocido al obtener GPS';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        msg = 'Permiso de ubicación denegado por el usuario. Habilita el GPS en tu navegador o móvil.';
        break;
      case error.POSITION_UNAVAILABLE:
        msg = 'Información de ubicación no disponible. Verifica que el GPS esté encendido.';
        break;
      case error.TIMEOUT:
        msg = 'Tiempo de espera agotado al consultar el sensor GPS.';
        break;
    }
    console.error('Error GPS:', msg, error);
    if (this.callbacks.onError) {
      this.callbacks.onError(new Error(msg));
    }
  }

  // Envía el paquete de datos a Cloud Firestore (DaaS)
  async transmitToFirebase() {
    // Si aún no tenemos coordenadas GPS válidas, no transmitir basura
    if (this.currentTelemetry.latitude === null || this.currentTelemetry.longitude === null) {
      return;
    }

    const payload = {
      deviceId: this.deviceId,
      latitude: this.currentTelemetry.latitude,
      longitude: this.currentTelemetry.longitude,
      accuracy: this.currentTelemetry.accuracy,
      altitude: this.currentTelemetry.altitude,
      altitudeAccuracy: this.currentTelemetry.altitudeAccuracy,
      speed: this.currentTelemetry.speed,
      speedKmH: this.currentTelemetry.speedKmH,
      heading: this.currentTelemetry.heading,
      batteryLevel: this.currentTelemetry.batteryLevel,
      batteryCharging: this.currentTelemetry.batteryCharging,
      orientation: this.currentTelemetry.orientation,
      isOnline: navigator.onLine,
      timestamp: new Date().toISOString(),
      updatedAtEpoch: Date.now(),
      updateIntervalMs: this.updateIntervalMs
    };

    // Si no hay conexión a internet, guardar de inmediato en la cola local para no perder el punto
    if (!navigator.onLine) {
      this.queueOfflinePoint(payload);
      this.currentTelemetry.pingsSent++;
      if (this.callbacks.onTransmissionSuccess) {
        this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent, false, true);
      }
      return;
    }

    try {
      const db = window.FirebaseManager.getFirestoreDb();
      if (db) {
        // 1. Actualiza el estado actual del dispositivo (escuchado en tiempo real con onSnapshot)
        const deviceRef = db.collection('dispositivos').doc(this.deviceId);
        await deviceRef.set({
          ...payload,
          status: 'online'
        }, { merge: true });

        // 2. Guarda el punto en el historial para trazar la ruta en Google Maps
        await deviceRef.collection('historial').add({
          lat: payload.latitude,
          lng: payload.longitude,
          speedKmH: payload.speedKmH,
          accuracy: payload.accuracy,
          altitude: payload.altitude,
          heading: payload.heading,
          timestamp: payload.timestamp,
          epoch: payload.updatedAtEpoch
        });

        this.currentTelemetry.pingsSent++;
        if (this.callbacks.onTransmissionSuccess) {
          this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent, false, false);
        }

        // Si había puntos acumulados previamente mientras estuvo offline, sincronizarlos
        if (this.offlineQueue.length > 0) {
          this.flushOfflineQueue();
        }
      } else {
        // Modo simulador local
        this.currentTelemetry.pingsSent++;
        if (this.callbacks.onTransmissionSuccess) {
          this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent, true, false);
        }
      }
    } catch (err) {
      console.warn('Fallo de red al transmitir a Firebase. Guardando en cola offline:', err);
      // Guardar en cola para no perder datos por micro-cortes de red
      this.queueOfflinePoint(payload);
      this.currentTelemetry.pingsSent++;
      if (this.callbacks.onTransmissionSuccess) {
        this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent, false, true);
      }
    }
  }

  // Sincroniza progresivamente todos los puntos acumulados cuando vuelve internet
  async flushOfflineQueue() {
    if (!navigator.onLine || this.offlineQueue.length === 0) return;

    const db = window.FirebaseManager.getFirestoreDb();
    if (!db) return;

    const pointsToSync = [...this.offlineQueue];
    const totalToSync = pointsToSync.length;
    console.log(`[Offline Sync] Sincronizando ${totalToSync} puntos acumulados...`);

    try {
      const deviceRef = db.collection('dispositivos').doc(this.deviceId);

      // Enviar en bloques (batches) de hasta 100 puntos
      const batchSize = 100;
      for (let i = 0; i < pointsToSync.length; i += batchSize) {
        const batch = db.batch();
        const chunk = pointsToSync.slice(i, i + batchSize);

        chunk.forEach(pt => {
          const docRef = deviceRef.collection('historial').doc();
          batch.set(docRef, {
            lat: pt.latitude,
            lng: pt.longitude,
            speedKmH: pt.speedKmH,
            accuracy: pt.accuracy,
            altitude: pt.altitude,
            heading: pt.heading,
            timestamp: pt.timestamp,
            epoch: pt.updatedAtEpoch,
            syncedFromOffline: true
          });
        });

        await batch.commit();
      }

      // Vaciar cola una vez confirmada la subida
      this.offlineQueue = [];
      this.saveOfflineQueue();

      if (this.callbacks.onOfflineSynced) {
        this.callbacks.onOfflineSynced(totalToSync);
      }
      if (this.callbacks.onOfflineQueueUpdate) {
        this.callbacks.onOfflineQueueUpdate(0);
      }
    } catch (syncErr) {
      console.warn('[Offline Sync] Error al sincronizar cola con Firestore:', syncErr);
    }
  }

  async markDeviceOffline() {
    try {
      const db = window.FirebaseManager.getFirestoreDb();
      if (db) {
        await db.collection('dispositivos').doc(this.deviceId).set({
          status: 'offline',
          lastSeen: new Date().toISOString()
        }, { merge: true });
      }
    } catch (e) {
      console.warn('No se pudo marcar dispositivo como offline:', e);
    }
  }
}

window.GPSTracker = GPSTracker;

