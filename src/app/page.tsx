"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import BottomNav from "./BottomNav";
import CloudsView from "./CloudsView";
import ContactView from "./ContactView";
import HelpView from "./HelpView";
import InfoGuide from "./InfoGuide";
import { loadLeaflet, removeMap } from "./leaflet";
import RainForecast from "./RainForecast";
import RiskBars, {
  getDangerLevel,
  getZoneMeaning,
  RiskLevelsGuide,
  type DangerTone,
  type RiskBarState,
} from "./RiskBars";
import RiverGauge from "./RiverGauge";
import styles from "./page.module.css";

// Lo mínimo que se usa de una capa de Leaflet para mostrarla u ocultarla.
type LeafletLayer = { addTo(map: unknown): unknown; remove(): unknown };

type RiskMatch = { id?: string | number; name?: string; properties?: Record<string, unknown> };

// Las dos capas de riesgo hídrico; la clave coincide con la respuesta de /api/geo/contains.
const RISK_MAPS = [
  { key: "rio", title: "Riesgo por crecida de ríos" },
  { key: "lluvia", title: "Riesgo por precipitaciones" },
] as const;
type RiskMapKey = (typeof RISK_MAPS)[number]["key"];
type BaseMapKey = "osm" | "satelite";

// Pestañas en el orden en que se muestran; la app abre en la portada ("inicio").
const TABS = [
  { key: "inicio", label: "Inicio" },
  { key: "riesgo", label: "Riesgo" },
  { key: "mapa", label: "Mapa" },
  { key: "crecida", label: "Crecida" },
  { key: "info", label: "Información" },
  { key: "pronosticos", label: "Pronósticos" },
  { key: "nubes", label: "Nubes" },
  { key: "ayuda", label: "Ayuda" },
  { key: "contacto", label: "Contactanos" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Pestañas fijas de la barra inferior del celular; el resto va en el menú "Más".
const PRIMARY_TABS: readonly TabKey[] = ["inicio", "riesgo", "mapa", "crecida"];

// Colores de las estaciones de bombeo según su clasificación (propiedad `clas`).
const BOMBEO_COLORS: Record<string, string> = {
  "Estación de Bombeo": "#0ea5e9",
  "Obra de Control": "#f97316",
  Alcantarilla: "#a855f7",
};
const DEFENSA_COLOR = "#7c2d12";

// La visita se registra una sola vez por carga de la página: en desarrollo React monta los
// componentes dos veces y sin esto se contaría doble.
let visitRegistered = false;
const registerVisit = () => {
  if (visitRegistered) return;
  visitRegistered = true;
  fetch("/api/visitas", { method: "POST" }).catch(() => {});
};

// La ubicación de la visita también se guarda una sola vez: la primera posición que se consigue
// (después el GPS la va refinando, pero eso no cuenta como otra visita).
let visitLocationRegistered = false;
const registerVisitLocation = (location: { latitude: number; longitude: number; accuracy: number | null }) => {
  if (visitLocationRegistered) return;
  visitLocationRegistered = true;
  fetch("/api/visitas/ubicacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location),
  }).catch(() => {});
};

const escapeHtml = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Colores de las dos capas de riesgo en el mapa, de menor a mayor peligro. Cada capa tiene su
// propia familia de colores para poder verlas juntas: el río en azules y las precipitaciones en
// colores cálidos, ambos con relleno semitransparente.
type MapLevel = { tone: DangerTone; label: string; color: string };

const RIVER_LEVELS: MapLevel[] = [
  { tone: "dangerLight", label: "Leve", color: "#93c5fd" },
  { tone: "dangerRegulated", label: "Leve regulada", color: "#3b82f6" },
  { tone: "dangerSevere", label: "Severa", color: "#1e40af" },
  { tone: "dangerHigh", label: "Prohibida", color: "#0b1a4a" },
];

const RAIN_LEVELS: MapLevel[] = [
  { tone: "dangerLight", label: "Leve", color: "#eab308" },
  { tone: "dangerTemporary", label: "Severa temporaria", color: "#f97316" },
  { tone: "dangerSevere", label: "Severa", color: "#dc2626" },
  { tone: "dangerHigh", label: "Prohibida", color: "#831843" },
];

const NO_LEVEL_COLOR = "#6b7280";

const levelColor = (levels: MapLevel[], category?: string) =>
  levels.find((level) => level.tone === getDangerLevel(category).tone)?.color ?? NO_LEVEL_COLOR;

type ZoneFeature = { properties?: { categoria?: string } };

const riverZoneStyle = (feature?: ZoneFeature) => {
  const color = levelColor(RIVER_LEVELS, feature?.properties?.categoria);
  return { color, weight: 1.5, opacity: 0.9, fillColor: color, fillOpacity: 0.45 };
};

const rainZoneStyle = (feature?: ZoneFeature) => {
  const color = levelColor(RAIN_LEVELS, feature?.properties?.categoria);
  return { color, weight: 2, opacity: 0.95, fillColor: color, fillOpacity: 0.45 };
};

// Con esta precisión se deja de escuchar al GPS.
const GOOD_ACCURACY_METERS = 25;
const GPS_WATCH_MAX_MS = 45000;

// Zonas de cada mapa de riesgo que contienen un punto (respuesta de /api/geo/contains).
type RiskLookup = { loading: boolean; error: string | null; matches: Record<RiskMapKey, RiskMatch[]> };

async function fetchRiskMatches(latitude: number, longitude: number): Promise<Record<RiskMapKey, RiskMatch[]>> {
  const response = await fetch(`/api/geo/contains?lng=${longitude}&lat=${latitude}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "No se pudieron consultar las capas de riesgo.");
  }

  return { rio: payload.rio?.matches ?? [], lluvia: payload.lluvia?.matches ?? [] };
}

// Punto que el usuario consulta en la pestaña Mapa (dirección buscada o lugar tocado en el mapa).
// `exact` es false cuando la altura no figura en OpenStreetMap y se marcó un punto de la calle;
// `centerMap` lleva el mapa hasta el punto (al buscar una dirección, no al tocar el mapa).
type MapPoint = { latitude: number; longitude: number; label: string; exact?: boolean; centerMap?: boolean };

const LOCALIDADES = ["Resistencia", "Barranqueras", "Fontana", "Puerto Vilelas"] as const;

// Un toque con el dedo sobre el mapa: hasta este movimiento y esta duración no es un arrastre.
const TAP_TOLERANCE_PX = 12;
const TAP_MAX_MS = 600;
// Tras un toque (o un doble toque), Leaflet puede disparar además su propio "dblclick": se
// ignora en este lapso.
const TAP_CLICK_DEDUPE_MS = 700;

// Centro de Resistencia: vista inicial del mapa si todavía no hay ubicación del usuario.
const AMGR_CENTER: [number, number] = [-27.4514, -58.9867];

const POINT_PIN_HTML =
  '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">' +
  '<path d="M15 39C15 39 28 24 28 14A13 13 0 0 0 2 14C2 24 15 39 15 39Z" fill="#7c3aed" stroke="#ffffff" stroke-width="2.5"/>' +
  '<circle cx="15" cy="14" r="5" fill="#ffffff"/></svg>';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createUserMarker = (L: any, map: unknown, location: { latitude: number; longitude: number }) => {
  const marker = L.circleMarker([location.latitude, location.longitude], {
    pane: "userPane",
    // Negro con borde blanco: se distingue sobre el relleno azul del río y el cálido
    // de precipitaciones.
    radius: 9,
    color: "#ffffff",
    fillColor: "#111827",
    fillOpacity: 1,
    weight: 3,
  });
  marker.addTo(map);
  marker.bindPopup("Tu ubicación actual");
  return marker;
};

// Pin violeta para el punto consultado: no se confunde con los colores de las capas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPointMarker = (L: any, map: unknown, point: MapPoint) => {
  const marker = L.marker([point.latitude, point.longitude], {
    pane: "pointPane",
    icon: L.divIcon({
      className: "map-point-pin",
      html: POINT_PIN_HTML,
      iconSize: [30, 40],
      iconAnchor: [15, 39],
      popupAnchor: [0, -36],
    }),
  });
  marker.addTo(map);
  marker.bindPopup(escapeHtml(point.label));
  return marker;
};

const formatMetricValue = (value: unknown) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "Sin dato";
  }

  return String(value);
};

const toMeters = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// Prefectura publica la fecha como "25/SEP/26 - 1200": se agregan los dos puntos a la hora.
const formatMeasurementDate = (value: unknown) => {
  const text = formatMetricValue(value);
  return text.replace(/\b(\d{2})(\d{2})$/, "$1:$2 hs");
};

// Flecha junto al estado del río: roja hacia arriba si crece ("CRECE", "ALERTA CRECE",
// "EVACUACION CRECE"), verde hacia abajo si baja. Otros estados (p. ej. estacionario) van sin flecha.
function TrendArrow({ state }: { state: unknown }) {
  const text = String(state ?? "").toUpperCase();
  const trend = text.includes("CRECE") ? "up" : text.includes("BAJA") ? "down" : null;
  if (!trend) return null;

  // Tamaño y color van en el propio SVG: si el CSS no carga, no se agranda ni queda negra.
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke={trend === "up" ? "#d03b3b" : "#0ca30c"}
      strokeWidth="3.5"
      style={{ flexShrink: 0 }}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={trend === "up" ? "El río crece" : "El río baja"}
    >
      {trend === "up" ? <path d="M12 20V4M5 11l7-7 7 7" /> : <path d="M12 4v16M5 13l7 7 7-7" />}
    </svg>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("inicio");
  const nextTab = TABS[TABS.findIndex((tab) => tab.key === activeTab) + 1];
  const tabsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    registerVisit();
  }, []);

  // El botón Siguiente queda al final del contenido: al cambiar de pestaña se vuelve arriba.
  const goToTab = (key: TabKey) => {
    setActiveTab(key);
    window.scrollTo({ top: 0 });
  };

  // En el celular la barra de pestañas se desliza: se trae a la vista la pestaña activa.
  useEffect(() => {
    tabsRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);
  const [riskData, setRiskData] = useState<Record<string, unknown> | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    if (location) registerVisitLocation(location);
  }, [location]);
  // Zonas de cada mapa de riesgo (río y precipitaciones) que contienen la ubicación del usuario.
  const [geoLayer, setGeoLayer] = useState<RiskLookup>({
    loading: false,
    error: null,
    matches: { rio: [], lluvia: [] },
  });
  // Punto consultado en la pestaña Mapa; mientras sea null se muestra el riesgo de la ubicación
  // del usuario. La pestaña Riesgo siempre usa la ubicación del usuario.
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const selectedPointRef = useRef<MapPoint | null>(null);
  const pointMarkerRef = useRef<LeafletLayer | null>(null);
  const [pointRisk, setPointRisk] = useState<RiskLookup>({
    loading: false,
    error: null,
    matches: { rio: [], lluvia: [] },
  });
  const [addressLocalidad, setAddressLocalidad] = useState<string>(LOCALIDADES[0]);
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressSearch, setAddressSearch] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  // Capas visibles en la pestaña Mapa (casilleros tipo GIS).
  const [showRiskLayer, setShowRiskLayer] = useState(true);
  const [showRainLayer, setShowRainLayer] = useState(false);
  const [showDefensaLayer, setShowDefensaLayer] = useState(false);
  const [showBombeoLayer, setShowBombeoLayer] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const riskLayerRef = useRef<LeafletLayer | null>(null);
  const rainLayerRef = useRef<LeafletLayer | null>(null);
  const defensaLayerRef = useRef<LeafletLayer | null>(null);
  const bombeoLayerRef = useRef<LeafletLayer | null>(null);
  const layerVisibilityRef = useRef({ risk: true, rain: false, defensa: false, bombeo: false });
  // Mapa base de la pestaña Mapa: calles (OpenStreetMap) o imagen satelital.
  const [baseMap, setBaseMap] = useState<BaseMapKey>("osm");
  const baseMapRef = useRef<BaseMapKey>("osm");
  const baseLayersRef = useRef<Record<BaseMapKey, LeafletLayer> | null>(null);
  const isRiskMatchResolved = !locationLoading && !geoLayer.loading && !geoLayer.error;

  // Estado de cada barra de la pestaña Riesgo, calculado de forma independiente por mapa.
  const riskBarState = (key: RiskMapKey): RiskBarState => {
    if (locationLoading || geoLayer.loading) return { tone: null, status: "Cargando..." };
    if (!isRiskMatchResolved) return { tone: null, status: "Sin datos" };

    const category = geoLayer.matches[key][0]?.properties?.categoria;
    if (category == null) return { tone: null, status: "Fuera de zona de riesgo" };

    const level = getDangerLevel(String(category));
    return { tone: level.tone, status: level.label };
  };

  useEffect(() => {
    let isMounted = true;

    async function loadRisk() {
      try {
        setRiskLoading(true);
        setRiskError(null);

        const response = await fetch(
          "/api/rio-parana?puerto=BARRANQUERAS&rio=PARANA",
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar la información del río");
        }

        if (isMounted) {
          setRiskData(payload.row ?? payload);
        }
      } catch (error) {
        if (isMounted) {
          setRiskError(
            error instanceof Error ? error.message : "Error al consultar la API de riesgo.",
          );
        }
      } finally {
        if (isMounted) {
          setRiskLoading(false);
        }
      }
    }

    loadRisk();

    return () => {
      isMounted = false;
    };
  }, []);

  // La ubicación se obtiene en dos etapas: primero una rápida (WiFi/antenas, < 1 s) para
  // mostrar el mapa enseguida, y en paralelo el GPS, que puede tardar varios segundos y va
  // reemplazando la posición a medida que mejora la precisión.
  const watchIdRef = useRef<number | null>(null);
  const watchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopWatchingLocation = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (watchTimeoutRef.current !== null) {
      clearTimeout(watchTimeoutRef.current);
      watchTimeoutRef.current = null;
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      // Asincrónico para no cambiar el estado dentro del efecto que llama a esta función.
      queueMicrotask(() => {
        setLocationError("Tu navegador no soporta geolocalización GPS.");
        setLocationLoading(false);
      });
      return;
    }

    stopWatchingLocation();

    let hasPosition = false;
    let pendingRequests = 2;

    const onSuccess = (position: GeolocationPosition) => {
      const accuracy = position.coords.accuracy ?? null;

      // Solo se reemplaza la posición si la nueva es más precisa que la actual.
      setLocation((current) =>
        current && current.accuracy !== null && accuracy !== null && accuracy >= current.accuracy
          ? current
          : { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy },
      );
      hasPosition = true;
      setLocationError(null);
      setLocationLoading(false);

      if (accuracy !== null && accuracy <= GOOD_ACCURACY_METERS) {
        stopWatchingLocation();
      }
    };

    // Solo se muestra un error si ninguna de las dos etapas consiguió una posición.
    const onError = (error: GeolocationPositionError) => {
      pendingRequests -= 1;

      if (error.code === error.PERMISSION_DENIED) {
        stopWatchingLocation();
        setLocationError("Se denegó el acceso a la ubicación. Activa el permiso de GPS y vuelve a intentarlo.");
        setLocationLoading(false);
        return;
      }

      if (hasPosition || pendingRequests > 0) {
        return;
      }

      setLocationError(
        error.code === error.TIMEOUT
          ? "La ubicación GPS tardó demasiado. Intenta nuevamente o revisa la señal del celular."
          : error.message || "No se pudo obtener la ubicación del usuario.",
      );
      setLocationLoading(false);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 5 * 60 * 1000,
    });

    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      (error) => {
        stopWatchingLocation();
        onError(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0,
      },
    );

    // El GPS no se deja encendido indefinidamente: gasta batería.
    watchTimeoutRef.current = setTimeout(() => {
      stopWatchingLocation();

      if (!hasPosition) {
        pendingRequests = 0;
        setLocationError("La ubicación GPS tardó demasiado. Intenta nuevamente o revisa la señal del celular.");
        setLocationLoading(false);
      }
    }, GPS_WATCH_MAX_MS);
  };

  useEffect(() => {
    requestLocation();
    return stopWatchingLocation;
  }, []);

  useEffect(() => {
    if (location === null) {
      return;
    }

    const { latitude, longitude } = location;
    let cancelled = false;

    async function loadGeoLayer() {
      try {
        // Al afinar la posición se conserva el resultado anterior en pantalla hasta tener el nuevo.
        setGeoLayer((current) =>
          current.matches.rio.length > 0 || current.matches.lluvia.length > 0
            ? current
            : { loading: true, error: null, matches: { rio: [], lluvia: [] } },
        );

        const matches = await fetchRiskMatches(latitude, longitude);

        if (!cancelled) {
          setGeoLayer({ loading: false, error: null, matches });
        }
      } catch (error) {
        if (!cancelled) {
          setGeoLayer({
            loading: false,
            error:
              error instanceof Error ? error.message : "No se pudo verificar la capa geográfica.",
            matches: { rio: [], lluvia: [] },
          });
        }
      }
    }

    loadGeoLayer();

    return () => {
      cancelled = true;
    };
  }, [location]);

  // El mapa se crea al abrir la pestaña, aunque todavía no haya ubicación (se puede buscar una
  // dirección o tocar el mapa); las posiciones que llegan después solo mueven el marcador.
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    const location = locationRef.current;

    if (activeTab !== "mapa") {
      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) {
      return;
    }

    let cancelled = false;
    // Quita los listeners de toque que se agregan al contenedor del mapa.
    const listeners = new AbortController();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initializeMap = (L: any) => {
      if (cancelled) {
        return;
      }

      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
      }

      const selectedPoint = selectedPointRef.current;
      const center: [number, number] = selectedPoint
        ? [selectedPoint.latitude, selectedPoint.longitude]
        : location
          ? [location.latitude, location.longitude]
          : AMGR_CENTER;
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
        // El doble clic señala un punto (ver abajo); el zoom queda en la rueda y los botones.
        doubleClickZoom: false,
      }).setView(center, 16);

      // Se crean los dos mapas base y se muestra el elegido; el otro se agrega al cambiar la opción.
      baseLayersRef.current = {
        osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          // 19 = zoom máximo con tiles propios de OpenStreetMap (nivel de cuadra / lote).
          maxZoom: 19,
        }),
        satelite: L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Imágenes &copy; Esri, Maxar, Earthstar Geographics",
            maxZoom: 19,
          },
        ),
      };
      baseLayersRef.current[baseMapRef.current].addTo(map);

      // Un pane por capa fija el orden de dibujo aunque se oculten y vuelvan a mostrar:
      // el relleno del río abajo y el de precipitaciones sobre él (así se ven las dos),
      // luego defensas y estaciones de bombeo, y los marcadores del usuario y del punto
      // consultado arriba de todo.
      map.createPane("riskPane").style.zIndex = "415";
      map.createPane("rainPane").style.zIndex = "420";
      map.createPane("defensaPane").style.zIndex = "430";
      map.createPane("bombeoPane").style.zIndex = "440";
      map.createPane("userPane").style.zIndex = "650";
      map.createPane("pointPane").style.zIndex = "660";

      if (location) {
        userMarkerRef.current = createUserMarker(L, map, location);
      }
      if (selectedPoint) {
        pointMarkerRef.current = createPointMarker(L, map, selectedPoint);
      }

      // Tocar el mapa consulta el riesgo de ese punto.
      const selectMapPoint = (latlng: { lat: number; lng: number }) => {
        setSelectedPoint({
          latitude: latlng.lat,
          longitude: latlng.lng,
          label: "Punto señalado en el mapa",
        });
      };
      let lastTapAt = 0;

      // Con el mouse se señala con doble clic: el clic simple queda para abrir el cartel de
      // cada zona sin mover el punto consultado.
      map.on("dblclick", (event: { latlng: { lat: number; lng: number } }) => {
        // El toque con el dedo ya lo resolvió el detector de abajo.
        if (Date.now() - lastTapAt < TAP_CLICK_DEDUPE_MS) return;
        selectMapPoint(event.latlng);
      });

      // En el celular el dedo casi siempre se mueve unos píxeles al tocar, y Leaflet lo toma
      // como arrastre del mapa (tolera 3 px) y no dispara "click". Se detecta el toque a mano:
      // un solo dedo, poco movimiento y breve. Pellizcos y arrastres no cuentan.
      const container: HTMLElement = map.getContainer();
      const touches = new Map<number, { x: number; y: number; time: number }>();
      let multiTouch = false;

      container.addEventListener(
        "pointerdown",
        (event) => {
          if (event.pointerType !== "touch") return;
          if (touches.size > 0) multiTouch = true;
          touches.set(event.pointerId, { x: event.clientX, y: event.clientY, time: event.timeStamp });
        },
        { capture: true, signal: listeners.signal },
      );

      container.addEventListener(
        "pointerup",
        (event) => {
          const start = touches.get(event.pointerId);
          touches.delete(event.pointerId);
          const wasMultiTouch = multiTouch;
          if (touches.size === 0) multiTouch = false;
          if (!start || wasMultiTouch) return;

          const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
          const target = event.target as Element | null;
          if (
            moved > TAP_TOLERANCE_PX ||
            event.timeStamp - start.time > TAP_MAX_MS ||
            target?.closest(".leaflet-control, .leaflet-popup")
          ) {
            return;
          }

          lastTapAt = Date.now();
          selectMapPoint(map.mouseEventToLatLng(event));
        },
        { capture: true, signal: listeners.signal },
      );

      container.addEventListener(
        "pointercancel",
        (event) => {
          touches.delete(event.pointerId);
          if (touches.size === 0) multiTouch = false;
        },
        { capture: true, signal: listeners.signal },
      );

      fetch("/api/geo/capa")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            pane: "riskPane",
            style: riverZoneStyle,
            onEachFeature: (feature: any, layerItem: any) => {
              const category = feature?.properties?.categoria ?? "Zona de riesgo";
              layerItem.bindPopup(`<strong>${category}</strong><br>Crecida de Ríos (Res. 303/17)`);
            },
          });

          riskLayerRef.current = layer;
          if (layerVisibilityRef.current.risk) {
            layer.addTo(map);
          }

          // Si hay un punto consultado, la vista queda sobre él.
          if (!selectedPointRef.current && layer.getBounds && layer.getBounds().isValid()) {
            // Sin animación: si el usuario cambia de pestaña durante el zoom animado, Leaflet falla
            // al terminar la transición sobre un mapa ya eliminado.
            map.fitBounds(layer.getBounds().pad(0.2), { animate: false });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGeoLayer((current) => ({
              ...current,
              error: "No se pudo cargar la capa GeoJSON para mostrarla en el mapa.",
            }));
          }
        });

      fetch("/api/geo/capa-lluvia")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            pane: "rainPane",
            style: rainZoneStyle,
            onEachFeature: (
              feature: { properties?: Record<string, unknown> },
              layerItem: { bindPopup: (html: string) => void },
            ) => {
              const props = feature.properties ?? {};
              layerItem.bindPopup(
                `<strong>${escapeHtml(props.categoria ?? "Zona de riesgo")}</strong><br>Precipitaciones (Res. 121/14)`,
              );
            },
          });

          rainLayerRef.current = layer;
          if (layerVisibilityRef.current.rain) {
            layer.addTo(map);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGeoLayer((current) => ({
              ...current,
              error: "No se pudo cargar la capa de riesgo por precipitaciones.",
            }));
          }
        });

      fetch("/data/capa-defensa.geojson")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            pane: "defensaPane",
            style: () => ({ color: DEFENSA_COLOR, weight: 4, opacity: 0.9 }),
            onEachFeature: (_feature: unknown, layerItem: { bindPopup: (html: string) => void }) => {
              layerItem.bindPopup("<strong>Línea de defensa</strong>");
            },
          });

          defensaLayerRef.current = layer;
          if (layerVisibilityRef.current.defensa) {
            layer.addTo(map);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGeoLayer((current) => ({ ...current, error: "No se pudo cargar la capa de defensas." }));
          }
        });

      fetch("/data/capa-estaciones-bombeo.geojson")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            pane: "bombeoPane",
            pointToLayer: (feature: { properties?: { clas?: string } }, latlng: unknown) =>
              L.circleMarker(latlng, {
                pane: "bombeoPane",
                radius: 7,
                color: "#ffffff",
                weight: 2,
                fillColor: BOMBEO_COLORS[feature?.properties?.clas ?? ""] ?? "#6b7280",
                fillOpacity: 1,
              }),
            onEachFeature: (
              feature: { properties?: Record<string, unknown> },
              layerItem: { bindPopup: (html: string) => void },
            ) => {
              const props = feature.properties ?? {};
              layerItem.bindPopup(
                `<strong>${escapeHtml(props.nombre ?? "Sin nombre")}</strong><br>${escapeHtml(props.clas ?? "-")}`,
              );
            },
          });

          bombeoLayerRef.current = layer;
          if (layerVisibilityRef.current.bombeo) {
            layer.addTo(map);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGeoLayer((current) => ({
              ...current,
              error: "No se pudo cargar la capa de estaciones de bombeo.",
            }));
          }
        });

      mapInstanceRef.current = map;
    };

    loadLeaflet()
      .then(initializeMap)
      .catch((error: Error) => {
        if (!cancelled) {
          setGeoLayer((current) => ({ ...current, error: error.message }));
        }
      });

    return () => {
      cancelled = true;
      listeners.abort();
      userMarkerRef.current = null;
      pointMarkerRef.current = null;
      riskLayerRef.current = null;
      rainLayerRef.current = null;
      defensaLayerRef.current = null;
      bombeoLayerRef.current = null;
      baseLayersRef.current = null;
      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab]);

  // Mostrar u ocultar capas sin volver a crear el mapa.
  useEffect(() => {
    layerVisibilityRef.current = {
      risk: showRiskLayer,
      rain: showRainLayer,
      defensa: showDefensaLayer,
      bombeo: showBombeoLayer,
    };
    const map = mapInstanceRef.current;
    if (!map) return;

    const layers: Array<[LeafletLayer | null, boolean]> = [
      [riskLayerRef.current, showRiskLayer],
      [rainLayerRef.current, showRainLayer],
      [defensaLayerRef.current, showDefensaLayer],
      [bombeoLayerRef.current, showBombeoLayer],
    ];
    for (const [layer, visible] of layers) {
      if (!layer) continue;
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) layer.remove();
    }
  }, [showRiskLayer, showRainLayer, showDefensaLayer, showBombeoLayer]);

  // Cambiar el mapa base sin volver a crear el mapa.
  useEffect(() => {
    baseMapRef.current = baseMap;
    const map = mapInstanceRef.current;
    const baseLayers = baseLayersRef.current;
    if (!map || !baseLayers) return;

    for (const [key, layer] of Object.entries(baseLayers) as Array<[BaseMapKey, LeafletLayer]>) {
      if (key === baseMap && !map.hasLayer(layer)) layer.addTo(map);
      if (key !== baseMap && map.hasLayer(layer)) layer.remove();
    }
  }, [baseMap]);

  useEffect(() => {
    if (!location) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([location.latitude, location.longitude]);
    } else if (mapInstanceRef.current && window.L) {
      // El mapa se abrió antes de tener la ubicación del usuario.
      userMarkerRef.current = createUserMarker(window.L, mapInstanceRef.current, location);
    }
  }, [location]);

  // Marcador del punto consultado y riesgo de ese punto según los dos mapas.
  useEffect(() => {
    selectedPointRef.current = selectedPoint;

    const map = mapInstanceRef.current;
    if (map && window.L) {
      pointMarkerRef.current?.remove();
      pointMarkerRef.current = selectedPoint ? createPointMarker(window.L, map, selectedPoint) : null;
      if (selectedPoint?.centerMap) {
        map.setView([selectedPoint.latitude, selectedPoint.longitude], 17, { animate: false });
      }
    }

    if (!selectedPoint) return;

    const { latitude, longitude } = selectedPoint;
    let cancelled = false;

    async function loadPointRisk() {
      try {
        setPointRisk({ loading: true, error: null, matches: { rio: [], lluvia: [] } });
        const matches = await fetchRiskMatches(latitude, longitude);
        if (!cancelled) {
          setPointRisk({ loading: false, error: null, matches });
        }
      } catch (error) {
        if (!cancelled) {
          setPointRisk({
            loading: false,
            error: error instanceof Error ? error.message : "No se pudo verificar el riesgo del punto.",
            matches: { rio: [], lluvia: [] },
          });
        }
      }
    }

    loadPointRisk();

    return () => {
      cancelled = true;
    };
  }, [selectedPoint]);

  const searchAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAddressSearch({ loading: true, error: null });

    try {
      const params = new URLSearchParams({
        localidad: addressLocalidad,
        calle: addressStreet.trim(),
        altura: addressNumber.trim(),
      });
      const response = await fetch(`/api/geo/direccion?${params}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "No se encontró la dirección.");
      }

      setSelectedPoint({
        latitude: payload.latitude,
        longitude: payload.longitude,
        label: payload.label,
        exact: payload.exact,
        centerMap: true,
      });
      setAddressSearch({ loading: false, error: null });
    } catch (error) {
      setAddressSearch({
        loading: false,
        error: error instanceof Error ? error.message : "No se pudo buscar la dirección.",
      });
    }
  };

  // Vuelve a mostrar el riesgo de la ubicación del usuario.
  const clearSelectedPoint = () => {
    setSelectedPoint(null);
    setAddressSearch({ loading: false, error: null });
    if (location && mapInstanceRef.current) {
      mapInstanceRef.current.setView([location.latitude, location.longitude], 16, { animate: false });
    }
  };

  // Lo que muestra la pestaña Mapa: el punto consultado o, si no hay, la ubicación del usuario.
  const mapRisk = selectedPoint ? pointRisk : geoLayer;
  const mapRiskHasPoint = selectedPoint !== null || location !== null;
  const mapRiskHasMatch = mapRisk.matches.rio.length > 0 || mapRisk.matches.lluvia.length > 0;

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Pestañas principales">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`${styles.tab} ${activeTab === key ? styles.tabActive : ""}`}
              onClick={() => goToTab(key)}
              role="tab"
              aria-selected={activeTab === key}
            >
              {label}
            </button>
          ))}
        </div>

        <section className={styles.panel}>
          {activeTab === "inicio" ? (
            <div className={styles.cover}>
              <p className={styles.coverKicker}>El fenómeno El Niño trae lluvias e inundaciones</p>
              <h1 className={styles.coverTitle}>¿Estoy en riesgo?</h1>
              <p className={styles.coverText}>
                Mirá el mapa interactivo para saber si estás en una zona de riesgo por lluvia, crecida de ríos, o
                ambos.
              </p>
              <p className={styles.coverNote}>
                Esta app está diseñada para el <strong>AMGR</strong> (Área Metropolitana del Gran Resistencia):
                Resistencia, Barranqueras, Fontana y Puerto Vilelas.
              </p>
              <p className={styles.coverNote}>
                Los datos utilizados se corresponden con la información oficial disponible.
              </p>
              {nextTab ? (
                <button type="button" className={styles.coverButton} onClick={() => goToTab(nextTab.key)}>
                  Siguiente
                  <span aria-hidden="true">→</span>
                </button>
              ) : null}
            </div>
          ) : activeTab === "ayuda" ? (
            <HelpView />
          ) : activeTab === "contacto" ? (
            <ContactView location={location} />
          ) : activeTab === "info" ? (
            <InfoGuide />
          ) : activeTab === "nubes" ? (
            <CloudsView />
          ) : activeTab === "pronosticos" ? (
            <RainForecast />
          ) : activeTab === "mapa" ? (
            <>
              {locationLoading ? (
                <p className={styles.status}>Solicitando coordenadas GPS...</p>
              ) : null}

              {locationError ? (
                <div>
                  <p className={styles.error}>{locationError}</p>
                  <button
                    type="button"
                    className={styles.retryButton}
                    onClick={() => {
                      setLocationError(null);
                      setLocationLoading(true);
                      requestLocation();
                    }}
                  >
                    Reintentar GPS
                  </button>
                </div>
              ) : null}


              {activeTab === "mapa" ? (
                <>
                  <fieldset className={styles.layerToggles}>
                    <legend>Mapa base</legend>
                    <label>
                      <input
                        type="radio"
                        name="baseMap"
                        checked={baseMap === "osm"}
                        onChange={() => setBaseMap("osm")}
                      />
                      OSM
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="baseMap"
                        checked={baseMap === "satelite"}
                        onChange={() => setBaseMap("satelite")}
                      />
                      Satelital
                    </label>
                  </fieldset>
                  <fieldset className={styles.layerToggles}>
                    <legend>Capas</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={showRiskLayer}
                        onChange={(event) => setShowRiskLayer(event.target.checked)}
                      />
                      Riesgo por crecida, Resolución APA 303/17
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showRainLayer}
                        onChange={(event) => setShowRainLayer(event.target.checked)}
                      />
                      Riesgo por precipitaciones, Resolución APA 121/14
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showDefensaLayer}
                        onChange={(event) => setShowDefensaLayer(event.target.checked)}
                      />
                      Líneas de defensa
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showBombeoLayer}
                        onChange={(event) => setShowBombeoLayer(event.target.checked)}
                      />
                      Estaciones de bombeo
                    </label>
                  </fieldset>
                  <div className={styles.mapWrap}>
                    <div ref={mapContainerRef} className={styles.map} />
                  </div>
                  {showRiskLayer ? (
                    <div className={styles.cotasLegend} aria-label="Referencias de riesgo por crecida de ríos">
                      <span className={styles.cotasLegendTitle}>Riesgo por crecida, Resolución APA 303/17</span>
                      {RIVER_LEVELS.map((level) => (
                        <span key={level.tone} className={styles.cotasLegendItem}>
                          <i style={{ background: level.color }} />
                          {level.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {showRainLayer ? (
                    <div className={styles.cotasLegend} aria-label="Referencias de riesgo por precipitaciones">
                      <span className={styles.cotasLegendTitle}>Riesgo por precipitaciones, Resolución APA 121/14</span>
                      {RAIN_LEVELS.map((level) => (
                        <span key={level.tone} className={styles.cotasLegendItem}>
                          <i style={{ background: level.color }} />
                          {level.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {showDefensaLayer || showBombeoLayer ? (
                    <div className={styles.cotasLegend} aria-label="Referencias de defensas y estaciones de bombeo">
                      <span className={styles.cotasLegendTitle}>Sistema de defensa</span>
                      {showDefensaLayer ? (
                        <span className={styles.cotasLegendItem}>
                          <i style={{ background: DEFENSA_COLOR, height: 4 }} />
                          Línea de defensa
                        </span>
                      ) : null}
                      {showBombeoLayer
                        ? Object.entries(BOMBEO_COLORS).map(([label, color]) => (
                            <span key={label} className={styles.cotasLegendItem}>
                              <i style={{ background: color, width: 10, borderRadius: "50%" }} />
                              {label}
                            </span>
                          ))
                        : null}
                    </div>
                  ) : null}
                  <form className={styles.addressForm} onSubmit={searchAddress}>
                    <h3 className={styles.addressTitle}>Consultá un punto en particular</h3>
                    <label>
                      Localidad
                      <select value={addressLocalidad} onChange={(event) => setAddressLocalidad(event.target.value)}>
                        {LOCALIDADES.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Calle
                      <input
                        type="text"
                        value={addressStreet}
                        onChange={(event) => setAddressStreet(event.target.value)}
                        placeholder="Ej.: Av. 9 de Julio"
                        autoComplete="address-line1"
                        required
                        minLength={2}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Altura
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={addressNumber}
                        onChange={(event) => setAddressNumber(event.target.value.replace(/\D/g, ""))}
                        placeholder="Ej.: 500"
                        maxLength={5}
                      />
                    </label>
                    <button type="submit" className={styles.addressButton} disabled={addressSearch.loading}>
                      {addressSearch.loading ? "Buscando..." : "Buscar"}
                    </button>
                    <p className={styles.addressHint}>
                      O tocá el mapa (doble clic con el mouse) para señalar un punto.
                    </p>
                  </form>
                  {addressSearch.error ? <p className={styles.error}>{addressSearch.error}</p> : null}
                </>
              ) : null}

              {mapRiskHasPoint ? (
                <div className={styles.pointBar}>
                  <div>
                    <span>{selectedPoint ? "Riesgo del punto consultado" : "Riesgo de tu ubicación actual"}</span>
                    <strong>{selectedPoint ? selectedPoint.label : "Tu ubicación (GPS)"}</strong>
                  </div>
                  {selectedPoint && location ? (
                    <button type="button" className={styles.pointBarButton} onClick={clearSelectedPoint}>
                      Volver a mi ubicación
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className={styles.geoNeutral}>
                  Buscá una dirección o tocá el mapa para conocer el riesgo hídrico de un punto.
                </p>
              )}

              {selectedPoint?.exact === false ? (
                <p className={styles.status}>
                  La altura no figura en el mapa: se marcó un punto de la calle. Si no es el lugar, tocá el mapa
                  para ajustarlo.
                </p>
              ) : null}

              {mapRisk.loading ? <p className={styles.status}>Verificando las capas de riesgo...</p> : null}
              {mapRisk.error ? <p className={styles.error}>{mapRisk.error}</p> : null}

              {!mapRisk.loading && !mapRisk.error && mapRiskHasPoint ? (
                mapRiskHasMatch ? (
                  <div className={styles.geoInfo}>
                    {RISK_MAPS.map(({ key, title }) => {
                      const match = mapRisk.matches[key][0];
                      const category = typeof match?.properties?.categoria === "string"
                        ? match.properties.categoria
                        : null;
                      const meaning = category ? getZoneMeaning(key, getDangerLevel(category).tone) : null;
                      const color = levelColor(key === "rio" ? RIVER_LEVELS : RAIN_LEVELS, category ?? undefined);

                      return (
                        <div key={key} className={styles.geoMatch}>
                          <div className={styles.geoMatchHeader}>
                            <span>{title}</span>
                            <strong>
                              {category ? <i className={styles.geoMatchSwatch} style={{ background: color }} /> : null}
                              {category ?? "Fuera de zona de riesgo"}
                            </strong>
                          </div>
                          {meaning ? <p className={styles.geoMatchMeta}>{meaning}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.geoNeutral}>
                    {selectedPoint ? "Este punto" : "Tu ubicación"} no coincide con ninguna zona de riesgo hídrico.
                  </p>
                )
              ) : null}
            </>
          ) : activeTab === "crecida" ? (
            <>
              {riskLoading ? <p className={styles.status}>Cargando información del río...</p> : null}
              {riskError ? <p className={styles.error}>{riskError}</p> : null}

              {riskData ? (
                <>
                  <h2 className={styles.riverTitle}>
                    Estado actual del río Paraná en el puerto Barranqueras
                  </h2>
                  <div className={styles.riverGaugeCard}>
                    <RiverGauge
                      actual={toMeters(riskData.alturaActual)}
                      alerta={toMeters(riskData.alerta)}
                      evacuacion={toMeters(riskData.evacuacion)}
                    />
                  </div>
                  <div className={styles.resultGrid}>
                    <div className={styles.metric}>
                      <span>Variación</span>
                      <strong>{formatMetricValue(riskData.variacion)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Fecha y hora de última medición</span>
                      <strong>{formatMeasurementDate(riskData.fechaHoraActual)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Estado</span>
                      <strong className={styles.trendValue}>
                        <TrendArrow state={riskData.tendencia} />
                        {formatMetricValue(riskData.tendencia)}
                      </strong>
                    </div>
                  </div>
                  <p className={styles.sourceLink}>
                    Fuente:{" "}
                    <a
                      href="https://contenidosweb.prefecturanaval.gob.ar/alturas/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Prefectura Naval Argentina · Altura de los ríos
                    </a>
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <div className={styles.riskZoneCard}>
              <div className={styles.zoneHeader}>
                <span>Zona de riesgo hídrico de tu ubicación</span>
              </div>

              <RiskBars rio={riskBarState("rio")} lluvia={riskBarState("lluvia")} />
              <RiskLevelsGuide rio={riskBarState("rio")} lluvia={riskBarState("lluvia")} />
            </div>
          )}

          {activeTab !== "inicio" && nextTab ? (
            <div className={styles.nextNav}>
              <button type="button" className={styles.coverButton} onClick={() => goToTab(nextTab.key)}>
                Siguiente: {nextTab.label}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : null}
        </section>
      </main>

      <BottomNav tabs={TABS} primary={PRIMARY_TABS} active={activeTab} onSelect={goToTab} />
    </div>
  );
}
