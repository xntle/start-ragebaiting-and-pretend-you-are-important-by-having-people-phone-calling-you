import { NextRequest, NextResponse } from "next/server";
import { VapiClient } from "@vapi-ai/server-sdk";

export const runtime = "nodejs";

const serverAsstIds = {
  zuck: process.env.VAPI_ASSISTANT_ID_ZUCK,
  vc: process.env.VAPI_ASSISTANT_ID_VC,
  gf: process.env.VAPI_ASSISTANT_ID_GF,
} as const;

export async function POST(req: NextRequest) {
  try {
    const { to, note, persona } = await req.json();
    if (!to || typeof to !== "string") {
      return NextResponse.json(
        { error: "Missing 'to' phone number" },
        { status: 400 }
      );
    }

    const who =
      persona === "zuck" || persona === "vc" || persona === "gf"
        ? persona
        : "gf";
    const assistantId = serverAsstIds[who];
    if (!assistantId) {
      return NextResponse.json(
        { error: `Assistant not configured for ${who}` },
        { status: 500 }
      );
    }

    const token = process.env.VAPI_API_KEY!;
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID!;
    if (!token || !phoneNumberId) {
      return NextResponse.json(
        { error: "Missing Vapi credentials" },
        { status: 500 }
      );
    }

    const vapi = new VapiClient({ token });

    const call = await vapi.calls.create({
      phoneNumberId,
      assistantId,
      customer: { number: to },
      metadata: { persona: who, ...(note ? { note } : {}) },
    });

    return NextResponse.json({ id: call.id, persona: who });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
