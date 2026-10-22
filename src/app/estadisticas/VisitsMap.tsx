"use client";

import { useEffect, useRef, useState } from "react";
import { loadLeaflet, removeMap } from "../leaflet";
import type { VisitLocation } from "@/lib/visits";

// Resistencia, Barranqueras, Fontana y Puerto Vilelas: el mapa arranca mostrando esta zona
// aunque haya visitas en otros lados.
const AMGR_BOUNDS: [[number, number], [number, number]] = [
  [-27.53, -59.06],
  [-27.39, -58.9],
];

const DATE_TIME = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
});

export default function VisitsMap({ visits }: { visits: VisitLocation[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let map: any = null;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;

        // Con muchos puntos, dibujarlos en un canvas es mucho más liviano que un elemento por punto.
        map = L.map(containerRef.current, { preferCanvas: true }).fitBounds(AMGR_BOUNDS);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        for (const visit of visits) {
          L.circleMarker([visit.latitude, visit.longitude], {
            radius: 5,
            color: "#ffffff",
            weight: 1,
            fillColor: "#7c3aed",
            fillOpacity: 0.75,
          })
            .bindPopup(
              DATE_TIME.format(new Date(visit.createdAt)) +
                (visit.accuracy !== null ? `<br>Precisión: ${Math.round(visit.accuracy)} m` : ""),
            )
            .addTo(map);
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el mapa.");
      });

    return () => {
      cancelled = true;
      if (map) removeMap(map);
    };
  }, [visits]);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return <div ref={containerRef} style={{ height: "min(70vh, 560px)", borderRadius: 12, overflow: "hidden" }} />;
}
