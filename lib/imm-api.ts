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
import { readDbCache, readDbCacheStale, writeDbCache } from "./db-cache";

type QueryValue = string | number | boolean | Array<string | number | boolean> | undefined | null;
type QueryParams = Record<string, QueryValue>;
type RawBusStop = Partial<BusStop> & {
  paradaId?: number | string;
  calle1?: string;
  calle2?: string;
  calle1Id?: number | string;
  calle2Id?: number | string;
  ubicacion?: BusStop["location"];
};

type TokenResponse = {
  access_token: string;
  expires_in?: number;
};

const BASE_URL = "https://api.montevideo.gub.uy/api/transportepublico";
const TOKEN_URL =
  "https://mvdapi-auth.montevideo.gub.uy/auth/realms/pci/protocol/openid-connect/token";
const BUS_STOPS_CACHE_TTL_MS = Number(process.env.BUS_STOPS_CACHE_TTL_MS ?? 1000 * 60 * 60 * 12);
const LINE_VARIANTS_CACHE_TTL_MS = Number(
  process.env.LINE_VARIANTS_CACHE_TTL_MS ?? 1000 * 60 * 60 * 24
);
const BUS_STOP_LINES_CACHE_TTL_MS = Number(
  process.env.BUS_STOP_LINES_CACHE_TTL_MS ?? 1000 * 60 * 60 * 6
);
const IMM_MIN_INTERVAL_MS = Number(process.env.IMM_MIN_INTERVAL_MS ?? 320);
const IMM_MAX_429_RETRIES = Number(process.env.IMM_MAX_429_RETRIES ?? 2);
const IMM_RETRY_BASE_MS = Number(process.env.IMM_RETRY_BASE_MS ?? 1200);
const DB_CACHE_KEY_BUS_STOPS = "imm:busstops";
const DB_CACHE_KEY_LINE_VARIANTS = "imm:linevariants";

let cachedToken: { value: string; expiresAt: number } | null = null;
let busStopsCache: { data: BusStop[]; expiresAt: number } | null = null;
let busStopsInFlight: Promise<BusStop[]> | null = null;
let lineVariantsCache: { data: LineVariant[]; expiresAt: number } | null = null;
let lineVariantsInFlight: Promise<LineVariant[]> | null = null;
let immRequestChain: Promise<void> = Promise.resolve();
let lastImmRequestAt = 0;
const busStopLinesCache = new Map<string, { data: BusLine[]; expiresAt: number }>();
const busStopLinesInFlight = new Map<string, Promise<BusLine[]>>();

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function asString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeLocation(value: unknown): BusStop["location"] {
  if (typeof value !== "object" || value === null) {
    return { type: "Point", coordinates: [0, 0] };
  }

  const maybePoint = value as Partial<BusStop["location"]>;
  const lon = asNumber(maybePoint.coordinates?.[0]);
  const lat = asNumber(maybePoint.coordinates?.[1]);

  return {
    type: asString(maybePoint.type) || "Point",
    coordinates: lon !== null && lat !== null ? [lon, lat] : [0, 0],
  };
}

function normalizeBusStop(raw: unknown): BusStop | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const source = raw as RawBusStop;
  const busstopId = asNumber(source.busstopId ?? source.paradaId);
  if (busstopId === null) {
    return null;
  }

  return {
    busstopId,
    street1: asString(source.street1 ?? source.calle1).trim(),
    street2: asString(source.street2 ?? source.calle2).trim(),
    street1Id: asNumber(source.street1Id ?? source.calle1Id) ?? 0,
    street2Id: asNumber(source.street2Id ?? source.calle2Id) ?? 0,
    location: normalizeLocation(source.location ?? source.ubicacion),
  };
}

