"use client";

import { useEffect, useRef, useState } from "react";
import DangerGauge, { type DangerTone } from "./DangerGauge";
import styles from "./page.module.css";

declare global {
  interface Window {
    L?: any;
  }
}

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

  if (normalized.includes("RESTRICCION SEVERA TEMPORARIA")) {
    return { label: "ZONA DE RESTRICCION SEVERA TEMPORARIA", tone: "dangerTemporary" };
  }

  if (normalized.includes("RESTRICCION SEVERA")) {
    return { label: "ZONA DE RESTRICCION SEVERA", tone: "dangerSevere" };
  }

  if (normalized.includes("RESTRICCION LEVE")) {
    return { label: "ZONA DE RESTRICCION LEVE", tone: "dangerLight" };
  }

  return { label: "SIN ZONA COINCIDENTE", tone: "dangerNeutral" };
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<"mapa" | "riesgo">("mapa");
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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
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
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!location || !mapContainerRef.current) {
      return;
    }

    let cancelled = false;

    const initializeMap = () => {
      if (cancelled || typeof window === "undefined") {
        return;
      }

      const L = window.L;

      if (!L) {
        const cssLink = document.querySelector("link[data-leaflet-css]");
        if (!cssLink) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          link.setAttribute("data-leaflet-css", "true");
          document.head.appendChild(link);
        }

        const script = document.createElement("script");
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.async = true;
        script.onload = initializeMap;
        document.body.appendChild(script);
        return;
      }

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([location.latitude, location.longitude], 16);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 15,
      }).addTo(map);

      const userMarker = L.circleMarker([location.latitude, location.longitude], {
        radius: 10,
        color: "#dc2626",
        fillColor: "#ef4444",
        fillOpacity: 0.95,
        weight: 2,
      });
      userMarker.addTo(map);
      userMarker.bindPopup("Tu ubicación actual");
      userMarkerRef.current = userMarker;

      fetch("/data/riesgo_hidrico_AMGR_todas.geojson")
        .then((response) => response.json())
        .then((geojsonData) => {
          if (cancelled) {
            return;
          }

          const layer = L.geoJSON(geojsonData, {
            onEachFeature: (feature: any, layerItem: any) => {
              const category = feature?.properties?.categoria ?? "Zona de riesgo";
              const area = feature?.properties?.area_ha ?? "-";
              layerItem.bindPopup(`<strong>${category}</strong><br>Área: ${area} ha`);
            },
          });

          layer.addTo(map);

          if (layer.getBounds && layer.getBounds().isValid()) {
            map.fitBounds(layer.getBounds().pad(0.2));
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

      mapInstanceRef.current = map;
    };

    initializeMap();

    return () => {
      cancelled = true;
      userMarkerRef.current = null;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, hasLocation]);

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
        </div>

        <section className={styles.panel}>
          {activeTab === "mapa" ? (
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
                <div className={styles.mapWrap}>
                  <div ref={mapContainerRef} className={styles.map} />
                </div>
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
                  <p className={styles.geoNeutral}>Tu ubicación no coincide con ninguna zona de la capa riesgo_hidrico_AMGR_todas.geojson.</p>
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

              {riskData ? (
                <>
                  <h2 className={styles.riverTitle}>
                    Estado actual del río Paraná en el puerto Barranqueras
                  </h2>
                  <div className={styles.resultGrid}>
                    <div className={styles.metric}>
                      <span>Altura actual</span>
                      <strong>{formatMetricValue(riskData.alturaActual)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Variación</span>
                      <strong>{formatMetricValue(riskData.variacion)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Período</span>
                      <strong>{formatMetricValue(riskData.intervaloHoras)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Estado</span>
                      <strong>{formatMetricValue(riskData.tendencia)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Alerta</span>
                      <strong>{formatMetricValue(riskData.alerta)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Evacuación</span>
                      <strong>{formatMetricValue(riskData.evacuacion)}</strong>
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
