import type { AvatarSpec, Employee, RoleKey, Speech } from "../shared/types";
import { baseSalary, getBusiness, randomSalary, roleTitle, type Business } from "./business";
import { ROLES, isRoleToken, roleCovers } from "./roles";

// Each company gets its own randomly generated staff. Scripted and pooled scenes are written
// against archetypes ({dev}, {sec}, ...) or role ids ({chef}) and cast onto whoever covers them.

export { ROLES } from "./roles";

// Secret goals any role can have, mixed in with the role's own.
const SHARED_GOALS = [
  "แอบสัมภาษณ์งานกับบริษัทอื่นอยู่ ไม่อยากให้ใครรู้",
  "แอบทำธุรกิจส่วนตัวหลังเลิกงาน",
  "อยากลาพักยาวไปเที่ยวต่างประเทศ",
];

// Thai nicknames. No "บอส": employees call the player CEO, never boss.
const NAMES = [
  ...new Set(
    `กาน ใหม่ โอ๊ต ฟ้า ต้น แพร เก่ง ภูมิ มิ้น ปลา นุ่น เบียร์ กอล์ฟ ไอซ์ แบงค์ ตาล ฝน เมย์ จูน ออม น้ำ ปอ พลอย ฟิล์ม
    เจ บีม แป้ง ปุ้ย โบ กิ๊ฟ ข้าว ปั้น ต่าย ตูน นิว เนส พีท อาร์ม ก้อง หมิว แนน ฝ้าย ขิม ปาล์ม ปริม ใบเตย มายด์ เฟิร์น
    ฟลุ๊ค ต้า ป๊อป โอม เต้ย เอิร์ท ไนซ์ ภู มิว ปาย ชมพู่ แตงโม ส้ม ลูกน้ำ น้ำหวาน เพชร ทราย ดาว หมอก เมฆ ท็อป เบนซ์
    บอล แม็ก เติ้ล หนึ่ง ตั้ม โจ้ เอก บิว ปิง กุ้ง ปู ไก่ อั๋น แอน เอ็ม ไผ่ ใบบัว ขนุน มะปราง สตางค์ เปรี้ยว ซัน มีน กาย
    วิว ทิว ภีม แทน ข้าวหอม พิม พราว กวาง ยุ้ย จอย ป๋อง บุ๊ค โน้ต ต่อ ตี๋ อุ้ม ฟาง นัท ไทม์ แบม แพม คิม กิ่ง เกด ดิว
    ปั๊บ ตะวัน ธาร เพลง ขวัญ มุก อ้อม จิ๋ว วุ้น ลูกตาล เฟย์ ปีใหม่ ใบเฟิร์น ต้นกล้า น้ำฝน ภูผา`
      .split(/\s+/)
      .filter(Boolean),
  ),
];
// A player will not see the same name again until this many others have been used.
export const NAME_MEMORY = 60;

const HAIR = ["short", "long", "spiky", "bun", "slick"];
const COLORS = {
  H: ["#3b2a20", "#a8452f", "#1f1612", "#5d3a1a", "#ffcd75", "#2b2235", "#6b4226", "#94b0c2", "#b13e53"],
  S: ["#f2c49b", "#f6d2b0", "#d9a066", "#c68642", "#8d5524"],
  C: ["#3e6ec4", "#c4385f", "#e4e4ec", "#38b764", "#ef7d57", "#8b5cf6", "#ffcd75", "#41a6f6", "#257179", "#5d275d"],
  P: ["#29366f", "#2b2b3a", "#333c57", "#1f2335", "#5d275d", "#3b5dc9"],
  A: ["#b13e53", "#566c86", "#ffcd75", "#ff004d", "#1a1c2c"],
};

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomAvatar(role: RoleKey): AvatarSpec {
  const looks = [pick(HAIR)];
  if (Math.random() < 0.3) looks.push("glasses");
  // Accessories that suit the job, sometimes.
  if (roleCovers(role, "sales") && Math.random() < 0.6) looks.push("tie");
  else if ((roleCovers(role, "ops") || role === "dispatcher" || role === "cs") && Math.random() < 0.6) looks.push("headset");
  else if (Math.random() < 0.1) looks.push(pick(["tie", "headset"]));
  return {
    looks,
    palette: { H: pick(COLORS.H), S: pick(COLORS.S), C: pick(COLORS.C), P: pick(COLORS.P), A: pick(COLORS.A) },
  };
}

function randomSpeech(name: string): Speech {
  const r = Math.random();
  if (r < 0.35) return { self: "ผม", end: "ครับ", ask: "ครับ" };
  if (r < 0.7) return { self: Math.random() < 0.5 ? name : "เรา", end: "ค่ะ", ask: "คะ" };
  if (r < 0.85) return { self: "ผม", end: "", ask: "" };
  return { self: "เรา", end: "", ask: "" };
}

// A new company's staff: the business's starting team, with names the player has not seen recently.
export function generateStaff(recentNames: string[], business: Business): Employee[] {
  const taken = new Set(recentNames);
  return business.team.map((roleKey) => {
    const person = newEmployee(roleKey, business, taken);
    taken.add(person.name);
    return person;
  });
}

