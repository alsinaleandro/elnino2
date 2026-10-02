import type { CotaMatch } from "@/lib/cotas";
import styles from "./page.module.css";

// Cota del terreno donde está parado el usuario y cuánto le falta al río para alcanzarla.
// Los mapas de cotas dan rangos de 1 m: se compara contra el límite inferior del rango
// (lo más prudente: el terreno puede estar tan bajo como ese valor).

const meters = (value: number) =>
  `${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

function hydrometerRange(cota: CotaMatch) {
  if (cota.hidrometroMin === null) return `menos de ${meters(cota.hidrometroMax!)}`;
  if (cota.hidrometroMax === null) return `más de ${meters(cota.hidrometroMin)}`;
  return `${meters(cota.hidrometroMin)} a ${meters(cota.hidrometroMax)}`;
}

function comparison(cota: CotaMatch, river: number): { tone: "ok" | "warn" | "danger"; text: string } {
  if (cota.hidrometroMin === null) {
    // "Menos de 49 m": solo se conoce el techo del rango.
    const top = cota.hidrometroMax!;
    return river >= top
      ? { tone: "danger", text: `El río (${meters(river)}) ya supera la cota más alta posible de tu terreno.` }
      : {
          tone: top - river <= 1 ? "danger" : "warn",
          text: `Tu terreno está por debajo de ${meters(top)}: al río (${meters(river)}) le faltan menos de ${meters(top - river)} para alcanzarlo.`,
        };
  }

  const margin = cota.hidrometroMin - river;
  if (margin <= 0) {
    return { tone: "danger", text: `El río (${meters(river)}) ya alcanza la cota de tu terreno.` };
  }
  return {
    tone: margin <= 1 ? "warn" : "ok",
    text: `Al río (${meters(river)}) le faltan ${meters(margin)} para alcanzar la parte más baja de tu terreno.`,
  };
}

type Props = {
  cota: CotaMatch | null;
  loading: boolean;
  error: string | null;
  riverHeight: number | null;
};

export default function CotaCard({ cota, loading, error, riverHeight }: Props) {
  const result = cota && riverHeight !== null ? comparison(cota, riverHeight) : null;

  return (
    <div className={styles.cotaCard}>
      <span className={styles.cotaCardLabel}>Cota del terreno donde estás</span>

      {loading && !cota ? (
        <strong className={styles.cotaCardValue}>Calculando...</strong>
      ) : error ? (
        <p className={styles.error}>{error}</p>
      ) : cota ? (
        <>
          <strong className={styles.cotaCardValue}>{cota.rango}</strong>
          <span className={styles.cotaCardSub}>sobre el nivel del mar (cota MOP)</span>
          <span className={styles.cotaCardEquivalence}>
            Equivale a <strong>{hydrometerRange(cota)}</strong> en el hidrómetro del puerto de Barranqueras, la
            escala con la que se mide el río.
          </span>
          {result ? (
            <p className={styles[`cotaCompare_${result.tone}`]}>
              <span aria-hidden="true">{result.tone === "ok" ? "✓" : "⚠"}</span>
              {result.text}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <strong className={styles.cotaCardValue}>Fuera de los mapas de cotas</strong>
          <span className={styles.cotaCardSub}>
            Tu ubicación no está dentro de ninguna de las zonas relevadas en los mapas de cotas.
          </span>
        </>
      )}
    </div>
  );
}
