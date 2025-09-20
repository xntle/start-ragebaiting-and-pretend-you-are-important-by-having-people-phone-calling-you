import { NextRequest, NextResponse } from "next/server";
import { getTwilioClient } from "@/app/lib/twilio";

export const runtime = "nodejs";

function getPublicBaseUrl(req: NextRequest) {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv; // must be https and publicly reachable
  // If you REALLY want a fallback, block localhost to avoid Twilio 21205.
  const host = req.headers.get("host") || "";
  if (/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
    throw new Error(
      "Public base URL not set. Add NEXT_PUBLIC_APP_URL=https://<your-ngrok>.ngrok-free.app"
    );
  }
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
  try {
    const { to, note } = await req.json();
    if (!to)
      return NextResponse.json(
        { error: "Missing 'to' phone number" },
        { status: 400 }
      );

    const from = process.env.TWILIO_PHONE_NUMBER!;
    if (!from)
      return NextResponse.json(
        { error: "Missing TWILIO_PHONE_NUMBER" },
        { status: 500 }
      );

    const base = getPublicBaseUrl(req); // ← will be your ngrok URL
    const twimlUrl = `${base}/api/voice/outbound-twiml?note=${encodeURIComponent(
      note || ""
    )}`;

    const client = getTwilioClient();
    const call = await client.calls.create({
      to,
      from,
      url: twimlUrl, // must be public https
      statusCallback: `${base}/api/voice/status`,
      statusCallbackEvent: [
        "queued",
        "initiated",
        "ringing",
        "answered",
        "completed",
      ],
      statusCallbackMethod: "POST",
    });

    return NextResponse.json({ callSid: call.sid });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
