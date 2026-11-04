"use client";

// Botón de cada fila de la lista de barrios: le pide al mapa (BarriosMap) que se centre en ese barrio.
// La lista se arma en el servidor y el mapa en el navegador: se hablan con un evento de la ventana.
export const BARRIO_FOCUS_EVENT = "barrio-focus";

export default function VerEnMapa({ barrioId, className }: { barrioId: number; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(BARRIO_FOCUS_EVENT, { detail: barrioId }))}
    >
      Ver en el mapa
    </button>
  );
}
