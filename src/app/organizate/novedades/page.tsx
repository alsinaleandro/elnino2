import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentNeighbor } from "@/lib/neighbors";
import { listNews } from "@/lib/news";
import AppNav, { AppHeader } from "../../AppNav";
import ConfirmButton from "../../ConfirmButton";
import NewsCard from "../../NewsCard";
import NewsFields from "../../NewsFields";
import { deleteMyNews } from "../actions";
import styles from "../organizate.module.css";
import NewsForm from "./NewsForm";

export const metadata: Metadata = { title: "Novedades · ¡Organizate!" };

// Novedades del barrio: las publica el PTP Chaco (desde /ptpadmin) y los delegados del barrio, por
// ejemplo para anunciar reuniones o asambleas. ?publicar=1 muestra el formulario (solo delegados).
export default async function NovedadesPage({ searchParams }: PageProps<"/organizate/novedades">) {
  const { publicar } = await searchParams;
  const neighbor = await getCurrentNeighbor();
  if (!neighbor?.whatsapp || !neighbor.barrio) redirect("/organizate");

  const isDelegate = neighbor.delegateSince !== null;
  const posts = listNews(neighbor.barrio.id, neighbor.id);

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        <AppHeader title="Novedades" place={neighbor.barrio.name} back="/organizate" />

        {publicar === "1" && isDelegate ? (
          <NewsForm barrio={neighbor.barrio.name}>
            <NewsFields />
          </NewsForm>
        ) : (
          <>
            {isDelegate ? (
              <Link href="/organizate/novedades?publicar=1" className={styles.btnPrimary}>
                ＋ Publicar una novedad
              </Link>
            ) : null}

            {posts.length === 0 ? (
              <p className={styles.muted}>Todavía no hay novedades para {neighbor.barrio.name}.</p>
            ) : (
              posts.map((post) => (
                <NewsCard
                  key={post.id}
                  post={post}
                  actions={
                    post.mine ? (
                      <form action={deleteMyNews}>
                        <input type="hidden" name="novedad" value={post.id} />
                        <ConfirmButton className={styles.btnDanger} message="¿Borrar esta novedad?">
                          Borrar
                        </ConfirmButton>
                      </form>
                    ) : null
                  }
                />
              ))
            )}

            <p className={styles.muted}>
              Las publican el PTP Chaco y los delegados de tu barrio. No son comunicados del gobierno ni de organismos
              del Estado: para alertas oficiales, seguí siempre al SMN, Defensa Civil y tu municipio.
            </p>
            {!isDelegate ? (
              <p className={styles.muted}>
                Los <Link href="/organizate/delegados">delegados</Link> pueden publicar novedades, por ejemplo para
                anunciar reuniones o asambleas.
              </p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
