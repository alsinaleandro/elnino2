import styles from "./page.module.css";

// Indicador de zona de riesgo hídrico: dos barras verticales paralelas, una por mapa (crecida del
// río Negro y precipitaciones), con los niveles de menor (abajo) a mayor (arriba) peligro. Cada
// barra marca de forma independiente la zona donde está el usuario.

export type DangerTone =
  | "dangerLight"
  | "dangerRegulated"
  | "dangerTemporary"
  | "dangerSevere"
  | "dangerHigh"
  | "dangerNeutral";

// Colores de cada nivel, compartidos con las capas del mapa (page.tsx). stroke = borde más oscuro
// para que el contorno se distinga sobre el mapa. "Leve regulada" y "Severa temporaria" usan el
// color de "Leve" y "Severa" con rayas: entre esos colores no entra otro distinguible (tampoco con
// daltonismo).
export const DANGER_COLORS: Record<DangerTone, { fill: string; stroke: string; stripe?: string }> = {
  dangerLight: { fill: "#0ca30c", stroke: "#087a08" },
  dangerRegulated: { fill: "#0ca30c", stroke: "#087a08", stripe: "#9be89b" },
  dangerTemporary: { fill: "#fab219", stroke: "#b7791f", stripe: "#fde3a7" },
  dangerSevere: { fill: "#fab219", stroke: "#b7791f" },
  dangerHigh: { fill: "#d03b3b", stroke: "#a12828" },
  dangerNeutral: { fill: "#9ca3af", stroke: "#6b7280" },
};

const normalizeRiskText = (value?: string | null) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const getDangerLevel = (category?: string | null): { label: string; tone: DangerTone } => {
  const normalized = normalizeRiskText(category);

  if (normalized.includes("PROHIBIDA")) {
    return { label: "ZONA PROHIBIDA", tone: "dangerHigh" };
  }

  if (normalized.includes("RESTRICCION SEVERA TEMPORARIA")) {
    return { label: "ZONA DE RESTRICCION SEVERA TEMPORARIA", tone: "dangerTemporary" };
  }

  if (normalized.includes("RESTRICCION SEVERA")) {
    return { label: "ZONA DE RESTRICCION SEVERA", tone: "dangerSevere" };
  }

  if (normalized.includes("RESTRICCION LEVE REGULADA")) {
    return { label: "ZONA DE RESTRICCION LEVE REGULADA", tone: "dangerRegulated" };
  }

  if (normalized.includes("RESTRICCION LEVE")) {
    return { label: "ZONA DE RESTRICCION LEVE", tone: "dangerLight" };
  }

  return { label: "SIN ZONA COINCIDENTE", tone: "dangerNeutral" };
};

type Segment = { tone: DangerTone; label: string; title: string };

// Niveles de cada mapa, de menor a mayor peligro.
const RIVER_SEGMENTS: Segment[] = [
  { tone: "dangerLight", label: "Leve", title: "Zona de restricción leve" },
  { tone: "dangerRegulated", label: "Leve regulada", title: "Zona de restricción leve regulada" },
  { tone: "dangerSevere", label: "Severa", title: "Zona de restricción severa" },
  { tone: "dangerHigh", label: "Prohibida", title: "Zona prohibida" },
];

const RAIN_SEGMENTS: Segment[] = [
  { tone: "dangerLight", label: "Leve", title: "Zona de restricción leve" },
  { tone: "dangerTemporary", label: "Severa temporaria", title: "Zona de restricción severa temporaria" },
  { tone: "dangerSevere", label: "Severa", title: "Zona de restricción severa" },
  { tone: "dangerHigh", label: "Prohibida", title: "Zona prohibida" },
];

// tone = zona del usuario (null mientras carga o si está fuera de las zonas); status = texto de la
// etiqueta debajo de la barra.
export type RiskBarState = { tone: DangerTone | null; status: string };

type Props = {
  rio: RiskBarState;
  lluvia: RiskBarState;
};

