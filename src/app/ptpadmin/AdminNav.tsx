import Link from "next/link";
import { adminLogout } from "./actions";
import styles from "./admin.module.css";

const ITEMS = [
  { key: "mensajes", label: "Mensajes", href: "/ptpadmin/mensajes" },
  { key: "novedades", label: "Novedades", href: "/ptpadmin/novedades" },
  { key: "ayuda", label: "Ayuda mutua", href: "/ptpadmin/ayuda" },
  { key: "delegados", label: "Delegados", href: "/ptpadmin/delegados" },
  { key: "estadisticas", label: "Estadísticas", href: "/ptpadmin/estadisticas" },
] as const;

// Secciones del panel de administración y el botón para cerrar la sesión. En el celular las
// pestañas se deslizan de costado si no entran.
export default function AdminNav({ active }: { active: (typeof ITEMS)[number]["key"] }) {
  const items = ITEMS;

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
