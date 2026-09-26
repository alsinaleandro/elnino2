import { useId } from "react";
import styles from "./page.module.css";

export type DangerTone = "dangerLight" | "dangerTemporary" | "dangerSevere" | "dangerHigh" | "dangerNeutral";

// Sectores de menor a mayor peligro. "Temporaria" usa el mismo amarillo que "Severa" con
// rayas: entre el verde y el amarillo no entra otro color distinguible (tampoco con daltonismo).
const SEGMENTS: Array<{ tone: DangerTone; label: string; title: string; color: string }> = [
  { tone: "dangerLight", label: "Leve", title: "Zona de restricción leve", color: "#0ca30c" },
  { tone: "dangerTemporary", label: "Temporaria", title: "Zona de restricción severa temporaria", color: "stripes" },
  { tone: "dangerSevere", label: "Severa", title: "Zona de restricción severa", color: "#fab219" },
  { tone: "dangerHigh", label: "Prohibida", title: "Zona prohibida", color: "#d03b3b" },
];

// Colores de cada nivel, compartidos con la capa del mapa (page.tsx). stroke = borde más oscuro
// para que el contorno se distinga sobre el mapa.
export const DANGER_COLORS: Record<DangerTone, { fill: string; stroke: string }> = {
  dangerLight: { fill: "#0ca30c", stroke: "#087a08" },
  dangerTemporary: { fill: "#fab219", stroke: "#b7791f" },
  dangerSevere: { fill: "#fab219", stroke: "#b7791f" },
  dangerHigh: { fill: "#d03b3b", stroke: "#a12828" },
  dangerNeutral: { fill: "#9ca3af", stroke: "#6b7280" },
};

const CX = 150;
const CY = 128;
const RADIUS = 96;
const STROKE = 22;
const GAP_DEGREES = 1.5;
const SEGMENT_DEGREES = 180 / SEGMENTS.length;

// Ángulos en grados: 180 = extremo izquierdo, 0 = extremo derecho.
function pointAt(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return { x: CX + radius * Math.cos(radians), y: CY - radius * Math.sin(radians) };
}

function arcPath(fromDegrees: number, toDegrees: number) {
  const start = pointAt(fromDegrees, RADIUS);
  const end = pointAt(toDegrees, RADIUS);
  return `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

type Props = {
  tone: DangerTone | null;
  label: string;
};

export default function DangerGauge({ tone, label }: Props) {
  const patternId = useId();
  const activeIndex = SEGMENTS.findIndex((segment) => segment.tone === tone);
  const isActive = activeIndex >= 0;
  // La aguja se dibuja apuntando a la izquierda y se gira hasta el centro del sector activo.
  const needleRotation = isActive ? (activeIndex + 0.5) * SEGMENT_DEGREES : 90;

  return (
    <svg
      className={styles.gauge}
      viewBox="0 0 300 150"
      role="img"
      aria-label={`Nivel de peligro: ${label}`}
    >
      <defs>
        <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="#fab219" />
          <rect width="3" height="7" fill="#c98500" />
        </pattern>
      </defs>

      {SEGMENTS.map((segment, index) => {
        const from = 180 - index * SEGMENT_DEGREES - (index === 0 ? 0 : GAP_DEGREES / 2);
        const to = 180 - (index + 1) * SEGMENT_DEGREES + (index === SEGMENTS.length - 1 ? 0 : GAP_DEGREES / 2);
        const middle = 180 - (index + 0.5) * SEGMENT_DEGREES;
        const labelPoint = pointAt(middle, RADIUS + STROKE / 2 + 10);
        const anchor = middle > 135 ? "end" : middle < 45 ? "start" : "middle";
        const isCurrent = index === activeIndex;

        return (
          <g key={segment.tone} className={isActive && !isCurrent ? styles.gaugeSegmentDim : undefined}>
            <title>{segment.title}</title>
            <path
              d={arcPath(from, to)}
              fill="none"
              stroke={segment.color === "stripes" ? `url(#${patternId})` : segment.color}
              strokeWidth={isCurrent ? STROKE + 6 : STROKE}
              className={styles.gaugeSegment}
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor={anchor}
              dominantBaseline="middle"
              className={isCurrent ? styles.gaugeLabelActive : styles.gaugeLabel}
            >
              {segment.label}
            </text>
          </g>
        );
      })}

      {isActive ? (
        <g className={styles.gaugeNeedle} style={{ transform: `rotate(${needleRotation}deg)` }}>
          <path
            d={`M ${CX} ${CY - 5} L ${CX - RADIUS + 8} ${CY} L ${CX} ${CY + 5} Z`}
            fill="#111827"
          />
        </g>
      ) : null}
      <circle cx={CX} cy={CY} r={isActive ? 9 : 6} fill={isActive ? "#111827" : "#9ca3af"} />
    </svg>
  );
}
