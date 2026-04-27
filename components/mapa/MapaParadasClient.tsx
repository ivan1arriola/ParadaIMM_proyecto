"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";

import type { BusLine, BusStop, UpcomingBusWithStop } from "../../lib/types";

type ApiError = {
  error?: string;
};

type GeoFeature = {
  properties?: Record<string, unknown>;
  geometry?: {
    coordinates?: unknown;
  };
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

    return Array.from(
      new Set(
        parsed
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item))
      )
    );
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

function parseGeoStops(geo: unknown): BusStop[] {
  const features: GeoFeature[] =
    typeof geo === "object" && geo !== null && Array.isArray((geo as { features?: unknown[] }).features)
      ? ((geo as { features: GeoFeature[] }).features ?? [])
      : [];

  return features
    .map((feature: GeoFeature, idx: number) => {
      const props = feature.properties || {};
      const coords = feature.geometry?.coordinates;

      const lon = Array.isArray(coords) ? coords[0] : undefined;
      const lat = Array.isArray(coords) ? coords[1] : undefined;

      const busstopId =
        Number(props.busstopId ?? props.id ?? props.CODIGO ?? props.COD_PARADA) || idx + 1;

      return {
        busstopId,
        street1: String(props.street1 ?? props.NOMCALLE1 ?? props.CALLE1 ?? "") || "",
        street2: String(props.street2 ?? props.NOMCALLE2 ?? props.ESQUINA ?? "") || "",
        street1Id: Number(props.street1Id ?? props.CALLE1_ID ?? 0) || 0,
        street2Id: Number(props.street2Id ?? props.CALLE2_ID ?? 0) || 0,
        location: {
          type: "Point",
          coordinates: Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : [0, 0],
        },
      } as BusStop;
    })
    .filter(
      (value: BusStop, index: number, array: BusStop[]) =>
        array.findIndex((candidate: BusStop) => candidate.busstopId === value.busstopId) === index
    );
}

