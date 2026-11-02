import type { AvatarSpec, Employee, RoleKey, Speech } from "../shared/types";

// Each company gets its own randomly generated staff. Scripted and pooled scenes are written
// against roles ({dev}, {sec}, ...) and cast onto whoever holds that role.

interface RoleDef {
  title: string;
  emoji: string;
  personalities: string[];
  secretGoals: string[];
}

export const ROLES: Record<RoleKey, RoleDef> = {
  dev: {
    title: "Senior Dev",
    emoji: "👨‍💻",
    personalities: [
      "เก่งมากแต่ขี้เกียจ patch ชอบพูดว่า 'เดี๋ยวค่อยทำ' ประชดเก่ง",
      "เพอร์เฟกชันนิสต์ ไม่ยอมปล่อยงานถ้าไม่มี test ชอบบ่นเรื่องโค้ดคนอื่น",
      "สายลุย deploy วันศุกร์เย็นเป็นประจำ มั่นใจในตัวเองสูง",
    ],
    secretGoals: ["อยากเป็น Tech Lead และคุมทีมเอง", "อยากได้สิทธิ์ทำงานจากบ้านถาวร"],
  },
  sec: {
    title: "Security Engineer",
    emoji: "🛡️",
    personalities: [
      "ระแวงทุกอย่าง ชอบพูดว่า 'บอกแล้ว' ใช้อีโมจิเยอะเวลาตกใจ",
      "ใจเย็น ทำตามมาตรฐานเป๊ะ ชอบอ้าง NIST กับ CIS Controls",
      "อดีตสาย CTF มุกตลกร้าย มองทุกระบบเป็นโจทย์ที่ต้องเจาะ",
    ],
    secretGoals: ["อยากได้งบ security เพิ่มเป็นสองเท่า ใช้ทุกเหตุการณ์เป็นข้ออ้าง", "อยากได้เป็น CISO ของบริษัท"],
  },
  sales: {
    title: "Sales",
    emoji: "💼",
    personalities: [
      "มองทุกอย่างเป็นยอดขาย ไม่ยอมให้ระบบล่มแม้แต่นาทีเดียว พูดภาษาเซลส์",
      "พูดเก่ง รับปากลูกค้าไว้ก่อนแล้วค่อยมาคิดว่าจะทำยังไง",
      "บ้าตัวเลข ทำ spreadsheet ทุกเรื่อง วัดผลทุกอย่างเป็นเงิน",
    ],
    secretGoals: ["ต้องปิดดีลลูกค้ารายใหญ่ให้ได้ในไตรมาสนี้ ไม่งั้นโดนตัดคอมมิชชั่น", "อยากได้หุ้นบริษัท"],
  },
  ops: {
    title: "DevOps",
    emoji: "⚙️",
    personalities: [
      "ทำงานหนักจนใกล้หมดไฟ ตอบสั้น เหนื่อย แต่รับผิดชอบสูง",
      "คลั่ง automation อยากให้ทุกอย่างเป็นสคริปต์ หงุดหงิดเวลามีคนทำมือ",
      "ชอบเป็นฮีโร่ตอนระบบล่ม แอบสนุกกับ incident มากเกินไป",
    ],
    secretGoals: ["อยากให้ CEO เห็นคุณค่าและขึ้นเงินเดือน ถ้าไม่ได้จะลาออก", "อยากได้คนมาช่วยเข้าเวร on-call"],
  },
  intern: {
    title: "Intern",
    emoji: "🐣",
    personalities: [
      "กระตือรือร้น ซื่อ กดทุกอย่าง ถามเยอะ บางทีทำพังโดยไม่ตั้งใจ",
      "เงียบๆ แต่เก่งเกินตำแหน่ง แอบแก้บั๊กที่คนอื่นไม่กล้าแตะ",
      "ติดโซเชียล อยากโพสต์ทุกอย่างที่เกิดในออฟฟิศ",
    ],
    secretGoals: ["อยากได้บรรจุเป็นพนักงานประจำ พยายามทำตัวให้เด่น", "อยากเป็น influencer สาย tech"],
  },
  pm: {
    title: "Product Manager",
    emoji: "📋",
    personalities: [
      "สุภาพต่อหน้า การเมืองเก่ง ชอบโยนความผิดอย่างแนบเนียน",
      "คลั่ง roadmap เขียนเอกสารทุกเรื่อง ประชุมบ่อยมาก",
      "ขี้เกรงใจ รับปากทุกคน จนงานล้นทีม",
    ],
    secretGoals: ["อยากเป็น CEO แทน กำลังเก็บหลักฐานความผิดพลาดของ CEO", "อยากย้ายไปบริษัทใหญ่ กำลังสร้างผลงานไว้ใส่ portfolio"],
  },
};

export const ROLE_KEYS = Object.keys(ROLES) as RoleKey[];

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
  if (role === "sales" && Math.random() < 0.6) looks.push("tie");
  else if (role === "ops" && Math.random() < 0.6) looks.push("headset");
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

// A new company's staff, one per role, with names the player has not seen recently.
export function generateStaff(recentNames: string[]): Employee[] {
  const taken = new Set(recentNames);
  let pool = NAMES.filter((n) => !taken.has(n));
  if (pool.length < ROLE_KEYS.length) pool = [...NAMES];
  return ROLE_KEYS.map((roleKey) => {
    const name = pick(pool);
    pool = pool.filter((n) => n !== name);
    const role = ROLES[roleKey];
    return {
      id: `e${crypto.randomUUID().replace(/-/g, "").slice(0, 7)}`,
      name,
      role: role.title,
      emoji: role.emoji,
      roleKey,
      personality: pick(role.personalities),
      secretGoal: pick([...role.secretGoals, ...SHARED_GOALS]),
      speech: randomSpeech(name),
      avatar: randomAvatar(roleKey),
    };
  });
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
  };
}

// Stand-in staff for pooled scenes, which are shared by every company: ids are role keys and
// names are {role} placeholders, filled in with the real names when a company plays the scene.
export const ROLE_CAST: Employee[] = ROLE_KEYS.map((roleKey) => ({
  id: roleKey,
  name: `{${roleKey}}`,
  role: ROLES[roleKey].title,
  emoji: ROLES[roleKey].emoji,
  roleKey,
  personality: "ตามบทบาทของตำแหน่ง",
  secretGoal: "ไม่ระบุ",
  speech: { self: "เรา", end: "", ask: "" },
  avatar: { looks: [], palette: {} },
}));

export function holder(staff: Employee[], role: RoleKey): Employee | undefined {
  return staff.find((e) => e.roleKey === role);
}

export function isRoleKey(value: string): value is RoleKey {
  return value in ROLES;
}

// Fills {role} with that employee's name and {I}/{end}/{ask} with the speaker's own speech.
// Returns null when the text needs a role the company does not have.
export function renderText(text: string, staff: Employee[], speaker?: Employee): string | null {
  let missing = false;
  const out = text.replace(/\{(\w+)\}/g, (token, key: string) => {
    if (speaker && key === "I") return speaker.speech.self;
    if (speaker && key === "end") return speaker.speech.end;
    if (speaker && key === "ask") return speaker.speech.ask;
    if (!isRoleKey(key)) return token;
    const person = holder(staff, key);
    if (!person) missing = true;
    return person?.name ?? "";
  });
  return missing ? null : out;
}

export function speechNote(s: Speech): string {
  const self = `calls self "${s.self}"`;
  return s.end ? `polite, ends sentences with "${s.end}" (questions "${s.ask}"), ${self}` : `casual, no polite particle, ${self}`;
}
