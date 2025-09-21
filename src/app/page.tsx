"use client";

import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

type Persona = "zuck" | "vc" | "gf";

const webAsstIds: Record<Persona, string> = {
  zuck: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_ZUCK!,
  vc: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_VC!,
  gf: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID_GF!,
};

function isE164(n: string) {
  return /^\+?[1-9]\d{1,14}$/.test(n);
}

export default function Home() {
  const [msg, setMsg] = useState<string | null>(null);

  // Persona
  const [persona, setPersona] = useState<Persona>("gf");

  // Browser (Web SDK)
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

    return () => {
      vapi.removeAllListeners();
    };
  }, []);

  async function startBrowserCall() {
    const asst = webAsstIds[persona];
    if (!asst) return setMsg(`❌ Missing assistant id for ${persona} (web)`);
    await vapiRef.current?.start(asst);
    setInBrowserCall(true);
  }
  function stopBrowserCall() {
    vapiRef.current?.stop();
  }

  // Three numbers
  const [numbers, setNumbers] = useState<string[]>(["", "", ""]);
  const [note, setNote] = useState("");
  const [calling, setCalling] = useState(false);

  const validNumbers = numbers.filter((n) => isE164(n));

  function updateNumber(i: number, v: string) {
    setNumbers((arr) => arr.map((x, idx) => (idx === i ? v : x)));
  }

  // Call once: all numbers at once
  async function callAllOnce() {
    if (validNumbers.length === 0) {
      setMsg("❌ Enter at least one valid E.164 number.");
      return;
    }
    try {
      setCalling(true);
      const res = await fetch("/api/vapi/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: validNumbers, note, persona }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start calls");
      const okCount = Array.isArray(data.results)
        ? data.results.filter((r: any) => r.ok).length
        : data.id
        ? 1
        : 0;
      setMsg(
        `📞 Created ${okCount}/${
          validNumbers.length
        } call(s) as ${persona.toUpperCase()}`
      );
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setCalling(false);
    }
  }

  // Call once: first valid only
  async function callFirstOnce() {
    if (validNumbers.length === 0) {
      setMsg("❌ Enter at least one valid E.164 number.");
      return;
    }
    try {
      setCalling(true);
      const res = await fetch("/api/vapi/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: validNumbers[0], note, persona }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start call");
      setMsg(`📞 Call created (${persona.toUpperCase()}): ${data.id ?? "OK"}`);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setCalling(false);
    }
  }

  // Auto: round-robin every X seconds across validNumbers
  const [autoRunning, setAutoRunning] = useState(false);
  const [intervalSec, setIntervalSec] = useState<number>(30); // default 30s
  const [callsMade, setCallsMade] = useState(0);
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rrIndexRef = useRef<number>(0);

  async function callRoundRobinOnce() {
    if (validNumbers.length === 0) return;
    const target = validNumbers[rrIndexRef.current % validNumbers.length];
    rrIndexRef.current = (rrIndexRef.current + 1) % validNumbers.length;

    try {
      await fetch("/api/vapi/outbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: target, note, persona }),
      });
      setCallsMade((n) => n + 1);
    } catch {
      // swallow error for auto loop; status shows in logs/server
    }
  }

  function scheduleNext(sec: number) {
    const ms = Math.max(5, Math.floor(sec)) * 1000;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(async () => {
      await callRoundRobinOnce();
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
    if (validNumbers.length === 0) {
      setMsg("❌ Enter at least one valid E.164 number.");
      return;
    }
    if (!Number.isFinite(intervalSec) || intervalSec < 5) {
      setMsg("❌ Interval must be ≥ 5 seconds.");
      return;
    }
    rrIndexRef.current = 0; // start from the first valid number
    setAutoRunning(true);
    setCallsMade(0);
    setMsg(
      `▶️ Auto round-robin every ${intervalSec}s across ${
        validNumbers.length
      } number(s) as ${persona.toUpperCase()}`
    );
    // fire immediately, then schedule
    await callRoundRobinOnce();
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
            Three targets, personas, and round-robin auto-calls via Vapi.
          </p>
        </header>

        {/* Persona */}
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
            Uses Vapi Web SDK in your browser.
          </p>
        </section>

        {/* Outbound phone: 3 numbers */}
        <section className="space-y-3 border rounded-xl p-4">
          <h2 className="font-medium">Vapi (Phone) — up to 3 numbers</h2>

          {[0, 1, 2].map((i) => (
            <div className="space-y-2" key={i}>
              <label className="text-sm">Number {i + 1}</label>
              <input
                className="w-full border rounded-lg p-2"
                placeholder="+15551234567"
                value={numbers[i]}
                onChange={(e) => updateNumber(i, e.target.value)}
                pattern="^\\+?[1-9]\\d{1,14}$"
                disabled={autoRunning}
              />
            </div>
          ))}

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

          <div className="flex gap-2">
            <button
              onClick={callFirstOnce}
              disabled={calling || autoRunning}
              className="flex-1 rounded-xl p-3 border hover:bg-black hover:text-white transition"
            >
              Call first valid
            </button>
            <button
              onClick={callAllOnce}
              disabled={calling || autoRunning}
              className="flex-1 rounded-xl p-3 border hover:bg-black hover:text-white transition"
            >
              Call all now
            </button>
          </div>
        </section>

        {/* Auto calls round-robin */}
        <section className="space-y-3 border rounded-xl p-4">
          <h2 className="font-medium">Auto (round-robin every X seconds)</h2>
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
              <p className="text-xs opacity-70">Default 30s</p>
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
            <div>Valid numbers: {validNumbers.length}</div>
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
