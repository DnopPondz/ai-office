import { DurableObject } from "cloudflare:workers";
import type { ChatMessage, Decision, GameState, MessageKind, OpenRisk, Stats } from "../shared/types";
import {
  DEPENDENCIES,
  EMPLOYEES,
  INITIAL_STATS,
  MAX_ADVANCES_PER_DAY,
  REGRESSION_CHANCE,
  REGRESSION_EFFECTS,
  STACK,
  applyEffects,
  checkGameOver,
  defaultPresence,
  eventPresence,
  formatEffects,
  generateAftermath,
  generateScene,
  matchStack,
  matchStackItems,
  mergePresence,
  regressionPosts,
  secBotDepPosts,
  secBotPosts,
  welcomePosts,
  type DraftMessage,
  type PresenceMap,
  type SceneEvent,
} from "./game";
import { getRecentNews } from "./news";
import { compareVersions, getAffectingVulns } from "./osv";

const BREACH_CHANCE = 0.3;
const BREACH_EFFECTS: Partial<Stats> = { security: -20, reputation: -15, cash: -10, uptime: -15 };
// When both are available, how often a turn features a dependency vuln instead of KEV news.
const DEPENDENCY_EVENT_CHANCE = 0.5;
const MESSAGE_LIMIT = 300;

interface StoredState {
  day: number;
  stats: Stats;
  presence: PresenceMap;
  // Current version of each npm dependency; patched upgrades move these forward.
  deps: Record<string, string>;
  pendingRegression: { pkg: string; version: string } | null;
  prCounter: number;
  decision: Decision | null;
  openRisks: OpenRisk[];
  seenNews: string[];
  quotaDay: string;
  quotaUsed: number;
  gameOver: string | null;
}

