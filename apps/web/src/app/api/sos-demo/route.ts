import { NextResponse } from "next/server";

/**
 * Review-demo SOS dispatch (server-only; secrets never reach the browser).
 * Sends the supervisor a Telegram message (+ location) and places one Twilio voice call, so the
 * SOS hold shows a real phone ringing. Track B's Edge Functions own the real pipeline (event
 * pipeline §3); this route is the stand-in until F13 switches the SosPort to the RPC.
 *
 * Guards: SOS_LIVE must be "1" (Shlok's OK; Twilio is a $5.90 trial); each request_id is
 * dispatched once; at most one live dispatch per 60 s and 20 per server instance, because the
 * route has no auth and anyone with the URL could otherwise run the trial down.
 */
export const runtime = "nodejs";

type Body = { request_id?: string; lat?: number | null; lon?: number | null; lang?: "en" | "hi" | "ta" };

const seen = new Map<string, unknown>();
const COOLDOWN_MS = 60_000;
const MAX_LIVE_PER_INSTANCE = 20;
let lastLiveAt = 0;
let liveCount = 0;

function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

async function telegram(text: string, lat: number | null, lon: number | null) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chat = env("TELEGRAM_SUPERVISOR_CHAT_ID");
  if (!token || !chat) return { status: "skipped", reason: "no telegram env" };
  const base = `https://api.telegram.org/bot${token}`;
  const msg = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  if (!msg.ok) return { status: "failed", reason: `telegram ${msg.status}` };
  if (lat !== null && lon !== null) {
    await fetch(`${base}/sendLocation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, latitude: lat, longitude: lon }),
    });
  }
  return { status: "sent" };
}

async function twilioCall(sayEn: string, sayHi: string) {
  const sid = env("TWILIO_ACCOUNT_SID");
  const auth = env("TWILIO_AUTH_TOKEN");
  const from = env("TWILIO_FROM_NUMBER");
  const to = env("DEMO_SUPERVISOR_PHONE");
  if (!sid || !auth || !from || !to) return { status: "skipped", reason: "no twilio env" };
  const twiml =
    `<Response><Say language="en-IN">${sayEn}</Say><Pause length="1"/>` +
    `<Say language="hi-IN">${sayHi}</Say><Pause length="1"/><Say language="en-IN">${sayEn}</Say></Response>`;
  const form = new URLSearchParams({ To: to, From: from, Twiml: twiml });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString("base64")}` },
    body: form,
  });
  if (!res.ok) return { status: "failed", reason: `twilio ${res.status}` };
  const data = (await res.json()) as { sid?: string };
  return { status: "sent", call_sid: data.sid ?? null };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const requestId = body.request_id ?? crypto.randomUUID();
  const lat = typeof body.lat === "number" ? body.lat : null;
  const lon = typeof body.lon === "number" ? body.lon : null;
  const now = new Date();
  const time = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

  const result = {
    alert_id: `demo-${requestId}`,
    escalate_at: new Date(now.getTime() + 60_000).toISOString(),
    server_now: now.toISOString(),
    location_source: lat !== null ? "device" : "machine",
  } as const;

  if (seen.has(requestId)) return NextResponse.json({ ...result, dispatch: seen.get(requestId), deduped: true });

  const live = env("SOS_LIVE") === "1";
  let dispatch: Record<string, unknown>;
  if (!live) {
    dispatch = { mode: "dry_run", telegram: { status: "dry_run" }, twilio: { status: "dry_run" } };
  } else if (Date.now() - lastLiveAt < COOLDOWN_MS || liveCount >= MAX_LIVE_PER_INSTANCE) {
    dispatch = { mode: "throttled", telegram: { status: "cooldown" }, twilio: { status: "cooldown" } };
  } else {
    lastLiveAt = Date.now();
    liveCount += 1;
    const where = lat !== null && lon !== null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "machine location";
    const text = `SOS from Ravi (operator) · EXC-007 · Nagpur quarry · ${time} IST\nLocation: ${where}\nSpotter demo dispatch.`;
    const [tg, call] = await Promise.all([
      telegram(text, lat, lon),
      twilioCall(
        "S O S from Ravi on excavator E X C 0 0 7 at Nagpur quarry. Please respond now.",
        "नागपुर खदान में रवि ने ई एक्स सी 007 से एस ओ एस भेजा है। कृपया तुरंत जवाब दें।",
      ),
    ]);
    dispatch = { mode: "live", telegram: tg, twilio: call };
  }
  seen.set(requestId, dispatch);
  return NextResponse.json({ ...result, dispatch });
}
