"use server";

import { revalidatePath } from "next/cache";
import { deleteMessage, isAdminToken, setMessageHidden } from "@/lib/admin";

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
