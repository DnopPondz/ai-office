// 6-digit PIN gate for the API. The PIN and session key live in Worker secrets
// (ACCESS_PIN, SESSION_SECRET); a correct PIN earns an HMAC-signed session cookie.

const AUTH_COOKIE = "wedeb_auth";
const SESSION_DAYS = 30;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILS = 5;
// A 6-digit PIN has 1,000,000 values; a global cap keeps distributed guessing impractical.
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX_FAILS = 100;

const encoder = new TextEncoder();

export interface LoginResult {
  status: number;
  body: Record<string, unknown>;
  cookie?: string;
}

export function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

// Secrets set by piping on Windows can carry a trailing CR/LF.
function accessPin(env: Env): string {
  return env.ACCESS_PIN?.trim() ?? "";
}

function configured(env: Env): boolean {
  return /^\d{6}$/.test(accessPin(env)) && (env.SESSION_SECRET?.trim().length ?? 0) >= 16;
}

async function sign(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.SESSION_SECRET.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  return x.byteLength === y.byteLength && crypto.subtle.timingSafeEqual(x, y);
}

// The PIN is part of the signed data, so changing the PIN logs everyone out.
function sessionPayload(env: Env, expires: number): string {
  return `session.${expires}.${accessPin(env)}`;
}

export async function isAuthed(request: Request, env: Env): Promise<boolean> {
  if (!configured(env)) return false;
  const token = readCookie(request, AUTH_COOKIE);
  const [expires, signature] = token?.split(".") ?? [];
  if (!expires || !signature || !(Number(expires) > Date.now())) return false;
  return safeEqual(signature, await sign(env, sessionPayload(env, Number(expires))));
}

export async function handleLogin(request: Request, env: Env): Promise<LoginResult> {
  if (!configured(env)) return { status: 503, body: { error: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า PIN" } };

  const body = await request.json<{ pin?: unknown }>().catch(() => ({ pin: undefined }));
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const ip = (await sign(env, `ip.${request.headers.get("CF-Connecting-IP") ?? "unknown"}`)).slice(0, 22);
  const now = Date.now();

  await env.DB.prepare("DELETE FROM login_attempts WHERE ts < ?").bind(now - GLOBAL_WINDOW_MS).run();
  const counts = await env.DB.prepare(
    `SELECT COALESCE(SUM(CASE WHEN ip = ?1 AND ts >= ?2 THEN 1 ELSE 0 END), 0) AS ip_fails,
            COUNT(*) AS global_fails
     FROM login_attempts`,
  )
    .bind(ip, now - IP_WINDOW_MS)
    .first<{ ip_fails: number; global_fails: number }>();
  const ipFails = counts?.ip_fails ?? 0;
  if (ipFails >= IP_MAX_FAILS || (counts?.global_fails ?? 0) >= GLOBAL_MAX_FAILS) {
    return { status: 429, body: { error: "ใส่ PIN ผิดหลายครั้งเกินไป รอ 15 นาทีแล้วลองใหม่" } };
  }

  if (!/^\d{6}$/.test(pin) || !safeEqual(pin, accessPin(env))) {
    await env.DB.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)").bind(ip, now).run();
    const left = IP_MAX_FAILS - ipFails - 1;
    return {
      status: 401,
      body: { error: left > 0 ? `PIN ไม่ถูกต้อง (เหลืออีก ${left} ครั้ง)` : "PIN ไม่ถูกต้อง ระบบล็อกไว้ 15 นาที" },
    };
  }

  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const token = `${expires}.${await sign(env, sessionPayload(env, expires))}`;
  return {
    status: 200,
    body: { ok: true },
    cookie: `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`,
  };
}
