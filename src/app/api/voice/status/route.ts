// /app/api/voice/status/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const data = Object.fromEntries(form.entries());
  // You could persist to a DB here
  console.log("Call status:", data);
  return NextResponse.json({ ok: true });
}
