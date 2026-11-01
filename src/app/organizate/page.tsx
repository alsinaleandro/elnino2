import type { Metadata } from "next";
import Link from "next/link";
import { getBarrioSummary } from "@/lib/chat";
import { listDelegates } from "@/lib/delegates";
import { isEmailLoginConfigured } from "@/lib/emailAuth";
import { countHelpPosts } from "@/lib/help";
import { newsSummary } from "@/lib/news";
import { isGoogleConfigured } from "@/lib/google";
import { getCurrentNeighbor } from "@/lib/neighbors";
import AppNav, { MenuList } from "../AppNav";
import ConfirmButton from "../ConfirmButton";
import { timeAgo } from "../format";
import { deleteAccount, logout } from "./actions";
import BarrioForm from "./BarrioForm";
import DatosInfo from "./DatosInfo";
import { LoginForm, ResetForm, SignupForm } from "./EmailForms";
import ProfileForm from "./ProfileForm";
import styles from "./organizate.module.css";

// "¡Organizate!" (Idea 1): aceptación de datos, ingreso (con Google o con e-mail y contraseña), datos
// del vecino y barrio. Sin sesión: pantalla de aceptación y después crear la cuenta (?paso=ingreso);
// quien ya se sumó entra por ?paso=entrar, y ?paso=recuperar pide una contraseña nueva. Con sesión
// pero sin WhatsApp: completar datos. Sin barrio (o con ?paso=barrio): elegir barrio. Con todo: el
// menú de Mi barrio.
export const metadata: Metadata = {
  title: "¡Organizate! · Comités de barrio",
  description: "Sumate al comité de emergencia de tu barrio",
};

const ERRORS: Record<string, string> = {
  google: "No pudimos completar el ingreso con Google. Probá de nuevo.",
  aceptar: "Todavía no te sumaste. Leé cómo usamos tus datos y tocá \"Estoy de acuerdo\".",
  config: "El ingreso todavía no está configurado en este servidor.",
};

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// Los enlaces van a una ruta de la API que redirige a Google: tiene que ser un <a> común, no <Link>.
function GoogleButton({ accept }: { accept: boolean }) {
  return (
    <a className={styles.googleBtn} href={accept ? "/api/auth/google?acepto=1" : "/api/auth/google"}>
      <GoogleIcon />
      Continuar con Google
    </a>
  );
}