function defaultDeps(): Record<string, string> {
  return Object.fromEntries(DEPENDENCIES.map((d) => [d.name, d.version]));
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

// One Durable Object per player company: holds stats, the pending decision and the chat log.
export class Company extends DurableObject<Env> {
  private busy = false;
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

  async getState(): Promise<GameState> {
    return this.view(await this.load());
  }

  async advance(): Promise<GameState> {
    return this.exclusive(async () => {
      const s = await this.load();
      if (s.gameOver) throw new Error("เกมจบแล้ว กดเริ่มใหม่ได้เลย");
      if (s.decision) throw new Error("ตัดสินใจเรื่องที่ค้างอยู่ก่อนนะ");
      const today = new Date().toISOString().slice(0, 10);
      if (s.quotaDay !== today) {
        s.quotaDay = today;
        s.quotaUsed = 0;
      }
      if (s.quotaUsed >= MAX_ADVANCES_PER_DAY) {
        throw new Error(`วันนี้เล่นครบ ${MAX_ADVANCES_PER_DAY} เหตุการณ์แล้ว (โควตา AI ฟรี) กลับมาใหม่พรุ่งนี้นะ`);
      }

      const day = s.day + 1;
      const posts: DraftMessage[] = [];
      let event: SceneEvent = { kind: "quiet" };
      let riskId: string | null = null;

      // An unpatched, actively exploited vulnerability can turn into a breach on any later turn.
      const breach = s.pendingRegression ? null : s.openRisks.find(() => Math.random() < BREACH_CHANCE);
      if (s.pendingRegression) {
        // A rushed upgrade from the previous decision broke something.
        const { pkg, version } = s.pendingRegression;
        s.pendingRegression = null;
        applyEffects(s.stats, REGRESSION_EFFECTS);
        posts.push(...regressionPosts(pkg, version));
        event = { kind: "regression", pkg, version };
      } else if (breach) {
        applyEffects(s.stats, BREACH_EFFECTS);
        s.openRisks = s.openRisks.filter((r) => r.newsId !== breach.newsId);
        posts.push({
          channel: "security-alerts",
          author: "system",
          kind: "system",
          text: `🔥 [เหตุการณ์จำลอง] ระบบที่ยังไม่ได้แก้ ${breach.newsId} (${breach.title}) ถูกเจาะแล้ว!\n${formatEffects(BREACH_EFFECTS)}`,
        });
        event = { kind: "breach", risk: breach };
      } else {
        const fresh = (await getRecentNews(this.env, 40)).filter((n) => !s.seenNews.includes(n.id));
        const matchedNews = fresh.find((n) => matchStack(n).length);
        const depVuln = (await getAffectingVulns(this.env, s.deps)).find(
          (v) => !s.seenNews.includes(`${v.package}:${v.id}`),
        );

        if (depVuln && (!matchedNews || Math.random() < DEPENDENCY_EVENT_CHANCE)) {
          const current = s.deps[depVuln.package];
          s.seenNews = [`${depVuln.package}:${depVuln.id}`, ...s.seenNews].slice(0, 300);
          s.prCounter += 1;
          posts.push(...secBotDepPosts(depVuln, current, s.prCounter));
          s.openRisks.push({
            newsId: depVuln.id,
            title: `${depVuln.package}@${current}: ${depVuln.summary.slice(0, 80)}`,
            since: day,
            kind: "dependency",
            layer: "app",
            component: `npm: ${depVuln.package}`,
            package: depVuln.package,
            fixedVersion: depVuln.fixed,
          });
          riskId = depVuln.id;
          event = { kind: "dependency", vuln: depVuln, currentVersion: current };
        } else {
          const news = matchedNews ?? fresh[0];
          if (news) {
            const items = matchStackItems(news);
            const matched = items.map((i) => i.name);
            s.seenNews = [news.id, ...s.seenNews].slice(0, 300);
            posts.push(...secBotPosts(news, matched));
            if (items.length) {
              s.openRisks.push({
                newsId: news.id,
                title: news.name,
                since: day,
                kind: "kev",
                layer: items[0].layer,
                component: items[0].name,
              });
              riskId = news.id;
            }
            event = { kind: "news", news, matched };
          }
        }
      }

      // Nothing is persisted until the model answers, so a failed AI call costs the player nothing.
      const scene = await generateScene(this.env, {
        day,
        stats: s.stats,
        event,
        recent: this.recentChat(14),
        openRisks: s.openRisks,
      });
      posts.push(...scene.messages);

      s.presence = mergePresence(eventPresence(event, s.presence), scene.presence);
      s.day = day;
      s.quotaUsed += 1;
      s.decision = {
        id: crypto.randomUUID(),
        prompt: scene.decision.prompt,
        options: scene.decision.options,
        newsId: riskId,
      };
      s.gameOver = checkGameOver(s.stats);
      this.insert(posts);
      await this.save(s);
      return this.view(s);
    });
  }

  async decide(optionId: string): Promise<GameState> {
    return this.exclusive(async () => {
      const s = await this.load();
      const decision = s.decision;
      if (!decision) throw new Error("ตอนนี้ไม่มีเรื่องให้ตัดสินใจ");
      const chosen = decision.options.find((o) => o.id === optionId);
      if (!chosen) throw new Error("ไม่พบตัวเลือกนี้");

      applyEffects(s.stats, chosen.effects);
      let patchNote = "";
      if (chosen.patches && decision.newsId) {
        const risk = s.openRisks.find((r) => r.newsId === decision.newsId);
        if (risk?.kind === "dependency" && risk.package && risk.fixedVersion) {
          const pkg = risk.package;
          const before = s.deps[pkg];
          if (!before || compareVersions(risk.fixedVersion, before) > 0) s.deps[pkg] = risk.fixedVersion;
          const after = s.deps[pkg];
          // One upgrade can close several advisories for the same package.
          s.openRisks = s.openRisks.filter(
            (r) => !(r.package === pkg && r.fixedVersion && compareVersions(r.fixedVersion, after) <= 0),
          );
          patchNote = `\n✅ merge PR แล้ว: ${pkg} ${before} → ${after}`;
          if (Math.random() < REGRESSION_CHANCE) s.pendingRegression = { pkg, version: after };
        } else {
          s.openRisks = s.openRisks.filter((r) => r.newsId !== decision.newsId);
          patchNote = `\n✅ ปิดความเสี่ยง ${decision.newsId} แล้ว`;
        }
      }

      const posts: DraftMessage[] = [
        { channel: "general", author: "ceo", text: `📢 ตัดสินใจแล้ว: ${chosen.label}` },
        {
          channel: "general",
          author: "system",
          kind: "system",
          text: `ผลกระทบ: ${formatEffects(chosen.effects) || "ไม่มี"}${patchNote}`,
        },
      ];
      try {
        const aftermath = await generateAftermath(this.env, {
          prompt: decision.prompt,
          chosen,
          others: decision.options.filter((o) => o.id !== chosen.id),
          recent: this.recentChat(10),
        });
        posts.push(...aftermath.messages);
        s.presence = mergePresence(s.presence, aftermath.presence);
      } catch (err) {
        // Reactions are flavour; the decision itself still counts.
        console.error("aftermath failed", err);
      }

      s.decision = null;
      s.gameOver = checkGameOver(s.stats);
      this.insert(posts);
      await this.save(s);
      return this.view(s);
    });
  }

  async reset(): Promise<GameState> {
    return this.exclusive(async () => {
      this.sql.exec("DELETE FROM messages");
      await this.ctx.storage.delete("state");
      return this.view(await this.load());
    });
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) throw new Error("พนักงานกำลังพิมพ์อยู่ รอสักครู่นะ");
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  private async load(): Promise<StoredState> {
    const existing = await this.ctx.storage.get<StoredState>("state");
    // Older companies predate the office map and dependency tracking; fill in the gaps.
    if (existing) {
      return {
        ...existing,
        presence: existing.presence ?? defaultPresence(),
        deps: existing.deps ?? defaultDeps(),
        pendingRegression: existing.pendingRegression ?? null,
        prCounter: existing.prCounter ?? 0,
        openRisks: existing.openRisks.map((r) => ({ ...r, kind: r.kind ?? "kev", layer: r.layer ?? "edge", component: r.component ?? r.title })),
      };
    }
    const fresh: StoredState = {
      day: 0,
      stats: { ...INITIAL_STATS },
      presence: defaultPresence(),
      deps: defaultDeps(),
      pendingRegression: null,
      prCounter: 0,
      decision: null,
      openRisks: [],
      seenNews: [],
      quotaDay: "",
      quotaUsed: 0,
      gameOver: null,
    };
    this.insert(welcomePosts());
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
      .map((m) => `#${m.channel} ${m.author}: ${m.text.slice(0, 160)}`);
  }

  private view(s: StoredState): GameState {
    const messages: ChatMessage[] = this.sql
      .exec<MessageRow>("SELECT * FROM messages ORDER BY id DESC LIMIT ?", MESSAGE_LIMIT)
      .toArray()
      .reverse()
      .map((m) => ({ ...m, kind: m.kind as MessageKind }));
    const today = new Date().toISOString().slice(0, 10);
    return {
      day: s.day,
      stats: s.stats,
      employees: EMPLOYEES.map(({ id, name, role, emoji }) => ({ id, name, role, emoji })),
      presence: s.presence,
      stack: STACK.map(({ name, layer }) => ({ name, layer })),
      deps: DEPENDENCIES.map((d) => ({ name: d.name, version: s.deps[d.name] ?? d.version })),
      messages,
      decision: s.decision,
      openRisks: s.openRisks,
      advancesLeft: s.quotaDay === today ? Math.max(0, MAX_ADVANCES_PER_DAY - s.quotaUsed) : MAX_ADVANCES_PER_DAY,
      gameOver: s.gameOver,
    };
  }
}
