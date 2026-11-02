import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, OfficeSpot, OpenRisk, Presence, PublicEmployee, StackLayer } from "../shared/types";
import { SPOT_LABELS } from "../shared/types";
import {
  BIG_DESK,
  BIG_DESK_PALETTE,
  COFFEE,
  COFFEE_PALETTE,
  COUNTER,
  COUNTER_PALETTE,
  DESK,
  DESK_PALETTE,
  MoodIcon,
  PLANT,
  PLANT_PALETTE,
  PixelArt,
  PixelAvatar,
  RACK,
  RACK_PALETTE,
  SOFA,
  SOFA_PALETTE,
  TABLE,
  TABLE_PALETTE,
  TV,
  TV_PALETTE,
  WHITEBOARD,
  WHITEBOARD_PALETTE,
  characterFrames,
} from "./pixel";

type MapSpot = Exclude<OfficeSpot, "away">;
type Point = [number, number];

const PX = 3; // one art pixel = 3 SVG units
const OUTLINE = "#1a1c2c";

// Floor plan in SVG units (viewBox 960 x 560).
const ROOMS: { spot: MapSpot; x: number; y: number; w: number; h: number; label: string }[] = [
  { spot: "ceo", x: 20, y: 20, w: 220, h: 170, label: "ห้อง CEO" },
  { spot: "meeting", x: 260, y: 20, w: 300, h: 170, label: "ห้องประชุม" },
  { spot: "server", x: 580, y: 20, w: 360, h: 170, label: "ห้อง SERVER" },
  { spot: "desk", x: 20, y: 210, w: 620, h: 330, label: "โซนทำงาน" },
  { spot: "pantry", x: 660, y: 210, w: 280, h: 155, label: "มุมกาแฟ" },
  { spot: "lounge", x: 660, y: 385, w: 280, h: 155, label: "โซฟา" },
];

// Desk centres; each employee owns the desk at their index and sits just below it.
// Ten desks (the most staff a company can have), five per row.
const DESK_X = [80, 200, 320, 440, 560];
const DESKS: Point[] = [...DESK_X.map((x): Point => [x, 290]), ...DESK_X.map((x): Point => [x, 430])];

// Standing points (feet) in shared rooms, filled in arrival order.
const SLOTS: Record<Exclude<MapSpot, "desk">, Point[]> = {
  ceo: [[80, 150], [130, 160], [180, 150], [60, 175], [110, 180], [160, 175]],
  meeting: [[312, 128], [508, 128], [370, 176], [420, 178], [470, 176], [420, 96]],
  server: [[620, 150], [690, 158], [760, 150], [830, 158], [900, 150], [725, 178]],
  pantry: [[705, 320], [775, 330], [845, 320], [905, 330], [740, 352], [810, 352]],
  lounge: [[715, 455], [765, 455], [815, 455], [880, 480], [720, 520], [800, 520]],
};

// How far people drift while idling: little at desks, more when chatting over coffee.
const WANDER: Record<MapSpot, number> = { desk: 3, meeting: 4, server: 10, ceo: 8, pantry: 18, lounge: 14 };

// Simulated attack routes per infrastructure layer (concept only, not real exploit steps).
const DOOR: Point = [310, 540];
const ATTACK_PATHS: Record<StackLayer, Point[]> = {
  edge: [DOOR, [310, 202], [600, 202], [700, 112]],
  app: [DOOR, [320, 380], [520, 372], [610, 202], [700, 112]],
  endpoint: [DOOR, [120, 380], [120, 202], [600, 202], [700, 112]],
  host: [DOOR, [600, 202], [800, 112]],
  data: [DOOR, [600, 202], [900, 112]],
  ci: [[520, 300], [610, 202], [760, 112]],
};

export const LAYER_LABELS: Record<StackLayer, string> = {
  edge: "ขอบเครือข่าย",
  app: "แอปพลิเคชัน",
  host: "เครื่อง Server",
  data: "ฐานข้อมูล",
  endpoint: "เครื่องพนักงาน",
  ci: "ระบบ CI/GitHub",
};

