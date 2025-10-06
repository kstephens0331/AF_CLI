import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
