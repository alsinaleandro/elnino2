"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminBarrio } from "@/lib/barrios";
import { loadLeaflet, removeMap } from "../../leaflet";
import { createBarrioAdmin, type DrawnBarrioState } from "../actions";
import styles from "../admin.module.css";
import { BARRIO_FOCUS_EVENT } from "./VerEnMapa";

// Mapa de los barrios cargados en la base: los polígonos de OpenStreetMap (azul), los dibujados a mano
// desde el panel (verde) y los barrios sin polígono como un punto en su centro: violeta si son un
// punto de OpenStreetMap, naranja si los escribió un vecino. Al tocarlos se ve el nombre, la localidad y cuántos vecinos tienen.
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
  osmPoint: { color: "#7c3aed", fill: "#7c3aed", label: "Punto de OpenStreetMap, sin polígono" },
  ptp: { color: "#15803d", fill: "#4ade80", label: "Dibujado a mano en el panel" },
  vecino: { color: "#ea580c", fill: "#ea580c", label: "Escrito por un vecino, sin polígono" },
} as const;

const DRAW_COLOR = "#be123c";

// [lat, lon] como los usa Leaflet.
type Vertex = [number, number];

const sourceInfo = (barrio: AdminBarrio) =>
  SOURCE_INFO[barrio.source === "osm" && !barrio.geometry ? "osmPoint" : barrio.source];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function popupHtml(barrio: AdminBarrio) {
  const neighbors = `${barrio.neighbors} ${barrio.neighbors === 1 ? "vecino" : "vecinos"}`;
  return (
    `<strong>${escapeHtml(barrio.name)}</strong><br>` +
    `${barrio.localidad ? `${escapeHtml(barrio.localidad)}<br>` : ""}` +
    `${neighbors}<br>` +
    `<small>${sourceInfo(barrio).label}</small>`
  );
}

export default function BarriosMap({ barrios, localidades }: { barrios: AdminBarrio[]; localidades: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<{ L: any; map: any; draft: any; focus: Map<number, () => void> } | null>(null);
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

  // Dibujando, dos toques seguidos son dos vértices, no un zoom.
  useEffect(() => {
    drawingRef.current = drawing;
    containerRef.current?.style.setProperty("cursor", drawing ? "crosshair" : "");
    const map = ready ? mapRef.current?.map : null;
    if (drawing) {
      map?.closePopup();
      map?.doubleClickZoom.disable();
    } else {
      map?.doubleClickZoom.enable();
    }
  }, [drawing, ready]);

  // "Ver en el mapa" de la lista: se centra en el barrio, abre su popup y trae el mapa a la vista.
  useEffect(() => {
    const onFocus = (event: Event) => {
      const focus = mapRef.current?.focus.get(Number((event as CustomEvent).detail));
      if (!focus) return;
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      focus();
    };
    window.addEventListener(BARRIO_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(BARRIO_FOCUS_EVENT, onFocus);
  }, []);

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

        // El popup se abre a mano: dibujando no se abre (si no, el mapa se desplaza para mostrarlo y el
        // toque siguiente se pierde) y el toque sigue al mapa, que agrega el vértice.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const showPopup = (barrio: AdminBarrio) => (event: any) => {
          if (!drawingRef.current) openPopup(barrio, event.latlng);
        };

        // Las capas se arman primero y se agregan después de fijar la vista. Agregadas antes, Leaflet las
        // encola hasta tener vista y, con polígonos y puntos mezclados, un polígono puede dibujarse antes
        // que el renderer que comparten esté listo ("Cannot read properties of undefined (reading 'min')").
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const layers: any[] = [];
        const focus = new Map<number, () => void>();
        const openPopup = (barrio: AdminBarrio, latlng: unknown) =>
          L.popup({ maxWidth: 260 }).setLatLng(latlng).setContent(popupHtml(barrio)).openOn(map);
        const bounds = L.latLngBounds([]);
        for (const barrio of barrios) {
          const info = sourceInfo(barrio);
          if (barrio.geometry) {
            const layer = L.geoJSON(barrio.geometry, {
              style: {
                color: info.color,
                weight: 2,
                fillColor: barrio.neighbors > 0 ? info.color : info.fill,
                fillOpacity: barrio.neighbors > 0 ? 0.3 : 0.15,
              },
            })
              .on("click", showPopup(barrio))
              .bindTooltip(barrio.name, { sticky: true });
            layers.push(layer);
            bounds.extend(layer.getBounds());
            focus.set(barrio.id, () => {
              map.fitBounds(layer.getBounds(), { maxZoom: 17, padding: [30, 30] });
              openPopup(barrio, layer.getBounds().getCenter());
            });
          } else if (barrio.center) {
            const marker = L.circleMarker([barrio.center.lat, barrio.center.lon], {
              radius: 7,
              color: "#ffffff",
              weight: 2,
              fillColor: info.fill,
              fillOpacity: 0.9,
            })
              .on("click", showPopup(barrio))
              .bindTooltip(barrio.name);
            layers.push(marker);
            bounds.extend([barrio.center.lat, barrio.center.lon]);
            const center = [barrio.center.lat, barrio.center.lon];
            focus.set(barrio.id, () => {
              map.setView(center, 16);
              openPopup(barrio, center);
            });
          }
        }

        if (bounds.isValid()) map.fitBounds(bounds.pad(0.05), { maxZoom: 15 });
        else map.fitBounds(AMGR_BOUNDS);
        for (const layer of layers) layer.addTo(map);

        // Dibujando, el toque agrega un vértice (aunque caiga sobre otro barrio).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.on("click", (event: any) => {
          if (!drawingRef.current) return;
          const vertex: Vertex = [Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))];
          setVertices((current) => [...current, vertex]);
        });

        mapRef.current = { L, map, draft: L.layerGroup().addTo(map), focus };
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
