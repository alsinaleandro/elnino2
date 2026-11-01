"use client";

import { useActionState } from "react";
import { adminLogin } from "./actions";
import styles from "./admin.module.css";

export default function LoginForm() {
  const [state, action, pending] = useActionState(adminLogin, { error: null });

  return (
    <form action={action} className={styles.newsForm}>
      <label className={styles.newsField}>
        Contraseña
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          autoFocus
          className={styles.input}
        />
      </label>
      {state.error ? (
        <p className={styles.formError} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
