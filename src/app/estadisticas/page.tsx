import type { Metadata } from "next";
import { connection } from "next/server";
import { getVisitLocations, getVisits } from "@/lib/visits";
import VisitsMap from "./VisitsMap";

// Página interna: no está enlazada desde la app y se pide a los buscadores que no la indexen.
export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
};

export default async function Estadisticas() {
  // node:sqlite es síncrono: sin esto Next leería el valor una sola vez, al compilar.
  await connection();
  const visits = getVisits();
  const locations = getVisitLocations();

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "48px 16px", fontFamily: "var(--font-geist-sans)" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.4rem" }}>Estadísticas</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 48px", marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, color: "#4b5563" }}>Visitas totales</p>
          <p style={{ margin: "4px 0 0", fontSize: "2.5rem", fontWeight: 800 }}>{visits.toLocaleString("es-AR")}</p>
        </div>
        <div>
          <p style={{ margin: 0, color: "#4b5563" }}>Visitas con ubicación GPS</p>
          <p style={{ margin: "4px 0 0", fontSize: "2.5rem", fontWeight: 800 }}>{locations.length.toLocaleString("es-AR")}</p>
        </div>
      </div>
      <VisitsMap visits={locations} />
      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: "#4b5563" }}>
        Un punto por visita. Tocá un punto para ver la fecha y la hora.
      </p>
    </main>
  );
}
