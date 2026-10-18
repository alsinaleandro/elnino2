"use client";

import { useEffect, useRef, useState } from "react";
import BottomNav from "./BottomNav";
import CloudsView from "./CloudsView";
import HelpView from "./HelpView";
import InfoGuide from "./InfoGuide";
import { loadLeaflet, removeMap } from "./leaflet";
import RainForecast from "./RainForecast";
import RiskBars, {
  getDangerLevel,
  RiskLevelsGuide,
  type DangerTone,
  type RiskBarState,
} from "./RiskBars";
import RiverGauge from "./RiverGauge";
import { COTA_LEVELS } from "@/lib/cotas";
import styles from "./page.module.css";

// Lo mínimo que se usa de una capa de Leaflet para mostrarla u ocultarla.
type LeafletLayer = { addTo(map: unknown): unknown; remove(): unknown };

type RiskMatch = { id?: string | number; name?: string; properties?: Record<string, unknown> };

// Las dos capas de riesgo hídrico; la clave coincide con la respuesta de /api/geo/contains.
const RISK_MAPS = [
  { key: "rio", title: "Riesgo por crecida del río Negro" },
  { key: "lluvia", title: "Riesgo por precipitaciones" },
] as const;
type RiskMapKey = (typeof RISK_MAPS)[number]["key"];

