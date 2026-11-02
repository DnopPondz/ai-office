import type { Archetype, RoleKey } from "../shared/types";

// The role catalog. Every role covers zero or more archetypes (the six job functions scripts
// and game rules are written against): IT Support covers both security and operations, a
// branch manager covers "pm", a chef covers none but drives a restaurant's KPI.

export interface RoleDef {
  title: string;
  emoji: string;
  archetypes: Archetype[];
  // Baht per month before the business's salary scale.
  salary: number;
  startLevel: number;
  personalities: string[];
  secretGoals: string[];
}

export const ARCHETYPES: Archetype[] = ["dev", "sec", "sales", "ops", "intern", "pm"];

export const ROLES: Record<RoleKey, RoleDef> = {
  dev: {
    title: "Senior Dev",
    emoji: "👨‍💻",
    archetypes: ["dev"],
    salary: 65000,
    startLevel: 2,
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
    archetypes: ["sec"],
    salary: 70000,
    startLevel: 2,
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
    archetypes: ["sales"],
    salary: 40000,
    startLevel: 1,
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
    archetypes: ["ops"],
    salary: 55000,
    startLevel: 2,
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
    archetypes: ["intern"],
    salary: 12000,
    startLevel: 1,
    personalities: [
      "กระตือรือร้น ซื่อ กดทุกอย่าง ถามเยอะ บางทีทำพังโดยไม่ตั้งใจ",
      "เงียบๆ แต่เก่งเกินตำแหน่ง แอบแก้ปัญหาที่คนอื่นไม่กล้าแตะ",
      "ติดโซเชียล อยากโพสต์ทุกอย่างที่เกิดในที่ทำงาน",
    ],
    secretGoals: ["อยากได้บรรจุเป็นพนักงานประจำ พยายามทำตัวให้เด่น", "อยากเป็น influencer"],
  },
  pm: {
    title: "Product Manager",
    emoji: "📋",
    archetypes: ["pm"],
    salary: 60000,
    startLevel: 2,
    personalities: [
      "สุภาพต่อหน้า การเมืองเก่ง ชอบโยนความผิดอย่างแนบเนียน",
      "คลั่งแผนงาน เขียนเอกสารทุกเรื่อง ประชุมบ่อยมาก",
      "ขี้เกรงใจ รับปากทุกคน จนงานล้นทีม",
    ],
    secretGoals: ["อยากเป็น CEO แทน กำลังเก็บหลักฐานความผิดพลาดของ CEO", "อยากย้ายไปบริษัทใหญ่ กำลังสร้างผลงานไว้ใส่ portfolio"],
  },
  itsupport: {
    title: "IT Support",
    emoji: "🖥️",
    archetypes: ["sec", "ops"],
    salary: 40000,
    startLevel: 2,
    personalities: [
      "ทำทุกอย่างคนเดียวตั้งแต่ต่อปริ้นเตอร์ยันดูแลไฟร์วอลล์ ชอบบ่นว่าไม่มีใครเห็นค่า",
      "ใจเย็น ชอบเขียนคู่มือแปะไว้ทุกเครื่อง เตือนเรื่องรหัสผ่านไม่หยุด",
      "รู้เรื่องคอมพิวเตอร์มากที่สุดในบริษัท แต่อธิบายเป็นภาษาคนไม่เก่ง",
    ],
    secretGoals: ["อยากได้ผู้ช่วยสักคน งานล้นมือ", "แอบเรียนสอบใบเซอร์ด้าน security อยากย้ายสายไปเป็น Security Engineer"],
  },
  cs: {
    title: "Customer Support",
    emoji: "🎧",
    archetypes: [],
    salary: 30000,
    startLevel: 1,
    personalities: ["ใจดีกับลูกค้ามาก แต่ระบายใส่เพื่อนร่วมงานแทน", "ตอบไว จำลูกค้าได้ทุกคน รู้ปัญหาก่อนใคร"],
    secretGoals: ["อยากย้ายไปทีมพัฒนาผลิตภัณฑ์", "เบื่อลูกค้าขี้วีน กำลังคิดลาออก"],
  },
  designer: {
    title: "Designer",
    emoji: "🎨",
    archetypes: [],
    salary: 45000,
    startLevel: 2,
    personalities: ["ละเอียดเรื่องสีและฟอนต์ ทะเลาะกับฝ่ายขายเรื่องแบนเนอร์ประจำ", "ไอเดียเยอะ ส่งงานช้าแต่สวย"],
    secretGoals: ["อยากรีแบรนด์บริษัททั้งหมด", "รับงานฟรีแลนซ์ข้างนอกเงียบๆ"],
  },
  compliance: {
    title: "Compliance Officer",
    emoji: "⚖️",
    archetypes: [],
    salary: 70000,
    startLevel: 2,
    personalities: ["เคร่งกฎทุกตัวอักษร ทุกเรื่องต้องมีเอกสาร", "สุขุม อธิบายกฎเกณฑ์เป็นภาษาคนได้ดี"],
    secretGoals: ["อยากให้ทุกคนผ่านการอบรมก่อนสิ้นปี", "กลัวโดนลงโทษจากหน่วยงานกำกับ เก็บหลักฐานไว้ป้องกันตัว"],
  },
  chef: {
    title: "หัวหน้าเชฟ",
    emoji: "👨‍🍳",
    archetypes: [],
    salary: 50000,
    startLevel: 2,
    personalities: ["อารมณ์ร้อนในครัว แต่ใจดีนอกครัว หวงสูตรมาก", "ทดลองเมนูใหม่ตลอด บ่นเรื่องต้นทุนวัตถุดิบทุกวัน"],
    secretGoals: ["อยากเปิดร้านของตัวเอง", "อยากให้ร้านได้ขึ้นมิชลินไกด์"],
  },
  branchmgr: {
    title: "ผู้จัดการสาขา",
    emoji: "🏪",
    archetypes: ["pm"],
    salary: 45000,
    startLevel: 2,
    personalities: ["คุมคนเก่ง รู้ทุกเรื่องในร้าน แต่เหนื่อยจนหมดแรง", "เน้นตัวเลข ชอบเทียบยอดกับสาขาอื่น"],
    secretGoals: ["อยากคุมหลายสาขา", "อยากได้วันหยุดเสาร์อาทิตย์บ้าง"],
  },
  accountant: {
    title: "ฝ่ายบัญชี",
    emoji: "🧾",
    archetypes: [],
    salary: 40000,
    startLevel: 2,
    personalities: ["ละเอียด ถามหาใบเสร็จทุกบาท", "ขี้กังวลเรื่องเงินสด เตือนเรื่องกระแสเงินสดตลอด"],
    secretGoals: ["อยากให้บริษัทเปลี่ยนไปใช้ระบบบัญชีใหม่", "แอบกังวลว่าบริษัทจะเจ๊ง กำลังหางานสำรอง"],
  },
  dentist: {
    title: "ทันตแพทย์",
    emoji: "🦷",
    archetypes: [],
    salary: 90000,
    startLevel: 2,
    personalities: ["มือดี คนไข้รัก แต่ไม่ชอบงานเอกสาร", "เป๊ะเรื่องความสะอาดและมาตรฐาน"],
    secretGoals: ["อยากเปิดคลินิกของตัวเอง", "อยากได้เครื่องมือรุ่นใหม่"],
  },
  nurse: {
    title: "ผู้ช่วยทันตแพทย์",
    emoji: "🩺",
    archetypes: [],
    salary: 25000,
    startLevel: 1,
    personalities: ["ขยัน ใส่ใจคนไข้ เป็นคนกลางระหว่างหมอกับเคาน์เตอร์", "ช่างสังเกต รู้ทุกข่าวในคลินิก"],
    secretGoals: ["อยากเรียนต่อ", "อยากได้คนเพิ่มเข้าเวร"],
  },
  receptionist: {
    title: "เคาน์เตอร์ต้อนรับ",
    emoji: "🛎️",
    archetypes: ["sales"],
    salary: 22000,
    startLevel: 1,
    personalities: ["ยิ้มเก่ง จำชื่อลูกค้าได้หมด ชอบเม้าท์", "จัดคิวเก่ง แต่เครียดง่ายเวลาคนเยอะ"],
    secretGoals: ["อยากได้ค่าคอมจากการขายแพ็กเกจ", "อยากย้ายไปทำการตลาด"],
  },
  housekeeping: {
    title: "หัวหน้าแม่บ้าน",
    emoji: "🧹",
    archetypes: [],
    salary: 28000,
    startLevel: 2,
    personalities: ["มาตรฐานสูง ห้องต้องเนี้ยบทุกห้อง", "ดูแลลูกทีมเหมือนครอบครัว"],
    secretGoals: ["อยากให้ขึ้นค่าแรงลูกทีม", "อยากได้อุปกรณ์ทำความสะอาดใหม่"],
  },
  engineer: {
    title: "วิศวกรการผลิต",
    emoji: "🔧",
    archetypes: [],
    salary: 55000,
    startLevel: 2,
    personalities: ["แก้เครื่องจักรเก่ง พูดน้อย ทำมาก", "ชอบปรับปรุงกระบวนการ อยากใส่ระบบอัตโนมัติทุกจุด"],
    secretGoals: ["อยากได้งบซื้อเครื่องจักรใหม่", "ถูกบริษัทคู่แข่งทาบทาม"],
  },
  linelead: {
    title: "หัวหน้าไลน์ผลิต",
    emoji: "🏭",
    archetypes: ["pm"],
    salary: 35000,
    startLevel: 2,
    personalities: ["เสียงดัง คุมคนงานอยู่ ไม่ยอมให้ไลน์หยุด", "รักลูกน้อง ปกป้องคนงานเสมอ"],
    secretGoals: ["อยากได้โบนัสให้คนงาน", "อยากเป็นผู้จัดการโรงงาน"],
  },
  purchaser: {
    title: "ฝ่ายจัดซื้อ",
    emoji: "📦",
    archetypes: [],
    salary: 38000,
    startLevel: 2,
    personalities: ["ต่อราคาเก่ง สนิทกับซัพพลายเออร์ทุกเจ้า", "ระวังทุกบาท ไม่ชอบเปลี่ยนเจ้า"],
    secretGoals: ["แอบรับของขวัญจากซัพพลายเออร์เจ้าประจำ", "อยากลดต้นทุนให้ได้ 10% ในปีนี้"],
  },
  safety: {
    title: "เจ้าหน้าที่ความปลอดภัย",
    emoji: "🦺",
    archetypes: [],
    salary: 35000,
    startLevel: 2,
    personalities: ["เคร่งเรื่องหมวกนิรภัยและป้ายเตือน", "ทำตามกฎหมายแรงงานเป๊ะ ไม่ยอมให้ใครลัดขั้นตอน"],
    secretGoals: ["อยากให้โรงงานได้รางวัลความปลอดภัย", "กังวลว่าจะเกิดอุบัติเหตุใหญ่"],
  },
  dispatcher: {
    title: "ผู้ควบคุมการจัดส่ง",
    emoji: "🗺️",
    archetypes: [],
    salary: 32000,
    startLevel: 2,
    personalities: ["คุมไรเดอร์ผ่านวิทยุทั้งวัน เสียงดัง ตัดสินใจไว", "จำเส้นทางได้หมดทั้งเมือง"],
    secretGoals: ["อยากได้ระบบจัดเส้นทางใหม่", "ไรเดอร์หลายคนเป็นญาติ อยากให้ได้ค่ารอบเพิ่ม"],
  },
  warehouse: {
    title: "หัวหน้าคลังสินค้า",
    emoji: "🏷️",
    archetypes: [],
    salary: 30000,
    startLevel: 2,
    personalities: ["นับสต็อกแม่น ไม่ชอบให้ใครยุ่งกับคลัง", "เร่งงานเก่งช่วงเซล แต่บ่นทุกครั้ง"],
    secretGoals: ["อยากได้รถยกใหม่", "อยากให้จ้างคนเพิ่มช่วงเซล"],
  },
  agronomist: {
    title: "นักวิชาการเกษตร",
    emoji: "🌱",
    archetypes: [],
    salary: 35000,
    startLevel: 2,
    personalities: ["รู้จักชาวสวนทุกคน คุยภาษาเกษตรกรเก่ง", "เชื่อข้อมูลเซนเซอร์มากกว่าประสบการณ์"],
    secretGoals: ["อยากทำงานวิจัยตีพิมพ์", "อยากมีแปลงทดลองของตัวเอง"],
  },
  tutor: {
    title: "หัวหน้าติวเตอร์",
    emoji: "📚",
    archetypes: [],
    salary: 40000,
    startLevel: 2,
    personalities: ["สอนสนุก นักเรียนรัก แต่ไม่ถนัดเทคโนโลยี", "เข้มงวดเรื่องคุณภาพเนื้อหา"],
    secretGoals: ["อยากเปิดคอร์สของตัวเองบน YouTube", "อยากได้ส่วนแบ่งยอดขายคอร์ส"],
  },
  trainer: {
    title: "หัวหน้าเทรนเนอร์",
    emoji: "🏋️",
    archetypes: [],
    salary: 38000,
    startLevel: 2,
    personalities: ["พลังเยอะ ชอบท้าทุกคนออกกำลังกาย", "ใส่ใจสมาชิกรายคน จำโปรแกรมของทุกคนได้"],
    secretGoals: ["อยากเป็น influencer สายฟิตเนส", "อยากได้ส่วนแบ่งจากคลาสพิเศษ"],
  },
  reporter: {
    title: "นักข่าว",
    emoji: "🎤",
    archetypes: [],
    salary: 35000,
    startLevel: 1,
    personalities: ["ไวต่อกระแส อยากได้ข่าวเอ็กซ์คลูซีฟ", "ระวังเรื่องความถูกต้อง ไม่ชอบพาดหัวเกินจริง"],
    secretGoals: ["อยากได้รางวัลข่าวยอดเยี่ยม", "ถูกสำนักข่าวใหญ่ทาบทาม"],
  },
  adjuster: {
    title: "เจ้าหน้าที่สินไหม",
    emoji: "🧮",
    archetypes: [],
    salary: 40000,
    startLevel: 2,
    personalities: ["จับพิรุธเคลมปลอมเก่ง", "ใจอ่อนกับลูกค้าที่เดือดร้อน"],
    secretGoals: ["อยากได้โบนัสตามยอดเคลมปลอมที่จับได้", "เบื่องานเอกสาร อยากย้ายไปฝ่ายขาย"],
  },
  technician: {
    title: "ช่างอาคาร",
    emoji: "🛠️",
    archetypes: [],
    salary: 25000,
    startLevel: 2,
    personalities: ["ซ่อมได้ทุกอย่าง แต่ชอบหายตัวตอนถูกเรียก", "ทำงานเรียบร้อย แต่บ่นเรื่องอะไหล่ราคาแพง"],
    secretGoals: ["อยากได้มอเตอร์ไซค์ของบริษัท", "รับงานซ่อมห้องลูกบ้านเป็นงานเสริม"],
  },
  artist: {
    title: "Game Artist",
    emoji: "🖌️",
    archetypes: [],
    salary: 45000,
    startLevel: 2,
    personalities: ["วาดเก่ง ส่งงานช้า เถียงเรื่อง art direction", "ชอบซ่อน easter egg ไว้ในเกม"],
    secretGoals: ["อยากทำเกมของตัวเอง", "อยากได้ชื่อขึ้นเครดิตในเกม"],
  },
};

export function roleCovers(role: RoleKey, token: string): boolean {
  return role === token || (ROLES[role]?.archetypes as string[] | undefined)?.includes(token) === true;
}

export function isRoleToken(value: string): boolean {
  return value in ROLES || (ARCHETYPES as string[]).includes(value);
}
