// Types shared by the Worker (API) and the React UI.

// "kpi" is the business-specific measure (food quality, patient satisfaction...); its label comes from the business.
export type StatKey = "cash" | "morale" | "security" | "reputation" | "uptime" | "kpi";
export type Stats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = ["cash", "morale", "security", "reputation", "uptime", "kpi"];

export const STAT_LABELS: Record<StatKey, string> = {
  cash: "เงินสด",
  morale: "ขวัญกำลังใจ",
  security: "ความปลอดภัย",
  reputation: "ชื่อเสียง",
  uptime: "Uptime",
  kpi: "ตัวชี้วัดธุรกิจ",
};

// Where an employee physically is on the office map.
export type OfficeSpot = "desk" | "meeting" | "server" | "pantry" | "ceo" | "lounge" | "away";

export const OFFICE_SPOTS: OfficeSpot[] = ["desk", "meeting", "server", "pantry", "ceo", "lounge", "away"];

export const SPOT_LABELS: Record<OfficeSpot, string> = {
  desk: "โต๊ะทำงาน",
  meeting: "ห้องประชุม",
  server: "ห้อง Server",
  pantry: "มุมกาแฟ",
  ceo: "ห้อง CEO",
  lounge: "โซฟา",
  away: "นอกออฟฟิศ",
};

export interface Presence {
  spot: OfficeSpot;
  activity: string;
  mood: string;
}

// 8-bit character recipe: hair/accessory overlays plus palette colours (see src/pixel.tsx).
export interface AvatarSpec {
  looks: string[];
  palette: Record<string, string>;
}

export interface PublicEmployee {
  id: string;
  name: string;
  role: string;
  emoji: string;
  avatar?: AvatarSpec;
  roleKey?: RoleKey;
  salary?: number; // baht per month
  morale?: number; // 0-100, this person only
  level?: number; // 1 junior, 2 senior, 3 lead
}

// The job an employee fills; scripted scenes and pooled scenes are written against these.
// The six job functions every scripted scene and game rule is written against. Each role
// (a chef, a dentist, IT Support...) covers zero or more of them.
export type Archetype = "dev" | "sec" | "sales" | "ops" | "intern" | "pm";

// A role id from the role catalog (worker/roster.ts), e.g. "chef" or "dev".
export type RoleKey = string;

// How someone talks, so the model and scripted lines use the same particles for them.
export interface Speech {
  self: string; // first person: ผม, เรา, or their own name
  end: string; // statement particle: ครับ, ค่ะ, or none
  ask: string; // question / softener particle: ครับ, คะ, or none
}

export interface Employee extends PublicEmployee {
  roleKey: RoleKey;
  personality: string;
  secretGoal: string;
  speech: Speech;
  avatar: AvatarSpec;
  salary: number;
  morale: number;
  level: number;
}

// Which part of the fictional company's infrastructure a component belongs to;
// drives the simulated attack path drawn on the office map.
export type StackLayer = "edge" | "app" | "host" | "data" | "endpoint" | "ci";

export interface StackItem {
  name: string;
  layer: StackLayer;
}

export interface Dependency {
  name: string;
  version: string;
}

export interface DepVuln {
  id: string;
  package: string;
  summary: string;
  aliases: string[];
  severity: string | null;
  introduced: string | null;
  fixed: string | null;
  published: string | null;
  url: string;
}

// "ticket" messages announce a ticket in a channel; their link is "ticket:<id>".
export type MessageKind = "chat" | "bot" | "system" | "diff" | "ticket";

export interface ChatMessage {
  id: number;
  channel: string;
  author: string;
  text: string;
  kind: MessageKind;
  link: string | null;
  ts: number;
}

export interface DecisionOption {
  id: string;
  label: string;
  effects: Partial<Stats>;
  patches: boolean;
}

// Something waiting for the CEO: an email ticket or a personal request in a DM. It has a
// deadline in game time; ignoring it has consequences.
export type TicketStatus = "open" | "thinking" | "done" | "expired";

export interface PublicTicket {
  id: string;
  kind: "email" | "dm";
  from: string;
  subject: string;
  body: string;
  options: DecisionOption[];
  urgent: boolean;
  status: TicketStatus;
  // Game milliseconds left; while the player is online one game ms is one real ms.
  deadlineIn: number;
  outcome: string | null;
}

export interface OpenRisk {
  newsId: string;
  title: string;
  since: number;
  kind: "kev" | "dependency";
  layer: StackLayer;
  component: string;
  // Dependency risks only: the package and the first version that fixes it (from OSV).
  package?: string;
  fixedVersion?: string | null;
  // The CEO let its ticket expire; a breach is more likely.
  ignored?: boolean;
}

export interface NewsItem {
  id: string;
  name: string;
  description: string;
  kevAdded: string;
  dueDate: string | null;
  requiredAction: string | null;
  cvss: number | null;
  severity: string | null;
  products: string[];
  url: string;
}

export interface CompanyInfo {
  name: string;
  business: string;
  kpiLabel: string;
  // Office map style, e.g. "kitchen" for a restaurant.
  theme: string;
  // Roles this company can hire, and which of them push the KPI.
  hireRoles: { id: RoleKey; title: string }[];
  kpiRoles: RoleKey[];
}

// stats.cash is in baht; the other stats are 0-100.
export interface MoneyInfo {
  monthlyRevenue: number;
  monthlyCost: number;
  daysToPayday: number;
}

export interface GameState {
  // Changes when a new company starts, so the client drops messages it kept from the old one.
  epoch: string;
  day: number;
  company: CompanyInfo;
  money: MoneyInfo;
  stats: Stats;
  employees: PublicEmployee[];
  presence: Record<string, Presence>;
  stack: StackItem[];
  deps: Dependency[];
  // Only messages newer than the "since" id the client asked for; the client keeps the rest.
  messages: ChatMessage[];
  tickets: PublicTicket[];
  // Channels (or "ticket:<id>") where someone is composing a reply right now.
  typing: string[];
  maxStaff: number;
  openRisks: OpenRisk[];
  // Share of today's account-wide AI budget left. At 0 the game keeps going on pooled and scripted scenes.
  aiPercentLeft: number;
  gameOver: string | null;
}
