import Link from "next/link";

import { TransportDashboard } from "../components/transport-dashboard";

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Parada IMM</p>
        <h1>Dashboard de Transporte Público de Montevideo</h1>
        <p className="hero-copy">
          Esta interfaz usa rutas API de Next.js para consultar la API de transporte sin exponer tus
          credenciales en el navegador.
        </p>
        <p className="hero-link-row">
          <Link href="/paradas">Ir al mapa de paradas favoritas</Link>
        </p>
      </section>

      <TransportDashboard />
    </main>
  );
}
