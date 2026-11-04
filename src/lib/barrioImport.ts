// Carga de todos los barrios de una localidad desde OpenStreetMap (panel /ptpadmin/barrios). Overpass
// puede tardar más de un minuto, más de lo que nginx espera una respuesta: la carga corre en segundo
// plano en el proceso de la app y el panel muestra cómo va. Las cargas viven en memoria: si la app se
// reinicia, se pierde el historial (los barrios ya guardados quedan en la base).
import { importOsmBarrios } from "./barrios";
import { ValidationError } from "./contact";
import { lookupOsmLocalidad } from "./overpass";

export type BarrioImport = {
  id: number;
  localidad: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "ok" | "error";
  message: string | null;
  added: number;
  updated: number;
  // Barrios que en OSM son solo un punto, sin polígono.
  pointOnly: string[];
};

const KEEP = 10;

// En globalThis para que la Server Action y la página vean la misma lista.
const store = globalThis as typeof globalThis & { barrioImports?: BarrioImport[] };
const imports = (store.barrioImports ??= []);

export function listBarrioImports() {
  return [...imports].reverse();
}

// Letras, espacios, guiones y apóstrofos: el nombre va dentro de la consulta de Overpass.
function requireLocalidad(value: unknown) {
  const name = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!/^\p{L}[\p{L} '-]{1,59}$/u.test(name)) {
    throw new ValidationError("Escribí el nombre de la localidad: solo letras, entre 2 y 60.");
  }
  return name;
}

export function startBarrioImport(value: unknown) {
  const localidad = requireLocalidad(value);
  if (imports.some((item) => item.status === "running" && item.localidad.toLowerCase() === localidad.toLowerCase())) {
    throw new ValidationError(`Ya se está cargando ${localidad}.`);
  }

  const job: BarrioImport = {
    id: (imports.at(-1)?.id ?? 0) + 1,
    localidad,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    message: null,
    added: 0,
    updated: 0,
    pointOnly: [],
  };
  imports.push(job);
  if (imports.length > KEEP) imports.splice(0, imports.length - KEEP);

  void run(job);
}

async function run(job: BarrioImport) {
  try {
    const result = await lookupOsmLocalidad(job.localidad, (attempt, waitMs) => {
      job.message = `Overpass está saturado: intento ${attempt} en ${Math.round(waitMs / 1000)} s.`;
    });
    if (result.status === "unavailable") {
      finish(job, "error", "OpenStreetMap (Overpass) siguió saturado durante varios minutos. Probá de nuevo más tarde.");
      return;
    }
    if (result.localidades.length === 0) {
      finish(job, "error", `No encontramos "${job.localidad}" entre los municipios del Chaco en OpenStreetMap. Revisá el nombre (con tildes).`);
      return;
    }

    // Se guarda con el nombre que tiene en OSM ("Resistencia"), como al detectar el barrio de un vecino.
    const localidad = result.localidades.length === 1 ? result.localidades[0] : job.localidad;
    const { added, updated } = importOsmBarrios(result.barrios, localidad);
    job.added = added;
    job.updated = updated;
    job.pointOnly = result.pointOnly;
    finish(
      job,
      "ok",
      result.barrios.length === 0
        ? `${localidad} no tiene barrios con polígono en OpenStreetMap.`
        : `${localidad}: ${result.barrios.length} barrios con polígono.`,
    );
  } catch (error) {
    console.error(`[barrios] Falló la carga de ${job.localidad}:`, error);
    finish(job, "error", "Falló la carga. El detalle quedó en el log del servidor.");
  }
}

function finish(job: BarrioImport, status: "ok" | "error", message: string) {
  job.status = status;
  job.message = message;
  job.finishedAt = new Date().toISOString();
}
