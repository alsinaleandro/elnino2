"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  FLOOD_CAUSE_INFO,
  FLOOD_CAUSES,
  FLOOD_STATUS_INFO,
  FLOOD_STATUSES,
  type FloodCause,
  type FloodData,
  type FloodStatus,
} from "@/lib/floodKinds";
import styles from "./floodReport.module.css";
import { timeAgo } from "./format";

type Point = { latitude: number; longitude: number };

type Props = {
  data: FloodData | null;
  // Ubicación GPS del vecino y punto marcado en el mapa (tocándolo o buscando una dirección).
  location: (Point & { accuracy: number | null }) | null;
  selectedPoint: (Point & { label: string }) | null;
  onChange: (data: FloodData) => void;
};

// "Reportar inundación" en la pestaña Mapa (Idea 2). Por defecto se reporta la ubicación actual; si
// no, el punto marcado en el mapa. Cada vecino tiene un solo punto: reportar de nuevo lo reemplaza.
export default function FloodReport({ data, location, selectedPoint, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [where, setWhere] = useState<"gps" | "punto">("gps");
  const [status, setStatus] = useState<FloodStatus | null>(null);
  const [cause, setCause] = useState<FloodCause | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = data?.reports.find((report) => report.mine) ?? null;
  const point = where === "gps" ? location : selectedPoint;

  async function send(method: "POST" | "DELETE") {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/inundaciones", {
        method,
        headers: { "Content-Type": "application/json" },
        body:
          method === "POST"
            ? JSON.stringify({
                latitude: point?.latitude,
                longitude: point?.longitude,
                accuracy: where === "gps" ? location?.accuracy : null,
                status,
                cause: status === "seco" ? null : cause,
              })
            : undefined,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo guardar el reporte.");
      onChange(payload as FloodData);
      if (method === "POST") {
        setOpen(false);
        setStatus(null);
        setCause(null);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el reporte.");
    } finally {
      setSending(false);
    }
  }

  const mineSummary = mine ? (
    <div className={styles.mine}>
      <span>
        <i style={{ background: FLOOD_STATUS_INFO[mine.status].color }} />
        Tu reporte: <strong>{FLOOD_STATUS_INFO[mine.status].label}</strong> · {timeAgo(mine.createdAt)}
      </span>
      <button type="button" className={styles.link} disabled={sending} onClick={() => send("DELETE")}>
        Sacar mi reporte
      </button>
    </div>
  ) : null;

  if (!open) {
    return (
      <div className={styles.box}>
        {mineSummary}
        <button type="button" className={styles.open} onClick={() => setOpen(true)}>
          🌊 Reportar inundación
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  if (data && !data.canReport) {
    return (
      <div className={styles.box}>
        <h3>Reportar inundación</h3>
        <p className={styles.hint}>
          Para reportar tenés que sumarte al comité de tu barrio. Así cada reporte tiene un vecino que responde por él.
        </p>
        <Link href="/organizate" className={styles.send}>
          ¡Organizate!
        </Link>
        <button type="button" className={styles.link} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    );
  }

  const ready = point !== null && status !== null && (status === "seco" || cause !== null);

  return (
    <div className={styles.box}>
      <h3>Reportar inundación</h3>

      <fieldset className={styles.group}>
        <legend>¿Dónde?</legend>
        <label>
          <input type="radio" name="floodWhere" checked={where === "gps"} onChange={() => setWhere("gps")} />
          Donde estoy ahora
          <small>
            {location
              ? location.accuracy !== null
                ? `GPS, precisión de ${Math.round(location.accuracy)} m`
                : "GPS"
              : "Todavía no tenemos tu ubicación"}
          </small>
        </label>
        <label>
          <input type="radio" name="floodWhere" checked={where === "punto"} onChange={() => setWhere("punto")} />
          Otro punto
          <small>{selectedPoint ? selectedPoint.label : "Tocá el mapa o buscá una dirección abajo"}</small>
        </label>
      </fieldset>

      <fieldset className={styles.group}>
        <legend>¿Cómo está?</legend>
        <div className={styles.statuses}>
          {FLOOD_STATUSES.map((key) => (
            <button
              key={key}
              type="button"
              className={`${styles.status} ${status === key ? styles.statusActive : ""}`}
              style={{ "--status-color": FLOOD_STATUS_INFO[key].color } as CSSProperties}
              aria-pressed={status === key}
              onClick={() => setStatus(key)}
            >
              <i />
              <strong>{FLOOD_STATUS_INFO[key].label}</strong>
              <small>{FLOOD_STATUS_INFO[key].hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      {status && status !== "seco" ? (
        <fieldset className={styles.group}>
          <legend>¿Por qué hay agua?</legend>
          {FLOOD_CAUSES.map((key) => (
            <label key={key}>
              <input type="radio" name="floodCause" checked={cause === key} onChange={() => setCause(key)} />
              {FLOOD_CAUSE_INFO[key].label}
              <small>
                Se ve en el mapa {FLOOD_CAUSE_INFO[key].hours < 24 ? `${FLOOD_CAUSE_INFO[key].hours} horas` : `${FLOOD_CAUSE_INFO[key].hours / 24} días`}
              </small>
            </label>
          ))}
        </fieldset>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      <button type="button" className={styles.send} disabled={!ready || sending} onClick={() => send("POST")}>
        {sending ? "Enviando..." : "Enviar reporte"}
      </button>
      <button type="button" className={styles.link} onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <p className={styles.hint}>
        Tenés un solo punto en el mapa: {mine ? "este reporte reemplaza al anterior" : "si reportás de nuevo, se reemplaza"}.
        Los demás ven el punto, pero no tu nombre.
      </p>
    </div>
  );
}
