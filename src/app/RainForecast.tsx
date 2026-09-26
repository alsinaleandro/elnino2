"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

type ForecastDay = {
  date: string;
  smnMm: number | null;
  openMeteoMm: number | null;
  probability: number | null;
  hours: number | null;
  weatherCode: number | null;
  tMin: number | null;
  tMax: number | null;
};

type SourceInfo = { ok: boolean; fetchedAt?: string; stale?: boolean; error?: string };

type ForecastPayload = {
  days: ForecastDay[];
  sources: { smn: SourceInfo; openMeteo: SourceInfo };
};

// Colores de serie (validados para daltonismo): Open-Meteo = azul, SMN = naranja.
const OPEN_METEO_COLOR = "#2a78d6";
const SMN_COLOR = "#eb6834";

// Un día "con lluvia" a efectos del resumen.
const RAIN_MM = 1;
const RAIN_PROBABILITY = 50;

const WEEKDAY = new Intl.DateTimeFormat("es-AR", { weekday: "short" });
const LONG_DATE = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", hourCycle: "h23" });

const toDate = (isoDate: string) => new Date(`${isoDate}T12:00:00`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const formatMm = (value: number | null) => (value === null ? "Sin dato" : `${value.toLocaleString("es-AR")} mm`);

function describeWeather(code: number | null) {
  if (code === null) return null;
  if (code >= 95) return "Tormentas";
  if (code >= 80) return "Chaparrones";
  if (code >= 61) return "Lluvia";
  if (code >= 51) return "Lloviznas";
  if (code >= 45) return "Niebla";
  if (code >= 3) return "Nublado";
  if (code >= 1) return "Parcialmente nublado";
  return "Despejado";
}

const isRainy = (day: ForecastDay) =>
  (day.probability ?? 0) >= RAIN_PROBABILITY ||
  (day.openMeteoMm ?? 0) >= RAIN_MM ||
  (day.smnMm ?? 0) >= RAIN_MM;

// Los modelos pueden diferir mucho a varios días: se avisa cuando la diferencia es relevante.
const modelsDisagree = (day: ForecastDay) =>
  day.smnMm !== null &&
  day.openMeteoMm !== null &&
  Math.abs(day.smnMm - day.openMeteoMm) >= 5 &&
  Math.max(day.smnMm, day.openMeteoMm) >= 2 * Math.min(day.smnMm, day.openMeteoMm);

function rangeText(day: ForecastDay) {
  const values = [day.openMeteoMm, day.smnMm].filter((value): value is number => value !== null);
  if (values.length === 0) return "sin dato de milímetros";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? formatMm(max) : `entre ${min.toLocaleString("es-AR")} y ${formatMm(max)}`;
}

// ---------- Gráfico ----------

const CHART_WIDTH = 340;
const CHART_HEIGHT = 190;
const PLOT_LEFT = 30;
const PLOT_RIGHT = CHART_WIDTH - 6;
const PLOT_TOP = 14;
const PLOT_BOTTOM = 130;

function niceMax(value: number) {
  const target = Math.max(10, value * 1.1);
  const step = target <= 20 ? 5 : target <= 50 ? 10 : 25;
  return Math.ceil(target / step) * step;
}

// Barra con la punta superior redondeada (4px) y la base recta sobre el eje.
function barPath(x: number, width: number, top: number, bottom: number) {
  const r = Math.min(4, width / 2, bottom - top);
  if (bottom - top <= 0) return "";
  return `M ${x} ${bottom} V ${top + r} Q ${x} ${top} ${x + r} ${top} H ${x + width - r} Q ${x + width} ${top} ${x + width} ${top + r} V ${bottom} Z`;
}

function RainChart({
  days,
  selected,
  onSelect,
  today,
}: {
  days: ForecastDay[];
  selected: number;
  onSelect: (index: number) => void;
  today: string;
}) {
  const max = niceMax(Math.max(0, ...days.flatMap((day) => [day.smnMm ?? 0, day.openMeteoMm ?? 0])));
  const toY = (mm: number) => PLOT_BOTTOM - (mm / max) * (PLOT_BOTTOM - PLOT_TOP);
  const columnWidth = (PLOT_RIGHT - PLOT_LEFT) / days.length;
  const barWidth = Math.min(14, (columnWidth - 10) / 2);
  const ticks = [0, max / 2, max];

  return (
    <svg
      className={styles.rainChart}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="group"
      aria-label="Lluvia pronosticada por día, en milímetros, según Open-Meteo y SMN"
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={toY(tick)} y2={toY(tick)} className={tick === 0 ? styles.rainAxis : styles.rainGrid} />
          <text x={PLOT_LEFT - 5} y={toY(tick)} textAnchor="end" dominantBaseline="middle" className={styles.rainTick}>
            {tick}
          </text>
        </g>
      ))}
      <text x={PLOT_LEFT - 5} y={PLOT_TOP - 9} textAnchor="end" className={styles.rainTick}>mm</text>

      {days.map((day, index) => {
        const x = PLOT_LEFT + index * columnWidth;
        const center = x + columnWidth / 2;
        const isSelected = index === selected;
        const rainy = (day.probability ?? 0) >= RAIN_PROBABILITY;
        const bars = [
          { key: "om", value: day.openMeteoMm, color: OPEN_METEO_COLOR, x: center - barWidth - 1 },
          { key: "smn", value: day.smnMm, color: SMN_COLOR, x: center + 1 },
        ];

        return (
          <g
            key={day.date}
            role="button"
            tabIndex={0}
            aria-pressed={isSelected}
            aria-label={`${capitalize(LONG_DATE.format(toDate(day.date)))}: ${day.probability ?? "sin dato de"} % de probabilidad`}
            className={styles.rainColumn}
            onClick={() => onSelect(index)}
            onMouseEnter={() => onSelect(index)}
            onFocus={() => onSelect(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") onSelect(Math.min(days.length - 1, index + 1));
              if (event.key === "ArrowLeft") onSelect(Math.max(0, index - 1));
            }}
          >
            {/* Zona táctil: toda la columna, más grande que las barras */}
            <rect
              x={x + 1}
              y={PLOT_TOP - 8}
              width={columnWidth - 2}
              height={CHART_HEIGHT - PLOT_TOP + 8}
              rx="8"
              className={isSelected ? styles.rainColumnSelected : styles.rainColumnHit}
            />

            {bars.map((bar) =>
              bar.value !== null && bar.value > 0 ? (
                <g key={bar.key}>
                  <path d={barPath(bar.x, barWidth, Math.min(toY(bar.value), PLOT_BOTTOM - 2), PLOT_BOTTOM)} fill={bar.color} />
                  {isSelected ? (
                    <text x={bar.x + barWidth / 2} y={toY(bar.value) - 5} textAnchor="middle" className={styles.rainValue}>
                      {bar.value.toLocaleString("es-AR")}
                    </text>
                  ) : null}
                </g>
              ) : null,
            )}

            <text x={center} y={PLOT_BOTTOM + 16} textAnchor="middle" className={isSelected ? styles.rainDayActive : styles.rainDay}>
              {day.date === today ? "Hoy" : capitalize(WEEKDAY.format(toDate(day.date)).replace(".", ""))}
            </text>
            <text x={center} y={PLOT_BOTTOM + 29} textAnchor="middle" className={styles.rainDate}>
              {Number(day.date.slice(8))}
            </text>
            <text
              x={center}
              y={PLOT_BOTTOM + 48}
              textAnchor="middle"
              className={rainy ? styles.rainProbabilityHigh : styles.rainProbability}
            >
              {day.probability === null ? "–" : `${day.probability}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------- Pestaña ----------

export default function RainForecast() {
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/pronostico")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se pudo obtener el pronóstico.");
        return payload as ForecastPayload;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo obtener el pronóstico.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return <p className={styles.status}>Cargando pronóstico de lluvias...</p>;
  if (data.days.length === 0) return <p className={styles.error}>El pronóstico no tiene días disponibles.</p>;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
  const nextRain = data.days.find(isRainy) ?? null;
  const selectedIndex = selected ?? Math.max(0, nextRain ? data.days.indexOf(nextRain) : 0);
  const day = data.days[selectedIndex];
  const { smn, openMeteo } = data.sources;

  return (
    <>
      <div className={nextRain ? styles.rainSummaryWet : styles.rainSummaryDry}>
        <span className={styles.rainSummaryLabel}>Próxima lluvia en Resistencia</span>
        {nextRain ? (
          <>
            <strong>
              {nextRain.date === today ? "Hoy, " : ""}
              {LONG_DATE.format(toDate(nextRain.date))}
            </strong>
            <span>
              {nextRain.probability !== null ? `${nextRain.probability}% de probabilidad · ` : ""}
              {rangeText(nextRain)}
            </span>
          </>
        ) : (
          <strong>No se esperan lluvias en los próximos {data.days.length} días</strong>
        )}
      </div>

      <div className={styles.rainCard}>
        <div className={styles.rainCardHeader}>
          <h3>Lluvia por día</h3>
          <div className={styles.rainLegend}>
            <span><i style={{ background: OPEN_METEO_COLOR }} />Open-Meteo</span>
            <span><i style={{ background: SMN_COLOR }} />SMN</span>
          </div>
        </div>
        <RainChart days={data.days} selected={selectedIndex} onSelect={setSelected} today={today} />
        <p className={styles.rainHint}>Debajo de cada día: probabilidad de lluvia. Tocá un día para ver el detalle.</p>

        <div className={styles.srOnly}>
          <table>
            <caption>Pronóstico de lluvias por día</caption>
            <thead>
              <tr><th>Día</th><th>Probabilidad</th><th>Open-Meteo</th><th>SMN</th></tr>
            </thead>
            <tbody>
              {data.days.map((item) => (
                <tr key={item.date}>
                  <td>{LONG_DATE.format(toDate(item.date))}</td>
                  <td>{item.probability === null ? "Sin dato" : `${item.probability}%`}</td>
                  <td>{formatMm(item.openMeteoMm)}</td>
                  <td>{formatMm(item.smnMm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.rainDetail} aria-live="polite">
        <strong className={styles.rainDetailTitle}>
          {capitalize(LONG_DATE.format(toDate(day.date)))}
          {describeWeather(day.weatherCode) ? ` · ${describeWeather(day.weatherCode)}` : ""}
        </strong>
        <div className={styles.rainDetailGrid}>
          <div><span>Probabilidad</span><strong>{day.probability === null ? "Sin dato" : `${day.probability}%`}</strong></div>
          <div><span>Horas con lluvia</span><strong>{day.hours === null ? "Sin dato" : `${day.hours} h`}</strong></div>
          <div>
            <span><i style={{ background: OPEN_METEO_COLOR }} />Open-Meteo</span>
            <strong>{formatMm(day.openMeteoMm)}</strong>
          </div>
          <div>
            <span><i style={{ background: SMN_COLOR }} />SMN</span>
            <strong>{day.smnMm === null ? "Fuera de rango" : formatMm(day.smnMm)}</strong>
          </div>
          <div><span>Temperatura</span><strong>{day.tMin !== null && day.tMax !== null ? `${Math.round(day.tMin)}° / ${Math.round(day.tMax)}°` : "Sin dato"}</strong></div>
        </div>
        {modelsDisagree(day) ? (
          <p className={styles.rainNote}>
            Los modelos no coinciden para este día: tomá los milímetros como un rango ({rangeText(day)}).
          </p>
        ) : null}
      </div>

      <div className={styles.rainSources}>
        <p>
          <strong>SMN</strong>: pronóstico numérico a 5 días del{" "}
          <a href="https://www.smn.gob.ar/" target="_blank" rel="noreferrer">Servicio Meteorológico Nacional</a>, estación
          Resistencia Aero. Es la salida de su modelo, no el pronóstico redactado por sus meteorólogos.
          {smn.ok ? ` Consultado ${TIME.format(new Date(smn.fetchedAt!))}${smn.stale ? " (copia anterior: el SMN no responde)" : ""}.` : ` No disponible: ${smn.error}.`}
        </p>
        <p>
          <strong>Open-Meteo</strong>: combina modelos de centros meteorológicos (ECMWF, NOAA, DWD) y calcula la
          probabilidad de lluvia. Datos de{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0).
          {openMeteo.ok ? ` Consultado ${TIME.format(new Date(openMeteo.fetchedAt!))}${openMeteo.stale ? " (copia anterior)" : ""}.` : ` No disponible: ${openMeteo.error}.`}
        </p>
        <p>
          Para alertas oficiales vigentes consultá{" "}
          <a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer">smn.gob.ar/alertas</a>.
        </p>
      </div>
    </>
  );
}