// Pestañas en el orden en que se muestran; la app abre en la portada ("inicio").
const TABS = [
  { key: "inicio", label: "Inicio" },
  { key: "riesgo", label: "Riesgo" },
  { key: "crecida", label: "Crecida" },
  { key: "info", label: "Información" },
  { key: "mapa", label: "Mapa" },
  { key: "pronosticos", label: "Pronósticos" },
  { key: "nubes", label: "Nubes" },
  { key: "ayuda", label: "Ayuda" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Pestañas fijas de la barra inferior del celular; el resto va en el menú "Más".
const PRIMARY_TABS: readonly TabKey[] = ["inicio", "riesgo", "crecida", "mapa"];

// Colores de las estaciones de bombeo según su clasificación (propiedad `clas`).
const BOMBEO_COLORS: Record<string, string> = {
  "Estación de Bombeo": "#0ea5e9",
  "Obra de Control": "#f97316",
  Alcantarilla: "#a855f7",
};
const DEFENSA_COLOR = "#7c2d12";

const escapeHtml = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Colores de las dos capas de riesgo en el mapa, de menor a mayor peligro. Cada capa tiene su
// propia familia de colores para poder verlas juntas: el río es un relleno azul y las
// precipitaciones un rayado cálido sobre fondo casi transparente, que deja ver el azul debajo.
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

const rainPatternId = (color: string) => `lluvia-rayas-${color.slice(1)}`;

const rainZoneStyle = (feature?: ZoneFeature) => {
  const color = levelColor(RAIN_LEVELS, feature?.properties?.categoria);
  return { color, weight: 2, opacity: 0.95, fillColor: `url(#${rainPatternId(color)})`, fillOpacity: 1 };
};

// Leaflet dibuja los polígonos de cada pane en un <svg> propio: se le agregan los patrones de
// rayas que usa la capa de precipitaciones como relleno.
function addRainPatterns(pane: HTMLElement) {
  const svg: SVGSVGElement | null = pane.querySelector("svg");
  if (!svg) {
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(ns, "defs"), svg.firstChild);

  for (const color of [...RAIN_LEVELS.map((level) => level.color), NO_LEVEL_COLOR]) {
    if (svg.querySelector(`#${rainPatternId(color)}`)) continue;

    const pattern = document.createElementNS(ns, "pattern");
    pattern.setAttribute("id", rainPatternId(color));
    pattern.setAttribute("width", "8");
    pattern.setAttribute("height", "8");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("patternTransform", "rotate(-45)");

    // Fondo apenas teñido + raya de 3 px del color del nivel.
    for (const [width, opacity] of [[8, 0.15], [3, 0.9]] as const) {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", "8");
      rect.setAttribute("fill", color);
      rect.setAttribute("fill-opacity", String(opacity));
      pattern.appendChild(rect);
    }

    defs.appendChild(pattern);
  }
}

// Con esta precisión se deja de escuchar al GPS.
const GOOD_ACCURACY_METERS = 25;
const GPS_WATCH_MAX_MS = 45000;

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>("inicio");
  const nextTab = TABS[TABS.findIndex((tab) => tab.key === activeTab) + 1];
  const tabsRef = useRef<HTMLDivElement | null>(null);

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
  // Zonas de cada mapa de riesgo (río y precipitaciones) que contienen la ubicación del usuario.
  const [geoLayer, setGeoLayer] = useState<{
    loading: boolean;
    error: string | null;
    matches: Record<RiskMapKey, RiskMatch[]>;
  }>({
    loading: false,
    error: null,
    matches: { rio: [], lluvia: [] },
  });
  // Capas visibles en la pestaña Mapa (casilleros tipo GIS).
  const [showRiskLayer, setShowRiskLayer] = useState(true);
  const [showRainLayer, setShowRainLayer] = useState(false);
  const [showCotasLayer, setShowCotasLayer] = useState(false);
  const [showDefensaLayer, setShowDefensaLayer] = useState(false);
  const [showBombeoLayer, setShowBombeoLayer] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const riskLayerRef = useRef<LeafletLayer | null>(null);
  const rainLayerRef = useRef<LeafletLayer | null>(null);
  const cotasLayerRef = useRef<LeafletLayer | null>(null);
  const defensaLayerRef = useRef<LeafletLayer | null>(null);
  const bombeoLayerRef = useRef<LeafletLayer | null>(null);
  const layerVisibilityRef = useRef({ risk: true, rain: false, cotas: false, defensa: false, bombeo: false });
  const isRiskMatchResolved = !locationLoading && !geoLayer.loading && !geoLayer.error;
  const hasAnyRiskMatch = geoLayer.matches.rio.length > 0 || geoLayer.matches.lluvia.length > 0;

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

        const response = await fetch(
          `/api/geo/contains?lng=${longitude}&lat=${latitude}`,
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudieron consultar las capas de riesgo.");
        }

        if (!cancelled) {
          setGeoLayer({
            loading: false,
            error: null,
            matches: { rio: payload.rio?.matches ?? [], lluvia: payload.lluvia?.matches ?? [] },
          });
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

  // El mapa se crea una sola vez (cuando llega la primera posición); las posiciones más
  // precisas que llegan después solo mueven el marcador, en el efecto siguiente.
  const hasLocation = location !== null;
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

    if (!location || !mapContainerRef.current) {
      return;
    }

    let cancelled = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initializeMap = (L: any) => {
      if (cancelled) {
        return;
      }

      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([location.latitude, location.longitude], 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        // 19 = zoom máximo con tiles propios de OpenStreetMap (nivel de cuadra / lote).
        maxZoom: 19,
      }).addTo(map);

      // Un pane por capa fija el orden de dibujo aunque se oculten y vuelvan a mostrar:
      // cotas abajo, el relleno del río encima y el rayado de precipitaciones sobre él (así se ven
      // las dos), luego defensas y estaciones de bombeo, y el marcador del usuario arriba de todo.
      map.createPane("cotasPane").style.zIndex = "410";
      map.createPane("riskPane").style.zIndex = "415";
      map.createPane("rainPane").style.zIndex = "420";
      map.createPane("defensaPane").style.zIndex = "430";
      map.createPane("bombeoPane").style.zIndex = "440";
      map.createPane("userPane").style.zIndex = "650";

      const userMarker = L.circleMarker([location.latitude, location.longitude], {
        pane: "userPane",
        // Negro con borde blanco: se distingue sobre el relleno azul del río y el rayado cálido
        // de precipitaciones.
        radius: 9,
        color: "#ffffff",
        fillColor: "#111827",
        fillOpacity: 1,
        weight: 3,
      });
      userMarker.addTo(map);
      userMarker.bindPopup("Tu ubicación actual");
      userMarkerRef.current = userMarker;

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
              const area = feature?.properties?.area_ha ?? "-";
              layerItem.bindPopup(`<strong>${category}</strong><br>Crecida del río Negro<br>Área: ${area} ha`);
            },
          });

          riskLayerRef.current = layer;
          if (layerVisibilityRef.current.risk) {
            layer.addTo(map);
          }

          if (layer.getBounds && layer.getBounds().isValid()) {
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

          // Relleno rayado: un patrón SVG que se agrega al SVG donde Leaflet dibuja la capa.
          const layer = L.geoJSON(geojsonData, {
            pane: "rainPane",
            style: rainZoneStyle,
            onEachFeature: (
              feature: { properties?: Record<string, unknown> },
              layerItem: { bindPopup: (html: string) => void },
            ) => {
              const props = feature.properties ?? {};
              layerItem.bindPopup(
                `<strong>${escapeHtml(props.categoria ?? "Zona de riesgo")}</strong><br>Precipitaciones (Res. 121/14)<br>Área: ${escapeHtml(props.area_ha ?? "-")} ha`,
              );
            },
          });

          rainLayerRef.current = layer;
          if (layerVisibilityRef.current.rain) {
            layer.addTo(map);
            addRainPatterns(map.getPane("rainPane"));
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

      fetch("/api/geo/cotas")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            pane: "cotasPane",
            style: (feature?: { properties?: { nivel?: number } }) => {
              const color = COTA_LEVELS[feature?.properties?.nivel ?? 0]?.color ?? "#6b7280";
              // Borde blanco fino: separa rangos vecinos de tonos parecidos.
              return { color: "#ffffff", weight: 1, opacity: 0.7, fillColor: color, fillOpacity: 0.7 };
            },
            onEachFeature: (
              feature: { properties?: Record<string, unknown> },
              layerItem: { bindPopup: (html: string) => void },
            ) => {
              const props = feature.properties ?? {};
              layerItem.bindPopup(
                `<strong>Cota del terreno: ${props.rango ?? "-"}</strong><br>Hidrómetro Barranqueras: ${props.altura_hidrometro_barranqueras ?? "-"}`,
              );
            },
          });

          cotasLayerRef.current = layer;
          if (layerVisibilityRef.current.cotas) {
            layer.addTo(map);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setGeoLayer((current) => ({ ...current, error: "No se pudo cargar el mapa de cotas." }));
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
      userMarkerRef.current = null;
      riskLayerRef.current = null;
      rainLayerRef.current = null;
      cotasLayerRef.current = null;
      defensaLayerRef.current = null;
      bombeoLayerRef.current = null;
      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, hasLocation]);

  // Mostrar u ocultar capas sin volver a crear el mapa.
  useEffect(() => {
    layerVisibilityRef.current = {
      risk: showRiskLayer,
      rain: showRainLayer,
      cotas: showCotasLayer,
      defensa: showDefensaLayer,
      bombeo: showBombeoLayer,
    };
    const map = mapInstanceRef.current;
    if (!map) return;

    const layers: Array<[LeafletLayer | null, boolean]> = [
      [riskLayerRef.current, showRiskLayer],
      [rainLayerRef.current, showRainLayer],
      [cotasLayerRef.current, showCotasLayer],
      [defensaLayerRef.current, showDefensaLayer],
      [bombeoLayerRef.current, showBombeoLayer],
    ];
    for (const [layer, visible] of layers) {
      if (!layer) continue;
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) layer.remove();
    }

    if (showRainLayer && rainLayerRef.current) {
      addRainPatterns(map.getPane("rainPane"));
    }
  }, [showRiskLayer, showRainLayer, showCotasLayer, showDefensaLayer, showBombeoLayer]);

  useEffect(() => {
    if (location && userMarkerRef.current) {
      userMarkerRef.current.setLatLng([location.latitude, location.longitude]);
    }
  }, [location]);

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
              {nextTab ? (
                <button type="button" className={styles.coverButton} onClick={() => goToTab(nextTab.key)}>
                  Siguiente
                  <span aria-hidden="true">→</span>
                </button>
              ) : null}
            </div>
          ) : activeTab === "ayuda" ? (
            <HelpView />
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

              {activeTab === "mapa" && location ? (
                <>
                  <fieldset className={styles.layerToggles}>
                    <legend>Capas</legend>
                    <label>
                      <input
                        type="checkbox"
                        checked={showRiskLayer}
                        onChange={(event) => setShowRiskLayer(event.target.checked)}
                      />
                      Riesgo por crecida del río Negro
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showRainLayer}
                        onChange={(event) => setShowRainLayer(event.target.checked)}
                      />
                      Riesgo por precipitaciones
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showCotasLayer}
                        onChange={(event) => setShowCotasLayer(event.target.checked)}
                      />
                      Mapa de cotas
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
                    <div className={styles.cotasLegend} aria-label="Referencias de riesgo por crecida del río Negro">
                      <span className={styles.cotasLegendTitle}>Riesgo por crecida del río Negro</span>
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
                      <span className={styles.cotasLegendTitle}>Riesgo por precipitaciones</span>
                      {RAIN_LEVELS.map((level) => (
                        <span key={level.tone} className={styles.cotasLegendItem}>
                          <i
                            className={styles.legendHatch}
                            style={{ color: level.color, borderColor: level.color }}
                          />
                          {level.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {showCotasLayer ? (
                    <div className={styles.cotasLegend} aria-label="Referencias del mapa de cotas">
                      <span className={styles.cotasLegendTitle}>Cota del terreno (MOP)</span>
                      {COTA_LEVELS.map((level) => (
                        <span key={level.file} className={styles.cotasLegendItem}>
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
                </>
              ) : null}

              {geoLayer.loading ? <p className={styles.status}>Verificando las capas de riesgo...</p> : null}
              {geoLayer.error ? <p className={styles.error}>{geoLayer.error}</p> : null}

              {!geoLayer.loading && !geoLayer.error && location ? (
                hasAnyRiskMatch ? (
                  <div className={styles.geoInfo}>
                    {RISK_MAPS.map(({ key, title }) => {
                      const match = geoLayer.matches[key][0];
                      const category = typeof match?.properties?.categoria === "string"
                        ? match.properties.categoria
                        : null;
                      const area = match?.properties?.area_ha ?? "-";

                      return (
                        <div key={key} className={styles.geoMatch}>
                          <div className={styles.geoMatchHeader}>
                            <span>{title}</span>
                            <strong>{category ?? "Fuera de zona de riesgo"}</strong>
                          </div>
                          {category ? (
                            <div className={styles.geoMatchMeta}>
                              <span>Área de la zona: {String(area)} ha</span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.geoNeutral}>Tu ubicación no coincide con ninguna zona de riesgo hídrico.</p>
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
                      <strong>{formatMetricValue(riskData.tendencia)}</strong>
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
