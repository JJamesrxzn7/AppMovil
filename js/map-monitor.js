/**
 * Módulo de Monitoreo en Tiempo Real sobre Mapa
 * Integra Google Maps JavaScript API con motor alternativo Leaflet (OpenStreetMap)
 * Escucha cambios en tiempo real desde Firebase Firestore (DaaS) vía onSnapshot
 */

class MapMonitor {
  constructor(containerId = 'map') {
    this.containerId = containerId;
    this.engine = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.MAP_ENGINE) || 'leaflet'; // 'google' | 'leaflet'
    this.googleMapsApiKey = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.GOOGLE_MAPS_KEY) || '';
    
    this.map = null;
    this.marker = null;
    this.accuracyCircle = null;
    this.polyline = null;
    this.pathCoordinates = [];
    this.autoCenter = true;

    // Estado del rastreo en tiempo real
    this.activeDeviceId = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID) || 'Movil-GPS-1001';
    this.firestoreUnsubscribe = null;
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;

    this.callbacks = {
      onTelemetryReceived: null,
      onStatusChange: null
    };
  }

  // Cambia el motor de mapa (Google Maps <-> Leaflet)
  async setEngine(newEngine, apiKey = '') {
    this.engine = newEngine;
    if (apiKey) {
      this.googleMapsApiKey = apiKey;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.GOOGLE_MAPS_KEY, apiKey);
    }
    localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.MAP_ENGINE, newEngine);
    await this.initMap();
  }

  // Inicializa el mapa según el motor seleccionado
  async initMap() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    // Limpiar contenedor
    container.innerHTML = '';
    this.pathCoordinates = [];
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;

    if (this.engine === 'google' && this.googleMapsApiKey) {
      try {
        await this.loadGoogleMapsSdk(this.googleMapsApiKey);
        this.initGoogleMap();
        return;
      } catch (err) {
        console.warn('Fallo al cargar Google Maps API, cambiando a Leaflet:', err);
        this.engine = 'leaflet';
      }
    }

    // Por defecto o respaldo: Leaflet (OpenStreetMap)
    this.initLeafletMap();
  }

  // Carga asíncrona del script de Google Maps API
  loadGoogleMapsSdk(apiKey) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }

      const existingScript = document.getElementById('google-maps-script');
      if (existingScript) existingScript.remove();

      const script = document.createElement('script');
      script.id = 'google-maps-script';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (e) => reject(new Error('No se pudo cargar Google Maps API. Verifica tu API Key.'));
      document.head.appendChild(script);
    });
  }

  // Inicialización de Google Maps
  initGoogleMap() {
    const defaultCenter = { lat: 4.7110, lng: -74.0721 }; // Bogotá, Colombia por defecto
    const mapOptions = {
      center: defaultCenter,
      zoom: 16,
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy',
      zoomControl: true,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] }
      ]
    };

    this.map = new google.maps.Map(document.getElementById(this.containerId), mapOptions);

    // Polilínea de ruta en Google Maps
    this.polyline = new google.maps.Polyline({
      path: [],
      geodesic: true,
      strokeColor: '#00f2fe',
      strokeOpacity: 0.9,
      strokeWeight: 5
    });
    this.polyline.setMap(this.map);

    // Marcador de dispositivo con flecha de navegación
    this.marker = new google.maps.Marker({
      position: defaultCenter,
      map: this.map,
      title: `Dispositivo: ${this.activeDeviceId}`,
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 6,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        rotation: 0
      }
    });

    // Círculo de precisión
    this.accuracyCircle = new google.maps.Circle({
      map: this.map,
      radius: 0,
      fillColor: '#10b981',
      fillOpacity: 0.15,
      strokeColor: '#10b981',
      strokeOpacity: 0.5,
      strokeWeight: 1
    });

    console.log('Google Maps API inicializado exitosamente');
    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('google', true);
  }

  // Inicialización de Leaflet (OpenStreetMap / CartoDB Dark)
  initLeafletMap() {
    if (typeof L === 'undefined') {
      console.error('Librería Leaflet no cargada en el DOM');
      return;
    }

    const defaultCenter = [4.7110, -74.0721];
    this.map = L.map(this.containerId, {
      zoomControl: true,
      attributionControl: true
    }).setView(defaultCenter, 16);

    // Capa de mapa base oscura moderna
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19
    }).addTo(this.map);

    // Polilínea de ruta
    this.polyline = L.polyline([], {
      color: '#00f2fe',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Marcador con pulso
    const customIcon = L.divIcon({
      className: 'custom-leaflet-marker',
      html: `
        <div class="pulse-marker-wrapper">
          <div class="pulse-radar"></div>
          <div class="marker-pointer" id="leaflet-marker-arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#10b981" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    this.marker = L.marker(defaultCenter, { icon: customIcon }).addTo(this.map);

    // Círculo de precisión
    this.accuracyCircle = L.circle(defaultCenter, {
      radius: 0,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.15,
      weight: 1
    }).addTo(this.map);

    console.log('Leaflet Map (OpenStreetMap) inicializado exitosamente');
    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('leaflet', true);
  }

  // Conectar escucha en tiempo real de Firebase Firestore (DaaS)
  startRealtimeListener(deviceId) {
    if (deviceId) {
      this.activeDeviceId = deviceId;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID, deviceId);
    }

    // Cancelar suscripción previa si existe
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }

    const db = window.FirebaseManager.getFirestoreDb();
    if (!db) {
      console.warn('Firestore no inicializado para escucha en tiempo real');
      return false;
    }

    console.log(`Iniciando escucha en tiempo real para dispositivo: ${this.activeDeviceId}`);

    // Cargar historial previo de puntos para pintar ruta inicial
    this.loadHistoryPoints(this.activeDeviceId);

    // Escucha en tiempo real del documento del dispositivo mediante onSnapshot
    this.firestoreUnsubscribe = db.collection('dispositivos').doc(this.activeDeviceId)
      .onSnapshot((docSnapshot) => {
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          this.handleRealtimeData(data);
        } else {
          console.log(`Documento de dispositivo ${this.activeDeviceId} aún no creado en Firestore.`);
        }
      }, (error) => {
        console.error('Error en onSnapshot de Firestore:', error);
      });

    return true;
  }

  stopRealtimeListener() {
    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
      console.log('Escucha en tiempo real de Firestore detenida');
    }
  }

  // Carga los últimos puntos de historial para rellenar la polilínea inicial
  async loadHistoryPoints(deviceId) {
    try {
      const db = window.FirebaseManager.getFirestoreDb();
      if (!db) return;

      const snapshot = await db.collection('dispositivos').doc(deviceId)
        .collection('historial')
        .orderBy('epoch', 'asc')
        .limitToLast(100)
        .get();

      if (!snapshot.empty) {
        snapshot.forEach((doc) => {
          const pt = doc.data();
          if (pt.lat && pt.lng) {
            this.addPointToPath(pt.lat, pt.lng, false);
          }
        });
        this.renderPath();
      }
    } catch (e) {
      console.warn('No se pudo cargar historial previo de Firestore:', e);
    }
  }

  // Procesa cada paquete de telemetría recibido desde Firebase en tiempo real
  handleRealtimeData(telemetry) {
    if (!telemetry || typeof telemetry.latitude !== 'number' || typeof telemetry.longitude !== 'number') {
      return;
    }

    const lat = telemetry.latitude;
    const lng = telemetry.longitude;
    const accuracy = telemetry.accuracy || 10;
    const heading = typeof telemetry.heading === 'number' ? telemetry.heading : 0;

    // 1. Agregar punto a la polilínea y actualizar distancia recorrida
    this.addPointToPath(lat, lng, true);

    // 2. Mover marcador y actualizar rumbo
    this.updateMarkerPosition(lat, lng, heading, accuracy);

    // 3. Centrar cámara si autoCenter está activo
    if (this.autoCenter && this.map) {
      this.panToLocation(lat, lng);
    }

    // 4. Calcular métricas y disparar callback de UI
    const enrichedData = {
      ...telemetry,
      totalDistanceMeters: Math.round(this.totalDistanceMeters),
      totalPoints: this.pathCoordinates.length
    };

    if (this.callbacks.onTelemetryReceived) {
      this.callbacks.onTelemetryReceived(enrichedData);
    }
  }

  // Agrega punto y acumula distancia con la fórmula de Haversine
  addPointToPath(lat, lng, shouldRender = true) {
    const newCoord = { lat, lng };

    if (this.lastCoordinate) {
      const deltaMeters = this.calculateHaversineDistance(
        this.lastCoordinate.lat, this.lastCoordinate.lng,
        lat, lng
      );
      // Solo acumular si el desplazamiento es razonable (evitar ruido menor a 1m)
      if (deltaMeters > 0.5) {
        this.totalDistanceMeters += deltaMeters;
      }
    }

    this.lastCoordinate = newCoord;
    this.pathCoordinates.push(newCoord);

    if (shouldRender) {
      this.renderPath();
    }
  }

  // Renderiza la polilínea según el motor activo
  renderPath() {
    if (!this.map || !this.polyline) return;

    if (this.engine === 'google' && window.google) {
      const gPath = this.pathCoordinates.map(c => new google.maps.LatLng(c.lat, c.lng));
      this.polyline.setPath(gPath);
    } else if (this.engine === 'leaflet' && typeof L !== 'undefined') {
      const lPath = this.pathCoordinates.map(c => [c.lat, c.lng]);
      this.polyline.setLatLngs(lPath);
    }
  }

  // Actualiza la posición del marcador y el círculo de precisión
  updateMarkerPosition(lat, lng, heading, accuracy) {
    if (!this.map) return;

    if (this.engine === 'google' && window.google) {
      const gLatLng = new google.maps.LatLng(lat, lng);
      if (this.marker) {
        this.marker.setPosition(gLatLng);
        const icon = this.marker.getIcon();
        if (icon && typeof icon === 'object') {
          icon.rotation = heading || 0;
          this.marker.setIcon(icon);
        }
      }
      if (this.accuracyCircle) {
        this.accuracyCircle.setCenter(gLatLng);
        this.accuracyCircle.setRadius(accuracy);
      }
    } else if (this.engine === 'leaflet' && typeof L !== 'undefined') {
      const lLatLng = [lat, lng];
      if (this.marker) {
        this.marker.setLatLng(lLatLng);
        const arrow = document.getElementById('leaflet-marker-arrow');
        if (arrow) {
          arrow.style.transform = `rotate(${heading || 0}deg)`;
        }
      }
      if (this.accuracyCircle) {
        this.accuracyCircle.setLatLng(lLatLng);
        this.accuracyCircle.setRadius(accuracy);
      }
    }
  }

  // Centra suavemente el mapa en las coordenadas
  panToLocation(lat, lng) {
    if (!this.map) return;

    if (this.engine === 'google' && window.google) {
      this.map.panTo(new google.maps.LatLng(lat, lng));
    } else if (this.engine === 'leaflet') {
      this.map.panTo([lat, lng], { animate: true, duration: 0.5 });
    }
  }

  // Limpia el rastro de la ruta
  clearPath() {
    this.pathCoordinates = [];
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;
    this.renderPath();
  }

  // Cálculo de distancia geodésica (Haversine) en metros
  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radio de la Tierra en metros
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) *
      Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }
}

window.MapMonitor = MapMonitor;
