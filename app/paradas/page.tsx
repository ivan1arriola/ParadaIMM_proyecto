import Link from "next/link";

import MapaParadas from "../../components/mapa/MapaParadas";

export default function ParadasPage() {
  return (
    <main className="page-shell map-page-shell">
      <section className="hero">
        <p className="eyebrow">Paradas IMM</p>
        <h1>Mapa de paradas favoritas y proximos buses</h1>
        <p className="hero-copy">
          Busca paradas por codigo o calle, guardalas en favoritas y consulta proximos buses sin salir del
          mapa.
        </p>
        <p className="hero-link-row">
          <Link href="/">Volver al dashboard principal</Link>
        </p>
      </section>

      <MapaParadas />
    </main>
  );
}
