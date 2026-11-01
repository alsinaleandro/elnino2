import { MESSAGE_MAX, PLACE_MAX, TITLE_MAX } from "@/lib/news";
import styles from "./newsFields.module.css";

// Campos de una novedad: los usan los delegados (Mi barrio → Novedades) y el PTP (panel de
// administración). Fecha, hora y lugar son para anunciar una reunión o asamblea, y son opcionales.
export default function NewsFields() {
  return (
    <>
      <label className={styles.field}>
        Título
        <input name="titulo" required minLength={3} maxLength={TITLE_MAX} placeholder="Ej.: Asamblea del barrio" />
      </label>
      <label className={styles.field}>
        Texto
        <textarea
          name="texto"
          rows={4}
          required
          minLength={10}
          maxLength={MESSAGE_MAX}
          placeholder="Ej.: Nos juntamos para organizar la limpieza de desagües antes de las lluvias."
        />
      </label>
      <fieldset className={styles.event}>
        <legend>¿Es una reunión o asamblea? (opcional)</legend>
        <div className={styles.eventRow}>
          <label className={styles.field}>
            Fecha
            <input type="date" name="fecha" />
          </label>
          <label className={styles.field}>
            Hora
            <input type="time" name="hora" />
          </label>
        </div>
        <label className={styles.field}>
          Lugar
          <input name="lugar" maxLength={PLACE_MAX} placeholder="Ej.: Club del barrio, Av. Siempre Viva 123" />
        </label>
      </fieldset>
    </>
  );
}
