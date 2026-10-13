/**
 * Módulo de Monitoreo en Tiempo Real sobre Mapa
 * Soporta Google Maps JavaScript API v3 y Leaflet (OpenStreetMap)
 * Conexión en tiempo real con Firebase Firestore (DaaS) mediante onSnapshot
 * Detección instantánea de ubicación actual al cargar la app
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

    // Coordenadas actuales del usuario local
    this.currentUserLocation = null;

    // Dispositivo activo monitoreado
    this.activeDeviceId = localStorage.getItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID) || 'Movil-GPS-1001';
    this.firestoreUnsubscribe = null;
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;

    this.callbacks = {
      onTelemetryReceived: null,
      onUserLocated: null,
      onStatusChange: null
    };
  }

  // Alterna entre motores de mapa (Google Maps <-> Leaflet)
  async setEngine(newEngine, apiKey = '') {
    this.engine = newEngine;
    if (apiKey) {
      this.googleMapsApiKey = apiKey;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.GOOGLE_MAPS_KEY, apiKey);
    }
    localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.MAP_ENGINE, newEngine);
    await this.initMap();
    if (this.currentUserLocation) {
      this.panToLocation(this.currentUserLocation.lat, this.currentUserLocation.lng, 17);
      this.updateMarkerPosition(
        this.currentUserLocation.lat,
        this.currentUserLocation.lng,
        this.currentUserLocation.heading || 0,
        this.currentUserLocation.accuracy || 15
      );
    }
  }

  // Inicializa el mapa
  async initMap() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = '';
    this.pathCoordinates = [];
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;

    if (this.engine === 'google' && this.googleMapsApiKey) {
      try {
        await this.loadGoogleMapsSdk(this.googleMapsApiKey);
        this.initGoogleMap();
        this.locateUserImmediately();
        return;
      } catch (err) {
        console.warn('Fallo al cargar Google Maps API, cambiando a Leaflet:', err);
        this.engine = 'leaflet';
      }
    }

    // Inicializar Leaflet (OpenStreetMap)
    this.initLeafletMap();
    this.locateUserImmediately();
  }

  // Carga asíncrona de Google Maps SDK
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
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps API.'));
      document.head.appendChild(script);
    });
  }

  // Inicializa Google Maps
  initGoogleMap() {
    const defaultCenter = this.currentUserLocation || { lat: 4.7110, lng: -74.0721 };
    const mapOptions = {
      center: defaultCenter,
      zoom: 17,
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy',
      zoomControl: false, // Menos estorbo en pantallas táctiles móviles
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#334155' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1e293b' }] },
        { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#475569' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1329' }] }
      ]
    };

    this.map = new google.maps.Map(document.getElementById(this.containerId), mapOptions);

    this.polyline = new google.maps.Polyline({
      path: [],
      geodesic: true,
      strokeColor: '#00f2fe',
      strokeOpacity: 0.95,
      strokeWeight: 5
    });
    this.polyline.setMap(this.map);

    this.marker = new google.maps.Marker({
      position: defaultCenter,
      map: this.map,
      title: 'Tu Ubicación Actual',
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 7,
        fillColor: '#00f2fe',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        rotation: 0
      }
    });

    this.accuracyCircle = new google.maps.Circle({
      map: this.map,
      radius: 0,
      fillColor: '#00f2fe',
      fillOpacity: 0.15,
      strokeColor: '#00f2fe',
      strokeOpacity: 0.6,
      strokeWeight: 1
    });

    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('google', true);
  }

  // Inicializa Leaflet Map
  initLeafletMap() {
    if (typeof L === 'undefined') return;

    const defaultCenter = this.currentUserLocation 
      ? [this.currentUserLocation.lat, this.currentUserLocation.lng] 
      : [4.7110, -74.0721];

    this.map = L.map(this.containerId, {
      zoomControl: false, // Controles limpios en móvil
      attributionControl: false
    }).setView(defaultCenter, 17);

    // CartoDB Dark Matter / Voyager
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);

    this.polyline = L.polyline([], {
      color: '#00f2fe',
      weight: 5,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.map);

    // Marcador de radar pulsante de alta visibilidad para teléfono móvil
    const mobileIcon = L.divIcon({
      className: 'user-gps-pulse-marker',
      html: `
        <div class="user-gps-radar-ring"></div>
        <div class="user-gps-pointer" id="leaflet-marker-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#00f2fe" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
          </svg>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    this.marker = L.marker(defaultCenter, { icon: mobileIcon }).addTo(this.map);

    this.accuracyCircle = L.circle(defaultCenter, {
      radius: 0,
      color: '#00f2fe',
      fillColor: '#00f2fe',
      fillOpacity: 0.15,
      weight: 1
    }).addTo(this.map);

    if (this.callbacks.onStatusChange) this.callbacks.onStatusChange('leaflet', true);
  }

  // Localiza instantáneamente al usuario al abrir la aplicación
  locateUserImmediately() {
    if (!('geolocation' in navigator)) {
      console.warn('Geolocalización no soportada');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = pos.coords;
        this.currentUserLocation = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading || 0
        };

        this.panToLocation(coords.latitude, coords.longitude, 17);
        this.updateMarkerPosition(coords.latitude, coords.longitude, coords.heading || 0, coords.accuracy || 15);

        if (this.callbacks.onUserLocated) {
          this.callbacks.onUserLocated(coords);
        }
      },
      (err) => {
        console.warn('No se pudo obtener ubicación inicial automática:', err.message);
      },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  }

  // Centra la vista en la ubicación actual del usuario
  centerOnUser() {
    this.autoCenter = true;
    if (this.currentUserLocation) {
      this.panToLocation(this.currentUserLocation.lat, this.currentUserLocation.lng, 18);
    } else {
      this.locateUserImmediately();
    }
  }

  // Escucha en tiempo real de Firestore (DaaS) mediante onSnapshot
  startRealtimeListener(deviceId) {
    if (deviceId) {
      this.activeDeviceId = deviceId;
      localStorage.setItem(window.FirebaseManager.STORAGE_KEYS.ACTIVE_DEVICE_ID, deviceId);
    }

    if (this.firestoreUnsubscribe) {
      this.firestoreUnsubscribe();
      this.firestoreUnsubscribe = null;
    }

    const db = window.FirebaseManager.getFirestoreDb();
    if (!db) {
      console.warn('Firestore no inicializado para escucha en tiempo real');
      return false;
    }

    this.loadHistoryPoints(this.activeDeviceId);

    this.firestoreUnsubscribe = db.collection('dispositivos').doc(this.activeDeviceId)
      .onSnapshot((docSnapshot) => {
        if (docSnapshot.exists) {
          const data = docSnapshot.data();
          this.handleRealtimeData(data);
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
    }
  }

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
      console.warn('Historial previo no disponible:', e);
    }
  }

  // Procesa cada punto que llega en tiempo real (cada 1000ms)
  handleRealtimeData(telemetry) {
    if (!telemetry || typeof telemetry.latitude !== 'number' || typeof telemetry.longitude !== 'number') {
      return;
    }

    const lat = telemetry.latitude;
    const lng = telemetry.longitude;
    const accuracy = telemetry.accuracy || 10;
    const heading = typeof telemetry.heading === 'number' ? telemetry.heading : 0;

    this.currentUserLocation = { lat, lng, accuracy, heading };

    this.addPointToPath(lat, lng, true);
    this.updateMarkerPosition(lat, lng, heading, accuracy);

    if (this.autoCenter && this.map) {
      this.panToLocation(lat, lng);
    }

    const enriched = {
      ...telemetry,
      totalDistanceMeters: Math.round(this.totalDistanceMeters),
      totalPoints: this.pathCoordinates.length
    };

    if (this.callbacks.onTelemetryReceived) {
      this.callbacks.onTelemetryReceived(enriched);
    }
  }

  addPointToPath(lat, lng, shouldRender = true) {
    const newCoord = { lat, lng };

    if (this.lastCoordinate) {
      const deltaMeters = this.calculateHaversineDistance(
        this.lastCoordinate.lat, this.lastCoordinate.lng,
        lat, lng
      );
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

  panToLocation(lat, lng, zoomLevel = null) {
    if (!this.map) return;

    if (this.engine === 'google' && window.google) {
      const gPos = new google.maps.LatLng(lat, lng);
      this.map.panTo(gPos);
      if (zoomLevel) this.map.setZoom(zoomLevel);
    } else if (this.engine === 'leaflet') {
      if (zoomLevel) {
        this.map.setView([lat, lng], zoomLevel, { animate: true, duration: 0.5 });
      } else {
        this.map.panTo([lat, lng], { animate: true, duration: 0.5 });
      }
    }
  }

  clearPath() {
    this.pathCoordinates = [];
    this.totalDistanceMeters = 0;
    this.lastCoordinate = null;
    this.renderPath();
  }

  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
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
