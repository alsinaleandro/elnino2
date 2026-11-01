// Fechas de Mi barrio y de las novedades (se arman en el servidor, en hora de Argentina).

const TIMEZONE = "America/Argentina/Cordoba";

const EVENT_DAY = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TIMEZONE,
});
const EVENT_TIME = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIMEZONE,
});

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "hace 1 día" : `hace ${days} días`;
}

// "sábado 8 de noviembre, 18:00 hs" (o sin la hora). Argentina no tiene horario de verano: -03:00.
export function formatEvent(eventAt: string) {
  const [date, time] = eventAt.split("T");
  const day = EVENT_DAY.format(new Date(`${date}T12:00:00-03:00`));
  return time ? `${day}, ${EVENT_TIME.format(new Date(`${date}T${time}:00-03:00`))} hs` : day;
}

// Fecha de hoy en Argentina (AAAA-MM-DD), para saber si una reunión ya pasó.
export const todayInArgentina = () => new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
