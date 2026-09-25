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

function parseRowsFromHtml(html: string) {
  const rowMatches = Array.from(html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));

  return rowMatches
    .map((match) => match[1])
    .map((rowHtml) => {
      const cellMatches = Array.from(rowHtml.matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi));
      return cellMatches
        .map((cellMatch) => normalizeText(cellMatch[1]))
        .filter(Boolean);
    })
    .filter((cells) => cells.length >= 10)
    .filter((cells) => {
      const first = (cells[0] ?? "").trim();
      const second = (cells[1] ?? "").trim();
      return Boolean(first || second);
    });
}

function mapRow(cells: string[]) {
  const firstCell = cells[0] ?? "";
  const secondCell = cells[1] ?? "";

  return {
    estacion: firstCell,
    rio: secondCell || firstCell,
    alturaActual: toNumber(cells[2]),
    variacion: toNumber(cells[3]),
    intervaloHoras: toNumber(cells[4]),
    fechaHoraActual: cells[5] || null,
    tendencia: cells[6] || null,
    alturaAnterior: toNumber(cells[8]),
    fechaHoraAnterior: cells[9] || null,
    cotaMinima: toNumber(cells[10]),
    cotaMaxima: toNumber(cells[11]),
    icono: cells[12] || null,
  };
}

function findRiverRow(html: string, puerto: string, rio: string) {
  const rows = parseRowsFromHtml(html);
  const normalizedPuerto = normalizeKey(puerto || "");
  const normalizedRio = normalizeKey(rio || "");

  const match = rows.find((cells) => {
    const station = normalizeKey(cells[0] ?? "");
    const river = normalizeKey(cells[1] ?? "");

    const puertoMatches = !normalizedPuerto || station === normalizedPuerto || station.includes(normalizedPuerto);
    const rioMatches = !normalizedRio || river === normalizedRio || river.includes(normalizedRio);

    return puertoMatches && rioMatches;
  });

  if (!match) {
    return null;
  }

  return {
    raw: match,
    nombre: match[0] ?? null,
    ...mapRow(match),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const puerto = searchParams.get("puerto") ?? "";
  const rio = searchParams.get("rio") ?? "";

  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: "No se pudo obtener la página de la Prefectura Naval.",
          status: response.status,
        },
        { status: 500 },
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
    const message =
      error instanceof Error ? error.message : "Error al consultar la página de alturas.";

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