function normalizeBusStopArray(raw: unknown): BusStop[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const uniqueById = new Map<number, BusStop>();

  raw.forEach((entry) => {
    const normalized = normalizeBusStop(entry);
    if (normalized) {
      uniqueById.set(normalized.busstopId, normalized);
    }
  });

  return Array.from(uniqueById.values());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function scheduleImmRequest<T>(task: () => Promise<T>): Promise<T> {
  const queuedTask = immRequestChain.catch(() => undefined).then(async () => {
    const waitMs = Math.max(0, IMM_MIN_INTERVAL_MS - (Date.now() - lastImmRequestAt));
    if (waitMs > 0) {
      await delay(waitMs);
    }
    lastImmRequestAt = Date.now();
    return task();
  });

  immRequestChain = queuedTask.then(
    () => undefined,
    () => undefined
  );

  return queuedTask;
}

function parseRetryAfterMs(response: Response): number | null {
  const retryAfter = response.headers.get("retry-after");
  if (!retryAfter) {
    return null;
  }

  const asSeconds = Number(retryAfter);
  if (Number.isFinite(asSeconds)) {
    return Math.max(0, asSeconds * 1000);
  }

  const asDate = new Date(retryAfter).getTime();
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

async function authorizedImmFetch(url: string): Promise<Response> {
  const accessToken = await getAccessToken();
  return scheduleImmRequest(() =>
    fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    })
  );
}

async function requestImmWith429Retry(url: string): Promise<Response> {
  for (let attempt = 0; attempt <= IMM_MAX_429_RETRIES; attempt += 1) {
    const response = await authorizedImmFetch(url);

    if (response.status !== 429 || attempt >= IMM_MAX_429_RETRIES) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response);
    const exponentialMs = IMM_RETRY_BASE_MS * Math.pow(2, attempt);
    const jitterMs = Math.floor(Math.random() * 220);

    await delay((retryAfterMs ?? exponentialMs) + jitterMs);
  }

  return authorizedImmFetch(url);
}

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
  const url = buildUrl(endpoint, params);

  const response = await requestImmWith429Retry(url);

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Error en API IMM (${response.status}): ${details}`);
  }

  return (await response.json()) as T;
}

async function fetchRaw(endpoint: string, params: QueryParams = {}): Promise<Response> {
  const url = buildUrl(endpoint, params);

  const response = await requestImmWith429Retry(url);

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Error en API IMM (${response.status}): ${details}`);
  }

  return response;
}

export async function getLineVariants(): Promise<LineVariant[]> {
  const now = Date.now();

  if (lineVariantsCache && now < lineVariantsCache.expiresAt) {
    return lineVariantsCache.data;
  }

  if (lineVariantsInFlight) {
    return lineVariantsInFlight;
  }

  const fromDb = await readDbCache<LineVariant[]>(DB_CACHE_KEY_LINE_VARIANTS);
  if (fromDb && fromDb.length > 0) {
    lineVariantsCache = {
      data: fromDb,
      expiresAt: now + Math.max(60_000, LINE_VARIANTS_CACHE_TTL_MS),
    };
    return fromDb;
  }

  lineVariantsInFlight = fetchData<LineVariant[]>("/buses/linevariants");

  try {
    const freshData = await lineVariantsInFlight;
    lineVariantsCache = {
      data: freshData,
      expiresAt: now + Math.max(60_000, LINE_VARIANTS_CACHE_TTL_MS),
    };
    await writeDbCache(DB_CACHE_KEY_LINE_VARIANTS, freshData, LINE_VARIANTS_CACHE_TTL_MS);
    return freshData;
  } catch (error) {
    if (lineVariantsCache) {
      return lineVariantsCache.data;
    }
    const stale = await readDbCacheStale<LineVariant[]>(DB_CACHE_KEY_LINE_VARIANTS);
    if (stale && stale.length > 0) {
      return stale;
    }
    throw error;
  } finally {
    lineVariantsInFlight = null;
  }
}

export async function getLineVariantDetails(lineVariantId: string | number): Promise<LineVariant> {
  const data = await fetchData<LineVariant | LineVariant[]>(`/buses/linevariants/${lineVariantId}`);
  return Array.isArray(data) ? data[0] : data;
}

