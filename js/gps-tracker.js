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

    this.wakeLock = null;
    this.battery = null;
    this.callbacks = {
      onTelemetryUpdate: null,
      onTransmissionSuccess: null,
      onError: null
    };

    this.initSensors();
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

    // 3. Sensor de Conexión de Red
    window.addEventListener('online', () => { this.currentTelemetry.isOnline = true; });
    window.addEventListener('offline', () => { this.currentTelemetry.isOnline = false; });
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
        // Para optimizar lecturas/escrituras en Firestore, guardamos en la subcolección 'historial'
        deviceRef.collection('historial').add({
          lat: payload.latitude,
          lng: payload.longitude,
          speedKmH: payload.speedKmH,
          accuracy: payload.accuracy,
          altitude: payload.altitude,
          heading: payload.heading,
          timestamp: payload.timestamp,
          epoch: payload.updatedAtEpoch
        }).catch(err => console.warn('Historial write error:', err));

        this.currentTelemetry.pingsSent++;
        if (this.callbacks.onTransmissionSuccess) {
          this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent);
        }
      } else {
        // Modo simulador local o Firestore no disponible
        this.currentTelemetry.pingsSent++;
        if (this.callbacks.onTransmissionSuccess) {
          this.callbacks.onTransmissionSuccess(payload, this.currentTelemetry.pingsSent, true);
        }
      }
    } catch (err) {
      console.error('Error al transmitir a Firebase Firestore:', err);
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
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
