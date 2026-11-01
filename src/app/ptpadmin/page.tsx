import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin, isAdminConfigured } from "@/lib/adminAuth";
import styles from "./admin.module.css";
import LoginForm from "./LoginForm";

// Ingreso al panel de administración. Con la sesión abierta pasa directo a los mensajes públicos.
export const metadata: Metadata = { title: "Administración" };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/ptpadmin/mensajes");

  return (
    <main className={`${styles.page} ${styles.loginPage}`}>
      <header className={styles.header}>
        <h1>Panel de administración</h1>
        <p>Mensajes públicos y novedades de los barrios.</p>
      </header>
      {isAdminConfigured() ? (
        <LoginForm />
      ) : (
        <p className={styles.formError}>
          El panel está desactivado: falta ADMIN_PASSWORD (12 caracteres o más) en el .env.local del servidor.
        </p>
      )}
    </main>
  );
}
