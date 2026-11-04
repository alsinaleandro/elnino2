// Consulta a OpenStreetMap (Nominatim, geocodificación inversa) en qué barrio y localidad cae un punto.
// Responde en menos de un segundo, pero solo da nombres, sin el polígono: el barrio se le propone al
// vecino y, si lo confirma, se guarda como cualquier barrio escrito por un vecino (con su punto).
// El servidor público pide como mucho una consulta por segundo y un User-Agent que identifique a la
// app; NOMINATIM_URL permite usar otro servidor.
// Datos © OpenStreetMap contributors, licencia ODbL.
const SERVER = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 5_000;
const MIN_INTERVAL_MS = 1_100;

export type NominatimLookup =
  | { status: "ok"; barrio: string | null; localidad: string | null }
  | { status: "unavailable" };

type Address = Record<string, string | undefined>;

// Del más chico al más grande: "neighbourhood" suele ser el barrio; "city_district" es una zona más amplia.
const BARRIO_FIELDS = ["neighbourhood", "quarter", "suburb", "city_district"];
const LOCALIDAD_FIELDS = ["city", "town", "village", "municipality"];

const firstOf = (address: Address, fields: string[]) =>
  fields.map((field) => address[field]?.trim()).find((value) => value) ?? null;

// "Municipio de Resistencia" → "Resistencia".
const cleanLocalidad = (name: string) => name.replace(/^(municipio|municipalidad|comuna|ciudad) de /i, "").trim();

// Las consultas se hacen de a una, con al menos un segundo entre cada una.
let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;

function throttled<T>(task: () => Promise<T>) {
  const result = queue.then(async () => {
    const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequest = Date.now();
    return task();
  });
  queue = result.catch(() => undefined);
  return result;
}

export async function lookupNominatim(lat: number, lon: number): Promise<NominatimLookup> {
  const url = new URL("/reverse", SERVER);
  url.search = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: "jsonv2",
    zoom: "17",
    addressdetails: "1",
    "accept-language": "es",
  }).toString();

  try {
    const address = await throttled(async () => {
      const response = await fetch(url, {
        headers: { "User-Agent": "elnino2 (ptpchaco.org.ar)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return ((await response.json()) as { address?: Address }).address ?? {};
    });
    const localidad = firstOf(address, LOCALIDAD_FIELDS);
    return {
      status: "ok",
      barrio: firstOf(address, BARRIO_FIELDS),
      localidad: localidad ? cleanLocalidad(localidad) : null,
    };
  } catch (error) {
    console.warn("[barrios] Nominatim no respondió:", error instanceof Error ? error.message : error);
    return { status: "unavailable" };
  }
}
