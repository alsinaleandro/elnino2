"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMessage, setMessageHidden } from "@/lib/admin";
import { login, logout, requireAdmin } from "@/lib/adminAuth";
import { ValidationError } from "@/lib/contact";
import { deleteFloodReport } from "@/lib/floods";
import { addPtpNews, deleteNews } from "@/lib/news";

// Las Server Actions se pueden llamar con un POST directo, sin pasar por la página: por eso cada
// una vuelve a comprobar la sesión del panel.

// ---------- Ingreso ----------

export type LoginState = { error: string | null };

const LOGIN_ERRORS = {
  wrong: "La contraseña no es correcta.",
  blocked: "Demasiados intentos fallidos. Probá de nuevo en 15 minutos.",
  disabled: "El panel no está configurado en este servidor (falta ADMIN_PASSWORD).",
};

export async function adminLogin(_state: LoginState, formData: FormData): Promise<LoginState> {
  const result = await login(formData.get("password"));
  if (result !== "ok") return { error: LOGIN_ERRORS[result] };
  redirect("/ptpadmin/mensajes");
}

export async function adminLogout() {
  await logout();
  redirect("/ptpadmin");
}

// ---------- Mensajes públicos ----------

export async function moderateMessage(formData: FormData) {
  await requireAdmin();

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

  revalidatePath("/ptpadmin/mensajes");
}

// ---------- Novedades del PTP Chaco ----------

// "barrio" = id del barrio, o "todos" para que la vean todos los barrios.
export async function publishPtpNews(formData: FormData) {
  await requireAdmin();

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
  redirect(`/ptpadmin/novedades${error ? `?error=${encodeURIComponent(error)}` : "?publicada=1"}`);
}

// Borra cualquier novedad, del PTP o de un delegado.
// ---------- Inundaciones reportadas por vecinos ----------

export async function deleteFloodAdmin(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) deleteFloodReport(id);
  revalidatePath("/ptpadmin/inundaciones");
}

export async function deleteNewsAdmin(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) deleteNews(id);
  revalidatePath("/ptpadmin/novedades");
}
