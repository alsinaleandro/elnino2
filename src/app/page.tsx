"use client";

import { useEffect, useRef, useState } from "react";
import CloudsView from "./CloudsView";
import { loadLeaflet, removeMap } from "./leaflet";
import RainForecast from "./RainForecast";
import RiskBars, { DANGER_COLORS, getDangerLevel, type DangerTone, type RiskBarState } from "./RiskBars";
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

// Colores de las estaciones de bombeo según su clasificación (propiedad `clas`).
const BOMBEO_COLORS: Record<string, string> = {
  "Estación de Bombeo": "#0ea5e9",
  "Obra de Control": "#f97316",
  Alcantarilla: "#a855f7",
};
const DEFENSA_COLOR = "#7c2d12";

const escapeHtml = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Zonas con relleno rayado: "leve regulada" (río) y "severa temporaria" (precipitaciones).
const STRIPED_TONES = ["dangerRegulated", "dangerTemporary"] as const satisfies DangerTone[];
const stripesPatternId = (tone: DangerTone) => `zona-rayas-${tone}`;

// Leaflet dibuja los polígonos de cada pane en un <svg> propio: se le agregan los patrones de
// rayas que usan las zonas rayadas como relleno.
function addStripesPatterns(pane: HTMLElement) {
  const svg: SVGSVGElement | null = pane.querySelector("svg");
  if (!svg) {
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(ns, "defs"), svg.firstChild);

  for (const tone of STRIPED_TONES) {
    if (svg.querySelector(`#${stripesPatternId(tone)}`)) continue;

    const pattern = document.createElementNS(ns, "pattern");
    pattern.setAttribute("id", stripesPatternId(tone));
    pattern.setAttribute("width", "10");
    pattern.setAttribute("height", "10");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("patternTransform", "rotate(45)");

    const { fill, stripe = fill } = DANGER_COLORS[tone];
    for (const [width, color] of [[10, fill], [4, stripe]] as const) {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("width", String(width));
      rect.setAttribute("height", "10");
      rect.setAttribute("fill", color);
      pattern.appendChild(rect);
    }

    defs.appendChild(pattern);
  }
}

// Estilo de los polígonos de una capa de riesgo, con los mismos colores que las barras de la
// pestaña Riesgo. `dashArray` distingue la capa de precipitaciones cuando se ven las dos.
const riskZoneStyle = (dashArray?: string) => (feature?: { properties?: { categoria?: string } }) => {
  const tone = getDangerLevel(feature?.properties?.categoria).tone;
  const colors = DANGER_COLORS[tone];
  const striped = (STRIPED_TONES as readonly DangerTone[]).includes(tone);
  return {
    color: colors.stroke,
    weight: 1.5,
    dashArray,
    fillColor: striped ? `url(#${stripesPatternId(tone)})` : colors.fill,
    fillOpacity: striped ? 0.5 : 0.4,
  };
};

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
  const [activeTab, setActiveTab] = useState<"mapa" | "riesgo" | "pronosticos" | "nubes">("mapa");
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
      // cotas abajo, riesgo por precipitaciones y por crecida del río encima, luego defensas y
      // estaciones de bombeo, y el marcador del usuario arriba de todo.
      map.createPane("cotasPane").style.zIndex = "410";
      map.createPane("rainPane").style.zIndex = "415";
      map.createPane("riskPane").style.zIndex = "420";
      map.createPane("defensaPane").style.zIndex = "430";
      map.createPane("bombeoPane").style.zIndex = "440";
      map.createPane("userPane").style.zIndex = "650";

      const userMarker = L.circleMarker([location.latitude, location.longitude], {
        pane: "userPane",
        // Azul con borde blanco: se distingue sobre las zonas roja, amarilla y verde.
        radius: 9,
        color: "#ffffff",
        fillColor: "#2563eb",
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

          // Mismos colores que el indicador de la pestaña Riesgo. La zona "leve regulada" usa un
          // relleno rayado: un patrón SVG que se agrega al SVG donde Leaflet dibuja la capa.
          const layer = L.geoJSON(geojsonData, {
            pane: "riskPane",
            style: riskZoneStyle(),
            onEachFeature: (feature: any, layerItem: any) => {
              const category = feature?.properties?.categoria ?? "Zona de riesgo";
              const area = feature?.properties?.area_ha ?? "-";
              layerItem.bindPopup(`<strong>${category}</strong><br>Crecida del río Negro<br>Área: ${area} ha`);
            },
          });

          riskLayerRef.current = layer;
          if (layerVisibilityRef.current.risk) {
            layer.addTo(map);
            addStripesPatterns(map.getPane("riskPane"));
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

          // Mismos colores que la capa del río; el borde punteado la distingue cuando se ven las dos.
          const layer = L.geoJSON(geojsonData, {
            pane: "rainPane",
            style: riskZoneStyle("6 4"),
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
            addStripesPatterns(map.getPane("rainPane"));
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

    if (showRiskLayer && riskLayerRef.current) {
      addStripesPatterns(map.getPane("riskPane"));
    }
    if (showRainLayer && rainLayerRef.current) {
      addStripesPatterns(map.getPane("rainPane"));
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

        <div className={styles.tabs} role="tablist" aria-label="Pestañas principales">
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "mapa" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("mapa")}
            role="tab"
            aria-selected={activeTab === "mapa"}
          >
            Mapa
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "riesgo" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("riesgo")}
            role="tab"
            aria-selected={activeTab === "riesgo"}
          >
            Riesgo
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "pronosticos" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("pronosticos")}
            role="tab"
            aria-selected={activeTab === "pronosticos"}
          >
            Pronósticos
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === "nubes" ? styles.tabActive : ""}`}
            onClick={() => setActiveTab("nubes")}
            role="tab"
            aria-selected={activeTab === "nubes"}
          >
            Nubes
          </button>
        </div>

        <section className={styles.panel}>
          {activeTab === "nubes" ? (
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
          ) : (
            <>
              {riskLoading ? <p className={styles.status}>Cargando información del río...</p> : null}
              {riskError ? <p className={styles.error}>{riskError}</p> : null}

              <div className={styles.riskZoneCard}>
                <div className={styles.zoneHeader}>
                  <span>Zona de riesgo hídrico de tu ubicación</span>
                </div>

                <RiskBars rio={riskBarState("rio")} lluvia={riskBarState("lluvia")} />
              </div>

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
                </>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
