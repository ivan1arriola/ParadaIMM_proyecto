import { NextRequest, NextResponse } from "next/server";

import { getBusStops } from "../../../lib/imm-api";

export async function GET(request: NextRequest) {
  try {
    const busStops = await getBusStops();
    const q = request.nextUrl.searchParams.get("q")?.trim().toLowerCase();
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);

    const filtered = q
      ? busStops.filter((stop) => {
          return (
            String(stop.busstopId).includes(q) ||
            stop.street1.toLowerCase().includes(q) ||
            stop.street2.toLowerCase().includes(q)
          );
        })
      : busStops;

    return NextResponse.json(filtered.slice(0, Number.isFinite(limit) ? Math.max(1, limit) : 50));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
