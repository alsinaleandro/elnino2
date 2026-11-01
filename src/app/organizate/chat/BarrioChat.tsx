"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "@/lib/chat";
import styles from "../organizate.module.css";

// Chat del barrio: arranca con los últimos mensajes (los trae la página) y mientras está a la vista
// consulta los nuevos cada pocos segundos. Al volver a la pestaña se consulta enseguida.

const POLL_MS = 5000;

const TIME = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "numeric" });

function formatTime(iso: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? TIME.format(date) : `${DAY.format(date)} ${TIME.format(date)}`;
}

// Agrega los mensajes nuevos sin repetir los que ya están.
const merge = (current: ChatMessage[], incoming: ChatMessage[]) => {
  const known = new Set(current.map((message) => message.id));
  const fresh = incoming.filter((message) => !known.has(message.id));
  return fresh.length > 0 ? [...current, ...fresh] : current;
};

export default function BarrioChat({ initial, maxLength }: { initial: ChatMessage[]; maxLength: number }) {
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef(initial.at(-1)?.id ?? 0);
  // Se baja al último mensaje al abrir, al mandar uno, y al llegar nuevos solo si el vecino ya
  // estaba abajo de todo (si subió a leer, no se lo mueve).
  const stickToEndRef = useRef(true);

  useEffect(() => {
    lastIdRef.current = messages.at(-1)?.id ?? 0;
    if (stickToEndRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    const onScroll = () => {
      stickToEndRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/chat?despues=${lastIdRef.current}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { messages: ChatMessage[] };
        if (!cancelled) setMessages((current) => merge(current, payload.messages));
      } catch {
        // Sin conexión: se vuelve a intentar en la próxima vuelta.
      }
    };

    const timer = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, despues: lastIdRef.current }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "No se pudo mandar el mensaje.");
      stickToEndRef.current = true;
      setMessages((current) => merge(current, payload.messages));
      setText("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo mandar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <p className={styles.muted}>
        Chat público del barrio: lo leen todos los vecinos del comité. No hay mensajes privados.
      </p>

      <div className={styles.chat} aria-live="polite">
        {messages.length === 0 ? (
          <p className={styles.muted}>Todavía no hay mensajes. ¡Escribí el primero!</p>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`${styles.msg} ${message.mine ? styles.msgMine : ""}`}>
              <div className={styles.msgAuthor}>
                {message.mine ? "Vos" : message.author}
                {message.delegate ? <span className={styles.delegateTag}>Delegado/a</span> : null}
                <span className={styles.msgTime}>{formatTime(message.createdAt)}</span>
              </div>
              {message.message}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <form className={styles.chatInput} onSubmit={send}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Escribí al barrio..."
          aria-label="Mensaje para el barrio"
          maxLength={maxLength}
          enterKeyHint="send"
        />
        <button type="submit" className={styles.btnSend} disabled={sending || !text.trim()}>
          {sending ? "..." : "Enviar"}
        </button>
      </form>
    </>
  );
}
