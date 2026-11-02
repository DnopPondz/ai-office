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

// Every call returns the game state with only the messages newer than `since`.
export const api = {
  login: (pin: string) => call<{ ok: true }>("/api/login", { pin }),
  state: (since: number) => call<GameState>(`/api/state?since=${since}`),
  chat: (channel: string, text: string, since: number) => call<GameState>(`/api/chat?since=${since}`, { channel, text }),
  answer: (ticketId: string, choice: { optionId?: string; text?: string }, since: number) =>
    call<GameState>(`/api/answer?since=${since}`, { ticketId, ...choice }),
  team: (action: "raise" | "promote" | "fire" | "hire", target: { employeeId?: string; role?: string }, since: number) =>
    call<GameState>(`/api/team?since=${since}`, { action, ...target }),
  reset: () => call<GameState>("/api/reset", {}),
};
