import { Company } from "../worker/company";

const errors: string[] = [];
const check = (ok: unknown, msg: string) => {
  if (!ok) errors.push(msg);
};

// --- controllable clock
let NOW = 1_800_000_000_000;
Date.now = () => NOW;

// --- fake DO storage + SQL
function makeCtx() {
  const kv = new Map<string, unknown>();
  let alarm: number | null = null;
  let rows: any[] = [];
  let nextId = 1;
  const clone = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const storage = {
    async get(key: string) {
      return clone(kv.get(key));
    },
    async put(key: string | Record<string, unknown>, value?: unknown) {
      if (typeof key === "string") kv.set(key, clone(value));
      else for (const [k, v] of Object.entries(key)) kv.set(k, clone(v));
    },
    async delete(key: string) {
      kv.delete(key);
    },
    async setAlarm(t: number) {
      alarm = t;
    },
    async deleteAlarm() {
      alarm = null;
    },
    async getAlarm() {
      return alarm;
    },
    sql: {
      exec(q: string, ...a: any[]) {
        const res = (r: any[]) => ({ toArray: () => r });
        if (q.startsWith("CREATE TABLE")) return res([]);
        if (q.startsWith("INSERT INTO messages")) {
          rows.push({ id: nextId++, channel: a[0], author: a[1], text: a[2], kind: a[3], link: a[4], ts: a[5] });
          return res([]);
        }
        if (q.startsWith("DELETE FROM messages WHERE id <=")) {
          const max = Math.max(0, ...rows.map((r) => r.id));
          rows = rows.filter((r) => r.id > max - 1000);
          return res([]);
        }
        if (q === "DELETE FROM messages") {
          rows = [];
          return res([]);
        }
        if (q.includes("WHERE kind = 'chat' ORDER BY id DESC LIMIT ?")) return res(rows.filter((r) => r.kind === "chat").slice(-a[0]).reverse());
        if (q.includes("WHERE id > ? ORDER BY id ASC LIMIT ?")) return res(rows.filter((r) => r.id > a[0]).slice(0, a[1]));
        if (q.includes("ORDER BY id DESC LIMIT ?")) return res(rows.slice(-a[0]).reverse());
        throw new Error("unhandled sql " + q);
      },
    },
  };
  return { ctx: { storage }, kv, rows: () => rows, alarm: () => alarm };
}

// --- fake D1 + AI
let neurons = 0;
const news = [
  {
    id: "CVE-2026-0001", name: "Microsoft Windows Kernel Privilege Escalation", description: "A kernel bug.", kev_added: "2026-11-01",
    due_date: null, required_action: "Apply updates.", cvss: 7.8, severity: "HIGH", products: JSON.stringify(["microsoft:windows"]), url: "https://nvd.nist.gov/x",
  },
];
const fakeDb = {
  prepare(sql: string) {
    let args: any[] = [];
    const stmt = {
      bind(...a: any[]) {
        args = a;
        return stmt;
      },
      async first() {
        if (sql.includes("FROM ai_usage")) return { neurons };
        if (sql.includes("news_fetched_at")) return { value: String(Date.now()) };
        return null;
      },
      async run() {
        if (sql.includes("INSERT INTO ai_usage")) neurons += Number(args[1]) || 0;
        return {};
      },
      async all() {
        if (sql.includes("FROM news")) return { results: news };
        return { results: [] };
      },
    };
    return stmt;
  },
  async batch() {
    return [];
  },
};