function MapRecenter({ position }: { position: [number, number] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!position) {
      return;
    }

    map.flyTo(position, Math.max(map.getZoom(), 15), {
      duration: 0.55,
    });
  }, [map, position]);

  return null;
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
  const [reloadTick, setReloadTick] = useState(0);
  const [focusPosition, setFocusPosition] = useState<[number, number] | null>(null);

  const normalizedSearch = search.trim().toLowerCase();

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
        // Priorizar API interna (mucho mas rapida y estable para UI interactiva)
        const data = await requestJSON<BusStop[]>("/api/busstops?limit=10000");

        if (active) {
          setAllStops(data);
          return;
        }
      } catch {
        try {
          // Fallback opcional: GeoJSON local pesado, solo si la API falla.
          const localResp = await fetch("/v_uptu_paradas.geojson");
          if (!localResp.ok) {
            throw new Error("No se pudo cargar el archivo local de paradas.");
          }

          const geo = await localResp.json();
          const mapped = parseGeoStops(geo);

          if (active) {
            setAllStops(mapped);
          }
        } catch (requestError) {
          if (active) {
            setError(
              requestError instanceof Error
                ? requestError.message
                : "No se pudieron cargar las paradas"
            );
          }
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
  }, [reloadTick]);

  const filteredStops = useMemo(() => {
    if (!normalizedSearch) {
      return allStops;
    }

    return allStops.filter((stop) => {
      const byId = String(stop.busstopId).includes(normalizedSearch);
      const byStreet1 = stop.street1?.toLowerCase().includes(normalizedSearch);
      const byStreet2 = stop.street2?.toLowerCase().includes(normalizedSearch);

      return byId || byStreet1 || byStreet2;
    });
  }, [allStops, normalizedSearch]);

  const visibleStops = useMemo(() => {
    const limit = normalizedSearch ? 550 : 180;
    return filteredStops.slice(0, limit);
  }, [filteredStops, normalizedSearch]);

  const searchResults = useMemo(() => {
    if (!normalizedSearch) {
      return [];
    }

    return filteredStops.slice(0, 8);
  }, [filteredStops, normalizedSearch]);

  const stopsById = useMemo(() => {
    const map = new Map<number, BusStop>();

    allStops.forEach((stop) => {
      map.set(stop.busstopId, stop);
    });

    return map;
  }, [allStops]);

  const favoriteStops = useMemo(() => {
    return favorites
      .map((id) => stopsById.get(id))
      .filter((stop): stop is BusStop => Boolean(stop));
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

  function handleSelectStop(stop: BusStop) {
    setSelectedStop(stop);
    setStopLines([]);
    setUpcoming([]);
    setError(null);
    setFocusPosition(stopCoordinates(stop));
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

      const query = new URLSearchParams({
        lines: queryLines.join(","),
      });

      const buses = await requestJSON<UpcomingBusWithStop[]>(
        `/api/busstops/${stop.busstopId}/upcoming?${query.toString()}`
      );

      setUpcoming(buses);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudieron cargar los próximos buses"
      );
    } finally {
      setLoadingUpcoming(false);
    }
  }

  return (
    <section className="stops-page">
      <header className="stops-header">
        <div>
          <h1>Paradas de ómnibus</h1>
          <p>Buscá una parada, guardala como favorita y consultá los próximos buses.</p>
        </div>

        <div className="stops-header-meta" aria-live="polite">
          {loadingStops ? "Cargando paradas..." : `${allStops.length} paradas cargadas`}
        </div>
      </header>

      {error ? <p className="stops-error">{error}</p> : null}

      <div className="stops-layout">
        <main className="map-card">
          <div className="map-search-bar">
            <label htmlFor="paradas-search">Buscar parada</label>

            <input
              id="paradas-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código, calle o esquina"
            />

            <span>
              Mostrando {visibleStops.length} de {filteredStops.length}
            </span>

            <button
              type="button"
              className="reload-button"
              onClick={() => setReloadTick((value) => value + 1)}
              disabled={loadingStops}
            >
              {loadingStops ? "Actualizando..." : "Recargar paradas"}
            </button>
          </div>

          {searchResults.length > 0 ? (
            <div className="search-results-strip">
              {searchResults.map((stop) => (
                <button
                  key={stop.busstopId}
                  type="button"
                  onClick={() => handleSelectStop(stop)}
                  className={
                    selectedStop?.busstopId === stop.busstopId
                      ? "search-result active"
                      : "search-result"
                  }
                >
                  <strong>#{stop.busstopId}</strong>
                  <span>{stopLabel(stop)}</span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="map-frame">
            {loadingStops ? (
              <p className="map-loading">Cargando mapa...</p>
            ) : (
              <MapContainer
                center={MONTEVIDEO_CENTER}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom
              >
                <MapRecenter position={focusPosition} />
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
                        <div className="stop-popup">
                          <strong>Parada {stop.busstopId}</strong>
                          <span>{stopLabel(stop)}</span>

                          <div className="popup-actions">
                            <button type="button" onClick={() => handleSelectStop(stop)}>
                              Seleccionar
                            </button>

                            <button type="button" onClick={() => toggleFavorite(stop.busstopId)}>
                              {favorite ? "Quitar favorita" : "Agregar favorita"}
                            </button>

                            <button type="button" onClick={() => setFeaturedStopId(stop.busstopId)}>
                              {isFeatured ? "Destacada" : "Destacar"}
                            </button>

                            <button type="button" onClick={() => loadUpcomingForStop(stop)}>
                              Ver próximos
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
        </main>

        <aside className="stops-panel">
          <section className="panel-section selected-stop-card">
            <div className="section-heading">
              <h2>Parada seleccionada</h2>
            </div>

            {selectedStop ? (
              <>
                <div className="selected-stop-title">
                  <strong>Parada {selectedStop.busstopId}</strong>
                  <span>{stopLabel(selectedStop)}</span>
                </div>

                <div className="action-grid">
                  <button type="button" onClick={() => toggleFavorite(selectedStop.busstopId)}>
                    {isFavorite(selectedStop.busstopId) ? "Quitar favorita" : "Agregar favorita"}
                  </button>

                  <button type="button" onClick={() => setFeaturedStopId(selectedStop.busstopId)}>
                    {featuredStopId === selectedStop.busstopId ? "Destacada" : "Destacar"}
                  </button>

                  <button
                    type="button"
                    className="primary-action"
                    onClick={() => loadUpcomingForStop(selectedStop)}
                  >
                    Ver próximos
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-state">Seleccioná una parada desde el mapa o desde la búsqueda.</p>
            )}
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <h2>Próximos buses</h2>
            </div>

            {selectedStop ? (
              <p className="panel-meta">
                Parada {selectedStop.busstopId}: {stopLabel(selectedStop)}
              </p>
            ) : null}

            {loadingUpcoming ? <p className="map-loading">Consultando próximos...</p> : null}

            {!loadingUpcoming && stopLines.length > 0 ? (
              <p className="panel-meta">
                Líneas detectadas: {stopLines.map((line) => line.line).join(", ")}
              </p>
            ) : null}

            <ul className="compact-list">
              {upcoming.map((bus, index) => (
                <li key={`${bus.lineVariantId}-${index}`}>
                  <strong>{bus.line}</strong>
                  <span>
                    {bus.origin} → {bus.destination}
                  </span>
                </li>
              ))}

              {!loadingUpcoming && selectedStop && upcoming.length === 0 ? (
                <li className="empty-list-item">Sin próximos resultados para esta parada.</li>
              ) : null}

              {!selectedStop ? (
                <li className="empty-list-item">Todavía no seleccionaste una parada.</li>
              ) : null}
            </ul>
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <h2>Parada destacada</h2>
            </div>

            {featuredStop ? (
              <div className="saved-stop-card">
                <strong>Parada {featuredStop.busstopId}</strong>
                <span>{stopLabel(featuredStop)}</span>

                <div className="small-actions">
                  <button type="button" onClick={() => handleSelectStop(featuredStop)}>
                    Seleccionar
                  </button>

                  <button type="button" onClick={() => loadUpcomingForStop(featuredStop)}>
                    Ver próximos
                  </button>

                  <button type="button" onClick={() => setFeaturedStopId(null)}>
                    Quitar
                  </button>
                </div>
              </div>
            ) : (
              <p className="empty-state">No hay parada destacada.</p>
            )}
          </section>

          <section className="panel-section">
            <div className="section-heading">
              <h2>Favoritas</h2>
              <span>{favoriteStops.length}</span>
            </div>

            {favoriteStops.length === 0 ? (
              <p className="empty-state">No hay favoritas todavía.</p>
            ) : (
              <ul className="favorites-list">
                {favoriteStops.map((stop) => (
                  <li key={stop.busstopId}>
                    <button type="button" onClick={() => handleSelectStop(stop)}>
                      <strong>#{stop.busstopId}</strong>
                      <span>{stopLabel(stop)}</span>
                    </button>

                    <button type="button" onClick={() => loadUpcomingForStop(stop)}>
                      Próximos
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
