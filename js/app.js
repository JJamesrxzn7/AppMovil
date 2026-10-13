/**
 * Controlador de la Aplicación Móvil de Transmisión (Cliente Móvil)
 * Enfocado 100% en el usuario común: compartir ubicación GPS a Firebase en tiempo real
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Instancias del Tracker de Sensores y del Visualizador de Mapa Local
  const tracker = new GPSTracker();
  const monitor = new MapMonitor('map');

  // Registrar Service Worker para PWA y soporte offline total
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[PWA] Service Worker activo:', reg.scope))
      .catch(err => console.warn('[PWA] Service Worker no registrado:', err));
  }

  // 2. Elementos DOM - Encabezado y Estado
  const appStatusPill = document.getElementById('app-status-pill');
  const statusText = document.getElementById('status-text');
  const heartbeatBadge = document.getElementById('heartbeat-badge');
  const offlineBadge = document.getElementById('offline-badge');
  const offlineCount = document.getElementById('offline-count');

  // 3. Elementos DOM - Botones Flotantes (FABs)
  const btnLocateMe = document.getElementById('btn-locate-me');
  const btnToggleEngine = document.getElementById('btn-toggle-engine');
  const btnClearTrail = document.getElementById('btn-clear-trail');

  // 4. Elementos DOM - Panel Deslizable Inferior (Bottom Sheet)
  const bottomSheet = document.getElementById('mobile-bottom-sheet');
  const sheetHandle = document.getElementById('sheet-handle');
  const sheetDragTitle = document.getElementById('sheet-drag-title');
  const btnToggleTracking = document.getElementById('btn-toggle-tracking');
  const userAliasInput = document.getElementById('user-alias-input');
  const btnSaveAlias = document.getElementById('btn-save-alias');

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

  // 5. Elementos DOM - Modal de Ajustes
  const btnOpenSettings = document.getElementById('btn-open-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const formSettings = document.getElementById('form-settings');
  const inputProjectId = document.getElementById('cfg-project-id');
  const inputApiKey = document.getElementById('cfg-api-key');
  const inputGoogleMapsKey = document.getElementById('cfg-google-maps-key');

  // Cargar Nombre o Alias Guardado
  userAliasInput.value = tracker.deviceName;

  btnSaveAlias.addEventListener('click', () => {
    const alias = userAliasInput.value.trim();
    if (alias) {
      tracker.setDeviceName(alias);
      showToast(`Nombre guardado: "${alias}"`, 'success');
    }
  });

  userAliasInput.addEventListener('change', () => {
    const alias = userAliasInput.value.trim();
    if (alias) {
      tracker.setDeviceName(alias);
      showToast(`Nombre guardado: "${alias}"`, 'success');
    }
  });

  // Inicializar Firebase
  const fbResult = window.FirebaseManager.initFirebase();
  if (fbResult.success) {
    showToast('Firebase conectado (appmovil-67ee7)', 'success');
  }

  // Inicializar Mapa y Localizar al Usuario Automáticamente
  await monitor.initMap();

  monitor.callbacks.onUserLocated = (coords) => {
    appStatusPill.className = 'status-indicator online';
    statusText.textContent = `Ubicación lista (±${Math.round(coords.accuracy)}m)`;
    quickAccuracy.textContent = `±${Math.round(coords.accuracy)}m`;
    detLat.textContent = coords.latitude.toFixed(6);
    detLng.textContent = coords.longitude.toFixed(6);
    showToast('📍 Ubicación GPS detectada en el mapa', 'success');
  };

  // -------------------------------------------------------------------------
  // 6. BOTONES FLOTANTES DE ACCIÓN RÁPIDA (FABs)
  // -------------------------------------------------------------------------
  btnLocateMe.addEventListener('click', () => {
    monitor.centerOnUser();
    showToast('Centrado en tu ubicación', 'info');
  });

  btnToggleEngine.addEventListener('click', async () => {
    const styleName = monitor.cycleTileStyle();
    if (styleName) {
      showToast(`🗺️ Capa de mapa: ${styleName}`, 'info');
    }
  });

  btnClearTrail.addEventListener('click', () => {
    monitor.clearPath();
    detDistance.textContent = '0 m';
    showToast('Rastro de ruta limpiado', 'info');
  });

  // -------------------------------------------------------------------------
  // 7. DESPLIEGUE DEL BOTTOM SHEET ERGONÓMICO
  // -------------------------------------------------------------------------
  sheetHandle.addEventListener('click', () => {
    const isCollapsed = bottomSheet.classList.contains('collapsed');
    if (isCollapsed) {
      bottomSheet.classList.remove('collapsed');
      bottomSheet.classList.add('expanded');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-down"></i> Toca para minimizar';
    } else {
      bottomSheet.classList.remove('expanded');
      bottomSheet.classList.add('collapsed');
      sheetDragTitle.innerHTML = '<i class="fas fa-chevron-up"></i> Toca para ver tus sensores';
    }
  });

  // -------------------------------------------------------------------------
  // 8. INICIAR / DETENER TRANSMISIÓN GPS (1000 ms)
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
        showToast('📡 Transmitiendo ubicación a la nube cada 1000ms', 'success');
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
      showToast('Transmisión detenida', 'info');
    }
  });

  // -------------------------------------------------------------------------
  // 9. CALLBACKS DE TELEMETRÍA Y TOLERANCIA OFFLINE
  // -------------------------------------------------------------------------
  tracker.callbacks.onTelemetryUpdate = (telemetry) => {
    quickSpeed.textContent = `${telemetry.speedKmH} km/h`;
    quickAccuracy.textContent = telemetry.accuracy ? `±${telemetry.accuracy}m` : '--';
    if (telemetry.batteryLevel !== null) {
      quickBattery.textContent = `${telemetry.batteryLevel}%`;
    }

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

    // Actualizar marcador y polilínea en el mapa local
    if (telemetry.latitude && telemetry.longitude) {
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

    if (monitor.totalDistanceMeters) {
      detDistance.textContent = monitor.totalDistanceMeters > 1000 
        ? `${(monitor.totalDistanceMeters / 1000).toFixed(2)} km` 
        : `${Math.round(monitor.totalDistanceMeters)} m`;
    }
  };

  tracker.callbacks.onTransmissionSuccess = (payload, pings, isSimulated, isOffline) => {
    quickPings.textContent = pings;
    heartbeatBadge.classList.add('flash');
    setTimeout(() => heartbeatBadge.classList.remove('flash'), 250);

    if (isOffline) {
      quickPings.style.color = '#f59e0b';
    } else {
      quickPings.style.color = '#ffffff';
    }
  };

  // Tolerancia Offline: Notificación si hay datos guardados localmente
  tracker.callbacks.onOfflineQueueUpdate = (count) => {
    if (count > 0) {
      offlineBadge.classList.remove('hidden');
      offlineCount.textContent = `${count}`;
      appStatusPill.className = 'status-indicator locating';
      statusText.textContent = `Sin Red (${count} en cola)`;
    } else {
      offlineBadge.classList.add('hidden');
      if (tracker.isTracking) {
        appStatusPill.className = 'status-indicator online';
        statusText.textContent = 'Transmitiendo (1000ms)';
      }
    }
  };

  tracker.callbacks.onOfflineSynced = (syncedCount) => {
    showToast(`📶 Conexión restablecida: ¡${syncedCount} puntos guardados subidos a la nube!`, 'success');
    offlineBadge.classList.add('hidden');
    if (tracker.isTracking) {
      appStatusPill.className = 'status-indicator online';
      statusText.textContent = 'Transmitiendo (1000ms)';
    }
  };

  tracker.callbacks.onError = (err) => {
    showToast(`Error de GPS: ${err.message}`, 'error');
  };

  // -------------------------------------------------------------------------
  // 10. MODAL DE AJUSTES Y HELPERS
  // -------------------------------------------------------------------------
  btnOpenSettings.addEventListener('click', () => {
    const curCfg = window.FirebaseManager.getActiveFirebaseConfig();
    inputProjectId.value = curCfg.projectId;
    inputApiKey.value = curCfg.apiKey;
    inputGoogleMapsKey.value = monitor.googleMapsApiKey;
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  formSettings.addEventListener('submit', async (e) => {
    e.preventDefault();
    window.FirebaseManager.saveFirebaseConfig({
      projectId: inputProjectId.value,
      apiKey: inputApiKey.value
    });

    const gKey = inputGoogleMapsKey.value.trim();
    if (gKey) {
      await monitor.setEngine('google', gKey);
    }

    settingsModal.classList.add('hidden');
    showToast('Ajustes guardados correctamente', 'success');
  });

  function formatHeadingToCardinal(deg) {
    if (deg === null || deg === undefined) return '--';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const idx = Math.round(deg / 45) % 8;
    return directions[idx];
  }

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
