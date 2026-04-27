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

async function requestJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as FetchError).error === "string"
        ? (payload as FetchError).error
        : "Error inesperado";
    throw new Error(message);
  }

  return payload as T;
}

export function TransportDashboard() {
  const [busStopId, setBusStopId] = useState("3714");
  const [linesInput, setLinesInput] = useState("199");

  const [lines, setLines] = useState<BusLine[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBusWithStop[]>([]);
  const [variants, setVariants] = useState<LineVariant[]>([]);

  const [loadingLines, setLoadingLines] = useState(false);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  const [featuredStop, setFeaturedStop] = useState<BusStop | null>(null);
  const [featuredLines, setFeaturedLines] = useState<BusLine[]>([]);
  const [featuredUpcoming, setFeaturedUpcoming] = useState<UpcomingBusWithStop[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(false);

  const parsedLines = useMemo(() => {
    return linesInput
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [linesInput]);

  useEffect(() => {
    let active = true;

    async function refreshFeaturedStop() {
      const featuredStopId = parseStopId(window.localStorage.getItem(FEATURED_STORAGE_KEY));

      if (featuredStopId === null) {
        if (!active) {
          return;
        }

        setFeaturedStop(null);
        setFeaturedLines([]);
        setFeaturedUpcoming([]);
        setFeaturedError(null);
        return;
      }

      if (active) {
        setLoadingFeatured(true);
        setFeaturedError(null);
      }

      try {
        const [stop, lines] = await Promise.all([
          requestJSON<BusStop>(`/api/busstops/${featuredStopId}`),
          requestJSON<BusLine[]>(`/api/busstops/${featuredStopId}/lines`),
        ]);

        if (!active) {
          return;
        }

        setFeaturedStop(stop);
        setFeaturedLines(lines);

        const queryLines = lines
          .map((line) => line.line)
          .filter(Boolean)
          .slice(0, 3);

        if (queryLines.length === 0) {
          setFeaturedUpcoming([]);
          return;
        }

        const query = new URLSearchParams({ lines: queryLines.join(",") });
        const upcoming = await requestJSON<UpcomingBusWithStop[]>(
          `/api/busstops/${featuredStopId}/upcoming?${query.toString()}`
        );

        if (active) {
          setFeaturedUpcoming(upcoming);
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

    void refreshFeaturedStop();

    function onStorage(event: StorageEvent) {
      if (event.key === FEATURED_STORAGE_KEY) {
        void refreshFeaturedStop();
      }
    }

    function onFocus() {
      void refreshFeaturedStop();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
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
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar lineas");
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }

  async function onLoadUpcoming(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoadingUpcoming(true);

    try {
      const query = new URLSearchParams({ lines: parsedLines.join(",") });
      const data = await requestJSON<UpcomingBusWithStop[]>(
        `/api/busstops/${encodeURIComponent(busStopId)}/upcoming?${query.toString()}`
      );
      setUpcoming(data);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudieron cargar proximos buses"
      );
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
      setError(
        requestError instanceof Error ? requestError.message : "No se pudieron cargar variantes"
      );
      setVariants([]);
    } finally {
      setLoadingVariants(false);
    }
  }

  return (
    <section className="panel-grid">
      <article className="panel panel-featured">
        <h2>Parada destacada</h2>
        <p>Esta parada se configura desde el mapa de paradas.</p>

        {!featuredStop && !loadingFeatured && !featuredError ? (
          <p>
            No hay parada destacada. <Link href="/paradas">Seleccionar en el mapa</Link>.
          </p>
        ) : null}

        {loadingFeatured ? <p className="meta">Cargando parada destacada...</p> : null}

        {featuredError ? <p className="error-banner">{featuredError}</p> : null}

        {featuredStop ? (
          <>
            <p className="meta">
              Parada {featuredStop.busstopId}: {stopLabel(featuredStop)}
            </p>

            {featuredLines.length > 0 ? (
              <p className="meta">
                Lineas: {featuredLines.map((line) => line.line).filter(Boolean).join(", ")}
              </p>
            ) : (
              <p className="meta">Sin lineas detectadas para esta parada.</p>
            )}

            <ul className="results-list">
              {featuredUpcoming.map((bus, index) => (
                <li key={`featured-${bus.lineVariantId}-${index}`}>
                  <strong>{bus.line}</strong>
                  <span>
                    {bus.origin} → {bus.destination}
                  </span>
                </li>
              ))}
              {!loadingFeatured && featuredUpcoming.length === 0 ? (
                <li>Sin proximos buses para la consulta actual.</li>
              ) : null}
            </ul>
          </>
        ) : null}
      </article>

      <article className="panel">
        <h2>Parada y lineas</h2>
        <p>Consulta las lineas que pasan por una parada.</p>

        <form onSubmit={onLoadLines} className="form-grid">
          <label htmlFor="busstop-id">ID de parada</label>
          <input
            id="busstop-id"
            type="text"
            value={busStopId}
            onChange={(event) => setBusStopId(event.target.value)}
            placeholder="Ej: 3714"
            required
          />

          <button type="submit" disabled={loadingLines}>
            {loadingLines ? "Consultando..." : "Ver lineas"}
          </button>
        </form>

        <ul className="results-list">
          {lines.map((line) => (
            <li key={`${line.lineId}-${line.line}`}>
              <strong>{line.line}</strong>
              {line.lineId ? <span>ID {line.lineId}</span> : null}
            </li>
          ))}
          {lines.length === 0 && <li>Sin datos aun.</li>}
        </ul>
      </article>

      <article className="panel">
        <h2>Proximos buses</h2>
        <p>Ingresa una o varias lineas separadas por coma.</p>

        <form onSubmit={onLoadUpcoming} className="form-grid">
          <label htmlFor="lines-input">Lineas</label>
          <input
            id="lines-input"
            type="text"
            value={linesInput}
            onChange={(event) => setLinesInput(event.target.value)}
            placeholder="Ej: 199,300"
            required
          />

          <button type="submit" disabled={loadingUpcoming || parsedLines.length === 0}>
            {loadingUpcoming ? "Consultando..." : "Ver proximos"}
          </button>
        </form>

        <ul className="results-list">
          {upcoming.map((bus, index) => (
            <li key={`${bus.lineVariantId}-${index}`}>
              <strong>{bus.line}</strong>
              <span>
                {bus.origin} → {bus.destination}
              </span>
            </li>
          ))}
          {upcoming.length === 0 && <li>Sin datos aun.</li>}
        </ul>
      </article>

      <article className="panel">
        <h2>Variantes</h2>
        <p>Trae el listado completo de variantes de linea.</p>

        <button type="button" onClick={onLoadVariants} disabled={loadingVariants}>
          {loadingVariants ? "Cargando..." : "Cargar variantes"}
        </button>

        <p className="meta">{variants.length} variantes cargadas.</p>

        <ul className="results-list">
          {variants.slice(0, 25).map((variant) => (
            <li key={variant.lineVariantId}>
              <strong>{variant.line}</strong>
              <span>
                {variant.origin} → {variant.destination}
              </span>
            </li>
          ))}
          {variants.length === 0 && <li>Sin datos aun.</li>}
        </ul>
      </article>

      {error ? <p className="error-banner">{error}</p> : null}
    </section>
  );
}
