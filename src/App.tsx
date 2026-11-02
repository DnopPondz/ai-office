import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, GameState, PublicEmployee, PublicTicket } from "../shared/types";
import { STAT_KEYS, STAT_LABELS } from "../shared/types";
import { api, ApiError } from "./api";
import { OfficeMap } from "./OfficeMap";
import { PixelAvatar, registerCharacters } from "./pixel";

const OFFICE = "office";
const INBOX = "inbox";
const TEAM = "team";
const CHANNELS = ["general", "dev", "security-alerts", "random"];
const CHAT_CHANNELS = new Set(["general", "dev", "random"]);
const POLL_MS = 3000;
const KEEP_MESSAGES = 600;

const SPECIAL_AUTHORS: Record<string, PublicEmployee> = {
  secbot: { id: "secbot", name: "SecBot", role: "bot", emoji: "🤖" },
  system: { id: "system", name: "ระบบ", role: "", emoji: "📣" },
  ceo: { id: "ceo", name: "คุณ (CEO)", role: "CEO", emoji: "🧑‍💼" },
};

const LEVELS: Record<number, string> = { 1: "Junior", 2: "Senior", 3: "Lead" };

function channelLabel(channel: string, employees: PublicEmployee[]): string {
  if (channel === OFFICE) return "แผนผังออฟฟิศ";
  if (channel === INBOX) return "📥 Inbox";
  if (channel === TEAM) return "👥 ทีมงาน";
  if (channel.startsWith("dm-")) {
    const e = employees.find((x) => `dm-${x.id}` === channel);
    return e ? e.name : channel;
  }
  return `# ${channel}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [channel, setChannel] = useState(OFFICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const sinceRef = useRef(0);
  const epochRef = useRef<string | null>(null);
  const polling = useRef(false);

  // Merges a state update: the server only sends messages newer than what we already have.
  function apply(next: GameState) {
    const fresh = epochRef.current !== next.epoch;
    if (fresh) {
      const first = epochRef.current === null;
      epochRef.current = next.epoch;
      setMessages(next.messages);
      sinceRef.current = 0;
      // Existing history counts as read on first load.
      if (first) {
        const latest: Record<string, number> = {};
        for (const m of next.messages) latest[m.channel] = Math.max(latest[m.channel] ?? 0, m.id);
        setSeen(latest);
      }
    } else if (next.messages.length) {
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...prev, ...next.messages.filter((m) => !known.has(m.id))].slice(-KEEP_MESSAGES);
      });
    }
    for (const m of next.messages) sinceRef.current = Math.max(sinceRef.current, m.id);
    setGame(next);
    setReceivedAt(Date.now());
  }

  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) setLocked(true);
    else setError((e as Error).message);
  }

  function load() {
    setError(null);
    api.state(0).then((g) => {
      setLocked(false);
      apply(g);
    }, fail);
  }

  useEffect(load, []);

  // The office runs on the server; while this page is visible we poll for what happened.
  const ready = Boolean(game) && !locked;
  useEffect(() => {
    if (!ready) return;
    const poll = async () => {
      if (document.hidden || polling.current) return;
      polling.current = true;
      try {
        apply(await api.state(sinceRef.current));
      } catch (e) {
        fail(e);
      } finally {
        polling.current = false;
      }
    };
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  const authors = useMemo(() => {
    const map: Record<string, PublicEmployee> = { ...SPECIAL_AUTHORS };
    for (const e of game?.employees ?? []) map[e.id] = e;
    return map;
  }, [game?.employees]);

  const tickets = useMemo(() => new Map((game?.tickets ?? []).map((t) => [t.id, t])), [game?.tickets]);
  const visible = useMemo(() => messages.filter((m) => m.channel === channel), [messages, channel]);

  const unread = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages) {
      if (m.channel !== channel && m.id > (seen[m.channel] ?? 0)) counts[m.channel] = (counts[m.channel] ?? 0) + 1;
    }
    return counts;
  }, [messages, seen, channel]);

  // Mark the open channel as read and keep the newest message in view.
  useEffect(() => {
    const last = visible.at(-1)?.id ?? 0;
    setSeen((prev) => (prev[channel] === last ? prev : { ...prev, [channel]: last }));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [visible, channel]);

  async function run(action: (since: number) => Promise<GameState>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      apply(await action(sinceRef.current));
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return <PinScreen onUnlocked={load} />;
  }

  if (!game) {
    return <div className="loading">{error ?? "กำลังเปิดออฟฟิศ..."}</div>;
  }

  registerCharacters(game.employees);
  const dmChannels = game.employees.map((e) => `dm-${e.id}`);
  const openTickets = game.tickets.filter((t) => t.status === "open" || t.status === "thinking");
  const canChat = !game.gameOver && (CHAT_CHANNELS.has(channel) || dmChannels.includes(channel));
  const answer = (ticketId: string, choice: { optionId?: string; text?: string }) => run((since) => api.answer(ticketId, choice, since));

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="workspace">
          <span>🏢 {game.company.name}</span>
          <small>วันที่ {game.day}</small>
        </div>
        <div className="business">{game.company.business}</div>
        <nav aria-label="ช่องแชท">
          <ChannelButton id={OFFICE} label={channelLabel(OFFICE, game.employees)} active={channel === OFFICE} onSelect={setChannel} />
          <ChannelButton
            id={INBOX}
            label={channelLabel(INBOX, game.employees)}
            active={channel === INBOX}
            unread={openTickets.length}
            urgent={openTickets.some((t) => t.urgent)}
            onSelect={setChannel}
          />
          <ChannelButton id={TEAM} label={`${channelLabel(TEAM, game.employees)} (${game.employees.length})`} active={channel === TEAM} onSelect={setChannel} />
          <div className="section-title">ช่องแชท</div>
          {CHANNELS.map((c) => (
            <ChannelButton key={c} id={c} label={channelLabel(c, game.employees)} active={c === channel} unread={unread[c]} onSelect={setChannel} />
          ))}
          <div className="section-title">ข้อความส่วนตัว</div>
          {dmChannels.map((c) => (
            <ChannelButton key={c} id={c} label={channelLabel(c, game.employees)} avatar={c.slice(3)} active={c === channel} unread={unread[c]} onSelect={setChannel} />
          ))}
        </nav>
        <details className="stack">
          <summary>ระบบของบริษัท ({game.stack.length})</summary>
          <ul>
            {game.stack.map((s) => (
              <li key={s.name}>{s.name}</li>
            ))}
          </ul>
        </details>
        <details className="stack">
          <summary>package.json ({game.deps.length})</summary>
          <ul className="deps">
            {game.deps.map((d) => (
              <li key={d.name}>
                <code>
                  {d.name}@{d.version}
                </code>
              </li>
            ))}
          </ul>
        </details>
        <button
          className="restart"
          disabled={busy}
          onClick={() => {
            if (window.confirm("เริ่มบริษัทใหม่? ค่าสถานะและแชททั้งหมดของบริษัทนี้จะหายไป")) void run(() => api.reset());
          }}
        >
          ↺ เริ่มบริษัทใหม่
        </button>
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{channelLabel(channel, game.employees)}</h1>
          <div className="stats">
            <CashStat game={game} />
            {STAT_KEYS.filter((k) => k !== "cash").map((k) => (
              <div key={k} className={`stat ${k === "kpi" ? "kpi" : ""}`} title={`${k === "kpi" ? game.company.kpiLabel : STAT_LABELS[k]} ${game.stats[k]}/100`}>
                <span>{k === "kpi" ? game.company.kpiLabel : STAT_LABELS[k]}</span>
                <div className="bar">
                  <div className={`fill ${game.stats[k] < 25 ? "low" : ""}`} style={{ width: `${game.stats[k]}%` }} />
                </div>
                <b>{game.stats[k]}</b>
              </div>
            ))}
          </div>
          {game.openRisks.length > 0 && (
            <div className="risks">
              {game.openRisks.map((r) => (
                <span key={r.newsId} className="risk" title={r.title}>
                  ⚠️ {r.newsId} ยังไม่แก้
                </span>
              ))}
            </div>
          )}
        </header>

        {channel === OFFICE ? (
          <OfficeMap
            theme={game.company.theme}
            employees={game.employees}
            presence={game.presence}
            messages={messages}
            openRisks={game.openRisks}
            busy={game.typing.length > 0}
            onSelectEmployee={(id) => setChannel(`dm-${id}`)}
            onOpenChannel={setChannel}
          />
        ) : channel === INBOX ? (
          <InboxView game={game} authors={authors} receivedAt={receivedAt} busy={busy} onAnswer={answer} />
        ) : channel === TEAM ? (
          <TeamView game={game} busy={busy} onAction={(action, target) => run((since) => api.team(action, target, since))} />
        ) : (
          <div className="messages" ref={listRef}>
            {visible.length === 0 && <p className="empty">ยังไม่มีข้อความในช่องนี้</p>}
            {visible.map((m) => (
              <Message
                key={m.id}
                message={m}
                author={authors[m.author]}
                ticket={m.link?.startsWith("ticket:") ? tickets.get(m.link.slice(7)) : undefined}
                ticketFrom={m.link?.startsWith("ticket:") ? authors[tickets.get(m.link.slice(7))?.from ?? ""] : undefined}
                receivedAt={receivedAt}
                busy={busy}
                onAnswer={answer}
              />
            ))}
            {game.typing.includes(channel) && (
              <p className="typing">
                {channel.startsWith("dm-") ? authors[channel.slice(3)]?.name ?? "พนักงาน" : "พนักงาน"}กำลังพิมพ์<span className="dots" />
              </p>
            )}
          </div>
        )}

        <footer className="composer">
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {game.gameOver ? (
            <div className="card gameover">
              <h2>จบเกม: {game.gameOver}</h2>
              <p>คุณอยู่รอดมาได้ {game.day} วัน</p>
              <button disabled={busy} onClick={() => void run(() => api.reset())}>
                เริ่มบริษัทใหม่
              </button>
            </div>
          ) : (
            canChat && <Composer key={channel} busy={busy} placeholder={`ส่งข้อความถึง ${channelLabel(channel, game.employees)}`} onSend={(text) => run((since) => api.chat(channel, text, since))} />
          )}
          <p className="status-line">
            {openTickets.length > 0 && (
              <button className="link" onClick={() => setChannel(INBOX)}>
                📥 รอตัดสินใจ {openTickets.length} เรื่อง
              </button>
            )}
            <span>จ่ายเงินเดือนอีก {game.money.daysToPayday} วัน</span>
            <span>{game.aiPercentLeft > 0 ? `โควตา AI วันนี้เหลือ ${game.aiPercentLeft}%` : "โควตา AI วันนี้หมดแล้ว ใช้บทที่เขียนไว้แทน (รีเซ็ต 07:00 น.)"}</span>
          </p>
          <p className="disclaimer">
            บริษัทและพนักงานเป็นเรื่องสมมติ · ข่าวใน #security-alerts มาจาก CISA KEV ผ่าน NVD · บทสนทนาสร้างโดย AI
          </p>
        </footer>
      </main>
    </div>
  );
}

function Composer(props: { busy: boolean; placeholder: string; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (await props.onSend(value)) setText("");
  }
  return (
    <form className="chat-form" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={props.placeholder} maxLength={500} aria-label={props.placeholder} />
      <button type="submit" disabled={props.busy || !text.trim()}>
        ส่ง
      </button>
    </form>
  );
}

// Time left on a ticket, counted down locally between polls.
function Countdown({ ms, receivedAt }: { ms: number; receivedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, ms - (now - receivedAt));
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return (
    <span className={`countdown ${left < 60000 ? "low" : ""}`}>
      ⏳ {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

function TicketCard(props: {
  ticket: PublicTicket;
  from?: PublicEmployee;
  receivedAt: number;
  busy: boolean;
  compact?: boolean;
  onAnswer: (ticketId: string, choice: { optionId?: string; text?: string }) => Promise<boolean>;
}) {
  const { ticket: t, from } = props;
  const [text, setText] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim() && (await props.onAnswer(t.id, { text: text.trim() }))) setText("");
  }
  return (
    <div className={`ticket ${t.urgent ? "urgent" : ""} ${t.status}`}>
      <div className="ticket-head">
        {from && <PixelAvatar id={from.id} size={22} />}
        <span>
          {t.kind === "email" ? "📧 อีเมล" : "📩 ข้อความส่วนตัว"} · <b>{from?.name ?? "ระบบ"}</b>
          {from?.role ? ` (${from.role})` : ""}
        </span>
        {t.status === "open" && <Countdown ms={t.deadlineIn} receivedAt={props.receivedAt} />}
      </div>
      <h3>
        {t.urgent && t.status === "open" ? "🔴 " : ""}
        {t.subject}
      </h3>
      {!props.compact && t.body && <p className="text">{t.body}</p>}
      {t.status === "open" ? (
        <>
          <div className="options">
            {t.options.map((o) => (
              <button key={o.id} disabled={props.busy} onClick={() => void props.onAnswer(t.id, { optionId: o.id })}>
                <span>{o.label}</span>
                {o.patches && <small className="patch">🩹 แก้ช่องโหว่</small>}
              </button>
            ))}
          </div>
          <form className="chat-form ticket-reply" onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="หรือพิมพ์คำตอบเอง..." maxLength={500} aria-label="พิมพ์คำตอบเอง" />
            <button type="submit" disabled={props.busy || !text.trim()}>
              ตอบ
            </button>
          </form>
        </>
      ) : t.status === "thinking" ? (
        <p className="typing">
          กำลังพิจารณาคำตอบ<span className="dots" />
        </p>
      ) : (
        <p className={`outcome ${t.status}`}>
          {t.status === "expired" ? "⏰ " : "✅ "}
          {t.outcome}
        </p>
      )}
    </div>
  );
}

function InboxView(props: {
  game: GameState;
  authors: Record<string, PublicEmployee>;
  receivedAt: number;
  busy: boolean;
  onAnswer: (ticketId: string, choice: { optionId?: string; text?: string }) => Promise<boolean>;
}) {
  const open = props.game.tickets.filter((t) => t.status === "open" || t.status === "thinking");
  const closed = props.game.tickets.filter((t) => t.status === "done" || t.status === "expired");
  return (
    <div className="inbox">
      {open.length === 0 && <p className="empty">ไม่มีเรื่องรอตัดสินใจ ทีมกำลังทำงานตามปกติ</p>}
      {open.map((t) => (
        <TicketCard key={t.id} ticket={t} from={props.authors[t.from]} receivedAt={props.receivedAt} busy={props.busy} onAnswer={props.onAnswer} />
      ))}
      {closed.length > 0 && (
        <details className="closed-tickets">
          <summary>เรื่องที่ปิดแล้ว ({closed.length})</summary>
          {closed.map((t) => (
            <TicketCard key={t.id} ticket={t} from={props.authors[t.from]} receivedAt={props.receivedAt} busy compact onAnswer={props.onAnswer} />
          ))}
        </details>
      )}
    </div>
  );
}

function TeamView(props: {
  game: GameState;
  busy: boolean;
  onAction: (action: "raise" | "promote" | "fire" | "hire", target: { employeeId?: string; role?: string }) => Promise<boolean>;
}) {
  const { game } = props;
  const [role, setRole] = useState(game.company.hireRoles[0]?.id ?? "");
  const kpiRoles = new Set(game.company.kpiRoles);
  const payroll = game.employees.reduce((sum, e) => sum + (e.salary ?? 0), 0);
  const full = game.employees.length >= game.maxStaff;
  return (
    <div className="team">
      <p className="team-summary">
        ทีม {game.employees.length}/{game.maxStaff} คน · เงินเดือนรวม {formatBaht(payroll)} บาท/เดือน
      </p>
      <ul className="team-list">
        {game.employees.map((e) => (
          <li key={e.id} className="card team-member">
            <PixelAvatar id={e.id} size={40} />
            <div className="team-info">
              <b>{e.name}</b> <span className="roster-role">{e.role} · {LEVELS[e.level ?? 2]}</span>
              {e.roleKey && kpiRoles.has(e.roleKey) && <span className="kpi-tag">ดัน{game.company.kpiLabel}</span>}
              <small>เงินเดือน {formatBaht(e.salary ?? 0)} บาท</small>
              <div className="stat morale" title={`ขวัญกำลังใจ ${e.morale ?? 0}/100`}>
                <span>ขวัญกำลังใจ</span>
                <div className="bar">
                  <div className={`fill ${(e.morale ?? 0) < 30 ? "low" : ""}`} style={{ width: `${e.morale ?? 0}%` }} />
                </div>
                <b>{e.morale ?? 0}</b>
              </div>
            </div>
            <div className="team-actions">
              <button disabled={props.busy} onClick={() => void props.onAction("raise", { employeeId: e.id })}>
                ขึ้นเงินเดือน 10%
              </button>
              <button disabled={props.busy || (e.level ?? 2) >= 3} onClick={() => void props.onAction("promote", { employeeId: e.id })}>
                เลื่อนตำแหน่ง
              </button>
              <button
                className="danger"
                disabled={props.busy}
                onClick={() => {
                  if (window.confirm(`เลิกจ้าง ${e.name}? ต้องจ่ายค่าชดเชย 1 เดือน และทีมจะเสียขวัญกำลังใจ`)) void props.onAction("fire", { employeeId: e.id });
                }}
              >
                เลิกจ้าง
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="card hire">
        <h2>เปิดรับสมัครงาน</h2>
        <p className="roster-role">ผู้สมัครจะส่งมาเป็นอีเมลใน Inbox ให้เลือกจ้าง</p>
        <div className="hire-row">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="ตำแหน่งที่จะรับสมัคร">
            {game.company.hireRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
                {kpiRoles.has(r.id) ? ` (ดัน${game.company.kpiLabel})` : ""}
              </option>
            ))}
          </select>
          <button disabled={props.busy || full} onClick={() => void props.onAction("hire", { role })}>
            {full ? "ทีมเต็มแล้ว" : "เปิดรับสมัคร"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PinScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(pin);
      onUnlocked();
    } catch (err) {
      setError((err as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pin-screen">
      <form className="card pin-card" onSubmit={submit}>
        <h1>🏢 ออฟฟิศ AI</h1>
        <label htmlFor="pin">ใส่ PIN 6 หลักเพื่อเข้าออฟฟิศ</label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="\d{6}"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
        />
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" disabled={busy || pin.length !== 6}>
          {busy ? "กำลังตรวจสอบ..." : "เข้าออฟฟิศ"}
        </button>
      </form>
    </div>
  );
}

function formatBaht(n: number, compact = false): string {
  if (compact && Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} ล้าน`;
  if (compact && Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  return Math.round(n).toLocaleString("en-US");
}

// Cash is in baht; the bar shows runway (12 months or more, or profitable, is full).
function CashStat({ game }: { game: GameState }) {
  const cash = game.stats.cash;
  const net = game.money.monthlyRevenue - game.money.monthlyCost;
  const months = net < 0 ? Math.max(0, cash) / -net : Infinity;
  const runway = months === Infinity ? "กำไรต่อเดือน" : `เงินพออีกราว ${months.toFixed(1)} เดือน`;
  return (
    <div
      className="stat"
      title={`เงินสด ${formatBaht(cash)} บาท · รายได้/เดือน ${formatBaht(game.money.monthlyRevenue)} · ค่าใช้จ่าย/เดือน ${formatBaht(game.money.monthlyCost)} · ${runway}`}
    >
      <span>เงินสด (บาท)</span>
      <div className="bar">
        <div className={`fill ${months < 3 ? "low" : ""}`} style={{ width: `${Math.min(100, (months / 12) * 100)}%` }} />
      </div>
      <b>{formatBaht(cash, true)}</b>
    </div>
  );
}

function ChannelButton(props: {
  id: string;
  label: string;
  avatar?: string;
  active: boolean;
  unread?: number;
  urgent?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button className={`channel ${props.active ? "active" : ""} ${props.unread ? "has-unread" : ""}`} onClick={() => props.onSelect(props.id)}>
      <span className="channel-label">
        {props.avatar && <PixelAvatar id={props.avatar} size={18} />}
        {props.label}
      </span>
      {props.unread ? <span className={`badge ${props.urgent ? "urgent" : ""}`}>{props.unread}</span> : null}
    </button>
  );
}

function linkLabel(link: string): string {
  const host = new URL(link).hostname;
  if (host.endsWith("osv.dev")) return "ดูรายละเอียดบน OSV.dev ↗";
  if (host.endsWith("nist.gov")) return "ดูรายละเอียดบน NVD ↗";
  return `ดูรายละเอียดบน ${host} ↗`;
}

// A pull request message: first line is the title, the rest is a unified diff.
function Diff({ text }: { text: string }) {
  const [title, ...lines] = text.split("\n");
  return (
    <div className="diff">
      <p className="diff-title">{title}</p>
      <pre>
        {lines.map((line, i) => (
          <span key={i} className={line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : ""}>
            {line}
            {"\n"}
          </span>
        ))}
      </pre>
    </div>
  );
}

function Message(props: {
  message: ChatMessage;
  author?: PublicEmployee;
  ticket?: PublicTicket;
  ticketFrom?: PublicEmployee;
  receivedAt: number;
  busy: boolean;
  onAnswer: (ticketId: string, choice: { optionId?: string; text?: string }) => Promise<boolean>;
}) {
  const { message, author } = props;
  const who = author ?? { id: message.author, name: message.author, role: "", emoji: "" };
  const external = message.link && !message.link.startsWith("ticket:") ? message.link : null;
  return (
    <article className={`message ${message.kind}`}>
      <div className="avatar" aria-hidden="true">
        <PixelAvatar id={message.author} size={36} />
      </div>
      <div className="body">
        <div className="meta">
          <b>{who.name}</b>
          {who.role && <span className="role">{who.role}</span>}
          <time>{formatTime(message.ts)}</time>
        </div>
        {message.kind === "diff" ? <Diff text={message.text} /> : <p className="text">{message.text}</p>}
        {props.ticket && (
          <TicketCard ticket={props.ticket} from={props.ticketFrom} receivedAt={props.receivedAt} busy={props.busy} compact={props.ticket.kind === "email"} onAnswer={props.onAnswer} />
        )}
        {external && (
          <a href={external} target="_blank" rel="noopener noreferrer">
            {linkLabel(external)}
          </a>
        )}
      </div>
    </article>
  );
}
