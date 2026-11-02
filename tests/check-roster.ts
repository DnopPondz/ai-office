import { generateStaff, LEGACY_STAFF, roleCast, renderText, NAME_MEMORY } from "../worker/roster";
import { ARCHETYPES as ROLE_KEYS } from "../worker/roles";
import { BUSINESSES } from "../worker/business";
const ROLE_CAST = roleCast(BUSINESSES[0]);
import { pickQuietScript, toScene, breachScript, regressionScript, welcomeLines, fallbackReactions } from "../worker/scripted";
import { generateScene, eventPresence, defaultPresence } from "../worker/game";
import { getPooledScene } from "../worker/pool";

const errors: string[] = [];
const check = (ok: unknown, msg: string) => {
  if (!ok) errors.push(msg);
};

// --- staff generation
let used: string[] = [];
const seenNames = new Set<string>();
for (let run = 0; run < 10; run++) {
  const staff = generateStaff(used, BUSINESSES[0]);
  check(staff.length === 6, "staff size");
  check(new Set(staff.map((e) => e.roleKey)).size === 6, "one per role");
  check(new Set(staff.map((e) => e.name)).size === 6, "names unique in company");
  check(staff.every((e) => /^e[0-9a-f]{7}$/.test(e.id)), "id format");
  check(staff.every((e) => !used.includes(e.name)), `run ${run}: repeated a recent name`);
  check(staff.every((e) => e.name !== "บอส"), "no boss name");
  staff.forEach((e) => seenNames.add(e.name));
  used = [...staff.map((e) => e.name), ...used].slice(0, NAME_MEMORY);
}
console.log("10 companies, distinct names seen:", seenNames.size);

// --- token rendering
const staffA = generateStaff([], BUSINESSES[0]);
const ops = staffA.find((e) => e.roleKey === "ops")!;
check(renderText("hi {ops}", staffA) === `hi ${ops.name}`, "role token");
check(
  renderText("{I}ได้{end} นะ{ask}", staffA, ops) === `${ops.speech.self}ได้${ops.speech.end} นะ${ops.speech.ask}`,
  "speech tokens",
);
check(renderText("{nope} stays", staffA) === "{nope} stays", "unknown token kept");
check(renderText("x {sec}", staffA.filter((e) => e.roleKey !== "sec")) === null, "missing role -> null");

// --- every scripted scene, many random casts + legacy
const leftover = /\{(I|end|ask|dev|sec|sales|ops|intern|pm)\}/;
type Built = ReturnType<typeof toScene>;
function checkScene(label: string, staff: typeof staffA, built: Built) {
  const ids = new Set(staff.map((e) => e.id));
  const texts = [built.scene.decision.prompt, ...built.scene.decision.options.map((o) => o.label)];
  const msgs = [...built.scene.messages, ...Object.values(built.reactions).flat()];
  for (const m of msgs) {
    texts.push(m.text);
    check(ids.has(m.author), `${label}: author not in staff`);
    if (m.channel.startsWith("dm-")) check(m.channel === `dm-${m.author}`, `${label}: dm channel mismatch`);
    else check(["general", "dev", "random"].includes(m.channel), `${label}: bad channel ${m.channel}`);
  }
  for (const t of texts) {
    check(!leftover.test(t), `${label}: leftover token in "${t.slice(0, 50)}"`);
    check(!t.includes("\u2014"), `${label}: em dash`);
    check(!t.includes("undefined"), `${label}: undefined`);
  }
  check(built.scene.messages.length >= 3, `${label}: too few messages`);
  check(built.scene.messages.some((m) => m.channel.startsWith("dm-")), `${label}: no DM`);
  check(Object.keys(built.reactions).every((k) => ["a", "b", "c"].includes(k)), `${label}: reaction keys`);
  check(Object.values(built.reactions).every((r) => r.length > 0), `${label}: empty reactions`);
  for (const id of Object.keys(built.scene.presence)) check(ids.has(id), `${label}: presence id`);
}
const scriptIds = new Set<string>();
const risk = { newsId: "CVE-1", title: "t", since: 1, kind: "kev" as const, layer: "edge" as const, component: "nginx" };
for (const staff of [LEGACY_STAFF, ...Array.from({ length: 30 }, () => generateStaff([], BUSINESSES[0]))]) {
  for (let i = 0; i < 60; i++) {
    const q = pickQuietScript([], staff, BUSINESSES[0]);
    scriptIds.add(q.id);
    checkScene(q.id, staff, toScene(q, staff));
  }
  checkScene("breach", staff, toScene(breachScript(risk), staff));
  checkScene("regression", staff, toScene(regressionScript("axios", "1.7.4"), staff));
  const w = welcomeLines(staff);
  check(w.length >= 3 && w.length <= 4 && !w.some((m) => leftover.test(m.text)), "welcome");
  const fb = fallbackReactions({ id: "a", label: "x", effects: { security: -9 }, patches: true }, staff);
  check(fb.length === 2 && fb.every((m) => staff.some((e) => e.id === m.author)), "fallback");
  const pres = eventPresence({ kind: "breach", risk }, defaultPresence(staff), staff);
  check(Object.keys(pres).length === 6 && pres[staff.find((e) => e.roleKey === "sec")!.id].spot === "server", "eventPresence");
}
console.log("quiet scripts reachable:", scriptIds.size);