function RiskBar({ title, segments, state }: { title: string; segments: Segment[]; state: RiskBarState }) {
  const activeIndex = segments.findIndex((segment) => segment.tone === state.tone);
  const isActive = activeIndex >= 0;

  return (
    <figure className={styles.riskBar} aria-label={`${title}: ${state.status}`}>
      <figcaption className={styles.riskBarTitle}>{title}</figcaption>

      {/* De arriba (más peligro) hacia abajo, como se lee una escala. */}
      <ol className={styles.riskBarScale}>
        {[...segments].reverse().map((segment) => {
          const isCurrent = segment.tone === state.tone;
          return (
            <li
              key={segment.tone}
              title={segment.title}
              className={`${styles.riskBarStep} ${isCurrent ? styles.riskBarStepActive : ""} ${
                isActive && !isCurrent ? styles.riskBarStepDim : ""
              }`}
            >
              <span className={styles.riskBarMarker} aria-hidden="true">
                {isCurrent ? "▶" : ""}
              </span>
              <span className={`${styles.riskBarFill} ${styles[segment.tone]}`} />
              <span className={styles.riskBarLabel}>
                {segment.label}
                {isCurrent ? <small>Estás acá</small> : null}
              </span>
            </li>
          );
        })}
      </ol>

      <span className={`${styles.dangerBadge} ${styles.riskBarBadge} ${styles[state.tone ?? "dangerNeutral"]}`}>
        {state.status}
      </span>
    </figure>
  );
}

// Qué significa cada nivel, en lenguaje simple. Las variantes rayadas comparten el texto del nivel
// base (leve regulada → leve, severa temporaria → severa).
const LIGHT_MEANING =
  "El agua puede llegar solo en eventos extraordinarios. Se puede vivir y construir, tomando precauciones.";
const SEVERE_MEANING =
  "Es una zona inundable. Construir y vivir tiene restricciones: conviene tener un plan y un lugar seguro en altura.";

const LEVEL_MEANINGS: Partial<Record<DangerTone, string>> = {
  dangerLight: LIGHT_MEANING,
  dangerRegulated: `${LIGHT_MEANING} Es una variante de la zona leve.`,
  dangerSevere: SEVERE_MEANING,
  dangerTemporary: `${SEVERE_MEANING} Es una variante de la zona severa.`,
  dangerHigh: "El agua llega con frecuencia. No está permitido construir viviendas: es la zona de mayor peligro.",
};

const zoneTitle = (tone: DangerTone) =>
  [...RIVER_SEGMENTS, ...RAIN_SEGMENTS].find((segment) => segment.tone === tone)?.title ?? "";

// Explica solo la zona donde está el usuario en cada mapa; si es la misma en los dos, una vez.
export function RiskLevelsGuide({ rio, lluvia }: Props) {
  const zones: Array<{ maps: string; tone: DangerTone }> = [];
  for (const [maps, state] of [
    ["Crecida del río Negro", rio],
    ["Precipitaciones", lluvia],
  ] as const) {
    if (!state.tone || !LEVEL_MEANINGS[state.tone]) continue;
    const same = zones.find((zone) => zone.tone === state.tone);
    if (same) same.maps += " y precipitaciones";
    else zones.push({ maps, tone: state.tone });
  }

  if (zones.length === 0) {
    return null;
  }

  return (
    <section className={styles.riskGuide} aria-label="Qué significa tu zona de riesgo">
      <h3 className={styles.riskGuideTitle}>¿Qué significa tu zona?</h3>
      <dl className={styles.riskGuideList}>
        {zones.map(({ maps, tone }) => (
          <div key={tone} className={styles.riskGuideItem}>
            <dt>
              <i style={{ background: DANGER_COLORS[tone].fill }} aria-hidden="true" />
              {zoneTitle(tone)}
            </dt>
            <dd>
              <span className={styles.riskGuideMaps}>{maps}</span>
              {LEVEL_MEANINGS[tone]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function RiskBars({ rio, lluvia }: Props) {
  return (
    <div className={styles.riskBars}>
      <RiskBar title="Crecida del río Negro" segments={RIVER_SEGMENTS} state={rio} />
      <RiskBar title="Precipitaciones" segments={RAIN_SEGMENTS} state={lluvia} />
    </div>
  );
}
