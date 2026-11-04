"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminBarrio } from "@/lib/barrios";
import { loadLeaflet, removeMap } from "../../leaflet";
import { createBarrioAdmin, type DrawnBarrioState } from "../actions";
import styles from "../admin.module.css";

// Mapa de los barrios cargados en la base: los polígonos de OpenStreetMap (azul), los dibujados a mano
// desde el panel (verde) y los que escribieron los vecinos, sin polígono, como un punto en su centro
// (naranja). Al tocarlos se ve el nombre, la localidad y cuántos vecinos tienen.
//
// Con "Dibujar un barrio" cada toque en el mapa agrega un vértice del contorno; después se escribe
// el nombre y la localidad y se guarda.

// El AMGR: el mapa arranca acá si no hay barrios con ubicación.
const AMGR_BOUNDS: [[number, number], [number, number]] = [
  [-27.53, -59.06],
  [-27.39, -58.9],
];

const SOURCE_INFO = {
  osm: { color: "#1d4ed8", fill: "#60a5fa", label: "Polígono de OpenStreetMap" },
  ptp: { color: "#15803d", fill: "#4ade80", label: "Dibujado a mano en el panel" },
  vecino: { color: "#ea580c", fill: "#ea580c", label: "Escrito por un vecino, sin polígono" },
} as const;

const DRAW_COLOR = "#be123c";

// [lat, lon] como los usa Leaflet.
type Vertex = [number, number];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function popupHtml(barrio: AdminBarrio) {
  const neighbors = `${barrio.neighbors} ${barrio.neighbors === 1 ? "vecino" : "vecinos"}`;
  return (
    `<strong>${escapeHtml(barrio.name)}</strong><br>` +
    `${barrio.localidad ? `${escapeHtml(barrio.localidad)}<br>` : ""}` +
    `${neighbors}<br>` +
    `<small>${SOURCE_INFO[barrio.source].label}</small>`
  );
}

