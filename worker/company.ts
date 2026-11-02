import { DurableObject } from "cloudflare:workers";
import type { ChatMessage, DepVuln, Employee, GameState, MessageKind, NewsItem, OpenRisk, Stats } from "../shared/types";
import { AiBudgetError, aiBudgetPercentLeft, hasAiBudget } from "./budget";
import {
  DAYS_PER_MONTH,
  baseSalary,
  cashUnit,
  companyDeps,
  formatBaht,
  getBusiness,
  monthlyCost,
  monthlyRevenue,
  randomBusiness,
  randomCompanyName,
  type Business,
} from "./business";
import { chatterLine, reminderLine, sadLine } from "./chatter";
import {
  REGRESSION_CHANCE,
  REGRESSION_EFFECTS,
  applyEffects,
  checkGameOver,
  defaultPresence,
  eventPresence,
  formatEffects,
  generateAftermath,
  generateChatReply,
  generateScene,
  generateWelcome,
  interpretReply,
  matchStack,
  matchStackItems,
  mergePresence,
  regressionPosts,
  secBotDepPosts,
  secBotPosts,
  truncate,
  type ChatContext,
  type DraftMessage,
  type PresenceMap,
  type Scene,
  type SceneEvent,
} from "./game";
import { MAX_STAFF, applyAction, dailyHr, fire, hiringTicket, spreadMorale } from "./hr";
import { ensureFreshNews, getRecentNews } from "./news";
import { compareVersions, getAffectingVulns } from "./osv";
import { depPoolKey, getPooledScene, markBusinessActive, newsPoolKey, pooledKeys } from "./pool";
import { LEGACY_STAFF, NAME_MEMORY, generateStaff, isRoleKey, renderText } from "./roster";
import {
  QUIET_REPEAT_GAP,
  breachScript,
  fallbackReactions,
  pickQuietScript,
  regressionScript,
  toScene,
  welcomeLines,
  welcomeNotice,
  type ScriptedScene,
} from "./scripted";
import { newTicket, openTickets, publicTicket, pruneTickets, sceneToTicket, worstOption, type Ticket } from "./tickets";

// The office runs on its own clock. All timings are game milliseconds: while the player has the
// page open one game ms is one real ms; while away the clock runs OFFLINE_RATE as fast, so the
// office keeps going slowly (an event about every hour) and tickets can still expire.
const EVENT_EVERY_MS = 2 * 60 * 1000;
const FIRST_EVENT_MS = 30 * 1000;
const CHATTER_EVERY_MS = 60 * 1000;
// One game day per event on average, so a month (payday) still spans about five decisions,
// the balance the economy was tuned for.
const DAY_MS = EVENT_EVERY_MS;
const OFFLINE_RATE = 1 / 30;
const ONLINE_WINDOW_MS = 15 * 1000;
// One tick never moves the clock further than this, so a long gap cannot fire a flood of events.
const MAX_TICK_MS = 30 * 60 * 1000;
const MAX_DAYS_PER_TICK = 3;
// With this many tickets open, new events wait; the team grumbles about the backlog instead.
const MAX_OPEN_TICKETS = 5;
const MAX_QUEUED_REPLIES = 4;
// Quiet office days: how often the model writes the scene (when budget allows) instead of a script.
// Non-software businesses lean on the model, since most scripts are about a tech team.
const AI_QUIET_CHANCE = 0.5;
const AI_QUIET_CHANCE_NON_SOFTWARE = 0.85;
// A job that has been "running" this long was lost (the object restarted); drop it.
const STALE_JOB_MS = 2 * 60 * 1000;

const BREACH_CHANCE = 0.25;
const BREACH_EFFECTS: Partial<Stats> = { security: -20, reputation: -15, cash: -10, uptime: -15 };
// When both are available, how often an event features a dependency vuln instead of KEV news.
const DEPENDENCY_EVENT_CHANCE = 0.5;
const MESSAGE_LIMIT = 300;
const MAX_TEXT = 500;

// AI work runs one job at a time from the alarm, never inside a player's request.
type Job =
  | { type: "welcome" }
  | { type: "event" }
  | { type: "reply"; channel: string; text: string }
  | { type: "aftermath"; ticketId: string; optionId: string }
  | { type: "interpret"; ticketId: string; text: string };

interface StoredState {
  epoch: string;
  day: number;
  businessId: string;
  companyName: string;
  staff: Employee[];
  // stats.cash is in baht.
  stats: Stats;
  presence: PresenceMap;
  // Current version of each npm dependency; patched upgrades move these forward.
  deps: Record<string, string>;
  pendingRegression: { pkg: string; version: string } | null;
  prCounter: number;
  openRisks: OpenRisk[];
  seenNews: string[];
  recentScripts: string[];
  gameOver: string | null;
  clock: number;
  lastReal: number;
  lastSeen: number;
  nextEventAt: number;
  nextChatterAt: number;
  tickets: Ticket[];
  jobs: Job[];
  running: Job | null;
  runningSince: number;
}

// A news or dependency event that is only committed once a scene for it is available.
interface EventPlan {
  event: SceneEvent;
  posts: DraftMessage[];
  seenKey: string;
  risk: OpenRisk | null;
  poolKey: string | null;
  isDependency: boolean;
}

type MessageRow = {
  id: number;
  channel: string;
  author: string;
  text: string;
  kind: string;
  link: string | null;
  ts: number;
};

function jitter(ms: number): number {
  return Math.round(ms * (0.7 + Math.random() * 0.6));
}

