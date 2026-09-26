import { inflateRawSync } from "node:zlib";

// Pronóstico de lluvias para Resistencia combinando dos fuentes:
// - SMN (Servicio Meteorológico Nacional): pronóstico a 5 días de su modelo numérico para la
//   estación RESISTENCIA_AERO, publicado como datos abiertos (lluvia en mm cada 3 h).
// - Open-Meteo: combina modelos de centros meteorológicos (ECMWF, NOAA/GFS, DWD, etc.) y aporta
//   la probabilidad de lluvia y 7 días de pronóstico. Licencia CC BY 4.0 (requiere atribución).

const SMN_URL = "https://ssl.smn.gob.ar/dpd/zipopendata.php?dato=pron5d";
const SMN_STATION = "RESISTENCIA_AERO";
const TIMEZONE = "America/Argentina/Cordoba";
const OPEN_METEO_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=-27.4514&longitude=-58.9867" +
  "&daily=precipitation_sum,precipitation_probability_max,precipitation_hours,weather_code," +
  "temperature_2m_max,temperature_2m_min" +
  `&timezone=${encodeURIComponent(TIMEZONE)}&forecast_days=7`;

// Los pronósticos se actualizan pocas veces por día: se guardan 1 h en memoria y, si una fuente
// falla, se sigue mostrando la última copia buena durante 12 h.
const CACHE_TTL_MS = 60 * 60 * 1000;
const STALE_MAX_MS = 12 * 60 * 60 * 1000;

type SmnDay = { date: string; mm: number };
type OpenMeteoDay = {
  date: string;
  mm: number | null;
  probability: number | null;
  hours: number | null;
  weatherCode: number | null;
  tMin: number | null;
  tMax: number | null;
};

type SourceResult<T> = { ok: true; data: T; fetchedAt: number; stale: boolean } | { ok: false; error: string };

async function fetchWithTimeout(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

// ---------- SMN ----------

// Extrae el primer archivo de un ZIP usando el directorio central (sin dependencias externas).
function unzipFirstFile(zip: Buffer) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) {
    throw new Error("El archivo del SMN no es un ZIP válido.");
  }

  const centralDirectory = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(centralDirectory) !== 0x02014b50) {
    throw new Error("ZIP del SMN sin directorio central.");
  }

  const method = zip.readUInt16LE(centralDirectory + 10);
  const compressedSize = zip.readUInt32LE(centralDirectory + 20);
  const localHeader = zip.readUInt32LE(centralDirectory + 42);
  const dataStart = localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
  const data = zip.subarray(dataStart, dataStart + compressedSize);

  if (method === 0) {
    return data;
  }
  if (method === 8) {
    return inflateRawSync(data);
  }
  throw new Error(`Compresión ZIP no soportada (${method}).`);
}

const MONTHS: Record<string, string> = {
  ENE: "01", FEB: "02", MAR: "03", ABR: "04", MAY: "05", JUN: "06",
  JUL: "07", AGO: "08", SEP: "09", OCT: "10", NOV: "11", DIC: "12",
};

// El bloque de cada estación tiene filas como: "  29/SEP/2026 15Hs.   18.1   170 |   9   1.1"
// (fecha y hora local, temperatura, viento dir|km/h, lluvia en mm de las 3 h).
function parseSmnStation(text: string, station: string): SmnDay[] {
  const start = text.search(new RegExp(`^\\s*${station}\\s*$`, "m"));
  if (start < 0) {
    throw new Error(`El pronóstico del SMN no incluye la estación ${station}.`);
  }

  const totals = new Map<string, number>();
  const rowPattern = /^\s*(\d{2})\/([A-Z]{3})\/(\d{4})\s+\d{2}Hs\.\s+-?[\d.]+\s+\d+\s*\|\s*\d+\s+([\d.]+)\s*$/;
  let seenRows = false;

  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    const match = line.match(rowPattern);

    if (match) {
      const [, day, month, year, mm] = match;
      const date = `${year}-${MONTHS[month] ?? "00"}-${day}`;
      totals.set(date, (totals.get(date) ?? 0) + Number(mm));
      seenRows = true;
    } else if (seenRows && line.includes("=====")) {
      break;
    }
  }

  if (totals.size === 0) {
    throw new Error(`No se encontraron datos para ${station} en el pronóstico del SMN.`);
  }

  return Array.from(totals, ([date, mm]) => ({ date, mm: Math.round(mm * 10) / 10 }));
}

