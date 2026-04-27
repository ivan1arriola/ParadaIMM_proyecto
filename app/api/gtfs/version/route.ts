import { NextResponse } from "next/server";

import { getGtfsLatestVersion } from "../../../../lib/imm-api";

export async function GET() {
  try {
    const version = await getGtfsLatestVersion();

    return new NextResponse(version, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
