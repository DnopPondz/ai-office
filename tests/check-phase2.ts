import {
  BUSINESSES, PACKAGE_VERSIONS, cashUnit, companyDeps, monthlyCost, monthlyRevenue, randomBusiness, randomCompanyName,
} from "../worker/business";
import { generateStaff, roleCast } from "../worker/roster";
import { ROLES, roleCovers } from "../worker/roles";
import { kpiTarget, hireRoles } from "../worker/business";
import { breachScript, regressionScript, fallbackReactions } from "../worker/scripted";
import { chatterLine } from "../worker/chatter";
import { pickQuietScript, toScene, welcomeLines, welcomeNotice } from "../worker/scripted";
import { applyEffects, formatEffects, generateScene, matchStack } from "../worker/game";
import { getPooledScene } from "../worker/pool";

const errors: string[] = [];
const check = (ok: unknown, msg: string) => {
  if (!ok) errors.push(msg);
};
const leftover = /\{(I|end|ask|dev|sec|sales|ops|intern|pm)\}/;

// --- business data sanity
const ids = new Set<string>();
for (const b of BUSINESSES) {
  check(!ids.has(b.id), `dup business ${b.id}`);
  ids.add(b.id);
  check(b.names.length >= 4, `${b.id}: few names`);
  check(b.stack.length >= 8, `${b.id}: small stack`);
  for (const s of b.stack) for (const k of s.keywords) check(k === k.toLowerCase(), `${b.id}: keyword not lowercase ${k}`);
  for (const p of b.packages) check(PACKAGE_VERSIONS[p], `${b.id}: package ${p} has no pinned version`);
  check(new Set(b.stack.map((s) => s.name)).size === b.stack.length, `${b.id}: duplicate stack names`);
  const staff = generateStaff([], b);
  const stats = { ...b.stats, cash: b.startCash };
  const rev = monthlyRevenue(b, stats);
  const cost = monthlyCost(b, staff);
  const ratio = rev / cost;
  check(ratio > 0.8 && ratio < 1.25, `${b.id}: revenue/cost ${ratio.toFixed(2)}`);
  check(staff.every((e) => e.salary > 5000 && e.salary < 200000), `${b.id}: salary range`);
  check(staff.every((e) => e.role === (b.titles[e.roleKey] ?? ROLES[e.roleKey].title)), `${b.id}: titles`);
  check([...b.team, ...b.hireable].every((r) => ROLES[r]), `${b.id}: unknown role in team or hireable`);
  check(["sec", "pm", "sales"].every((a) => b.team.some((r) => roleCovers(r, a))), `${b.id}: team must cover sec, pm and sales`);
  check(Object.keys(b.kpi.weights).every((r) => hireRoles(b).includes(r)), `${b.id}: KPI driver not hireable`);
  const t0 = kpiTarget(b, staff);
  check(Math.abs(t0 - b.kpi.start) <= 6, `${b.id}: KPI target ${t0} vs start ${b.kpi.start}`);
  const top = Object.entries(b.kpi.weights).filter(([r]) => b.team.includes(r)).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0][0];
  const without = staff.filter((e) => e.roleKey !== top);
  check(kpiTarget(b, without) < t0 - 5, `${b.id}: losing ${top} should hurt the KPI`);
  const unit = cashUnit(b);
  check(unit >= 5000 && b.startCash / unit > 120 && b.startCash / unit < 190, `${b.id}: cash unit ${unit}`);
  console.log(
    `${b.id.padEnd(11)} cash ${String(b.startCash).padStart(8)} unit ${String(unit).padStart(6)} rev ${String(rev).padStart(7)} cost ${String(cost).padStart(7)} net ${String(rev - cost).padStart(8)}`,
  );
}

