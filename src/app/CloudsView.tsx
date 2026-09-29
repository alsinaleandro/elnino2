"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, removeMap } from "./leaflet";
import styles from "./page.module.css";

// Imagen satelital GOES-East GeoColor (NOAA) servida por NASA GIBS: color real de día e
// infrarrojo de noche, una imagen cada 10 minutos. La resolución máxima es ~1 km por píxel
// (nivel 7 de tiles); con más zoom Leaflet amplía esa misma imagen.
const GIBS_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GOES-East_ABI_GeoColor/default/{time}/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png";

// direction: de qué lado va el nombre, para que no se encimen (Barranqueras y Puerto Vilelas
// están a 3 km).
const CITIES: Array<{ name: string; lat: number; lng: number; direction: "left" | "right" | "bottom" }> = [
  { name: "Resistencia", lat: -27.4514, lng: -58.9867, direction: "right" },
  { name: "Barranqueras", lat: -27.4843, lng: -58.9392, direction: "right" },
  { name: "Fontana", lat: -27.4176, lng: -59.0251, direction: "left" },
  { name: "Puerto Tirol", lat: -27.3719, lng: -59.0829, direction: "left" },
  { name: "Puerto Vilelas", lat: -27.5118, lng: -58.9367, direction: "bottom" },
];

const MAX_FRAMES = 10;
const FRAME_STEP_MINUTES = 20;
const FRAME_INTERVAL_MS = 700;
const REFRESH_MS = 10 * 60 * 1000;

const WINDY_URL =
  "https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C" +
  "&metricWind=km%2Fh&zoom=8&overlay=clouds&product=ecmwf&level=surface&lat=-27.45&lon=-58.98&detailLat=-27.45&detailLon=-58.98&marker=true";

const TIME = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Argentina/Cordoba",
});
const WEEKDAY = new Intl.DateTimeFormat("es-AR", { weekday: "long" });
const dayLabel = (isoDate: string) =>
  `${WEEKDAY.format(new Date(`${isoDate}T12:00:00`))} ${Number(isoDate.slice(8))}/${Number(isoDate.slice(5, 7))}`;

// Toma una imagen cada 20 minutos hasta la más reciente (máximo 10 cuadros ≈ 3 h).
function pickFrames(times: string[]) {
  const frames: string[] = [];

  for (let i = times.length - 1; i >= 0 && frames.length < MAX_FRAMES; i -= 1) {
    const last = frames[0];
    if (!last || new Date(last).getTime() - new Date(times[i]).getTime() >= FRAME_STEP_MINUTES * 60 * 1000) {
      frames.unshift(times[i]);
    }
  }

  return frames;
}

function minutesAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h ${minutes % 60} min`;
}

type CloudDay = { date: string; cloudCover: number | null; probability: number | null };

function describeClouds(cover: number) {
  if (cover >= 85) return "Cubierto";
  if (cover >= 60) return "Mayormente nublado";
  if (cover >= 30) return "Parcialmente nublado";
  if (cover >= 10) return "Algo nublado";
  return "Despejado";
}

export default function CloudsView() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const frameLayersRef = useRef<any[]>([]);

  const [frames, setFrames] = useState<string[] | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [opacity, setOpacity] = useState(0.85);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [cloudDays, setCloudDays] = useState<CloudDay[] | null>(null);

  // Horarios disponibles del satélite, actualizados cada 10 minutos mientras la pestaña está abierta.
  useEffect(() => {
    let cancelled = false;

    const loadTimes = () =>
      fetch("/api/nubes")
        .then((response) => response.json())
        .then((payload: { times?: string[] }) => {
          if (cancelled) return;
          const picked = pickFrames(payload.times ?? []);
          // Sin lista de horarios, se usa "default" (la última imagen que tenga GIBS).
          const next = picked.length > 0 ? picked : ["default"];
          setFrames(next);
          setFrameIndex(next.length - 1);
        })
        .catch(() => {
          if (!cancelled) {
            setFrames(["default"]);
            setFrameIndex(0);
          }
        });

    loadTimes();
    const timer = setInterval(loadTimes, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Nubosidad promedio de los próximos días (Open-Meteo, vía /api/pronostico).
  useEffect(() => {
    let cancelled = false;

    fetch("/api/pronostico")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { days?: CloudDay[] } | null) => {
        if (!cancelled && payload?.days) setCloudDays(payload.days);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // El mapa base y los nombres de las ciudades se crean una sola vez.
  useEffect(() => {
    let cancelled = false;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapContainerRef.current) return;

        const map = L.map(mapContainerRef.current, { zoomControl: true, minZoom: 5, maxZoom: 12 });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap",
          maxZoom: 12,
        }).addTo(map);

        map.fitBounds(
          L.latLngBounds(CITIES.map((city) => [city.lat, city.lng])).pad(0.35),
        );

        for (const city of CITIES) {
          L.circleMarker([city.lat, city.lng], {
            radius: 4,
            color: "#ffffff",
            weight: 2,
            fillColor: "#111827",
            fillOpacity: 1,
            pane: "markerPane",
          })
            .bindTooltip(city.name, { permanent: true, direction: city.direction, className: styles.cityLabel })
            .addTo(map);
        }

        mapRef.current = map;
        setMapReady(true);
      })
      .catch((error: Error) => {
        if (!cancelled) setMapError(error.message);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) removeMap(mapRef.current);
      mapRef.current = null;
      frameLayersRef.current = [];
    };
  }, []);

  // Una capa por cuadro: todas se cargan de entrada y solo la actual es visible, así la
  // animación no parpadea mientras se descargan las imágenes.
  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!frames || !map || !L) return;

    frameLayersRef.current.forEach((layer) => layer.remove());
    frameLayersRef.current = frames.map((time) =>
      L.tileLayer(GIBS_TILE_URL.replace("{time}", time), {
        maxNativeZoom: 7,
        maxZoom: 12,
        opacity: 0,
        attribution: "Satélite: NOAA GOES-East vía NASA GIBS",
      }).addTo(map),
    );
    // La capa base de OSM queda debajo; las ciudades (markerPane) quedan arriba.
  }, [frames, mapReady]);

  // mapReady también va en las dependencias: las capas pueden crearse después de que llegan los horarios.
  useEffect(() => {
    frameLayersRef.current.forEach((layer, index) => layer.setOpacity(index === frameIndex ? opacity : 0));
  }, [frameIndex, opacity, frames, mapReady]);

  useEffect(() => {
    if (!playing || !frames || frames.length < 2) return;

    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [playing, frames]);

  const currentTime = frames?.[frameIndex];
  const isLatest = frames ? frameIndex === frames.length - 1 : false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
  const nextDays = (cloudDays ?? []).filter((day) => day.date > today).slice(0, 3);

  return (
    <>
      <div className={styles.cloudsCard}>
        <div className={styles.cloudsHeader}>
          <h3>Satélite ahora</h3>
          <span className={styles.cloudsTime}>
            {currentTime && currentTime !== "default"
              ? `${TIME.format(new Date(currentTime))} hs · ${minutesAgo(currentTime)}`
              : "Última imagen disponible"}
            {currentTime && currentTime !== "default" && isLatest ? " · la más reciente" : ""}
          </span>
        </div>

        {mapError ? <p className={styles.error}>{mapError}</p> : null}
        <div className={styles.cloudsMapWrap}>
          <div ref={mapContainerRef} className={styles.cloudsMap} />
        </div>

        {frames && frames.length > 1 ? (
          <div className={styles.cloudsControls}>
            <button
              type="button"
              className={styles.cloudsPlay}
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pausar animación" : "Animar las últimas horas"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={frames.length - 1}
              value={frameIndex}
              onChange={(event) => {
                setPlaying(false);
                setFrameIndex(Number(event.target.value));
              }}
              aria-label="Horario de la imagen satelital"
              className={styles.cloudsSlider}
            />
          </div>
        ) : null}

        <label className={styles.cloudsOpacity}>
          <span>Calles</span>
          <input
            type="range"
            min={0.3}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            aria-label="Opacidad de la imagen satelital"
          />
          <span>Nubes</span>
        </label>

        <p className={styles.cloudsNote}>
          Imagen del satélite meteorológico GOES-East (NOAA), vía NASA GIBS. De día se ve en color real y de
          noche en infrarrojo. Llega con unos 30 a 40 minutos de demora y su detalle máximo es de ~1 km.
        </p>
      </div>

      <div className={styles.cloudsCard}>
        <div className={styles.cloudsHeader}>
          <h3>Pronóstico de nubes</h3>
        </div>

        {nextDays.length > 0 ? (
          <div className={styles.cloudDays}>
            {nextDays.map((day, index) => (
              <div key={day.date} className={styles.cloudDay}>
                <span>{index === 0 ? "Mañana" : dayLabel(day.date)}</span>
                <strong>{day.cloudCover === null ? "Sin dato" : `${day.cloudCover}%`}</strong>
                <em>{day.cloudCover === null ? "" : describeClouds(day.cloudCover)}</em>
                <div className={styles.cloudMeter} aria-hidden="true">
                  <i style={{ width: `${day.cloudCover ?? 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <p className={styles.cloudsNote}>
          Nubosidad promedio del día en Resistencia, según Open-Meteo (modelos ECMWF, NOAA y DWD).
        </p>

        <div className={styles.windyWrap}>
          <iframe
            title="Mapa de pronóstico de nubes (ECMWF, Windy)"
            src={WINDY_URL}
            className={styles.windyFrame}
            loading="lazy"
          />
        </div>
        <p className={styles.cloudsNote}>
          Mapa de nubosidad del modelo europeo ECMWF, vía{" "}
          <a href="https://www.windy.com/-Nubes-clouds?clouds,-27.45,-58.98,9" target="_blank" rel="noreferrer">
            Windy.com
          </a>
          . Usá la línea de tiempo de abajo del mapa (o el botón ▶) para ver los próximos días.
        </p>
      </div>
    </>
  );
}