function newEmployee(roleKey: RoleKey, business: Business, taken: Set<string>): Employee {
  let pool = NAMES.filter((n) => !taken.has(n));
  if (!pool.length) pool = [...NAMES];
  const name = pick(pool);
  const role = ROLES[roleKey];
  return {
    id: `e${crypto.randomUUID().replace(/-/g, "").slice(0, 7)}`,
    name,
    role: roleTitle(roleKey, business),
    emoji: role.emoji,
    roleKey,
    personality: pick(role.personalities),
    secretGoal: pick([...role.secretGoals, ...SHARED_GOALS]),
    speech: randomSpeech(name),
    avatar: randomAvatar(roleKey),
    salary: randomSalary(roleKey, business),
    morale: 60 + Math.floor(Math.random() * 21),
    level: role.startLevel,
  };
}

// Job applicants: like new staff, but asking anywhere from 20% below to 30% above the usual salary.
export function generateCandidates(roleKey: RoleKey, business: Business, taken: Set<string>, count: number): Employee[] {
  const out: Employee[] = [];
  for (let i = 0; i < count; i++) {
    const person = newEmployee(roleKey, business, taken);
    person.salary = Math.round((person.salary * (0.8 + Math.random() * 0.5)) / 1000) * 1000;
    person.morale = 75;
    taken.add(person.name);
    out.push(person);
  }
  return out;
}

// The original hand-made team, kept for companies started before staff were generated.
export const LEGACY_STAFF: Employee[] = [
  legacy("kan", "กาน", "dev", { self: "ผม", end: "", ask: "" }, ["short", "glasses"], { H: "#3b2a20", S: "#f2c49b", C: "#3e6ec4", P: "#29366f" }, SHARED_GOALS[0]),
  legacy("mai", "ใหม่", "sec", { self: "ใหม่", end: "ค่ะ", ask: "คะ" }, ["long"], { H: "#a8452f", S: "#f6d2b0", C: "#c4385f", P: "#2b2b3a" }),
  legacy("oat", "โอ๊ต", "sales", { self: "ผม", end: "", ask: "" }, ["slick", "tie"], { H: "#1f1612", S: "#d9a066", C: "#e4e4ec", A: "#b13e53", P: "#333c57" }),
  legacy("fah", "ฟ้า", "ops", { self: "ฟ้า", end: "", ask: "" }, ["short", "headset"], { H: "#5d3a1a", S: "#c68642", C: "#38b764", A: "#566c86", P: "#29366f" }),
  legacy("ton", "ต้น", "intern", { self: "ผม", end: "ครับ", ask: "ครับ" }, ["spiky"], { H: "#ffcd75", S: "#f2c49b", C: "#ef7d57", P: "#3b5dc9" }),
  legacy("prae", "แพร", "pm", { self: "แพร", end: "ค่ะ", ask: "คะ" }, ["bun"], { H: "#2b2235", S: "#f6d2b0", C: "#8b5cf6", P: "#2b2b3a" }),
];

function legacy(
  id: string,
  name: string,
  roleKey: RoleKey,
  speech: Speech,
  looks: string[],
  palette: Record<string, string>,
  secretGoal?: string,
): Employee {
  const role = ROLES[roleKey];
  return {
    id,
    name,
    role: role.title,
    emoji: role.emoji,
    roleKey,
    personality: role.personalities[0],
    secretGoal: secretGoal ?? role.secretGoals[0],
    speech,
    avatar: { looks, palette },
    salary: baseSalary(roleKey, getBusiness("saas")),
    morale: 70,
    level: role.startLevel,
  };
}

// Stand-in staff for pooled scenes, which are shared by every company of a business: ids are role
// ids and names are {role} placeholders, filled in with the real names when a company plays it.
export function roleCast(business: Business): Employee[] {
  return [...new Set(business.team)].map((roleKey) => ({
    id: roleKey,
    name: `{${roleKey}}`,
    role: roleTitle(roleKey, business),
    emoji: ROLES[roleKey].emoji,
    roleKey,
    personality: "ตามบทบาทของตำแหน่ง",
    secretGoal: "ไม่ระบุ",
    speech: { self: "เรา", end: "", ask: "" },
    avatar: { looks: [], palette: {} },
    salary: 0,
    morale: 70,
    level: 2,
  }));
}

// The first employee who holds a role id or covers an archetype ("sec" finds IT Support too).
export function holder(staff: Employee[], token: string): Employee | undefined {
  return staff.find((e) => e.roleKey === token) ?? staff.find((e) => roleCovers(e.roleKey, token));
}

export function isRoleKey(value: string): boolean {
  return isRoleToken(value);
}

// Who plays which token in a scene; a script casts distinct people so nobody talks to themselves.
export type Cast = Record<string, Employee>;

// Fills {role} with that employee's name and {I}/{end}/{ask} with the speaker's own speech.
// Returns null when the text needs a role the company does not have.
export function renderText(text: string, staff: Employee[], speaker?: Employee, cast?: Cast): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (token, key: string) => {
    if (speaker && key === "I") return speaker.speech.self;
    if (speaker && key === "end") return speaker.speech.end;
    if (speaker && key === "ask") return speaker.speech.ask;
    if (!isRoleToken(key)) return token;
    const person = cast?.[key] ?? holder(staff, key);
    if (!person) missing = true;
    return person?.name ?? "";
  });
  return missing ? null : out;
}

export function speechNote(s: Speech): string {
  const self = `calls self "${s.self}"`;
  return s.end ? `polite, ends sentences with "${s.end}" (questions "${s.ask}"), ${self}` : `casual, no polite particle, ${self}`;
}
