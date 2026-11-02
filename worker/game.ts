import type {
  DecisionOption,
  Employee,
  MessageKind,
  NewsItem,
  OfficeSpot,
  OpenRisk,
  Presence,
  StatKey,
  Stats,
} from "../shared/types";
import { OFFICE_SPOTS, STAT_KEYS, STAT_LABELS } from "../shared/types";

export const MODEL = "@cf/google/gemma-4-26b-a4b-it";
// Keeps one company well inside the free 10,000 neurons/day (~60 neurons per turn).
export const MAX_ADVANCES_PER_DAY = 20;

export const INITIAL_STATS: Stats = { cash: 70, morale: 65, security: 50, reputation: 60, uptime: 90 };

export const EMPLOYEES: Employee[] = [
  {
    id: "kan",
    name: "กาน",
    role: "Senior Dev",
    emoji: "👨‍💻",
    personality: "เก่งมากแต่ขี้เกียจ patch ชอบพูดว่า 'เดี๋ยวค่อยทำ' ประชดเก่ง",
    secretGoal: "แอบสัมภาษณ์งานกับบริษัทอื่นอยู่ ไม่อยากให้ใครรู้",
  },
  {
    id: "mai",
    name: "ใหม่",
    role: "Security Engineer",
    emoji: "🛡️",
    personality: "ระแวงทุกอย่าง ชอบพูดว่า 'บอกแล้ว' ใช้อีโมจิเยอะเวลาตกใจ",
    secretGoal: "อยากได้งบ security เพิ่มเป็นสองเท่า ใช้ทุกเหตุการณ์เป็นข้ออ้าง",
  },
  {
    id: "oat",
    name: "โอ๊ต",
    role: "Sales",
    emoji: "💼",
    personality: "มองทุกอย่างเป็นยอดขาย ไม่ยอมให้ระบบล่มแม้แต่นาทีเดียว พูดภาษาเซลส์",
    secretGoal: "ต้องปิดดีลลูกค้ารายใหญ่ให้ได้ในไตรมาสนี้ ไม่งั้นโดนตัดคอมมิชชั่น",
  },
  {
    id: "fah",
    name: "ฟ้า",
    role: "DevOps",
    emoji: "⚙️",
    personality: "ทำงานหนักจนใกล้หมดไฟ ตอบสั้น เหนื่อย แต่รับผิดชอบสูง",
    secretGoal: "อยากให้ CEO เห็นคุณค่าและขึ้นเงินเดือน ถ้าไม่ได้จะลาออก",
  },
  {
    id: "ton",
    name: "ต้น",
    role: "Intern",
    emoji: "🐣",
    personality: "กระตือรือร้น ซื่อ กดทุกอย่าง ถามเยอะ บางทีทำพังโดยไม่ตั้งใจ",
    secretGoal: "อยากได้บรรจุเป็นพนักงานประจำ พยายามทำตัวให้เด่น",
  },
  {
    id: "prae",
    name: "แพร",
    role: "Product Manager",
    emoji: "📋",
    personality: "สุภาพต่อหน้า การเมืองเก่ง ชอบโยนความผิดอย่างแนบเนียน",
    secretGoal: "อยากเป็น CEO แทน กำลังเก็บหลักฐานความผิดพลาดของ CEO",
  },
];

// The fictional company's systems. News is matched against these keywords
// (product name only; versions are not checked in this MVP).
export const STACK: { name: string; keywords: string[] }[] = [
  { name: "Next.js / React", keywords: ["next.js", "vercel:next", "react server", "facebook:react", "meta:react"] },
  { name: "Node.js", keywords: ["node.js", "nodejs:node"] },
  { name: "nginx", keywords: ["nginx"] },
  { name: "Ubuntu Linux", keywords: ["linux kernel", "linux:linux_kernel", "canonical:", "ubuntu"] },
  { name: "PostgreSQL", keywords: ["postgresql"] },
  { name: "WordPress (เว็บการตลาด)", keywords: ["wordpress"] },
  { name: "GitHub", keywords: ["github"] },
  { name: "Redis", keywords: ["redis"] },
  { name: "OpenSSH", keywords: ["openssh"] },
  { name: "Chrome (เครื่องพนักงาน)", keywords: ["chrome", "chromium"] },
  { name: "Windows (เครื่องพนักงาน)", keywords: ["microsoft windows", "microsoft:windows"] },
  { name: "Fortinet VPN", keywords: ["fortinet", "fortios"] },
];

