"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import ptpLogo from "../../../public/images/logo-ptp-chaco.png";
import CloudsView from "../CloudsView";
import ContactView from "../ContactView";
import HelpView from "../HelpView";
import InfoGuide from "../InfoGuide";
import pageStyles from "../page.module.css";
import RainForecast from "../RainForecast";
import RiskBars, { RiskLevelsGuide } from "../RiskBars";
import RiverGauge from "../RiverGauge";
import { BARRIO, LOCALIDAD, PLAN_FAMILIAR, PROXIMA_LLUVIA, REPORTES, RIO, ZONA } from "./datos";
import MapaReportes from "./MapaReportes";
import styles from "./maqueta.module.css";
import { Aceptacion, Ingreso, MiBarrio, type Usuario } from "./Organizate";

// Maqueta navegable de la nueva interfaz (ver ideas.md). Las secciones Estado, Información, Ayuda y
// Contactanos usan los componentes reales de la app; el resto usa datos de ejemplo (datos.ts).

type Seccion = "inicio" | "mapa" | "estado" | "barrio" | "mas";
type Vista = null | "riesgo" | "plan" | "info" | "avisos" | "ayuda" | "contacto" | "perfil";

const SECCIONES: Array<{ key: Seccion; label: string; icon: ReactNode }> = [
  { key: "inicio", label: "Inicio", icon: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /> },
  {
    key: "mapa",
    label: "Mapa",
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
    icon: (
      <>
        <circle cx="5" cy="12" r="1.2" />
        <circle cx="12" cy="12" r="1.2" />
        <circle cx="19" cy="12" r="1.2" />
      </>
    ),
  },
];

const TITULOS: Record<Seccion, string> = {
  inicio: "¿Estoy en riesgo?",
  mapa: "Mapa",
  estado: "Estado del río y el clima",
  barrio: "Mi barrio",
  mas: "Más",
};

const TITULOS_VISTA: Record<Exclude<Vista, null>, string> = {
  riesgo: "Tu zona de riesgo",
  plan: "Plan familiar",
  info: "Información",
  avisos: "Avisos",
  ayuda: "Teléfonos útiles",
  contacto: "Contactanos",
  perfil: "Mi perfil",
};

// La maqueta recuerda en el navegador si ya se vio la portada y el plan familiar.
const leer = (clave: string) => {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave: string, valor: string | null) => {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch {}
};

