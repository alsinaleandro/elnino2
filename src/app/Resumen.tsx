"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { sectionHref } from "./AppNav";
import { isRainy, LONG_DATE, rangeText, toDate, type ForecastPayload } from "./RainForecast";
import { DANGER_COLORS, type DangerTone, type RiskBarState } from "./RiskBars";
import styles from "./resumen.module.css";

// Inicio del vecino que ya se sumó a un comité (diseño de la maqueta): resumen de su zona de
// riesgo, la altura del Paraná en el hidrómetro de Barranqueras, la próxima lluvia y su barrio.
// Todo con datos reales: los mismos que muestran las secciones a las que lleva cada tarjeta.

export type Member = { firstName: string; lastName: string; barrio: string; localidad: string | null };

export type RiverSummary = {
  loading: boolean;
  error: string | null;
  altura: number | null;
  alerta: number | null;
  evacuacion: number | null;
  tendencia: string;
  fecha: string;
};

type Props = {
  member: Member;
  welcome: boolean;
  rio: RiskBarState;
  lluvia: RiskBarState;
  // Debajo de los chips de la zona: de dónde sale el dato o por qué falta.
  zoneNote: string;
  river: RiverSummary;
};

const SHORT_LABELS: Record<DangerTone, string> = {
  dangerLight: "Leve",
  dangerRegulated: "Leve regulada",
  dangerTemporary: "Severa temporaria",
  dangerSevere: "Severa",
  dangerHigh: "Prohibida",
  dangerNeutral: "Sin zona",
};

// El amarillo de "Severa" necesita letra oscura; el verde y el rojo, blanca.
const DARK_TEXT: DangerTone[] = ["dangerTemporary", "dangerSevere", "dangerNeutral"];

function ZoneChip({ name, state }: { name: string; state: RiskBarState }) {
  if (!state.tone) {
    return (
      <span className={`${styles.chip} ${styles.chipNeutral}`}>
        {name}: {state.status}
      </span>
    );
  }

  return (
    <span
      className={styles.chip}
      style={{
        background: DANGER_COLORS[state.tone].fill,
        color: DARK_TEXT.includes(state.tone) ? "#1f2937" : "#ffffff",
      }}
    >
      {name}: {SHORT_LABELS[state.tone]}
    </span>
  );
}

const metros = (value: number) => `${value.toLocaleString("es-AR", { minimumFractionDigits: 2 })} m`;

function RiverCard({ river }: { river: RiverSummary }) {
  const { altura, alerta, evacuacion } = river;
  const overEvacuation = altura !== null && evacuacion !== null && altura >= evacuacion;
  const overAlert = altura !== null && alerta !== null && altura >= alerta;
  const trend = river.tendencia.toUpperCase();
  const levels = [alerta !== null ? `Alerta ${metros(alerta)}` : null, evacuacion !== null ? `evacuación ${metros(evacuacion)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={sectionHref("crecida")} className={`${styles.card} ${overAlert ? styles.alertCard : ""}`}>
      <span className={styles.cardHead}>Río Paraná · hidrómetro de Barranqueras</span>
      {river.loading ? (
        <span className={styles.cardSub}>Cargando la altura del río...</span>
      ) : altura === null ? (
        <span className={styles.cardSub}>{river.error ?? "Prefectura no informó la altura del río."}</span>
      ) : (
        <>
          <div className={styles.row}>
            <span className={styles.big}>{metros(altura)}</span>
            {trend.includes("CRECE") ? <span className={styles.up}>▲ crece</span> : null}
            {trend.includes("BAJA") ? <span className={styles.down}>▼ baja</span> : null}
          </div>
          <span className={styles.cardSub}>
            {overEvacuation
              ? `⚠️ Superó la altura de evacuación (${metros(evacuacion)})`
              : overAlert
                ? `⚠️ Superó la altura de alerta (${metros(alerta)})${evacuacion !== null ? ` · evacuación ${metros(evacuacion)}` : ""}`
                : levels}
          </span>
          {river.fecha ? <span className={styles.muted}>Medición de Prefectura: {river.fecha}</span> : null}
        </>
      )}
    </Link>
  );
}

function RainCard() {
  const [forecast, setForecast] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pronostico")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "No se pudo obtener el pronóstico.");
        return payload as ForecastPayload;
      })
      .then((payload) => {
        if (!cancelled) setForecast(payload);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo obtener el pronóstico.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date());
  const nextRain = forecast?.days.find(isRainy) ?? null;

  return (
    <Link href={sectionHref("pronosticos")} className={styles.card}>
      <span className={styles.cardHead}>Próxima lluvia en Resistencia</span>
      {error ? (
        <span className={styles.cardSub}>{error}</span>
      ) : !forecast ? (
        <span className={styles.cardSub}>Cargando el pronóstico...</span>
      ) : nextRain ? (
        <>
          <span className={styles.cardMain}>
            🌧️ {nextRain.date === today ? "Hoy, " : ""}
            {LONG_DATE.format(toDate(nextRain.date))}
          </span>
          <span className={styles.cardSub}>
            {nextRain.probability !== null ? `${nextRain.probability}% de probabilidad · ` : ""}
            {rangeText(nextRain)}
          </span>
        </>
      ) : (
        <span className={styles.cardMain}>☀️ No se esperan lluvias en los próximos {forecast.days.length} días</span>
      )}
    </Link>
  );
}

export default function Resumen({ member, welcome, rio, lluvia, zoneNote, river }: Props) {
  return (
    <div className={styles.cards}>
      {welcome ? (
        <p className={styles.welcome} role="status">
          ¡Ya sos parte del comité de emergencia de <strong>{member.barrio}</strong>, {member.firstName}!
        </p>
      ) : null}

      <Link href={sectionHref("riesgo")} className={styles.card}>
        <span className={styles.cardHead}>Tu zona de riesgo hídrico</span>
        <div className={styles.row}>
          <ZoneChip name="Crecida" state={rio} />
          <ZoneChip name="Lluvia" state={lluvia} />
        </div>
        <span className={styles.cardSub}>{zoneNote}</span>
      </Link>

      <RiverCard river={river} />

      <RainCard />

      <Link href="/organizate/chat" className={styles.card}>
        <span className={styles.cardHead}>Tu barrio · {member.barrio}</span>
        <span className={styles.cardMain}>💬 Chat del barrio</span>
        <span className={styles.cardSub}>Hablá con los vecinos de tu comité de emergencia.</span>
      </Link>
    </div>
  );
}
