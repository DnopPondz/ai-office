// Account-wide Workers AI budget. The free allocation is 10,000 neurons per UTC day for the whole
// account, so usage is counted in D1 (shared by every company) rather than per Durable Object.
// Counts are estimates from token usage; the margin below the real limit absorbs the error.
export const DAILY_NEURON_BUDGET = 9000;
// Roughly the most one call costs (a scene is ~35 to 60 neurons), so a call never starts without room.
const CALL_HEADROOM = 100;

export class AiBudgetError extends Error {
  constructor() {
    super("โควตา AI ฟรีของวันนี้หมดแล้ว");
  }
}

export function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function neuronsUsedToday(env: Env): Promise<number> {
  const row = await env.DB.prepare(`SELECT neurons FROM ai_usage WHERE day = ?`).bind(utcDay()).first<{ neurons: number }>();
  return row?.neurons ?? 0;
}

export async function hasAiBudget(env: Env, ceiling = DAILY_NEURON_BUDGET): Promise<boolean> {
  return (await neuronsUsedToday(env)) + CALL_HEADROOM <= Math.min(ceiling, DAILY_NEURON_BUDGET);
}

export async function recordNeurons(env: Env, neurons: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_usage (day, neurons, calls) VALUES (?, ?, 1)
     ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1`,
  )
    .bind(utcDay(), neurons)
    .run();
}

// Workers AI said the real allocation is gone (other usage on the account, or a low estimate).
export async function markBudgetExhausted(env: Env): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ai_usage (day, neurons, calls) VALUES (?, ?, 0)
     ON CONFLICT(day) DO UPDATE SET neurons = MAX(neurons, excluded.neurons)`,
  )
    .bind(utcDay(), DAILY_NEURON_BUDGET)
    .run();
}

export async function aiBudgetPercentLeft(env: Env): Promise<number> {
  const used = await neuronsUsedToday(env);
  return Math.max(0, Math.round(100 * (1 - used / DAILY_NEURON_BUDGET)));
}
