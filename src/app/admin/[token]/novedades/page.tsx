import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { isAdminToken } from "@/lib/admin";
import { listAllNews, listBarriosWithMembers } from "@/lib/news";
import ConfirmButton from "../../../ConfirmButton";
import NewsCard from "../../../NewsCard";
import NewsFields from "../../../NewsFields";
import { deleteNewsAdmin, publishPtpNews } from "../actions";
import AdminNav from "../AdminNav";
import styles from "../admin.module.css";

// Novedades del PTP Chaco: se publican para todos los barrios o para uno. También se ven (y se
// pueden borrar) las que publican los delegados en sus barrios.
export const metadata: Metadata = {
  title: "Novedades · Administración",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AdminNewsPage({ params, searchParams }: PageProps<"/admin/[token]/novedades">) {
  await connection();
  const { token } = await params;
  if (!isAdminToken(token)) notFound();

  const { error, publicada } = await searchParams;
  const barrios = listBarriosWithMembers();
  const posts = listAllNews();

  return (
    <main className={styles.page}>
      <AdminNav token={token} active="novedades" />
      <header className={styles.header}>
        <h1>Novedades</h1>
        <p>
          Lo que publiques acá aparece en Mi barrio → Novedades con la etiqueta &quot;PTP Chaco&quot;. Los delegados
          publican las suyas desde la app, solo para su barrio.
        </p>
      </header>

      <form action={publishPtpNews} className={styles.newsForm}>
        <input type="hidden" name="token" value={token} />
        <h2>Publicar una novedad del PTP Chaco</h2>
        <label className={styles.newsField}>
          Para
          <select name="barrio" defaultValue="todos">
            <option value="todos">Todos los barrios</option>
            {barrios.map((barrio) => (
              <option key={barrio.id} value={barrio.id}>
                {barrio.name}
                {barrio.localidad ? ` (${barrio.localidad})` : ""} · {barrio.neighbors}{" "}
                {barrio.neighbors === 1 ? "vecino" : "vecinos"}
              </option>
            ))}
          </select>
        </label>
        <NewsFields />
        {typeof error === "string" ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        {publicada ? (
          <p className={styles.formSuccess} role="status">
            Novedad publicada.
          </p>
        ) : null}
        <button type="submit" className={styles.button}>
          Publicar
        </button>
      </form>

      <h2 className={styles.listTitle}>Publicadas</h2>
      {posts.length === 0 ? <p className={styles.empty}>Todavía no hay novedades.</p> : null}
      <div className={styles.list}>
        {posts.map((post) => (
          <NewsCard
            key={post.id}
            post={post}
            showBarrio
            actions={
              <form action={deleteNewsAdmin} className={styles.actions}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="id" value={post.id} />
                <ConfirmButton
                  className={`${styles.button} ${styles.buttonDanger}`}
                  message={`¿Borrar la novedad "${post.title}"?`}
                >
                  Borrar
                </ConfirmButton>
              </form>
            }
          />
        ))}
      </div>
    </main>
  );
}
