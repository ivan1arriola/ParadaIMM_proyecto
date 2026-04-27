import { NextRequest, NextResponse } from "next/server";

import { getBuses } from "../../../lib/imm-api";

function parseCsvString(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : undefined;
}

function parseCsvNumber(value: string | null): number[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  return parsed.length > 0 ? parsed : undefined;
}

function parseNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const company = request.nextUrl.searchParams.get("company") || undefined;
    const lineVariantIds = parseCsvNumber(request.nextUrl.searchParams.get("lineVariantIds"));
    const busId = parseNumber(request.nextUrl.searchParams.get("busId"));
    const busstopId = parseNumber(request.nextUrl.searchParams.get("busstopId"));
    const lines = parseCsvString(request.nextUrl.searchParams.get("lines"));
    const format = request.nextUrl.searchParams.get("format") || undefined;

    const buses = await getBuses({
      company,
      lineVariantIds,
      busId,
      busstopId,
      lines,
      format,
    });

    return NextResponse.json(buses);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