async function loadSmn() {
  const response = await fetchWithTimeout(SMN_URL);
  const text = unzipFirstFile(Buffer.from(await response.arrayBuffer())).toString("utf8");
  return parseSmnStation(text, SMN_STATION);
}

// ---------- Open-Meteo ----------

async function loadOpenMeteo(): Promise<OpenMeteoDay[]> {
  const response = await fetchWithTimeout(OPEN_METEO_URL);
  const payload = (await response.json()) as {
    daily?: Record<string, Array<number | string | null>>;
  };
  const daily = payload.daily;

  if (!daily || !Array.isArray(daily.time)) {
    throw new Error("Respuesta de Open-Meteo sin datos diarios.");
  }

  const numberAt = (key: string, index: number) => {
    const value = daily[key]?.[index];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };

  return daily.time.map((date, index) => ({
    date: String(date),
    mm: numberAt("precipitation_sum", index),
    probability: numberAt("precipitation_probability_max", index),
    hours: numberAt("precipitation_hours", index),
    weatherCode: numberAt("weather_code", index),
    tMin: numberAt("temperature_2m_min", index),
    tMax: numberAt("temperature_2m_max", index),
  }));
}

// ---------- Caché por fuente ----------

function createCachedSource<T>(name: string, load: () => Promise<T>) {
  let cached: { data: T; fetchedAt: number } | null = null;
  let pending: Promise<{ data: T; fetchedAt: number }> | null = null;

  return async (): Promise<SourceResult<T>> => {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ok: true, ...cached, stale: false };
    }

    pending ??= load()
      .then((data) => (cached = { data, fetchedAt: Date.now() }))
      .finally(() => {
        pending = null;
      });

    try {
      return { ok: true, ...(await pending), stale: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[pronostico] ${name}: ${message}`);

      if (cached && Date.now() - cached.fetchedAt < STALE_MAX_MS) {
        return { ok: true, ...cached, stale: true };
      }

      return { ok: false, error: message };
    }
  };
}

const getSmn = createCachedSource("SMN", loadSmn);
const getOpenMeteo = createCachedSource("Open-Meteo", loadOpenMeteo);

function todayInArgentina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export async function GET() {
  const [smn, openMeteo] = await Promise.all([getSmn(), getOpenMeteo()]);

  if (!smn.ok && !openMeteo.ok) {
    return Response.json(
      {
        success: false,
        error: "No se pudo obtener el pronóstico de ninguna fuente.",
        sources: { smn: smn.error, openMeteo: openMeteo.error },
      },
      { status: 502 },
    );
  }

  // Se une por fecha y se descartan los días que ya pasaron (el archivo del SMN es del día).
  const today = todayInArgentina();
  const smnByDate = new Map((smn.ok ? smn.data : []).map((day) => [day.date, day.mm]));
  const openMeteoByDate = new Map((openMeteo.ok ? openMeteo.data : []).map((day) => [day.date, day]));
  const dates = Array.from(new Set([...smnByDate.keys(), ...openMeteoByDate.keys()]))
    .filter((date) => date >= today)
    .sort();

  const days = dates.map((date) => {
    const om = openMeteoByDate.get(date);
    return {
      date,
      smnMm: smnByDate.get(date) ?? null,
      openMeteoMm: om?.mm ?? null,
      probability: om?.probability ?? null,
      hours: om?.hours ?? null,
      weatherCode: om?.weatherCode ?? null,
      tMin: om?.tMin ?? null,
      tMax: om?.tMax ?? null,
    };
  });

  const describe = (source: SourceResult<unknown>) =>
    source.ok
      ? { ok: true, fetchedAt: new Date(source.fetchedAt).toISOString(), stale: source.stale }
      : { ok: false, error: source.error };

  return Response.json({
    success: true,
    location: "Resistencia, Chaco",
    days,
    sources: {
      smn: { ...describe(smn), station: SMN_STATION, url: "https://www.smn.gob.ar/" },
      openMeteo: { ...describe(openMeteo), url: "https://open-meteo.com/" },
    },
  });
}
