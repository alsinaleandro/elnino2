import type { Metadata } from "next";
import { connection } from "next/server";
import { getVisits } from "@/lib/visits";

// Página interna: no está enlazada desde la app y se pide a los buscadores que no la indexen.
export const metadata: Metadata = {
  title: "Estadísticas",
  robots: { index: false, follow: false },
};

export default async function Estadisticas() {
  // node:sqlite es síncrono: sin esto Next leería el valor una sola vez, al compilar.
  await connection();
  const visits = getVisits();

  return (
    <main style={{ maxWidth: "24rem", margin: "0 auto", padding: "48px 16px", fontFamily: "var(--font-geist-sans)" }}>
      <h1 style={{ margin: "0 0 24px", fontSize: "1.4rem" }}>Estadísticas</h1>
      <p style={{ margin: 0, color: "#4b5563" }}>Visitas totales</p>
      <p style={{ margin: "4px 0 0", fontSize: "2.5rem", fontWeight: 800 }}>{visits.toLocaleString("es-AR")}</p>
    </main>
  );
}