// A company without sales only gets scenes it can cast.
const noSales = generateStaff([], BUSINESSES[0]).filter((e) => e.roleKey !== "sales");
for (let i = 0; i < 100; i++) {
  const built = toScene(pickQuietScript([], noSales, BUSINESSES[0]), noSales);
  check(!leftover.test(built.scene.decision.prompt), "no-sales prompt token");
  check(built.scene.decision.options.every((o) => !leftover.test(o.label)), "no-sales label token");
}

// --- fake env: D1 + AI
const pooled: Record<string, string> = {};
let lastPrompt = "";
const fakeDb = {
  prepare(sql: string) {
    let args: unknown[] = [];
    const stmt = {
      bind(...a: unknown[]) {
        args = a;
        return stmt;
      },
      async first() {
        if (sql.includes("FROM scene_pool")) {
          const v = pooled[args[0] as string];
          return v ? { scene: v } : null;
        }
        return null;
      },
      async run() {
        return {};
      },
      async all() {
        return { results: [] };
      },
    };
    return stmt;
  },
  async batch() {
    return [];
  },
};
const aiAnswer = {
  messages: [
    { channel: "dev", author: "sec", text: "{ops} ช่วยดู nginx หน่อย" },
    { channel: "dm-sec", author: "sec", text: "CEO ต้อง patch นะ" },
    { channel: "general", author: "sales", text: "ลูกค้าถามแล้ว" },
  ],
  presence: [{ employee: "ops", spot: "server", activity: "ไล่ดู {dev}", mood: "😵" }],
  decision: {
    prompt: "จะให้ {ops} patch ไหม",
    options: [
      { label: "patch เลย", patches: true, effects: { security: 10 } },
      { label: "รอ", patches: false, effects: { uptime: 3 } },
    ],
  },
};
const env = {
  DB: fakeDb,
  AI: {
    async run(_m: string, input: { messages: { content: string }[] }) {
      lastPrompt = input.messages[1].content;
      return { response: JSON.stringify(aiAnswer), usage: { prompt_tokens: 2000, completion_tokens: 900 } };
    },
  },
} as unknown as Env;

const news = {
  id: "CVE-2026-1", name: "nginx bug", description: "d", kevAdded: "2026-11-01", dueDate: null,
  requiredAction: null, cvss: 9, severity: "CRITICAL", products: ["f5:nginx"], url: "u",
};
const poolScene = await generateScene(env, { event: { kind: "news", news, matched: ["nginx"] }, staff: ROLE_CAST, business: BUSINESSES[0] });
check(lastPrompt.includes("| {sec} |"), "pool prompt uses placeholders");
check(poolScene.messages.every((m) => (ROLE_KEYS as string[]).includes(m.author)), "pool authors are role keys");
pooled["k"] = JSON.stringify(poolScene);
const realStaff = generateStaff([], BUSINESSES[0]);
const cast = await getPooledScene(env, "k", realStaff);
const sec = realStaff.find((e) => e.roleKey === "sec")!;
const opsR = realStaff.find((e) => e.roleKey === "ops")!;
const devR = realStaff.find((e) => e.roleKey === "dev")!;
check(cast && cast.messages.length === 3, "cast messages");
check(cast!.messages[0].author === sec.id && cast!.messages[0].text.startsWith(opsR.name), "cast author+name");
check(cast!.messages[1].channel === `dm-${sec.id}`, "cast dm");
check(cast!.decision.prompt.includes(opsR.name), "cast prompt");
check(cast!.presence[opsR.id]?.activity.includes(devR.name), "cast presence");

// Live scene for a real company: prompt lists real names and speech.
const stats = { cash: 50, morale: 50, security: 50, reputation: 50, uptime: 50 };
// The fake model answers with role ids, which this real staff does not have, so parsing fails; only the prompt matters here.
await generateScene(env, { event: { kind: "quiet" }, staff: realStaff, business: BUSINESSES[0], day: 3, stats, recent: [] }).catch(() => null);
check(realStaff.every((e) => lastPrompt.includes(`id=${e.id} | ${e.name}`)), "live prompt lists staff");
check(lastPrompt.includes("speech:"), "live prompt speech");

console.log(errors.length ? [...new Set(errors)].slice(0, 30).join("\n") : "all checks passed");
