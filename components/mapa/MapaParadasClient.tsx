"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

import type { BusLine, BusStop, UpcomingBusWithStop } from "../../lib/types";

type ApiError = {
  error?: string;
};

const MONTEVIDEO_CENTER: [number, number] = [-34.9011, -56.1645];
const FAVORITES_STORAGE_KEY = "paradaimm:favorites";
const FEATURED_STORAGE_KEY = "paradaimm:featuredStopId";

const paradaIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

async function requestJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as ApiError).error === "string"
        ? (payload as ApiError).error
        : "Error inesperado";

    throw new Error(message);
  }

  return payload as T;
}

function parseFavoriteIds(rawValue: string | null): number[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  } catch {
    return [];
  }
}

function parseStopId(rawValue: string | null): number | null {
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopLabel(stop: BusStop): string {
  const left = stop.street1?.trim() || "(sin calle)";
  const right = stop.street2?.trim() || "(sin esquina)";
  return `${left} y ${right}`;
}

function stopCoordinates(stop: BusStop): [number, number] | null {
  const lon = stop.location?.coordinates?.[0];
  const lat = stop.location?.coordinates?.[1];

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return [lat, lon];
}

export default function MapaParadasClient() {
  const [allStops, setAllStops] = useState<BusStop[]>([]);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<number[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }

    return parseFavoriteIds(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
  });
  const [featuredStopId, setFeaturedStopId] = useState<number | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return parseStopId(window.localStorage.getItem(FEATURED_STORAGE_KEY));
  });

  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [stopLines, setStopLines] = useState<BusLine[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingBusWithStop[]>([]);

  const [loadingStops, setLoadingStops] = useState(true);
  const [loadingUpcoming, setLoadingUpcoming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (featuredStopId === null) {
      window.localStorage.removeItem(FEATURED_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(FEATURED_STORAGE_KEY, String(featuredStopId));
  }, [featuredStopId]);

  useEffect(() => {
    let active = true;

    async function loadBusStops() {
      setLoadingStops(true);
      setError(null);

      try {
        const data = await requestJSON<BusStop[]>("/api/busstops?limit=10000");
        if (active) {
          setAllStops(data);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar paradas");
        }
      } finally {
        if (active) {
          setLoadingStops(false);
        }
      }
    }

    loadBusStops();

    return () => {
      active = false;
    };
  }, []);

  const filteredStops = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return allStops;
    }

    return allStops.filter((stop) => {
      const byId = String(stop.busstopId).includes(normalized);
      const byStreet1 = stop.street1?.toLowerCase().includes(normalized);
      const byStreet2 = stop.street2?.toLowerCase().includes(normalized);
      return byId || byStreet1 || byStreet2;
    });
  }, [allStops, search]);

  const visibleStops = useMemo(() => {
    const limit = search.trim() ? 2000 : 800;
    return filteredStops.slice(0, limit);
  }, [filteredStops, search]);

  const stopsById = useMemo(() => {
    const map = new Map<number, BusStop>();
    allStops.forEach((stop) => {
      map.set(stop.busstopId, stop);
    });
    return map;
  }, [allStops]);

  const favoriteStops = useMemo(() => {
    return favorites.map((id) => stopsById.get(id)).filter(Boolean) as BusStop[];
  }, [favorites, stopsById]);
  const featuredStop = useMemo(() => {
    if (featuredStopId === null) {
      return null;
    }

    return stopsById.get(featuredStopId) ?? null;
  }, [featuredStopId, stopsById]);

  function isFavorite(stopId: number): boolean {
    return favorites.includes(stopId);
  }

  function toggleFavorite(stopId: number) {
    setFavorites((current) => {
      if (current.includes(stopId)) {
        return current.filter((id) => id !== stopId);
      }

      return [...current, stopId].sort((a, b) => a - b);
    });
  }

  function setFeaturedStop(stopId: number) {
    setFeaturedStopId(stopId);
  }

  async function loadUpcomingForStop(stop: BusStop) {
    setSelectedStop(stop);
    setStopLines([]);
    setUpcoming([]);
    setError(null);
    setLoadingUpcoming(true);

    try {
      const lines = await requestJSON<BusLine[]>(`/api/busstops/${stop.busstopId}/lines`);
      setStopLines(lines);

      const queryLines = lines
        .map((line) => line.line)
        .filter(Boolean)
        .slice(0, 3);

      if (queryLines.length === 0) {
        return;
      }

      const query = new URLSearchParams({ lines: queryLines.join(",") });
      const buses = await requestJSON<UpcomingBusWithStop[]>(
        `/api/busstops/${stop.busstopId}/upcoming?${query.toString()}`
      );

      setUpcoming(buses);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar proximos buses");
    } finally {
      setLoadingUpcoming(false);
    }
  }

  return (
    <section className="map-layout">
      <article className="panel map-control-panel">
        <h2>Buscar paradas</h2>
        <p>Carga inicial: {allStops.length} paradas.</p>

        <label htmlFor="paradas-search">Filtrar por codigo o calle</label>
        <input
          id="paradas-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ej: 3714, 18 de julio, rivera"
        />

        <p className="meta">
          Mostrando {visibleStops.length} de {filteredStops.length}
          {search.trim() ? " (filtradas)" : " (capa inicial)"}
        </p>

        {error ? <p className="error-banner">{error}</p> : null}
      </article>

      <article className="panel map-surface-panel">
        {loadingStops ? (
          <p className="map-loading">Cargando paradas...</p>
        ) : (
          <MapContainer
            center={MONTEVIDEO_CENTER}
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {visibleStops.map((stop) => {
              const position = stopCoordinates(stop);
              if (!position) {
                return null;
              }

              const favorite = isFavorite(stop.busstopId);
              const isFeatured = featuredStopId === stop.busstopId;

              return (
                <Marker key={stop.busstopId} position={position} icon={paradaIcon}>
                  <Popup>
                    <strong>Parada {stop.busstopId}</strong>
                    <br />
                    {stopLabel(stop)}
                    <br />
                    <div className="map-popup-actions">
                      <button type="button" onClick={() => toggleFavorite(stop.busstopId)}>
                        {favorite ? "Quitar favorita" : "Agregar favorita"}
                      </button>
                      <button type="button" onClick={() => setFeaturedStop(stop.busstopId)}>
                        {isFeatured ? "Destacada" : "Destacar"}
                      </button>
                      <button type="button" onClick={() => loadUpcomingForStop(stop)}>
                        Ver proximos
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </article>

      <aside className="panel map-side-panel">
        <h2>Parada destacada</h2>
        {featuredStop ? (
          <div className="map-featured-card">
            <strong>Parada {featuredStop.busstopId}</strong>
            <span>{stopLabel(featuredStop)}</span>
            <div className="map-popup-actions">
              <button type="button" onClick={() => loadUpcomingForStop(featuredStop)}>
                Ver proximos
              </button>
              <button type="button" onClick={() => setFeaturedStopId(null)}>
                Quitar destacada
              </button>
            </div>
          </div>
        ) : (
          <p>No hay parada destacada seleccionada.</p>
        )}

        <h2>Favoritas</h2>
        {favoriteStops.length === 0 ? (
          <p>No hay paradas favoritas todavia.</p>
        ) : (
          <ul className="results-list map-favorites-list">
            {favoriteStops.map((stop) => (
              <li key={stop.busstopId}>
                <strong>Parada {stop.busstopId}</strong>
                <span>{stopLabel(stop)}</span>
                <div className="map-popup-actions">
                  <button type="button" onClick={() => setFeaturedStop(stop.busstopId)}>
                    {featuredStopId === stop.busstopId ? "Destacada" : "Destacar"}
                  </button>
                  <button type="button" onClick={() => loadUpcomingForStop(stop)}>
                    Ver proximos
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <h2 className="map-section-title">Proximos en parada</h2>
        {selectedStop ? (
          <p className="meta">
            Parada {selectedStop.busstopId}: {stopLabel(selectedStop)}
          </p>
        ) : (
          <p>Selecciona una parada en el mapa.</p>
        )}

        {loadingUpcoming ? <p className="map-loading">Consultando proximos...</p> : null}

        {stopLines.length > 0 ? (
          <p className="meta">Lineas detectadas: {stopLines.map((line) => line.line).join(", ")}</p>
        ) : null}

        <ul className="results-list">
          {upcoming.map((bus, index) => (
            <li key={`${bus.lineVariantId}-${index}`}>
              <strong>{bus.line}</strong>
              <span>
                {bus.origin} - {bus.destination}
              </span>
            </li>
          ))}
          {!loadingUpcoming && selectedStop && upcoming.length === 0 ? (
            <li>Sin proximos resultados para la consulta actual.</li>
          ) : null}
        </ul>
      </aside>
    </section>
  );
}
