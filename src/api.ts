import type { GameState } from "../shared/types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new ApiError(data?.error ?? `เซิร์ฟเวอร์ตอบกลับ ${res.status}`, res.status);
  return data;
}

export const api = {
  login: (pin: string) => call<{ ok: true }>("/api/login", { pin }),
  state: () => call<GameState>("/api/state"),
  advance: () => call<GameState>("/api/advance", {}),
  decide: (optionId: string) => call<GameState>("/api/decide", { optionId }),
  reset: () => call<GameState>("/api/reset", {}),
};
