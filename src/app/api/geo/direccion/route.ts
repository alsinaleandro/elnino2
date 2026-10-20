import { NextRequest, NextResponse } from "next/server";

// Busca una dirección (localidad, calle y altura) del AMGR y devuelve sus coordenadas.
// Usa Nominatim (OpenStreetMap): la API Georef del Estado no tiene alturas cargadas para Chaco.
// Política de uso de Nominatim: como máximo 1 consulta por segundo y un User-Agent propio.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "elnino2/1.0 (https://elnino.ptpchaco.org.ar)";
// Rectángulo que cubre Resistencia, Barranqueras, Fontana y Puerto Vilelas (oeste, norte, este, sur).
const AMGR_VIEWBOX = "-59.12,-27.34,-58.84,-27.56";
const MIN_INTERVAL_MS = 1100;
const CACHE_MAX_ENTRIES = 500;

// Las mismas que ofrece el buscador de la pestaña Mapa.
const LOCALIDADES = ["Resistencia", "Barranqueras", "Fontana", "Puerto Vilelas"];

type NominatimResult = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

type GeocodeResult = {
  latitude: number;
  longitude: number;
  label: string;
  // false: no figura la altura en OpenStreetMap y se devuelve un punto de la calle.
  exact: boolean;
};

const cache = new Map<string, GeocodeResult | null>();
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

// Las consultas a Nominatim se hacen de a una y separadas por al menos MIN_INTERVAL_MS.
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function searchNominatim(params: Record<string, string>) {
  const url = new URL(NOMINATIM_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("viewbox", AMGR_VIEWBOX);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");

  const response = await throttled(() =>
    fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }),
  );

  if (!response.ok) {
    throw new Error(`El servicio de direcciones respondió HTTP ${response.status}.`);
  }

  return (await response.json()) as NominatimResult[];
}

// "Av. 9 de Julio" y "Avenida 9 de julio" se comparan igual: sin tildes, mayúsculas ni prefijos.
const normalizeStreet = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(avenida|av|avda|calle|pasaje|pje|diagonal)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Nominatim a veces devuelve otra calle parecida: solo se aceptan resultados con el mismo nombre.
function findStreetMatch(results: NominatimResult[], street: string) {
  const wanted = normalizeStreet(street);
  return results.find((result) => {
    const road = normalizeStreet(result.address?.road ?? "");
    return road !== "" && (road.includes(wanted) || wanted.includes(road));
  });
}

function toResult(match: NominatimResult, exact: boolean, localidad: string): GeocodeResult {
  const road = match.address?.road ?? "";
  const number = exact ? match.address?.house_number ?? "" : "";
  return {
    latitude: Number(match.lat),
    longitude: Number(match.lon),
    label: [`${road} ${number}`.trim(), localidad].filter(Boolean).join(", "),
    exact,
  };
}

async function geocode(localidad: string, calle: string, altura: string) {
  const street = calle.replace(/\bav(da)?\.?\s/gi, "Avenida ");

  if (altura) {
    const withNumber = findStreetMatch(
      await searchNominatim({ street: `${altura} ${street}`, city: localidad }),
      street,
    );
    if (withNumber?.address?.house_number === altura) {
      return toResult(withNumber, true, localidad);
    }
    if (withNumber) {
      return toResult(withNumber, false, localidad);
    }
  }

  const streetOnly =
    findStreetMatch(await searchNominatim({ street, city: localidad }), street) ??
    findStreetMatch(await searchNominatim({ q: `${street}, ${localidad}` }), street);

  return streetOnly ? toResult(streetOnly, false, localidad) : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const localidad = LOCALIDADES.find((name) => name === searchParams.get("localidad"));
  const calle = (searchParams.get("calle") ?? "").trim();
  const altura = (searchParams.get("altura") ?? "").trim();

  if (!localidad || calle.length < 2 || calle.length > 80 || !/^\d{0,5}$/.test(altura)) {
    return NextResponse.json(
      { success: false, error: "Indicá una localidad del AMGR, el nombre de la calle y la altura (solo números)." },
      { status: 400 },
    );
  }

  const key = `${localidad}|${normalizeStreet(calle)}|${altura}`;

  try {
    let result = cache.get(key);
    if (result === undefined) {
      result = await geocode(localidad, calle, altura);
      if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(key, result);
    }

    if (!result) {
      return NextResponse.json(
        { success: false, error: `No encontramos "${calle}" en ${localidad}. Revisá el nombre o tocá el mapa para señalar el punto.` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[geo/direccion]", error);
    return NextResponse.json(
      { success: false, error: "No se pudo consultar el servicio de direcciones. Intentá de nuevo en unos segundos." },
      { status: 502 },
    );
  }
}
