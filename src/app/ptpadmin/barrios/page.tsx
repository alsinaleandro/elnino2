import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";
import { listBarrioImports } from "@/lib/barrioImport";
import { listBarriosForAdmin } from "@/lib/barrios";
import ConfirmButton from "../../ConfirmButton";
import { timeAgo } from "../../format";
import { deleteBarrioAdmin, importBarriosAdmin } from "../actions";
import AdminNav from "../AdminNav";
import styles from "../admin.module.css";
import BarriosMap from "./BarriosMap";
import ImportRefresher from "./ImportRefresher";

// Barrios cargados en la base (Idea 1): los polígonos que se usan para detectar el barrio de cada
// vecino y los que escribieron los vecinos. Desde acá se cargan de una vez todos los barrios de una
// localidad desde OpenStreetMap, así la detección no depende de que Overpass responda en el momento.
export const metadata: Metadata = { title: "Barrios · Administración" };

const SIN_LOCALIDAD = "Sin localidad";

export default async function AdminBarriosPage({ searchParams }: PageProps<"/ptpadmin/barrios">) {
  await requireAdmin();

  const { error, localidad } = await searchParams;
  const all = listBarriosForAdmin();
  const imports = listBarrioImports();
  const running = imports.some((item) => item.status === "running");

  const byLocalidad = new Map<string, typeof all>();
  for (const barrio of all) {
    const key = barrio.localidad ?? SIN_LOCALIDAD;
    byLocalidad.set(key, [...(byLocalidad.get(key) ?? []), barrio]);
  }
  const selected = typeof localidad === "string" && byLocalidad.has(localidad) ? localidad : null;
  const shown = selected ? byLocalidad.get(selected)! : all;
  const withPolygon = shown.filter((barrio) => barrio.geometry).length;

  return (
    <main className={styles.page}>
      <AdminNav active="barrios" />
      <ImportRefresher running={running} />
      <header className={styles.header}>
        <h1>Barrios</h1>
        <p>
          Los polígonos de esta base son los que usa la app para proponerle su barrio a cada vecino. Los barrios en azul
          vienen de OpenStreetMap; los verdes, dibujados a mano acá; los puntos naranjas son barrios que escribieron los vecinos y no tienen polígono.
          Para un barrio que falta en OSM, dibujalo con el botón de arriba del mapa.
        </p>
      </header>

      <form action={importBarriosAdmin} className={styles.newsForm}>
        <h2>Cargar los barrios de una localidad</h2>
        <label className={styles.newsField}>
          Localidad del Chaco
          <input
            name="localidad"
            className={styles.input}
            required
            maxLength={60}
            placeholder="Ej. Resistencia, Barranqueras, Fontana, Puerto Vilelas"
          />
        </label>
        <p className={styles.contact}>
          Se buscan en OpenStreetMap todos los barrios con polígono dentro del municipio. Los que ya estaban se actualizan
          sin perder a sus vecinos. Si Overpass está saturado se reintenta sola durante unos minutos.
        </p>
        {typeof error === "string" ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={styles.button}>
          Buscar y cargar barrios
        </button>
      </form>

      {imports.length > 0 ? (
        <ul className={styles.list}>
          {imports.map((item) => (
            <li key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <strong>{item.localidad}</strong>
                <span className={styles.date}>{timeAgo(item.startedAt)}</span>
              </div>
              {item.status === "running" ? (
                <p className={styles.message}>⏳ Consultando OpenStreetMap…{item.message ? ` ${item.message}` : ""}</p>
              ) : (
                <p className={item.status === "ok" ? styles.formSuccess : styles.formError}>
                  {item.message}
                  {item.status === "ok" ? ` ${item.added} nuevos, ${item.updated} actualizados.` : ""}
                </p>
              )}
              {item.pointOnly.length > 0 ? (
                <p className={styles.contact}>
                  En OSM figuran solo como un punto, sin polígono ({item.pointOnly.length}):{" "}
                  {item.pointOnly.join(", ")}. Estos no se pueden detectar hasta que alguien dibuje su polígono en
                  OpenStreetMap.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.stats}>
        <div>
          <span>Barrios</span>
          <strong>{shown.length}</strong>
        </div>
        <div>
          <span>Con polígono</span>
          <strong>{withPolygon}</strong>
        </div>
        <div>
          <span>Sin polígono</span>
          <strong>{shown.length - withPolygon}</strong>
        </div>
      </div>

      {byLocalidad.size > 1 ? (
        <nav className={styles.filters} aria-label="Localidad que se muestra">
          <Link
            href="/ptpadmin/barrios"
            className={`${styles.filter} ${selected === null ? styles.filterActive : ""}`}
            aria-current={selected === null ? "page" : undefined}
          >
            Todas <span>{all.length}</span>
          </Link>
          {[...byLocalidad].map(([name, barrios]) => (
            <Link
              key={name}
              href={`/ptpadmin/barrios?localidad=${encodeURIComponent(name)}`}
              className={`${styles.filter} ${selected === name ? styles.filterActive : ""}`}
              aria-current={selected === name ? "page" : undefined}
            >
              {name} <span>{barrios.length}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      <BarriosMap barrios={shown} localidades={[...byLocalidad.keys()].filter((name) => name !== SIN_LOCALIDAD)} />
      <p className={styles.mapLegend}>
        Mapa de barrios © OpenStreetMap contributors (ODbL). Azul: OpenStreetMap · verde: dibujado en el panel ·
        naranja: escrito por un vecino, sin polígono. Relleno fuerte: el barrio tiene vecinos.
      </p>

      {shown.length === 0 ? (
        <p className={styles.empty}>Todavía no hay barrios cargados. Cargá los de una localidad con el formulario.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Barrio</th>
              <th>Vecinos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((barrio) => (
              <tr key={barrio.id}>
                <td>
                  <strong>{barrio.name}</strong>
                  <br />
                  <small>
                    {barrio.localidad ?? SIN_LOCALIDAD} ·{" "}
                    {barrio.source === "osm"
                      ? "OpenStreetMap"
                      : barrio.source === "ptp"
                        ? "dibujado en el panel"
                        : barrio.center
                          ? "vecino, sin polígono"
                          : "vecino, sin ubicación"}
                  </small>
                </td>
                <td>{barrio.neighbors}</td>
                <td>
                  {barrio.neighbors === 0 ? (
                    <form action={deleteBarrioAdmin}>
                      <input type="hidden" name="id" value={barrio.id} />
                      <ConfirmButton
                        className={`${styles.button} ${styles.buttonDanger}`}
                        message={`¿Borrar el barrio ${barrio.name}?`}
                      >
                        Borrar
                      </ConfirmButton>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
