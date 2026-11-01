import type { Metadata } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { FLOOD_CAUSE_INFO, FLOOD_STATUS_INFO, FLOOD_STATUSES } from "@/lib/floodKinds";
import { listFloodsForAdmin } from "@/lib/floods";
import { mapLink, whatsappLink } from "@/lib/links";
import ConfirmButton from "../../ConfirmButton";
import { timeAgo } from "../../format";
import { deleteFloodAdmin } from "../actions";
import AdminNav from "../AdminNav";
import styles from "../admin.module.css";

// Inundaciones que reportan los vecinos (Idea 2): los puntos vigentes con su autor, para poder
// contactarlo o borrar un reporte falso. En el mapa de la app los puntos se ven sin el autor.
export const metadata: Metadata = { title: "Inundaciones · Administración" };

export default async function AdminFloodsPage() {
  await requireAdmin();

  const reports = listFloodsForAdmin();

  return (
    <main className={styles.page}>
      <AdminNav active="inundaciones" />
      <header className={styles.header}>
        <h1>Inundaciones reportadas</h1>
        <p>
          Puntos vigentes del mapa colaborativo (pestaña Mapa de la app). Cada vecino tiene un solo punto; los vecinos
          lo ven sin el nombre de quien lo reportó. Borrá los reportes falsos o malintencionados.
        </p>
      </header>

      <div className={styles.stats}>
        {FLOOD_STATUSES.map((status) => (
          <div key={status}>
            <span>{FLOOD_STATUS_INFO[status].label}</span>
            <strong>{reports.filter((report) => report.status === status).length}</strong>
          </div>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className={styles.empty}>No hay reportes vigentes.</p>
      ) : (
        <ul className={styles.list}>
          {reports.map((report) => {
            const info = FLOOD_STATUS_INFO[report.status];
            const whatsapp = report.whatsapp ? whatsappLink(report.whatsapp) : null;
            return (
              <li key={report.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.badge} style={{ background: info.color, color: "#ffffff" }}>
                    {info.label}
                  </span>
                  <span className={styles.date}>
                    {report.cause ? `${FLOOD_CAUSE_INFO[report.cause].label} · ` : ""}
                    {timeAgo(report.createdAt)}
                  </span>
                </div>
                <p className={styles.message}>
                  {report.author}
                  {report.barrio ? ` · ${report.barrio}` : ""}
                  {report.whatsapp ? (
                    <>
                      {" · "}
                      {whatsapp ? (
                        <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                          WhatsApp {report.whatsapp}
                        </a>
                      ) : (
                        `WhatsApp ${report.whatsapp}`
                      )}
                    </>
                  ) : null}
                </p>
                <p className={styles.contact}>
                  <a href={mapLink(report.latitude, report.longitude)} target="_blank" rel="noopener noreferrer">
                    Ver el punto en el mapa
                  </a>
                  {report.accuracy !== null ? ` · GPS ±${report.accuracy} m` : " · marcado a mano"}
                </p>
                <form action={deleteFloodAdmin} className={styles.actions}>
                  <input type="hidden" name="id" value={report.id} />
                  <ConfirmButton
                    className={`${styles.button} ${styles.buttonDanger}`}
                    message={`¿Borrar el reporte de ${report.author}?`}
                  >
                    Borrar
                  </ConfirmButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
