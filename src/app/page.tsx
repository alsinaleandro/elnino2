"use client";

import { useEffect, useRef, useState } from "react";
import CloudsView from "./CloudsView";
import CotaCard from "./CotaCard";
import DangerGauge, { DANGER_COLORS, type DangerTone } from "./DangerGauge";
import { loadLeaflet, removeMap } from "./leaflet";
import RainForecast from "./RainForecast";
import RiverGauge from "./RiverGauge";
import { COTA_LEVELS, type CotaMatch } from "@/lib/cotas";
import styles from "./page.module.css";

const normalizeRiskText = (value?: string | null) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getDangerLevel = (category?: string | null): { label: string; tone: DangerTone } => {
  const normalized = normalizeRiskText(category);

  if (normalized.includes("PROHIBIDA")) {
    return { label: "ZONA PROHIBIDA", tone: "dangerHigh" };
  }

  if (normalized.includes("RESTRICCION SEVERA")) {
    return { label: "ZONA DE RESTRICCION SEVERA", tone: "dangerSevere" };
  }

  if (normalized.includes("RESTRICCION LEVE REGULADA")) {
    return { label: "ZONA DE RESTRICCION LEVE REGULADA", tone: "dangerRegulated" };
  }

  if (normalized.includes("RESTRICCION LEVE")) {
    return { label: "ZONA DE RESTRICCION LEVE", tone: "dangerLight" };
  }

  return { label: "SIN ZONA COINCIDENTE", tone: "dangerNeutral" };
};

// Lo mínimo que se usa de una capa de Leaflet para mostrarla u ocultarla.
type LeafletLayer = { addTo(map: unknown): unknown; remove(): unknown };

const STRIPES_PATTERN_ID = "zona-regulada-rayas";