export async function getBusStops(): Promise<BusStop[]> {
  const now = Date.now();

  if (busStopsCache && now < busStopsCache.expiresAt) {
    return busStopsCache.data;
  }

  if (busStopsInFlight) {
    return busStopsInFlight;
  }

  const fromDb = await readDbCache<BusStop[]>(DB_CACHE_KEY_BUS_STOPS);
  const normalizedFromDb = normalizeBusStopArray(fromDb);
  if (normalizedFromDb.length > 0) {
    busStopsCache = {
      data: normalizedFromDb,
      expiresAt: now + Math.max(60_000, BUS_STOPS_CACHE_TTL_MS),
    };
    return normalizedFromDb;
  }

  busStopsInFlight = fetchData<unknown[]>("/buses/busstops").then((data) => normalizeBusStopArray(data));

  try {
    const freshData = await busStopsInFlight;
    busStopsCache = {
      data: freshData,
      expiresAt: now + Math.max(60_000, BUS_STOPS_CACHE_TTL_MS),
    };
    await writeDbCache(DB_CACHE_KEY_BUS_STOPS, freshData, BUS_STOPS_CACHE_TTL_MS);
    return freshData;
  } catch (error) {
    // If the remote API fails, serve stale cached data when available.
    if (busStopsCache) {
      return busStopsCache.data;
    }
    const stale = await readDbCacheStale<BusStop[]>(DB_CACHE_KEY_BUS_STOPS);
    const normalizedStale = normalizeBusStopArray(stale);
    if (normalizedStale.length > 0) {
      return normalizedStale;
    }
    throw error;
  } finally {
    busStopsInFlight = null;
  }
}

export async function refreshBusStopsCache(): Promise<BusStop[]> {
  const freshData = normalizeBusStopArray(await fetchData<unknown[]>("/buses/busstops"));
  busStopsCache = {
    data: freshData,
    expiresAt: Date.now() + Math.max(60_000, BUS_STOPS_CACHE_TTL_MS),
  };
  await writeDbCache(DB_CACHE_KEY_BUS_STOPS, freshData, BUS_STOPS_CACHE_TTL_MS);
  return freshData;
}

export async function getBusStop(busStopId: string | number): Promise<BusStop> {
  const normalizedId = Number(busStopId);
  const cachedStop =
    busStopsCache && Number.isFinite(normalizedId)
      ? busStopsCache.data.find((stop) => stop.busstopId === normalizedId) ?? null
      : null;

  if (cachedStop) {
    return cachedStop;
  }

  try {
    const rawStop = await fetchData<unknown>(`/buses/busstops/${busStopId}`);
    const normalizedStop = normalizeBusStop(Array.isArray(rawStop) ? rawStop[0] : rawStop);

    if (!normalizedStop) {
      throw new Error("No se pudo normalizar la respuesta de la parada");
    }

    if (busStopsCache) {
      const nextStops = [...busStopsCache.data];
      const index = nextStops.findIndex((stop) => stop.busstopId === normalizedStop.busstopId);
      if (index >= 0) {
        nextStops[index] = normalizedStop;
      } else {
        nextStops.push(normalizedStop);
      }

      busStopsCache = {
        data: nextStops,
        expiresAt: Math.max(
          busStopsCache.expiresAt,
          Date.now() + Math.max(60_000, BUS_STOPS_CACHE_TTL_MS)
        ),
      };
    }

    return normalizedStop;
  } catch (error) {
    if (cachedStop) {
      return cachedStop;
    }
    throw error;
  }
}

export async function getLinesByBusStop(busStopId: string | number): Promise<BusLine[]> {
  const cacheKey = String(busStopId);
  const dbCacheKey = `imm:busstop-lines:${cacheKey}`;
  const now = Date.now();
  const cached = busStopLinesCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const inFlight = busStopLinesInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fromDb = await readDbCache<BusLine[]>(dbCacheKey);
  if (fromDb && fromDb.length > 0) {
    busStopLinesCache.set(cacheKey, {
      data: fromDb,
      expiresAt: now + Math.max(60_000, BUS_STOP_LINES_CACHE_TTL_MS),
    });
    return fromDb;
  }

  const requestPromise = (async () => {
    try {
      const direct = await fetchData<BusLine[]>(`/buses/busstops/${busStopId}/lines`);
      busStopLinesCache.set(cacheKey, {
        data: direct,
        expiresAt: Date.now() + Math.max(60_000, BUS_STOP_LINES_CACHE_TTL_MS),
      });
      await writeDbCache(dbCacheKey, direct, BUS_STOP_LINES_CACHE_TTL_MS);
      return direct;
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

      const resolved = Array.from(uniqueLines.values()).sort((a, b) => a.line.localeCompare(b.line, "es"));
      busStopLinesCache.set(cacheKey, {
        data: resolved,
        expiresAt: Date.now() + Math.max(60_000, BUS_STOP_LINES_CACHE_TTL_MS),
      });
      await writeDbCache(dbCacheKey, resolved, BUS_STOP_LINES_CACHE_TTL_MS);
      return resolved;
    }
  })();

  busStopLinesInFlight.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    busStopLinesInFlight.delete(cacheKey);
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
