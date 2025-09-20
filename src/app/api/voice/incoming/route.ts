// /app/api/voice/incoming/route.ts
export async function POST() {
  const forward = process.env.FORWARD_TO_NUMBER;
  if (!forward) {
    // fallback: say something if we didn't set forwarding
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Say voice="alice">No forwarding number configured. Please try again later.</Say>
  </Response>`;
    return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Say voice="alice">Connecting you now. Please hold.</Say>
    <Dial callerId="${process.env.TWILIO_PHONE_NUMBER}">
      <Number>${forward}</Number>
    </Dial>
  </Response>`;

  return new Response(twiml, { headers: { "Content-Type": "text/xml" } });
}
