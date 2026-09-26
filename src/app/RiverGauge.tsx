import styles from "./page.module.css";

// Escala hidrométrica vertical: el agua llena la regla hasta la altura actual y las flechas
// marcan la altura actual y los niveles de alerta y evacuación.

type Props = {
  actual: number | null;
  alerta: number | null;
  evacuacion: number | null;
};

type Marker = {
  key: string;
  label: string;
  value: number;
  fill: string;
  stroke: string;
  strong?: boolean;
};

const WIDTH = 300;
const HEIGHT = 280;
const TOP = 16;
const BOTTOM = HEIGHT - 20;
const STAFF_X = 64;
const STAFF_WIDTH = 30;
const ARROW_X = STAFF_X + STAFF_WIDTH + 4;
const ARROW_LENGTH = 14;
const ARROW_MIN_GAP = 14;
const ARROW_STAGGER = 18;
const LABEL_X = ARROW_X + ARROW_LENGTH + ARROW_STAGGER * 2 + 22;
const LABEL_MIN_GAP = 36;

const formatMeters = (value: number) => `${value.toFixed(2)} m`;

// Separa verticalmente las etiquetas que quedarían encimadas (p. ej. alerta 6.00 y evacuación 6.50),
// manteniendo el orden; la flecha sigue apuntando a la altura exacta.
function spreadLabels(positions: number[]) {
  const result = [...positions];

  for (let i = 1; i < result.length; i += 1) {
    result[i] = Math.max(result[i], result[i - 1] + LABEL_MIN_GAP);
  }

  const overflow = result[result.length - 1] - (BOTTOM - 8);
  if (overflow > 0) {
    for (let i = result.length - 1; i >= 0; i -= 1) {
      result[i] -= overflow;
      if (i > 0) {
        result[i - 1] = Math.min(result[i - 1], result[i] - LABEL_MIN_GAP);
      }
    }
  }

  return result;
}

export default function RiverGauge({ actual, alerta, evacuacion }: Props) {
  const markers: Marker[] = [
    evacuacion !== null && { key: "evacuacion", label: "Evacuación", value: evacuacion, fill: "#d03b3b", stroke: "#a12828" },
    alerta !== null && { key: "alerta", label: "Alerta", value: alerta, fill: "#fab219", stroke: "#b7791f" },
    actual !== null && { key: "actual", label: "Altura actual", value: actual, fill: "#2563eb", stroke: "#1d4ed8", strong: true },
  ].filter((marker): marker is Marker => Boolean(marker));

  // La escala arranca en 0 y llega al metro entero siguiente al valor más alto.
  const top = Math.max(1, Math.ceil(Math.max(...markers.map((marker) => marker.value), 0) + 0.5));
  const toY = (meters: number) => BOTTOM - (Math.min(Math.max(meters, 0), top) / top) * (BOTTOM - TOP);
  const tickStep = top > 10 ? 2 : 1;
  const ticks = Array.from({ length: Math.floor(top / tickStep) + 1 }, (_, i) => i * tickStep);

  const sorted = [...markers].sort((a, b) => b.value - a.value);
  const labelYs = spreadLabels(sorted.map((marker) => toY(marker.value)));

  // Si dos flechas quedarían encimadas, la siguiente se corre a la derecha (unida a la regla
  // por una línea fina) para que ninguna tape a otra.
  const arrowXs: number[] = [];
  sorted.forEach((marker, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const collides = previous && Math.abs(toY(previous.value) - toY(marker.value)) < ARROW_MIN_GAP;
    arrowXs.push(collides ? arrowXs[index - 1] + ARROW_STAGGER : ARROW_X);
  });

  const summary = markers.map((marker) => `${marker.label}: ${formatMeters(marker.value)}`).join(", ");

  return (
    <svg
      className={styles.riverGauge}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={summary ? `Escala del río. ${summary}` : "Escala del río sin datos"}
    >
      {/* Regla: fondo, marcas de metros y agua */}
      <rect x={STAFF_X} y={TOP} width={STAFF_WIDTH} height={BOTTOM - TOP} rx="4" fill="#eff6ff" stroke="#cbd5e1" />
      {actual !== null ? (
        <rect
          x={STAFF_X}
          y={toY(actual)}
          width={STAFF_WIDTH}
          height={BOTTOM - toY(actual)}
          rx="4"
          fill="#93c5fd"
          className={styles.riverWater}
        />
      ) : null}

      {ticks.map((meters) => (
        <g key={meters}>
          <line x1={STAFF_X - 6} x2={STAFF_X} y1={toY(meters)} y2={toY(meters)} stroke="#94a3b8" />
          <text x={STAFF_X - 10} y={toY(meters)} textAnchor="end" dominantBaseline="middle" className={styles.riverTick}>
            {meters} m
          </text>
        </g>
      ))}

      {/* Flechas y etiquetas */}
      {sorted.map((marker, index) => {
        const y = toY(marker.value);
        const labelY = labelYs[index];
        const arrowX = arrowXs[index];

        return (
          <g key={marker.key}>
            <title>{`${marker.label}: ${formatMeters(marker.value)}`}</title>
            {marker.key !== "actual" ? (
              <line
                x1={STAFF_X}
                x2={STAFF_X + STAFF_WIDTH}
                y1={y}
                y2={y}
                stroke={marker.stroke}
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            ) : null}
            {arrowX > ARROW_X ? (
              <line x1={STAFF_X + STAFF_WIDTH} x2={arrowX} y1={y} y2={y} stroke={marker.stroke} strokeWidth="1.5" />
            ) : null}
            <path
              d={`M ${arrowX} ${y} L ${arrowX + ARROW_LENGTH} ${y - 8} L ${arrowX + ARROW_LENGTH} ${y + 8} Z`}
              fill={marker.fill}
              stroke={marker.stroke}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <polyline
              points={`${arrowX + ARROW_LENGTH},${y} ${arrowX + ARROW_LENGTH + 6},${y} ${LABEL_X - 4},${labelY}`}
              fill="none"
              stroke={marker.stroke}
              strokeWidth="1.5"
            />
            <text x={LABEL_X} y={labelY - 7} dominantBaseline="middle" className={styles.riverMarkerLabel}>
              {marker.label}
            </text>
            <text
              x={LABEL_X}
              y={labelY + 8}
              dominantBaseline="middle"
              className={marker.strong ? styles.riverMarkerValueStrong : styles.riverMarkerValue}
            >
              {formatMeters(marker.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
