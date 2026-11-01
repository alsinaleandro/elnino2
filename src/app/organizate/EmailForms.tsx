"use client";

import { useActionState } from "react";
import { choosePassword, emailLogin, requestResetLink, requestSignupLink, type EmailState } from "./actions";
import styles from "./organizate.module.css";

// Formularios del ingreso con e-mail y contraseña (emailAuth.ts).

const initial: EmailState = { error: null };

function ErrorMessage({ state }: { state: EmailState }) {
  return state.error ? (
    <p className={styles.error} role="alert">
      {state.error}
    </p>
  ) : null;
}

function EmailField() {
  return (
    <label className={styles.field}>
      E-mail
      <input type="email" name="email" autoComplete="email" required maxLength={120} placeholder="tu@email.com" />
    </label>
  );
}

// Crear la cuenta: se manda un link para elegir la contraseña.
export function SignupForm() {
  const [state, action, pending] = useActionState(requestSignupLink, initial);

  if (state.sent) {
    return (
      <p className={styles.success} role="status">
        Te mandamos un e-mail con un link para elegir tu contraseña. Revisá también la carpeta de spam. El link vence
        en 24 horas.
      </p>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <EmailField />
      <ErrorMessage state={state} />
      <button type="submit" className={styles.btnSecondary} disabled={pending}>
        {pending ? "Mandando…" : "Crear cuenta con e-mail"}
      </button>
      <p className={styles.muted}>Te mandamos un link para que elijas tu contraseña.</p>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(emailLogin, initial);

  return (
    <form action={action} className={styles.form}>
      <EmailField />
      <label className={styles.field}>
        Contraseña
        <input type="password" name="password" autoComplete="current-password" required maxLength={128} />
      </label>
      <ErrorMessage state={state} />
      <button type="submit" className={styles.btnSecondary} disabled={pending}>
        {pending ? "Entrando…" : "Entrar con e-mail"}
      </button>
    </form>
  );
}

// "¿Olvidaste tu contraseña?": la respuesta es la misma haya o no una cuenta con ese e-mail.
export function ResetForm() {
  const [state, action, pending] = useActionState(requestResetLink, initial);

  if (state.sent) {
    return (
      <p className={styles.success} role="status">
        Si hay una cuenta con ese e-mail, te llegó un link para elegir una contraseña nueva. Revisá también la carpeta de
        spam. El link vence en 1 hora.
      </p>
    );
  }

  return (
    <form action={action} className={styles.form}>
      <EmailField />
      <ErrorMessage state={state} />
      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? "Mandando…" : "Mandame el link"}
      </button>
    </form>
  );
}

// Desde el link del e-mail.
export function ChoosePasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(choosePassword, initial);

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="token" value={token} />
      {/* Para que el gestor de contraseñas del celular sepa a qué cuenta corresponde. */}
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <label className={styles.field}>
        Contraseña nueva
        <input type="password" name="password" autoComplete="new-password" required minLength={8} maxLength={128} />
      </label>
      <label className={styles.field}>
        Repetila
        <input type="password" name="repeat" autoComplete="new-password" required minLength={8} maxLength={128} />
      </label>
      <p className={styles.muted}>Al menos 8 caracteres. Mejor si es una frase que no uses en otro lado.</p>
      <ErrorMessage state={state} />
      <button type="submit" className={styles.btnPrimary} disabled={pending}>
        {pending ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}
