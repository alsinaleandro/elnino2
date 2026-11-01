import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listDelegates } from "@/lib/delegates";
import { getCurrentNeighbor } from "@/lib/neighbors";
import AppNav, { AppHeader } from "../../AppNav";
import ConfirmButton from "../../ConfirmButton";
import { applyAsDelegate, follow, resignAsDelegate, unfollow } from "../actions";
import styles from "../organizate.module.css";

export const metadata: Metadata = { title: "Delegados · ¡Organizate!" };

// Delegados del barrio (Idea 3): cada vecino sigue a uno o a ninguno, y cualquiera puede postularse.
// ?postular=1 muestra antes qué datos se publican. A quién sigue cada vecino solo lo ve él mismo.

const SINCE = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Argentina/Cordoba",
});

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export default async function DelegadosPage({ searchParams }: PageProps<"/organizate/delegados">) {
  const { postular, error } = await searchParams;
  const neighbor = await getCurrentNeighbor();
  if (!neighbor?.whatsapp || !neighbor.barrio) redirect("/organizate");

  const delegates = listDelegates(neighbor.barrio.id, neighbor);
  const isDelegate = neighbor.delegateSince !== null;
  const confirming = postular === "1" && !isDelegate;

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        <AppHeader title="Delegados" place={neighbor.barrio.name} back="/organizate" />

        {error === "seguir" ? (
          <p className={styles.error} role="alert">
            Ese delegado ya no está en tu barrio.
          </p>
        ) : null}

        {confirming ? (
          <div className={styles.confirmBox}>
            <h2>Postularme como delegado/a</h2>
            <p>
              Si te postulás,{" "}
              <strong>
                tu nombre ({neighbor.firstName} {neighbor.lastName}) y tu WhatsApp ({neighbor.whatsapp}) se publican
              </strong>{" "}
              para los vecinos de {neighbor.barrio.name}, y los conoce el PTP Chaco para coordinar entre barrios.
            </p>
            <p>
              El PTP Chaco también te ve en su <strong>mapa de delegados</strong>, con la ubicación que guardamos cuando
              elegiste tu barrio (o el centro del barrio, si no la compartiste). Los vecinos no ven ese mapa.
            </p>
            <p className={styles.muted}>
              Sos delegado/a desde que te postulás, aunque todavía nadie te siga. Podés renunciar cuando quieras: tus
              datos dejan de ser públicos.
            </p>
            <form action={applyAsDelegate} className={styles.form}>
              <button type="submit" className={styles.btnPrimary}>
                Me postulo
              </button>
            </form>
            <Link href="/organizate/delegados" className={styles.btnGhost}>
              Cancelar
            </Link>
          </div>
        ) : (
          <>
            <p className={styles.muted}>
              Elegí a <strong>un</strong> delegado para seguir, o a ninguno. Podés cambiarlo cuando quieras. Nadie del
              barrio ve a quién seguís: solo se publica cuántos seguidores tiene cada delegado.
            </p>

            {delegates.length === 0 ? (
              <p className={styles.muted}>Todavía no hay delegados en {neighbor.barrio.name}. ¡Podés ser el primero!</p>
            ) : (
              delegates.map((delegate) => (
                <div
                  key={delegate.id}
                  className={`${styles.delegateCard} ${delegate.followedByMe ? styles.following : ""}`}
                >
                  <div className={styles.delegate}>
                    <span className={styles.initials} aria-hidden="true">
                      {initialsOf(delegate.name)}
                    </span>
                    <div>
                      <strong>
                        {delegate.name}
                        {delegate.isMe ? " (vos)" : ""}
                      </strong>
                      <p className={styles.muted}>
                        {delegate.followers} {delegate.followers === 1 ? "seguidor" : "seguidores"} · delegado/a desde
                        el {SINCE.format(new Date(delegate.since))}
                      </p>
                    </div>
                  </div>

                  <div className={styles.row}>
                    {delegate.isMe ? (
                      <form action={resignAsDelegate}>
                        <ConfirmButton
                          className={`${styles.btnSecondary} ${styles.btnSmall}`}
                          message="¿Renunciar como delegado/a? Tu nombre y tu WhatsApp dejan de publicarse y quienes te siguen quedan sin delegado."
                        >
                          Renunciar
                        </ConfirmButton>
                      </form>
                    ) : (
                      <>
                        {delegate.whatsappLink ? (
                          <a
                            href={delegate.whatsappLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${styles.btnWhatsapp} ${styles.btnSmall}`}
                          >
                            💬 WhatsApp {delegate.whatsapp}
                          </a>
                        ) : (
                          <span className={styles.muted}>WhatsApp {delegate.whatsapp}</span>
                        )}
                        {delegate.followedByMe ? (
                          <form action={unfollow}>
                            <button type="submit" className={`${styles.btnSecondary} ${styles.btnSmall}`}>
                              Siguiendo ✓ · Dejar de seguir
                            </button>
                          </form>
                        ) : (
                          <form action={follow}>
                            <input type="hidden" name="delegado" value={delegate.id} />
                            <button type="submit" className={`${styles.btnPrimary} ${styles.btnSmall}`}>
                              {neighbor.followsId ? "Seguir a este delegado" : "Seguir"}
                            </button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}

            {!isDelegate ? (
              <Link href="/organizate/delegados?postular=1" className={styles.btnSecondary}>
                Postularme como delegado/a
              </Link>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
