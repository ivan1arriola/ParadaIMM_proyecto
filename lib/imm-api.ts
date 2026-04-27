import "server-only";

import type {
  BusesQuery,
  Bus,
  BusLine,
  BusStop,
  LineVariant,
  UpcomingBus,
  UpcomingBusesQuery,
} from "./types";

type QueryValue = string | number | boolean | Array<string | number | boolean> | undefined | null;
type QueryParams = Record<string, QueryValue>;

type TokenResponse = {
  access_token: string;
  expires_in?: number;
};

const BASE_URL = "https://api.montevideo.gub.uy/api/transportepublico";
const TOKEN_URL =
  "https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token";

let cachedToken: { value: string; expiresAt: number } | null = null;

function resolveCredential(name: "clientId" | "clientSecret"): string {
  const envMap = {
    clientId: process.env.MVD_API_CLIENT_ID ?? process.env.ID_CLIENTE,
    clientSecret: process.env.MVD_API_CLIENT_SECRET ?? process.env.SECRETO_CLIENTE,
  };

  const value = envMap[name];
  if (!value) {
    const variable = name === "clientId" ? "MVD_API_CLIENT_ID" : "MVD_API_CLIENT_SECRET";
    throw new Error(`Falta la variable de entorno ${variable}`);
  }

  return value;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value;
  }

  const clientId = resolveCredential("clientId");
  const clientSecret = resolveCredential("clientSecret");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`No se pudo obtener el token (${response.status}): ${details}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) {
    throw new Error("La respuesta de autenticacion no contiene access_token");
  }

  const expiresInSeconds = data.expires_in ?? 300;
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + expiresInSeconds * 1000,
  };

  return data.access_token;
}

function buildUrl(endpoint: string, params: QueryParams = {}): string {
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = new URL(`${BASE_URL}${normalizedEndpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        url.searchParams.append(key, String(entry));
      });
    } else {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

async function fetchData<T>(endpoint: string, params: QueryParams = {}): Promise<T> {
  const accessToken = await getAccessToken();
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Error en API IMM (${response.status}): ${details}`);
  }

  return (await response.json()) as T;
}

async function fetchRaw(endpoint: string, params: QueryParams = {}): Promise<Response> {
  const accessToken = await getAccessToken();
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Error en API IMM (${response.status}): ${details}`);
  }

  return response;
}

export async function getLineVariants(): Promise<LineVariant[]> {
  return fetchData<LineVariant[]>("/buses/linevariants");
}

export async function getLineVariantDetails(lineVariantId: string | number): Promise<LineVariant> {
  const data = await fetchData<LineVariant | LineVariant[]>(`/buses/linevariants/${lineVariantId}`);
  return Array.isArray(data) ? data[0] : data;
}

export async function getBusStops(): Promise<BusStop[]> {
  return fetchData<BusStop[]>("/buses/busstops");
}

export async function getBusStop(busStopId: string | number): Promise<BusStop> {
  return fetchData<BusStop>(`/buses/busstops/${busStopId}`);
}

export async function getLinesByBusStop(busStopId: string | number): Promise<BusLine[]> {
  try {
    return await fetchData<BusLine[]>(`/buses/busstops/${busStopId}/lines`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isBadRequest = message.includes("API IMM (400)");

    if (!isBadRequest) {
      throw error;
    }

    // Fallback for occasional 400 on IMM /lines endpoint: derive lines from /buses filtered by stop.
    const busesAtStop = await fetchData<Bus[]>("/buses", { busstopId: busStopId });
    const uniqueLines = new Map<string, BusLine>();

    busesAtStop.forEach((bus) => {
      const line = typeof bus.line === "string" ? bus.line.trim() : "";
      if (!line) {
        return;
      }

      const lineId = bus.lineId !== undefined && bus.lineId !== null ? String(bus.lineId) : "";
      const key = `${line}|${lineId}`;

      if (!uniqueLines.has(key)) {
        uniqueLines.set(key, { line, lineId });
      }
    });

    return Array.from(uniqueLines.values()).sort((a, b) => a.line.localeCompare(b.line, "es"));
  }
}

export async function getUpcomingBuses(
  busStopId: string | number,
  query: UpcomingBusesQuery
): Promise<UpcomingBus[]> {
  const { lines, lineVariantIds, amountperline, format } = query;

  return fetchData<UpcomingBus[]>(`/buses/busstops/${busStopId}/upcomingbuses`, {
    lines: lines.join(","),
    lineVariantIds: lineVariantIds?.join(","),
    amountperline,
    format,
  });
}

export async function getBuses(query: BusesQuery = {}): Promise<Bus[]> {
  const { company, lineVariantIds, busId, busstopId, lines, format } = query;

  return fetchData<Bus[]>("/buses", {
    company,
    lineVariantIds: lineVariantIds?.join(","),
    busId,
    busstopId,
    lines: lines?.join(","),
    format,
  });
}

export async function getGtfsLatestVersion(): Promise<string> {
  const response = await fetchRaw("/buses/gtfs/static/latest/version.txt");
  return response.text();
}

export async function getGtfsLatestZip(): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const response = await fetchRaw("/buses/gtfs/static/latest/google_transit.zip");
  const contentType = response.headers.get("content-type") ?? "application/zip";
  return {
    bytes: await response.arrayBuffer(),
    contentType,
  };
}
