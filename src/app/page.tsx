"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Vapi from "@vapi-ai/web";

type Persona = "zuck" | "vc" | "gf";

const webAsstIds: Record<Persona, string> = {
  zuck: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_ZUCK!,
  vc: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_VC!,
  gf: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_GF!,
};

export default function Home() {
  const [msg, setMsg] = useState<string | null>(null);

  // Persona selection (affects browser + phone calls)
  const [persona, setPersona] = useState<Persona>("gf");

  // --- Vapi Web SDK (browser) ---
  const [inBrowserCall, setInBrowserCall] = useState(false);
  const vapiRef = useRef<Vapi | null>(null);

  useEffect(() => {
    const pk = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!;
    if (!pk) setMsg("❌ Missing NEXT_PUBLIC_VAPI_PUBLIC_KEY");
    const vapi = new Vapi(pk);
    vapiRef.current = vapi;

    vapi.on("call-start", () => setMsg("🎙️ Browser call started"));
    vapi.on("call-end", () => {
      setMsg("🛑 Browser call ended");
      setInBrowserCall(false);
    });
    vapi.on("message", (m: any) => {
      // Example: transcripts or assistant messages if you want them
      // if (m.type === "transcript") console.log(`${m.role}: ${m.transcript}`);
    });

    return () => {
      vapi.removeAllListeners();
    };
  }, []);

  async function startBrowserCall() {
    const asst = webAsstIds[persona];
    if (!asst) {
      setMsg(`❌ Missing assistant id for ${persona} (web)`);
      return;
    }
    await vapiRef.current?.start(asst);
    setInBrowserCall(true);
  }
  function stopBrowserCall() {
    vapiRef.current?.stop();
  }

  // --- OUTBOUND PHONE CALL via Vapi (server route) ---
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [calling, setCalling] = useState(false);

  async function callPhoneOnce() {
    if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
      setMsg("❌ Enter E.164 (e.g., +15551234567)");
      return;
    }
    try {
      setCalling(true);
      const res = await fetch("/api/vapi/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, note, persona }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start call");
      setMsg(`📞 ${persona.toUpperCase()} call created: ${data.id}`);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setCalling(false);
    }
  }

  // --- Auto phone calls every X seconds ---
  const [autoRunning, setAutoRunning] = useState(false);
  const [callsMade, setCallsMade] = useState(0);
  const [intervalSec, setIntervalSec] = useState<number>(30); // default 30s
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function scheduleNext(sec: number) {
    const ms = Math.max(5, Math.floor(sec)) * 1000; // guard min 5s
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      await callPhoneOnce();
      setCallsMade((n) => n + 1);
      const t = new Date(Date.now() + ms);
      setNextAt(t);
      setCountdown(Math.floor(ms / 1000));
    }, ms);

    const t = new Date(Date.now() + ms);
    setNextAt(t);
    setCountdown(Math.floor(ms / 1000));

    if (cdRef.current) clearInterval(cdRef.current);
    cdRef.current = setInterval(() => {
      setCountdown((s) => (s !== null ? Math.max(0, s - 1) : null));
    }, 1000);
  }

  async function startAuto() {
    if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
      setMsg("❌ Enter a valid E.164 phone number first.");
      return;
    }
    if (!Number.isFinite(intervalSec) || intervalSec < 5) {
      setMsg("❌ Interval must be ≥ 5 seconds.");
      return;
    }
    setAutoRunning(true);
    setCallsMade(0);
    setMsg(`▶️ Auto-calling every ${intervalSec}s as ${persona.toUpperCase()}`);
    // fire immediately, then schedule
    await callPhoneOnce();
    setCallsMade(1);
    scheduleNext(intervalSec);
  }

  function stopAuto() {
    setAutoRunning(false);
    if (tickRef.current) clearInterval(tickRef.current);
    if (cdRef.current) clearInterval(cdRef.current);
    tickRef.current = null;
    cdRef.current = null;
    setNextAt(null);
    setCountdown(null);
    setMsg("⏹️ Auto-calling stopped.");
  }

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (cdRef.current) clearInterval(cdRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">
            start-ragebaiting-and-pretend-you-are-important-by-having-people-phone-calling-you
          </h1>
          <p className="text-sm opacity-80">
            Choose a persona, talk in-browser with Vapi, or place repeated phone
            calls via Vapi.
          </p>
        </header>

        {/* Persona selector */}
        <section className="space-y-2 border rounded-xl p-4">
          <label className="text-sm">Persona</label>
          <select
            className="w-full border rounded-lg p-2"
            value={persona}
            onChange={(e) => setPersona(e.target.value as Persona)}
            disabled={inBrowserCall || autoRunning || calling}
          >
            <option value="zuck">“Mark-zuck” tech-CEO vibe (parody)</option>
            <option value="vc">Venture Capitalist vibe</option>
            <option value="gf">Girlfriend</option>
          </select>
          <p className="text-xs opacity-70">
            Browser calls and phone calls will use this assistant/persona.
          </p>
        </section>

        {/* Browser voice */}
        <section className="space-y-3 border rounded-xl p-4">
          <h2 className="font-medium">Vapi (Browser)</h2>
          {!inBrowserCall ? (
            <button
              onClick={startBrowserCall}
              className="rounded-xl p-3 border hover:bg-black hover:text-white transition w-full"
              disabled={!webAsstIds[persona]}
            >
              Start browser call ({persona})
            </button>
          ) : (
            <button
              onClick={stopBrowserCall}
              className="rounded-xl p-3 border hover:bg-black hover:text-white transition w-full"
            >
              Stop
            </button>
          )}
          <p className="text-xs opacity-70">
            Uses Vapi Web SDK to start a real-time voice session. Mic permission
            required.
          </p>
        </section>

        {/* Outbound phone (single) */}
        <section className="space-y-3 border rounded-xl p-4">
          <h2 className="font-medium">Vapi (Phone)</h2>
          <div className="space-y-2">
            <label className="text-sm">Phone number to call</label>
            <input
              className="w-full border rounded-lg p-2"
              placeholder="+15551234567"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              pattern="^\\+?[1-9]\\d{1,14}$"
              disabled={autoRunning}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Note (optional)</label>
            <input
              className="w-full border rounded-lg p-2"
              placeholder="why you’re calling"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              disabled={autoRunning}
            />
          </div>
          <button
            onClick={callPhoneOnce}
            disabled={calling || autoRunning}
            className="rounded-xl p-3 border hover:bg-black hover:text-white transition w-full"
          >
            {calling ? "Calling…" : `Call once (${persona})`}
          </button>
        </section>

        {/* Auto phone calls every X seconds */}
        <section className="space-y-3 border rounded-xl p-4">
          <h2 className="font-medium">Auto Calls (every X seconds)</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm">Interval (seconds)</label>
              <input
                type="number"
                min={5}
                step={5}
                className="w-full border rounded-lg p-2"
                value={intervalSec}
                onChange={(e) =>
                  setIntervalSec(Math.max(5, Number(e.target.value) || 30))
                }
                disabled={autoRunning}
              />
              <p className="text-xs opacity-70">Default is 30s.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm">Actions</label>
              <div className="flex gap-2">
                {!autoRunning ? (
                  <button
                    onClick={startAuto}
                    className="flex-1 rounded-xl p-2 border hover:bg-black hover:text-white transition"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={stopAuto}
                    className="flex-1 rounded-xl p-2 border hover:bg-black hover:text-white transition"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-sm space-y-1">
            <div>Status: {autoRunning ? "🟢 Running" : "⚪️ Idle"}</div>
            <div>Persona: {persona.toUpperCase()}</div>
            <div>Calls made this session: {callsMade}</div>
            {nextAt && autoRunning && (
              <div>
                Next call at: {nextAt.toLocaleTimeString()}{" "}
                {typeof countdown === "number" && `(${countdown}s)`}
              </div>
            )}
          </div>
        </section>

        {msg && <p className="text-sm">{msg}</p>}
      </div>
    </div>
  );
}
