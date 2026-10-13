# 📱 GeoLive App - Cliente Móvil de Transmisión GPS en Tiempo Real

Aplicación web móvil progresiva (PWA) de alta frecuencia diseñada para que el **usuario común comparta su ubicación satelital GPS y telemetría de sensores en tiempo real** hacia la nube **Firebase Firestore (DaaS)** cada **1000 milisegundos (1 segundo)**.

Esta aplicación es el **Cliente Transmisor**, pensada para operar en conjunto con el repositorio de monitoreo y control de flotas: [AppMovilAdmin](https://github.com/JJamesrxzn7/AppMovilAdmin).

---

## 🎯 Enfoque del Usuario Común (Experiencia Limpia)
El usuario común no necesita paneles de monitoreo complejos ni configuraciones técnicas. Su experiencia está optimizada en 3 pasos:
1. **Abrir la app en su teléfono móvil:** Se localiza automáticamente en el mapa de Google Maps con todas sus calles y avenidas.
2. **Ingresar su Nombre o Alias:** (ej: *"Juan"*, *"Pana Carlos"*, *"Moto 1"*).
3. **Presionar "Iniciar Transmisión GPS (1000ms)":** Sus coordenadas, velocidad, rumbo y estado de batería se transmiten de inmediato cada segundo a Cloud Firestore.

---

## 📋 Características Técnicas

### 📱 1. Captura de Hardware Satelital Móvil
* **Geolocalización Satelital de Alta Precisión:** Utiliza `navigator.geolocation.watchPosition` con `{ enableHighAccuracy: true, timeout: 4500, maximumAge: 0 }`.
* **Frecuencia Estricta de 1000 ms:** Temporizador periódico sincronizado que transmite a la nube segundo a segundo ($1000\text{ ms}$).
* **Telemetría Completa:**
  * **Latitud y Longitud:** Con precisión de 6 decimales.
  * **Precisión:** Radio de incertidumbre en metros ($\pm \text{m}$).
  * **Velocidad:** En $\text{m/s}$ y convertida a $\text{km/h}$.
  * **Altitud:** Metros sobre el nivel del mar.
  * **Rumbo / Dirección:** Brújula en grados ($0^\circ–360^\circ$) y puntos cardinales (N, S, E, O).
  * **Batería del Teléfono:** Nivel % y estado de carga activa (`Battery Status API`).
  * **Giroscopio / Orientación:** Ángulos $\alpha$, $\beta$, $\gamma$ (`DeviceOrientationEvent`).
* **Screen Wake Lock:** Impide que el teléfono apague la pantalla y suspenda el chip GPS mientras el usuario se desplaza.

### 📶 2. Tolerancia a Fallos y Modo Offline (Cero Pérdida de Datos)
* **Cola de Almacenamiento Local:** Si el teléfono pierde cobertura, entra a un túnel o se activa el modo avión, **ningún punto se pierde**. Cada coordenada de 1000ms se almacena en memoria persistente (`localStorage`).
* **Sincronización Automática al Reconectar:** Cuando se restablece la conexión a internet, la app sube automáticamente todos los puntos acumulados en bloques a Cloud Firestore.
* **Progresividad PWA:** Service Worker (`sw.js`) y Manifiesto (`manifest.json`) que permiten abrir la app sin conexión e instalarla en la pantalla de inicio del celular.

### ☁️ 3. Integración con Cloud Firestore (DaaS)
* **Proyecto Firebase:** [`appmovil-67ee7`](https://console.firebase.google.com/project/appmovil-67ee7/overview?hl=es-419)
* **Colección `dispositivos/{deviceId}`:** Mantiene el estado en vivo del usuario con campos como `deviceName`, `latitude`, `longitude`, `speedKmH`, `batteryLevel`, etc.
* **Subcolección `historial`:** Guarda el trazado de puntos segundo a segundo para que el panel de administración pueda dibujar la ruta recorrida.

---

## 📂 Estructura Limpia del Proyecto

```plaintext
DesarrolloDePlataformas/
├── index.html                   # Interfaz móvil limpia del usuario común
├── css/
│   └── style.css                # Estilos responsivos Mobile-First con Bottom Sheet
├── js/
│   ├── firebase-config.js       # Conexión y credenciales de Firebase Firestore
│   ├── gps-tracker.js           # Captura GPS (1000ms), sensores y cola offline
│   ├── map-monitor.js           # Visualización del mapa Google Maps local
│   └── app.js                   # Controlador mobile-first del transmisor
├── icons/
│   └── icon.svg                 # Ícono vectorial de la app PWA
├── manifest.json                # Manifiesto para instalación nativa en smartphones
├── sw.js                        # Service Worker para funcionamiento sin conexión
├── firebase.rules               # Reglas de seguridad para Cloud Firestore
├── AUDITORIA_OPENCODE.md        # Auditoría técnica realizada por OpenCode
├── push-to-github.bat           # Script para subir cambios a GitHub en 1 clic
└── README.md                    # Documentación del cliente móvil
```

---

## 🚀 Puesta en Marcha

1. Abre el proyecto con cualquier servidor local:
   ```powershell
   npx serve -l 8080
   # o
   python -m http.server 8080
   ```
2. Abre `http://localhost:8080` o la IP de tu red local en tu celular (ej. `http://192.168.1.X:8080`).
3. Ingresa tu nombre o alias.
4. Presiona **"Iniciar Transmisión GPS (1000ms)"**.
5. Para monitorear a los usuarios conectados, se utilizará el repositorio administrativo: [AppMovilAdmin](https://github.com/JJamesrxzn7/AppMovilAdmin).
