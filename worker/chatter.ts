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

