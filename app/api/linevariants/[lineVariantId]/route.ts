import { NextResponse } from "next/server";

import { getLineVariantDetails } from "../../../../lib/imm-api";

type Params = {
  params: Promise<{ lineVariantId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { lineVariantId } = await params;

    if (!lineVariantId) {
      return NextResponse.json({ error: "lineVariantId es requerido" }, { status: 400 });
    }

    const lineVariant = await getLineVariantDetails(lineVariantId);

    if (!lineVariant) {
      return NextResponse.json({ error: "No se encontro la variante solicitada" }, { status: 404 });
    }

    return NextResponse.json(lineVariant);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
