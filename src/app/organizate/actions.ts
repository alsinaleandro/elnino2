"use server";

import { redirect } from "next/navigation";
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
