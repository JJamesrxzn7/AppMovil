/**
 * Controlador Principal de la Aplicación Móvil
 * Integra UX Mobile-First, GPSTracker, MapMonitor y Firebase Firestore
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Instancias principales
  const tracker = new GPSTracker();
  const monitor = new MapMonitor('map');

  // Elementos DOM - Header y Estado
  const appStatusPill = document.getElementById('app-status-pill');
  const statusText = document.getElementById('status-text');
  const heartbeatBadge = document.getElementById('heartbeat-badge');

  // Elementos DOM - Botones Flotantes (FABs)
  const btnLocateMe = document.getElementById('btn-locate-me');
  const btnToggleEngine = document.getElementById('btn-toggle-engine');
  const btnClearTrail = document.getElementById('btn-clear-trail');
  const btnToggleSim = document.getElementById('btn-toggle-sim');

  // Elementos DOM - Bottom Sheet
  const bottomSheet = document.getElementById('mobile-bottom-sheet');
  const sheetHandle = document.getElementById('sheet-handle');
  const sheetDragTitle = document.getElementById('sheet-drag-title');
  const btnToggleTracking = document.getElementById('btn-toggle-tracking');

  // Telemetría Rápida (Compacta)
  const quickSpeed = document.getElementById('quick-speed');
  const quickAccuracy = document.getElementById('quick-accuracy');
  const quickBattery = document.getElementById('quick-battery');
  const quickPings = document.getElementById('quick-pings');

  // Telemetría Detallada (Expandida)
  const detLat = document.getElementById('det-lat');
  const detLng = document.getElementById('det-lng');
  const detAltitude = document.getElementById('det-altitude');
  const detHeading = document.getElementById('det-heading');
  const detDistance = document.getElementById('det-distance');
  const detOrientation = document.getElementById('det-orientation');
  const telemetryTimestamp = document.getElementById('telemetry-timestamp');
  const telemetryTableBody = document.getElementById('telemetry-table-body');

  // Modo Selector (Local vs Remoto)
  const modeBtnLocal = document.getElementById('mode-btn-local');
  const modeBtnRemote = document.getElementById('mode-btn-remote');
  const activeDeviceIdInput = document.getElementById('active-device-id');
  const btnSaveDeviceId = document.getElementById('btn-save-device-id');
  let isTrackingRemote = false;

  // Modal de Ajustes
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const formSettings = document.getElementById('form-settings');
  const inputProjectId = document.getElementById('cfg-project-id');
  const inputApiKey = document.getElementById('cfg-api-key');
  const inputGoogleMapsKey = document.getElementById('cfg-google-maps-key');
  const selectEngine = document.getElementById('cfg-engine-select');

  // Estado del simulador
  let simInterval = null;
  let isSimulating = false;

  // -------------------------------------------------------------------------
  // 1. INICIALIZACIÓN
  // -------------------------------------------------------------------------
  // Sincronizar ID de dispositivo
  activeDeviceIdInput.value = tracker.deviceId;

  // Inicializar Firebase
  const fbResult = window.FirebaseManager.initFirebase();
  if (fbResult.success) {
    showToast('Firebase conectado (appmovil-67ee7)', 'success');
  }

  // Inicializar Mapa y Localizar al Usuario Inmediatamente
  await monitor.initMap();

  // Escuchar cuando se detecte la ubicación del usuario
  monitor.callbacks.onUserLocated = (coords) => {
    appStatusPill.className = 'status-indicator online';
    statusText.textContent = `Ubicación lista (±${Math.round(coords.accuracy)}m)`;
    quickAccuracy.textContent = `±${Math.round(coords.accuracy)}m`;
    detLat.textContent = coords.latitude.toFixed(6);
    detLng.textContent = coords.longitude.toFixed(6);
    showToast('📍 ¡Ubicación GPS actual detectada en el mapa!', 'success');
  };

  // -------------------------------------------------------------------------
  // 2. BOTONES FLOTANTES DE ACCIÓN RÁPIDA (FABs)
  // -------------------------------------------------------------------------
  // Centrar en Mi Ubicación
  btnLocateMe.addEventListener('click', () => {
    monitor.centerOnUser();
    showToast('Centrado en tu ubicación GPS', 'info');
  });

  // Alternar Estilo de Mapa (Google Calles, Google Satélite Híbrido, ESRI)
  btnToggleEngine.addEventListener('click', async () => {
    if (monitor.engine === 'leaflet') {
      const styleName = monitor.cycleTileStyle();
      if (styleName) {
        showToast(`🗺️ Capa de mapa: ${styleName}`, 'info');
      }
    } else {
      await monitor.setEngine('leaflet');
      showToast('🗺️ Capa: Google Maps (Calles y Avenidas)', 'info');
    }
  });

  // Limpiar Rastro
  btnClearTrail.addEventListener('click', () => {
    monitor.clearPath();
    detDistance.textContent = '0 m';
    telemetryTableBody.innerHTML = '';
    showToast('Rastro de ruta limpiado', 'info');
  });

  // Simulador de Movimiento GPS
  btnToggleSim.addEventListener('click', () => {
    if (!isSimulating) {
      startSimulator();
    } else {
      stopSimulator();
    }
  });

  // -------------------------------------------------------------------------
  // 3. CONTROL DEL BOTTOM SHEET (DESPLIEGUE ERGONÓMICO)
  // -------------------------------------------------------------------------
  sheetHandle.addEventListener('click', () => {
    toggleBottomSheet();
  });

  function toggleBottomSheet() {
    const isCollapsed = bottomSheet.classList.contains('collapsed');
    if (isCollapsed) {
      bottomSheet.classList.remove('collapsed');
      bottomSheet.classList.add('expanded');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-down"></i> Toca para minimizar';
    } else {
      bottomSheet.classList.remove('expanded');
      bottomSheet.classList.add('collapsed');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-up"></i> Toca para ver telemetría completa';
    }
  }

  // -------------------------------------------------------------------------
  // 4. INICIAR / DETENER TRANSMISIÓN GPS (1000 ms)
  // -------------------------------------------------------------------------
  btnToggleTracking.addEventListener('click', async () => {
    if (!tracker.isTracking) {
      btnToggleTracking.disabled = true;
      btnToggleTracking.innerHTML = '<span class="spinner"></span> Activando GPS...';

      const ok = await tracker.startTracking();
      btnToggleTracking.disabled = false;

      if (ok) {
        btnToggleTracking.classList.add('active-transmitting');
        btnToggleTracking.innerHTML = '<i class="fas fa-stop-circle"></i> Detener Transmisión GPS';
        appStatusPill.className = 'status-indicator online';
        statusText.textContent = 'Transmitiendo (1000ms)';
        heartbeatBadge.classList.add('active');
        showToast('📡 Transmisión iniciada: Enviando a Firestore cada 1000ms', 'success');

        // Escuchar también en tiempo real en el mapa si no es remoto
        if (!isTrackingRemote) {
          monitor.startRealtimeListener(tracker.deviceId);
        }
      } else {
        btnToggleTracking.innerHTML = '<i class="fas fa-satellite-dish"></i> Iniciar Transmisión GPS (1000ms)';
      }
    } else {
      tracker.stopTracking();
      btnToggleTracking.classList.remove('active-transmitting');
      btnToggleTracking.innerHTML = '<i class="fas fa-satellite-dish"></i> Iniciar Transmisión GPS (1000ms)';
      appStatusPill.className = 'status-indicator';
      statusText.textContent = 'Transmisión Detenida';
      heartbeatBadge.classList.remove('active');
      showToast('Transmisión GPS detenida', 'info');
    }
  });

  // Callbacks del Tracker de Sensores (Local)
  tracker.callbacks.onTelemetryUpdate = (telemetry) => {
    // Actualizar vista rápida
    quickSpeed.textContent = `${telemetry.speedKmH} km/h`;
    quickAccuracy.textContent = telemetry.accuracy ? `±${telemetry.accuracy}m` : '--';
    if (telemetry.batteryLevel !== null) {
      quickBattery.textContent = `${telemetry.batteryLevel}%`;
    }

    // Actualizar vista detallada
    if (telemetry.latitude !== null) detLat.textContent = telemetry.latitude.toFixed(6);
    if (telemetry.longitude !== null) detLng.textContent = telemetry.longitude.toFixed(6);
    detAltitude.textContent = telemetry.altitude !== null ? `${telemetry.altitude} m` : 'N/D';
    detHeading.textContent = telemetry.heading !== null 
      ? `${telemetry.heading}° (${formatHeadingToCardinal(telemetry.heading)})` 
      : 'N/D';

    if (telemetry.orientation && telemetry.orientation.alpha !== null) {
      detOrientation.textContent = `α:${telemetry.orientation.alpha}° β:${telemetry.orientation.beta}° γ:${telemetry.orientation.gamma}°`;
    }

    telemetryTimestamp.textContent = new Date().toLocaleTimeString();

    // Actualizar mapa localmente de inmediato mientras se transmite
    if (!isTrackingRemote && telemetry.latitude && telemetry.longitude) {
      monitor.addPointToPath(telemetry.latitude, telemetry.longitude, true);
      monitor.updateMarkerPosition(
        telemetry.latitude, 
        telemetry.longitude, 
        telemetry.heading || 0, 
        telemetry.accuracy || 15
      );
      if (monitor.autoCenter) {
        monitor.panToLocation(telemetry.latitude, telemetry.longitude);
      }
    }
  };

  tracker.callbacks.onTransmissionSuccess = (payload, pings) => {
    quickPings.textContent = pings;
    heartbeatBadge.classList.add('flash');
    setTimeout(() => heartbeatBadge.classList.remove('flash'), 250);

    // Agregar fila a la tabla de historial
    appendTelemetryTableRow(payload);
  };

  tracker.callbacks.onError = (err) => {
    showToast(`Error de GPS: ${err.message}`, 'error');
  };

  // -------------------------------------------------------------------------
  // 5. CALLBACk DEL MAPA Y MODO REMOTO
  // -------------------------------------------------------------------------
  monitor.callbacks.onTelemetryReceived = (data) => {
    if (isTrackingRemote) {
      quickSpeed.textContent = `${data.speedKmH || 0} km/h`;
      quickAccuracy.textContent = data.accuracy ? `±${data.accuracy}m` : '--';
      if (data.batteryLevel !== null && data.batteryLevel !== undefined) {
        quickBattery.textContent = `${data.batteryLevel}%`;
      }
      detLat.textContent = data.latitude ? data.latitude.toFixed(6) : '--';
      detLng.textContent = data.longitude ? data.longitude.toFixed(6) : '--';
      detAltitude.textContent = data.altitude ? `${data.altitude} m` : '--';
      detHeading.textContent = data.heading !== undefined ? `${data.heading}°` : '--';
      detDistance.textContent = data.totalDistanceMeters > 1000 
        ? `${(data.totalDistanceMeters / 1000).toFixed(2)} km` 
        : `${data.totalDistanceMeters} m`;
      telemetryTimestamp.textContent = new Date().toLocaleTimeString();
      appendTelemetryTableRow(data);
    }
  };

  // Cambio de Modo (Local vs Remoto)
  modeBtnLocal.addEventListener('click', () => {
    isTrackingRemote = false;
    modeBtnLocal.classList.add('active');
    modeBtnRemote.classList.remove('active');
    monitor.clearPath();
    monitor.locateUserImmediately();
    showToast('Modo: Mi Celular (Transmitir)', 'info');
  });

  modeBtnRemote.addEventListener('click', () => {
    isTrackingRemote = true;
    modeBtnRemote.classList.add('active');
    modeBtnLocal.classList.remove('active');
    const targetId = activeDeviceIdInput.value.trim();
    monitor.clearPath();
    monitor.startRealtimeListener(targetId);
    showToast(`Modo: Monitoreando a ${targetId}`, 'info');
  });

  btnSaveDeviceId.addEventListener('click', () => {
    const newId = activeDeviceIdInput.value.trim();
    if (newId) {
      tracker.setDeviceId(newId);
      if (isTrackingRemote) {
        monitor.startRealtimeListener(newId);
      }
      showToast(`ID de dispositivo: ${newId}`, 'success');
    }
  });

  // -------------------------------------------------------------------------
  // 6. SIMULADOR GPS EN TIEMPO REAL
  // -------------------------------------------------------------------------
  function startSimulator() {
    isSimulating = true;
    btnToggleSim.classList.remove('fab-warning');
    btnToggleSim.classList.add('fab-primary');
    showToast('Simulador activado: Generando trayectoria cada 1000ms', 'info');

    // Posición inicial (del usuario si existe, o Bogotá)
    let lat = monitor.currentUserLocation ? monitor.currentUserLocation.lat : 4.7110;
    let lng = monitor.currentUserLocation ? monitor.currentUserLocation.lng : -74.0721;
    let heading = 60;
    let speed = 25;

    simInterval = setInterval(() => {
      heading = (heading + (Math.random() * 16 - 8)) % 360;
      const rad = (heading * Math.PI) / 180;
      lat += Math.cos(rad) * 0.00015;
      lng += Math.sin(rad) * 0.00015;
      speed = Math.max(10, Math.min(80, speed + (Math.random() * 6 - 3)));

      const simPoint = {
        deviceId: tracker.deviceId,
        latitude: lat,
        longitude: lng,
        accuracy: 4,
        altitude: 2600,
        speed: speed / 3.6,
        speedKmH: parseFloat(speed.toFixed(1)),
        heading: Math.round(heading),
        batteryLevel: 92,
        batteryCharging: false,
        orientation: { alpha: Math.round(heading), beta: 5, gamma: 2 },
        isOnline: true,
        timestamp: new Date().toISOString(),
        updatedAtEpoch: Date.now(),
        updateIntervalMs: 1000
      };

      // Si está en Firebase, guardar
      const db = window.FirebaseManager.getFirestoreDb();
      if (db) {
        db.collection('dispositivos').doc(tracker.deviceId).set(simPoint, { merge: true });
        db.collection('dispositivos').doc(tracker.deviceId).collection('historial').add({
          lat, lng, speedKmH: simPoint.speedKmH, epoch: simPoint.updatedAtEpoch
        }).catch(() => {});
      } else {
        monitor.handleRealtimeData(simPoint);
      }

      tracker.handleGeoSuccess({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 4,
          altitude: 2600,
          altitudeAccuracy: 3,
          speed: simPoint.speed,
          heading: simPoint.heading
        },
        timestamp: simPoint.updatedAtEpoch
      });

      tracker.callbacks.onTransmissionSuccess(simPoint, ++tracker.currentTelemetry.pingsSent);

    }, 1000);
  }

  function stopSimulator() {
    isSimulating = false;
    if (simInterval) clearInterval(simInterval);
    btnToggleSim.classList.add('fab-warning');
    btnToggleSim.classList.remove('fab-primary');
    showToast('Simulador detenido', 'info');
  }

  // -------------------------------------------------------------------------
  // 7. TABLA DE TELEMETRÍA Y HELPERS
  // -------------------------------------------------------------------------
  function appendTelemetryTableRow(data) {
    if (!telemetryTableBody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date().toLocaleTimeString()}</td>
      <td>${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}</td>
      <td><strong style="color: #00f2fe;">${data.speedKmH || 0} km/h</strong></td>
      <td>±${data.accuracy || '--'}m</td>
    `;
    telemetryTableBody.insertBefore(tr, telemetryTableBody.firstChild);
    if (telemetryTableBody.children.length > 20) {
      telemetryTableBody.removeChild(telemetryTableBody.lastChild);
    }
  }

  function formatHeadingToCardinal(deg) {
    if (deg === null || deg === undefined) return '--';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const idx = Math.round(deg / 45) % 8;
    return directions[idx];
  }

  // Modal de Ajustes
  btnOpenSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);

  function openSettings() {
    const curCfg = window.FirebaseManager.getActiveFirebaseConfig();
    inputProjectId.value = curCfg.projectId;
    inputApiKey.value = curCfg.apiKey;
    inputGoogleMapsKey.value = monitor.googleMapsApiKey;
    selectEngine.value = monitor.engine;
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    window.FirebaseManager.saveFirebaseConfig({
      projectId: inputProjectId.value,
      apiKey: inputApiKey.value
    });

    const gKey = inputGoogleMapsKey.value.trim();
    const newEngine = selectEngine.value;
    await monitor.setEngine(newEngine, gKey);

    closeSettings();
    showToast('Ajustes guardados correctamente', 'success');
  });

  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  }
});
