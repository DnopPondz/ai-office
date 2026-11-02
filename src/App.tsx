import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { ChatMessage, GameState, PublicEmployee } from "../shared/types";
import { STAT_KEYS, STAT_LABELS } from "../shared/types";
import { api, ApiError } from "./api";
import { OfficeMap } from "./OfficeMap";
import { PixelAvatar } from "./pixel";

const OFFICE = "office";
const CHANNELS = ["general", "dev", "security-alerts", "random"];

const SPECIAL_AUTHORS: Record<string, PublicEmployee> = {
  secbot: { id: "secbot", name: "SecBot", role: "bot", emoji: "🤖" },
  system: { id: "system", name: "ระบบ", role: "", emoji: "📣" },
  ceo: { id: "ceo", name: "คุณ (CEO)", role: "CEO", emoji: "🧑‍💼" },
};

function channelLabel(channel: string, employees: PublicEmployee[]): string {
  if (channel === OFFICE) return "แผนผังออฟฟิศ";
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
  const [channel, setChannel] = useState(OFFICE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [locked, setLocked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function load() {
    setError(null);
    api.state().then(
      (g) => {
        // Existing history counts as read on first load.
        const latest: Record<string, number> = {};
        for (const m of g.messages) latest[m.channel] = Math.max(latest[m.channel] ?? 0, m.id);
        setSeen(latest);
        setLocked(false);
        setGame(g);
      },
      (e: Error) => (e instanceof ApiError && e.status === 401 ? setLocked(true) : setError(e.message)),
    );
  }

  useEffect(load, []);

  const authors = useMemo(() => {
    const map: Record<string, PublicEmployee> = { ...SPECIAL_AUTHORS };
    for (const e of game?.employees ?? []) map[e.id] = e;
    return map;
  }, [game?.employees]);

  const visible = useMemo(
    () => (game?.messages ?? []).filter((m) => m.channel === channel),
    [game?.messages, channel],
  );

  const unread = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of game?.messages ?? []) {
      if (m.channel !== channel && m.id > (seen[m.channel] ?? 0)) counts[m.channel] = (counts[m.channel] ?? 0) + 1;
    }
    return counts;
  }, [game?.messages, seen, channel]);

  // Mark the open channel as read and keep the newest message in view.
  useEffect(() => {
    const last = visible.at(-1)?.id ?? 0;
    setSeen((prev) => (prev[channel] === last ? prev : { ...prev, [channel]: last }));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [visible, channel]);

  async function run(action: () => Promise<GameState>, jumpToAlerts = false) {
    setBusy(true);
    setError(null);
    const before = game?.messages.at(-1)?.id ?? 0;
    try {
      const next = await action();
      setGame(next);
      // On the office map the news ticker already shows the alert, so stay put.
      if (jumpToAlerts && channel !== OFFICE && next.messages.some((m) => m.id > before && m.channel === "security-alerts")) {
        setChannel("security-alerts");
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setLocked(true);
      else setError((e as Error).message);
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

  const dmChannels = game.employees.map((e) => `dm-${e.id}`);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="workspace">
          <span>🏢 ออฟฟิศ AI</span>
          <small>วันที่ {game.day}</small>
        </div>
        <nav aria-label="ช่องแชท">
          <ChannelButton id={OFFICE} label={channelLabel(OFFICE, game.employees)} active={channel === OFFICE} onSelect={setChannel} />
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
      </aside>

      <main className="main">
        <header className="topbar">
          <h1>{channelLabel(channel, game.employees)}</h1>
          <div className="stats">
            {STAT_KEYS.map((k) => (
              <div key={k} className="stat" title={`${STAT_LABELS[k]} ${game.stats[k]}/100`}>
                <span>{STAT_LABELS[k]}</span>
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
            employees={game.employees}
            presence={game.presence}
            messages={game.messages}
            openRisks={game.openRisks}
            busy={busy}
            onSelectEmployee={(id) => setChannel(`dm-${id}`)}
            onOpenChannel={setChannel}
          />
        ) : (
          <div className="messages" ref={listRef}>
            {visible.length === 0 && <p className="empty">ยังไม่มีข้อความในช่องนี้</p>}
            {visible.map((m) => (
              <Message key={m.id} message={m} author={authors[m.author]} />
            ))}
            {busy && <p className="typing">พนักงานกำลังพิมพ์<span className="dots" /></p>}
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
              <button disabled={busy} onClick={() => run(api.reset)}>
                เริ่มบริษัทใหม่
              </button>
            </div>
          ) : game.decision ? (
            <div className="card decision">
              <h2>🎯 {game.decision.prompt}</h2>
              <div className="options">
                {game.decision.options.map((o) => (
                  <button key={o.id} disabled={busy} onClick={() => run(() => api.decide(o.id))}>
                    <span>{o.label}</span>
                    {o.patches && <small className="patch">🩹 แก้ช่องโหว่</small>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="advance">
              <button disabled={busy} onClick={() => run(api.advance, true)}>
                {busy ? "กำลังเกิดเหตุการณ์..." : "▶ เหตุการณ์ถัดไป"}
              </button>
              <small>
                {game.aiPercentLeft > 0
                  ? `โควตา AI วันนี้เหลือ ${game.aiPercentLeft}%`
                  : "โควตา AI วันนี้หมดแล้ว เล่นต่อได้ด้วยเหตุการณ์ที่เตรียมไว้ (รีเซ็ต 07:00 น.)"}
              </small>
            </div>
          )}
          <p className="disclaimer">
            บริษัทและพนักงานเป็นเรื่องสมมติ · ข่าวใน #security-alerts มาจาก CISA KEV ผ่าน NVD · บทสนทนาสร้างโดย AI
          </p>
        </footer>
      </main>
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

function ChannelButton(props: {
  id: string;
  label: string;
  avatar?: string;
  active: boolean;
  unread?: number;
  onSelect: (id: string) => void;
}) {
  return (
    <button className={`channel ${props.active ? "active" : ""} ${props.unread ? "has-unread" : ""}`} onClick={() => props.onSelect(props.id)}>
      <span className="channel-label">
        {props.avatar && <PixelAvatar id={props.avatar} size={18} />}
        {props.label}
      </span>
      {props.unread ? <span className="badge">{props.unread}</span> : null}
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

function Message({ message, author }: { message: ChatMessage; author?: PublicEmployee }) {
  const who = author ?? { id: message.author, name: message.author, role: "", emoji: "" };
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
        {message.link && (
          <a href={message.link} target="_blank" rel="noopener noreferrer">
            {linkLabel(message.link)}
          </a>
        )}
      </div>
    </article>
  );
}
