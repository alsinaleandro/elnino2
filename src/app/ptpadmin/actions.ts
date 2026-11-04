"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteMessage, setMessageHidden } from "@/lib/admin";
import { login, logout, requireAdmin } from "@/lib/adminAuth";
import { startBarrioImport } from "@/lib/barrioImport";
import { createDrawnBarrio, deleteEmptyBarrio } from "@/lib/barrios";
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

// ---------- Barrios (polígonos de OpenStreetMap) ----------

// Arranca la carga en segundo plano y vuelve enseguida: la página muestra cómo va.
export async function importBarriosAdmin(formData: FormData) {
  await requireAdmin();

  let error: string | null = null;
  try {
    startBarrioImport(formData.get("localidad"));
  } catch (reason) {
    if (!(reason instanceof ValidationError)) throw reason;
    error = reason.message;
  }
  redirect(`/ptpadmin/barrios${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function deleteBarrioAdmin(formData: FormData) {
  await requireAdmin();

  const id = Number(formData.get("id"));
  let error: string | null = null;
  if (Number.isInteger(id) && id > 0) {
    try {
      deleteEmptyBarrio(id);
    } catch (reason) {
      if (!(reason instanceof ValidationError)) throw reason;
      error = reason.message;
    }
  }
  redirect(`/ptpadmin/barrios${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export type DrawnBarrioState = { error: string | null; created: string | null };

// Barrio dibujado a mano en el mapa del panel: nombre, localidad y el contorno ([lon, lat] por vértice).
export async function createBarrioAdmin(_state: DrawnBarrioState, formData: FormData): Promise<DrawnBarrioState> {
  await requireAdmin();

  try {
    const { barrio, replaced } = createDrawnBarrio(formData.get("name"), formData.get("localidad"), formData.get("ring"));
    revalidatePath("/ptpadmin/barrios");
    return {
      error: null,
      created: replaced
        ? `${barrio.name} ya existía sin polígono: ahora tiene el que dibujaste, con sus vecinos.`
        : `Listo: ${barrio.name} (${barrio.localidad}) quedó cargado.`,
    };
  } catch (reason) {
    if (!(reason instanceof ValidationError)) throw reason;
    return { error: reason.message, created: null };
  }
}
