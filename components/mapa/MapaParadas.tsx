"use client";

import dynamic from "next/dynamic";

const MapaParadasClient = dynamic(() => import("./MapaParadasClient"), {
  ssr: false,
  loading: () => <p className="map-loading">Cargando mapa...</p>,
});

export default function MapaParadas() {
  return <MapaParadasClient />;
}
