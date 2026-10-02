import styles from "./page.module.css";

// Escala hidrométrica vertical: el agua llena la regla hasta la altura actual y las flechas
// marcan la altura actual, los niveles de alerta y evacuación y el terreno del usuario (un muñeco
// parado a esa altura). Todo en la escala del hidrómetro de Barranqueras.

type Props = {
  actual: number | null;
  alerta: number | null;
  evacuacion: number | null;
  // Rango de la cota del terreno del usuario, ya convertido a la escala del hidrómetro.
  // min null = "menos de max"; max null = "más de min".
  user?: { min: number | null; max: number | null } | null;
};

type Marker = {
  key: string;
  label: string;
  value: number;
  valueText?: string;
  fill: string;
  stroke: string;
  strong?: boolean;
};

const USER_COLOR = "#6b4423";
const USER_STROKE = "#4a2f18";

const WIDTH = 300;
const HEIGHT = 300;
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

const formatNumber = (value: number) =>
  value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMeters = (value: number) => `${formatNumber(value)} m`;

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

function userMarker(user: Props["user"]): Marker | null {
  if (!user || (user.min === null && user.max === null)) return null;
  const valueText =
    user.min === null
      ? `menos de ${formatMeters(user.max!)}`
      : user.max === null
        ? `más de ${formatMeters(user.min)}`
        : `${formatNumber(user.min)} a ${formatMeters(user.max)}`;
  // El muñeco se para en el límite inferior del rango (lo más prudente); si solo se conoce el
  // techo ("menos de"), en el techo.
  return { key: "user", label: "Tu terreno", value: user.min ?? user.max!, valueText, fill: USER_COLOR, stroke: USER_STROKE };
}

// Muñeco de palo con los pies en (x, y). Se dibuja dos veces: un trazo blanco ancho de fondo
// para que se lea sobre el agua y la franja marrón, y el trazo oscuro encima.
function StickFigure({ x, y }: { x: number; y: number }) {
  const body = `M ${x} ${y - 17} V ${y - 8} M ${x - 6} ${y - 14} H ${x + 6} M ${x} ${y - 8} L ${x - 5} ${y} M ${x} ${y - 8} L ${x + 5} ${y}`;
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d={body} stroke="#ffffff" strokeWidth="5" />
      <circle cx={x} cy={y - 21} r="4" stroke="#ffffff" strokeWidth="5" />
      <path d={body} stroke="#111827" strokeWidth="2" />
      <circle cx={x} cy={y - 21} r="4" stroke="#111827" strokeWidth="2" fill="#ffffff" />
    </g>
  );
}

export default function RiverGauge({ actual, alerta, evacuacion, user }: Props) {
  const ground = userMarker(user);
  const markers: Marker[] = [
    ground,
    evacuacion !== null && { key: "evacuacion", label: "Evacuación", value: evacuacion, fill: "#d03b3b", stroke: "#a12828" },
    alerta !== null && { key: "alerta", label: "Alerta", value: alerta, fill: "#fab219", stroke: "#b7791f" },
    actual !== null && { key: "actual", label: "Altura actual", value: actual, fill: "#2563eb", stroke: "#1d4ed8", strong: true },
  ].filter((marker): marker is Marker => Boolean(marker));

  // La escala arranca en 0 y llega al metro entero siguiente al valor más alto.
  const highest = Math.max(...markers.map((marker) => marker.value), user?.max ?? 0, 0);
  const top = Math.max(1, Math.ceil(highest + 0.5));
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

  const summary = markers
    .map((marker) => `${marker.label}: ${marker.valueText ?? formatMeters(marker.value)}`)
    .join(", ");

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

      {/* Terreno del usuario: franja con el rango de la cota, línea de suelo y muñeco */}
      {ground && user ? (
        <g>
          {user.min !== null && user.max !== null ? (
            <rect
              x={STAFF_X}
              y={toY(user.max)}
              width={STAFF_WIDTH}
              height={toY(user.min) - toY(user.max)}
              fill={USER_COLOR}
              opacity="0.25"
            />
          ) : null}
          <line
            x1={STAFF_X - 2}
            x2={STAFF_X + STAFF_WIDTH + 2}
            y1={toY(ground.value)}
            y2={toY(ground.value)}
            stroke={USER_COLOR}
            strokeWidth="3"
          />
          <StickFigure x={STAFF_X + STAFF_WIDTH / 2} y={toY(ground.value) - 1.5} />
        </g>
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
            <title>{`${marker.label}: ${marker.valueText ?? formatMeters(marker.value)}`}</title>
            {marker.key !== "actual" && marker.key !== "user" ? (
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
              {marker.valueText ?? formatMeters(marker.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
