# 🛰️ GeoLive Telemetry - Rastreo GPS en Tiempo Real con Firebase Firestore y Google Maps

Aplicación web móvil de alta frecuencia para telemetría y geolocalización en tiempo real. Captura el sensor GPS y sensores de hardware del smartphone, transmite a la base de datos en la nube **Firebase Firestore (DaaS)** cada **1000 milisegundos (1 segundo)** y renderiza en vivo el movimiento del dispositivo sobre **Google Maps API v3** y **OpenStreetMap (Leaflet)**.

---

## 📋 Características Principales

### 📱 1. Captura de Sensores Móviles (Modo Emisor)
* **GPS de Alta Precisión:** Utiliza la API nativa `navigator.geolocation.watchPosition` con `{ enableHighAccuracy: true, timeout: 4500, maximumAge: 0 }`.
* **Frecuencia de Actualización Estricta:** Envío programado de telemetría cada **1000 milisegundos (1 segundo)**.
* **Telemetría Completa de Sensores:**
  * **Latitud y Longitud:** Con precisión micrométrica (hasta 6 decimales).
  * **Precisión:** Radio de incertidumbre en metros ($\pm \text{m}$).
  * **Velocidad:** En $\text{m/s}$ y convertida a $\text{km/h}$.
  * **Altitud:** Metros sobre el nivel del mar y precisión vertical.
  * **Rumbo / Dirección:** Grados (0°–360°) y punto cardinal (Norte, Sur, Este, Oeste, etc.).
  * **Batería:** Porcentaje de carga y estado de carga activa (vía `Battery Status API`).
  * **Giroscopio / Orientación:** Ángulos $\alpha$, $\beta$ y $\gamma$ del dispositivo (`DeviceOrientationEvent`).
  * **Estado de Conexión:** Detección de conectividad online/offline.
* **Screen Wake Lock:** Mantiene la pantalla encendida para evitar que el sistema operativo del teléfono suspenda la antena GPS durante desplazamientos.

### ☁️ 2. Base de Datos en la Nube (Firebase Firestore DaaS)
* **Proyecto Vinculado:** [`appmovil-67ee7`](https://console.firebase.google.com/project/appmovil-67ee7/overview?hl=es-419)
* **Colección `dispositivos`:** Mantiene el estado en vivo de cada móvil conectado.
* **Subcolección `historial`:** Almacena la secuencia de puntos de coordenadas para dibujar la trayectoria.
* **Escucha en Tiempo Real:** Utiliza el listener reactivo `onSnapshot` de Firestore para propagar cambios instantáneamente sin necesidad de recargar la página.

### 🗺️ 3. Visualización en Tiempo Real (Modo Monitor)
* **Google Maps API v3:**
  * Marcador de navegación con rotación dinámica según el rumbo (`heading`).
  * Polilínea geodésica continua que traza el camino recorrido en tiempo real.
  * Círculo de radio de precisión de señal GPS alrededor del vehículo o peatón.
  * Auto-centrado suave de cámara y controles de Street View / Satélite.
* **Motor Alternativo Leaflet (OpenStreetMap):** Permite ejecutar y probar la visualización de forma inmediata sin necesidad de configurar una tarjeta de crédito o clave de Google Cloud Console.

### 🧪 4. Modo Simulador de Movimiento
* Permite probar la aplicación en la computadora de escritorio sin salir a la calle, simulando cambios de posición, velocidad, rumbo y batería cada 1000ms.

---

## 📂 Estructura del Proyecto

```plaintext
DesarrolloDePlataformas/
├── index.html                   # Interfaz dual (Emisor GPS / Monitor en Mapa)
├── css/
│   └── style.css                # Estilos modernos Cyber-Glassmorphism responsivos
├── js/
│   ├── firebase-config.js       # Conexión y persistencia con Firebase Firestore
│   ├── gps-tracker.js           # Motor de captura de sensores móviles (1000ms)
│   ├── map-monitor.js           # Motor de mapas (Google Maps API + Leaflet) y onSnapshot
│   └── app.js                   # Orquestador de la UI, eventos y simulador
├── opencode.json                # Configuración del agente auditor OpenCode
├── .opencode/
│   └── agents/
│       └── auditor.md           # Definición de auditoría de OpenCode
├── firebase.rules               # Reglas de seguridad para Cloud Firestore
├── AUDITORIA_OPENCODE.md        # Informe detallado de auditoría técnica por OpenCode
├── .gitignore                   # Exclusión de binarios (opencode.exe) y temporales
└── README.md                    # Documentación del proyecto
```

---

## 🚀 Guía de Puesta en Marcha

### 1. Requisitos Previos
* Un navegador moderno (Chrome, Edge, Safari, Firefox).
* Para capturar GPS real desde el teléfono, se requiere conexión HTTPS o localhost (política de seguridad de geolocalización de los navegadores móviles).

### 2. Ejecutar Localmente
Puedes servir los archivos con cualquier servidor HTTP local:
```powershell
# Con Python
python -m http.server 8080

# O con Node.js / npx
npx serve -l 8080
```
Luego abre `http://localhost:8080` en tu navegador.

### 3. Conexión con Firebase (`appmovil-67ee7`)
1. Ve a la consola del proyecto: [appmovil-67ee7](https://console.firebase.google.com/project/appmovil-67ee7/overview?hl=es-419).
2. En la sección **Cloud Firestore**, asegúrate de que la base de datos esté creada (Modo de prueba o usando las reglas de `firebase.rules`).
3. En la configuración del proyecto (ícono de engranaje ⚙️) -> **General** -> **Tus apps**, registra una aplicación Web y copia tu `apiKey`.
4. En la aplicación web, abre el ícono de **Ajustes (⚙️)** en la esquina superior derecha y pega tu `Firebase Web API Key`.

### 4. Configuración de Google Maps API
1. En Google Cloud Console, habilita la API **Maps JavaScript API**.
2. Copia tu clave API de Google Maps.
3. En la aplicación, ingresa a **Ajustes (⚙️)**, pega tu clave en el campo `Google Maps JavaScript API Key` y selecciona el motor `Google Maps API v3`.
*(Nota: Si no posees una clave de Google Maps, puedes usar la opción predeterminada OpenStreetMap / Leaflet que funciona inmediatamente).*

---

## 🔒 Reglas de Seguridad de Cloud Firestore (`firebase.rules`)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /dispositivos/{deviceId} {
      allow read, write: if true;
      
      match /historial/{puntos} {
        allow read, write: if true;
      }
    }
  }
}
```

---

## 🧑‍💻 Auditoría Técnica con OpenCode
El proyecto incluye la suite de auditoría técnica realizada mediante el agente **OpenCode**, documentada íntegramente en [`AUDITORIA_OPENCODE.md`](file:///c:/Users/estudiante/Desktop/DesarrolloDePlataformas/AUDITORIA_OPENCODE.md).

