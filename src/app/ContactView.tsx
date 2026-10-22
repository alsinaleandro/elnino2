"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import styles from "./page.module.css";

// Pestaña Contactanos: un formulario para dejar un mensaje público (se muestra abajo, en la misma
// pestaña) o uno privado (llega por e-mail al equipo), los dos con captcha. Los mensajes públicos
// llevan la ubicación GPS que la app ya obtuvo, si el visitante la compartió.

type Location = { latitude: number; longitude: number; accuracy: number | null };
type Kind = "publico" | "privado";
type Topic = "zona" | "sugerencia";
type PublicMessage = { id: number; author: string; topic: Topic; message: string; createdAt: string };

const TOPICS: Array<{ key: Topic; prompt: string }> = [
  { key: "zona", prompt: "En mi zona el problema es..." },
  { key: "sugerencia", prompt: "Sugerencias para mejorar la app..." },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

type Captcha = { id: string; svg: string };

const fetchCaptcha = (): Promise<Captcha | null> =>
  fetch("/api/captcha", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

function useCaptcha() {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);

  useEffect(() => {
    fetchCaptcha().then(setCaptcha);
  }, []);

  const reload = useCallback(() => {
    setCaptcha(null);
    fetchCaptcha().then(setCaptcha);
  }, []);

  return { captcha, reload };
}

function ContactForm({
  kind,
  location,
  onPublished,
}: {
  kind: Kind;
  location: Location | null;
  onPublished: (messages: PublicMessage[]) => void;
}) {
  const isPublic = kind === "publico";
  const [topic, setTopic] = useState<Topic>("zona");
  const [status, setStatus] = useState<{ sending: boolean; error: string | null; done: boolean }>({
    sending: false,
    error: null,
    done: false,
  });
  const { captcha, reload } = useCaptcha();
  const prompt = isPublic ? TOPICS.find((item) => item.key === topic)!.prompt : "Escribí tu mensaje...";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setStatus({ sending: true, error: null, done: false });

    try {
      const response = await fetch(isPublic ? "/api/mensajes" : "/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          ...(isPublic ? { topic, location } : {}),
          captchaId: captcha?.id,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "No se pudo enviar el mensaje.");

      form.reset();
      if (payload?.messages) onPublished(payload.messages);
      setStatus({ sending: false, error: null, done: true });
    } catch (error) {
      setStatus({
        sending: false,
        error: error instanceof Error ? error.message : "No se pudo enviar el mensaje.",
        done: false,
      });
    } finally {
      // Cada captcha sirve para un solo intento.
      const answer = form.elements.namedItem("captchaAnswer");
      if (answer instanceof HTMLInputElement) answer.value = "";
      reload();
    }
  };

  return (
    <form className={styles.contactForm} onSubmit={submit}>
      {isPublic ? (
        <div className={styles.contactTopics} role="radiogroup" aria-label="Tema del mensaje">
          {TOPICS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={topic === item.key}
              className={`${styles.contactTopic} ${topic === item.key ? styles.contactTopicActive : ""}`}
              onClick={() => setTopic(item.key)}
            >
              {item.prompt}
            </button>
          ))}
        </div>
      ) : null}

      <label className={styles.contactWide}>
        Mensaje
        <textarea name="message" required minLength={10} maxLength={isPublic ? 1000 : 2000} rows={5} placeholder={prompt} />
      </label>

      <label>
        Nombre
        <input name="firstName" required minLength={2} maxLength={40} autoComplete="given-name" />
      </label>
      <label>
        Apellido
        <input name="lastName" required minLength={2} maxLength={40} autoComplete="family-name" />
      </label>
      {isPublic ? (
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            inputMode="tel"
            required
            pattern="\+?[0-9 \(\)\-]{8,20}"
            placeholder="362 4123456"
            autoComplete="tel"
          />
        </label>
      ) : null}
      <label className={isPublic ? undefined : styles.contactWide}>
        E-mail
        <input name="email" type="email" required maxLength={120} autoComplete="email" />
      </label>

      <div className={`${styles.contactCaptcha} ${styles.contactWide}`}>
        <span className={styles.contactCaptchaLabel}>Para comprobar que no sos un robot, resolvé la suma</span>
        <div className={styles.contactCaptchaRow}>
          {captcha ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.svg)}`}
              width={160}
              height={56}
              alt="Suma a resolver"
            />
          ) : (
            <span className={styles.contactCaptchaLoading}>Cargando...</span>
          )}
          <input
            name="captchaAnswer"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            required
            maxLength={3}
            aria-label="Resultado de la suma"
            placeholder="?"
          />
          <button type="button" className={styles.contactCaptchaReload} onClick={reload}>
            Otra
          </button>
        </div>
      </div>

      <p className={`${styles.contactNote} ${styles.contactWide}`}>
        {isPublic
          ? `Se publica tu nombre y la inicial del apellido. Tu WhatsApp, e-mail${
              location ? " y la ubicación GPS de tu celular" : ""
            } se guardan para poder contactarte y ubicar el problema, pero no se muestran.`
          : "El mensaje llega por e-mail al equipo de la app y no se publica."}
      </p>

      {status.error ? <p className={`${styles.error} ${styles.contactWide}`}>{status.error}</p> : null}
      {status.done ? (
        <p className={`${styles.status} ${styles.contactWide}`}>
          {isPublic ? "¡Gracias! Tu mensaje ya está publicado." : "¡Gracias! Recibimos tu mensaje."}
        </p>
      ) : null}

      <button type="submit" className={`${styles.addressButton} ${styles.contactWide}`} disabled={status.sending || !captcha}>
        {status.sending ? "Enviando..." : isPublic ? "Publicar mensaje" : "Enviar mensaje privado"}
      </button>
    </form>
  );
}

export default function ContactView({ location }: { location: Location | null }) {
  const [kind, setKind] = useState<Kind>("publico");
  const [messages, setMessages] = useState<PublicMessage[] | null>(null);
  const [messagesError, setMessagesError] = useState(false);

  useEffect(() => {
    fetch("/api/mensajes", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload) => setMessages(payload.messages))
      .catch(() => setMessagesError(true));
  }, []);

  return (
    <div className={styles.info}>
      <header className={styles.infoHeader}>
        <h2>Contactanos</h2>
        <p>
          Contanos qué problemas hay en tu barrio o zona, o cómo mejorar la app. Podés dejar un mensaje público, que
          ven todos, o uno privado para el equipo.
        </p>
      </header>

      <div className={styles.contactKinds} role="tablist" aria-label="Tipo de mensaje">
        {(
          [
            ["publico", "Mensaje público"],
            ["privado", "Mensaje privado"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={kind === key}
            className={`${styles.contactKind} ${kind === key ? styles.contactKindActive : ""}`}
            onClick={() => setKind(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className={styles.infoCard}>
        <ContactForm key={kind} kind={kind} location={location} onPublished={setMessages} />
      </section>

      <section className={styles.infoCard}>
        <h3>Mensajes de los vecinos</h3>
        {messagesError ? (
          <p className={styles.contactEmpty}>No se pudieron cargar los mensajes.</p>
        ) : messages === null ? (
          <p className={styles.contactEmpty}>Cargando mensajes...</p>
        ) : messages.length === 0 ? (
          <p className={styles.contactEmpty}>Todavía no hay mensajes. ¡Dejá el primero!</p>
        ) : (
          <ul className={styles.contactMessages}>
            {messages.map((item) => (
              <li key={item.id} className={styles.contactMessage}>
                <div className={styles.contactMessageMeta}>
                  <strong>{item.author}</strong>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <span className={styles.contactMessageTopic}>
                  {item.topic === "zona" ? "Problema en la zona" : "Sugerencia"}
                </span>
                <p>{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
