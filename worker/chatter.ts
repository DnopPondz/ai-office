import type { Employee, OfficeSpot, RoleKey } from "../shared/types";
import type { DraftMessage, PresenceMap } from "./game";
import { roleCovers } from "./roles";
import { renderText } from "./roster";

// Background small talk while the player is online: pre-written, no AI, so the office feels
// alive between events. Same tokens as scripted scenes ({I}, {end}, {ask}, {role}).

type Line = { channel: "general" | "dev" | "random"; text: string; spot?: OfficeSpot; activity?: string };

const ANYONE: Line[] = [
  { channel: "random", text: "ใครกินขนมบนโต๊ะ{I}ไป 😤", spot: "desk", activity: "ตามหาขนม" },
  { channel: "random", text: "กาแฟหมดอีกแล้ว ใครชงหม้อใหม่หน่อย ☕", spot: "pantry", activity: "รอกาแฟ" },
  { channel: "random", text: "วันนี้ฝนตก รถติดมาก{end} 🌧️", spot: "desk", activity: "เพิ่งมาถึง" },
  { channel: "random", text: "ใครสั่งข้าวกลางวันบ้าง{ask} 🍜", spot: "pantry", activity: "รวบรวมเมนู" },
  { channel: "random", text: "แอร์หนาวไปไหม{ask} 🥶", spot: "desk", activity: "ห่มผ้า" },
  { channel: "random", text: "เน็ตช้าหรือเป็นที่{I}คนเดียว", spot: "desk", activity: "รีสตาร์ท Wi-Fi" },
  { channel: "random", text: "มีใครเห็นที่ชาร์จมือถือ{I}ไหม{ask}", spot: "lounge", activity: "หาที่ชาร์จ" },
  { channel: "general", text: "บ่ายนี้ใครว่างช่วยดูงาน{I}หน่อยได้ไหม{ask}", spot: "desk", activity: "ทำงาน" },
  { channel: "random", text: "ขอพักสายตา 5 นาทีนะ{ask} 😴", spot: "lounge", activity: "งีบสั้นๆ" },
];

const BY_ROLE: Record<RoleKey, Line[]> = {
  dev: [
    { channel: "dev", text: "build ผ่านแล้ว{end} 🎉", spot: "desk", activity: "ดู CI" },
    { channel: "dev", text: "ใครแก้ main โดยไม่เปิด PR 😑", spot: "desk", activity: "ไล่ git log" },
    { channel: "dev", text: "test แดงทั้งแถบ เดี๋ยวดูให้", spot: "desk", activity: "แก้ test" },
    { channel: "dev", text: "{intern} PR ที่ส่งมาดีขึ้นเยอะนะ", spot: "desk", activity: "รีวิว PR" },
  ],
  sec: [
    { channel: "general", text: "อย่าลืมเปิด MFA นะ{ask} 🔐", spot: "desk", activity: "ตรวจบัญชี" },
    { channel: "general", text: "เจออีเมลแปลกๆ ส่งมาให้{I}ดูก่อนกดนะ{ask}", spot: "desk", activity: "ดูอีเมลต้องสงสัย" },
    { channel: "dev", text: "{I}กำลังสแกนช่องโหว่รอบสัปดาห์อยู่{end}", spot: "server", activity: "สแกนช่องโหว่" },
    { channel: "random", text: "รหัส Wi-Fi ไม่ควรแปะบนกำแพงนะ{ask} 🫠", spot: "pantry", activity: "แกะโพสต์อิท" },
  ],
  sales: [
    { channel: "general", text: "ลูกค้าโทรมาชมระบบด้วย{end}! 💼", spot: "desk", activity: "คุยโทรศัพท์" },
    { channel: "general", text: "เดือนนี้ยอดใกล้เป้าแล้ว 📈", spot: "desk", activity: "อัปเดตยอดขาย" },
    { channel: "random", text: "ใครว่างไปเดโมกับ{I}บ่ายนี้บ้าง{ask}", spot: "meeting", activity: "เตรียมเดโม" },
  ],
  ops: [
    { channel: "dev", text: "disk เต็ม 85% แล้ว เดี๋ยวเคลียร์", spot: "server", activity: "เคลียร์ disk" },
    { channel: "dev", text: "backup เมื่อคืนผ่าน{end} ✅", spot: "server", activity: "เช็ค backup" },
    { channel: "dev", text: "อย่า deploy วันศุกร์เย็นนะ{ask}", spot: "desk", activity: "ดูกราฟ" },
  ],
  intern: [
    { channel: "dev", text: "พี่ๆ คำสั่งนี้พิมพ์ผิดไหม{ask} 😅", spot: "desk", activity: "ลองคำสั่งใหม่" },
    { channel: "random", text: "{I}เรียน Docker จบแล้ว{end}! 🐳", spot: "desk", activity: "อ่านเอกสาร" },
    { channel: "general", text: "วันนี้{I}ปิด ticket แรกได้แล้ว{end} 🎉", spot: "desk", activity: "ปิด ticket" },
  ],
  pm: [
    { channel: "general", text: "อัปเดต roadmap ในเอกสารแล้วนะ{ask} 📋", spot: "meeting", activity: "แก้ roadmap" },
    { channel: "general", text: "standup 10 โมงนะ{ask}ทุกคน", spot: "meeting", activity: "รอ standup" },
    { channel: "general", text: "ใครยังไม่กรอก timesheet บ้าง{ask} 😊", spot: "desk", activity: "ทวง timesheet" },
  ],
};

