"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMessage, isAdminToken, setMessageHidden } from "@/lib/admin";
import { ValidationError } from "@/lib/contact";
import { addPtpNews, deleteNews } from "@/lib/news";

// Las Server Actions se pueden llamar con un POST directo, sin pasar por la página: por eso cada
// pedido vuelve a comprobar el token.
export async function moderateMessage(formData: FormData) {
  const token = formData.get("token");
  if (!isAdminToken(token)) throw new Error("No autorizado.");

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  switch (formData.get("op")) {
    case "ocultar":
      setMessageHidden(id, true);
      break;
    case "mostrar":
      setMessageHidden(id, false);
      break;
    case "eliminar":
      deleteMessage(id);
      break;
    default:
      return;
  }

  revalidatePath(`/admin/${token}`);
}

// ---------- Novedades del PTP Chaco ----------

// "barrio" = id del barrio, o "todos" para que la vean todos los barrios.
export async function publishPtpNews(formData: FormData) {
  const token = formData.get("token");
  if (!isAdminToken(token)) throw new Error("No autorizado.");

  const barrio = formData.get("barrio");
  let error: string | null = null;
  try {
    addPtpNews(barrio === "todos" ? null : Number(barrio), {
      title: formData.get("titulo"),
      message: formData.get("texto"),
      eventDate: formData.get("fecha"),
      eventTime: formData.get("hora"),
      place: formData.get("lugar"),
    });
  } catch (reason) {
    if (!(reason instanceof ValidationError)) throw reason;
    error = reason.message;
  }
  redirect(`/admin/${token}/novedades${error ? `?error=${encodeURIComponent(error)}` : "?publicada=1"}`);
}

// Borra cualquier novedad, del PTP o de un delegado.
export async function deleteNewsAdmin(formData: FormData) {
  const token = formData.get("token");
  if (!isAdminToken(token)) throw new Error("No autorizado.");

  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) deleteNews(id);
  revalidatePath(`/admin/${token}/novedades`);
}
