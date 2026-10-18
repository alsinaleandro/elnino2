import { useEffect, useState, type ReactNode } from "react";
import styles from "./page.module.css";

// Navegación del celular: barra fija abajo con las pestañas principales y un botón "Más" que
// despliega el resto. En tablet y escritorio se oculta y se usa la barra de pestañas de arriba
// (ver .bottomNav y .tabs en page.module.css).

type Tab<K extends string> = { key: K; label: string };

type Props<K extends string> = {
  tabs: readonly Tab<K>[];
  primary: readonly K[];
  active: K;
  onSelect: (key: K) => void;
};

// Íconos de línea de 24×24, uno por pestaña.
const ICONS: Record<string, ReactNode> = {
  inicio: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  riesgo: (
    <>
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4M12 17.5v.01" />
    </>
  ),
  crecida: (
    <>
      <path d="M2 16c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
      <path d="M2 20.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
      <path d="M12 3v8M8.5 7.5L12 11l3.5-3.5" />
    </>
  ),
  mapa: (
    <>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  pronosticos: (
    <>
      <path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 0 7.5z" />
      <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
    </>
  ),
  nubes: <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18z" />,
  ayuda: (
    <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" />
  ),
  mas: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      className={styles.bottomNavIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

export default function BottomNav<K extends string>({ tabs, primary, active, onSelect }: Props<K>) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryTabs = tabs.filter((tab) => primary.includes(tab.key));
  const moreTabs = tabs.filter((tab) => !primary.includes(tab.key));
  const activeInMore = moreTabs.some((tab) => tab.key === active);

  // Escape cierra el menú "Más".
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const select = (key: K) => {
    setMoreOpen(false);
    onSelect(key);
  };

  return (
    <>
      {moreOpen ? <div className={styles.bottomNavBackdrop} onClick={() => setMoreOpen(false)} /> : null}

      {moreOpen ? (
        <div id="menu-mas" className={styles.bottomNavSheet} role="menu" aria-label="Más secciones">
          {moreTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="menuitem"
              className={`${styles.bottomNavSheetItem} ${tab.key === active ? styles.bottomNavSheetItemActive : ""}`}
              onClick={() => select(tab.key)}
            >
              <Icon name={tab.key} />
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      <nav className={styles.bottomNav} aria-label="Secciones">
        {primaryTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.bottomNavItem} ${tab.key === active ? styles.bottomNavItemActive : ""}`}
            aria-current={tab.key === active ? "page" : undefined}
            onClick={() => select(tab.key)}
          >
            <Icon name={tab.key} />
            <span>{tab.label}</span>
          </button>
        ))}
        <button
          type="button"
          className={`${styles.bottomNavItem} ${activeInMore || moreOpen ? styles.bottomNavItemActive : ""}`}
          aria-expanded={moreOpen}
          aria-controls="menu-mas"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Icon name="mas" />
          <span>{activeInMore ? tabs.find((tab) => tab.key === active)?.label : "Más"}</span>
        </button>
      </nav>
    </>
  );
}
