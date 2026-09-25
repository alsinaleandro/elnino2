"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

declare global {
  interface Window {
    L?: any;
  }
}

const getDangerLevel = (category?: string | null) => {
  const normalized = String(category ?? "").trim().toUpperCase();

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
  const matchedRiskCategory =
    geoLayer.matches[0]?.properties?.categoria != null
      ? String(geoLayer.matches[0].properties?.categoria)
      : null;
  const matchedRiskLevel = getDangerLevel(matchedRiskCategory);

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

  const requestLocation = (retryWithLowAccuracy = false) => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no soporta geolocalización GPS.");
      setLocationLoading(false);
      return;
    }

    setLocationError(null);
    setLocationLoading(true);

    const onSuccess = (position: GeolocationPosition) => {
      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
      });
      setLocationLoading(false);
    };

    const onError = (error: GeolocationPositionError) => {
      const isTimeout = error.code === error.TIMEOUT;
      const isDenied = error.code === error.PERMISSION_DENIED;

      if (isTimeout && !retryWithLowAccuracy) {
        requestLocation(true);
        return;
      }

      let message = error.message || "No se pudo obtener la ubicación del usuario.";

      if (isTimeout) {
        message = "La ubicación GPS tardó demasiado. Intenta nuevamente o revisa la señal del celular.";
      }

      if (isDenied) {
        message = "Se denegó el acceso a la ubicación. Activa el permiso de GPS y vuelve a intentarlo.";
      }

      setLocationError(message);
      setLocationLoading(false);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: !retryWithLowAccuracy,
      timeout: 30000,
      maximumAge: 60000,
    });
  };

  useEffect(() => {
    requestLocation(false);
  }, []);

  useEffect(() => {
    if (location === null) {
      return;
    }

    const { latitude, longitude } = location;

    async function loadGeoLayer() {
      try {
        setGeoLayer({ loading: true, error: null, matches: [] });

        const response = await fetch(
          `/api/geo/contains?lng=${longitude}&lat=${latitude}&file=public/data/riesgo_hidrico_AMGR_todas.geojson`,
        );

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo consultar la capa de riesgo.");
        }

        setGeoLayer({
          loading: false,
          error: null,
          matches: payload.matches ?? [],
        });
      } catch (error) {
        setGeoLayer({
          loading: false,
          error:
            error instanceof Error ? error.message : "No se pudo verificar la capa geográfica.",
          matches: [],
        });
      }
    }

    loadGeoLayer();
  }, [location]);

  useEffect(() => {
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
      }).setView([location.latitude, location.longitude], 9);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
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

    if (typeof window !== "undefined" && window.L) {
      initializeMap();
    } else {
      initializeMap();
    }

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
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
                    onClick={() => requestLocation(false)}
                  >
                    Reintentar GPS
                  </button>
                </div>
              ) : null}

              {location ? (
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
                      const layerName = match.name && match.name !== "Feature unknown"
                        ? match.name
                        : category;

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
              <div className={styles.riskSummary}>
                <div className={styles.queryPill}>Puerto: BARRANQUERAS</div>
                <div className={styles.queryPill}>Río: PARANA</div>
              </div>

              {riskLoading ? <p className={styles.status}>Cargando información del río...</p> : null}
              {riskError ? <p className={styles.error}>{riskError}</p> : null}

              <div className={styles.riskZoneCard}>
                <div className={styles.zoneHeader}>
                  <span>Zona coincidente</span>
                  <span className={`${styles.dangerBadge} ${styles[matchedRiskLevel.tone]}`}>
                    {matchedRiskLevel.label}
                  </span>
                </div>

                <div className={styles.dangerMeter} aria-label="Nivel de peligro">
                  <span className={`${styles.dangerBar} ${styles[matchedRiskLevel.tone]}`} />
                </div>
              </div>

              {riskData ? (
                <div className={styles.resultGrid}>
                  <div className={styles.metric}>
                    <span>Puerto</span>
                    <strong>{String(riskData.estacion ?? "-")}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Río</span>
                    <strong>{String(riskData.rio ?? "-")}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Altura actual</span>
                    <strong>{String(riskData.alturaActual ?? "-")}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Variación</span>
                    <strong>{String(riskData.variacion ?? "-")}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Período</span>
                    <strong>{String(riskData.intervaloHoras ?? "-")}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Estado</span>
                    <strong>{String(riskData.tendencia ?? "-")}</strong>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