function ticketChannel(t: Ticket): string {
  return t.kind === "dm" ? `dm-${t.from}` : "general";
}

// One Durable Object per player company: the clock, staff, tickets and the chat log.
export class Company extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      kind TEXT NOT NULL,
      link TEXT,
      ts INTEGER NOT NULL
    )`);
  }

  // ---------------------------------------------------------------------------
  // Player requests. Each one ticks the clock; none waits on the model.

  async getState(since = 0): Promise<GameState> {
    const s = await this.mutate((s) => {
      s.lastSeen = Date.now();
    });
    return this.view(s, since);
  }

  async chat(channel: string, text: string, since = 0): Promise<GameState> {
    const s = await this.mutate((s, posts) => {
      if (s.gameOver) throw new Error("เกมจบแล้ว กดเริ่มบริษัทใหม่ได้เลย");
      const clean = text.trim().slice(0, MAX_TEXT);
      if (!clean) throw new Error("พิมพ์ข้อความก่อนนะ");
      if (!this.validChannel(s, channel)) throw new Error("ส่งข้อความในช่องนี้ไม่ได้");
      if (s.jobs.filter((j) => j.type === "reply").length >= MAX_QUEUED_REPLIES) throw new Error("ทีมยังตอบข้อความก่อนหน้าไม่ทัน รอสักครู่นะ");
      s.lastSeen = Date.now();
      posts.push({ channel, author: "ceo", text: clean, kind: "chat" });
      s.jobs.push({ type: "reply", channel, text: clean });
    });
    return this.view(s, since);
  }

  async answer(ticketId: string, choice: { optionId?: string; text?: string }, since = 0): Promise<GameState> {
    const s = await this.mutate((s, posts) => {
      if (s.gameOver) throw new Error("เกมจบแล้ว กดเริ่มบริษัทใหม่ได้เลย");
      const t = s.tickets.find((x) => x.id === ticketId);
      if (!t || t.status !== "open") throw new Error("เรื่องนี้ปิดไปแล้ว");
      s.lastSeen = Date.now();
      if (choice.optionId) {
        const option = t.options.find((o) => o.id === choice.optionId);
        if (!option) throw new Error("ไม่พบตัวเลือกนี้");
        const needsAftermath = this.resolve(s, t, { optionId: option.id, label: option.label, effects: option.effects, patches: option.patches }, posts);
        if (needsAftermath) s.jobs.push({ type: "aftermath", ticketId: t.id, optionId: option.id });
        return;
      }
      const text = choice.text?.trim().slice(0, MAX_TEXT);
      if (!text) throw new Error("เลือกตัวเลือกหรือพิมพ์คำตอบก่อนนะ");
      t.status = "thinking";
      posts.push({ channel: ticketChannel(t), author: "ceo", text: `↩️ ${t.subject}\n${text}`, kind: "chat" });
      s.jobs.push({ type: "interpret", ticketId: t.id, text });
    });
    return this.view(s, since);
  }

  async team(action: string, target: { employeeId?: string; role?: string }, since = 0): Promise<GameState> {
    const s = await this.mutate((s, posts) => {
      if (s.gameOver) throw new Error("เกมจบแล้ว กดเริ่มบริษัทใหม่ได้เลย");
      const b = getBusiness(s.businessId);
      s.lastSeen = Date.now();
      if (action === "hire") {
        if (!target.role || !isRoleKey(target.role)) throw new Error("ไม่รู้จักตำแหน่งนี้");
        if (s.staff.length >= MAX_STAFF) throw new Error(`ทีมเต็มแล้ว (${MAX_STAFF} คน)`);
        if (openTickets(s.tickets).some((t) => t.tag === `hire:${target.role}`)) throw new Error("กำลังเปิดรับสมัครตำแหน่งนี้อยู่แล้ว ดูใน Inbox");
        const t = hiringTicket(target.role, s.staff, b, [], s.clock, "เปิดรับสมัครตามที่ CEO สั่ง");
        s.tickets.push(t.ticket);
        posts.push(t.message);
        return;
      }
      const person = s.staff.find((e) => e.id === target.employeeId);
      if (!person) throw new Error("ไม่พบพนักงานคนนี้");
      if (action === "fire") {
        posts.push(...fire(s, person.id));
        // Their pending requests go with them.
        for (const t of openTickets(s.tickets)) {
          if (t.from === person.id && t.kind === "dm") {
            t.status = "expired";
            t.outcome = `${person.name} ไม่ได้อยู่ที่บริษัทแล้ว`;
            t.closedAt = s.clock;
          }
        }
      } else if (action === "raise") {
        const r = applyAction({ type: "raise", employeeId: person.id, pct: 10, morale: 15 }, s, b);
        posts.push({ channel: "general", author: "system", kind: "system", text: `💸 ขึ้นเงินเดือน ${r.outcome}` });
        posts.push(this.say(s, person, `dm-${person.id}`, "ขอบคุณมาก{end} CEO! 🙌"));
      } else if (action === "promote") {
        if (person.level >= 3) throw new Error(`${person.name} อยู่ระดับสูงสุดแล้ว`);
        const r = applyAction({ type: "promote", employeeId: person.id }, s, b);
        posts.push(...r.posts, this.say(s, person, `dm-${person.id}`, "ขอบคุณที่ไว้ใจ{end} จะไม่ทำให้ผิดหวัง 🙏"));
      } else {
        throw new Error("ไม่รู้จักคำสั่งนี้");
      }
      s.gameOver = checkGameOver(s.stats);
    });
    return this.view(s, since);
  }

  async reset(): Promise<GameState> {
    this.sql.exec("DELETE FROM messages");
    await this.ctx.storage.delete("state");
    await this.ctx.storage.deleteAlarm();
    return this.getState(0);
  }

  // ---------------------------------------------------------------------------
  // Background work: the alarm ticks the clock and runs one AI job, then re-arms.

  async alarm(): Promise<void> {
    let job: Job | null = null;
    await this.mutate((s) => {
      if (s.running && Date.now() - s.runningSince > STALE_JOB_MS) s.running = null;
      if (s.running || s.gameOver) return;
      job = s.jobs.shift() ?? null;
      s.running = job;
      s.runningSince = Date.now();
    });
    if (!job) return;
    try {
      await this.runJob(job);
    } catch (err) {
      console.error(`job ${(job as Job).type} failed`, err);
    } finally {
      await this.mutate((s) => {
        s.running = null;
      });
    }
  }

  private async runJob(job: Job): Promise<void> {
    if (job.type === "welcome") return this.runWelcome();
    if (job.type === "event") return this.runEvent();
    if (job.type === "reply") return this.runReply(job.channel, job.text);
    if (job.type === "aftermath") return this.runAftermath(job.ticketId, job.optionId);
    return this.runInterpret(job.ticketId, job.text);
  }

  // Loads state, advances the clock, applies fn, saves, and re-arms the alarm. Only storage is
  // awaited in between, so nothing else can interleave with the change.
  private async mutate(fn: (s: StoredState, posts: DraftMessage[]) => void): Promise<StoredState> {
    const s = await this.load();
    const usedNames = (await this.ctx.storage.get<string[]>("usedNames")) ?? [];
    const posts: DraftMessage[] = [];
    this.tick(s, Date.now(), usedNames, posts);
    fn(s, posts);
    s.tickets = pruneTickets(s.tickets);
    this.insert(posts.filter((p) => this.isKnownAuthor(s, p.author)));
    await this.save(s);
    await this.schedule(s);
    return s;
  }

  private async schedule(s: StoredState): Promise<void> {
    if (s.gameOver) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    if (s.jobs.length && !s.running) {
      await this.ctx.storage.setAlarm(Date.now());
      return;
    }
    // Otherwise wake for the next thing that happens on its own, assuming the player is away
    // (while they are online, their polling ticks the clock anyway).
    const dues = [s.nextEventAt, (s.day + 1) * DAY_MS];
    for (const t of openTickets(s.tickets)) dues.push(t.status === "open" ? t.deadline : Infinity);
    const nextDue = Math.min(...dues);
    const wait = Math.max(5000, (nextDue - s.clock) / OFFLINE_RATE);
    await this.ctx.storage.setAlarm(Date.now() + (s.running ? STALE_JOB_MS : wait));
  }

  private tick(s: StoredState, now: number, usedNames: string[], posts: DraftMessage[]): void {
    const online = now - s.lastSeen < ONLINE_WINDOW_MS;
    const elapsed = Math.max(0, now - s.lastReal);
    s.lastReal = now;
    if (s.gameOver) return;
    s.clock += Math.min(MAX_TICK_MS, elapsed * (online ? 1 : OFFLINE_RATE));
    const b = getBusiness(s.businessId);

    // Day boundaries: HR, and payday every DAYS_PER_MONTH days.
    const today = Math.floor(s.clock / DAY_MS);
    for (let n = 0; s.day < today && n < MAX_DAYS_PER_TICK; n++) {
      s.day += 1;
      const hr = dailyHr(s, b, usedNames);
      s.tickets.push(...hr.tickets);
      posts.push(...hr.posts);
      if (s.day % DAYS_PER_MONTH === 0) posts.push(this.payday(s, b));
    }
    if (s.day < today) s.day = today;

    for (const t of openTickets(s.tickets)) {
      if (t.status !== "open") continue;
      if (s.clock >= t.deadline) this.expire(s, t, posts);
      else if (!t.reminded && s.clock >= (t.createdAt + t.deadline) / 2) {
        t.reminded = true;
        const line = reminderLine(s.staff, t.from, t.subject, ticketChannel(t));
        if (line) posts.push(line);
      }
    }

    if (s.clock >= s.nextChatterAt) {
      s.nextChatterAt = s.clock + jitter(CHATTER_EVERY_MS);
      // Small talk is for the player; nobody chats into an empty room.
      const chat = online ? chatterLine(s.staff, (e) => s.presence[e.id]?.mood ?? "🙂") : null;
      if (chat) {
        posts.push(chat.post);
        s.presence = mergePresence(s.presence, chat.presence);
      }
    }

    const eventQueued = s.jobs.some((j) => j.type === "event") || s.running?.type === "event";
    if (s.clock >= s.nextEventAt && !eventQueued) {
      s.nextEventAt = s.clock + jitter(EVENT_EVERY_MS);
      s.jobs.push({ type: "event" });
    }
    s.gameOver = checkGameOver(s.stats);
  }

  // ---------------------------------------------------------------------------
  // Tickets

  // Applies the CEO's answer. Returns true when the model should still write the reactions.
  private resolve(
    s: StoredState,
    t: Ticket,
    choice: { optionId: string | null; label: string; effects: Partial<Stats>; patches: boolean },
    posts: DraftMessage[],
  ): boolean {
    const b = getBusiness(s.businessId);
    const unit = cashUnit(b);
    this.applyEffects(s, choice.effects, unit);
    let note = "";
    if (choice.patches && t.newsId) note = this.patch(s, t.newsId);
    const action = choice.optionId ? t.actions?.[choice.optionId] : undefined;
    if (action) {
      const r = applyAction(action, s, b);
      posts.push(...r.posts);
      if (r.outcome) note += `\n${r.outcome}`;
    } else if (t.kind === "dm") {
      const person = s.staff.find((e) => e.id === t.from);
      if (person) person.morale = Math.min(100, person.morale + 5);
    }
    const effects = formatEffects(choice.effects, unit);
    t.status = "done";
    t.closedAt = s.clock;
    t.outcome = `${choice.label}${effects ? ` · ${effects}` : ""}${note}`;
    const channel = ticketChannel(t);
    posts.push({ channel, author: "ceo", text: `📢 ${t.subject}\nตัดสินใจ: ${choice.label}` });
    posts.push({ channel, author: "system", kind: "system", text: `ผลกระทบ: ${effects || "ไม่มี"}${note}` });
    const scripted = choice.optionId ? t.reactions?.[choice.optionId] : undefined;
    if (scripted) posts.push(...scripted);
    s.gameOver = checkGameOver(s.stats);
    return !scripted && !action && choice.optionId !== null;
  }

  // Nobody answered in time: the ticket resolves itself, badly.
  private expire(s: StoredState, t: Ticket, posts: DraftMessage[]): void {
    const b = getBusiness(s.businessId);
    const unit = cashUnit(b);
    let outcome: string;
    if (t.actions || t.timeoutAction) {
      // HR tickets: only the timeout action happens (an applicant is never hired by default).
      const r = t.timeoutAction ? applyAction(t.timeoutAction, s, b) : { posts: [], outcome: "" };
      posts.push(...r.posts);
      outcome = r.outcome || (t.tag?.startsWith("hire:") ? "ผู้สมัครไปรับงานที่อื่นแล้ว" : "ไม่มีการเปลี่ยนแปลง");
    } else {
      const worst = worstOption(t.options);
      const effects: Partial<Stats> = { ...worst.effects, morale: (worst.effects.morale ?? 0) - 3 };
      this.applyEffects(s, effects, unit);
      outcome = `ทีมตัดสินใจกันเอง: ${worst.label} · ${formatEffects(effects, unit)}`;
      const risk = t.newsId ? s.openRisks.find((r) => r.newsId === t.newsId) : undefined;
      if (risk) {
        risk.ignored = true;
        outcome += `\n⚠️ ${risk.newsId} ยังไม่ได้แก้ และมีโอกาสโดนเจาะสูงขึ้น`;
      }
      if (t.kind === "dm") {
        const person = s.staff.find((e) => e.id === t.from);
        if (person) {
          person.morale = Math.max(0, person.morale - 15);
          const sad = sadLine(s.staff, person.id);
          if (sad) posts.push(sad);
        }
      }
    }
    t.status = "expired";
    t.closedAt = s.clock;
    t.outcome = outcome;
    posts.push({ channel: ticketChannel(t), author: "system", kind: "system", text: `⏰ ไม่ได้ตอบทันเวลา: ${t.subject}\n${outcome}` });
    s.gameOver = checkGameOver(s.stats);
  }

  // Closes the risk behind a ticket; dependency fixes upgrade the package (and may break things).
  private patch(s: StoredState, newsId: string): string {
    const risk = s.openRisks.find((r) => r.newsId === newsId);
    if (risk?.kind === "dependency" && risk.package && risk.fixedVersion) {
      const pkg = risk.package;
      const before = s.deps[pkg];
      if (!before || compareVersions(risk.fixedVersion, before) > 0) s.deps[pkg] = risk.fixedVersion;
      const after = s.deps[pkg];
      // One upgrade can close several advisories for the same package.
      s.openRisks = s.openRisks.filter((r) => !(r.package === pkg && r.fixedVersion && compareVersions(r.fixedVersion, after) <= 0));
      if (Math.random() < REGRESSION_CHANCE) s.pendingRegression = { pkg, version: after };
      return `\n✅ merge PR แล้ว: ${pkg} ${before} → ${after}`;
    }
    s.openRisks = s.openRisks.filter((r) => r.newsId !== newsId);
    return `\n✅ ปิดความเสี่ยง ${newsId} แล้ว`;
  }

  private applyEffects(s: StoredState, effects: Partial<Stats>, unit: number): void {
    const before = s.stats.morale;
    applyEffects(s.stats, effects, unit);
    spreadMorale(s.staff, s.stats.morale - before);
  }

  // ---------------------------------------------------------------------------
  // Jobs

  private async runEvent(): Promise<void> {
    await ensureFreshNews(this.env);
    const s0 = await this.load();
    if (s0.gameOver) return;
    if (openTickets(s0.tickets).length >= MAX_OPEN_TICKETS) {
      await this.mutate((s, posts) => {
        const pm = s.staff.find((e) => e.roleKey === "pm") ?? s.staff[0];
        if (pm) posts.push(this.say(s, pm, "general", "CEO เรื่องที่รอตัดสินใจค้างเยอะแล้วนะ{ask} ทีมเริ่มทำงานต่อไม่ได้ 😰"));
      });
      return;
    }
    const b = getBusiness(s0.businessId);
    await markBusinessActive(this.env, b.id);
    const aiOk = await hasAiBudget(this.env);
    const day = s0.day;
    const live = (event: SceneEvent, openRisks: OpenRisk[]) =>
      aiOk
        ? liveOrNull(() =>
            generateScene(this.env, {
              event,
              openRisks,
              staff: s0.staff,
              business: b,
              companyName: s0.companyName,
              money: { revenue: monthlyRevenue(b, s0.stats, s0.staff), cost: monthlyCost(b, s0.staff) },
              day,
              stats: s0.stats,
              recent: this.recentChat(14),
            }),
          )
        : Promise.resolve(null);

    let event: SceneEvent = { kind: "quiet" };
    let scene: Scene | null = null;
    let scripted: ScriptedScene | null = null;
    let plan: EventPlan | null = null;
    let quietId: string | null = null;
    const breach = s0.pendingRegression ? null : s0.openRisks.find((r) => Math.random() < BREACH_CHANCE * (r.ignored ? 2 : 1));

    if (s0.pendingRegression) {
      const { pkg, version } = s0.pendingRegression;
      event = { kind: "regression", pkg, version };
      scene = await live(event, s0.openRisks);
      if (!scene) scripted = regressionScript(pkg, version);
    } else if (breach) {
      event = { kind: "breach", risk: breach };
      scene = await live(event, s0.openRisks);
      if (!scene) scripted = breachScript(breach);
    } else {
      plan = await this.planNewsEvent(s0, b, day, aiOk);
      if (plan) {
        // A pooled scene costs no AI; otherwise ask the model while budget remains.
        scene = plan.poolKey ? await getPooledScene(this.env, plan.poolKey, s0.staff) : null;
        scene ??= await live(plan.event, plan.risk ? [...s0.openRisks, plan.risk] : s0.openRisks);
        if (scene) event = plan.event;
        else plan = null;
      }
      if (!scene) {
        const aiQuiet = b.software < 0.5 ? AI_QUIET_CHANCE_NON_SOFTWARE : AI_QUIET_CHANCE;
        if (Math.random() < aiQuiet) scene = await live({ kind: "quiet" }, s0.openRisks);
        if (!scene) {
          const quiet = pickQuietScript(s0.recentScripts, s0.staff, b);
          quietId = quiet.id;
          scripted = quiet;
        }
      }
    }

    await this.mutate((s, posts) => {
      if (s.gameOver) return;
      const unit = cashUnit(b);
      let riskId: string | null = null;
      if (event.kind === "regression") {
        s.pendingRegression = null;
        this.applyEffects(s, REGRESSION_EFFECTS, unit);
        posts.push(...regressionPosts(event.pkg, event.version, unit));
      } else if (event.kind === "breach") {
        const risk = event.risk;
        if (!s.openRisks.some((r) => r.newsId === risk.newsId)) return; // patched meanwhile
        this.applyEffects(s, BREACH_EFFECTS, unit);
        s.openRisks = s.openRisks.filter((r) => r.newsId !== risk.newsId);
        posts.push({
          channel: "security-alerts",
          author: "system",
          kind: "system",
          text: `🔥 [เหตุการณ์จำลอง] ระบบที่ยังไม่ได้แก้ ${risk.newsId} (${risk.title}) ถูกเจาะแล้ว!\n${formatEffects(BREACH_EFFECTS, unit)}`,
        });
      } else if (plan) {
        if (s.seenNews.includes(plan.seenKey)) return;
        s.seenNews = [plan.seenKey, ...s.seenNews].slice(0, 300);
        if (plan.isDependency) s.prCounter += 1;
        if (plan.risk) {
          s.openRisks.push(plan.risk);
          riskId = plan.risk.newsId;
        }
        posts.push(...plan.posts);
      }
      if (quietId) s.recentScripts = [quietId, ...s.recentScripts].slice(0, QUIET_REPEAT_GAP);

      let reactions: Record<string, DraftMessage[]> | null = null;
      let finalScene = scene;
      if (scripted) {
        const built = toScene(scripted, s.staff);
        finalScene = built.scene;
        reactions = built.reactions;
      }
      if (!finalScene) return;
      posts.push(...finalScene.messages);
      s.presence = mergePresence(eventPresence(event, s.presence, s.staff), finalScene.presence);
      const { ticket, notice } = sceneToTicket(finalScene, event, s.staff, s.clock, { newsId: riskId, reactions });
      s.tickets.push(ticket);
      posts.push(notice);
      s.gameOver = checkGameOver(s.stats);
    });
  }

  // The team's first messages, written by the model when possible.
  private async runWelcome(): Promise<void> {
    const s0 = await this.load();
    let messages: DraftMessage[] = [];
    let presence: Partial<PresenceMap> = {};
    try {
      const r = await generateWelcome(this.env, this.chatContext(s0));
      messages = r.messages;
      presence = r.presence;
    } catch (err) {
      if (!(err instanceof AiBudgetError)) console.error("welcome failed", err);
    }
    await this.mutate((s, posts) => {
      posts.push(...(messages.length >= 2 ? messages : welcomeLines(s.staff)));
      s.presence = mergePresence(s.presence, presence);
    });
  }

  private async runReply(channel: string, text: string): Promise<void> {
    const s0 = await this.load();
    let messages: DraftMessage[] = [];
    let presence: Partial<PresenceMap> = {};
    try {
      const r = await generateChatReply(this.env, { ...this.chatContext(s0), channel, text });
      messages = r.messages;
      presence = r.presence;
    } catch (err) {
      if (!(err instanceof AiBudgetError)) console.error("chat reply failed", err);
    }
    await this.mutate((s, posts) => {
      if (!messages.length) {
        // No model (or a bad answer): a short holding reply so the CEO is not left hanging.
        const who = channel.startsWith("dm-") ? s.staff.find((e) => `dm-${e.id}` === channel) : s.staff[Math.floor(Math.random() * s.staff.length)];
        if (who) posts.push(this.say(s, who, channel, "รับทราบ{end} ตอนนี้ติดงานอยู่ เดี๋ยวกลับมาตอบนะ{ask}"));
        return;
      }
      posts.push(...messages);
      s.presence = mergePresence(s.presence, presence);
    });
  }

  private async runAftermath(ticketId: string, optionId: string): Promise<void> {
    const s0 = await this.load();
    const t = s0.tickets.find((x) => x.id === ticketId);
    const chosen = t?.options.find((o) => o.id === optionId);
    if (!t || !chosen) return;
    let messages: DraftMessage[] = [];
    let presence: Partial<PresenceMap> = {};
    try {
      const r = await generateAftermath(this.env, {
        staff: s0.staff,
        cashUnit: cashUnit(getBusiness(s0.businessId)),
        prompt: t.subject,
        chosen,
        others: t.options.filter((o) => o.id !== chosen.id),
        recent: this.recentChat(10),
      });
      messages = r.messages;
      presence = r.presence;
    } catch (err) {
      // Reactions are flavour; the decision itself already counted.
      if (!(err instanceof AiBudgetError)) console.error("aftermath failed", err);
    }
    await this.mutate((s, posts) => {
      posts.push(...(messages.length ? messages : fallbackReactions(chosen, s.staff)));
      s.presence = mergePresence(s.presence, presence);
    });
  }

  private async runInterpret(ticketId: string, text: string): Promise<void> {
    const s0 = await this.load();
    const t = s0.tickets.find((x) => x.id === ticketId);
    if (!t || t.status !== "thinking") return;
    let result: Awaited<ReturnType<typeof interpretReply>> | null = null;
    try {
      result = await interpretReply(this.env, {
        ...this.chatContext(s0),
        from: s0.staff.find((e) => e.id === t.from),
        subject: t.subject,
        body: t.body,
        options: t.options,
        canPatch: Boolean(t.newsId),
        allowCustom: !t.actions,
        text,
      });
    } catch (err) {
      if (!(err instanceof AiBudgetError)) console.error("interpret failed", err);
    }
    await this.mutate((s, posts) => {
      const live = s.tickets.find((x) => x.id === ticketId);
      if (!live || live.status !== "thinking") return;
      if (!result) {
        live.status = "open";
        posts.push({ channel: ticketChannel(live), author: "system", kind: "system", text: "ตอนนี้ตีความคำตอบที่พิมพ์ไม่ได้ (โควตา AI หมดหรือขัดข้อง) กรุณาเลือกจากปุ่มแทน" });
        return;
      }
      const option = result.optionId ? live.options.find((o) => o.id === result!.optionId) : undefined;
      const label = option ? option.label : `ตอบเอง: ${truncate(text, 80)}`;
      this.resolve(s, live, { optionId: option?.id ?? null, label, effects: result.effects, patches: result.patches }, posts);
      const from = s.staff.find((e) => e.id === live.from);
      // Scripted reactions (HR tickets) already spoke; otherwise the requester answers.
      if (result.reply && from && !(option && live.reactions?.[option.id])) {
        posts.push({ channel: ticketChannel(live), author: from.id, text: result.reply, kind: "chat" });
      }
    });
  }

  private chatContext(s: StoredState): ChatContext {
    const b = getBusiness(s.businessId);
    return {
      staff: s.staff,
      business: b,
      companyName: s.companyName,
      stats: s.stats,
      money: { revenue: monthlyRevenue(b, s.stats, s.staff), cost: monthlyCost(b, s.staff) },
      tickets: openTickets(s.tickets).map((t) => {
        const from = s.staff.find((e) => e.id === t.from)?.name ?? "ระบบ";
        return `${from} (${t.kind}): ${t.subject} (${Math.max(0, Math.round((t.deadline - s.clock) / 60000))} min left)`;
      }),
      recent: this.recentChat(14),
    };
  }

  // Picks the next unseen news or dependency event without changing state. Without AI budget,
  // only events that already have a pooled scene qualify.
  private async planNewsEvent(s: StoredState, b: Business, day: number, aiOk: boolean): Promise<EventPlan | null> {
    const newsKey = (n: NewsItem) => newsPoolKey(b.id, n);
    const depKey = (v: DepVuln) => depPoolKey(b.id, v, s.deps[v.package]);
    const fresh = (await getRecentNews(this.env, 40)).filter((n) => !s.seenNews.includes(n.id));
    const vulns = (await getAffectingVulns(this.env, s.deps)).filter((v) => !s.seenNews.includes(`${v.package}:${v.id}`));
    const pooled = await pooledKeys(this.env, [...fresh.map(newsKey), ...vulns.map(depKey)]);
    const usableNews = aiOk ? fresh : fresh.filter((n) => pooled.has(newsKey(n)));
    const matchedNews = usableNews.find((n) => matchStack(n, b.stack).length);
    // npm advisories (pull requests, package.json) mostly matter to software businesses.
    const depVuln = Math.random() < b.software ? vulns.find((v) => aiOk || pooled.has(depKey(v))) : undefined;

    if (depVuln && (!matchedNews || Math.random() < DEPENDENCY_EVENT_CHANCE)) {
      const current = s.deps[depVuln.package];
      const poolKey = depKey(depVuln);
      return {
        event: { kind: "dependency", vuln: depVuln, currentVersion: current },
        posts: secBotDepPosts(depVuln, current, s.prCounter + 1),
        seenKey: `${depVuln.package}:${depVuln.id}`,
        risk: {
          newsId: depVuln.id,
          title: `${depVuln.package}@${current}: ${truncate(depVuln.summary, 80)}`,
          since: day,
          kind: "dependency",
          layer: "app",
          component: `npm: ${depVuln.package}`,
          package: depVuln.package,
          fixedVersion: depVuln.fixed,
        },
        poolKey: pooled.has(poolKey) ? poolKey : null,
        isDependency: true,
      };
    }

    const news = matchedNews ?? usableNews[0];
    if (!news) return null;
    const items = matchStackItems(news, b.stack);
    const matched = items.map((i) => i.name);
    return {
      event: { kind: "news", news, matched },
      posts: secBotPosts(news, matched),
      seenKey: news.id,
      risk: items.length ? { newsId: news.id, title: news.name, since: day, kind: "kev", layer: items[0].layer, component: items[0].name } : null,
      poolKey: pooled.has(newsKey(news)) ? newsKey(news) : null,
      isDependency: false,
    };
  }

  // Month end: revenue in, salaries and fixed costs out.
  private payday(s: StoredState, b: Business): DraftMessage {
    const revenue = monthlyRevenue(b, s.stats, s.staff);
    const payroll = s.staff.reduce((sum, e) => sum + e.salary, 0);
    const net = revenue - payroll - b.fixedCost;
    s.stats.cash += net;
    const runway = net < 0 && s.stats.cash > 0 ? `\n⚠️ ถ้าเป็นแบบนี้ต่อ เงินพออีกราว ${Math.max(1, Math.floor(s.stats.cash / -net))} เดือน` : "";
    return {
      channel: "general",
      author: "system",
      kind: "system",
      text:
        `💰 สิ้นเดือนที่ ${s.day / DAYS_PER_MONTH}: รายได้ +${formatBaht(revenue)} · เงินเดือน -${formatBaht(payroll)} · ` +
        `ค่าใช้จ่ายอื่น -${formatBaht(b.fixedCost)}\nสุทธิ ${net >= 0 ? "+" : "-"}${formatBaht(Math.abs(net))} · ` +
        `เงินคงเหลือ ${formatBaht(s.stats.cash)}${runway}`,
    };
  }

  // ---------------------------------------------------------------------------
  // Storage

  private async load(): Promise<StoredState> {
    const existing = await this.ctx.storage.get<StoredState & { decision?: LegacyDecision | null; scriptedReactions?: Record<string, DraftMessage[]> | null }>("state");
    if (existing) return migrate(existing);
    // Names and the business type of this player's earlier companies survive resets, so the next one feels new.
    const usedNames = (await this.ctx.storage.get<string[]>("usedNames")) ?? [];
    const b = randomBusiness(await this.ctx.storage.get<string>("lastBusiness"));
    const staff = generateStaff(usedNames, b);
    await this.ctx.storage.put({
      usedNames: [...staff.map((e) => e.name), ...usedNames].slice(0, NAME_MEMORY),
      lastBusiness: b.id,
    });
    const now = Date.now();
    const fresh: StoredState = {
      epoch: crypto.randomUUID(),
      day: 0,
      businessId: b.id,
      companyName: randomCompanyName(b),
      staff,
      stats: { ...b.stats, cash: b.startCash },
      presence: defaultPresence(staff),
      deps: companyDeps(b),
      pendingRegression: null,
      prCounter: 0,
      openRisks: [],
      seenNews: [],
      recentScripts: [],
      gameOver: null,
      clock: 0,
      lastReal: now,
      lastSeen: now,
      nextEventAt: FIRST_EVENT_MS,
      nextChatterAt: 15 * 1000,
      tickets: [],
      jobs: [{ type: "welcome" }],
      running: null,
      runningSince: 0,
    };
    this.insert([welcomeNotice({ name: fresh.companyName, business: b.label })]);
    await this.save(fresh);
    return fresh;
  }

  private async save(s: StoredState): Promise<void> {
    await this.ctx.storage.put("state", s);
  }

  private insert(posts: DraftMessage[]): void {
    const now = Date.now();
    posts.forEach((p, i) => {
      this.sql.exec(
        "INSERT INTO messages (channel, author, text, kind, link, ts) VALUES (?, ?, ?, ?, ?, ?)",
        p.channel,
        p.author,
        p.text,
        p.kind ?? "chat",
        p.link ?? null,
        now + i,
      );
    });
    this.sql.exec("DELETE FROM messages WHERE id <= (SELECT MAX(id) FROM messages) - 1000");
  }

  private recentChat(limit: number): string[] {
    return this.sql
      .exec<MessageRow>("SELECT * FROM messages WHERE kind = 'chat' ORDER BY id DESC LIMIT ?", limit)
      .toArray()
      .reverse()
      .map((m) => `#${m.channel} ${m.author}: ${truncate(m.text, 160)}`);
  }

  // Lines from people who have left (an AI answer written before they went) are dropped.
  private isKnownAuthor(s: StoredState, author: string): boolean {
    return author === "system" || author === "secbot" || author === "ceo" || s.staff.some((e) => e.id === author);
  }

  private validChannel(s: StoredState, channel: string): boolean {
    return ["general", "dev", "random"].includes(channel) || s.staff.some((e) => `dm-${e.id}` === channel);
  }

  private say(s: StoredState, person: Employee, channel: string, text: string): DraftMessage {
    return { channel, author: person.id, text: renderText(text, s.staff, person) ?? text, kind: "chat" };
  }

  private async view(s: StoredState, since: number): Promise<GameState> {
    const rows =
      since > 0
        ? this.sql.exec<MessageRow>("SELECT * FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?", since, MESSAGE_LIMIT).toArray()
        : this.sql.exec<MessageRow>("SELECT * FROM messages ORDER BY id DESC LIMIT ?", MESSAGE_LIMIT).toArray().reverse();
    const messages: ChatMessage[] = rows.map((m) => ({ ...m, kind: m.kind as MessageKind }));
    const b = getBusiness(s.businessId);
    const typingOf = (j: Job | null): string | null =>
      !j ? null : j.type === "reply" ? j.channel : j.type === "welcome" ? "general" : j.type === "event" ? null : `ticket:${j.ticketId}`;
    const open = openTickets(s.tickets).sort((x, y) => x.deadline - y.deadline);
    const closed = s.tickets.filter((t) => !open.includes(t));
    return {
      epoch: s.epoch,
      day: s.day,
      company: { name: s.companyName, business: b.label },
      money: {
        monthlyRevenue: monthlyRevenue(b, s.stats, s.staff),
        monthlyCost: monthlyCost(b, s.staff),
        daysToPayday: DAYS_PER_MONTH - (s.day % DAYS_PER_MONTH),
      },
      stats: s.stats,
      // Personality, secret goal and speech stay server-side.
      employees: s.staff.map(({ id, name, role, emoji, avatar, salary, morale, level }) => ({ id, name, role, emoji, avatar, salary, morale, level })),
      presence: s.presence,
      stack: b.stack.map(({ name, layer }) => ({ name, layer })),
      deps: Object.entries(s.deps).map(([name, version]) => ({ name, version })),
      messages,
      tickets: [...open, ...closed].map((t) => publicTicket(t, s.clock)),
      typing: [...s.jobs, s.running].map(typingOf).filter((c): c is string => Boolean(c)),
      maxStaff: MAX_STAFF,
      openRisks: s.openRisks,
      aiPercentLeft: await aiBudgetPercentLeft(this.env),
      gameOver: s.gameOver,
    };
  }
}

