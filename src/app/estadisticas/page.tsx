import type { Metadata } from "next";
import { connection } from "next/server";
import { getDailyVisits, getVisitLocations, getVisits } from "@/lib/visits";
import VisitsMap from "./VisitsMap";

// Página interna: no está enlazada desde la app y se pide a los buscadores que no la indexen.
export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
};

// El mapa muestra solo las visitas recientes.
const MAP_HOURS = 24;

const DAY = new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

const cell = { padding: "8px 12px", borderBottom: "1px solid #e5e7eb" } as const;

export default async function Estadisticas() {
  // node:sqlite es síncrono: sin esto Next leería el valor una sola vez, al compilar.
  await connection();
  const visits = getVisits();
  const locations = getVisitLocations(MAP_HOURS);
  const daily = getDailyVisits();

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "48px 16px", fontFamily: "var(--font-geist-sans)" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.4rem" }}>Estadísticas</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 48px", marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, color: "#4b5563" }}>Visitas totales</p>
          <p style={{ margin: "4px 0 0", fontSize: "2.5rem", fontWeight: 800 }}>{visits.toLocaleString("es-AR")}</p>
        </div>
        <div>
          <p style={{ margin: 0, color: "#4b5563" }}>Visitas con ubicación GPS (últimas {MAP_HOURS} h)</p>
          <p style={{ margin: "4px 0 0", fontSize: "2.5rem", fontWeight: 800 }}>{locations.length.toLocaleString("es-AR")}</p>
        </div>
      </div>
      <VisitsMap visits={locations} />
      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#4b5563" }}>
        Un punto por visita de las últimas {MAP_HOURS} horas. Tocá un punto para ver la fecha y la hora.
      </p>

      <h2 style={{ margin: "40px 0 12px", fontSize: "1.15rem" }}>Visitas por día</h2>
      {daily.length === 0 ? (
        <p style={{ margin: 0, color: "#4b5563" }}>Todavía no hay visitas registradas por día.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: "left" }}>Fecha</th>
              <th style={{ ...cell, textAlign: "right" }}>Visitas</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((day) => (
              <tr key={day.date}>
                <td style={cell}>{DAY.format(new Date(`${day.date}T12:00:00`))}</td>
                <td style={{ ...cell, textAlign: "right" }}>{day.visits.toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
