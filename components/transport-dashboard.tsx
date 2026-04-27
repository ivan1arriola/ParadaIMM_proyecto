"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type { BusLine, BusStop, LineVariant, UpcomingBusWithStop } from "../lib/types";

type FetchError = {
  error?: string;
};

const FEATURED_STORAGE_KEY = "paradaimm:featuredStopId";

function parseStopId(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopLabel(stop: BusStop): string {
  return `${stop.street1 || "(sin calle)"} y ${stop.street2 || "(sin esquina)"}`;
}

function stopCoordinatesLabel(stop: BusStop): string {
  const lon = stop.location?.coordinates?.[0];
  const lat = stop.location?.coordinates?.[1];

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return "Sin coordenadas";
  }

  return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
}

function normalizeErrorMessage(message: string): string {
  if (message.includes("429") || message.toLowerCase().includes("usage limit exceeded")) {
    return "Se alcanzó el límite temporal de consultas de la API. Espera unos segundos y vuelve a intentar.";
  }

  return message;
}

async function requestJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const payloadError =
      typeof payload === "object" && payload !== null ? (payload as FetchError).error : undefined;
    const rawMessage = typeof payloadError === "string" ? payloadError : "Error inesperado";

    throw new Error(normalizeErrorMessage(rawMessage));
  }

  return payload as T;
}

