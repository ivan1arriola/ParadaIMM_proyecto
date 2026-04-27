import { NextRequest, NextResponse } from "next/server";

import { getBusStop, getUpcomingBuses } from "../../../../../lib/imm-api";
import type { UpcomingBusWithStop } from "../../../../../lib/types";

type Params = {
  params: Promise<{ busstopId: string }>;
};

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { busstopId } = await params;
    const linesParam = request.nextUrl.searchParams.get("lines");
    const lineVariantIdsParam = request.nextUrl.searchParams.get("lineVariantIds");
    const amountperlineParam = request.nextUrl.searchParams.get("amountperline");
    const formatParam = request.nextUrl.searchParams.get("format");

    if (!busstopId) {
      return NextResponse.json({ error: "busstopId es requerido" }, { status: 400 });
    }

    if (!linesParam) {
      return NextResponse.json({ error: "lines es requerido (ej: 199,300)" }, { status: 400 });
    }

    const lines = linesParam
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return NextResponse.json({ error: "Debes enviar al menos una linea" }, { status: 400 });
    }

    const lineVariantIds = lineVariantIdsParam
      ? lineVariantIdsParam
          .split(",")
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isFinite(value))
      : undefined;

    const amountperline = amountperlineParam ? Number(amountperlineParam) : undefined;

    const [upcoming, busStop] = await Promise.all([
      getUpcomingBuses(busstopId, {
        lines,
        lineVariantIds,
        amountperline: Number.isFinite(amountperline) ? amountperline : undefined,
        format: formatParam || undefined,
      }),
      getBusStop(busstopId).catch(() => null),
    ]);

    const response: UpcomingBusWithStop[] = upcoming.map((bus) => ({
      ...bus,
      busStop,
    }));

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