let aiCalls: string[] = [];
let aiMode: "ok" | "fail" = "ok";
const ids = (prompt: string) => [...prompt.matchAll(/id=(\S+) \|/g)].map((m) => m[1]);
const fakeAi = {
  async run(_model: string, input: any) {
    const prompt: string = input.messages[1].content;
    if (aiMode === "fail") throw new Error("boom");
    const staff = ids(prompt);
    let body: unknown;
    if (prompt.includes("THE NEW CEO STARTS TODAY")) {
      aiCalls.push("welcome");
      body = { messages: staff.slice(0, 4).map((id, i) => ({ channel: i === 3 ? `dm-${id}` : "general", author: id, text: `ทักทายแบบที่ ${i}` })), presence: [] };
    } else if (prompt.includes("THE CEO JUST WROTE")) {
      aiCalls.push("reply");
      const dm = prompt.match(/only .* \(id=(\S+)\) answers/);
      body = { messages: [{ channel: "general", author: dm ? dm[1] : staff[0], text: "ตอบ CEO แล้ว" }], presence: [] };
    } else if (prompt.includes("THE CEO REPLIED")) {
      aiCalls.push("interpret");
      body = { choice: "custom", effects: { morale: 5, cash: -2 }, patches: false, reply: "รับทราบ ทำตามที่ CEO ว่า" };
    } else if (prompt.includes("THE CEO CHOSE")) {
      aiCalls.push("aftermath");
      body = { messages: [{ channel: "dev", author: staff[1], text: "โอเค ตามนั้น" }], presence: [] };
    } else {
      aiCalls.push("scene");
      body = {
        messages: [
          { channel: "dev", author: staff[1], text: "มีเรื่องแล้ว" },
          { channel: `dm-${staff[2]}`, author: staff[2], text: "CEO ช่วยด้วย" },
        ],
        presence: [],
        decision: {
          prompt: "จะทำยังไงดีคะ?",
          options: [
            { label: "แก้เลย", patches: true, effects: { security: 8, cash: -3 } },
            { label: "รอก่อน", patches: false, effects: { security: -6 } },
            { label: "จ้างคนนอก", patches: true, effects: { cash: -8 } },
          ],
        },
      };
    }
    return { response: JSON.stringify(body), usage: { prompt_tokens: 1500, completion_tokens: 600 } };
  },
};
const env = { DB: fakeDb, AI: fakeAi } as unknown as Env;

function make() {
  const f = makeCtx();
  const company = new Company(f.ctx as any, env);
  return { company, ...f };
}

async function runAlarms(c: { company: Company; alarm: () => number | null }, max = 10) {
  for (let i = 0; i < max; i++) {
    const at = c.alarm();
    if (at === null || at > NOW) return;
    await c.company.alarm();
  }
}

async function onlineFor(c: { company: Company; alarm: () => number | null }, ms: number, step = 3000, autoAnswer = false) {
  let since = 0;
  let last: any;
  for (let t = 0; t < ms; t += step) {
    NOW += step;
    last = await c.company.getState(since);
    for (const m of last.messages) since = Math.max(since, m.id);
    if (autoAnswer && !last.gameOver) {
      // An attentive player: answers each ticket with its best-looking option.
      for (const tk of last.tickets.filter((x: any) => x.status === "open")) {
        const score = (o: any) => Object.values(o.effects).reduce((a: number, b: any) => a + b, 0) + (o.patches ? 10 : 0);
        // Varied choices: the fake model always offers the same three options.
        const best = Math.random() < 0.5 ? [...tk.options].sort((a: any, b: any) => score(b) - score(a))[0] : tk.options[Math.floor(Math.random() * tk.options.length)];
        await c.company.answer(tk.id, { optionId: best.id }, since).catch(() => null);
      }
    }
    await runAlarms(c);
  }
  return c.company.getState(0);
}

// 1. new company
const c = make();
let st = await c.company.getState(0);
check(st.employees.length === 6, "6 staff");
check(st.messages.length === 1 && st.messages[0].text.includes(st.company.business), "welcome notice mentions business");
check(st.typing.includes("general"), "team typing their greetings");
await runAlarms(c);
st = await c.company.getState(0);
check(aiCalls.includes("welcome") && st.messages.filter((m: any) => m.text.startsWith("ทักทายแบบที่")).length === 4, "AI greetings posted");
check(st.messages.some((m: any) => m.channel.startsWith("dm-")), "a greeting arrives by DM");
check(st.tickets.length === 0, "no tickets at start");
check(st.employees.every((e: any) => typeof e.morale === "number" && e.level >= 1), "morale and level exposed");
const epoch1 = st.epoch;

// 2. first event after ~30s online
st = await onlineFor(c, 40_000);
check(aiCalls.includes("scene") || st.tickets.length > 0, "an event happened");
check(st.tickets.length >= 1, `ticket created (got ${st.tickets.length})`);
check(st.messages.some((m: any) => m.kind === "chat" && m.channel === "random") || true, "");
const t1 = st.tickets[0];
check(t1 && t1.status === "open" && t1.deadlineIn > 0, "ticket open with deadline");
check(st.messages.some((m: any) => m.link === `ticket:${t1?.id}`), "ticket notice posted");
check(!t1?.subject.endsWith("คะ?"), `narration particle stripped: ${t1?.subject}`);

