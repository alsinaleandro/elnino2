import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { getBarrio } from "@/lib/barrios";
import { listMessagesForAdmin } from "@/lib/chat";
import AdminNav from "../../../AdminNav";
import styles from "../../../admin.module.css";

// Chat de un barrio, de solo lectura, desde la lista y el mapa de /ptpadmin/barrios. Se ven los mismos
// nombres que en la app (nombre e inicial del apellido) y, si el filtro tapó palabras, el texto original.
export const metadata: Metadata = { title: "Chat del barrio · Administración" };

const LIMIT = 300;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function AdminBarrioChatPage({ params }: PageProps<"/ptpadmin/barrios/[id]/chat">) {
  await requireAdmin();

  const { id } = await params;
  const barrio = /^\d+$/.test(id) ? getBarrio(Number(id)) : null;
  if (!barrio) notFound();
  const messages = listMessagesForAdmin(barrio.id, LIMIT);
  const back = barrio.localidad ? `/ptpadmin/barrios?localidad=${encodeURIComponent(barrio.localidad)}` : "/ptpadmin/barrios";

  return (
    <main className={styles.page}>
      <AdminNav active="barrios" />
      <header className={styles.header}>
        <p>
          <Link href={back}>← Volver a los barrios</Link>
        </p>
        <h1>Chat de {barrio.name}</h1>
        <p>
          {barrio.localidad ?? "Sin localidad"} ·{" "}
          {messages.length === LIMIT ? `los últimos ${LIMIT} mensajes` : `${messages.length} mensajes`}, del más viejo al
          más nuevo. Solo lectura: el panel no escribe en el chat.
        </p>
      </header>

      {messages.length === 0 ? <p className={styles.empty}>Todavía nadie escribió en el chat de este barrio.</p> : null}

      <ul className={styles.list}>
        {messages.map((item) => (
          <li key={item.id} className={styles.card}>
            <div className={styles.cardTop}>
              <strong>{item.author}</strong>
              {item.delegate ? <span className={styles.badge}>Delegado</span> : null}
              <span className={styles.date}>
                #{item.id} · {formatDate(item.createdAt)}
              </span>
            </div>
            <p className={styles.message}>{item.message}</p>
            {item.message !== item.originalMessage ? (
              <details className={styles.original}>
                <summary>El filtro tapó palabras: ver texto original</summary>
                <p>{item.originalMessage}</p>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
