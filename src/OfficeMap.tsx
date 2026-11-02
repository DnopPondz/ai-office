import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, OfficeSpot, OpenRisk, Presence, PublicEmployee } from "../shared/types";
import { SPOT_LABELS } from "../shared/types";

type MapSpot = Exclude<OfficeSpot, "away">;
type Point = [number, number];

const SHIRTS: Record<string, string> = {
  kan: "#4f8cff",
  mai: "#e0457b",
  oat: "#f2a23a",
  fah: "#2bac76",
  ton: "#e8c547",
  prae: "#9b6dff",
};

// Floor plan in SVG units (viewBox 960 x 560).
const ROOMS: { spot: MapSpot; x: number; y: number; w: number; h: number }[] = [
  { spot: "ceo", x: 20, y: 20, w: 220, h: 170 },
  { spot: "meeting", x: 260, y: 20, w: 300, h: 170 },
  { spot: "server", x: 580, y: 20, w: 360, h: 170 },
  { spot: "desk", x: 20, y: 210, w: 620, h: 330 },
  { spot: "pantry", x: 660, y: 210, w: 280, h: 155 },
  { spot: "lounge", x: 660, y: 385, w: 280, h: 155 },
];

// Desk centres; each employee owns the desk at their index and sits just below it.
const DESKS: Point[] = [
  [120, 290],
  [320, 290],
  [520, 290],
  [120, 430],
  [320, 430],
  [520, 430],
];

// Standing points in shared rooms, filled in arrival order.
const SLOTS: Record<Exclude<MapSpot, "desk">, Point[]> = {
  ceo: [[80, 135], [130, 145], [180, 135], [60, 160], [110, 165], [160, 160]],
  meeting: [[300, 120], [520, 120], [350, 165], [410, 168], [470, 165], [410, 72]],
  server: [[620, 145], [690, 150], [760, 145], [830, 150], [900, 145], [725, 172]],
  pantry: [[700, 305], [770, 315], [840, 305], [905, 315], [735, 340], [805, 340]],
  lounge: [[715, 440], [765, 440], [815, 440], [880, 470], [720, 495], [800, 495]],
};

// How far people drift while idling: little at desks, more when chatting over coffee.
const WANDER: Record<MapSpot, number> = { desk: 3, meeting: 4, server: 10, ceo: 8, pantry: 18, lounge: 14 };

const TICK_MS = 2600;
const WALK_MS = 1800;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text.replace(/\s+/g, " "));
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

interface OfficeMapProps {
  employees: PublicEmployee[];
  presence: Record<string, Presence>;
  messages: ChatMessage[];
  openRisks: OpenRisk[];
  busy: boolean;
  onSelectEmployee: (id: string) => void;
  onOpenChannel: (channel: string) => void;
}

