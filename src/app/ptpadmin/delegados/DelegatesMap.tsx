"use client";

import { useEffect, useRef, useState } from "react";
import type { MappedDelegate } from "@/lib/delegates";
import { loadLeaflet, removeMap } from "../../leaflet";

// Mapa de los delegados de todos los barrios. Cada punto es un delegado (o varios, si caen en el
// mismo lugar, como dos delegados ubicados en el centro de su barrio). Al tocarlo se ven nombre,
// barrio, WhatsApp y seguidores.

// El AMGR: el mapa arranca acá si no hay delegados con ubicación.
const AMGR_BOUNDS: [[number, number], [number, number]] = [
  [-27.53, -59.06],
  [-27.39, -58.9],
];

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function popupHtml(delegate: MappedDelegate) {
  const whatsapp = delegate.whatsappLink
    ? `<a href="${escapeHtml(delegate.whatsappLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(delegate.whatsapp)}</a>`
    : escapeHtml(delegate.whatsapp);
  const followers = `${delegate.followers} ${delegate.followers === 1 ? "seguidor" : "seguidores"}`;
  return (
    `<strong>${escapeHtml(delegate.name)}</strong><br>` +
    `Barrio: ${escapeHtml(delegate.barrio)}${delegate.localidad ? ` (${escapeHtml(delegate.localidad)})` : ""}<br>` +
    `WhatsApp: ${whatsapp}<br>` +
    `${followers}` +
    (delegate.point?.approximate ? `<br><small>Ubicación aproximada: centro del barrio</small>` : "")
  );
}

export default function DelegatesMap({ delegates }: { delegates: MappedDelegate[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

        // Los que caen en el mismo punto van en un solo marcador, para que ninguno quede tapado.
        const groups = new Map<string, MappedDelegate[]>();
        for (const delegate of delegates) {
          if (!delegate.point) continue;
          const key = `${delegate.point.lat.toFixed(5)},${delegate.point.lon.toFixed(5)}`;
          groups.set(key, [...(groups.get(key) ?? []), delegate]);
        }

        const points: Array<[number, number]> = [];
        for (const group of groups.values()) {
          const { lat, lon, approximate } = group[0].point!;
          points.push([lat, lon]);
          L.circleMarker([lat, lon], {
            radius: group.length > 1 ? 11 : 8,
            color: "#ffffff",
            weight: 2,
            // Azul: ubicación del delegado. Celeste con borde punteado: centro del barrio.
            fillColor: approximate ? "#38bdf8" : "#0369a1",
            fillOpacity: 0.9,
            dashArray: approximate ? "3 3" : undefined,
          })
            .bindPopup(group.map(popupHtml).join("<hr>"), { maxWidth: 260 })
            .bindTooltip(group.length > 1 ? `${group.length} delegados` : group[0].name)
            .addTo(map);
        }

        if (points.length > 0) map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 15 });
        else map.fitBounds(AMGR_BOUNDS);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "No se pudo cargar el mapa.");
      });

    return () => {
      cancelled = true;
      if (map) removeMap(map);
    };
  }, [delegates]);

  if (error) return <p style={{ color: "#b91c1c" }}>{error}</p>;

  return <div ref={containerRef} style={{ height: "min(65vh, 520px)", borderRadius: 12, overflow: "hidden" }} />;
}
