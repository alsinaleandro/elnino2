"use server";

import { redirect } from "next/navigation";
import { detectBarrio, findOrCreateBarrio, getBarrio, setNeighborBarrio, type Detection } from "@/lib/barrios";
import { becomeDelegate, followDelegate, resignDelegate, unfollowDelegate } from "@/lib/delegates";
import { loginWithPassword, redeemPasswordLink, requestPasswordLink } from "@/lib/emailAuth";
import { addHelpPost, deleteHelpPost, resolveHelpPost } from "@/lib/help";
import { addDelegateNews, deleteOwnNews } from "@/lib/news";
import {
  deleteNeighbor,
  endSession,
  getCurrentNeighbor,
  parseProfile,
  startSession,
  updateProfile,
  ValidationError,
} from "@/lib/neighbors";

// Las Server Actions se pueden llamar con un POST directo: cada una vuelve a buscar al vecino de la
// sesión y solo toca sus propios datos.

export type ProfileState = { error: string | null };

export async function saveProfile(_state: ProfileState, formData: FormData): Promise<ProfileState> {
  const neighbor = await getCurrentNeighbor();
  if (!neighbor) redirect("/organizate");

  try {
    updateProfile(neighbor.id, parseProfile(formData));
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  redirect("/organizate");
}

const toPoint = (lat: unknown, lon: unknown) => {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (lat === "" || lon === "" || lat === null || lon === null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: latitude, lon: longitude };
};

// Solo para vecinos con sesión: así nadie usa la app para consultar OpenStreetMap de arriba.
export async function detectMyBarrio(lat: number, lon: number): Promise<Detection | null> {
  const neighbor = await getCurrentNeighbor();
  const point = toPoint(lat, lon);
  if (!neighbor || !point) return null;
  return detectBarrio(point.lat, point.lon);
}

export type BarrioState = { error: string | null };

// "choice" es el id de un barrio de la lista, o "nuevo" con el nombre y la localidad escritos.
export async function saveBarrio(_state: BarrioState, formData: FormData): Promise<BarrioState> {
  const neighbor = await getCurrentNeighbor();
  if (!neighbor) redirect("/organizate");

  const point = toPoint(formData.get("lat"), formData.get("lon"));
  const choice = formData.get("choice");
  try {
    const barrio =
      choice === "nuevo"
        ? findOrCreateBarrio(formData.get("name"), formData.get("localidad"), point)
        : getBarrio(Number(choice));
    if (!barrio) return { error: "Elegí tu barrio de la lista o escribilo." };
    setNeighborBarrio(neighbor.id, barrio, point);
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  // Con el barrio elegido por primera vez el vecino terminó de sumarse: va a su Inicio.
  redirect(neighbor.barrio ? "/organizate" : "/?bienvenida=1");
}

// ---------- Delegados (Idea 3) ----------

// Solo para el vecino que ya se sumó (datos completos y barrio elegido).
async function currentMember() {
  const neighbor = await getCurrentNeighbor();
  if (!neighbor?.whatsapp || !neighbor.barrio) redirect("/organizate");
  return { id: neighbor.id, barrioId: neighbor.barrio.id };
}

export async function applyAsDelegate() {
  const neighbor = await currentMember();
  becomeDelegate(neighbor.id);
  redirect("/organizate/delegados");
}

export async function resignAsDelegate() {
  const neighbor = await currentMember();
  resignDelegate(neighbor.id);
  redirect("/organizate/delegados");
}

export async function follow(formData: FormData) {
  const neighbor = await currentMember();
  let failed = false;
  try {
    followDelegate(neighbor.id, Number(formData.get("delegado")));
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    failed = true;
  }
  redirect(failed ? "/organizate/delegados?error=seguir" : "/organizate/delegados");
}

export async function unfollow() {
  const neighbor = await currentMember();
  unfollowDelegate(neighbor.id);
  redirect("/organizate/delegados");
}

// ---------- Ayuda mutua (Idea 6) ----------

export type HelpState = { error: string | null };

export async function publishHelp(_state: HelpState, formData: FormData): Promise<HelpState> {
  const neighbor = await currentMember();
  try {
    addHelpPost(neighbor.id, neighbor.barrioId, {
      kind: formData.get("tipo"),
      message: formData.get("texto"),
      allowContact: formData.get("contacto") === "1",
    });
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  redirect("/organizate/ayuda");
}

export async function resolveHelp(formData: FormData) {
  const neighbor = await currentMember();
  resolveHelpPost(neighbor.id, Number(formData.get("publicacion")));
  redirect("/organizate/ayuda");
}

export async function deleteHelp(formData: FormData) {
  const neighbor = await currentMember();
  deleteHelpPost(neighbor.id, Number(formData.get("publicacion")));
  redirect("/organizate/ayuda");
}

// ---------- Novedades (las de los delegados; las del PTP van por /ptpadmin) ----------

export type NewsState = { error: string | null };

const newsInput = (formData: FormData) => ({
  title: formData.get("titulo"),
  message: formData.get("texto"),
  eventDate: formData.get("fecha"),
  eventTime: formData.get("hora"),
  place: formData.get("lugar"),
});

export async function publishNews(_state: NewsState, formData: FormData): Promise<NewsState> {
  const neighbor = await currentMember();
  try {
    addDelegateNews(neighbor.id, newsInput(formData));
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  redirect("/organizate/novedades");
}

export async function deleteMyNews(formData: FormData) {
  const neighbor = await currentMember();
  deleteOwnNews(neighbor.id, Number(formData.get("novedad")));
  redirect("/organizate/novedades");
}

// ---------- Ingreso con e-mail y contraseña ----------

export type EmailState = { error: string | null; sent?: boolean };

async function requestLink(formData: FormData, purpose: "alta" | "clave"): Promise<EmailState> {
  try {
    await requestPasswordLink(formData.get("email"), purpose);
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  return { error: null, sent: true };
}

// "Crear cuenta": se llega después de aceptar "Cómo usamos tus datos".
export async function requestSignupLink(_state: EmailState, formData: FormData) {
  return requestLink(formData, "alta");
}

export async function requestResetLink(_state: EmailState, formData: FormData) {
  return requestLink(formData, "clave");
}

export async function emailLogin(_state: EmailState, formData: FormData): Promise<EmailState> {
  const result = await loginWithPassword(formData.get("email"), formData.get("password"));
  if (!result.ok) return { error: result.error };
  await startSession(result.neighborId);
  redirect("/organizate");
}

// Desde el link del e-mail: elige la contraseña y entra.
export async function choosePassword(_state: EmailState, formData: FormData): Promise<EmailState> {
  if (formData.get("password") !== formData.get("repeat")) return { error: "Las dos contraseñas no coinciden." };
  let neighborId: number;
  try {
    neighborId = await redeemPasswordLink(formData.get("token"), formData.get("password"));
  } catch (error) {
    if (error instanceof ValidationError) return { error: error.message };
    throw error;
  }
  await startSession(neighborId);
  redirect("/organizate");
}

export async function logout() {
  await endSession();
  redirect("/organizate");
}

export async function deleteAccount() {
  const neighbor = await getCurrentNeighbor();
  if (neighbor) deleteNeighbor(neighbor.id);
  await endSession();
  redirect("/organizate?borrado=1");
}
