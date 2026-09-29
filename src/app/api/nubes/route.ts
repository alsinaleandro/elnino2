// Horarios disponibles de la imagen satelital GOES-East GeoColor (NOAA) servida por NASA GIBS.
// GOES-East toma una imagen cada 10 minutos; GIBS la publica con ~30-40 min de demora.
// La página usa estos horarios para mostrar la última imagen y animar las últimas horas.

const LAYER = "GOES-East_ABI_GeoColor";
const TILE_MATRIX_SET = "GoogleMapsCompatible_Level7";
const DOMAINS_URL = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi";
const LOOKBACK_MS = 4 * 60 * 60 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { times: string[]; fetchedAt: number } | null = null;

const toIso = (date: Date) => date.toISOString().replace(/\.\d{3}Z$/, "Z");

// El dominio viene como lista de intervalos "inicio/fin/PT10M" separados por comas (hay huecos
// cuando falta alguna imagen), o como horarios sueltos.
function expandDomain(domain: string) {
  const times: string[] = [];

  for (const part of domain.split(",")) {
    const [start, end, period] = part.trim().split("/");
    const stepMinutes = Number(period?.match(/^PT(\d+)M$/)?.[1] ?? 10);

    if (!end) {
      times.push(toIso(new Date(start)));
      continue;
    }

    for (let t = new Date(start).getTime(); t <= new Date(end).getTime(); t += stepMinutes * 60 * 1000) {
      times.push(toIso(new Date(t)));
    }
  }

  return times.filter((time) => !time.startsWith("Invalid")).sort();
}

async function loadTimes() {
  const now = new Date();
  const params = new URLSearchParams({
    SERVICE: "WMTS",
    REQUEST: "DescribeDomains",
    VERSION: "1.0.0",
    LAYER,
    TILEMATRIXSET: TILE_MATRIX_SET,
  });
  // TIME va sin codificar: GIBS rechaza "/" y ":" escapados (%2F, %3A).
  const time = `${toIso(new Date(now.getTime() - LOOKBACK_MS))}/${toIso(now)}`;

  const response = await fetch(`${DOMAINS_URL}?${params}&TIME=${time}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`NASA GIBS respondió HTTP ${response.status}.`);
  }

  const xml = await response.text();
  const domain = xml.match(/<Domain>([^<]+)<\/Domain>/)?.[1];

  if (!domain) {
    throw new Error("NASA GIBS no informó imágenes recientes.");
  }

  // Solo horarios ya pasados: GIBS a veces anuncia el intervalo antes de tener la imagen.
  return expandDomain(domain).filter((time) => new Date(time).getTime() <= now.getTime());
}

export async function GET() {
  try {
    if (!cached || Date.now() - cached.fetchedAt >= CACHE_TTL_MS) {
      cached = { times: await loadTimes(), fetchedAt: Date.now() };
    }
  } catch (error) {
    console.error("[nubes]", error);

    // Sin la lista, la página igual puede mostrar la última imagen ("default").
    if (!cached) {
      return Response.json({ success: true, layer: LAYER, times: [] });
    }
  }

  return Response.json({
    success: true,
    layer: LAYER,
    tileMatrixSet: TILE_MATRIX_SET,
    times: cached?.times ?? [],
  });
}