// One random line from a random employee, and where that puts them on the map.
export function chatterLine(staff: Employee[], mood: (e: Employee) => string): { post: DraftMessage; presence: Partial<PresenceMap> } | null {
  if (!staff.length) return null;
  const speaker = staff[Math.floor(Math.random() * staff.length)];
  // Roles without their own lines (a chef, a dentist...) use the shared ones plus their job function's.
  const own = BY_ROLE[speaker.roleKey] ?? Object.entries(BY_ROLE).find(([a]) => roleCovers(speaker.roleKey, a))?.[1] ?? [];
  const lines = [...ANYONE, ...own];
  for (let tries = 0; tries < 5; tries++) {
    const line = lines[Math.floor(Math.random() * lines.length)];
    const text = renderText(line.text, staff, speaker);
    if (text === null) continue;
    const presence: Partial<PresenceMap> = line.spot
      ? { [speaker.id]: { spot: line.spot, activity: line.activity ?? "ทำงาน", mood: mood(speaker) } }
      : {};
    return { post: { channel: line.channel, author: speaker.id, text, kind: "chat" }, presence };
  }
  return null;
}

// Short back-and-forth exchanges. "x", "y" and "z" are any distinct employees (named with {x},
// {y}, {z}); other roles are job functions or role ids, cast onto different people.
interface Convo {
  channel: "general" | "dev" | "random";
  spot: OfficeSpot;
  activity: string;
  lines: { role: string; text: string }[];
}

