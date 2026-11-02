// Types shared by the Worker (API) and the React UI.

export type StatKey = "cash" | "morale" | "security" | "reputation" | "uptime";
export type Stats = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = ["cash", "morale", "security", "reputation", "uptime"];

export const STAT_LABELS: Record<StatKey, string> = {
  cash: "เงินสด",
  morale: "ขวัญกำลังใจ",
  security: "ความปลอดภัย",
  reputation: "ชื่อเสียง",
  uptime: "Uptime",
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

export interface PublicEmployee {
  id: string;
  name: string;
  role: string;
  emoji: string;
}

export interface Employee extends PublicEmployee {
  personality: string;
  secretGoal: string;
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

export type MessageKind = "chat" | "bot" | "system" | "diff";

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

export interface Decision {
  id: string;
  prompt: string;
  options: DecisionOption[];
  newsId: string | null;
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

export interface GameState {
  day: number;
  stats: Stats;
  employees: PublicEmployee[];
  presence: Record<string, Presence>;
  stack: StackItem[];
  deps: Dependency[];
  messages: ChatMessage[];
  decision: Decision | null;
  openRisks: OpenRisk[];
  // Share of today's account-wide AI budget left. At 0 the game keeps going on pooled and scripted scenes.
  aiPercentLeft: number;
  gameOver: string | null;
}
