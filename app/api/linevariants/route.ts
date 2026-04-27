import { NextResponse } from "next/server";

import { getLineVariants } from "../../../lib/imm-api";

export async function GET() {
  try {
    const variants = await getLineVariants();
    return NextResponse.json(variants);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