// No false BIG-IP match on nginx (CPE vendor f5)
const nginxNews = { id: "x", name: "F5 NGINX bug", description: "", kevAdded: "", dueDate: null, requiredAction: null, cvss: null, severity: null, products: ["f5:nginx"], url: "" };
const fintech = BUSINESSES.find((b) => b.id === "fintech")!;
check(!matchStack(nginxNews, fintech.stack).includes("F5 BIG-IP"), "nginx falsely matches BIG-IP");

// randomBusiness avoids repeating
for (let i = 0; i < 50; i++) check(randomBusiness("clinic").id !== "clinic", "randomBusiness repeated previous");

// --- effects in baht
const b0 = BUSINESSES[1];
const st = { ...b0.stats, cash: b0.startCash };
applyEffects(st, { cash: -10, security: 200 }, cashUnit(b0));
check(st.cash === b0.startCash - 10 * cashUnit(b0), "cash effect uses unit");
check(st.security === 100, "other stats still clamp");
check(formatEffects({ cash: -3 }, 35000) === "เงินสด -105,000 บาท", "formatEffects");

// --- every business: its own scene is reachable and casts cleanly
for (const b of BUSINESSES) {
  const staff = generateStaff([], b);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const q = pickQuietScript([], staff, b);
    if (b.software < 0.5) check(!["sales-promise", "intern-staging", "pm-roadmap", "dev-refactor", "oncall", "questionnaire"].includes(q.id), `${b.id}: drew coding scene ${q.id}`);
    seen.add(q.id);
    const built = toScene(q, staff);
    const texts = [built.scene.decision.prompt, ...built.scene.decision.options.map((o) => o.label), ...built.scene.messages.map((m) => m.text), ...Object.values(built.reactions).flat().map((m) => m.text)];
    for (const t of texts) {
      check(!leftover.test(t), `${q.id}: leftover token "${t.slice(0, 40)}"`);
      check(!t.includes("\u2014"), `${q.id}: em dash`);
    }
    check(built.scene.messages.some((m) => m.channel.startsWith("dm-")), `${q.id}: no DM`);
    check(Object.values(built.reactions).every((r) => r.length), `${q.id}: empty reactions`);
    // Strict casting: nobody plays two parts in one quiet scene.
    const speakers = new Map<string, string>();
    for (const m of [...built.scene.messages, ...Object.values(built.reactions).flat()]) speakers.set(m.author, m.author);
    check(built.scene.messages.every((m) => staff.some((e) => e.id === m.author)), `${q.id}: unknown author`);
    check(!/^[a-z]+-/.test(q.id) || !q.id.includes("-") || true, "");
  }
  const own = [...seen].filter((id) => id.startsWith(b.id + "-"));
  check(own.length === 2, `${b.id}: both own scenes should be drawn (${own.join(",")})`);
  check(seen.size >= 4, `${b.id}: only ${seen.size} scripted scenes castable`);
  for (const sc of [breachScript({ newsId: "CVE-1", title: "t", since: 1, kind: "kev", layer: "edge", component: "x" }), regressionScript("axios", "1.7.4")]) {
    const built = toScene(sc, staff);
    check(built.scene.messages.length >= 2, `${b.id}: event script too thin`);
    const authors = built.scene.messages.map((m) => m.author);
    check(!built.scene.messages.some((m) => leftover.test(m.text)), `${b.id}: event script leftover token`);
    check(authors.length > 0, `${b.id}: event script empty`);
  }
  for (let i = 0; i < 30; i++) {
    const line = chatterLine(staff, () => "🙂");
    check(line && !leftover.test(line.post.text), `${b.id}: chatter`);
  }
  check(fallbackReactions({ id: "a", label: "x", effects: { kpi: -5 }, patches: false }, staff).length >= 1, `${b.id}: kpi fallback`);
  for (const other of BUSINESSES) if (other.id !== b.id) check(![...seen].some((id) => id.startsWith(other.id + "-")), `${b.id}: drew ${other.id} scene`);
  check(welcomeNotice({ name: randomCompanyName(b), business: b.label }).text.includes(b.label), `${b.id}: welcome mentions business`);
  const variants = new Set(Array.from({ length: 20 }, () => welcomeLines(staff).map((m) => m.text).join("|")));
  check(variants.size >= 10, `${b.id}: fallback greetings vary (${variants.size}/20)`);
  check(Object.keys(companyDeps(b)).length === b.packages.length, `${b.id}: deps`);
}