const CONVOS: Convo[] = [
  { channel: "random", spot: "pantry", activity: "คุยเรื่องข้าวเที่ยง", lines: [
    { role: "x", text: "เที่ยงนี้กินอะไรกันดี{ask} 🍜" },
    { role: "y", text: "ร้านส้มตำหน้าซอยไหม{ask} เมื่อวาน{I}เห็นคิวสั้นมาก" },
    { role: "x", text: "เอาเลย{end} เที่ยงตรงเจอกันข้างล่างนะ" },
  ] },
  { channel: "random", spot: "pantry", activity: "เล่าเรื่องวันหยุด", lines: [
    { role: "x", text: "{y} เสาร์อาทิตย์ไปไหนมา{ask}" },
    { role: "y", text: "นอนอยู่บ้านทั้งวันเลย{end} 😴 แล้ว{x}ล่ะ" },
    { role: "x", text: "ไปทะเลมา ยังเพลียไม่หายเลย 🏖️" },
    { role: "y", text: "อิจฉา! ไว้ทริปหน้าชวนด้วยนะ{ask}" },
  ] },
  { channel: "random", spot: "desk", activity: "บ่นรถติด", lines: [
    { role: "x", text: "รถติดมากเช้านี้ {I}มาสาย 20 นาที 😩" },
    { role: "y", text: "ฝนตกทีไรติดทุกที ลองนั่งรถไฟฟ้าดูไหม{ask}" },
    { role: "x", text: "ก็คิดอยู่{end} แต่สถานีไกลบ้านมาก" },
  ] },
  { channel: "random", spot: "pantry", activity: "ตามหากาแฟ", lines: [
    { role: "x", text: "ใครหยิบกาแฟ{I}ไป 😤 แก้วที่เขียนชื่อไว้" },
    { role: "y", text: "ขอโทษ{end}!! นึกว่าของ{I} เดี๋ยวซื้อคืนให้นะ{ask} 😅" },
    { role: "x", text: "เอาลาเต้หวานน้อยนะ 😏" },
  ] },
  { channel: "random", spot: "lounge", activity: "คุยเรื่องบอล", lines: [
    { role: "x", text: "เมื่อคืนดูบอลไหม{ask} ⚽" },
    { role: "y", text: "ดู{end} เสียดายมาก เกือบเสมอแล้วแท้ๆ" },
    { role: "z", text: "ไม่ต้องพูดถึงเลย {I}เสียพนันข้าวมันไก่ไปสามจาน 😭" },
  ] },
  { channel: "random", spot: "pantry", activity: "นัดออกกำลังกาย", lines: [
    { role: "x", text: "ช่วงนี้งานเยอะจนไม่ได้ออกกำลังกายเลย" },
    { role: "y", text: "ไปวิ่งสวนกันหลังเลิกงานไหม{ask}" },
    { role: "x", text: "ได้{end} แต่วิ่งช้าๆ นะ 😅" },
  ] },
  { channel: "random", spot: "pantry", activity: "เม้าท์เรื่อง CEO", lines: [
    { role: "x", text: "ได้ยินว่า CEO ชอบกาแฟดำ จริงไหม{ask} ☕" },
    { role: "y", text: "ไม่รู้สิ แต่เมื่อเช้า{I}เห็นถือชาเย็นนะ" },
    { role: "x", text: "ข่าววงในไม่แม่นเลย 😂" },
  ] },
  { channel: "random", spot: "desk", activity: "หาเสื้อกันหนาว", lines: [
    { role: "x", text: "แอร์ตรงโต๊ะ{I}หนาวมาก ใครมีเสื้อคลุมเหลือไหม{ask} 🥶" },
    { role: "y", text: "{I}มีผ้าห่มอยู่ในลิ้นชัก เอาไปใช้ก่อนได้{end}" },
    { role: "x", text: "ขอบคุณมาก{end} 🙏" },
  ] },
  { channel: "general", spot: "pantry", activity: "วางแผนวันเกิด", lines: [
    { role: "x", text: "วันศุกร์นี้วันเกิดใครนะ{ask} 🎂" },
    { role: "y", text: "ของ{z}ไม่ใช่เหรอ" },
    { role: "z", text: "โดนจับได้ซะแล้ว 😅 เดี๋ยว{I}สั่งเค้กมาให้ทุกคน" },
  ] },
  { channel: "general", spot: "desk", activity: "ช่วยกันตรวจงาน", lines: [
    { role: "x", text: "{y} ช่วยดูเอกสารให้หน่อยได้ไหม{ask} ไม่แน่ใจว่าตัวเลขถูก" },
    { role: "y", text: "ได้{end} ส่งมาเลย เดี๋ยวดูให้ก่อนเที่ยง" },
    { role: "x", text: "ขอบคุณ{end} 🙏" },
  ] },
  { channel: "general", spot: "desk", activity: "เตือนเรื่องอีเมลหลอก", lines: [
    { role: "sec", text: "วันนี้มีอีเมลหลอกให้รีเซ็ตรหัสผ่านเข้ามาอีกแล้ว{end} อย่ากดนะ{ask}" },
    { role: "pm", text: "{I}ก็ได้ หน้าตาเหมือนของจริงมากเลย" },
    { role: "sec", text: "นั่นแหละ{end} ถ้าไม่แน่ใจส่งมาให้{I}ดูก่อนนะ{ask} 🛡️" },
  ] },
  { channel: "general", spot: "meeting", activity: "ลุ้นยอดขาย", lines: [
    { role: "sales", text: "เดือนนี้ยอดใกล้เป้าแล้วนะ{ask} 📈" },
    { role: "pm", text: "เก่งมาก{end} อีกนิดเดียว" },
    { role: "sales", text: "ถ้าถึงเป้า ขอเลี้ยงหมูกระทะทั้งทีมนะ{ask} 😆" },
    { role: "pm", text: "ถ้าถึงจริง {I}ออกให้ครึ่งหนึ่งเลย" },
  ] },
  { channel: "general", spot: "desk", activity: "ส่งงานชิ้นแรก", lines: [
    { role: "intern", text: "พี่{pm} {I}ทำรายงานเสร็จแล้ว ส่งทางไหนดี{ask}" },
    { role: "pm", text: "ส่งในแชทนี้ได้เลย{end} เดี๋ยวดูให้" },
    { role: "intern", text: "ส่งแล้ว{end}! ตื่นเต้นมาก 🐣" },
  ] },
];

