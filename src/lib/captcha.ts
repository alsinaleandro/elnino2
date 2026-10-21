// Captcha propio, sin servicios externos: una suma dibujada como imagen SVG con números torcidos y
// líneas de ruido. No frena a un bot hecho a medida, pero sí a los que llenan formularios al azar.
// Cada captcha sirve para un solo intento y vence a los 10 minutos.
import { randomInt, randomUUID } from "node:crypto";
import { db } from "./db";

const TTL_MS = 10 * 60 * 1000;
// Una persona tarda más que esto en completar el formulario; un bot suele mandarlo al instante.
const MIN_SOLVE_MS = 3000;

const WIDTH = 160;
const HEIGHT = 56;
const COLORS = ["#1d4ed8", "#b91c1c", "#047857", "#7c2d12", "#6d28d9", "#111827"];

function drawSvg(text: string) {
  const step = WIDTH / (text.length + 1);
  const glyphs = [...text]
    .map((char, index) => {
      const x = step * (index + 1) + randomInt(-4, 5);
      const y = HEIGHT / 2 + 10 + randomInt(-6, 7);
      const rotate = randomInt(-25, 26);
      const color = COLORS[randomInt(COLORS.length)];
      return `<text x="${x}" y="${y}" fill="${color}" font-size="${randomInt(26, 33)}" font-weight="700" font-family="monospace" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
    })
    .join("");
  const noise = Array.from({ length: 6 }, () => {
    const color = COLORS[randomInt(COLORS.length)];
    return `<line x1="${randomInt(WIDTH)}" y1="${randomInt(HEIGHT)}" x2="${randomInt(WIDTH)}" y2="${randomInt(HEIGHT)}" stroke="${color}" stroke-width="${randomInt(1, 3)}" opacity="0.55"/>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="100%" height="100%" fill="#f3f4f6"/>${noise}${glyphs}</svg>`;
}

export function createCaptcha() {
  const now = Date.now();
  db.prepare("DELETE FROM captchas WHERE expires_at < ?").run(now);

  const a = randomInt(10, 50);
  const b = randomInt(1, 10);
  const id = randomUUID();
  db.prepare("INSERT INTO captchas (id, answer, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    a + b,
    now,
    now + TTL_MS,
  );

  return { id, svg: drawSvg(`${a}+${b}=`) };
}

// Comprueba la respuesta y borra el captcha: no se puede reintentar con el mismo.
export function verifyCaptcha(id: unknown, answer: unknown) {
  if (typeof id !== "string" || id.length > 64) return false;

  const row = db.prepare("DELETE FROM captchas WHERE id = ? RETURNING answer, created_at, expires_at").get(id) as
    | { answer: number; created_at: number; expires_at: number }
    | undefined;
  if (!row) return false;

  const now = Date.now();
  if (now > row.expires_at || now - row.created_at < MIN_SOLVE_MS) return false;

  return Number(String(answer ?? "").trim()) === row.answer;
}