export function OfficeMap(props: OfficeMapProps) {
  const { employees, presence, messages, openRisks, busy } = props;
  const reduceMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  const [tick, setTick] = useState(0);
  const [walking, setWalking] = useState<Set<string>>(new Set());
  const previous = useRef<Record<string, Point>>({});

  useEffect(() => {
    if (reduceMotion) return;
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [reduceMotion]);

  const targets = useMemo(() => {
    const out: Record<string, Point> = {};
    const used: Partial<Record<MapSpot, number>> = {};
    employees.forEach((e, i) => {
      const spot = presence[e.id]?.spot ?? "desk";
      if (spot === "away") return;
      let base: Point;
      if (spot === "desk") {
        const [cx, cy] = DESKS[i % DESKS.length];
        base = [cx, cy + 48];
      } else {
        const n = used[spot] ?? 0;
        used[spot] = n + 1;
        base = SLOTS[spot][n % SLOTS[spot].length];
      }
      const amp = reduceMotion ? 0 : WANDER[spot];
      const h = hash(`${e.id}:${tick}`);
      out[e.id] = [base[0] + ((h % 1000) / 500 - 1) * amp, base[1] + (((h >>> 10) % 1000) / 500 - 1) * amp * 0.6];
    });
    return out;
  }, [employees, presence, tick, reduceMotion]);

  // Legs animate while a sprite is travelling a noticeable distance.
  useEffect(() => {
    const moving = new Set<string>();
    for (const [id, [x, y]] of Object.entries(targets)) {
      const prev = previous.current[id];
      if (prev && Math.hypot(prev[0] - x, prev[1] - y) > 6) moving.add(id);
    }
    previous.current = targets;
    if (!moving.size) return;
    setWalking(moving);
    const timer = setTimeout(() => setWalking(new Set()), WALK_MS);
    return () => clearTimeout(timer);
  }, [targets]);

  // One speech bubble at a time, rotating through whoever spoke most recently.
  const speakers = useMemo(() => {
    const latest = new Map<string, string>();
    for (const m of messages.slice(-14)) {
      if (m.kind === "chat" && presence[m.author]) latest.set(m.author, m.text);
    }
    return [...latest.entries()];
  }, [messages, presence]);
  const bubble = speakers.length ? speakers[tick % speakers.length] : null;

  const headline = useMemo(() => [...messages].reverse().find((m) => m.author === "secbot" && m.link), [messages]);
  const breach = messages.slice(-25).some((m) => m.kind === "system" && m.text.startsWith("🔥"));
  const alarm = openRisks.length > 0 || breach;
  const away = employees.filter((e) => presence[e.id]?.spot === "away");

  return (
    <div className="office">
      {headline && (
        <button className="ticker" onClick={() => props.onOpenChannel("security-alerts")}>
          📺 ข่าวล่าสุด: {headline.text.split("\n")[1] ?? headline.text}
        </button>
      )}

      <div className="map-scroll">
        <svg className={`office-map${breach ? " breach" : ""}`} viewBox="0 0 960 560" role="group" aria-label="แผนผังออฟฟิศ">
          <rect className="floor" x={0} y={0} width={960} height={560} rx={16} />
          {ROOMS.map((r) => (
            <g key={r.spot}>
              <rect className={`room room-${r.spot}`} x={r.x} y={r.y} width={r.w} height={r.h} rx={10} />
              <text className="room-label" x={r.x + 12} y={r.y + 22}>
                {r.spot === "desk" ? "โซนทำงาน" : SPOT_LABELS[r.spot]}
              </text>
            </g>
          ))}
          <Furniture alarm={alarm} />
          {employees
            .filter((e) => targets[e.id])
            .map((e) => (
              <Sprite
                key={e.id}
                employee={e}
                presence={presence[e.id]}
                at={targets[e.id]}
                walking={walking.has(e.id)}
                bubble={bubble?.[0] === e.id ? bubble[1] : null}
                onSelect={() => props.onSelectEmployee(e.id)}
              />
            ))}
        </svg>
      </div>

      {busy && (
        <p className="typing">
          พนักงานกำลังทำงาน<span className="dots" />
        </p>
      )}

      <ul className="roster" aria-label="สถานะพนักงาน">
        {employees.map((e) => {
          const p = presence[e.id];
          return (
            <li key={e.id}>
              <button onClick={() => props.onSelectEmployee(e.id)} className={p?.spot === "away" ? "is-away" : ""}>
                <span className="roster-face" style={{ background: SHIRTS[e.id] }} aria-hidden="true">
                  {e.emoji}
                </span>
                <span>
                  <b>
                    {e.name} {p?.mood}
                  </b>
                  <small>
                    {SPOT_LABELS[p?.spot ?? "desk"]} · {p?.activity ?? "ทำงาน"}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {away.length > 0 && <p className="away-note">🚪 นอกออฟฟิศตอนนี้: {away.map((e) => e.name).join(", ")}</p>}
    </div>
  );
}

function Sprite(props: {
  employee: PublicEmployee;
  presence: Presence;
  at: Point;
  walking: boolean;
  bubble: string | null;
  onSelect: () => void;
}) {
  const { employee, presence, at, bubble } = props;
  const label = `${employee.name} (${employee.role}): ${SPOT_LABELS[presence.spot]}, ${presence.activity}`;
  const text = bubble ? truncate(bubble, 26) : null;
  const width = text ? Math.min(230, Array.from(text).length * 7.5 + 22) : 0;
  return (
    <g
      className={`sprite${props.walking ? " walking" : ""}`}
      style={{ transform: `translate(${at[0]}px, ${at[1]}px)` }}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onSelect();
        }
      }}
    >
      <title>{label}</title>
      <ellipse className="shadow" cx={0} cy={24} rx={14} ry={4} />
      <rect className="leg leg-left" x={-7} y={12} width={5} height={12} rx={2} />
      <rect className="leg leg-right" x={2} y={12} width={5} height={12} rx={2} />
      <rect className="body" x={-11} y={-6} width={22} height={20} rx={7} fill={SHIRTS[employee.id] ?? "#888"} />
      <text className="face" y={-8} textAnchor="middle">
        {employee.emoji}
      </text>
      <text className="mood" x={13} y={-20}>
        {presence.mood}
      </text>
      <text className="name" y={40} textAnchor="middle">
        {employee.name}
      </text>
      {text && (
        <g className="bubble">
          <rect x={-width / 2} y={-64} width={width} height={22} rx={10} />
          <text y={-49} textAnchor="middle">
            {text}
          </text>
        </g>
      )}
    </g>
  );
}

function Furniture({ alarm }: { alarm: boolean }) {
  return (
    <g className="furniture" aria-hidden="true">
      {/* CEO office */}
      <rect className="desk-top" x={60} y={56} width={140} height={34} rx={6} />
      <text className="prop" x={130} y={80} textAnchor="middle">🖥️</text>
      <text className="prop" x={208} y={180}>🪴</text>

      {/* Meeting room */}
      <rect className="whiteboard" x={330} y={34} width={160} height={10} rx={3} />
      <ellipse className="table" cx={410} cy={118} rx={100} ry={30} />

      {/* Server room */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect className="rack" x={605 + i * 66} y={40} width={46} height={66} rx={4} />
          {[0, 1, 2].map((j) => (
            <circle
              key={j}
              className={`led${alarm ? " alarm" : ""}`}
              cx={616 + i * 66 + j * 12}
              cy={56 + (i % 2) * 8}
              r={3}
              style={{ animationDelay: `${(i * 3 + j) * 0.17}s` }}
            />
          ))}
        </g>
      ))}
      {alarm && (
        <text className="alarm-label" x={928} y={42} textAnchor="end">
          ⚠️ มีช่องโหว่ค้าง
        </text>
      )}

      {/* Open-plan desks */}
      {DESKS.map(([cx, cy], i) => (
        <g key={i}>
          <rect className="desk-top" x={cx - 60} y={cy - 22} width={120} height={40} rx={6} />
          <text className="prop" x={cx} y={cy + 6} textAnchor="middle">💻</text>
        </g>
      ))}
      <rect className="door" x={270} y={534} width={80} height={8} />

      {/* Pantry */}
      <rect className="counter" x={680} y={240} width={240} height={26} rx={5} />
      <text className="prop" x={696} y={261}>☕</text>
      <text className="prop" x={736} y={261}>🍪</text>
      <text className="prop" x={884} y={261}>🚰</text>

      {/* Lounge */}
      <rect className="sofa" x={690} y={414} width={150} height={30} rx={10} />
      <rect className="tv" x={866} y={408} width={56} height={8} rx={3} />
      <text className="prop" x={900} y={532}>🪴</text>
    </g>
  );
}
