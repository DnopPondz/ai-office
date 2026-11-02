import { DurableObject } from "cloudflare:workers";
import type { ChatMessage, Decision, GameState, MessageKind, OpenRisk, Stats } from "../shared/types";
import {
  EMPLOYEES,
  INITIAL_STATS,
  MAX_ADVANCES_PER_DAY,
  STACK,
  applyEffects,
  checkGameOver,
  defaultPresence,
  eventPresence,
  formatEffects,
  generateAftermath,
  generateScene,
  matchStack,
  mergePresence,
  secBotPosts,
  welcomePosts,
  type DraftMessage,
  type PresenceMap,
  type SceneEvent,
} from "./game";
import { getRecentNews } from "./news";

const BREACH_CHANCE = 0.3;
const BREACH_EFFECTS: Partial<Stats> = { security: -20, reputation: -15, cash: -10, uptime: -15 };
const MESSAGE_LIMIT = 300;

interface StoredState {
  day: number;
  stats: Stats;
  presence: PresenceMap;
  decision: Decision | null;
  openRisks: OpenRisk[];
  seenNews: string[];
  quotaDay: string;
  quotaUsed: number;
  gameOver: string | null;
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

      // An unpatched, actively exploited vulnerability can turn into a breach on any later turn.
      const breach = s.openRisks.find(() => Math.random() < BREACH_CHANCE);
      if (breach) {
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
        const news = fresh.find((n) => matchStack(n).length) ?? fresh[0];
        if (news) {
          const matched = matchStack(news);
          s.seenNews = [news.id, ...s.seenNews].slice(0, 300);
          posts.push(...secBotPosts(news, matched));
          if (matched.length) s.openRisks.push({ newsId: news.id, title: news.name, since: day });
          event = { kind: "news", news, matched };
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
        newsId: event.kind === "news" && event.matched.length ? event.news.id : null,
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
      if (chosen.patches && decision.newsId) {
        s.openRisks = s.openRisks.filter((r) => r.newsId !== decision.newsId);
      }

      const posts: DraftMessage[] = [
        { channel: "general", author: "ceo", text: `📢 ตัดสินใจแล้ว: ${chosen.label}` },
        {
          channel: "general",
          author: "system",
          kind: "system",
          text: `ผลกระทบ: ${formatEffects(chosen.effects) || "ไม่มี"}${chosen.patches && decision.newsId ? `\n✅ ปิดความเสี่ยง ${decision.newsId} แล้ว` : ""}`,
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
    // Companies created before the office map have no presence yet.
    if (existing) return { ...existing, presence: existing.presence ?? defaultPresence() };
    const fresh: StoredState = {
      day: 0,
      stats: { ...INITIAL_STATS },
      presence: defaultPresence(),
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
      stack: STACK.map((x) => x.name),
      messages,
      decision: s.decision,
      openRisks: s.openRisks,
      advancesLeft: s.quotaDay === today ? Math.max(0, MAX_ADVANCES_PER_DAY - s.quotaUsed) : MAX_ADVANCES_PER_DAY,
      gameOver: s.gameOver,
    };
  }
}