// Leaflet dibuja los polígonos en un <svg> propio: se le agrega el patrón de rayas amarillas
// que usa la zona "leve regulada" como relleno.
function addStripesPattern(pane: HTMLElement) {
  const svg: SVGSVGElement | null = pane.querySelector("svg");
  if (!svg || svg.querySelector(`#${STRIPES_PATTERN_ID}`)) {
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  const defs = svg.querySelector("defs") ?? svg.insertBefore(document.createElementNS(ns, "defs"), svg.firstChild);
  const pattern = document.createElementNS(ns, "pattern");
  pattern.setAttribute("id", STRIPES_PATTERN_ID);
  pattern.setAttribute("width", "10");
  pattern.setAttribute("height", "10");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternTransform", "rotate(45)");

  const { fill } = DANGER_COLORS.dangerRegulated;
  for (const [x, width, color] of [[0, 10, fill], [0, 4, "#9be89b"]] as const) {
    const rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", "10");
    rect.setAttribute("fill", color);
    pattern.appendChild(rect);
  }

  defs.appendChild(pattern);
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
  const [geoLayer, setGeoLayer] = useState<{
    loading: boolean;
    error: string | null;
    matches: Array<{ id?: string | number; name?: string; properties?: Record<string, unknown> }>;
  }>({
    loading: false,
    error: null,
    matches: [],
  });
  const [userCota, setUserCota] = useState<{ loading: boolean; error: string | null; cota: CotaMatch | null }>({
    loading: false,
    error: null,
    cota: null,
  });
  // Capas visibles en la pestaña Mapa (casilleros tipo GIS).
  const [showRiskLayer, setShowRiskLayer] = useState(true);
  const [showCotasLayer, setShowCotasLayer] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const riskLayerRef = useRef<LeafletLayer | null>(null);
  const cotasLayerRef = useRef<LeafletLayer | null>(null);
  const layerVisibilityRef = useRef({ risk: true, cotas: false });
  const matchedRiskCategory =
    geoLayer.matches[0]?.properties?.categoria != null
      ? String(geoLayer.matches[0].properties?.categoria)
      : null;
  const matchedRiskLevel = getDangerLevel(matchedRiskCategory);
  const isRiskMatchResolved = !locationLoading && !geoLayer.loading && !geoLayer.error;

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
          current.matches.length > 0 ? current : { loading: true, error: null, matches: [] },
        );

        const response = await fetch(
          `/api/geo/contains?lng=${longitude}&lat=${latitude}`,
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo consultar la capa de riesgo.");
        }

        if (!cancelled) {
          setGeoLayer({
            loading: false,
            error: null,
            matches: payload.matches ?? [],
          });
        }
      } catch (error) {
        if (!cancelled) {
          setGeoLayer({
            loading: false,
            error:
              error instanceof Error ? error.message : "No se pudo verificar la capa geográfica.",
            matches: [],
          });
        }
      }
    }

    // Cota del terreno en la misma posición (mapas de cotas, /api/geo/cota).
    async function loadCota() {
      try {
        setUserCota((current) => (current.cota ? current : { loading: true, error: null, cota: null }));
        const response = await fetch(`/api/geo/cota?lng=${longitude}&lat=${latitude}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo consultar el mapa de cotas.");
        }

        if (!cancelled) {
          setUserCota({ loading: false, error: null, cota: payload.cota ?? null });
        }
      } catch (error) {
        if (!cancelled) {
          setUserCota({
            loading: false,
            error: error instanceof Error ? error.message : "No se pudo consultar el mapa de cotas.",
            cota: null,
          });
        }
      }
    }

    loadGeoLayer();
    loadCota();

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
        maxZoom: 15,
      }).addTo(map);

      // Un pane por capa fija el orden de dibujo aunque se oculten y vuelvan a mostrar:
      // cotas abajo, zonas de riesgo encima y el marcador del usuario arriba de todo.
      map.createPane("cotasPane").style.zIndex = "410";
      map.createPane("riskPane").style.zIndex = "420";
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
          // relleno amarillo rayado: un patrón SVG que se agrega al SVG donde Leaflet dibuja la capa.
          const layer = L.geoJSON(geojsonData, {
            pane: "riskPane",
            style: (feature?: { properties?: { categoria?: string } }) => {
              const tone = getDangerLevel(feature?.properties?.categoria).tone;
              const colors = DANGER_COLORS[tone];
              return {
                color: colors.stroke,
                weight: 1.5,
                fillColor: tone === "dangerRegulated" ? `url(#${STRIPES_PATTERN_ID})` : colors.fill,
                fillOpacity: tone === "dangerRegulated" ? 0.5 : 0.4,
              };
            },
            onEachFeature: (feature: any, layerItem: any) => {
              const category = feature?.properties?.categoria ?? "Zona de riesgo";
              const area = feature?.properties?.area_ha ?? "-";
              layerItem.bindPopup(`<strong>${category}</strong><br>Área: ${area} ha`);
            },
          });

          riskLayerRef.current = layer;
          if (layerVisibilityRef.current.risk) {
            layer.addTo(map);
            addStripesPattern(map.getPane("riskPane"));
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
      cotasLayerRef.current = null;
      if (mapInstanceRef.current) {
        removeMap(mapInstanceRef.current);
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, hasLocation]);

  // Mostrar u ocultar capas sin volver a crear el mapa.
  useEffect(() => {
    layerVisibilityRef.current = { risk: showRiskLayer, cotas: showCotasLayer };
    const map = mapInstanceRef.current;
    if (!map) return;

    const layers: Array<[LeafletLayer | null, boolean]> = [
      [riskLayerRef.current, showRiskLayer],
      [cotasLayerRef.current, showCotasLayer],
    ];
    for (const [layer, visible] of layers) {
      if (!layer) continue;
      if (visible && !map.hasLayer(layer)) layer.addTo(map);
      if (!visible && map.hasLayer(layer)) layer.remove();
    }

    if (showRiskLayer && riskLayerRef.current) {
      addStripesPattern(map.getPane("riskPane"));
    }
  }, [showRiskLayer, showCotasLayer]);

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
                      Zonas de riesgo
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showCotasLayer}
                        onChange={(event) => setShowCotasLayer(event.target.checked)}
                      />
                      Mapa de cotas
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
                </>
              ) : null}

              {geoLayer.loading ? <p className={styles.status}>Verificando la capa de riesgo...</p> : null}
              {geoLayer.error ? <p className={styles.error}>{geoLayer.error}</p> : null}

              {!geoLayer.loading && !geoLayer.error && location ? (
                geoLayer.matches.length > 0 ? (
                  <div className={styles.geoInfo}>
                    {geoLayer.matches.map((match, index) => {
                      const category = typeof match.properties?.categoria === "string"
                        ? match.properties.categoria
                        : "Zona de riesgo";
                      const area = match.properties?.area_ha ?? "-";
                      const layerName = match.name || category;

                      return (
                        <div key={`${match.id ?? index}`} className={styles.geoMatch}>
                          <div className={styles.geoMatchHeader}>
                            <span>Capa coincidente</span>
                            <strong>{String(layerName)}</strong>
                          </div>
                          <div className={styles.geoMatchMeta}>
                            <span>Categoría: {String(category)}</span>
                            <span>Área: {String(area)} ha</span>
                          </div>
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
                  <span>Zona coincidente</span>
                  <span className={`${styles.dangerBadge} ${styles[matchedRiskLevel.tone]}`}>
                    {isRiskMatchResolved && geoLayer.matches.length > 0
                      ? matchedRiskLevel.label
                      : locationLoading || geoLayer.loading
                        ? "CARGANDO..."
                        : "SIN ZONA COINCIDENTE"}
                  </span>
                </div>

                <DangerGauge
                  tone={isRiskMatchResolved && geoLayer.matches.length > 0 ? matchedRiskLevel.tone : null}
                  label={isRiskMatchResolved && geoLayer.matches.length > 0 ? matchedRiskLevel.label : "sin zona coincidente"}
                />
              </div>

              <CotaCard
                cota={userCota.cota}
                loading={locationLoading || userCota.loading}
                error={userCota.error}
                riverHeight={riskData ? toMeters(riskData.alturaActual) : null}
              />

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
                      user={userCota.cota ? { min: userCota.cota.hidrometroMin, max: userCota.cota.hidrometroMax } : null}
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
