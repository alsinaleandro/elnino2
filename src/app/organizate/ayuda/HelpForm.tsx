"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { publishHelp } from "../actions";
import styles from "../organizate.module.css";

// Nueva publicación de ayuda mutua. La opción de contacto directo aparece solo para "Necesito".
export default function HelpForm({ whatsapp, maxLength }: { whatsapp: string; maxLength: number }) {
  const [state, action, pending] = useActionState(publishHelp, { error: null });
  const [kind, setKind] = useState<"necesito" | "ofrezco">("necesito");

  return (
    <form action={action} className={`${styles.form} ${styles.confirmBox}`}>
      <h2>Publicar en ayuda mutua</h2>
      <fieldset className={styles.choices}>
        <legend>¿Qué querés publicar?</legend>
        <label className={styles.choice}>
          <input
            type="radio"
            name="tipo"
            value="necesito"
            checked={kind === "necesito"}
            onChange={() => setKind("necesito")}
          />
          <span>
            Necesito <small>· pedí ayuda a tus vecinos</small>
          </span>
        </label>
        <label className={styles.choice}>
          <input type="radio" name="tipo" value="ofrezco" checked={kind === "ofrezco"} onChange={() => setKind("ofrezco")} />
          <span>
            Ofrezco <small>· ofrecé lo que puedas</small>
          </span>
        </label>
      </fieldset>

      <label className={styles.field}>
        ¿Qué {kind === "necesito" ? "necesitás" : "ofrecés"}?
        <textarea
          name="texto"
          rows={3}
          required
          minLength={5}
          maxLength={maxLength}
          placeholder={
            kind === "necesito"
              ? "Ej.: ayuda para subir los muebles, lugar para mis animales"
              : "Ej.: tengo canoa, tengo bomba de agua, puedo alojar una familia"
          }
        />
      </label>

      {kind === "necesito" ? (
        <label className={styles.choice}>
          <input type="checkbox" name="contacto" value="1" />
          <span>
            Permitir que me contacten directo
            <br />
            <small>Se muestra tu WhatsApp ({whatsapp}) en esta publicación, para llamarte o escribirte.</small>
          </span>
        </label>
      ) : (
        <p className={styles.muted}>Te van a contactar por el chat del barrio o a través de un delegado.</p>
      )}

      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? "Publicando…" : "Publicar"}
      </button>
      <Link href="/organizate/ayuda" className={styles.btnGhost}>
        Cancelar
      </Link>
    </form>
  );
}