function Icono({ children }: { children: ReactNode }) {
  return (
    <svg
      className={styles.navIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Altura real del Paraná (la misma API que la pestaña Crecida); si falla, la de ejemplo.
function useRio() {
  const [rio, setRio] = useState<{ altura: number; alerta: number; evacuacion: number; variacion: string; tendencia: string; fecha?: string; real: boolean }>(
    { ...RIO, real: false },
  );

  useEffect(() => {
    fetch("/api/rio-parana?puerto=BARRANQUERAS&rio=PARANA")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => {
        const row = payload.row ?? payload;
        if (typeof row.alturaActual !== "number") return;
        setRio({
          altura: row.alturaActual,
          alerta: row.alerta ?? RIO.alerta,
          evacuacion: row.evacuacion ?? RIO.evacuacion,
          variacion: String(row.variacion ?? ""),
          tendencia: String(row.tendencia ?? ""),
          fecha: String(row.fechaHoraActual ?? ""),
          real: true,
        });
      })
      .catch(() => {});
  }, []);

  return rio;
}

const metros = (valor: number) => `${valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })} m`;

export default function Maqueta() {
  const [portada, setPortada] = useState(false);
  const [seccion, setSeccion] = useState<Seccion>("inicio");
  const [vista, setVista] = useState<Vista>(null);
  const [subEstado, setSubEstado] = useState<"rio" | "lluvia" | "nubes">("rio");
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [organizando, setOrganizando] = useState<null | "aceptacion" | "ingreso">(null);
  const [plan, setPlan] = useState<string[]>([]);
  const [avisos, setAvisos] = useState({ alerta: true, evacuacion: true, lluvia: false, reportes: true, novedades: true });
  const rio = useRio();

  // Lo guardado en el navegador se lee después de montar (en el servidor no existe).
  useEffect(() => {
    queueMicrotask(() => {
      setPortada(leer("maqueta-portada-vista") === null);
      setPlan(JSON.parse(leer("maqueta-plan") ?? "[]"));
    });
  }, []);

  const ir = (nueva: Seccion, nuevaVista: Vista = null) => {
    setSeccion(nueva);
    setVista(nuevaVista);
    if (nueva !== "barrio") setOrganizando(null);
    window.scrollTo({ top: 0 });
  };

  const organizate = () => {
    cerrarPortada();
    ir("barrio");
    setOrganizando("aceptacion");
  };

  const cerrarPortada = () => {
    guardar("maqueta-portada-vista", "1");
    setPortada(false);
  };

  const reiniciar = () => {
    guardar("maqueta-portada-vista", null);
    guardar("maqueta-plan", null);
    setUsuario(null);
    setPlan([]);
    setOrganizando(null);
    setSeccion("inicio");
    setVista(null);
    setPortada(true);
  };

  const togglePlan = (id: string) => {
    const nuevo = plan.includes(id) ? plan.filter((item) => item !== id) : [...plan, id];
    setPlan(nuevo);
    guardar("maqueta-plan", JSON.stringify(nuevo));
  };

  const avancePlan = Math.round((plan.length / PLAN_FAMILIAR.length) * 100);
  const sobreAlerta = rio.altura >= rio.alerta;
  const sobreEvacuacion = rio.altura >= rio.evacuacion;
  const intransitables = REPORTES.filter((reporte) => reporte.historial[0].estado === "intransitable").length;

  const banner = (
    <div className={styles.banner}>
      <span>MAQUETA · datos de ejemplo</span>
      <button type="button" onClick={reiniciar}>
        Empezar de nuevo
      </button>
    </div>
  );

  // ---------- Portada (solo la primera vez) ----------

  if (portada) {
    return (
      <div className={styles.app} style={{ paddingBottom: 0 }}>
        {banner}
        <div className={styles.cover}>
          <p className={styles.coverKicker}>El fenómeno El Niño trae lluvias e inundaciones</p>
          <h1 className={styles.coverTitle}>¿Estoy en riesgo?</h1>
          <p className={styles.coverText}>
            Usamos tu ubicación para decirte si estás en una zona de riesgo por lluvia, crecida de ríos, o ambos.
          </p>
          <p className={styles.muted}>
            Esta app tiene datos de zonas de riesgo para el Área Metropolitana Gran Resistencia, y Colonia Benítez.
          </p>
          <div className={styles.coverButtons}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                cerrarPortada();
                ir("inicio");
              }}
            >
              📍 Ver mi riesgo
            </button>
            <button type="button" className={styles.btnSecondary} onClick={organizate}>
              ✊ ¡Organizate!
            </button>
          </div>
          <div className={styles.credits}>
            <span>Creado por</span>
            <a href="https://ptpchaco.org.ar" target="_blank" rel="noreferrer">
              <Image src={ptpLogo} alt="PTP Chaco" width={132} />
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Contenido de cada sección ----------

  let titulo: string = vista ? TITULOS_VISTA[vista] : TITULOS[seccion];
  if (seccion === "barrio" && organizando) titulo = "¡Organizate!";
  const volver = vista
    ? () => setVista(null)
    : seccion === "barrio" && organizando
      ? () => setOrganizando(null)
      : null;

  let contenido: ReactNode = null;

  if (seccion === "inicio" && vista === "riesgo") {
    const rioState = { tone: "dangerLight" as const, status: "ZONA DE RESTRICCION LEVE" };
    const lluviaState = { tone: "dangerSevere" as const, status: "ZONA DE RESTRICCION SEVERA" };
    contenido = (
      <div className={pageStyles.riskZoneCard}>
        <div className={pageStyles.zoneHeader}>
          <span>
            Zona de riesgo hídrico de tu ubicación · {LOCALIDAD}
          </span>
        </div>
        <RiskBars rio={rioState} lluvia={lluviaState} />
        <RiskLevelsGuide rio={rioState} lluvia={lluviaState} />
      </div>
    );
  } else if (seccion === "inicio") {
    contenido = (
      <>
        <button type="button" className={styles.card} onClick={() => setVista("riesgo")}>
          <span className={styles.cardHead}>Tu zona · {BARRIO}</span>
          <div className={styles.row}>
            <span className={`${styles.chip} ${styles.chipLight}`}>Crecida: Leve</span>
            <span className={`${styles.chip} ${styles.chipSevere}`}>Lluvia: Severa</span>
          </div>
          <span className={styles.cardSub}>{ZONA.lluvia} por precipitaciones: se acumula agua con cualquier lluvia.</span>
        </button>

        <button
          type="button"
          className={`${styles.card} ${sobreAlerta ? styles.alertCard : ""}`}
          onClick={() => {
            ir("estado");
            setSubEstado("rio");
          }}
        >
          <span className={styles.cardHead}>Río Paraná · Barranqueras</span>
          <div className={styles.row}>
            <span className={styles.big}>{metros(rio.altura)}</span>
            {rio.tendencia.toUpperCase().includes("CRECE") ? <span className={styles.up}>▲ crece</span> : null}
          </div>
          <span className={styles.cardSub}>
            {sobreEvacuacion
              ? `⚠️ Superó la altura de evacuación (${metros(rio.evacuacion)})`
              : sobreAlerta
                ? `⚠️ Superó la altura de alerta (${metros(rio.alerta)}) · evacuación ${metros(rio.evacuacion)}`
                : `Alerta ${metros(rio.alerta)} · evacuación ${metros(rio.evacuacion)}`}
          </span>
        </button>

        <button
          type="button"
          className={styles.card}
          onClick={() => {
            ir("estado");
            setSubEstado("lluvia");
          }}
        >
          <span className={styles.cardHead}>Próxima lluvia</span>
          <span className={styles.cardMain}>
            🌧️ {PROXIMA_LLUVIA.dia}: {PROXIMA_LLUVIA.mm} mm ({PROXIMA_LLUVIA.probabilidad}%)
          </span>
        </button>

        <button type="button" className={styles.card} onClick={() => ir("mapa")}>
          <span className={styles.cardHead}>Reportes de vecinos</span>
          <span className={styles.cardMain}>⚠️ {REPORTES.length} reportes cerca tuyo</span>
          <span className={styles.cardSub}>{intransitables} calle intransitable · tocá para verlos en el mapa</span>
        </button>

        <button type="button" className={styles.card} onClick={() => ir("mas", "plan")}>
          <span className={styles.cardHead}>Tu plan familiar</span>
          <span className={styles.cardMain}>🎒 {avancePlan}% preparado</span>
          <div className={styles.progress}>
            <span style={{ width: `${avancePlan}%` }} />
          </div>
        </button>

        {usuario ? (
          <button type="button" className={styles.card} onClick={() => ir("barrio")}>
            <span className={styles.cardHead}>Tu barrio · {usuario.barrio}</span>
            <span className={styles.cardMain}>👥 3 novedades · 4 mensajes nuevos</span>
          </button>
        ) : (
          <button type="button" className={styles.card} onClick={organizate}>
            <span className={styles.cardHead}>Comité de emergencia</span>
            <span className={styles.cardMain}>✊ Sumate al comité de tu barrio</span>
            <span className={styles.cardSub}>Organizate con tus vecinos para enfrentar juntos las inundaciones.</span>
          </button>
        )}
      </>
    );
  } else if (seccion === "mapa") {
    contenido = <MapaReportes registrado={usuario !== null} onRegistrarse={organizate} />;
  } else if (seccion === "estado") {
    contenido = (
      <>
        <div className={styles.subtabs} role="tablist">
          {(
            [
              ["rio", "Río"],
              ["lluvia", "Lluvia"],
              ["nubes", "Nubes"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={subEstado === key}
              className={`${styles.subtab} ${subEstado === key ? styles.subtabActive : ""}`}
              onClick={() => setSubEstado(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {subEstado === "rio" ? (
          <>
            <h2 className={pageStyles.riverTitle}>Estado actual del río Paraná en el puerto Barranqueras</h2>
            <div className={pageStyles.riverGaugeCard}>
              <RiverGauge actual={rio.altura} alerta={rio.alerta} evacuacion={rio.evacuacion} />
            </div>
            <div className={pageStyles.resultGrid}>
              <div className={pageStyles.metric}>
                <span>Variación</span>
                <strong>{rio.variacion || "Sin dato"}</strong>
              </div>
              <div className={pageStyles.metric}>
                <span>Estado</span>
                <strong>{rio.tendencia || "Sin dato"}</strong>
              </div>
            </div>
            <p className={styles.muted}>
              {rio.real ? "Datos reales de Prefectura Naval Argentina." : "Datos de ejemplo (Prefectura no respondió)."}
            </p>
          </>
        ) : subEstado === "lluvia" ? (
          <RainForecast />
        ) : (
          <CloudsView />
        )}
      </>
    );
  } else if (seccion === "barrio") {
    contenido = usuario ? (
      <MiBarrio usuario={usuario} onCambiar={setUsuario} />
    ) : organizando === "aceptacion" ? (
      <Aceptacion onAceptar={() => setOrganizando("ingreso")} onCancelar={() => setOrganizando(null)} />
    ) : organizando === "ingreso" ? (
      <Ingreso
        onListo={(nuevo) => {
          setUsuario(nuevo);
          setOrganizando(null);
          window.scrollTo({ top: 0 });
        }}
      />
    ) : (
      <>
        <div className={styles.barrioHead}>
          <strong>Comité de emergencia de tu barrio</strong>
          <span>
            {BARRIO} · 47 vecinos ya se sumaron
          </span>
        </div>
        <div className={`${styles.card} ${styles.cardStatic}`}>
          <span className={styles.cardMain}>Cuando el agua sube, los que primero ayudan son los vecinos.</span>
          <ul className={styles.cardSub} style={{ paddingLeft: 18 }}>
            <li>Enterate de las novedades de tu barrio.</li>
            <li>Hablá con tus vecinos en el chat del barrio.</li>
            <li>Elegí a tu delegado, o postulate.</li>
            <li>Ofrecé o pedí ayuda.</li>
            <li>Reportá calles y zonas inundadas.</li>
          </ul>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={() => setOrganizando("aceptacion")}>
          ✊ ¡Organizate!
        </button>
        <p className={styles.muted}>Iniciativa del PTP Chaco, no del Estado.</p>
      </>
    );
  } else if (vista === "plan") {
    contenido = (
      <>
        <div className={`${styles.card} ${styles.cardStatic}`}>
          <span className={styles.cardMain}>Tu familia está {avancePlan}% preparada</span>
          <div className={styles.progress}>
            <span style={{ width: `${avancePlan}%` }} />
          </div>
          <span className={styles.muted}>Se guarda solo en este celular. No hace falta registrarse.</span>
        </div>
        {PLAN_FAMILIAR.map((tarea) => {
          const hecho = plan.includes(tarea.id);
          return (
            <label key={tarea.id} className={`${styles.check} ${hecho ? styles.checkDone : ""}`}>
              <input type="checkbox" checked={hecho} onChange={() => togglePlan(tarea.id)} />
              {tarea.texto}
            </label>
          );
        })}
        <button type="button" className={styles.btnSecondary} onClick={() => setVista("info")}>
          Leer la guía de preparación
        </button>
      </>
    );
  } else if (vista === "info") {
    contenido = <InfoGuide />;
  } else if (vista === "avisos") {
    const opciones: Array<[keyof typeof avisos, string, string]> = [
      ["alerta", "Paraná en altura de alerta", `Cuando supere ${metros(rio.alerta)} en Barranqueras`],
      ["evacuacion", "Paraná en altura de evacuación", `Cuando supere ${metros(rio.evacuacion)}`],
      ["lluvia", "Lluvia fuerte pronosticada", "Más de 50 mm en las próximas 48 h"],
      ["reportes", "Reportes de vecinos en mi barrio", "Calles anegadas o intransitables"],
      ["novedades", "Novedades de mi comité", "Publicadas por el PTP Chaco"],
    ];
    contenido = (
      <>
        <p className={styles.muted}>Elegí qué querés que te avisemos. Te llega aunque no tengas la app abierta.</p>
        {opciones.map(([key, label, detalle]) => (
          <label key={key} className={styles.toggle}>
            <div>
              <strong>{label}</strong>
              <small>{detalle}</small>
            </div>
            <input
              type="checkbox"
              checked={avisos[key]}
              onChange={(event) => setAvisos({ ...avisos, [key]: event.target.checked })}
            />
          </label>
        ))}
        <span className={styles.sectionTitle}>¿Cómo te avisamos?</span>
        <div className={styles.menu}>
          <button type="button" className={styles.menuItem}>
            <span className={styles.menuIcon}>🔔</span>
            <div>
              <strong>Notificaciones en este celular</strong>
              <small>Activadas</small>
            </div>
          </button>
          <button type="button" className={styles.menuItem}>
            <span className={styles.menuIcon}>💬</span>
            <div>
              <strong>Canal de WhatsApp del PTP Chaco</strong>
              <small>Para quienes no usan la app</small>
            </div>
          </button>
        </div>
        <p className={styles.muted}>
          Estos avisos no reemplazan las alertas oficiales del SMN, Defensa Civil y tu municipio.
        </p>
      </>
    );
  } else if (vista === "ayuda") {
    contenido = <HelpView />;
  } else if (vista === "contacto") {
    contenido = <ContactView location={null} />;
  } else if (vista === "perfil" && usuario) {
    contenido = (
      <>
        <div className={`${styles.card} ${styles.cardStatic}`}>
          <strong>
            {usuario.nombre} {usuario.apellido}
          </strong>
          <span className={styles.cardSub}>
            WhatsApp {usuario.whatsapp} · {usuario.barrio}
          </span>
          <span className={styles.muted}>
            {usuario.esDelegado ? "Sos delegado/a de tu barrio." : "Integrante del comité de emergencia."}
          </span>
        </div>
        <div className={styles.menu}>
          <button type="button" className={styles.menuItem}>
            <span className={styles.menuIcon}>✏️</span>
            <div>
              <strong>Corregir mis datos</strong>
            </div>
          </button>
          <button type="button" className={styles.menuItem} onClick={() => ir("barrio")}>
            <span className={styles.menuIcon}>📄</span>
            <div>
              <strong>Cómo usamos tus datos</strong>
            </div>
          </button>
        </div>
        <button
          type="button"
          className={`${styles.btnPrimary} ${styles.btnRed}`}
          onClick={() => {
            setUsuario(null);
            ir("inicio");
          }}
        >
          Salir del comité y borrar mis datos
        </button>
      </>
    );
  } else {
    const items: Array<[Exclude<Vista, null>, string, string, string]> = [
      ["plan", "🎒", "Plan familiar", `${avancePlan}% preparado`],
      ["info", "📖", "Información", "Guía de preparación ante inundaciones"],
      ["avisos", "🔔", "Avisos", "Qué querés que te avisemos"],
      ["ayuda", "📞", "Teléfonos útiles", "Emergencias y organismos"],
      ["contacto", "✉️", "Contactanos", "Mensajes públicos y privados"],
    ];
    if (usuario) items.push(["perfil", "👤", "Mi perfil", `${usuario.nombre} ${usuario.apellido}`]);
    contenido = (
      <>
        <div className={styles.menu}>
          {items.map(([key, icono, label, detalle]) => (
            <button key={key} type="button" className={styles.menuItem} onClick={() => setVista(key)}>
              <span className={styles.menuIcon}>{icono}</span>
              <div>
                <strong>{label}</strong>
                <small>{detalle}</small>
              </div>
            </button>
          ))}
        </div>
        <div className={styles.credits}>
          <span>Creado por</span>
          <a href="https://ptpchaco.org.ar" target="_blank" rel="noreferrer">
            <Image src={ptpLogo} alt="PTP Chaco" width={132} />
          </a>
        </div>
      </>
    );
  }

  return (
    <div className={styles.app}>
      {banner}
      <header className={styles.header}>
        {volver ? (
          <button type="button" className={styles.back} onClick={volver} aria-label="Volver">
            ‹
          </button>
        ) : null}
        <div className={styles.headerTitle}>
          {titulo}
          {seccion === "inicio" && !vista ? (
            <span className={styles.headerPlace}>
              📍 {BARRIO}, {LOCALIDAD}
            </span>
          ) : null}
        </div>
        {usuario ? (
          <button type="button" className={styles.avatar} onClick={() => ir("mas", "perfil")} aria-label="Mi perfil">
            {usuario.nombre[0]}
            {usuario.apellido[0]}
          </button>
        ) : null}
      </header>

      <nav className={styles.bottomNav} aria-label="Secciones">
        {SECCIONES.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.navItem} ${seccion === item.key ? styles.navItemActive : ""}`}
            aria-current={seccion === item.key ? "page" : undefined}
            onClick={() => ir(item.key)}
          >
            <Icono>{item.icon}</Icono>
            <span>{item.label}</span>
            {item.key === "barrio" && usuario ? <span className={styles.dot}>3</span> : null}
          </button>
        ))}
      </nav>

      <main className={styles.content}>{contenido}</main>
    </div>
  );
}
