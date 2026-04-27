import { NextResponse } from "next/server";

import { getBusStop } from "../../../../lib/imm-api";

type Params = {
  params: Promise<{ busstopId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { busstopId } = await params;

    if (!busstopId) {
      return NextResponse.json({ error: "busstopId es requerido" }, { status: 400 });
    }

    const busStop = await getBusStop(busstopId);
    return NextResponse.json(busStop);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
