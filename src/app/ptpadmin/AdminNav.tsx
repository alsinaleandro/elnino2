import Link from "next/link";
import { adminLogout } from "./actions";
import styles from "./admin.module.css";

// Secciones del panel de administración y el botón para cerrar la sesión.
// Nombres cortos para que las tres pestañas y "Salir" entren en el ancho de un celular.
export default function AdminNav({ active }: { active: "mensajes" | "novedades" | "estadisticas" }) {
  const items = [
    { key: "mensajes", label: "Mensajes", href: "/ptpadmin/mensajes" },
    { key: "novedades", label: "Novedades", href: "/ptpadmin/novedades" },
    { key: "estadisticas", label: "Estadísticas", href: "/ptpadmin/estadisticas" },
  ] as const;

  return (
    <div className={styles.topBar}>
      <nav className={styles.sections} aria-label="Secciones de administración">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`${styles.section} ${item.key === active ? styles.sectionActive : ""}`}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <form action={adminLogout}>
        <button type="submit" className={styles.logout}>
          Salir
        </button>
      </form>
    </div>
  );
}