const FLOORS: Record<MapSpot, [string, string]> = {
  desk: ["#3a3f4b", "#343945"],
  ceo: ["#6b4a33", "#5e412c"],
  meeting: ["#2f3a5a", "#2a3452"],
  server: ["#22272e", "#1c2026"],
  pantry: ["#8f7f6a", "#7f705d"],
  lounge: ["#2f4a3a", "#294234"],
};

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
  const [facingLeft, setFacingLeft] = useState<Set<string>>(new Set());
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
        base = [cx, cy + 56];
      } else {
        const n = used[spot] ?? 0;
        used[spot] = n + 1;
        base = SLOTS[spot][n % SLOTS[spot].length];
      }
      const amp = reduceMotion ? 0 : WANDER[spot];
      const h = hash(`${e.id}:${tick}`);
      out[e.id] = [
        Math.round(base[0] + ((h % 1000) / 500 - 1) * amp),
        Math.round(base[1] + (((h >>> 10) % 1000) / 500 - 1) * amp * 0.6),
      ];
    });
    return out;
  }, [employees, presence, tick, reduceMotion]);

  // Walk frames play while a sprite travels; sprites face the way they are moving.
  useEffect(() => {
    const moving = new Set<string>();
    const left = new Set<string>();
    for (const [id, [x, y]] of Object.entries(targets)) {
      const prev = previous.current[id];
      if (!prev) continue;
      if (Math.hypot(prev[0] - x, prev[1] - y) > 6) moving.add(id);
      if (x < prev[0] - 2) left.add(id);
    }
    previous.current = targets;
    setFacingLeft(left);
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

  const headline = useMemo(
    () => [...messages].reverse().find((m) => m.author === "secbot" && m.link),
    [messages],
  );
  const breach = messages.slice(-25).some((m) => m.kind === "system" && m.text.startsWith("🔥"));
  const alarm = openRisks.length > 0 || breach;
  const away = employees.filter((e) => presence[e.id]?.spot === "away");
  const shownRisks = openRisks.slice(-3);

  return (
    <div className="office">
      {headline && (
        <button className="ticker" onClick={() => props.onOpenChannel("security-alerts")}>
          ข่าวล่าสุด: {headline.text.split("\n")[1] ?? headline.text}
        </button>
      )}

      <div className="map-scroll">
        <svg className={`office-map${breach ? " breach" : ""}`} viewBox="0 0 960 560" role="group" aria-label="แผนผังออฟฟิศ">
          <defs>
            {ROOMS.map((r) => (
              <pattern key={r.spot} id={`floor-${r.spot}`} width={24} height={24} patternUnits="userSpaceOnUse">
                <rect width={24} height={24} fill={FLOORS[r.spot][0]} />
                <rect width={12} height={12} fill={FLOORS[r.spot][1]} />
                <rect x={12} y={12} width={12} height={12} fill={FLOORS[r.spot][1]} />
              </pattern>
            ))}
          </defs>
          <rect className="outside" x={0} y={0} width={960} height={560} />

          {ROOMS.map((r) => (
            <g key={r.spot} className={`room room-${r.spot}`} shapeRendering="crispEdges">
              <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#floor-${r.spot})`} />
              <rect className="wall" x={r.x} y={r.y} width={r.w} height={15} />
              <rect className="wall-edge" x={r.x} y={r.y + 15} width={r.w} height={3} />
              <rect className="room-border" x={r.x} y={r.y} width={r.w} height={r.h} />
              <RoomSign x={r.x + 8} y={r.y + 3} label={r.label} />
            </g>
          ))}

          <Furniture alarm={alarm} />

          {shownRisks.map((risk, i) => (
            <AttackPath key={risk.newsId} risk={risk} offset={i * 7} breach={breach} />
          ))}

          {alarm && <Hacker at={breach ? [880, 178] : [DOOR[0] - 40, 552]} breach={breach} />}

          {employees
            .filter((e) => targets[e.id])
            .map((e) => (
              <Sprite
                key={e.id}
                employee={e}
                presence={presence[e.id]}
                at={targets[e.id]}
                walking={walking.has(e.id)}
                facingLeft={facingLeft.has(e.id)}
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

      {openRisks.length > 0 && (
        <ul className="attack-legend" aria-label="เส้นทางโจมตีจำลอง">
          {openRisks.map((r) => (
            <li key={r.newsId}>
              <span className="legend-swatch" aria-hidden="true" />
              <b>{r.newsId}</b> · {r.component}: อินเทอร์เน็ต → {LAYER_LABELS[r.layer]} → ห้อง Server
            </li>
          ))}
          <li className="legend-note">เส้นสีแดงคือเส้นทางโจมตีจำลองในระดับแนวคิด ไม่ใช่ขั้นตอนการโจมตีจริง</li>
        </ul>
      )}

      <ul className="roster" aria-label="สถานะพนักงาน">
        {employees.map((e) => {
          const p = presence[e.id];
          return (
            <li key={e.id}>
              <button onClick={() => props.onSelectEmployee(e.id)} className={p?.spot === "away" ? "is-away" : ""}>
                <PixelAvatar id={e.id} size={34} />
                <span>
                  <b>{e.name}</b>{" "}
                  <span className="roster-role">
                    {e.role}
                    {e.salary ? ` · ${e.salary.toLocaleString("en-US")} บาท/เดือน` : ""}
                  </span>
                  <small>
                    {SPOT_LABELS[p?.spot ?? "desk"]} · {p?.activity ?? "ทำงาน"}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {away.length > 0 && <p className="away-note">นอกออฟฟิศตอนนี้: {away.map((e) => e.name).join(", ")}</p>}
    </div>
  );
}

function RoomSign({ x, y, label }: { x: number; y: number; label: string }) {
  const width = Array.from(label).length * 9 + 14;
  return (
    <g className="room-sign" shapeRendering="crispEdges">
      <rect x={x} y={y} width={width} height={14} />
      <text x={x + 7} y={y + 11}>
        {label}
      </text>
    </g>
  );
}

function Sprite(props: {
  employee: PublicEmployee;
  presence: Presence;
  at: Point;
  walking: boolean;
  facingLeft: boolean;
  bubble: string | null;
  onSelect: () => void;
}) {
  const { employee, presence, at, bubble } = props;
  const frames = characterFrames(employee.id);
  const label = `${employee.name} (${employee.role}): ${SPOT_LABELS[presence.spot]}, ${presence.activity}`;
  const text = bubble ? truncate(bubble, 24) : null;
  const bubbleWidth = text ? Math.min(240, Array.from(text).length * 8 + 20) : 0;
  const nameWidth = Array.from(employee.name).length * 9 + 12;
  const flip = props.facingLeft ? "scale(-1 1)" : undefined;
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
      <rect className="shadow" x={-15} y={2} width={30} height={5} />
      <g transform={flip}>
        <PixelArt className="frame-idle" rows={frames.idle} palette={frames.palette} x={-18} y={-46} scale={PX} />
        <PixelArt className="frame-walk-a" rows={frames.walkA} palette={frames.palette} x={-18} y={-46} scale={PX} />
        <PixelArt className="frame-walk-b" rows={frames.walkB} palette={frames.palette} x={-18} y={-46} scale={PX} />
      </g>
      <MoodIcon mood={presence.mood} x={10} y={-70} />
      <g className="name-tag" shapeRendering="crispEdges">
        <rect x={-nameWidth / 2} y={8} width={nameWidth} height={15} />
        <text y={20} textAnchor="middle">
          {employee.name}
        </text>
      </g>
      {text && (
        <g className="bubble" shapeRendering="crispEdges">
          <rect x={-bubbleWidth / 2} y={-100} width={bubbleWidth} height={22} />
          <rect className="bubble-tail" x={-3} y={-78} width={6} height={4} />
          <rect className="bubble-tail" x={-1} y={-74} width={3} height={3} />
          <text y={-84} textAnchor="middle">
            {text}
          </text>
        </g>
      )}
    </g>
  );
}

function Hacker({ at, breach }: { at: Point; breach: boolean }) {
  const frames = characterFrames("hacker");
  return (
    <g className={`hacker${breach ? " inside" : ""}`} style={{ transform: `translate(${at[0]}px, ${at[1]}px)` }}>
      <title>{breach ? "ผู้โจมตีอยู่ในห้อง Server" : "ผู้โจมตีกำลังหาช่องทางเข้า"}</title>
      <rect className="shadow" x={-15} y={-4} width={30} height={5} />
      <PixelArt rows={frames.idle} palette={frames.palette} x={-18} y={-52} scale={PX} />
      {breach && <MoodIcon mood="🔥" x={10} y={-76} />}
    </g>
  );
}

function AttackPath({ risk, offset, breach }: { risk: OpenRisk; offset: number; breach: boolean }) {
  const points = ATTACK_PATHS[risk.layer] ?? ATTACK_PATHS.edge;
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x + offset} ${y - offset}`).join(" ");
  const [lx, ly] = points[1];
  const labelWidth = risk.newsId.length * 7 + 12;
  return (
    <g className={`attack${breach ? " breach" : ""}`} aria-hidden="true">
      <path className="attack-shadow" d={d} />
      <path className="attack-path" d={d} />
      <g shapeRendering="crispEdges">
        <rect className="attack-label" x={lx + offset + 6} y={ly - offset - 22} width={labelWidth} height={15} />
        <text className="attack-label-text" x={lx + offset + 12} y={ly - offset - 11}>
          {risk.newsId}
        </text>
      </g>
    </g>
  );
}

function Furniture({ alarm }: { alarm: boolean }) {
  const rackPalette = alarm ? { ...RACK_PALETTE, L: "#ff004d" } : RACK_PALETTE;
  return (
    <g className="furniture" aria-hidden="true">
      {/* CEO office */}
      <PixelArt rows={BIG_DESK} palette={BIG_DESK_PALETTE} x={75} y={46} scale={PX} />
      <PixelArt rows={PLANT} palette={PLANT_PALETTE} x={204} y={150} scale={PX} />

      {/* Meeting room */}
      <PixelArt rows={WHITEBOARD} palette={WHITEBOARD_PALETTE} x={359} y={40} scale={PX} />
      <PixelArt rows={TABLE} palette={TABLE_PALETTE} x={344} y={98} scale={PX} />

      {/* Server room */}
      {[0, 1, 2, 3, 4].map((i) => (
        <PixelArt
          key={i}
          rows={RACK}
          palette={rackPalette}
          classes={{ L: alarm ? "led alarm" : "led" }}
          x={604 + i * 66}
          y={40}
          scale={PX}
        />
      ))}

      {/* Open-plan desks */}
      {DESKS.map(([cx, cy], i) => (
        <PixelArt key={i} rows={DESK} palette={DESK_PALETTE} x={cx - 30} y={cy - 24} scale={PX} />
      ))}
      <PixelArt rows={PLANT} palette={PLANT_PALETTE} x={600} y={500} scale={PX} />
      <rect className="door" x={DOOR[0] - 40} y={534} width={80} height={8} shapeRendering="crispEdges" />

      {/* Pantry */}
      <PixelArt rows={COUNTER} palette={COUNTER_PALETTE} x={680} y={258} scale={PX} />
      <PixelArt rows={COFFEE} palette={COFFEE_PALETTE} x={700} y={226} scale={PX} />
      <PixelArt rows={PLANT} palette={PLANT_PALETTE} x={904} y={322} scale={PX} />

      {/* Lounge */}
      <PixelArt rows={SOFA} palette={SOFA_PALETTE} x={690} y={418} scale={PX} />
      <PixelArt rows={TV} palette={TV_PALETTE} x={850} y={410} scale={PX} />
      <PixelArt rows={PLANT} palette={PLANT_PALETTE} x={904} y={500} scale={PX} />

      {/* Outline around the whole floor */}
      <rect x={18} y={18} width={924} height={524} fill="none" stroke={OUTLINE} strokeWidth={4} shapeRendering="crispEdges" />
    </g>
  );
}
