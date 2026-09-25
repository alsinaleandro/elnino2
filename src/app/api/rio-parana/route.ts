const SOURCE_URL = "https://contenidosweb.prefecturanaval.gob.ar/alturas/";

function normalizeText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value.trim();

  if (cleaned === "S/E" || cleaned === "-" || cleaned === "S/E." || cleaned === "") {
    return null;
  }

  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.includes(",")
      ? cleaned.replace(",", ".")
      : cleaned;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

// Cada celda de la tabla trae un atributo data-label ("Puerto:", "Río:", "Alerta:", ...).
// Se indexa por esa etiqueta normalizada para no depender del orden de las columnas.
type LabeledRow = Record<string, string>;

function parseRowsFromHtml(html: string): LabeledRow[] {
  const rowMatches = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));

  return rowMatches
    .map((match) => {
      const row: LabeledRow = {};
      const cellMatches = match[1].matchAll(/<(?:th|td)\b([^>]*)>([\s\S]*?)<\/(?:th|td)>/gi);

      for (const [, attributes, content] of cellMatches) {
        const label = attributes.match(/data-label\s*=\s*"([^"]*)"/i)?.[1];

        if (label) {
          row[normalizeKey(label)] = normalizeText(content);
        }
      }

      return row;
    })
    .filter((row) => Boolean(row.PUERTO));
}

function mapRow(row: LabeledRow) {
  return {
    estacion: row.PUERTO ?? "",
    rio: row.RIO || row.PUERTO || "",
    alturaActual: toNumber(row.ULTIMOREGISTRO),
    variacion: toNumber(row.VARIACION),
    intervaloHoras: toNumber(row.PERIODO),
    fechaHoraActual: row.FECHAHORA || null,
    tendencia: row.ESTADO || null,
    alerta: toNumber(row.ALERTA),
    evacuacion: toNumber(row.EVACUACION),
    alturaAnterior: toNumber(row.REGISTROANTERIOR),
    fechaHoraAnterior: row.FECHAANTERIOR || null,
  };
}

function findRiverRow(html: string, puerto: string, rio: string) {
  const rows = parseRowsFromHtml(html);
  const normalizedPuerto = normalizeKey(puerto || "");
  const normalizedRio = normalizeKey(rio || "");

  const match = rows.find((row) => {
    const station = normalizeKey(row.PUERTO ?? "");
    const river = normalizeKey(row.RIO ?? "");

    const puertoMatches = !normalizedPuerto || station === normalizedPuerto || station.includes(normalizedPuerto);
    const rioMatches = !normalizedRio || river === normalizedRio || river.includes(normalizedRio);

    return puertoMatches && rioMatches;
  });

  if (!match) {
    return null;
  }

  return {
    raw: match,
    nombre: match.PUERTO ?? null,
    ...mapRow(match),
  };
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Error al consultar la página de alturas.";
  }

  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "La página de Prefectura Naval no respondió a tiempo.";
  }

  // fetch() solo dice "fetch failed"; el motivo real (DNS, TLS, conexión) viene en cause.
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code ?? cause?.message;
  return detail ? `${error.message} (${detail})` : error.message;
}

// El servidor de Prefectura suele cortar las conexiones keep-alive inactivas, y la primera
// petición después de un rato falla con ECONNRESET. Se reintenta ante errores de red.
async function fetchSource(attempts = 3) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetch(SOURCE_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "TimeoutError";

      if (isTimeout || attempt >= attempts) {
        throw error;
      }

      console.warn(`[rio-parana] intento ${attempt} falló: ${describeError(error)}`);
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puerto = searchParams.get("puerto") ?? "";
  const rio = searchParams.get("rio") ?? "";

  try {
    const response = await fetchSource();

    if (!response.ok) {
      console.error(`[rio-parana] Prefectura respondió HTTP ${response.status}`);

      return Response.json(
        {
          success: false,
          error: `No se pudo obtener la página de la Prefectura Naval (HTTP ${response.status}).`,
          status: response.status,
        },
        { status: 502 },
      );
    }

    const html = await response.text();
    const row = findRiverRow(html, puerto, rio);

    if (!row) {
      return Response.json(
        {
          success: false,
          error: "No se encontró ningún registro que coincida con el puerto y el río indicados.",
          source: SOURCE_URL,
          requested: {
            puerto,
            rio,
          },
        },
        { status: 404 },
      );
    }

    return Response.json({
      success: true,
      source: SOURCE_URL,
      fetchedAt: new Date().toISOString(),
      requested: {
        puerto,
        rio,
      },
      row,
    });
  } catch (error) {
    const message = describeError(error);
    console.error("[rio-parana]", message);

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