export interface DraftMessage {
  channel: string;
  author: string;
  text: string;
  kind?: MessageKind;
  link?: string | null;
}

export type SceneEvent =
  | { kind: "news"; news: NewsItem; matched: string[] }
  | { kind: "breach"; risk: OpenRisk }
  | { kind: "quiet" };

export interface SceneInput {
  day: number;
  stats: Stats;
  event: SceneEvent;
  recent: string[];
  openRisks: OpenRisk[];
}

export type PresenceMap = Record<string, Presence>;

export interface Scene {
  messages: DraftMessage[];
  decision: { prompt: string; options: DecisionOption[] };
  presence: Partial<PresenceMap>;
}

export function defaultPresence(): PresenceMap {
  return Object.fromEntries(EMPLOYEES.map((e) => [e.id, { spot: "desk", activity: "ทำงานตามปกติ", mood: "🙂" }]));
}

export function mergePresence(base: PresenceMap, update: Partial<PresenceMap>): PresenceMap {
  const next = { ...base };
  for (const [id, p] of Object.entries(update)) if (p) next[id] = p;
  return next;
}

// Baseline movement for an event; the model's own presence answer overrides it.
export function eventPresence(event: SceneEvent, previous: PresenceMap): PresenceMap {
  const next: PresenceMap = { ...defaultPresence(), ...previous };
  if (event.kind === "breach") {
    for (const e of EMPLOYEES) next[e.id] = { spot: "meeting", activity: "ประชุมด่วนเรื่องโดนเจาะ", mood: "😰" };
    next.mai = { spot: "server", activity: "กู้ระบบ", mood: "🚨" };
    next.fah = { spot: "server", activity: "ไล่ดู log", mood: "😵" };
    next.kan = { spot: "server", activity: "หาว่าเข้ามาทางไหน", mood: "😬" };
  } else if (event.kind === "news" && event.matched.length) {
    next.mai = { spot: "server", activity: "ตรวจช่องโหว่", mood: "😨" };
    next.fah = { spot: "server", activity: "เช็คเวอร์ชันเครื่อง", mood: "😮‍💨" };
  }
  return next;
}

export const CHANNELS = ["general", "dev", "security-alerts", "random"];
const AI_CHANNELS = new Set(["general", "dev", "random", ...EMPLOYEES.map((e) => `dm-${e.id}`)]);

export function matchStack(news: NewsItem): string[] {
  const haystack = `${news.name} ${news.products.join(" ")}`.toLowerCase();
  return STACK.filter((s) => s.keywords.some((k) => haystack.includes(k))).map((s) => s.name);
}

export function applyEffects(stats: Stats, effects: Partial<Stats>): void {
  for (const key of STAT_KEYS) {
    const delta = effects[key];
    if (typeof delta === "number") stats[key] = clamp(stats[key] + delta, 0, 100);
  }
}

export function formatEffects(effects: Partial<Stats>): string {
  return STAT_KEYS.filter((k) => effects[k])
    .map((k) => `${STAT_LABELS[k]} ${effects[k]! > 0 ? "+" : ""}${effects[k]}`)
    .join(" · ");
}

export function checkGameOver(stats: Stats): string | null {
  if (stats.cash <= 0) return "เงินหมด บริษัทต้องปิดตัว 💸";
  if (stats.morale <= 0) return "พนักงานลาออกยกทีม 🚪";
  if (stats.reputation <= 0) return "ลูกค้าหนีหมด ไม่มีใครเชื่อใจบริษัทอีกแล้ว 📉";
  if (stats.uptime <= 0) return "ระบบล่มถาวร กู้ไม่ขึ้น 🔥";
  if (stats.security <= 0) return "โดนเจาะจนข้อมูลลูกค้าหลุดทั้งหมด 🏴‍☠️";
  return null;
}

