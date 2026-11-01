import type { ReactNode } from "react";
import type { NewsPost } from "@/lib/news";
import { formatEvent, timeAgo, todayInArgentina } from "./format";
import styles from "./newsCard.module.css";

// Una novedad: quién la publica (PTP Chaco o un delegado), título, texto y, si anuncia una reunión,
// cuándo y dónde. `actions` = botones para borrarla (del autor o del PTP). `showBarrio`: en el panel
// del PTP se muestra a qué barrio va.
export default function NewsCard({
  post,
  actions,
  showBarrio = false,
}: {
  post: NewsPost;
  actions?: ReactNode;
  showBarrio?: boolean;
}) {
  const past = post.eventAt !== null && post.eventAt.slice(0, 10) < todayInArgentina();

  return (
    <article className={styles.card}>
      <div className={styles.top}>
        <span className={post.fromPtp ? styles.tagPtp : styles.tagDelegate}>
          {post.fromPtp ? "PTP Chaco" : `Delegado/a · ${post.author}`}
        </span>
        <span className={styles.when}>
          {showBarrio ? `${post.barrio ?? "Todos los barrios"} · ` : ""}
          {timeAgo(post.createdAt)}
        </span>
      </div>
      <h3 className={styles.title}>{post.title}</h3>
      <p className={styles.text}>{post.message}</p>
      {post.eventAt || post.place ? (
        <div className={`${styles.event} ${past ? styles.eventPast : ""}`}>
          {post.eventAt ? (
            <span>
              📅 {formatEvent(post.eventAt)}
              {past ? " (ya pasó)" : ""}
            </span>
          ) : null}
          {post.place ? <span>📍 {post.place}</span> : null}
        </div>
      ) : null}
      {actions}
    </article>
  );
}
