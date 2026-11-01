// Envío de los mensajes privados por e-mail. La cuenta SMTP se configura con variables de entorno
// (en el VPS, en el archivo .env.local de la app):
//   SMTP_HOST, SMTP_PORT (587 por defecto; 465 usa SSL), SMTP_USER, SMTP_PASS
//   SMTP_FROM     remitente (por defecto SMTP_USER)
//   CONTACT_EMAIL destino (por defecto elnino@ptpchaco.org.ar)
import nodemailer, { type Transporter } from "nodemailer";
import { mapLink, whatsappLink } from "./links";

const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "elnino@ptpchaco.org.ar";

export const isMailerConfigured = () => Boolean(process.env.SMTP_HOST);

let transport: Transporter | null = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

type PrivateMessage = {
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  message: string;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
};

function describeLocation(location: PrivateMessage["location"]) {
  if (!location) return "No compartida";
  const { latitude, longitude, accuracy } = location;
  const precision = accuracy !== null ? ` (precisión ±${Math.round(accuracy)} m)` : "";
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${precision}\nMapa: ${mapLink(latitude, longitude)}`;
}

// Devuelve true si el e-mail salió. Si el SMTP no está configurado o falla, devuelve false (el
// mensaje igual queda guardado en la base).
export async function sendPrivateMessage({ firstName, lastName, whatsapp, email, message, location }: PrivateMessage) {
  const mailer = getTransport();
  if (!mailer) {
    console.warn("[contacto] SMTP sin configurar: el mensaje privado quedó solo en la base de datos.");
    return false;
  }

  const name = `${firstName} ${lastName}`;
  const wa = whatsappLink(whatsapp);
  const text = [
    `Nombre: ${name}`,
    `E-mail: ${email}`,
    `WhatsApp: ${whatsapp}${wa ? ` (escribirle: ${wa})` : ""}`,
    `Ubicación: ${describeLocation(location)}`,
    "",
    message,
    "",
    "— Enviado desde la pestaña Contactanos de la app.",
  ].join("\n");

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to: CONTACT_EMAIL,
      replyTo: { name, address: email },
      subject: `Mensaje privado desde la app: ${name}`,
      text,
    });
    return true;
  } catch (error) {
    console.error("[contacto] No se pudo enviar el e-mail:", error);
    return false;
  }
}

// Link para crear la cuenta con e-mail o para elegir una contraseña nueva (emailAuth.ts). Devuelve
// true si el e-mail salió.
export async function sendPasswordLink(to: string, link: string, purpose: "alta" | "clave", hours: number) {
  const mailer = getTransport();
  if (!mailer) {
    console.warn("[organizate] SMTP sin configurar: no se pudo mandar el link de ingreso.");
    return false;
  }

  const intro =
    purpose === "alta"
      ? "Para terminar de crear tu cuenta en ¡Organizate! (comités de emergencia de barrio), abrí este link y elegí tu contraseña:"
      : "Pediste elegir una contraseña nueva para entrar a ¡Organizate! (comités de emergencia de barrio). Abrí este link:";
  const text = [
    intro,
    "",
    link,
    "",
    `El link vence en ${hours} ${hours === 1 ? "hora" : "horas"} y sirve una sola vez.`,
    "Si no fuiste vos, ignorá este e-mail: no se crea ni se cambia nada.",
    "",
    "— PTP Chaco",
  ].join("\n");

  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: purpose === "alta" ? "Terminá de crear tu cuenta en ¡Organizate!" : "Elegí tu contraseña nueva de ¡Organizate!",
      text,
    });
    return true;
  } catch (error) {
    console.error("[organizate] No se pudo enviar el link de ingreso:", error);
    return false;
  }
}