export function welcomePosts(): DraftMessage[] {
  return [
    {
      channel: "general",
      author: "system",
      kind: "system",
      text:
        "👋 ยินดีต้อนรับ CEO คนใหม่! กด 'เหตุการณ์ถัดไป' เพื่อเริ่มวันทำงาน\n" +
        "ข่าวใน #security-alerts เป็นข่าวจริงจาก CISA KEV (ผ่าน NVD) ส่วนบริษัทและพนักงานเป็นเรื่องสมมติ",
    },
    { channel: "general", author: "prae", text: "ยินดีต้อนรับค่ะ CEO 😊 มีอะไรให้แพรช่วยบอกได้เลยนะคะ" },
    { channel: "general", author: "ton", text: "สวัสดีครับบบ ผมต้น intern ครับ!! พร้อมลุยทุกงานครับ 💪" },
    { channel: "dev", author: "kan", text: "CEO ใหม่อีกแล้วเหรอ... ก็ดี ขอแค่อย่าเพิ่งสั่ง refactor ก็พอ" },
    { channel: "dev", author: "mai", text: "ขอเตือนไว้ก่อนเลยนะคะ ระบบเรายังไม่ได้ patch หลายตัว 🫠" },
  ];
}

// SecBot posts are built from feed data only, never from the model, so facts stay exact.
export function secBotPosts(news: NewsItem, matched: string[]): DraftMessage[] {
  const facts = [
    "🚨 CISA เพิ่มช่องโหว่เข้า KEV (มีการโจมตีจริงแล้ว)",
    `${news.id} · ${news.name}`,
    `CVSS ${news.cvss ?? "-"}${news.severity ? ` (${news.severity})` : ""} · เพิ่มเข้า KEV ${news.kevAdded}`,
    news.products.length ? `ผลิตภัณฑ์: ${news.products.slice(0, 5).join(", ")}` : null,
    news.description ? `รายละเอียด: ${truncate(news.description, 400)}` : null,
    news.requiredAction ? `CISA แนะนำ: ${truncate(news.requiredAction, 200)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const impact = matched.length
    ? `⚠️ ตรงกับระบบของบริษัท: ${matched.join(", ")}\n(เทียบจากชื่อผลิตภัณฑ์ ยังไม่ได้ตรวจเวอร์ชันจริง)`
    : "✅ ไม่ตรงกับระบบของบริษัท";

  return [
    { channel: "security-alerts", author: "secbot", kind: "bot", text: facts, link: news.url },
    { channel: "security-alerts", author: "secbot", kind: "bot", text: impact },
  ];
}

const SYSTEM_PROMPT = `You are the writers' room for "ออฟฟิศ AI", a Thai comedy-drama office simulation shown as a Slack workspace.
The player is the CEO of a small fictional Thai startup. You write what the employees say to each other and to the CEO.
Employees address the player as "CEO" or "พี่ CEO" (never "บอส", to avoid confusion with names).

Rules:
- Write every message in natural, casual Thai (Slack style, short, emoji allowed). The "author" field must be an employee id from the list.
- Stay in character. Personality drives tone. Secret goals leak subtly through hints, DMs and gossip; never state them outright.
- Facts about real-world news come ONLY from the NEWS block. Do not invent CVE numbers, versions, vendors, dates or technical details. Anything beyond the block is an employee's opinion or guess.
- Never write exploit code, payloads or step-by-step attack instructions. Discuss impact, patching, mitigation and detection at a high level.
- Do not mock or accuse real companies or people. Characters can be frustrated with the situation, not insult vendors.
- Channels: "general", "dev", "random", and "dm-<employeeId>" (a private DM from that employee to the CEO).`;

const PRESENCE_RULES = `Also return "presence" for every employee: where they physically are in the office right now.
"spot" is one of: desk (own desk), meeting (meeting room), server (server room), pantry (coffee corner),
ceo (in the CEO's office), lounge (sofa corner), away (out of the office).
"activity" is 2 to 6 Thai words; "mood" is a single emoji. Make it match the story
(incident: server room or meeting; gossip: pantry; asking the CEO for something: ceo; secretly job hunting: away).`;

const SCENE_RULES = `Write 6 to 10 messages across at least 3 channels, including at least one DM to the CEO.
Then write ONE decision for the CEO: a short Thai question and exactly 3 options.
Each option has a short Thai label, integer effects between -25 and 25 for any of cash, morale, security, reputation, uptime,
and "patches": true only if that option actually fixes or mitigates the news risk.
Options must be real trade-offs; no option is strictly best.
${PRESENCE_RULES}`;

const MESSAGE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      channel: { type: "string" },
      author: { type: "string" },
      text: { type: "string" },
    },
    required: ["channel", "author", "text"],
  },
};

const EFFECT_PROPERTIES = Object.fromEntries(STAT_KEYS.map((k) => [k, { type: "integer" }]));

const PRESENCE_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      employee: { type: "string" },
      spot: { type: "string", enum: OFFICE_SPOTS },
      activity: { type: "string" },
      mood: { type: "string" },
    },
    required: ["employee", "spot", "activity", "mood"],
  },
};

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    messages: MESSAGE_SCHEMA,
    presence: PRESENCE_SCHEMA,
    decision: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              patches: { type: "boolean" },
              effects: { type: "object", properties: EFFECT_PROPERTIES },
            },
            required: ["label", "patches", "effects"],
          },
        },
      },
      required: ["prompt", "options"],
    },
  },
  required: ["messages", "decision", "presence"],
};

const AFTERMATH_SCHEMA = {
  type: "object",
  properties: { messages: MESSAGE_SCHEMA, presence: PRESENCE_SCHEMA },
  required: ["messages", "presence"],
};

function describeEvent(event: SceneEvent): string {
  if (event.kind === "breach") {
    return `INCIDENT (simulated): attackers exploited the still-unpatched ${event.risk.newsId} (${event.risk.title}) in our systems.
The team reacts: panic, blame, incident response. The decision is about incident response trade-offs (all options "patches": false).`;
  }
  if (event.kind === "quiet") {
    return `NO NEWS TODAY: a normal office day. Create drama from personalities and secret goals (deadlines, salary, gossip, burnout, sales pressure).
The decision is about people or business (all options "patches": false).`;
  }
  const n = event.news;
  const block = [
    "NEWS (real, from CISA KEV via NVD):",
    `id: ${n.id}`,
    `name: ${n.name}`,
    `description: ${truncate(n.description, 800)}`,
    `cvss: ${n.cvss ?? "unknown"} ${n.severity ?? ""}`,
    `added to KEV: ${n.kevAdded}`,
    `CISA required action: ${n.requiredAction ?? "n/a"}`,
  ].join("\n");
  const impact = event.matched.length
    ? `IMPACT: matches our stack (${event.matched.join(", ")}); version not verified. The team argues about who owns it, whether to patch now, and what it costs.`
    : `IMPACT: does NOT match our stack. The team reacts lightly (relief, jokes, a lesson, someone checks for shadow IT). The decision can be about a related office issue (all options "patches": false).`;
  return `${block}\n${impact}`;
}

function scenePrompt(input: SceneInput): string {
  const stats = STAT_KEYS.map((k) => `${k}=${input.stats[k]}`).join(", ");
  const risks = input.openRisks.length
    ? input.openRisks.map((r) => `${r.newsId} (${r.title})`).join("; ")
    : "none";
  return [
    `DAY: ${input.day}`,
    `COMPANY STATS (0-100): ${stats}`,
    "EMPLOYEES:",
    ...EMPLOYEES.map(
      (e) => `- id=${e.id} | ${e.name} | ${e.role} | personality: ${e.personality} | secret goal: ${e.secretGoal}`,
    ),
    `COMPANY TECH STACK (fictional): ${STACK.map((s) => s.name).join(", ")}`,
    `OPEN UNPATCHED RISKS: ${risks}`,
    "RECENT CHAT (for continuity):",
    ...(input.recent.length ? input.recent : ["(none yet)"]),
    "",
    "EVENT:",
    describeEvent(input.event),
    "",
    SCENE_RULES,
  ].join("\n");
}

export async function generateScene(env: Env, input: SceneInput): Promise<Scene> {
  const raw = await runJson(env, scenePrompt(input), SCENE_SCHEMA, 1800);
  const messages = sanitizeMessages(isRecord(raw) ? raw.messages : null);
  const decision = sanitizeDecision(isRecord(raw) ? raw.decision : null);
  if (!messages.length || !decision) throw new Error("พนักงาน AI ตอบไม่ครบ ลองกดใหม่อีกครั้ง");
  return { messages, decision, presence: sanitizePresence(isRecord(raw) ? raw.presence : null) };
}

export async function generateAftermath(
  env: Env,
  input: { prompt: string; chosen: DecisionOption; others: DecisionOption[]; recent: string[] },
): Promise<{ messages: DraftMessage[]; presence: Partial<PresenceMap> }> {
  const prompt = [
    "EMPLOYEES:",
    ...EMPLOYEES.map((e) => `- id=${e.id} | ${e.name} | ${e.role} | personality: ${e.personality} | secret goal: ${e.secretGoal}`),
    "RECENT CHAT:",
    ...input.recent,
    "",
    `THE CEO WAS ASKED: ${input.prompt}`,
    `THE CEO CHOSE: ${input.chosen.label} (effects: ${formatEffects(input.chosen.effects) || "none"})`,
    `REJECTED: ${input.others.map((o) => o.label).join(" / ")}`,
    "",
    "Write 3 to 5 short messages reacting to the CEO's decision, true to each personality. Include at least one DM to the CEO. No decision.",
    PRESENCE_RULES,
  ].join("\n");
  const raw = await runJson(env, prompt, AFTERMATH_SCHEMA, 900);
  return {
    messages: sanitizeMessages(isRecord(raw) ? raw.messages : null).slice(0, 6),
    presence: sanitizePresence(isRecord(raw) ? raw.presence : null),
  };
}

async function runJson(env: Env, prompt: string, schema: object, maxTokens: number): Promise<unknown> {
  // Model id is newer than the generated binding types, so call through a minimal signature.
  const ai = env.AI as unknown as { run(model: string, input: unknown): Promise<unknown> };
  const raw = await ai.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.9,
    response_format: { type: "json_schema", json_schema: schema },
    // Gemma 4 thinks by default and can spend the whole token budget before answering.
    chat_template_kwargs: { enable_thinking: false },
  });
  return extractJson(raw);
}

function extractJson(raw: unknown): unknown {
  let value: unknown = raw;
  if (isRecord(raw)) {
    if ("response" in raw) {
      value = raw.response;
    } else if (Array.isArray(raw.choices) && isRecord(raw.choices[0]) && isRecord(raw.choices[0].message)) {
      value = raw.choices[0].message.content;
    }
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
  return value;
}

function sanitizeMessages(raw: unknown): DraftMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftMessage[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const author = resolveEmployee(item.author);
    const text = typeof item.text === "string" ? truncate(item.text.trim(), 600) : "";
    if (!author || !text) continue;
    out.push({ channel: resolveChannel(item.channel), author, text, kind: "chat" });
  }
  return out.slice(0, 12);
}

function sanitizeDecision(raw: unknown): Scene["decision"] | null {
  if (!isRecord(raw) || typeof raw.prompt !== "string" || !Array.isArray(raw.options)) return null;
  const options: DecisionOption[] = [];
  for (const item of raw.options.slice(0, 3)) {
    if (!isRecord(item) || typeof item.label !== "string" || !item.label.trim()) continue;
    const effects: Partial<Stats> = {};
    if (isRecord(item.effects)) {
      for (const key of STAT_KEYS) {
        const v = item.effects[key];
        if (typeof v === "number" && Number.isFinite(v) && v !== 0) effects[key as StatKey] = clamp(Math.round(v), -25, 25);
      }
    }
    options.push({
      id: String.fromCharCode(97 + options.length),
      label: truncate(item.label.trim(), 160),
      effects,
      patches: item.patches === true,
    });
  }
  if (options.length < 2) return null;
  return { prompt: truncate(raw.prompt.trim(), 300), options };
}

function sanitizePresence(raw: unknown): Partial<PresenceMap> {
  const out: Partial<PresenceMap> = {};
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = resolveEmployee(item.employee);
    const spot = typeof item.spot === "string" ? (item.spot.trim().toLowerCase() as OfficeSpot) : null;
    if (!id || !spot || !OFFICE_SPOTS.includes(spot)) continue;
    const activity = typeof item.activity === "string" ? truncate(item.activity.trim(), 40) : "";
    // Keep emoji intact (they can be several code points) but drop anything longer.
    const mood = typeof item.mood === "string" ? Array.from(item.mood.trim()).slice(0, 3).join("") : "";
    out[id] = { spot, activity: activity || "ทำงาน", mood: mood || "🙂" };
  }
  return out;
}

function resolveEmployee(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return EMPLOYEES.find((e) => e.id === v || e.name === value.trim())?.id ?? null;
}

function resolveChannel(value: unknown): string {
  const v = typeof value === "string" ? value.trim().toLowerCase().replace(/^#/, "") : "";
  return AI_CHANNELS.has(v) ? v : "general";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
