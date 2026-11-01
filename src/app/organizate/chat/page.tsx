import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listMessages, MAX_MESSAGE_LENGTH } from "@/lib/chat";
import { getCurrentNeighbor } from "@/lib/neighbors";
import AppNav, { AppHeader } from "../../AppNav";
import styles from "../organizate.module.css";
import BarrioChat from "./BarrioChat";

export const metadata: Metadata = { title: "Chat del barrio · ¡Organizate!" };

// Solo para el vecino que ya se sumó: el resto vuelve a /organizate, que lo lleva al paso que le falte.
export default async function ChatPage() {
  const neighbor = await getCurrentNeighbor();
  if (!neighbor?.whatsapp || !neighbor.barrio) redirect("/organizate");

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        <AppHeader title="Chat del barrio" place={neighbor.barrio.name} back="/organizate" />
        <BarrioChat initial={listMessages(neighbor.barrio.id, neighbor.id)} maxLength={MAX_MESSAGE_LENGTH} />
      </main>
    </div>
  );
}
