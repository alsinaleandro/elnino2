import type { Metadata } from "next";
import { requireAdmin } from "@/lib/adminAuth";
import { listAllDelegates } from "@/lib/delegates";
import AdminNav from "../AdminNav";
import styles from "../admin.module.css";
import DelegatesMap from "./DelegatesMap";

// Mapa y lista de los delegados de todos los barrios (Idea 3): nombre, barrio, WhatsApp y
// seguidores. A quién sigue cada vecino no se muestra: solo el total de cada delegado.
export const metadata: Metadata = { title: "Delegados · Administración" };

const SINCE = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Argentina/Cordoba",
});

export default async function AdminDelegatesPage() {
  await requireAdmin();

  const delegates = listAllDelegates();
  const barrios = new Set(delegates.map((delegate) => delegate.barrio)).size;
  const approximate = delegates.filter((delegate) => delegate.point?.approximate).length;
  const unmapped = delegates.filter((delegate) => !delegate.point).length;

  return (
    <main className={styles.page}>
      <AdminNav active="delegados" />
      <header className={styles.header}>
        <h1>Delegados</h1>
        <p>
          Tocá un punto para ver el nombre, el barrio, el WhatsApp y los seguidores de cada delegado. Cada punto es la
          ubicación del delegado cuando eligió su barrio; si no la compartió, el centro de su barrio (punto celeste).
        </p>
      </header>

      <div className={styles.stats}>
        <div>
          <span>Delegados</span>
          <strong>{delegates.length}</strong>
        </div>
        <div>
          <span>Barrios</span>
          <strong>{barrios}</strong>
        </div>
        <div>
          <span>Seguidores</span>
          <strong>{delegates.reduce((sum, delegate) => sum + delegate.followers, 0)}</strong>
        </div>
      </div>

      <DelegatesMap delegates={delegates} />
      <p className={styles.mapLegend}>
        <span className={styles.dotExact} /> Ubicación del delegado <span className={styles.dotApprox} /> Centro del
        barrio{approximate > 0 ? ` (${approximate})` : ""}
        {unmapped > 0 ? ` · ${unmapped} sin ubicación, solo en la lista` : ""}
      </p>

      {delegates.length === 0 ? (
        <p className={styles.empty}>Todavía no hay delegados en ningún barrio.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Delegado</th>
              <th>WhatsApp</th>
              <th>Seguidores</th>
            </tr>
          </thead>
          <tbody>
            {delegates.map((delegate) => (
              <tr key={delegate.id}>
                <td>
                  <strong>{delegate.name}</strong>
                  <br />
                  <small>
                    {delegate.barrio}
                    {delegate.localidad ? ` · ${delegate.localidad}` : ""} · desde el{" "}
                    {SINCE.format(new Date(delegate.since))}
                    {delegate.point ? "" : " · sin ubicación"}
                  </small>
                </td>
                <td>
                  {delegate.whatsappLink ? (
                    <a href={delegate.whatsappLink} target="_blank" rel="noopener noreferrer">
                      {delegate.whatsapp}
                    </a>
                  ) : (
                    delegate.whatsapp
                  )}
                </td>
                <td>{delegate.followers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
