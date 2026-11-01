import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listHelpPosts, MAX_LENGTH, VISIBLE_DAYS, type HelpKind } from "@/lib/help";
import { getCurrentNeighbor } from "@/lib/neighbors";
import AppNav, { AppHeader } from "../../AppNav";
import ConfirmButton from "../../ConfirmButton";
import { deleteHelp, resolveHelp } from "../actions";
import { timeAgo } from "../../format";
import styles from "../organizate.module.css";
import HelpForm from "./HelpForm";

export const metadata: Metadata = { title: "Ayuda mutua · ¡Organizate!" };

// Ayuda mutua (Idea 6): tablero "Ofrezco / Necesito" del barrio. ?ver=necesito|ofrezco filtra y
// ?publicar=1 muestra el formulario para publicar.

const FILTERS: Array<{ key: HelpKind | null; label: string }> = [
  { key: null, label: "Todo" },
  { key: "necesito", label: "Necesitan" },
  { key: "ofrezco", label: "Ofrecen" },
];

export default async function AyudaPage({ searchParams }: PageProps<"/organizate/ayuda">) {
  const { ver, publicar } = await searchParams;
  const neighbor = await getCurrentNeighbor();
  if (!neighbor?.whatsapp || !neighbor.barrio) redirect("/organizate");

  const filter: HelpKind | undefined = ver === "necesito" || ver === "ofrezco" ? ver : undefined;
  const posts = listHelpPosts(neighbor.barrio.id, neighbor.id, filter);

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        <AppHeader title="Ayuda mutua" place={neighbor.barrio.name} back="/organizate" />

        {publicar === "1" ? (
          <HelpForm whatsapp={neighbor.whatsapp} maxLength={MAX_LENGTH} />
        ) : (
          <>
            <p className={styles.muted}>
              Ofrecé lo que puedas o pedí lo que necesites a los vecinos de tu barrio. Cada publicación se ve{" "}
              {VISIBLE_DAYS} días, o hasta que la marques como resuelta.
            </p>
            <Link href="/organizate/ayuda?publicar=1" className={styles.btnPrimary}>
              ＋ Publicar
            </Link>

            <nav className={styles.filters} aria-label="Filtrar publicaciones">
              {FILTERS.map(({ key, label }) => (
                <Link
                  key={label}
                  href={key ? `/organizate/ayuda?ver=${key}` : "/organizate/ayuda"}
                  className={`${styles.filter} ${filter === (key ?? undefined) ? styles.filterActive : ""}`}
                  aria-current={filter === (key ?? undefined) ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
            </nav>

            {posts.length === 0 ? (
              <p className={styles.muted}>
                {filter === "necesito"
                  ? "Nadie está pidiendo ayuda en este momento."
                  : filter === "ofrezco"
                    ? "Todavía nadie ofreció nada."
                    : "Todavía no hay publicaciones en tu barrio. ¡Podés hacer la primera!"}
              </p>
            ) : (
              posts.map((post) => (
                <article key={post.id} className={styles.delegateCard}>
                  <div className={styles.row} style={{ justifyContent: "space-between" }}>
                    <span className={post.kind === "ofrezco" ? styles.tagOfrezco : styles.tagNecesito}>
                      {post.kind === "ofrezco" ? "Ofrezco" : "Necesito"}
                    </span>
                    <span className={styles.muted}>
                      {post.mine ? "Vos" : post.author}
                      {post.authorIsDelegate ? " (delegado/a)" : ""} · {timeAgo(post.createdAt)}
                    </span>
                  </div>
                  <p className={styles.postText}>{post.message}</p>

                  {post.contact ? (
                    <div className={styles.row}>
                      {post.contact.phoneLink ? (
                        <a href={post.contact.phoneLink} className={`${styles.btnSecondary} ${styles.btnSmall}`}>
                          📞 Llamar
                        </a>
                      ) : null}
                      {post.contact.whatsappLink ? (
                        <a
                          href={post.contact.whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${styles.btnWhatsapp} ${styles.btnSmall}`}
                        >
                          💬 WhatsApp {post.contact.whatsapp}
                        </a>
                      ) : (
                        <span className={styles.muted}>WhatsApp {post.contact.whatsapp}</span>
                      )}
                    </div>
                  ) : !post.mine ? (
                    <p className={styles.muted}>
                      Contactalo por el <Link href="/organizate/chat">chat del barrio</Link> o a través de un{" "}
                      <Link href="/organizate/delegados">delegado</Link>.
                    </p>
                  ) : null}

                  {post.mine ? (
                    <div className={styles.row}>
                      <form action={resolveHelp}>
                        <input type="hidden" name="publicacion" value={post.id} />
                        <button type="submit" className={`${styles.btnSecondary} ${styles.btnSmall}`}>
                          ✓ Ya está resuelto
                        </button>
                      </form>
                      <form action={deleteHelp}>
                        <input type="hidden" name="publicacion" value={post.id} />
                        <ConfirmButton className={styles.btnDanger} message="¿Borrar esta publicación?">
                          Borrar
                        </ConfirmButton>
                      </form>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}
