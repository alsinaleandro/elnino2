"use client";

import { useActionState, useState } from "react";
import type { Detection } from "@/lib/barrios";
import { detectMyBarrio, saveBarrio } from "./actions";
import styles from "./organizate.module.css";

type Point = { lat: number; lon: number };

// Elegir el barrio: con el GPS la app propone uno (y los cercanos ya cargados); el vecino confirma,
// elige otro o lo escribe. Sin GPS, lo escribe directamente.
export default function BarrioForm({ current }: { current: { name: string; localidad: string | null } | null }) {
  const [state, action, saving] = useActionState(saveBarrio, { error: null });
  const [phase, setPhase] = useState<"inicio" | "buscando" | "elegir">("inicio");
  const [point, setPoint] = useState<Point | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string>("nuevo");

  const detect = () => {
    if (!navigator.geolocation) {
      setGpsError("Tu navegador no permite usar la ubicación. Escribí tu barrio.");
      setPhase("elegir");
      return;
    }
    setPhase("buscando");
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const found = { lat: coords.latitude, lon: coords.longitude };
        setPoint(found);
        try {
          const result = await detectMyBarrio(found.lat, found.lon);
          setDetection(result);
          setChoice(result?.barrio ? String(result.barrio.id) : "nuevo");
        } catch {
          setGpsError("No pudimos buscar tu barrio. Elegilo o escribilo.");
        }
        setPhase("elegir");
      },
      () => {
        setGpsError("No pudimos obtener tu ubicación. Escribí tu barrio.");
        setPhase("elegir");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  if (phase !== "elegir") {
    return (
      <div className={styles.form}>
        <p>
          Con tu ubicación te proponemos tu barrio. Tiene que ser <strong>el barrio donde vivís</strong>, no donde estás
          ahora: si no estás en tu casa, después lo corregís.
        </p>
        <p className={styles.muted}>Tu ubicación no se publica ni la ve ningún vecino.</p>
        <button type="button" className={styles.btnPrimary} onClick={detect} disabled={phase === "buscando"}>
          {phase === "buscando" ? "Buscando tu barrio…" : "📍 Detectar mi barrio"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setPhase("elegir")}>
          Prefiero escribirlo
        </button>
      </div>
    );
  }

  const detected = detection?.barrio ?? null;
  const options = [...(detected ? [detected] : []), ...(detection?.nearby ?? [])];
  const fromOsm = options.some((barrio) => barrio.source === "osm");

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="lat" value={point?.lat ?? ""} />
      <input type="hidden" name="lon" value={point?.lon ?? ""} />

      {gpsError ? <p className={styles.error}>{gpsError}</p> : null}
      {detected ? (
        <p className={styles.success}>
          📍 Estás en <strong>{detected.name}</strong>
          {detected.localidad ? ` (${detected.localidad})` : ""}. ¿Es donde vivís?
        </p>
      ) : point && detection ? (
        <p className={styles.muted}>
          {detection.osmUnavailable
            ? "No pudimos consultar el mapa de barrios en este momento."
            : "Tu barrio todavía no está en nuestro mapa."}{" "}
          {options.length ? "Fijate si está entre los cercanos o escribilo." : "Escribilo y lo sumamos."}
        </p>
      ) : null}

      <fieldset className={styles.choices}>
        <legend>Tu barrio</legend>
        {options.map((barrio) => (
          <label key={barrio.id} className={styles.choice}>
            <input
              type="radio"
              name="choice"
              value={barrio.id}
              checked={choice === String(barrio.id)}
              onChange={() => setChoice(String(barrio.id))}
            />
            <span>
              {barrio.name}
              {barrio.localidad ? <small> · {barrio.localidad}</small> : null}
            </span>
          </label>
        ))}
        <label className={styles.choice}>
          <input type="radio" name="choice" value="nuevo" checked={choice === "nuevo"} onChange={() => setChoice("nuevo")} />
          <span>{options.length ? "Otro barrio" : "Escribir mi barrio"}</span>
        </label>
      </fieldset>

      {choice === "nuevo" ? (
        <>
          <label className={styles.field}>
            Barrio
            <input name="name" required maxLength={60} placeholder="Ej. Villa Prosperidad" />
          </label>
          <label className={styles.field}>
            Localidad
            <input
              name="localidad"
              required
              maxLength={60}
              defaultValue={detection?.localidad ?? current?.localidad ?? ""}
              placeholder="Ej. Resistencia"
            />
          </label>
        </>
      ) : null}

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.btnPrimary} disabled={saving}>
        {saving ? "Guardando…" : "Este es mi barrio"}
      </button>
      {!point ? (
        <button type="button" className={styles.btnGhost} onClick={detect}>
          📍 Probar con mi ubicación
        </button>
      ) : null}
      {fromOsm ? <small className={styles.muted}>Mapa de barrios © OpenStreetMap contributors (ODbL).</small> : null}
    </form>
  );
}