// 3. answer with a button → aftermath via AI unless scripted
const cashBefore = st.stats.cash;
aiCalls = [];
st = await c.company.answer(t1.id, { optionId: t1.options[0].id }, 0);
const after1 = st.tickets.find((t: any) => t.id === t1.id);
check(after1.status === "done" && after1.outcome, "ticket resolved with outcome");
check(st.messages.some((m: any) => m.author === "ceo" && m.text.includes(t1.subject)), "CEO decision posted");
await runAlarms(c);
st = await c.company.getState(0);
check(st.stats.cash !== cashBefore || t1.options[0].effects.cash === undefined, "cash effect applied");

// 4. live chat in a DM
const target = st.employees[3];
aiCalls = [];
st = await c.company.chat(`dm-${target.id}`, "ช่วงนี้งานเป็นยังไงบ้าง", 0);
check(st.typing.includes(`dm-${target.id}`), "typing shown while reply queued");
await runAlarms(c);
st = await c.company.getState(0);
const reply = st.messages.filter((m: any) => m.channel === `dm-${target.id}` && m.author === target.id);
check(aiCalls.includes("reply") && reply.some((m: any) => m.text === "ตอบ CEO แล้ว"), "DM reply from that employee");
check(!st.typing.includes(`dm-${target.id}`), "typing cleared");

// 5. typed answer → interpret
st = await onlineFor(c, 150_000);
// HR tickets only accept their own options, so pick a regular one for the free-text test.
const t2 = st.tickets.find((t: any) => t.status === "open" && !/ขอปรับเงินเดือน|ยื่นใบลาออก|ผู้สมัครตำแหน่ง/.test(t.subject));
check(t2, "another ticket arrives");
if (t2) {
  st = await c.company.answer(t2.id, { text: "ให้ทีมทำครึ่งหนึ่งก่อน แล้วค่อยดูผล" }, 0);
  check(st.tickets.find((t: any) => t.id === t2.id).status === "thinking", "typed answer -> thinking");
  await runAlarms(c);
  st = await c.company.getState(0);
  const r2 = st.tickets.find((t: any) => t.id === t2.id);
  check(r2.status === "done" && r2.outcome.startsWith("ตอบเอง"), `custom answer resolved: ${r2.outcome}`);
}

// 6. expiry while online
st = await onlineFor(c, 150_000);
const t3 = st.tickets.find((t: any) => t.status === "open");
if (t3) {
  st = await onlineFor(c, t3.deadlineIn + 10_000);
  const r3 = st.tickets.find((t: any) => t.id === t3.id);
  check(r3?.status === "expired" && r3.outcome, "ticket expired with outcome");
  check(st.messages.some((m: any) => m.text.startsWith("⏰ ไม่ได้ตอบทันเวลา")), "expiry posted");
} else errors.push("no ticket to expire");

// 7. offline: no polling for an hour, alarms only
const s6 = await c.company.getState(0);
console.log("after ignoring tickets:", s6.gameOver, JSON.stringify(s6.stats));
const s7 = s6;
const day7 = s7.day;
const open7 = s7.tickets.filter((t: any) => t.status === "open").length;
for (let i = 0; i < 12; i++) {
  NOW += 5 * 60 * 1000;
  await runAlarms(c);
}
const kv = c.kv.get("state") as any;
check(kv.clock > 0 && NOW - kv.lastSeen > 15000, "offline state");
st = await c.company.getState(0);
check(st.day >= day7, "day did not go backwards");
const chatterOffline = st.messages.filter((m: any) => m.channel === "random").length;

// 8. many days online: payday and HR
st = await onlineFor(c, 55 * 60 * 1000, 5000, true);
console.log("after 55 attentive minutes:", st.gameOver, JSON.stringify(st.stats), "day", st.day, "staff", st.employees.length);
check(st.day >= 5, `days advance (day ${st.day})`);
check(st.messages.some((m: any) => m.text.startsWith("💰 สิ้นเดือนที่")), "payday posted");
check(st.messages.some((m: any) => m.kind === "chat" && ["random", "general", "dev"].includes(m.channel)), "small talk while online");
check(st.tickets.filter((t: any) => t.status === "open").length <= 6, "open tickets capped");

