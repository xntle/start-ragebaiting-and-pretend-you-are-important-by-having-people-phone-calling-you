// /app/api/voice/outbound-twiml/route.ts
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const note = searchParams.get("note") || "";

  const message = note?.trim()
    ? `Hello. An incredibly important person has summoned you for the following reason: ${note}.`
    : "Hello. An incredibly important person has summoned you.";

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
  <Pause length="1"/>
  <Say voice="alice">Please hold while we connect you. If you did not expect this call, you may hang up now.</Say>
</Response>`;

  return new Response(twiml, {
    headers: { "Content-Type": "text/xml" },
  });
}

// Very small XML escaper (enough for our note)
function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
