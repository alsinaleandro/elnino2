import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { countMessages, isAdminToken, listAdminMessages, type Filter } from "@/lib/admin";
import { moderateMessage } from "./actions";
import ConfirmButton from "./ConfirmButton";
import styles from "./admin.module.css";

// Administración de los mensajes públicos de la pestaña Contactanos. Solo se entra con la URL que
// lleva el token (ver src/lib/admin.ts); con cualquier otra responde 404.
export const metadata: Metadata = {
  title: "Administración de mensajes",
  robots: { index: false, follow: false },
  // Que los enlaces externos (mapa, WhatsApp) no reciban la URL con el token.
  referrer: "no-referrer",
};

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "visibles", label: "Publicados" },
  { key: "ocultos", label: "Ocultos" },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// wa.me pide el número internacional: 54 + 9 + característica + número, sin 0 ni 15.
function whatsappLink(number: string) {
  const digits = number.replace(/\D/g, "");
  if (digits.startsWith("549")) return `https://wa.me/${digits}`;
  if (digits.startsWith("54")) return `https://wa.me/549${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `https://wa.me/549${digits.slice(1)}`;
  if (digits.length === 10) return `https://wa.me/549${digits}`;
  return null;
}

export default async function AdminPage({ params, searchParams }: PageProps<"/admin/[token]">) {
  await connection();
  const { token } = await params;
  if (!isAdminToken(token)) notFound();

  const { filtro } = await searchParams;
  const filter: Filter = FILTERS.some((item) => item.key === filtro) ? (filtro as Filter) : "todos";
  const counts = countMessages();
  const messages = listAdminMessages(filter);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Mensajes públicos</h1>
        <p>
          Ocultar saca el mensaje de la app pero lo conserva; eliminar lo borra para siempre. Esta página no se comparte:
          quien tenga la URL puede moderar.
        </p>
      </header>

      <nav className={styles.filters} aria-label="Filtrar mensajes">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/${token}?filtro=${item.key}`}
            className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`}
            aria-current={filter === item.key ? "page" : undefined}
          >
            {item.label} <span>{counts[item.key]}</span>
          </Link>
        ))}
      </nav>

      {messages.length === 0 ? <p className={styles.empty}>No hay mensajes en esta lista.</p> : null}

      <ul className={styles.list}>
        {messages.map((item) => {
          const wa = whatsappLink(item.whatsapp);
          const edited = item.message !== item.originalMessage;
          return (
            <li key={item.id} className={`${styles.card} ${item.hidden ? styles.cardHidden : ""}`}>
              <div className={styles.cardTop}>
                <span className={styles.badge}>{item.topic === "zona" ? "Problema en la zona" : "Sugerencia"}</span>
                {item.hidden ? <span className={`${styles.badge} ${styles.badgeHidden}`}>Oculto</span> : null}
                <span className={styles.date}>
                  #{item.id} · {formatDate(item.createdAt)}
                </span>
              </div>

              <p className={styles.message}>{item.message}</p>
              {edited ? (
                <details className={styles.original}>
                  <summary>El filtro tapó palabras: ver texto original</summary>
                  <p>{item.originalMessage}</p>
                </details>
              ) : null}

              <dl className={styles.data}>
                <dt>Nombre</dt>
                <dd>
                  {item.firstName} {item.lastName}
                </dd>
                <dt>WhatsApp</dt>
                <dd>
                  {wa ? (
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      {item.whatsapp}
                    </a>
                  ) : (
                    item.whatsapp
                  )}
                </dd>
                <dt>E-mail</dt>
                <dd>
                  <a href={`mailto:${item.email}`}>{item.email}</a>
                </dd>
                <dt>Ubicación</dt>
                <dd>
                  {item.latitude !== null && item.longitude !== null ? (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=17/${item.latitude}/${item.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                      {item.accuracy !== null ? ` (±${Math.round(item.accuracy)} m)` : ""}
                    </a>
                  ) : (
                    "No compartida"
                  )}
                </dd>
                <dt>IP</dt>
                <dd>{item.ip ?? "—"}</dd>
                <dt>Navegador</dt>
                <dd className={styles.userAgent}>{item.userAgent ?? "—"}</dd>
              </dl>

              <form action={moderateMessage} className={styles.actions}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="id" value={item.id} />
                {item.hidden ? (
                  <button type="submit" name="op" value="mostrar" className={styles.button}>
                    Volver a publicar
                  </button>
                ) : (
                  <button type="submit" name="op" value="ocultar" className={styles.button}>
                    Ocultar
                  </button>
                )}
                <ConfirmButton
                  name="op"
                  value="eliminar"
                  className={`${styles.button} ${styles.buttonDanger}`}
                  message={`¿Eliminar para siempre el mensaje #${item.id} de ${item.firstName} ${item.lastName}?`}
                >
                  Eliminar
                </ConfirmButton>
              </form>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
