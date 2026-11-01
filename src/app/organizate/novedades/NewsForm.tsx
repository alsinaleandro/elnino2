"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { publishNews } from "../actions";
import styles from "../organizate.module.css";

// Formulario del delegado para publicar una novedad en su barrio. Los campos (NewsFields) vienen
// armados desde la página del servidor.
export default function NewsForm({ barrio, children }: { barrio: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(publishNews, { error: null });

  return (
    <form action={action} className={`${styles.form} ${styles.confirmBox}`}>
      <h2>Publicar una novedad</h2>
      <p className={styles.muted}>
        La ven todos los vecinos del comité de {barrio}, con tu nombre como delegado/a.
      </p>
      {children}
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? "Publicando…" : "Publicar"}
      </button>
      <Link href="/organizate/novedades" className={styles.btnGhost}>
        Cancelar
      </Link>
    </form>
  );
}
