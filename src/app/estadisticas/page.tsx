import { redirect } from "next/navigation";

// Las estadísticas pasaron al panel de administración (con contraseña).
export default function Estadisticas() {
  redirect("/ptpadmin/estadisticas");
}
