import Link from "next/link";
import styles from "./admin.module.css";

// Secciones del panel de administración.
export default function AdminNav({ token, active }: { token: string; active: "mensajes" | "novedades" }) {
  const items = [
    { key: "mensajes", label: "Mensajes públicos", href: `/admin/${token}` },
    { key: "novedades", label: "Novedades", href: `/admin/${token}/novedades` },
  ] as const;

  return (
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
  );
}
