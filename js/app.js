/**
 * Controlador Principal de la Aplicación
 * Conecta UI, GPSTracker, MapMonitor y FirebaseManager
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Instancias principales
  const tracker = new GPSTracker();
  const monitor = new MapMonitor('map');

  // Elementos DOM - Tabs y Vistas
  const tabEmitter = document.getElementById('tab-emitter');
  const tabMonitor = document.getElementById('tab-monitor');
  const viewEmitter = document.getElementById('view-emitter');
  const viewMonitor = document.getElementById('view-monitor');

  // Elementos DOM - Emisor
  const btnToggleTracking = document.getElementById('btn-toggle-tracking');
  const emitterDeviceIdInput = document.getElementById('emitter-device-id');
  const emitterStatusBadge = document.getElementById('emitter-status-badge');
  const pingCounterEl = document.getElementById('ping-counter');
  const emitterHeartbeat = document.getElementById('emitter-heartbeat');

  // Telemetría Emisor
  const emLat = document.getElementById('em-lat');
  const emLng = document.getElementById('em-lng');
  const emAcc = document.getElementById('em-acc');
  const emSpeed = document.getElementById('em-speed');
  const emAlt = document.getElementById('em-alt');
  const emHeading = document.getElementById('em-heading');
  const emBattery = document.getElementById('em-battery');
  const emOrientation = document.getElementById('em-orientation');
  const emLastUpdate = document.getElementById('em-last-update');

  // Elementos DOM - Monitor
  const monitorDeviceIdInput = document.getElementById('monitor-device-id');
  const btnConnectMonitor = document.getElementById('btn-connect-monitor');
  const monitorStatusBadge = document.getElementById('monitor-status-badge');
  const btnAutoCenter = document.getElementById('btn-auto-center');
  const btnClearTrail = document.getElementById('btn-clear-trail');
  const mapEngineSelect = document.getElementById('map-engine-select');

  // Telemetría Monitor
  const monLat = document.getElementById('mon-lat');
  const monLng = document.getElementById('mon-lng');
  const monSpeed = document.getElementById('mon-speed');
  const monHeading = document.getElementById('mon-heading');
  const monAlt = document.getElementById('mon-alt');
  const monAcc = document.getElementById('mon-acc');
  const monDistance = document.getElementById('mon-distance');
  const monBattery = document.getElementById('mon-battery');
  const monLastSeen = document.getElementById('mon-last-seen');
  const telemetryTableBody = document.getElementById('telemetry-table-body');

  // Simulación Demo
  const btnToggleSim = document.getElementById('btn-toggle-sim');
  let simInterval = null;
  let isSimulating = false;

  // Modal de Configuración
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const formSettings = document.getElementById('form-settings');
  const inputApiKey = document.getElementById('cfg-api-key');
  const inputProjectId = document.getElementById('cfg-project-id');
  const inputGoogleMapsKey = document.getElementById('cfg-google-maps-key');

  // Inicializar Firebase
  const fbInitResult = window.FirebaseManager.initFirebase();
  if (fbInitResult.success) {
    showToast('Firebase Firestore conectado (Proyecto: appmovil-67ee7)', 'success');
  } else {
    showToast('Advertencia: Revisa la configuración de Firebase en Ajustes', 'warning');
  }

  // Inicializar ID de Dispositivo en inputs
  emitterDeviceIdInput.value = tracker.deviceId;
  monitorDeviceIdInput.value = tracker.deviceId;

  // Inicializar Mapa
  await monitor.initMap();
  monitor.startRealtimeListener(tracker.deviceId);

  // Sincronizar selector de motor de mapa
  mapEngineSelect.value = monitor.engine;

  // -------------------------------------------------------------------------
  // Manejadores de Pestañas (Modo Emisor vs Modo Monitor)
  // -------------------------------------------------------------------------
  tabEmitter.addEventListener('click', () => {
    tabEmitter.classList.add('active');
    tabMonitor.classList.remove('active');
    viewEmitter.classList.remove('hidden');
    viewMonitor.classList.add('hidden');
  });

  tabMonitor.addEventListener('click', () => {
    tabMonitor.classList.add('active');
    tabEmitter.classList.remove('active');
    viewMonitor.classList.remove('hidden');
    viewEmitter.classList.add('hidden');
    // Asegurar redimensionamiento correcto del mapa
    setTimeout(() => {
      if (monitor.map && monitor.engine === 'leaflet') {
        monitor.map.invalidateSize();
      }
    }, 200);
  });

  // Cambio de ID de Dispositivo en Emisor
  emitterDeviceIdInput.addEventListener('change', () => {
    tracker.setDeviceId(emitterDeviceIdInput.value);
    monitorDeviceIdInput.value = tracker.deviceId;
    showToast(`ID de dispositivo emisor actualizado: ${tracker.deviceId}`, 'info');
  });

  // -------------------------------------------------------------------------
  // Control de Transmisión GPS (1000 ms)
  // -------------------------------------------------------------------------
  btnToggleTracking.addEventListener('click', async () => {
    if (!tracker.isTracking) {
      btnToggleTracking.disabled = true;
      btnToggleTracking.innerHTML = '<span class="spinner"></span> Iniciando Sensores...';
      
      const started = await tracker.startTracking();
      btnToggleTracking.disabled = false;

      if (started) {
        btnToggleTracking.innerHTML = '<i class="fas fa-stop-circle"></i> Detener Transmisión GPS';
        btnToggleTracking.classList.remove('btn-primary');
        btnToggleTracking.classList.add('btn-danger');
        emitterStatusBadge.className = 'badge badge-success';
        emitterStatusBadge.textContent = '● Transmitiendo (1000ms)';
        emitterHeartbeat.classList.add('pulse-active');
        showToast('Transmisión GPS activada. Enviando a Firebase cada 1000ms', 'success');
      } else {
        btnToggleTracking.innerHTML = '<i class="fas fa-satellite-dish"></i> Iniciar Transmisión GPS (1000ms)';
      }
    } else {
      tracker.stopTracking();
      btnToggleTracking.innerHTML = '<i class="fas fa-satellite-dish"></i> Iniciar Transmisión GPS (1000ms)';
      btnToggleTracking.classList.remove('btn-danger');
      btnToggleTracking.classList.add('btn-primary');
      emitterStatusBadge.className = 'badge badge-offline';
      emitterStatusBadge.textContent = '○ Detenido';
      emitterHeartbeat.classList.remove('pulse-active');
      showToast('Transmisión detenida.', 'info');
    }
  });

  // Callbacks del Tracker (Emisor)
  tracker.callbacks.onTelemetryUpdate = (telemetry) => {
    if (telemetry.latitude !== null) emLat.textContent = telemetry.latitude.toFixed(6);
    if (telemetry.longitude !== null) emLng.textContent = telemetry.longitude.toFixed(6);
    emAcc.textContent = telemetry.accuracy !== null ? `±${telemetry.accuracy} m` : '--';
    emSpeed.textContent = `${telemetry.speedKmH} km/h`;
    emAlt.textContent = telemetry.altitude !== null ? `${telemetry.altitude} m` : 'N/D';
    emHeading.textContent = telemetry.heading !== null ? `${telemetry.heading}° (${formatHeadingToCardinal(telemetry.heading)})` : 'N/D';
    
    if (telemetry.batteryLevel !== null) {
      emBattery.textContent = `${telemetry.batteryLevel}% ${telemetry.batteryCharging ? '⚡ (Cargando)' : ''}`;
    }
    
    if (telemetry.orientation && telemetry.orientation.alpha !== null) {
      emOrientation.textContent = `α:${telemetry.orientation.alpha}° β:${telemetry.orientation.beta}° γ:${telemetry.orientation.gamma}°`;
    }

    emLastUpdate.textContent = new Date().toLocaleTimeString();
  };

  tracker.callbacks.onTransmissionSuccess = (payload, pings, isSimulated) => {
    pingCounterEl.textContent = pings;
    emitterHeartbeat.classList.add('flash-ping');
    setTimeout(() => emitterHeartbeat.classList.remove('flash-ping'), 250);
  };

  tracker.callbacks.onError = (err) => {
    showToast(`Error de GPS: ${err.message}`, 'error');
  };

  // -------------------------------------------------------------------------
  // Control del Monitor en Tiempo Real (Receptor / Mapa)
  // -------------------------------------------------------------------------
  btnConnectMonitor.addEventListener('click', () => {
    const idToTrack = monitorDeviceIdInput.value.trim();
    if (idToTrack) {
      monitor.clearPath();
      monitor.startRealtimeListener(idToTrack);
      monitorStatusBadge.className = 'badge badge-success';
      monitorStatusBadge.textContent = `● Conectado a ${idToTrack}`;
      showToast(`Escuchando en tiempo real: ${idToTrack}`, 'success');
    }
  });

  btnAutoCenter.addEventListener('click', () => {
    monitor.autoCenter = !monitor.autoCenter;
    btnAutoCenter.classList.toggle('active', monitor.autoCenter);
    showToast(monitor.autoCenter ? 'Auto-centrado activado' : 'Auto-centrado desactivado', 'info');
  });

  btnClearTrail.addEventListener('click', () => {
    monitor.clearPath();
    monDistance.textContent = '0 m';
    telemetryTableBody.innerHTML = '';
    showToast('Rastro del mapa limpiado', 'info');
  });

  mapEngineSelect.addEventListener('change', async () => {
    const selectedEngine = mapEngineSelect.value;
    if (selectedEngine === 'google' && !monitor.googleMapsApiKey) {
      showToast('Para usar Google Maps API, debes ingresar tu Google Maps Key en Ajustes', 'warning');
      openSettingsModal();
      return;
    }
    await monitor.setEngine(selectedEngine);
    showToast(`Motor de mapa cambiado a: ${selectedEngine.toUpperCase()}`, 'info');
  });

  // Callback del Monitor (Receptor)
  monitor.callbacks.onTelemetryReceived = (data) => {
    monLat.textContent = data.latitude ? data.latitude.toFixed(6) : '--';
    monLng.textContent = data.longitude ? data.longitude.toFixed(6) : '--';
    monSpeed.textContent = `${data.speedKmH || 0} km/h`;
    monHeading.textContent = data.heading !== null && data.heading !== undefined ? `${data.heading}° (${formatHeadingToCardinal(data.heading)})` : '--';
    monAlt.textContent = data.altitude !== null && data.altitude !== undefined ? `${data.altitude} m` : '--';
    monAcc.textContent = data.accuracy ? `±${data.accuracy} m` : '--';
    monDistance.textContent = data.totalDistanceMeters > 1000 
      ? `${(data.totalDistanceMeters / 1000).toFixed(2)} km` 
      : `${data.totalDistanceMeters} m`;
    monBattery.textContent = data.batteryLevel !== null && data.batteryLevel !== undefined ? `${data.batteryLevel}%` : 'N/D';
    monLastSeen.textContent = new Date(data.updatedAtEpoch || Date.now()).toLocaleTimeString();

    // Agregar fila a la tabla de telemetría en tiempo real
    prependTelemetryRow(data);
  };

  function prependTelemetryRow(data) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td>${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}</td>
      <td><span class="speed-pill">${data.speedKmH || 0} km/h</span></td>
      <td>±${data.accuracy || '--'}m</td>
      <td>${data.batteryLevel !== null && data.batteryLevel !== undefined ? data.batteryLevel + '%' : '--'}</td>
    `;
    telemetryTableBody.insertBefore(tr, telemetryTableBody.firstChild);
    // Mantener máximo 20 filas en tabla para alto rendimiento
    if (telemetryTableBody.children.length > 20) {
      telemetryTableBody.removeChild(telemetryTableBody.lastChild);
    }
  }

  // -------------------------------------------------------------------------
  // Simulador GPS en Tiempo Real (Para pruebas sin salir a la calle)
  // -------------------------------------------------------------------------
  btnToggleSim.addEventListener('click', () => {
    if (!isSimulating) {
      startSimulation();
    } else {
      stopSimulation();
    }
  });

  function startSimulation() {
    isSimulating = true;
    btnToggleSim.innerHTML = '<i class="fas fa-pause"></i> Detener Simulación';
    btnToggleSim.classList.add('btn-warning');
    showToast('Simulador GPS iniciado. Generando movimiento cada 1000ms', 'info');

    let simLat = 4.7110;
    let simLng = -74.0721;
    let heading = 45;
    let speed = 15; // km/h

    simInterval = setInterval(() => {
      // Movimiento simulado suave
      const step = 0.00015;
      heading = (heading + (Math.random() * 20 - 10)) % 360;
      const rad = (heading * Math.PI) / 180;
      simLat += Math.cos(rad) * step;
      simLng += Math.sin(rad) * step;
      speed = Math.max(5, Math.min(60, speed + (Math.random() * 4 - 2)));

      const simData = {
        deviceId: tracker.deviceId,
        latitude: simLat,
        longitude: simLng,
        accuracy: Math.floor(3 + Math.random() * 5),
        altitude: 2600 + Math.floor(Math.random() * 5),
        speed: speed / 3.6,
        speedKmH: parseFloat(speed.toFixed(1)),
        heading: Math.round(heading),
        batteryLevel: 88,
        batteryCharging: false,
        orientation: { alpha: Math.round(heading), beta: 12, gamma: -3 },
        isOnline: true,
        timestamp: new Date().toISOString(),
        updatedAtEpoch: Date.now(),
        updateIntervalMs: 1000
      };

      // Si Firestore está listo, enviarlo
      const db = window.FirebaseManager.getFirestoreDb();
      if (db) {
        db.collection('dispositivos').doc(tracker.deviceId).set(simData, { merge: true });
        db.collection('dispositivos').doc(tracker.deviceId).collection('historial').add({
          lat: simLat,
          lng: simLng,
          speedKmH: simData.speedKmH,
          timestamp: simData.timestamp,
          epoch: simData.updatedAtEpoch
        }).catch(() => {});
      } else {
        // Enviar directo al monitor
        monitor.handleRealtimeData(simData);
      }

      tracker.handleGeoSuccess({
        coords: {
          latitude: simLat,
          longitude: simLng,
          accuracy: simData.accuracy,
          altitude: simData.altitude,
          altitudeAccuracy: 3,
          speed: simData.speed,
          heading: simData.heading
        },
        timestamp: simData.updatedAtEpoch
      });

    }, 1000);
  }

  function stopSimulation() {
    isSimulating = false;
    if (simInterval) clearInterval(simInterval);
    btnToggleSim.innerHTML = '<i class="fas fa-play"></i> Simular Movimiento GPS';
    btnToggleSim.classList.remove('btn-warning');
    showToast('Simulación detenida', 'info');
  }

  // -------------------------------------------------------------------------
  // Modal de Configuración
  // -------------------------------------------------------------------------
  btnOpenSettings.addEventListener('click', openSettingsModal);
  btnCloseSettings.addEventListener('click', closeSettingsModal);

  function openSettingsModal() {
    const curCfg = window.FirebaseManager.getActiveFirebaseConfig();
    inputApiKey.value = curCfg.apiKey;
    inputProjectId.value = curCfg.projectId;
    inputGoogleMapsKey.value = monitor.googleMapsApiKey;
    settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    settingsModal.classList.add('hidden');
  }

  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updatedFb = {
      apiKey: inputApiKey.value,
      projectId: inputProjectId.value
    };
    window.FirebaseManager.saveFirebaseConfig(updatedFb);

    const gKey = inputGoogleMapsKey.value.trim();
    if (gKey) {
      await monitor.setEngine('google', gKey);
      mapEngineSelect.value = 'google';
    }

    closeSettingsModal();
    showToast('Configuraciones guardadas y aplicadas', 'success');
  });

  // Helpers
  function formatHeadingToCardinal(deg) {
    if (deg === null || deg === undefined) return '--';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const idx = Math.round(deg / 45) % 8;
    return directions[idx];
  }

  function showToast(msg, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }
});
