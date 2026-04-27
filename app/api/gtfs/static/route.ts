import { NextResponse } from "next/server";

import { getGtfsLatestZip } from "../../../../lib/imm-api";

export async function GET() {
  try {
    const zip = await getGtfsLatestZip();

    return new NextResponse(zip.bytes, {
      status: 200,
      headers: {
        "content-type": zip.contentType,
        "content-disposition": 'attachment; filename="google_transit.zip"',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