interface LegacyDecision {
  id: string;
  prompt: string;
  options: Ticket["options"];
  newsId: string | null;
}

// Older companies predate the office map, dependency tracking, generated staff, baht and the
// live clock; fill in the gaps. A pending decision becomes a ticket.
function migrate(existing: StoredState & { decision?: LegacyDecision | null; scriptedReactions?: Record<string, DraftMessage[]> | null }): StoredState {
  const staffIn = existing.staff ?? LEGACY_STAFF;
  const legacyCash = !existing.businessId;
  const b = getBusiness(existing.businessId ?? "saas");
  const staff = staffIn.map((e) => ({
    ...e,
    salary: e.salary || baseSalary(e.roleKey, b),
    morale: e.morale ?? 70,
    level: e.level ?? (e.roleKey === "intern" || e.roleKey === "sales" ? 1 : 2),
  }));
  const now = Date.now();
  const clock = existing.clock ?? existing.day * DAY_MS;
  const tickets = existing.tickets ?? [];
  if (existing.decision && !existing.tickets) {
    const from = staff.find((e) => e.roleKey === "pm") ?? staff[0];
    tickets.push(
      newTicket({
        kind: "email",
        from: from?.id ?? "system",
        subject: existing.decision.prompt,
        options: existing.decision.options,
        createdAt: clock,
        newsId: existing.decision.newsId,
        reactions: existing.scriptedReactions ?? null,
      }),
    );
  }
  const { decision: _d, scriptedReactions: _r, ...rest } = existing;
  return {
    ...rest,
    epoch: existing.epoch ?? crypto.randomUUID(),
    businessId: b.id,
    companyName: existing.companyName ?? "ออฟฟิศ AI",
    // Before baht, cash was a 0-100 bar that started at 70; 70 maps to the starting cash.
    stats: legacyCash ? { ...existing.stats, cash: Math.round((existing.stats.cash / 70) * b.startCash) } : existing.stats,
    staff,
    presence: existing.presence ?? defaultPresence(staff),
    deps: existing.deps ?? companyDeps(b),
    pendingRegression: existing.pendingRegression ?? null,
    prCounter: existing.prCounter ?? 0,
    recentScripts: existing.recentScripts ?? [],
    openRisks: existing.openRisks.map((r) => ({ ...r, kind: r.kind ?? "kev", layer: r.layer ?? "edge", component: r.component ?? r.title })),
    clock,
    lastReal: existing.lastReal ?? now,
    lastSeen: existing.lastSeen ?? 0,
    nextEventAt: existing.nextEventAt ?? clock + FIRST_EVENT_MS,
    nextChatterAt: existing.nextChatterAt ?? clock + 15 * 1000,
    tickets,
    jobs: existing.jobs ?? [],
    running: existing.running ?? null,
    runningSince: existing.runningSince ?? 0,
  };
}

// Runs a live AI call, or returns null when the shared daily budget is spent.
async function liveOrNull(fn: () => Promise<Scene>): Promise<Scene | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AiBudgetError) return null;
    throw err;
  }
}
