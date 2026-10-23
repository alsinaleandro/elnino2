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

// Niveles de cada mapa que existen en la localidad (códigos 1 a 4, en el orden de los segmentos).
type Codes = Record<"rio" | "lluvia", number[]>;
const ALL_CODES: Codes = { rio: [1, 2, 3, 4], lluvia: [1, 2, 3, 4] };
const withCodes = (segments: Segment[], codes: number[]) => segments.filter((_, index) => codes.includes(index + 1));

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

// Qué significa cada zona según la resolución de cada mapa, de mayor a menor peligro (como se leen
// las barras). `tones` son las zonas del mapa que explica cada texto: la leve regulada del mapa del
// río no tiene texto propio y se explica con la leve.
type GuideItem = { tones: DangerTone[]; title: string; meaning: string };
type GuideSection = { key: "rio" | "lluvia"; title: string; items: GuideItem[] };

const GUIDE_SECTIONS: GuideSection[] = [
  {
    key: "rio",
    title: "Res. 303/17 – Riesgo hídrico por crecida de ríos",
    items: [
      {
        tones: ["dangerHigh"],
        title: "Zona prohibida",
        meaning:
          "Zonas más bajas que la línea de ribera (crecida normal del río), que quedarán cubiertas por agua.",
      },
      {
        tones: ["dangerSevere"],
        title: "Restricción severa",
        meaning:
          "Zonas por encima de la línea de ribera pero que quedaron cubiertas por agua en la inundación de mayo 1998, cuando la altura del Paraná superó los 8,50 m de altura.",
      },
      {
        tones: ["dangerLight", "dangerRegulated"],
        title: "Restricción leve",
        meaning:
          "Superficies ubicadas por encima de la crecida de mayo 1998, cuando la altura del Paraná superó los 8,50 m de altura.",
      },
    ],
  },
  {
    key: "lluvia",
    title: "Res. 121/14 – Riesgo hídrico por precipitaciones",
    items: [
      {
        tones: ["dangerHigh"],
        title: "Zona prohibida",
        meaning:
          "Zonas permanentemente ocupadas por agua (lagunas, ríos o canales de escurrimiento). Ocupación permanente de agua en sistemas hídricos naturales o canales principales de desagüe pluvial.",
      },
      {
        tones: ["dangerSevere"],
        title: "Restricción severa",
        meaning:
          "Áreas de fácil acumulación de agua, con cualquier precipitación, recurrencia de entre 5 y 10 años. No tienen planes directores de desagües pluviales, no se conoce la eficacia de los sistemas de escurrimiento (natural o artificial) para disminuir el riesgo de inundabilidad.",
      },
      {
        tones: ["dangerTemporary"],
        title: "Restricción severa temporaria",
        meaning:
          "Áreas de fácil acumulación de agua con cualquier precipitación, donde se espera que los sistemas de escurrimiento (natural o artificial) disminuya el riesgo de inundabilidad.",
      },
      {
        tones: ["dangerLight"],
        title: "Restricción leve",
        meaning:
          "No se inundan o lo hacen con muy poca frecuencia, con elevadas precipitaciones y más de 10 años de recurrencia.",
      },
    ],
  },
];

// Significado de una zona de un mapa (lo usa también la pestaña Mapa).
export const getZoneMeaning = (map: GuideSection["key"], tone: DangerTone) =>
  GUIDE_SECTIONS.find((section) => section.key === map)?.items.find((item) => item.tones.includes(tone))
    ?.meaning ?? null;

// Explica las zonas de cada mapa y resalta aquella donde está el usuario.
export function RiskLevelsGuide({ rio, lluvia }: Props) {
  const userTones = { rio: rio.tone, lluvia: lluvia.tone };

  return (
    <section className={styles.riskGuide} aria-label="Qué significa cada zona de riesgo">
      <h3 className={styles.riskGuideTitle}>¿Qué significa tu zona?</h3>
      {GUIDE_SECTIONS.map((section) => (
        <div key={section.key} className={styles.riskGuideSection}>
          <h4 className={styles.riskGuideSubtitle}>{section.title}</h4>
          <dl className={styles.riskGuideList}>
            {section.items.map((item) => {
              const userTone = userTones[section.key];
              const isUserZone = userTone !== null && item.tones.includes(userTone);
              return (
                <div
                  key={item.title}
                  className={`${styles.riskGuideItem} ${isUserZone ? styles.riskGuideItemActive : ""}`}
                >
                  <dt>
                    {/* Mismo color (y rayas) que la zona en la barra. */}
                    <i className={styles[item.tones[0]]} aria-hidden="true" />
                    {item.title}
                  </dt>
                  <dd>
                    {isUserZone ? <span className={styles.riskGuideMaps}>Estás acá</span> : null}
                    {item.meaning}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </section>
  );
}

export default function RiskBars({ rio, lluvia, codes = ALL_CODES }: Props & { codes?: Codes }) {
  return (
    <div className={styles.riskBars}>
      <RiskBar title="Crecida de Ríos" segments={withCodes(RIVER_SEGMENTS, codes.rio)} state={rio} />
      <RiskBar title="Precipitaciones" segments={withCodes(RAIN_SEGMENTS, codes.lluvia)} state={lluvia} />
    </div>
  );
}