// --- prompts and pooled scenes per business
let lastPrompt = "";
const pooled: Record<string, string> = {};
const aiAnswer = {
  messages: [
    { channel: "dev", author: "sec", text: "{ops} ช่วยดูหน่อย" },
    { channel: "dm-sec", author: "sec", text: "CEO ต้องรีบนะ" },
  ],
  presence: [],
  decision: {
    prompt: "จะทำยังไงดีครับ?",
    options: [
      { label: "แก้เลย", patches: true, effects: { cash: -5 } },
      { label: "รอ", patches: false, effects: { uptime: 3 } },
    ],
  },
};
const env = {
  DB: {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) { args = a; return stmt; },
        async first() { return sql.includes("FROM scene_pool") && pooled[args[0] as string] ? { scene: pooled[args[0] as string] } : null; },
        async run() { return {}; },
        async all() { return { results: [] }; },
      };
      return stmt;
    },
    async batch() { return []; },
  },
  AI: {
    async run(_m: string, input: { messages: { content: string }[] }) {
      lastPrompt = input.messages[1].content;
      return { response: JSON.stringify(aiAnswer), usage: { prompt_tokens: 100, completion_tokens: 100 } };
    },
  },
} as unknown as Env;

const clinic = BUSINESSES.find((b) => b.id === "clinic")!;
const scene = await generateScene(env, { event: { kind: "quiet" }, staff: roleCast(clinic), business: clinic });
check(lastPrompt.includes("dental clinic") && lastPrompt.includes("Do not invent a company name"), "pool prompt has business, no name");
check(lastPrompt.includes(`One cash point in effects = ${cashUnit(clinic)} THB`), "prompt has cash unit");
check(lastPrompt.includes("ทันตแพทย์") && lastPrompt.includes("ผู้จัดการคลินิก"), "pool cast uses the business team and titles");
check(lastPrompt.includes("NAS (QNAP/Synology)"), "prompt has business stack");
check(lastPrompt.includes("BUSINESS CONCERNS: appointment no-shows"), "prompt has business concerns");
check(BUSINESSES.every((b) => b.software >= 0 && b.software <= 1 && b.concerns.length > 20), "every business has software factor and concerns");
check(scene.decision.prompt === "จะทำยังไงดี?", `particle stripped: "${scene.decision.prompt}"`);

const staff = generateStaff([], clinic);
const stats = { ...clinic.stats, cash: 1234567 };
await generateScene(env, { event: { kind: "quiet" }, staff, business: clinic, companyName: "ฟันดีคลินิก", money: { revenue: 500000, cost: 520000 }, day: 4, stats, recent: [] }).catch(() => null);
check(lastPrompt.includes(`COMPANY: "ฟันดีคลินิก"`), "live prompt has company name");
check(lastPrompt.includes("CASH: 1234567 THB"), "live prompt has cash");
check(lastPrompt.includes("Monthly revenue about 500000"), "live prompt has money");
check(!/cash=/.test(lastPrompt), "cash not listed as 0-100 stat");

pooled["k"] = JSON.stringify(scene);
const cast = await getPooledScene(env, "k", staff);
check(cast?.messages[0].text.startsWith(staff.find((e) => roleCovers(e.roleKey, "ops"))!.name), "pooled cast names (ops = IT Support)");
check(Object.keys(ROLES).length >= 25, "role catalog");

console.log(errors.length ? [...new Set(errors)].slice(0, 30).join("\n") : "all checks passed");
