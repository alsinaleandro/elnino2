import type { Metadata } from "next";
import Link from "next/link";
import { checkPasswordLink } from "@/lib/emailAuth";
import AppNav from "../../AppNav";
import { ChoosePasswordForm } from "../EmailForms";
import styles from "../organizate.module.css";

// Página del link que llega por e-mail: el vecino elige su contraseña (al crear la cuenta o al
// olvidarla). El token va en la URL, así que no se manda a otros sitios.
export const metadata: Metadata = {
  title: "Elegí tu contraseña · ¡Organizate!",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ClavePage({ searchParams }: PageProps<"/organizate/clave">) {
  const { token } = await searchParams;
  const link = checkPasswordLink(token);

  return (
    <div className={styles.page}>
      <AppNav active="barrio" />
      <main className={styles.card}>
        {link && typeof token === "string" ? (
          <>
            <h1>{link.purpose === "alta" ? "Elegí tu contraseña" : "Elegí una contraseña nueva"}</h1>
            <p className={styles.muted}>
              Para entrar con <strong>{link.email}</strong>.
            </p>
            <ChoosePasswordForm token={token} email={link.email} />
          </>
        ) : (
          <>
            <h1>El link venció o ya se usó</h1>
            <p>Los links sirven una sola vez y vencen a las pocas horas.</p>
            <Link href="/organizate?paso=recuperar" className={styles.btnPrimary}>
              Pedir un link nuevo
            </Link>
            <Link href="/organizate" className={styles.btnGhost}>
              Volver
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
