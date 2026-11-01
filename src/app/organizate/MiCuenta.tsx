import ConfirmButton from "../ConfirmButton";
import { deleteAccount, logout } from "./actions";
import DatosInfo from "./DatosInfo";
import styles from "./organizate.module.css";

// Al pie del Inicio del vecino: "Cómo usamos tus datos", cerrar sesión y borrar la cuenta.
export default function MiCuenta() {
  return (
    <div className={styles.account}>
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
        <ConfirmButton className={styles.btnDanger} message="¿Borrar tus datos y salir del comité? No se puede deshacer.">
          Borrar mis datos y salir del comité
        </ConfirmButton>
      </form>
    </div>
  );
}
