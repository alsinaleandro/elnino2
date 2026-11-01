import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";
import { listHelpByBarrio, VISIBLE_DAYS, type HelpKind } from "@/lib/help";
import { timeAgo } from "../../format";
import AdminNav from "../AdminNav";
import styles from "../admin.module.css";

// Ayuda mutua de todos los barrios: cuántos piden y cuántos ofrecen en cada uno, y las publicaciones
// vigentes. Se ve lo mismo que ve cualquier vecino de cada barrio (nombre e inicial del apellido, y
// el WhatsApp solo de quien lo permitió). ?ver=ofrezco|todo cambia la lista; por defecto, necesidades.
export const metadata: Metadata = { title: "Ayuda mutua · Administración" };

const FILTERS: Array<{ key: HelpKind | "todo"; label: string }> = [
  { key: "necesito", label: "Necesitan" },
  { key: "ofrezco", label: "Ofrecen" },
  { key: "todo", label: "Todo" },
];

export default async function AdminHelpPage({ searchParams }: PageProps<"/ptpadmin/ayuda">) {
  await requireAdmin();

  const { ver } = await searchParams;
  const filter: HelpKind | "todo" = ver === "ofrezco" || ver === "todo" ? ver : "necesito";
  const barrios = listHelpByBarrio(filter === "todo" ? undefined : filter);
  const totals = barrios.reduce(
    (sum, barrio) => ({ necesito: sum.necesito + barrio.necesito, ofrezco: sum.ofrezco + barrio.ofrezco }),
    { necesito: 0, ofrezco: 0 },
  );
  const withPosts = barrios.filter((barrio) => barrio.posts.length > 0);

  return (
    <main className={styles.page}>
      <AdminNav active="ayuda" />
      <header className={styles.header}>
        <h1>Ayuda mutua</h1>
        <p>
          Publicaciones &quot;Necesito / Ofrezco&quot; vigentes de todos los barrios (cada una se ve {VISIBLE_DAYS} días,
          o hasta que su autor la marca como resuelta). Se muestra lo mismo que ven los vecinos de cada barrio.
        </p>
      </header>

      <div className={styles.stats}>
        <div>
          <span>Necesidades</span>
          <strong>{totals.necesito}</strong>
        </div>
        <div>
          <span>Ofrecimientos</span>
          <strong>{totals.ofrezco}</strong>
        </div>
        <div>
          <span>Barrios</span>
          <strong>{barrios.length}</strong>
        </div>
      </div>

      {barrios.length === 0 ? (
        <p className={styles.empty}>Todavía no hay publicaciones vigentes en ningún barrio.</p>
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Barrio</th>
                <th>Necesitan</th>
                <th>Ofrecen</th>
              </tr>
            </thead>
            <tbody>
              {barrios.map((barrio) => (
                <tr key={barrio.barrioId}>
                  <td>
                    <a href={`#barrio-${barrio.barrioId}`}>{barrio.barrio}</a>
                    {barrio.localidad ? <small> · {barrio.localidad}</small> : null}
                  </td>
                  <td>{barrio.necesito}</td>
                  <td>{barrio.ofrezco}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <nav className={styles.filters} aria-label="Qué publicaciones mostrar">
            {FILTERS.map((item) => (
              <Link
                key={item.key}
                href={item.key === "necesito" ? "/ptpadmin/ayuda" : `/ptpadmin/ayuda?ver=${item.key}`}
                className={`${styles.filter} ${filter === item.key ? styles.filterActive : ""}`}
                aria-current={filter === item.key ? "page" : undefined}
              >
                {item.label}
                <span>
                  {item.key === "necesito"
                    ? totals.necesito
                    : item.key === "ofrezco"
                      ? totals.ofrezco
                      : totals.necesito + totals.ofrezco}
                </span>
              </Link>
            ))}
          </nav>

          {withPosts.length === 0 ? (
            <p className={styles.empty}>
              {filter === "ofrezco" ? "Nadie está ofreciendo nada en este momento." : "Nadie está pidiendo ayuda en este momento."}
            </p>
          ) : null}

          {withPosts.map((barrio) => (
            <section key={barrio.barrioId} id={`barrio-${barrio.barrioId}`} className={styles.barrioSection}>
              <h2 className={styles.listTitle}>
                {barrio.barrio}
                {barrio.localidad ? <small> · {barrio.localidad}</small> : null}
              </h2>
              <ul className={styles.list}>
                {barrio.posts.map((post) => (
                  <li key={post.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <span className={post.kind === "necesito" ? styles.badgeNecesito : styles.badgeOfrezco}>
                        {post.kind === "necesito" ? "Necesito" : "Ofrezco"}
                      </span>
                      <span className={styles.date}>
                        {post.author}
                        {post.authorIsDelegate ? " (delegado/a)" : ""} · {timeAgo(post.createdAt)}
                      </span>
                    </div>
                    <p className={styles.message}>{post.message}</p>
                    {post.contact ? (
                      <p className={styles.contact}>
                        Permite contacto directo:{" "}
                        {post.contact.whatsappLink ? (
                          <a href={post.contact.whatsappLink} target="_blank" rel="noopener noreferrer">
                            WhatsApp {post.contact.whatsapp}
                          </a>
                        ) : (
                          `WhatsApp ${post.contact.whatsapp}`
                        )}
                      </p>
                    ) : post.kind === "necesito" ? (
                      <p className={styles.contact}>Sin contacto directo: por el chat del barrio o un delegado.</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