export default function BarriosMap({ barrios, localidades }: { barrios: AdminBarrio[]; localidades: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<{ L: any; map: any; draft: any } | null>(null);
  const drawingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<Vertex[]>([]);
  // Controlados: React vacía el formulario después de cada envío y, si hay un error, se perdería lo escrito.
  const [name, setName] = useState("");
  const [localidad, setLocalidad] = useState("");

  // Mientras corre una carga la página se refresca sola: el mapa se vuelve a armar (y pierde el zoom)
  // solo si cambiaron los barrios.
  const signature = barrios
    .map((barrio) => `${barrio.id}:${barrio.source}:${barrio.neighbors}:${barrio.name}:${barrio.geometry ? 1 : 0}`)
    .join("|");
  const [shown, setShown] = useState({ signature, barrios });
  if (shown.signature !== signature) setShown({ signature, barrios });

  const [state, action, saving] = useActionState(async (previous: DrawnBarrioState, formData: FormData) => {
    const result = await createBarrioAdmin(previous, formData);
    if (!result.error) {
      setVertices([]);
      setDrawing(false);
      setName("");
    }
    return result;
  }, { error: null, created: null });

  useEffect(() => {
    drawingRef.current = drawing;
    containerRef.current?.style.setProperty("cursor", drawing ? "crosshair" : "");
  }, [drawing]);

  useEffect(() => {
    const { barrios } = shown;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        map = L.map(containerRef.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        const bounds = L.latLngBounds([]);
        for (const barrio of barrios) {
          const info = SOURCE_INFO[barrio.source];
          if (barrio.geometry) {
            const layer = L.geoJSON(barrio.geometry, {
              style: {
                color: info.color,
                weight: 2,
                fillColor: barrio.neighbors > 0 ? info.color : info.fill,
                fillOpacity: barrio.neighbors > 0 ? 0.3 : 0.15,
              },
            })
              .bindPopup(popupHtml(barrio), { maxWidth: 260 })
              .bindTooltip(barrio.name, { sticky: true })
              .addTo(map);
            bounds.extend(layer.getBounds());
          } else if (barrio.center) {
            L.circleMarker([barrio.center.lat, barrio.center.lon], {
              radius: 7,
              color: "#ffffff",
              weight: 2,
              fillColor: info.fill,
              fillOpacity: 0.9,
            })
              .bindPopup(popupHtml(barrio), { maxWidth: 260 })
              .bindTooltip(barrio.name)
              .addTo(map);
            bounds.extend([barrio.center.lat, barrio.center.lon]);
          }
        }

        if (bounds.isValid()) map.fitBounds(bounds.pad(0.05), { maxZoom: 15 });
        else map.fitBounds(AMGR_BOUNDS);

        // Dibujando, el toque agrega un vértice (aunque caiga sobre otro barrio: se cierra su popup).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on("click", (event: any) => {
          if (!drawingRef.current) return;
          map.closePopup();
          const vertex: Vertex = [Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))];
          setVertices((current) => [...current, vertex]);
        });

        mapRef.current = { L, map, draft: L.layerGroup().addTo(map) };
        setReady(true);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el mapa.");
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      setReady(false);
      if (map) removeMap(map);
    };
  }, [shown]);

  // El contorno que se está dibujando: línea mientras tiene menos de 3 puntos, polígono después.
  useEffect(() => {
    const current = mapRef.current;
    if (!ready || !current) return;
    const { L, draft } = current;
    draft.clearLayers();
    if (vertices.length >= 3) {
      L.polygon(vertices, { color: DRAW_COLOR, weight: 2, dashArray: "6 4", fillOpacity: 0.2, interactive: false }).addTo(draft);
    } else if (vertices.length === 2) {
      L.polyline(vertices, { color: DRAW_COLOR, weight: 2, dashArray: "6 4", interactive: false }).addTo(draft);
    }
    for (const vertex of vertices) {
      L.circleMarker(vertex, { radius: 5, color: "#ffffff", weight: 2, fillColor: DRAW_COLOR, fillOpacity: 1, interactive: false }).addTo(draft);
    }
  }, [ready, vertices]);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  // A la base va [lon, lat], como en GeoJSON.
  const ring = JSON.stringify(vertices.map(([lat, lon]) => [lon, lat]));

  return (
    <>
      <div className={styles.actions} style={{ marginBottom: 10 }}>
        {drawing ? (
          <>
            <button
              type="button"
              className={styles.button}
              onClick={() => setVertices((current) => current.slice(0, -1))}
              disabled={vertices.length === 0}
            >
              Deshacer último punto
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => {
                setVertices([]);
                setDrawing(false);
              }}
            >
              Cancelar el dibujo
            </button>
          </>
        ) : (
          <button type="button" className={styles.button} onClick={() => setDrawing(true)}>
            ✏️ Dibujar un barrio
          </button>
        )}
      </div>
      {state.created && !drawing ? (
        <p className={styles.formSuccess} role="status" style={{ marginBottom: 10 }}>
          {state.created}
        </p>
      ) : null}
      {drawing ? (
        <p className={styles.contact} style={{ marginBottom: 10 }}>
          Tocá el mapa en cada esquina del barrio, siguiendo el borde. El contorno se cierra solo entre el último punto y
          el primero. Llevás {vertices.length} {vertices.length === 1 ? "punto" : "puntos"}.
        </p>
      ) : null}

      <div ref={containerRef} style={{ height: "min(70vh, 600px)", borderRadius: 12, overflow: "hidden" }} />

      {drawing ? (
        <form action={action} className={styles.newsForm}>
          <h2>Barrio nuevo</h2>
          <input type="hidden" name="ring" value={ring} />
          <label className={styles.newsField}>
            Nombre del barrio
            <input
              name="name"
              className={styles.input}
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Villa Prosperidad"
            />
          </label>
          <label className={styles.newsField}>
            Localidad
            <input
              name="localidad"
              className={styles.input}
              required
              maxLength={60}
              list="barrios-localidades"
              value={localidad}
              onChange={(event) => setLocalidad(event.target.value)}
              placeholder="Ej. Resistencia"
            />
            <datalist id="barrios-localidades">
              {localidades.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          {state.error ? (
            <p className={styles.formError} role="alert">
              {state.error}
            </p>
          ) : null}
          <button type="submit" className={styles.button} disabled={saving || vertices.length < 3}>
            {saving ? "Guardando…" : vertices.length < 3 ? "Marcá al menos 3 puntos" : "Guardar el barrio"}
          </button>
        </form>
      ) : null}
    </>
  );
}
