// /app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export default function Home() {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [minutes, setMinutes] = useState<number>(1); // default 1
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [callsMade, setCallsMade] = useState(0);
  const [nextAt, setNextAt] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null); // seconds

  async function placeCall() {
    try {
      setLoading(true);
      const res = await fetch("/api/voice/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start call");
      setMsg(`📞 Call started! SID: ${data.callSid}`);
      setCallsMade((n) => n + 1);
    } catch (err: any) {
      setMsg(`❌ ${err.message}`);
      // If we fail while running, keep the interval going; user can stop manually.
    } finally {
      setLoading(false);
    }
  }

  function scheduleNextTick(mins: number) {
    const ms = Math.max(1, Math.floor(mins)) * 60_000;
    if (timerRef.current) clearInterval(timerRef.current);
    // schedule repeating
    timerRef.current = setInterval(() => {
      void placeCall();
      const t = new Date(Date.now() + ms);
      setNextAt(t);
      setCountdown(Math.floor(ms / 1000));
    }, ms);

    // set “next at” right now (first one fires immediately in start())
    const t = new Date(Date.now() + ms);
    setNextAt(t);
    setCountdown(Math.floor(ms / 1000));

    // countdown display (1-second tick)
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((s) => (s !== null ? Math.max(0, s - 1) : null));
    }, 1000);
  }

  async function start() {
    if (!/^\+?[1-9]\d{1,14}$/.test(to)) {
      setMsg("❌ Please enter a valid E.164 number (e.g., +15551234567).");
      return;
    }
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins < 1) {
      setMsg("❌ Interval must be at least 1 minute.");
      return;
    }
    setRunning(true);
    setCallsMade(0);
    setMsg("▶️ Auto-calling started.");
    // Fire immediately, then schedule repeats
    await placeCall();
    scheduleNextTick(mins);
  }

  function stop() {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    timerRef.current = null;
    countdownRef.current = null;
    setNextAt(null);
    setCountdown(null);
    setMsg("⏹️ Auto-calling stopped.");
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
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
            Trigger a Twilio call now—or start a repeating call every X minutes.
          </p>
        </header>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm">Phone number to call (E.164)</label>
            <input
              className="w-full border rounded-lg p-2"
              placeholder="+15551234567"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              required
              pattern="^\+?[1-9]\d{1,14}$"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Reason / note (optional)</label>
            <input
              className="w-full border rounded-lg p-2"
              placeholder="summoned by a Very Important Person"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm">Interval (minutes)</label>
              <input
                type="number"
                min={1}
                step={1}
                className="w-full border rounded-lg p-2"
                value={minutes}
                onChange={(e) =>
                  setMinutes(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm">Actions</label>
              <div className="flex gap-2">
                <button
                  onClick={placeCall}
                  disabled={loading || running}
                  className="flex-1 rounded-xl p-2 border hover:bg-black hover:text-white transition"
                >
                  {loading ? "Calling…" : "Call once"}
                </button>
                {!running ? (
                  <button
                    onClick={start}
                    className="flex-1 rounded-xl p-2 border hover:bg-black hover:text-white transition"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={stop}
                    className="flex-1 rounded-xl p-2 border hover:bg-black hover:text-white transition"
                  >
                    Stop
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="text-sm space-y-1">
            <div>Status: {running ? "🟢 Running" : "⚪️ Idle"}</div>
            <div>Calls made this session: {callsMade}</div>
            {nextAt && running && (
              <div>
                Next call at: {nextAt.toLocaleTimeString()}{" "}
                {typeof countdown === "number" && `(${countdown}s)`}
              </div>
            )}
          </div>

          {msg && <p className="text-sm">{msg}</p>}

          <footer className="text-xs opacity-70">
            This repeats while this tab is open. For server-side scheduling
            (runs even if your tab/app isn’t open), we can add a cron (e.g.,
            cron job / queue worker) later.
          </footer>
        </div>
      </div>
    </div>
  );
}
