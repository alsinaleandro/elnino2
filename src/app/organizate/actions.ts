"use server";

import { redirect } from "next/navigation";
import { detectBarrio, findOrCreateBarrio, getBarrio, setNeighborBarrio, type Detection } from "@/lib/barrios";
import {
  deleteNeighbor,
  endSession,
  getCurrentNeighbor,
  parseProfile,
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
