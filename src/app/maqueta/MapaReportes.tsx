"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, removeMap } from "../leaflet";
import { CAUSAS, ESTADOS, REPORTES, UBICACION, type Causa, type Estado, type Reporte } from "./datos";
import styles from "./maqueta.module.css";

// Pestaña Mapa de la maqueta: zonas de riesgo oficiales (capa real) + reportes de vecinos (de
// ejemplo) + el recorrido para reportar (Idea 2 de ideas.md).

const hace = (min: number) =>
  min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `hace ${Math.round(min / 1440)} días`;

// Cuánto falta para que el reporte deje de verse, según la causa y la última actualización.
function vence(reporte: Reporte) {
  const ultima = reporte.historial[0];
  if (ultima.estado === "sin-agua") return "se oculta en 3 h";
  const restanH = CAUSAS[reporte.causa].horas - ultima.haceMin / 60;
  return restanH >= 24 ? `vence en ${Math.round(restanH / 24)} días` : `vence en ${Math.max(1, Math.round(restanH))} h`;
}

type Borrador = { punto: [number, number]; estado: Estado | null; causa: Causa | null; lugar: string; foto: string | null };

export default function MapaReportes({ registrado, onRegistrarse }: { registrado: boolean; onRegistrarse: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportesLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const riesgoLayerRef = useRef<any>(null);
  const eligiendoRef = useRef(false);

  const [reportes, setReportes] = useState<Reporte[]>(REPORTES);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [mostrarRiesgo, setMostrarRiesgo] = useState(false);
  const [paso, setPaso] = useState<"nada" | "registro" | "eligiendo" | "datos">("nada");
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const elegirPunto = (punto: [number, number]) => {
    eligiendoRef.current = false;
    setBorrador({ punto, estado: null, causa: null, lugar: "", foto: null });
    setPaso("datos");
  };

  // Mapa: se crea una vez.
  useEffect(() => {
    let cancelado = false;

    loadLeaflet().then((L) => {
      if (cancelado || !containerRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true }).setView([-27.463, -58.985], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      L.circleMarker(UBICACION, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#111827", fillOpacity: 1 })
        .bindTooltip("Vos")
        .addTo(map);
      reportesLayerRef.current = L.layerGroup().addTo(map);
      map.on("click", (event: { latlng: { lat: number; lng: number } }) => {
        if (eligiendoRef.current) elegirPunto([event.latlng.lat, event.latlng.lng]);
      });
      mapRef.current = map;
      setReportes((current) => [...current]); // dibuja los reportes
    });

    return () => {
      cancelado = true;
      if (mapRef.current) removeMap(mapRef.current);
      mapRef.current = null;
    };
  }, []);

  // Reportes: se redibujan cuando cambian. La primera vez, el mapa se encuadra para que entren
  // todos junto con la ubicación del vecino.
  const encuadradoRef = useRef(false);
  useEffect(() => {
    const L = window.L;
    const layer = reportesLayerRef.current;
    if (!L || !layer) return;
    layer.clearLayers();

    if (!encuadradoRef.current && mapRef.current) {
      encuadradoRef.current = true;
      const puntos = reportes.flatMap((item) => (item.forma.tipo === "punto" ? [item.forma.punto] : item.forma.puntos));
      mapRef.current.fitBounds(L.latLngBounds([...puntos, UBICACION]).pad(0.15), { animate: false });
    }

    for (const reporte of reportes) {
      const color = ESTADOS[reporte.historial[0].estado].color;
      const seleccionar = () => setSeleccionado(reporte.id);
      const forma = reporte.forma;
      const item =
        forma.tipo === "punto"
          ? L.circleMarker(forma.punto, { radius: 11, color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 1 })
          : forma.tipo === "tramo"
            ? L.polyline(forma.puntos, { color, weight: 8, opacity: 0.85, lineCap: "round" })
            : L.polygon(forma.puntos, { color, weight: 2, fillColor: color, fillOpacity: 0.35 });
      item.on("click", seleccionar).addTo(layer);
    }
  }, [reportes]);

  // Capa oficial de zonas de riesgo por crecida (la misma de la app).
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    if (!mostrarRiesgo) {
      riesgoLayerRef.current?.remove();
      return;
    }
    if (riesgoLayerRef.current) {
      riesgoLayerRef.current.addTo(map);
      return;
    }
    fetch("/api/geo/capa")
      .then((response) => response.json())
      .then((geojson) => {
        riesgoLayerRef.current = L.geoJSON(geojson, {
          style: { color: "#1e40af", weight: 1, fillColor: "#3b82f6", fillOpacity: 0.25 },
        });
        if (mapRef.current) riesgoLayerRef.current.addTo(mapRef.current);
      })
      .catch(() => {});
  }, [mostrarRiesgo]);

  const reporte = reportes.find((item) => item.id === seleccionado) ?? null;

  const actualizar = (estado: Estado) => {
    if (!registrado) {
      setPaso("registro");
      return;
    }
    setReportes((current) =>
      current.map((item) =>
        item.id === seleccionado ? { ...item, historial: [{ estado, autor: "Vos", haceMin: 0 }, ...item.historial] } : item,
      ),
    );
  };

  const empezarReporte = () => {
    setSeleccionado(null);
    if (!registrado) {
      setPaso("registro");
      return;
    }
    eligiendoRef.current = true;
    setPaso("eligiendo");
  };

  const publicar = () => {
    if (!borrador?.estado || !borrador.causa) return;
    const id = Date.now();
    setReportes((current) => [
      ...current,
      {
        id,
        lugar: borrador.lugar.trim() || "Punto reportado por vos",
        causa: borrador.causa!,
        forma: { tipo: "punto", punto: borrador.punto },
        historial: [{ estado: borrador.estado!, autor: "Vos", haceMin: 0 }],
        fotos: borrador.foto ? 1 : 0,
      },
    ]);
    setSeleccionado(id);
    setPaso("nada");
    setBorrador(null);
  };

  const cancelar = () => {
    eligiendoRef.current = false;
    setPaso("nada");
    setBorrador(null);
  };

  return (
    <>
      <div className={styles.layerToggles}>
        <label>
          <input type="checkbox" checked readOnly /> Reportes de vecinos
        </label>
        <label>
          <input type="checkbox" checked={mostrarRiesgo} onChange={(event) => setMostrarRiesgo(event.target.checked)} />{" "}
          Zonas de riesgo (APA)
        </label>
      </div>

      <div className={styles.mapBox}>
        <div ref={containerRef} className={styles.map} />
        {paso === "eligiendo" ? (
          <div className={styles.mapHint}>
            Tocá el mapa donde está el agua
            <div className={styles.row} style={{ justifyContent: "center", marginTop: 8 }}>
              <button type="button" className={`${styles.btnSecondary} ${styles.btnSmall}`} onClick={() => elegirPunto(UBICACION)}>
                📍 Estoy acá
              </button>
              <button type="button" className={`${styles.btnSecondary} ${styles.btnSmall}`} onClick={cancelar}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${styles.btnPrimary} ${styles.fab}`} onClick={empezarReporte}>
            ＋ Reportar agua
          </button>
        )}
      </div>

      <div className={styles.legend}>
        {Object.values(ESTADOS).map((estado) => (
          <span key={estado.label}>
            <i style={{ background: estado.color }} />
            {estado.label}
          </span>
        ))}
        <span>· Información de vecinos, no oficial</span>
      </div>

      {reporte ? (
        <div className={`${styles.card} ${styles.cardStatic}`}>
          <div className={styles.row} style={{ justifyContent: "space-between" }}>
            <strong>{reporte.lugar}</strong>
            <button type="button" className={styles.btnGhost} onClick={() => setSeleccionado(null)} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <div className={styles.row}>
            <span className={styles.estadoBadge} style={{ background: ESTADOS[reporte.historial[0].estado].color }}>
              {ESTADOS[reporte.historial[0].estado].label}
            </span>
            <span className={styles.muted}>
              {CAUSAS[reporte.causa].label} · {vence(reporte)}
            </span>
          </div>
          {reporte.fotos > 0 ? (
            <div className={styles.photos}>
              {Array.from({ length: reporte.fotos }, (_, index) => (
                <span key={index} className={styles.photo}>
                  📷
                </span>
              ))}
            </div>
          ) : null}
          <div className={styles.historial}>
            {reporte.historial.map((item, index) => (
              <span key={index}>
                <strong style={{ color: ESTADOS[item.estado].color }}>{ESTADOS[item.estado].label}</strong> ·{" "}
                {item.autor} · {item.haceMin === 0 ? "recién" : hace(item.haceMin)}
              </span>
            ))}
          </div>
          <span className={styles.sheetLabel}>¿Cómo está ahora?</span>
          <div className={styles.estadoButtons}>
            {(Object.keys(ESTADOS) as Estado[]).map((estado) => (
              <button key={estado} type="button" style={{ color: ESTADOS[estado].color }} onClick={() => actualizar(estado)}>
                {ESTADOS[estado].label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className={styles.muted}>Tocá un reporte en el mapa para ver el detalle y actualizar cómo está.</p>
      )}

      {paso === "registro" ? (
        <>
          <div className={styles.sheetBackdrop} onClick={cancelar} />
          <div className={styles.sheet} role="dialog" aria-label="Registrate para reportar">
            <h2>Registrate para reportar</h2>
            <p className={styles.muted}>
              Para cargar o actualizar reportes tenés que ser parte del comité de tu barrio. Así cada reporte tiene un
              vecino responsable y evitamos reportes falsos.
            </p>
            <button type="button" className={styles.btnPrimary} onClick={onRegistrarse}>
              ✊ ¡Organizate!
            </button>
            <button type="button" className={styles.btnGhost} onClick={cancelar}>
              Ahora no
            </button>
          </div>
        </>
      ) : null}

      {paso === "datos" && borrador ? (
        <>
          <div className={styles.sheetBackdrop} onClick={cancelar} />
          <div className={styles.sheet} role="dialog" aria-label="Nuevo reporte">
            <h2>Nuevo reporte</h2>

            <span className={styles.sheetLabel}>¿Qué marcás?</span>
            <div className={styles.options} style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              <button type="button" className={`${styles.option} ${styles.optionActive}`}>
                <strong>Punto</strong>
                <small>Una esquina o lugar</small>
              </button>
              <button type="button" className={styles.option} disabled>
                <strong>Calle</strong>
                <small>Próximamente</small>
              </button>
              <button type="button" className={styles.option} disabled>
                <strong>Zona</strong>
                <small>Próximamente</small>
              </button>
            </div>

            <span className={styles.sheetLabel}>¿Cómo está?</span>
            <div className={styles.options}>
              {(["anegada", "intransitable"] as const).map((estado) => (
                <button
                  key={estado}
                  type="button"
                  className={`${styles.option} ${borrador.estado === estado ? styles.optionActive : ""}`}
                  onClick={() => setBorrador({ ...borrador, estado })}
                >
                  <strong style={{ color: ESTADOS[estado].color }}>{ESTADOS[estado].label}</strong>
                  <small>{estado === "anegada" ? "Hay agua, se puede pasar con cuidado" : "No se puede pasar"}</small>
                </button>
              ))}
            </div>

            <span className={styles.sheetLabel}>¿Por qué se inundó?</span>
            <div className={styles.options}>
              {(Object.keys(CAUSAS) as Causa[]).map((causa) => (
                <button
                  key={causa}
                  type="button"
                  className={`${styles.option} ${borrador.causa === causa ? styles.optionActive : ""}`}
                  onClick={() => setBorrador({ ...borrador, causa })}
                >
                  <strong>{CAUSAS[causa].label}</strong>
                  <small>El reporte dura {CAUSAS[causa].duracion}</small>
                </button>
              ))}
            </div>

            <label className={styles.field}>
              Lugar (opcional)
              <input
                type="text"
                placeholder="Ej.: Pellegrini y Alvear"
                value={borrador.lugar}
                onChange={(event) => setBorrador({ ...borrador, lugar: event.target.value })}
              />
            </label>

            <label className={styles.field}>
              Foto (opcional)
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setBorrador({ ...borrador, foto: file ? URL.createObjectURL(file) : null });
                }}
              />
            </label>
            {borrador.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={borrador.foto} alt="Foto del reporte" className={styles.photo} style={{ width: 96, height: 96 }} />
            ) : null}

            <button type="button" className={styles.btnPrimary} disabled={!borrador.estado || !borrador.causa} onClick={publicar}>
              Publicar reporte
            </button>
            <button type="button" className={styles.btnGhost} onClick={cancelar}>
              Cancelar
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}