export default async function OrganizatePage({ searchParams }: PageProps<"/organizate">) {
  const { paso, error, borrado } = await searchParams;
  const neighbor = await getCurrentNeighbor();
  const errorMessage = typeof error === "string" ? ERRORS[error] : undefined;

  const emailLogin = isEmailLoginConfigured();
  const googleLogin = isGoogleConfigured();

  let content;
  if (!neighbor && paso === "ingreso") {
    // Después de "Estoy de acuerdo": acá se crean las cuentas nuevas.
    content = (
      <>
        <h1>Creá tu cuenta</h1>
        <p className={styles.muted}>
          Usamos tu cuenta solo para identificarte. No publicamos nada en tu nombre.
        </p>
        {googleLogin ? <GoogleButton accept /> : null}
        {googleLogin && emailLogin ? <div className={styles.divider}>o</div> : null}
        {emailLogin ? <SignupForm /> : null}
        {!googleLogin && !emailLogin ? <p className={styles.error}>{ERRORS.config}</p> : null}
        <p className={styles.muted}>
          ¿Ya tenés cuenta? <Link href="/organizate?paso=entrar">Entrá</Link>.
        </p>
        <Link href="/organizate" className={styles.btnGhost}>
          Volver
        </Link>
      </>
    );
  } else if (!neighbor && paso === "entrar") {
    // Para quien ya se sumó: con Google o con e-mail y contraseña.
    content = (
      <>
        <h1>Entrá</h1>
        {googleLogin ? <GoogleButton accept={false} /> : null}
        {googleLogin && emailLogin ? <div className={styles.divider}>o</div> : null}
        {emailLogin ? (
          <>
            <LoginForm />
            <p className={styles.muted}>
              <Link href="/organizate?paso=recuperar">¿Olvidaste tu contraseña?</Link> ¿Entrabas con Google y querés
              una contraseña? Pedila ahí con el mismo e-mail.
            </p>
          </>
        ) : null}
        <p className={styles.muted}>
          ¿Todavía no te sumaste? <Link href="/organizate">Leé cómo usamos tus datos</Link>.
        </p>
      </>
    );
  } else if (!neighbor && paso === "recuperar") {
    content = (
      <>
        <h1>Elegí una contraseña nueva</h1>
        <p className={styles.muted}>Escribí el e-mail de tu cuenta y te mandamos un link.</p>
        {emailLogin ? <ResetForm /> : <p className={styles.error}>{ERRORS.config}</p>}
        <Link href="/organizate?paso=entrar" className={styles.btnGhost}>
          Volver
        </Link>
      </>
    );
  } else if (!neighbor) {
    content = (
      <>
        {borrado ? (
          <p className={styles.success} role="status">
            Borramos tus datos y saliste del comité.
          </p>
        ) : null}
        <h1>Sumate al comité de emergencia de tu barrio</h1>
        <p className={styles.notState}>
          Esta iniciativa <strong>no es del Estado</strong>: es un esfuerzo de organización vecinal coordinado por el{" "}
          <strong>PTP Chaco</strong>.
        </p>
        <p>
          Cuando el agua sube, los que primero ayudan son los vecinos. Esta sección es para organizarnos barrio por
          barrio: conocernos, avisarnos y estar preparados.
        </p>
        <p className={styles.muted}>
          ¿Ya te sumaste? <Link href="/organizate?paso=entrar">Entrá a tu cuenta</Link>.
        </p>
        <DatosInfo />
        <p>
          Al tocar &quot;Estoy de acuerdo&quot; confirmás que <strong>tenés 18 años o más</strong> y que leíste esta
          información.
        </p>
        <Link href="/organizate?paso=ingreso" className={styles.btnPrimary}>
          Estoy de acuerdo
        </Link>
        <Link href="/" className={styles.btnGhost}>
          Ahora no
        </Link>
      </>
    );
  } else if (!neighbor.whatsapp) {
    content = (
      <>
        <h1>Tus datos</h1>
        <p className={styles.muted}>Entraste como {neighbor.email}. Revisá tu nombre y agregá tu WhatsApp.</p>
        <ProfileForm
          firstName={neighbor.firstName}
          lastName={neighbor.lastName}
          whatsapp=""
          submitLabel="Sumarme al comité"
        />
      </>
    );
  } else if (!neighbor.barrio || paso === "barrio") {
    content = (
      <>
        <h1>¿En qué barrio vivís?</h1>
        {neighbor.barrio ? (
          <p className={styles.muted}>
            Hoy figurás en <strong>{neighbor.barrio.name}</strong>.{" "}
            <Link href="/organizate">No cambiarlo</Link>
          </p>
        ) : null}
        {neighbor.barrio && neighbor.delegateSince ? (
          <p className={styles.notState}>
            Sos delegado/a de {neighbor.barrio.name}. Si cambiás de barrio dejás de serlo, y quienes te siguen quedan sin
            delegado.
          </p>
        ) : null}
        <BarrioForm current={neighbor.barrio} />
      </>
    );
  } else {
    // Menú del barrio, como en la maqueta: novedades, chat, delegados y ayuda mutua.
    const summary = getBarrioSummary(neighbor.barrio.id);
    const news = newsSummary(neighbor.barrio.id);
    const help = countHelpPosts(neighbor.barrio.id);
    const delegates = listDelegates(neighbor.barrio.id, neighbor);
    const followed = delegates.find((delegate) => delegate.followedByMe);
    const isDelegate = neighbor.delegateSince !== null;
    content = (
      <>
        <h1>Mi barrio</h1>
        <div className={styles.barrioHead}>
          <strong>{neighbor.barrio.name}</strong>
          <span>
            Comité de emergencia{neighbor.barrio.localidad ? ` · ${neighbor.barrio.localidad}` : ""} ·{" "}
            {summary.neighbors} {summary.neighbors === 1 ? "vecino" : "vecinos"} · {delegates.length}{" "}
            {delegates.length === 1 ? "delegado" : "delegados"}
          </span>
        </div>
        <MenuList
          items={[
            {
              href: "/organizate/novedades",
              icon: "📢",
              label: "Novedades",
              detail: news.lastAt
                ? `${news.count} ${news.count === 1 ? "novedad" : "novedades"} · la última ${timeAgo(news.lastAt)}`
                : "Del PTP Chaco y de los delegados del barrio",
            },
            {
              href: "/organizate/chat",
              icon: "💬",
              label: "Chat del barrio",
              detail: summary.lastAuthor
                ? `${summary.messages} ${summary.messages === 1 ? "mensaje" : "mensajes"} · último de ${summary.lastAuthor}`
                : "Todavía no hay mensajes",
            },
            {
              href: "/organizate/delegados",
              icon: "🙋",
              label: "Delegados",
              detail: isDelegate
                ? `Sos delegado/a · ${delegates.length} ${delegates.length === 1 ? "delegado" : "delegados"} en el barrio`
                : followed
                  ? `Seguís a ${followed.name}`
                  : delegates.length > 0
                    ? `No seguís a ningún delegado · hay ${delegates.length}`
                    : "Todavía no hay delegados · postulate",
            },
            {
              href: "/organizate/ayuda",
              icon: "🤝",
              label: "Ayuda mutua",
              detail:
                help.necesito + help.ofrezco > 0
                  ? `${help.necesito} ${help.necesito === 1 ? "necesita" : "necesitan"} · ${help.ofrezco} ${
                      help.ofrezco === 1 ? "ofrece" : "ofrecen"
                    }`
                  : "Ofrecé o pedí ayuda a tus vecinos",
            },
          ]}
        />
        <p className={styles.muted}>
          En el chat te ven como{" "}
          <strong>
            {neighbor.firstName} {neighbor.lastName[0]}.
          </strong>{" "}
          {isDelegate
            ? "Como sos delegado/a, tu nombre y tu WhatsApp se publican para los vecinos de tu barrio. Tu e-mail no lo ve nadie."
            : "Tu WhatsApp y tu e-mail no los ve ningún vecino."}
        </p>
        <Link href="/organizate?paso=barrio" className={styles.btnGhost}>
          Cambiar mi barrio
        </Link>

        <details className={styles.details}>
          <summary>Cómo usamos tus datos</summary>
          <DatosInfo />
        </details>

        <form action={logout} className={styles.form}>
          <button type="submit" className={styles.btnSecondary}>
            Cerrar sesión
          </button>
        </form>
        <form action={deleteAccount} className={styles.form}>
          <ConfirmButton
            className={styles.btnDanger}
            message="¿Borrar tus datos y salir del comité? No se puede deshacer."
          >
            Borrar mis datos y salir del comité
          </ConfirmButton>
        </form>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        {errorMessage ? (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        ) : null}
        {content}
      </main>
    </div>
  );
}
