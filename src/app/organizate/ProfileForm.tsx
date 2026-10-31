"use client";

import { useActionState } from "react";
import { saveProfile } from "./actions";
import styles from "./organizate.module.css";

// Nombre, apellido y WhatsApp del vecino. Se usa para completar los datos después de entrar con
// Google y para corregirlos más adelante.
export default function ProfileForm({
  firstName,
  lastName,
  whatsapp,
  submitLabel,
}: {
  firstName: string;
  lastName: string;
  whatsapp: string;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(saveProfile, { error: null });

  return (
    <form action={action} className={styles.form}>
      <label className={styles.field}>
        Nombre
        <input name="firstName" defaultValue={firstName} autoComplete="given-name" required maxLength={40} />
      </label>
      <label className={styles.field}>
        Apellido
        <input name="lastName" defaultValue={lastName} autoComplete="family-name" required maxLength={40} />
      </label>
      <label className={styles.field}>
        WhatsApp
        <input
          name="whatsapp"
          defaultValue={whatsapp}
          inputMode="tel"
          autoComplete="tel"
          placeholder="362 4123456"
          required
          maxLength={20}
        />
      </label>
      <p className={styles.muted}>Tu WhatsApp no lo ve ningún otro vecino.</p>
      {state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
