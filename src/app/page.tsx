"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

const geoEndpoints = [
  { method: "GET", path: "/api/geo", description: "Documentación de la API geoespacial" },
  {
    method: "GET",
    path: "/api/geo/contains?lng=-58.3816&lat=-34.6037",
    description: "Consulta si un punto está dentro de un polígono del GeoJSON",
  },
  {
    method: "POST",
    path: "/api/geo/contains",
    description: "Envía coordenadas y un GeoJSON para evaluar la intersección",
  },
];

const riesgoEndpoints = [
  {
    method: "GET",
    path: "/api/rio-parana?puerto=BARRANQUERAS&rio=PARANA",
    description: "Devuelve la fila del río con el puerto y río indicados",
  },
  {
    method: "GET",
    path: "/api/rio-parana?puerto=PARANA&rio=PARANA",
    description: "Consulta el registro del río Paraná en el puerto Paraná",
  },
  {
    method: "GET",
    path: "/api/geo/contains?lng=-58.3816&lat=-34.6037",
    description: "Comprueba si el punto cae dentro de las capas de riesgo",
  },
];

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

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no soporta geolocalización GPS.");
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        });
        setLocationLoading(false);
      },
      (error) => {
        setLocationError(error.message || "No se pudo obtener la ubicación del usuario.");
        setLocationLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );
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
              <div className={styles.mapHeader}>
                <h2>Ubicación actual</h2>
              </div>

              {locationLoading ? (
                <p className={styles.status}>Solicitando coordenadas GPS...</p>
              ) : null}

              {locationError ? <p className={styles.error}>{locationError}</p> : null}

              {location ? (
                <div className={styles.resultGrid}>
                  <div className={styles.metric}>
                    <span>Latitud</span>
                    <strong>{location.latitude.toFixed(6)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Longitud</span>
                    <strong>{location.longitude.toFixed(6)}</strong>
                  </div>
                  <div className={styles.metric}>
                    <span>Precisión</span>
                    <strong>{location.accuracy !== null ? `${location.accuracy.toFixed(0)} m` : "-"}</strong>
                  </div>
                </div>
              ) : null}

              {geoLayer.loading ? <p className={styles.status}>Verificando la capa de riesgo...</p> : null}
              {geoLayer.error ? <p className={styles.error}>{geoLayer.error}</p> : null}

              {!geoLayer.loading && !geoLayer.error && location ? (
                geoLayer.matches.length > 0 ? (
                  <div className={styles.geoInfo}>
                    <p className={styles.geoOk}>Tu ubicación sí pertenece a la capa de riesgo cargada en el servidor.</p>
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