// A short exchange between employees, or null when the team cannot cast one.
export function chatterConversation(
  staff: Employee[],
  mood: (e: Employee) => string,
): { posts: DraftMessage[]; presence: Partial<PresenceMap> } | null {
  for (let tries = 0; tries < 5; tries++) {
    const convo = CONVOS[Math.floor(Math.random() * CONVOS.length)];
    const cast: Record<string, Employee> = {};
    const used = new Set<string>();
    const roles = [...new Set(convo.lines.map((l) => l.role))];
    // Named parts first, then "x", "y", "z" from whoever is left.
    for (const role of roles.filter((r) => !["x", "y", "z"].includes(r))) {
      const person = staff.find((e) => !used.has(e.id) && (e.roleKey === role || roleCovers(e.roleKey, role)));
      if (person) {
        cast[role] = person;
        used.add(person.id);
      }
    }
    const rest = staff.filter((e) => !used.has(e.id)).sort(() => Math.random() - 0.5);
    for (const role of roles.filter((r) => ["x", "y", "z"].includes(r))) {
      const person = rest.shift();
      if (person) cast[role] = person;
    }
    if (roles.some((r) => !cast[r])) continue;
    const names = (text: string) => text.replace(/\{([xyz])\}/g, (_, k: string) => cast[k].name);
    const posts: DraftMessage[] = [];
    for (const line of convo.lines) {
      const speaker = cast[line.role];
      const text = renderText(names(line.text), staff, speaker);
      if (text === null) break;
      posts.push({ channel: convo.channel, author: speaker.id, text, kind: "chat" });
    }
    if (posts.length < convo.lines.length) continue;
    const presence: Partial<PresenceMap> = {};
    for (const person of Object.values(cast)) presence[person.id] = { spot: convo.spot, activity: convo.activity, mood: mood(person) };
    return { posts, presence };
  }
  return null;
}

// A nudge from whoever is waiting on a ticket, sent once at half time.
export function reminderLine(staff: Employee[], fromId: string, subject: string, channel: string): DraftMessage | null {
  const person = staff.find((e) => e.id === fromId);
  if (!person) return null;
  const text = renderText(`CEO เรื่อง "${subject}" ยังรออยู่นะ{ask} ⏳`, staff, person) ?? "";
  return { channel, author: person.id, text, kind: "chat" };
}

export function sadLine(staff: Employee[], fromId: string): DraftMessage | null {
  const person = staff.find((e) => e.id === fromId);
  if (!person) return null;
  return { channel: `dm-${person.id}`, author: person.id, text: renderText("ไม่เป็นไร{end}... เข้าใจว่า CEO ยุ่ง", staff, person) ?? "", kind: "chat" };
}

