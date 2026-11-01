import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./appNav.module.css";

// Navegación de la app, con el diseño de la maqueta: barra fija abajo en el celular y arriba desde
// tablet. Se usa en la portada (/) y en Mi barrio (/organizate). Cada sección de la portada va en
// la URL (/?s=mapa) para que funcione el botón "atrás" del celular.

export type NavSection = "inicio" | "mapa" | "estado" | "barrio" | "mas";

// Secciones de la portada: título del encabezado, ítem de la barra que queda marcado y, en las
// subsecciones, a dónde vuelve la flecha.
export const SECTIONS = {
  inicio: { title: "Inicio", nav: "inicio" },
  mapa: { title: "Mapa", nav: "mapa" },
  estado: { title: "Estado del río y el clima", nav: "estado" },
  crecida: { title: "Río Paraná", nav: "estado", parent: "estado" },
  pronosticos: { title: "Pronóstico de lluvia", nav: "estado", parent: "estado" },
  nubes: { title: "Nubes", nav: "estado", parent: "estado" },
  mas: { title: "Más", nav: "mas" },
  riesgo: { title: "Tu zona de riesgo", nav: "mas", parent: "mas" },
  info: { title: "Información", nav: "mas", parent: "mas" },
  ayuda: { title: "Teléfonos útiles", nav: "mas", parent: "mas" },
  contacto: { title: "Contactanos", nav: "mas", parent: "mas" },
} as const satisfies Record<string, { title: string; nav: NavSection; parent?: string }>;

export type SectionKey = keyof typeof SECTIONS;

export const sectionHref = (key: SectionKey) => (key === "inicio" ? "/" : `/?s=${key}`);

export const parseSection = (value: unknown): SectionKey =>
  typeof value === "string" && Object.hasOwn(SECTIONS, value) ? (value as SectionKey) : "inicio";

const ITEMS: Array<{ key: NavSection; label: string; href: string; icon: ReactNode }> = [
  { key: "inicio", label: "Inicio", href: "/", icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  {
    key: "mapa",
    label: "Mapa",
    href: sectionHref("mapa"),
    icon: (
      <>
        <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
  },
  {
    key: "estado",
    label: "Estado",
    href: sectionHref("estado"),
    icon: (
      <>
        <path d="M2 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
        <path d="M2 20.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
        <path d="M7 11a3 3 0 0 1-.4-6A4 4 0 0 1 14 5.5a2.75 2.75 0 0 1 0 5.5z" />
      </>
    ),
  },
  {
    key: "barrio",
    label: "Mi barrio",
    href: "/organizate",
    icon: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
        <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
      </>
    ),
  },
  {
    key: "mas",
    label: "Más",
    href: sectionHref("mas"),
    icon: (
      <>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </>
    ),
  },
];

// data-app-nav: globals.css deja lugar abajo para la barra fija.
export default function AppNav({ active }: { active: NavSection }) {
  return (
    <nav className={styles.nav} aria-label="Secciones" data-app-nav>
      {ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`${styles.item} ${item.key === active ? styles.itemActive : ""}`}
          aria-current={item.key === active ? "page" : undefined}
        >
          <svg
            className={styles.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {item.icon}
          </svg>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

// Encabezado de cada sección: flecha para volver (en las subsecciones), título, lugar del vecino y
// sus iniciales, que llevan a Mi barrio.
export function AppHeader({
  title,
  place,
  back,
  initials,
}: {
  title: string;
  place?: string;
  back?: string;
  initials?: string;
}) {
  return (
    <header className={styles.header}>
      {back ? (
        <Link href={back} className={styles.back} aria-label="Volver">
          ‹
        </Link>
      ) : null}
      <div className={styles.headerTitle}>
        <h1>{title}</h1>
        {place ? <span className={styles.headerPlace}>📍 {place}</span> : null}
      </div>
      {initials ? (
        <Link href="/organizate" className={styles.avatar} aria-label="Mi barrio y mis datos">
          {initials}
        </Link>
      ) : null}
    </header>
  );
}

// Lista de opciones de Estado y Más.
export function MenuList({ items }: { items: Array<{ href: string; icon: string; label: string; detail: string }> }) {
  return (
    <div className={styles.menu}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={styles.menuItem}>
          <span className={styles.menuIcon} aria-hidden="true">
            {item.icon}
          </span>
          <div>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </div>
        </Link>
      ))}
    </div>
  );
}
