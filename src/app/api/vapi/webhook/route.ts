import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Example: { message: { type: 'status-update' | 'transcript' | 'function-call', ... } }
  console.log("Vapi webhook:", JSON.stringify(body, null, 2));
  return NextResponse.json({ ok: true });
}
