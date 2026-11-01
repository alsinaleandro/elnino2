import { getCurrentNeighbor } from "@/lib/neighbors";
import { parseSection } from "./AppNav";
import Home from "./Home";

// La sección va en la URL (/?s=mapa). El vecino que ya completó sus datos y eligió su barrio ve el
// resumen de su Inicio en lugar de la portada; ?bienvenida=1 llega al terminar de sumarse.
export default async function Page({ searchParams }: PageProps<"/">) {
  const { s, bienvenida } = await searchParams;
  const neighbor = await getCurrentNeighbor();
  const member =
    neighbor?.whatsapp && neighbor.barrio
      ? {
          firstName: neighbor.firstName,
          lastName: neighbor.lastName,
          barrio: neighbor.barrio.name,
          localidad: neighbor.barrio.localidad,
        }
      : null;

  return <Home section={parseSection(s)} member={member} welcome={bienvenida === "1"} />;
}
