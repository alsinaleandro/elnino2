import type { Metadata } from "next";
import Maqueta from "./Maqueta";

// Maqueta navegable de la nueva interfaz, para que el equipo la pruebe en el servidor de prueba.
// No está enlazada desde la app y se pide a los buscadores que no la indexen.
export const metadata: Metadata = {
  title: "Maqueta",
  robots: { index: false, follow: false },
};

export default function MaquetaPage() {
  return <Maqueta />;
}