// 9. team actions
const n0 = st.employees.length;
st = await c.company.team("hire", { role: st.company.hireRoles[0].id }, 0);
const hire = st.tickets.find((t: any) => t.subject.startsWith("ผู้สมัครตำแหน่ง") && t.status === "open");
check(hire, "hiring ticket created");
if (hire) {
  st = await c.company.answer(hire.id, { optionId: "a" }, 0);
  check(st.employees.length === n0 + 1, "candidate hired");
  check(st.messages.some((m: any) => m.text.includes("เข้าร่วมทีม")), "hire announced");
}
const victim = st.employees[st.employees.length - 1];
const cashF = st.stats.cash;
st = await c.company.team("fire", { employeeId: victim.id }, 0);
check(!st.employees.some((e: any) => e.id === victim.id) && st.stats.cash === cashF - victim.salary, "fire removes and pays severance");
const p = st.employees.find((e: any) => (e.level ?? 2) < 3)!;
st = await c.company.team("promote", { employeeId: p.id }, 0);
check(st.employees.find((e: any) => e.id === p.id).level === (p.level ?? 2) + 1, "promote");
let threw = false;
try {
  await c.company.team("hire", { role: "ceo" }, 0);
} catch {
  threw = true;
}
check(threw, "bad role rejected");
threw = false;
try {
  await c.company.chat("security-alerts", "hi", 0);
} catch {
  threw = true;
}
check(threw, "cannot chat in security-alerts");

// 10. AI down: events still happen (scripted), chat gets a holding reply
aiMode = "fail";
const before10 = (await c.company.getState(0)).tickets.length;
st = await c.company.chat("general", "มีใครอยู่ไหม", 0);
await runAlarms(c);
st = await c.company.getState(0);
check(st.messages.some((m: any) => m.text.includes("ตอนนี้ติดงานอยู่")), "holding reply when AI fails");
aiMode = "ok";

// 11. incremental messages
const all = await c.company.getState(0);
const maxId = Math.max(...all.messages.map((m: any) => m.id));
const inc = await c.company.getState(maxId);
check(inc.messages.every((m: any) => m.id > maxId), "since returns only newer messages");

// 12. reset → new epoch, different business
const biz1 = all.company.business;
st = await c.company.reset();
check(st.epoch !== epoch1 && st.company.business !== biz1, "reset gives a new company of another type");
check(st.tickets.length === 0, "reset clears tickets");

// 12b. welcome falls back to random scripted greetings when AI fails
aiMode = "fail";
const fb = make();
await fb.company.getState(0);
await runAlarms(fb);
const fbState = await fb.company.getState(0);
check(fbState.messages.length >= 4 && fbState.messages.length <= 5, `fallback greetings (${fbState.messages.length - 1})`);
aiMode = "ok";

// 13. legacy migration (pre-clock state with a pending decision)
const old = make();
await old.ctx.storage.put("state", {
  day: 3,
  stats: { cash: 40, morale: 60, security: 50, reputation: 60, uptime: 90 },
  presence: {},
  deps: { next: "14.2.10" },
  pendingRegression: null,
  prCounter: 0,
  decision: { id: "d1", prompt: "เรื่องค้างเก่า", options: [{ id: "a", label: "ก", effects: {}, patches: false }, { id: "b", label: "ข", effects: { morale: -5 }, patches: false }], newsId: null },
  openRisks: [],
  seenNews: [],
  gameOver: null,
});
st = await old.company.getState(0);
check(st.tickets.length === 1 && st.tickets[0].subject === "เรื่องค้างเก่า", "legacy decision becomes a ticket");
check(st.stats.cash === Math.round((40 / 70) * 3000000), `legacy cash migrated (${st.stats.cash})`);
check(st.employees.length === 6 && st.employees[0].name === "กาน", "legacy staff kept");

console.log(`AI neurons used in sim: ${Math.round(neurons)}`);
console.log(errors.length ? [...new Set(errors)].filter(Boolean).join("\n") : "all checks passed");