function uniqueUpcoming(items: UpcomingBusWithStop[]): UpcomingBusWithStop[] {
  const seen = new Set<string>();
  const unique: UpcomingBusWithStop[] = [];

  for (const item of items) {
    const key = `${item.lineVariantId}-${item.line}-${item.origin}-${item.destination}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function formatEta(etaSeconds?: number): string {
  if (!Number.isFinite(etaSeconds)) {
    return "ETA sin dato";
  }

  const totalSeconds = Math.max(0, Number(etaSeconds));
  if (totalSeconds < 60) {
    return "Llega ahora";
  }

  const minutes = Math.round(totalSeconds / 60);
  return `ETA ${minutes} min`;
}

export function TransportDashboard() {
  const [busStopId, setBusStopId] = useState("");
  const [linesInput, setLinesInput] = useState("");

  const [lines, setLines] = useState<BusLine[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBusWithStop[]>([]);
  const [variants, setVariants] = useState<LineVariant[]>([]);
  const [recent, setRecent] = useState<UpcomingBusWithStop[]>([]);

  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  const [featuredStop, setFeaturedStop] = useState<BusStop | null>(null);
  const [featuredStopCode, setFeaturedStopCode] = useState<number | null>(null);
  const [featuredLines, setFeaturedLines] = useState<BusLine[]>([]);
  const [featuredUpcoming, setFeaturedUpcoming] = useState<UpcomingBusWithStop[]>([]);

  const [featuredRefreshTick, setFeaturedRefreshTick] = useState(0);

  const parsedLines = useMemo(() => {
    return linesInput
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [linesInput]);

  useEffect(() => {
    let active = true;

    async function syncFeaturedFromStorage() {
      const featuredStopId = parseStopId(window.localStorage.getItem(FEATURED_STORAGE_KEY));

      if (featuredStopId === null) {
        if (!active) {
          return;
        }

        setFeaturedStop(null);
        setFeaturedStopCode(null);
        setFeaturedLines([]);
        setFeaturedUpcoming([]);
        setFeaturedError(null);
        return;
      }

      if (active) {
        setFeaturedStopCode(featuredStopId);
        setLoadingFeatured(true);
        setFeaturedError(null);
      }

      try {
        const [stop, linesData] = await Promise.all([
          requestJSON<BusStop>(`/api/busstops/${featuredStopId}`),
          requestJSON<BusLine[]>(`/api/busstops/${featuredStopId}/lines`),
        ]);

        if (!active) {
          return;
        }

        setFeaturedStop(stop);
        setFeaturedStopCode(stop.busstopId ?? featuredStopId);
        setFeaturedLines(linesData);

        const selectedLines = linesData
          .map((line) => line.line)
          .filter(Boolean)
          .slice(0, 8);

        if (selectedLines.length === 0) {
          setFeaturedUpcoming([]);
          return;
        }

        const query = new URLSearchParams({ lines: selectedLines.join(",") });
        const upcomingData = await requestJSON<UpcomingBusWithStop[]>(
          `/api/busstops/${featuredStopId}/upcoming?${query.toString()}`
        );

        if (active) {
          setFeaturedUpcoming(uniqueUpcoming(upcomingData).slice(0, 10));
        }
      } catch (requestError) {
        if (!active) {
          return;
        }

        setFeaturedError(
          requestError instanceof Error
            ? requestError.message
            : "No se pudieron cargar los datos de la parada destacada"
        );
        setFeaturedStop(null);
        setFeaturedLines([]);
        setFeaturedUpcoming([]);
      } finally {
        if (active) {
          setLoadingFeatured(false);
        }
      }
    }

    void syncFeaturedFromStorage();

    return () => {
      active = false;
    };
  }, [featuredRefreshTick]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === FEATURED_STORAGE_KEY) {
        setFeaturedRefreshTick((value) => value + 1);
      }
    }

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  async function onLoadLines(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoadingLines(true);

    try {
      const data = await requestJSON<BusLine[]>(`/api/busstops/${encodeURIComponent(busStopId)}/lines`);
      setLines(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar líneas");
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }

  async function onLoadUpcoming(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (parsedLines.length === 0) {
      setError("Ingresa al menos una línea para consultar próximos buses.");
      setUpcoming([]);
      return;
    }

    setLoadingUpcoming(true);

    try {
      const query = new URLSearchParams({ lines: parsedLines.join(",") });
      const data = await requestJSON<UpcomingBusWithStop[]>(
        `/api/busstops/${encodeURIComponent(busStopId)}/upcoming?${query.toString()}`
      );

      setUpcoming(data);
      setRecent((current) => uniqueUpcoming([...data, ...current]).slice(0, 12));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar próximos buses");
      setUpcoming([]);
    } finally {
      setLoadingUpcoming(false);
    }
  }

  async function onLoadVariants() {
    setError(null);
    setLoadingVariants(true);

    try {
      const data = await requestJSON<LineVariant[]>("/api/linevariants");
      setVariants(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar variantes");
      setVariants([]);
    } finally {
      setLoadingVariants(false);
    }
  }

  const featuredHasData = featuredStop !== null;

  return (
    <section className="dashboard-grid">
      <article className="panel panel-featured panel-featured-strong">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Parada Destacada</p>
            <h2>Parada prioritaria del dashboard</h2>
          </div>
          <button
            type="button"
            className="button-ghost"
            onClick={() => setFeaturedRefreshTick((value) => value + 1)}
            disabled={loadingFeatured}
          >
            {loadingFeatured ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {!featuredHasData && !loadingFeatured && !featuredError ? (
          <p className="notice-text">
            No hay parada destacada seleccionada. Defínela desde <Link href="/paradas">el mapa de paradas</Link>.
          </p>
        ) : null}

        {featuredError ? <p className="error-banner">{featuredError}</p> : null}

        {featuredHasData ? (
          <div className="featured-body">
            <div className="featured-info-grid">
              <div className="featured-info-card">
                <p className="panel-kicker">Código de parada</p>
                <p className="featured-value">{featuredStopCode ?? "Sin código"}</p>
              </div>

              <div className="featured-info-card">
                <p className="panel-kicker">Ubicación</p>
                <p className="featured-value">{stopLabel(featuredStop)}</p>
                <p className="featured-subvalue">{stopCoordinatesLabel(featuredStop)}</p>
              </div>
            </div>

            <div className="chip-row">
              {featuredLines.length > 0 ? (
                featuredLines.slice(0, 8).map((line) => (
                  <span key={`${line.line}-${line.lineId}`} className="line-chip">
                    Línea {line.line}
                  </span>
                ))
              ) : (
                <span className="line-chip">Sin líneas detectadas</span>
              )}
            </div>

            <div className="featured-lists-grid">
              <div>
                <p className="featured-list-title">En camino (máx. 10)</p>
                <ul className="results-list compact-results">
                  {featuredUpcoming.map((bus, index) => (
                    <li key={`featured-upcoming-${bus.lineVariantId}-${index}`}>
                      <strong>{bus.line}</strong>
                      <span>
                        {bus.origin} → {bus.destination}
                      </span>
                      <span className="eta-badge">{formatEta(bus.eta)}</span>
                    </li>
                  ))}
                  {!loadingFeatured && featuredUpcoming.length === 0 ? (
                    <li className="empty-state">Sin buses en camino para esta parada.</li>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </article>

      <article className="panel panel-query">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Consulta Rápida</p>
            <h2>Parada y líneas a monitorear</h2>
          </div>
        </div>

        <form onSubmit={onLoadUpcoming} className="form-grid form-spacious">
          <label htmlFor="busstop-id">ID de parada</label>
          <input
            id="busstop-id"
            type="text"
            value={busStopId}
            onChange={(event) => setBusStopId(event.target.value)}
            placeholder="Ej: 3714"
            required
            autoFocus
          />

          <label htmlFor="lines-input">Líneas (separadas por coma)</label>
          <input
            id="lines-input"
            type="text"
            value={linesInput}
            onChange={(event) => setLinesInput(event.target.value)}
            placeholder="Ej: 199, 300"
            required
          />

          <div className="button-row">
            <button type="submit" disabled={loadingUpcoming || !busStopId || parsedLines.length === 0}>
              {loadingUpcoming ? "Consultando..." : "Ver próximos"}
            </button>
          </div>
        </form>

        <form onSubmit={onLoadLines} className="form-grid form-inline-action">
          <button type="submit" className="button-ghost" disabled={loadingLines || !busStopId}>
            {loadingLines ? "Cargando líneas..." : "Cargar líneas de la parada"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </article>

      <article className="panel panel-results">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Resultado</p>
            <h2>Líneas en la parada</h2>
          </div>
          <span className="panel-count">{lines.length}</span>
        </div>

        <ul className="results-list">
          {lines.map((line) => (
            <li key={`${line.line}-${line.lineId}`}>
              <strong>{line.line}</strong>
              <span>{line.lineId ? `ID ${line.lineId}` : "Sin ID informado"}</span>
            </li>
          ))}
          {!loadingLines && lines.length === 0 ? <li className="empty-state">Sin datos aún.</li> : null}
        </ul>
      </article>

      <article className="panel panel-results">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Resultado</p>
            <h2>Próximos buses</h2>
          </div>
          <span className="panel-count">{upcoming.length}</span>
        </div>

        <ul className="results-list">
          {upcoming.map((bus, index) => (
            <li key={`upcoming-${bus.lineVariantId}-${index}`}>
              <strong>{bus.line}</strong>
              <span>
                {bus.origin} → {bus.destination}
              </span>
            </li>
          ))}
          {!loadingUpcoming && upcoming.length === 0 ? (
            <li className="empty-state">Sin datos aún. Haz una consulta para ver resultados.</li>
          ) : null}
        </ul>
      </article>

      <article className="panel panel-results panel-wide">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Historial</p>
            <h2>Buses vistos recientemente</h2>
          </div>
          <span className="panel-count">{recent.length}</span>
        </div>

        <ul className="results-list">
          {recent.map((bus, index) => (
            <li key={`recent-${bus.lineVariantId}-${index}`}>
              <strong>{bus.line}</strong>
              <span>
                {bus.origin} → {bus.destination}
              </span>
            </li>
          ))}
          {recent.length === 0 ? (
            <li className="empty-state">Aún no hay historial. Se llenará al consultar próximos buses.</li>
          ) : null}
        </ul>
      </article>

      <article className="panel panel-results">
        <div className="panel-head-row">
          <div>
            <p className="panel-kicker">Catálogo</p>
            <h2>Variantes de línea</h2>
          </div>
          <span className="panel-count">{variants.length}</span>
        </div>

        <button type="button" onClick={onLoadVariants} disabled={loadingVariants}>
          {loadingVariants ? "Cargando variantes..." : "Cargar variantes"}
        </button>

        <ul className="results-list">
          {variants.slice(0, 30).map((variant) => (
            <li key={variant.lineVariantId}>
              <strong>{variant.line}</strong>
              <span>
                {variant.origin} → {variant.destination}
              </span>
            </li>
          ))}
          {!loadingVariants && variants.length === 0 ? (
            <li className="empty-state">Sin datos aún.</li>
          ) : null}
        </ul>
      </article>
    </section>
  );
}
