import type { DecisionOption, Employee, OfficeSpot, OpenRisk, Presence, RoleKey, StatKey, Stats } from "../shared/types";
import { STAT_KEYS } from "../shared/types";
import type { DraftMessage, PresenceMap, Scene } from "./game";
import { holder, isRoleKey, renderText } from "./roster";

// Hand-written scenes that cost no AI: every quiet office day, and breach or regression turns
// once the daily AI budget is spent. Each option carries its own reactions, so the decision
// that follows needs no AI either.
//
// Lines are written by role and cast onto the company's staff: {dev}, {sec}, {sales}, {ops},
// {intern} and {pm} become names; {I}, {end} and {ask} follow the speaker's own speech
// (ผม/เรา/own name, ครับ/ค่ะ/none, ครับ/คะ/none). "นะ{ask}" gives นะครับ, นะคะ or นะ.

type LineChannel = "general" | "dev" | "random" | "dm";

interface Line {
  role: RoleKey;
  channel: LineChannel;
  text: string;
}

interface ScriptedOption {
  label: string;
  effects: Partial<Stats>;
  reactions: Line[];
}

export interface ScriptedScene {
  lines: Line[];
  presence: Partial<Record<RoleKey, Presence>>;
  prompt: string;
  options: ScriptedOption[];
}

interface QuietScript extends ScriptedScene {
  id: string;
  // Business-specific scenes only appear for that business type.
  business?: string;
}

const at = (spot: OfficeSpot, activity: string, mood: string): Presence => ({ spot, activity, mood });
const say = (role: RoleKey, channel: LineChannel, text: string): Line => ({ role, channel, text });

const QUIET_SCRIPTS: QuietScript[] = [
  {
    id: "ops-raise",
    lines: [
      say("ops", "dev", "เมื่อคืนโดนปลุกไปแก้ server อีกแล้ว รอบที่สามของอาทิตย์นี้"),
      say("dev", "dev", "alert มันดังทุกเรื่องอะ ต้องจูนใหม่จริงๆ"),
      say("intern", "random", "พี่{ops}เก่งมากเลย{end} เห็น commit ตอนตีสี่ 😮"),
      say("ops", "dm", "CEO มีเวลาคุยเรื่องเงินเดือนไหม{ask} ทำงานแบบนี้มาปีกว่าแล้ว ยังไม่เคยปรับเลย"),
      say("pm", "general", "ช่วงนี้งบตึงนะ{ask}ทุกคน {I}แค่อยากเตือนไว้เฉยๆ 😊"),
    ],
    presence: { ops: at("ceo", "ขอคุยเรื่องเงินเดือน", "😮‍💨"), pm: at("pantry", "จิบกาแฟฟังเงียบๆ", "🙂") },
    prompt: "{ops}ขอปรับเงินเดือน จะตอบยังไง",
    options: [
      {
        label: "ปรับเงินเดือนให้{ops}ทันที",
        effects: { cash: -12, morale: 12 },
        reactions: [
          say("ops", "dm", "ขอบคุณจริงๆ{end} ไม่คิดว่าจะได้ เดี๋ยวคืนนี้ไปจูน alert ให้เอง"),
          say("sales", "general", "แล้วทีมขายล่ะ ปรับด้วยไหม{ask} 👀"),
        ],
      },
      {
        label: "ให้วันหยุดพิเศษ 3 วันแทน",
        effects: { morale: 6, uptime: -5 },
        reactions: [
          say("ops", "dm", "ก็ดี{end} ได้พักบ้าง แต่ใครจะเฝ้าระบบตอนไม่อยู่"),
          say("dev", "dev", "อย่ามองมาทางนี้นะ{ask}"),
        ],
      },
      {
        label: "ขอให้รอรอบประเมินปลายปี",
        effects: { morale: -10, cash: 2 },
        reactions: [
          say("ops", "dm", "รับทราบ{end}"),
          say("pm", "dm", "CEO ตัดสินใจรอบคอบดี{end} แต่ช่วงนี้{ops}ดูเงียบๆ ไปนะ{ask} {I}แค่สังเกตเฉยๆ"),
        ],
      },
    ],
  },
  {
    id: "sales-promise",
    lines: [
      say("sales", "general", "ข่าวดีทุกคน! ลูกค้ารายใหญ่จะเซ็นสัญญาแล้ว ถ้าเรามีระบบ export รายงานภายในวันศุกร์ 🚀"),
      say("dev", "dev", "ระบบ export ไหน{ask} เรายังไม่มีนะ"),
      say("sales", "dev", "ก็ทำสิ{end} {I}รับปากไปแล้ว ง่ายๆ แค่ปุ่มเดียวเอง"),
      say("sec", "dev", "ถ้ารีบทำ อย่าลืมเช็คสิทธิ์การเข้าถึงข้อมูลด้วยนะ{ask} ไม่งั้นลูกค้า A เห็นข้อมูลลูกค้า B 😰"),
      say("pm", "dm", "{I}ไม่ได้อยู่ในห้องตอน{sales}รับปากนะ{ask} เผื่อ CEO อยากรู้"),
    ],
    presence: { sales: at("ceo", "ขายฝันให้ CEO", "🤩"), dev: at("desk", "ถอนหายใจใส่จอ", "🙄") },
    prompt: "{sales}รับปากลูกค้าเรื่องฟีเจอร์ที่ยังไม่มี จะทำยังไง",
    options: [
      {
        label: "ให้ทีมเร่งทำให้ทันวันศุกร์",
        effects: { cash: 10, reputation: 6, morale: -12 },
        reactions: [
          say("sales", "general", "เยี่ยม! {I}จะไปบอกลูกค้าเลยว่าเรียบร้อย 💼"),
          say("dev", "dev", "เสาร์อาทิตย์นี้ก็ลาก่อน{end}"),
        ],
      },
      {
        label: "บอกลูกค้าตรงๆ ว่าขอเลื่อน 2 สัปดาห์",
        effects: { reputation: -6, morale: 6 },
        reactions: [
          say("sales", "dm", "ถ้าดีลหลุด อย่าหาว่าไม่เตือนนะ{ask}"),
          say("sec", "dev", "ดี{end} จะได้มีเวลาทำเรื่องสิทธิ์ให้ถูก 🛡️"),
        ],
      },
      {
        label: "ทำเวอร์ชันง่ายๆ ส่งไปก่อน ค่อยเก็บงานทีหลัง",
        effects: { cash: 6, security: -6 },
        reactions: [
          say("dev", "dev", "ได้{end} แต่ 'ค่อยเก็บงานทีหลัง' ไม่เคยเกิดขึ้นจริงสักครั้งนะ"),
          say("sec", "dev", "จดไว้ก่อนนะ{ask}ว่าเป็นหนี้ทางเทคนิค 📝"),
        ],
      },
    ],
  },
  {
    id: "intern-staging",
    lines: [
      say("intern", "dev", "พี่ๆ {I}กดลบ database ที่ชื่อ staging-old ไป{end} คิดว่าไม่มีใครใช้แล้ว 😅"),
      say("dev", "dev", "อันนั้นคือ staging ที่ทุกคนใช้อยู่ ชื่อมันหลอก"),
      say("ops", "dev", "backup ล่าสุดเมื่อวาน กู้ได้ แต่ข้อมูลทดสอบหายไปหนึ่งวัน"),
      say("intern", "dm", "CEO {I}ขอโทษจริงๆ{end} จะไม่ทำอีกแล้ว 🙏"),
      say("pm", "general", "{I}ว่าเราควรมีกระบวนการที่ชัดเจนกว่านี้นะ{ask} ใครเป็นคนให้สิทธิ์{intern}"),
    ],
    presence: { intern: at("ceo", "ขอโทษ CEO", "😰"), ops: at("server", "กู้ backup", "😵"), dev: at("desk", "หัวเราะในใจ", "😏") },
    prompt: "{intern}ลบ database staging โดยไม่ตั้งใจ จะจัดการยังไง",
    options: [
      {
        label: "ทำ post-mortem แบบไม่โทษใคร แล้วแก้ชื่อระบบให้ชัด",
        effects: { morale: 6, uptime: -3 },
        reactions: [
          say("intern", "dev", "ขอบคุณ{end} {I}เขียนสรุปเหตุการณ์เองเลย ✍️"),
          say("sec", "dev", "เพิ่มเรื่องสิทธิ์ลบ database ใน checklist ด้วยนะ{ask}"),
        ],
      },
      {
        label: "ถอนสิทธิ์ลบของ intern ทั้งหมด",
        effects: { security: 8, morale: -6 },
        reactions: [
          say("intern", "dm", "เข้าใจ{end}... {I}จะพิสูจน์ตัวเองใหม่"),
          say("sec", "general", "least privilege ทุกคน ดีมาก{end} 🛡️"),
        ],
      },
      {
        label: "ให้{dev}เป็นพี่เลี้ยง{intern}หนึ่งเดือน",
        effects: { security: 4, uptime: 3, morale: -4 },
        reactions: [
          say("dev", "dev", "ได้{end}... เริ่มพรุ่งนี้ วันนี้ขอทำงานตัวเองก่อน"),
          say("intern", "dev", "เย้ พี่{dev}จะสอน{I}! 🐣"),
        ],
      },
    ],
  },
  {
    id: "pm-roadmap",
    lines: [
      say("pm", "general", "{I}ร่าง roadmap ไตรมาสหน้าเสร็จแล้วนะ{ask} มี 12 ฟีเจอร์ ทุกอย่างลูกค้าขอมาหมดเลย 📋"),
      say("dev", "dev", "12 ฟีเจอร์ คนทำมีสองคน"),
      say("sales", "general", "{I}ชอบ! ขายได้ทุกข้อ{end}"),
      say("ops", "dev", "ใน roadmap ไม่มีเรื่องอัปเกรดระบบเลยนะ"),
      say("pm", "dm", "ถ้า roadmap ไม่สำเร็จ {I}คิดว่าน่าจะเป็นเพราะ dev ประเมินงานไม่แม่นนะ{ask} บอกไว้ก่อนเฉยๆ"),
    ],
    presence: { pm: at("meeting", "นำเสนอ roadmap", "😊"), dev: at("meeting", "นับนิ้ว", "🙄"), sales: at("meeting", "ปรบมือ", "🤩") },
    prompt: "roadmap ของ{pm}มี 12 ฟีเจอร์ จะอนุมัติไหม",
    options: [
      {
        label: "อนุมัติทั้งหมดตามที่{pm}เสนอ",
        effects: { reputation: 8, cash: -6, morale: -8 },
        reactions: [
          say("pm", "general", "ขอบคุณ{end} CEO {I}จะติดตามความคืบหน้าทุกวันนะ{ask} 😊"),
          say("ops", "dev", "งั้นเรื่องอัปเกรดระบบก็ปีหน้าละกัน"),
        ],
      },
      {
        label: "ให้ dev ประเมินงานก่อน แล้วเลือกแค่ 4 ข้อ",
        effects: { morale: 6, reputation: -3 },
        reactions: [
          say("dev", "dev", "ในที่สุดก็มีคนถามคนทำ{end}"),
          say("pm", "dm", "{I}เคารพการตัดสินใจ{end} แต่ลูกค้าบางรายอาจผิดหวังนะ{ask}"),
        ],
      },
      {
        label: "เอาฟีเจอร์ลูกค้า 3 ข้อ บวกงานอัปเกรดระบบ",
        effects: { uptime: 6, security: 4, reputation: -4 },
        reactions: [
          say("ops", "dev", "ขอบคุณ{end} จะได้ไม่ต้องโดนปลุกตอนตีสาม"),
          say("sales", "general", "แล้ว{I}จะขายอะไรล่ะไตรมาสนี้ 😩"),
        ],
      },
    ],
  },
  {
    id: "sec-training",
    lines: [
      say("sec", "general", "ทุกคน เมื่อวานมีอีเมลปลอมแอบอ้างเป็น CEO ส่งมาขอให้โอนเงิน มีคนกดลิงก์ไปสองคน{end} 😱"),
      say("sales", "random", "ใครกดอะ... (ไม่ใช่{I}นะ)"),
      say("intern", "random", "{I}กดเอง{end} แต่ไม่ได้ใส่รหัสนะ! น่าจะไม่ได้ใส่..."),
      say("sec", "dm", "CEO {I}ขอซื้อคอร์ส security awareness ให้ทุกคนได้ไหม{ask} รอบนี้รอดเพราะโชคช่วยจริงๆ"),
      say("dev", "dev", "คอร์สออนไลน์แบบกดข้ามได้ใช่ไหม ถ้าใช่ก็ได้"),
    ],
    presence: { sec: at("ceo", "ของบอบรม", "🚨"), intern: at("desk", "เปลี่ยนรหัสผ่าน", "😰") },
    prompt: "มีอีเมล phishing หลุดเข้ามา จะลงทุนเรื่องการอบรมแค่ไหน",
    options: [
      {
        label: "ซื้อคอร์สอบรมให้ทุกคน พร้อมทดสอบ phishing รายไตรมาส",
        effects: { security: 12, cash: -10 },
        reactions: [
          say("sec", "general", "ขอบคุณ{end} CEO 🛡️ ใครไม่ผ่านต้องสอบใหม่นะ{ask}"),
          say("dev", "dev", "กดข้ามไม่ได้ด้วยเหรอ"),
        ],
      },
      {
        label: "ให้{sec}ทำ phishing test เองแบบไม่บอกล่วงหน้า",
        effects: { security: 6, morale: -6 },
        reactions: [
          say("sec", "dev", "จะทำให้แนบเนียนที่สุดเลย{end} 😈"),
          say("sales", "general", "ตอนนี้{I}ไม่กล้าเปิดอีเมลไหนแล้ว ลูกค้าส่งมาก็ไม่กล้าเปิด"),
        ],
      },
      {
        label: "ส่งอีเมลเตือนทุกคนพอ ไว้ไตรมาสหน้าค่อยว่ากัน",
        effects: { cash: 3, security: -5 },
        reactions: [
          say("sec", "dm", "บอกแล้วนะ{ask} ถ้ารอบหน้ามีคนโอนเงินจริง อย่าว่า{I}ไม่เตือน 😤"),
          say("pm", "general", "{I}จดไว้แล้วว่าเรื่องนี้ตัดสินใจวันไหน{end}"),
        ],
      },
    ],
  },
  {
    id: "dev-refactor",
    lines: [
      say("dev", "dev", "โค้ดส่วน payment ไม่มีใครกล้าแตะแล้ว มี comment ว่า 'อย่าลบบรรทัดนี้ ไม่รู้ทำไมแต่ลบแล้วพัง'"),
      say("intern", "dev", "{I}ลบไปเมื่อวาน{end} แล้วก็ใส่คืนแล้ว 😅"),
      say("ops", "dev", "เพราะงั้นไงเมื่อวานบ่ายถึงล่มไป 10 นาที"),
      say("dev", "dm", "CEO ขอเวลา refactor ส่วนนี้หนึ่งสัปดาห์{end} ไม่ทำตอนนี้ วันหนึ่งมันพังจริงแน่"),
      say("sales", "general", "สัปดาห์นึงไม่มีฟีเจอร์ใหม่เลยเหรอ ลูกค้ารออยู่นะ{ask}"),
    ],
    presence: { dev: at("ceo", "ขอเวลา refactor", "😤"), intern: at("desk", "ทำตัวลีบ", "😰") },
    prompt: "{dev}ขอหยุดทำฟีเจอร์หนึ่งสัปดาห์เพื่อ refactor ระบบ payment",
    options: [
      {
        label: "ให้เต็มสัปดาห์",
        effects: { uptime: 8, morale: 6, cash: -8 },
        reactions: [
          say("dev", "dev", "จริงดิ โอเค{end} เริ่มเลย"),
          say("sales", "dm", "{I}จะบอกลูกค้าว่าเรากำลัง 'ยกระดับความเสถียร' ละกัน"),
        ],
      },
      {
        label: "ให้ทุกบ่ายวันศุกร์ไปเรื่อยๆ",
        effects: { uptime: 3, morale: 3, cash: -3 },
        reactions: [
          say("dev", "dev", "ก็ยังดี{end} แต่บ่ายวันศุกร์ใครจะมีแรง"),
          say("ops", "dev", "ขอให้ทันก่อนมันพังละกัน"),
        ],
      },
      {
        label: "ไม่อนุมัติ ลูกค้าต้องมาก่อน",
        effects: { cash: 4, morale: -8 },
        reactions: [
          say("dev", "dm", "ได้{end} แต่ถ้าพัง{I}จะชี้มาที่ข้อความนี้นะ"),
          say("sales", "general", "เยี่ยม! ลุยฟีเจอร์ใหม่กัน 💼"),
        ],
      },
    ],
  },
  {
    id: "layoff-rumor",
    lines: [
      say("intern", "random", "พี่ๆ ที่มุมกาแฟมีคนพูดกันว่าบริษัทจะเลิกจ้าง จริงไหม{ask} 😨"),
      say("ops", "random", "ได้ยินมาเหมือนกัน"),
      say("sales", "random", "ทีมขายไม่โดนใช่ไหม ทีมขายคือคนหาเงินนะ"),
      say("pm", "dm", "{I}ไม่รู้ว่าข่าวลือมาจากไหนนะ{ask} แต่ CEO ควรรีบชี้แจงก่อนคนเริ่มหางานใหม่"),
      say("dev", "dev", "ไม่ต้องห่วง ถ้าจะเลิกจ้างคงไม่เลิกจ้างคนเดียวที่รู้ว่า server อยู่ไหน"),
    ],
    presence: {
      intern: at("pantry", "ซุบซิบข่าวลือ", "😨"),
      ops: at("pantry", "ฟังข่าวลือ", "😮‍💨"),
      pm: at("ceo", "แนะนำ CEO", "😊"),
    },
    prompt: "มีข่าวลือเรื่องเลิกจ้างในออฟฟิศ จะทำยังไง",
    options: [
      {
        label: "เรียก all-hands ชี้แจงตัวเลขบริษัทตรงๆ",
        effects: { morale: 8, uptime: -3 },
        reactions: [
          say("intern", "general", "โล่งเลย{end} ขอบคุณ CEO 🙏"),
          say("pm", "dm", "เปิดเผยตัวเลขขนาดนั้นเลยเหรอ{ask} กล้าดี"),
        ],
      },
      {
        label: "ส่ง memo สั้นๆ ว่าไม่มีแผนเลิกจ้าง",
        effects: { morale: 3 },
        reactions: [
          say("ops", "random", "memo สั้นจัง ยิ่งน่าสงสัย"),
          say("sales", "random", "{I}เชื่อ CEO นะ (แต่ก็อัปเดตโปรไฟล์ไว้ก่อน)"),
        ],
      },
      {
        label: "เงียบไว้ เดี๋ยวข่าวลือก็หายไปเอง",
        effects: { morale: -10, reputation: -3 },
        reactions: [
          say("intern", "random", "CEO ไม่ตอบ... แสดงว่าจริงใช่ไหม{ask} 😭"),
          say("pm", "general", "{I}ว่าเราควรสื่อสารกันมากกว่านี้นะ{ask} ใครเห็นด้วยบ้าง"),
        ],
      },
    ],
  },
  {
    id: "oncall",
    lines: [
      say("ops", "dev", "เดือนนี้{I}เข้าเวร on-call คนเดียวทุกคืน 31 คืน"),
      say("dev", "dev", "ก็{ops}เก่งสุด"),
      say("sec", "dev", "ถ้า{ops}ป่วยขึ้นมา ไม่มีใครรู้วิธีกู้ระบบเลยนะ{ask} อันนี้คือความเสี่ยงจริงๆ 😰"),
      say("ops", "dm", "ขอแค่มีคนช่วยแบ่งเวร{end} ไม่งั้นคงไม่ไหวแล้ว"),
    ],
    presence: { ops: at("lounge", "หลับบนโซฟา", "😴"), sec: at("desk", "เขียน runbook", "😰") },
    prompt: "{ops}เข้าเวร on-call คนเดียวมาทั้งเดือน จะแก้ยังไง",
    options: [
      {
        label: "จ้าง DevOps part-time มาช่วย",
        effects: { cash: -12, morale: 8, uptime: 5 },
        reactions: [
          say("ops", "dm", "ขอบคุณมาก{end} คืนนี้จะได้นอน"),
          say("pm", "general", "งบส่วนนี้มาจากไหน{ask} {I}ถามเพื่อทำรายงานเฉยๆ"),
        ],
      },
      {
        label: "หมุนเวร on-call ให้ dev ทุกคน",
        effects: { morale: 2, uptime: -3, security: 3 },
        reactions: [
          say("dev", "dev", "เวร{I}วันไหน... วันศุกร์ไม่ได้นะ มีธุระ"),
          say("intern", "dev", "{I}อยากเข้าเวร{end}! สอนด้วยนะ{ask} 🐣"),
        ],
      },
      {
        label: "ซื้อระบบ monitoring ที่ลด alert ไร้สาระ",
        effects: { cash: -6, uptime: 6 },
        reactions: [
          say("ops", "dev", "อย่างน้อยไม่ต้องตื่นเพราะ disk เต็ม 80%"),
          say("sec", "dev", "แต่ยังไม่มีใครสำรอง{ops}อยู่ดีนะ{ask}"),
        ],
      },
    ],
  },
  {
    id: "questionnaire",
    lines: [
      say("sales", "general", "ลูกค้ารายใหญ่ส่งแบบสอบถาม security มา 200 ข้อ ต้องตอบภายในพรุ่งนี้!"),
      say("sales", "dev", "ตอบ 'มี' ทุกข้อไปเลยได้ไหม{ask} ข้อ 47 ถามว่ามี SOC ไหม เรามีใช่ไหม"),
      say("sec", "dev", "เราไม่มี{end} และถ้าตอบไม่จริงแล้วลูกค้ามาตรวจเจอ เรื่องจะใหญ่กว่าเสียดีลนะ{ask} 😱"),
      say("dev", "dev", "ข้อ 112 ถามว่ามีการทดสอบ backup ไหม... {ops} เราเคยทดสอบไหม"),
      say("ops", "dev", "เคย ตอนที่ database หายไปรอบที่แล้ว"),
      say("sales", "dm", "CEO ดีลนี้ใหญ่ที่สุดของปีเลยนะ{ask} ช่วยตัดสินใจทีว่าจะตอบยังไง"),
    ],
    presence: { sales: at("desk", "รีบกรอกแบบสอบถาม", "😅"), sec: at("desk", "อ่านทีละข้อ", "😰") },
    prompt: "ลูกค้าส่งแบบสอบถาม security มา จะตอบยังไง",
    options: [
      {
        label: "ตอบตามจริงทุกข้อ พร้อมแผนปรับปรุง",
        effects: { reputation: 5, cash: -4 },
        reactions: [
          say("sec", "general", "ดี{end} ลูกค้าส่วนใหญ่ชอบความตรงไปตรงมามากกว่านะ{ask}"),
          say("sales", "dm", "ถ้าดีลหลุด {I}จะอ้างอิงข้อความนี้นะ"),
        ],
      },
      {
        label: "ตอบให้ดูดีที่สุดก่อน แล้วค่อยทำให้จริงทีหลัง",
        effects: { cash: 12, reputation: -10 },
        reactions: [
          say("sales", "general", "ดีลมา! 💰"),
          say("sec", "dm", "{I}ขอบันทึกไว้นะ{ask}ว่าไม่เห็นด้วย ถ้ามีการตรวจสอบเมื่อไหร่ เราไม่มีหลักฐานรองรับเลย"),
        ],
      },
      {
        label: "ขอเลื่อนส่ง ให้{sec}ทำ gap assessment ก่อน",
        effects: { security: 8, cash: -6 },
        reactions: [
          say("sec", "general", "ขอบคุณ{end} จะได้รู้ว่าเราขาดอะไรบ้าง 📝"),
          say("sales", "general", "ลูกค้าบอกว่ารอได้ 3 วัน ไม่มากกว่านั้นนะ"),
        ],
      },
    ],
  },
  {
    id: "password-chat",
    lines: [
      say("intern", "random", "ใครต้องการรหัส admin ของ database production บ้าง{ask} {I}แปะไว้ตรงนี้เลยจะได้หาง่าย"),
      say("sec", "random", "{intern}!!! ลบเดี๋ยวนี้เลย 😱😱😱"),
      say("dev", "dev", "รหัสนั้นใช้มาตั้งแต่ก่อตั้งบริษัท ไม่เคยเปลี่ยน"),
      say("ops", "dev", "เปลี่ยนตอนนี้ ทุก service ที่ใช้รหัสนี้ต้อง restart"),
      say("sec", "dm", "CEO เราควรใช้ password manager กับเก็บ secret ให้เป็นระบบได้แล้ว{end}"),
    ],
    presence: { sec: at("server", "ไล่เปลี่ยนรหัส", "🚨"), intern: at("desk", "ลบข้อความ", "😰") },
    prompt: "{intern}แปะรหัส admin ไว้ในแชท จะจัดการยังไง",
    options: [
      {
        label: "เปลี่ยนรหัสทั้งหมด และเริ่มใช้ password manager",
        effects: { security: 12, uptime: -4, cash: -4 },
        reactions: [
          say("sec", "general", "ในที่สุด 🛡️ ทุกคนเปิด MFA ใน password manager ด้วยนะ{ask}"),
          say("ops", "dev", "restart ครบทุก service แล้ว ไม่มีอะไรพัง (รอบนี้)"),
        ],
      },
      {
        label: "เปลี่ยนแค่รหัสที่หลุด",
        effects: { security: 4, uptime: -2 },
        reactions: [
          say("sec", "dev", "ก็ดีกว่าไม่ทำ{end} แต่รหัสตัวอื่นยังเก็บไว้ในไฟล์ txt อยู่นะ{ask}"),
          say("dev", "dev", "ไฟล์นั้นชื่อ passwords_final_v2.txt ใช่ไหม"),
        ],
      },
      {
        label: "ลบข้อความแล้วจบ ไม่มีใครเห็นหรอก",
        effects: { security: -8, morale: 2 },
        reactions: [
          say("sec", "dm", "บอกแล้วนะ{ask} ข้อความในแชทมีคนเห็นไปแล้วอย่างน้อย 6 คน 😤"),
          say("intern", "random", "ขอบคุณ CEO{end} นึกว่าจะโดนดุ 😅"),
        ],
      },
    ],
  },
  {
    id: "dev-absent",
    lines: [
      say("dev", "general", "บ่ายนี้ขอลาไปหาหมอนะ{ask}"),
      say("intern", "random", "พี่{dev}ไปหาหมอบ่อยจัง เดือนนี้ครั้งที่สี่แล้ว ไม่สบายหนักหรือเปล่า{ask} 🥺"),
      say("pm", "dm", "{I}เห็น{dev}ใส่เสื้อเชิ้ตรีดเรียบไปหาหมอ แปลกดีนะ{ask} {I}ไม่ได้คิดอะไรนะ"),
      say("ops", "dev", "ถ้า{dev}ไม่อยู่ ส่วน payment ไม่มีใครรู้เรื่องเลยนะ"),
    ],
    presence: { dev: at("away", "ไปหาหมอ", "😶"), pm: at("ceo", "เล่าเรื่อง{dev}", "😊") },
    prompt: "{dev}ลาบ่อยผิดปกติ จะทำยังไง",
    options: [
      {
        label: "ชวน{dev}คุยเรื่องเส้นทางอาชีพแบบเปิดใจ",
        effects: { morale: 6, cash: -6 },
        reactions: [
          say("dev", "dm", "ก็... ไม่คิดว่า CEO จะถาม ขอคิดดูก่อนนะ{ask}"),
          say("ops", "dev", "ถ้าอยู่ต่อ ช่วยเขียนเอกสาร payment หน่อยนะ"),
        ],
      },
      {
        label: "ให้{dev}เขียนเอกสารส่งต่องานไว้ เผื่อไว้ก่อน",
        effects: { uptime: 4, morale: -4 },
        reactions: [
          say("dev", "dev", "เขียนเอกสารส่งต่องาน... เหมือนรู้อะไรเลยนะ"),
          say("intern", "dev", "{I}ช่วยอ่านทบทวนให้{end}! 📖"),
        ],
      },
      {
        label: "ให้{pm}ช่วยสังเกตต่อไป",
        effects: { morale: -10, reputation: -2 },
        reactions: [
          say("pm", "dm", "ยินดี{end} CEO {I}จะรายงานทุกอาทิตย์นะ{ask} 😊"),
          say("sales", "random", "ทำไมช่วงนี้บรรยากาศมันแปลกๆ"),
        ],
      },
    ],
  },
  {
    id: "team-outing",
    lines: [
      say("intern", "general", "พี่ๆ บริษัทเราไม่เคยไปเที่ยวด้วยกันเลย ไปทะเลกันไหม{ask} 🏖️"),
      say("sales", "general", "ไป! {I}จองโต๊ะคาราโอเกะให้"),
      say("ops", "general", "ถ้าทุกคนไป ใครเฝ้าระบบ"),
      say("sec", "general", "ถ้าไปจริง ห้ามโพสต์รูปบัตรพนักงานลงโซเชียลนะ{ask} 🫠"),
      say("pm", "dm", "{I}ว่าเป็นไอเดียที่ดี{end} แต่งบปีนี้... CEO ตัดสินใจเลย"),
    ],
    presence: { intern: at("pantry", "ชวนทุกคนไปเที่ยว", "🤩"), sales: at("pantry", "เลือกเพลงคาราโอเกะ", "🎤") },
    prompt: "ทีมอยากไปเที่ยวด้วยกัน จะอนุมัติไหม",
    options: [
      {
        label: "จัดทริปทะเล 2 วัน บริษัทออกให้",
        effects: { morale: 12, cash: -10, uptime: -2 },
        reactions: [
          say("intern", "general", "เย้!!! CEO ใจดีที่สุดเลย{end} 🙌"),
          say("ops", "dev", "{I}จะเอาโน้ตบุ๊กไปด้วย เผื่อ"),
        ],
      },
      {
        label: "จัด hackathon ในออฟฟิศพร้อมอาหารเย็น",
        effects: { morale: 6, security: 3, cash: -3 },
        reactions: [
          say("dev", "dev", "hackathon ได้ ถ้าหัวข้อไม่ใช่ 'ฟีเจอร์ที่{sales}ขายไปแล้ว'"),
          say("sec", "dev", "{I}ขอหัวข้อ 'ปิดช่องโหว่ให้มากที่สุดใน 1 คืน'{end} 🛡️"),
        ],
      },
      {
        label: "ยังไม่จัด รอให้บริษัทกำไรก่อน",
        effects: { morale: -6, cash: 2 },
        reactions: [
          say("intern", "random", "ไม่เป็นไร{end} ปีหน้าก็ได้... 🥲"),
          say("sales", "random", "งั้นคาราโอเกะหลังเลิกงาน {I}ออกเอง"),
        ],
      },
    ],
  },
  {
    id: "mfa-rollout",
    lines: [
      say("sec", "general", "ตั้งแต่วันจันทร์ ทุกบัญชีต้องเปิด MFA นะ{ask} ไม่มีข้อยกเว้น 🔐"),
      say("sales", "general", "ไม่ไหว เวลาลูกค้าโทรมา {I}ต้องรอรหัสในมือถืออีก ช้าไปหลายวินาที"),
      say("dev", "dev", "MFA ใน GitHub เปิดไว้แล้ว ไม่เห็นยากตรงไหน"),
      say("sales", "dm", "ขอยกเว้นทีมขายได้ไหม{ask} ตัวเลขไตรมาสนี้สำคัญมาก"),
      say("sec", "dm", "ถ้ายกเว้นทีมขาย ก็เท่ากับเปิดประตูหลังไว้{end} บัญชีขายมีข้อมูลลูกค้าทั้งหมดนะ{ask}"),
    ],
    presence: { sec: at("ceo", "ขอให้บังคับ MFA", "🔐"), sales: at("ceo", "ขอยกเว้น MFA", "😩") },
    prompt: "{sec}จะบังคับ MFA ทุกบัญชี แต่{sales}ขอยกเว้นทีมขาย",
    options: [
      {
        label: "บังคับ MFA ทุกบัญชี ไม่มีข้อยกเว้น",
        effects: { security: 12, morale: -4 },
        reactions: [
          say("sec", "general", "ขอบคุณ{end} CEO 🛡️ ใครติดปัญหาทัก{I}ได้เลยนะ{ask}"),
          say("sales", "random", "ก็ได้... แต่ถ้ายอดตก {I}รู้ว่าจะโทษใคร"),
        ],
      },
      {
        label: "บังคับทุกคน แต่ให้ทีมขายใช้ passkey ที่เร็วกว่า",
        effects: { security: 10, cash: -4 },
        reactions: [
          say("sales", "general", "แตะนิ้วทีเดียวเหรอ อันนี้โอเค{end} 👍"),
          say("sec", "dev", "passkey กันฟิชชิ่งได้ดีกว่ารหัส OTP อีก{end} ดีเลย"),
        ],
      },
      {
        label: "เลื่อนไปก่อนจนกว่าจะปิดไตรมาส",
        effects: { security: -8, morale: 3 },
        reactions: [
          say("sales", "general", "CEO เข้าใจทีมขายที่สุด! 💼"),
          say("sec", "dm", "บอกแล้วนะ{ask}... {I}จะเตรียม incident response plan รอไว้เลย 😤"),
        ],
      },
    ],
  },
];

// One scene per business type, drawn more often for that business (see pickQuietScript).
const BUSINESS_SCRIPTS: QuietScript[] = [
  {
    id: "saas-sso",
    business: "saas",
    lines: [
      say("sales", "general", "ลูกค้าองค์กรรายใหญ่ที่สุดบอกว่าจะไม่ต่อสัญญา ถ้าเราไม่มี SSO กับ audit log ภายในเดือนหน้า 😰"),
      say("dev", "dev", "SSO ทำได้ แต่ audit log ต้องแก้ทุก service"),
      say("sec", "dev", "ดีเลย{end} audit log ควรมีตั้งนานแล้ว ไว้ตรวจย้อนหลังเวลามีเหตุ 🛡️"),
      say("pm", "dm", "ถ้าเสียลูกค้ารายนี้ รายได้หายไปเกือบ 30% นะ{ask} {I}แค่อยากให้ CEO เห็นภาพ"),
    ],
    presence: { sales: at("ceo", "รายงานลูกค้าจะหลุด", "😰"), dev: at("desk", "ประเมินงาน SSO", "🤔") },
    prompt: "ลูกค้ารายใหญ่ขอ SSO และ audit log ก่อนต่อสัญญา จะทำยังไง",
    options: [
      {
        label: "ให้ทีมทำเองทั้งหมดภายในเดือนนี้",
        effects: { reputation: 8, morale: -8, security: 4 },
        reactions: [
          say("dev", "dev", "โอเค{end} เดือนนี้ไม่ต้องคุยเรื่องฟีเจอร์อื่นนะ"),
          say("sales", "general", "ลูกค้าดีใจมาก! 💼"),
        ],
      },
      {
        label: "ใช้บริการ SSO สำเร็จรูป แล้วค่อยทำ audit log",
        effects: { cash: -10, security: 6, reputation: 4 },
        reactions: [
          say("sec", "dev", "บริการสำเร็จรูปมี MFA มาให้ด้วย ดีเลย{end}"),
          say("pm", "general", "{I}จะใส่ค่าบริการนี้ในงบไตรมาสนะ{ask}"),
        ],
      },
      {
        label: "ขอเลื่อนเป็นไตรมาสหน้า",
        effects: { reputation: -8, cash: -6 },
        reactions: [
          say("sales", "dm", "ลูกค้าบอกว่าจะเริ่มคุยกับเจ้าอื่นแล้ว{end} 😩"),
          say("dev", "dev", "อย่างน้อยเดือนนี้ได้นอน"),
        ],
      },
    ],
  },
  {
    id: "clinic-xray",
    business: "clinic",
    lines: [
      say("ops", "dev", "NAS ที่เก็บภาพ X-ray ทุกสาขาใช้รหัสเดียวกันหมด และเปิดให้เข้าจากอินเทอร์เน็ตได้ด้วย"),
      say("sec", "dev", "นั่นคือข้อมูลสุขภาพของคนไข้นะ{ask} ถ้าหลุดคือเรื่องใหญ่ 😱"),
      say("sales", "general", "หมอหลายท่านขอดูภาพจากที่บ้านตอนกลางคืน ถ้าปิดหมอบ่นแน่"),
      say("pm", "dm", "{I}ไม่อยากให้หมอไม่พอใจ{end} แต่ก็ไม่อยากเป็นข่าว CEO ช่วยตัดสินใจที"),
    ],
    presence: { ops: at("server", "ตรวจ NAS", "😬"), sec: at("server", "ไล่ดูสิทธิ์", "😱") },
    prompt: "NAS เก็บภาพ X-ray คนไข้เปิดจากอินเทอร์เน็ตด้วยรหัสเดียว จะแก้ยังไง",
    options: [
      {
        label: "ปิดจากอินเทอร์เน็ต ให้หมอเข้าผ่าน VPN พร้อม MFA แยกบัญชีรายคน",
        effects: { security: 12, cash: -6, morale: -3 },
        reactions: [
          say("sec", "general", "แบบนี้ถ้ามีใครเข้าดู เราจะรู้ว่าเป็นใคร{end} 🛡️"),
          say("sales", "general", "หมอบางท่านบ่นเรื่อง MFA แต่ก็ยอม{end}"),
        ],
      },
      {
        label: "ย้ายภาพไประบบคลาวด์ที่ออกแบบมาสำหรับข้อมูลการแพทย์",
        effects: { cash: -14, security: 10, uptime: -3 },
        reactions: [
          say("ops", "dev", "ย้ายข้อมูลหลายเทรา คงใช้เวลาหลายคืน"),
          say("pm", "general", "{I}จะแจ้งทุกสาขาให้เตรียมตัวนะ{ask}"),
        ],
      },
      {
        label: "เปลี่ยนรหัสใหม่ให้ยากขึ้นไปก่อน",
        effects: { security: 2, morale: 2 },
        reactions: [
          say("sec", "dm", "รหัสยากขึ้นแต่ยังเปิดจากอินเทอร์เน็ตอยู่ดีนะ{ask} {I}ขอบันทึกไว้ว่าไม่เห็นด้วย"),
          say("sales", "general", "หมอโอเค{end} ไม่มีใครบ่น"),
        ],
      },
    ],
  },
  {
    id: "ecommerce-flash",
    business: "ecommerce",
    lines: [
      say("sales", "general", "อีก 3 วันถึง 11.11 แล้ว! {I}ตั้งโปรลด 90% ไว้ 100 ชิ้น ยิงแอดไปแล้วด้วย 🚀"),
      say("ops", "dev", "ปีที่แล้วเว็บล่มตอนเที่ยงคืนตรง 40 นาที ปีนี้ยังไม่ได้ทดสอบโหลดเลย"),
      say("dev", "dev", "ระบบตะกร้ายังไม่ได้แก้เรื่องสต็อกติดลบด้วยนะ"),
      say("sec", "dev", "ช่วงเซลมีบอทกวาดของกับบัตรเครดิตขโมยมาลองจ่ายเยอะมาก{end} ต้องเตรียมด้วย"),
      say("pm", "dm", "CEO {I}ว่าเราต้องเลือกสักอย่าง ทำทุกอย่างใน 3 วันไม่ทัน{end}"),
    ],
    presence: { sales: at("meeting", "วางแผนแคมเปญ", "🤩"), ops: at("server", "ดูกราฟโหลด", "😮‍💨") },
    prompt: "11.11 อีก 3 วัน ระบบยังไม่พร้อม จะเตรียมอะไรก่อน",
    options: [
      {
        label: "เช่าเซิร์ฟเวอร์เพิ่มและทดสอบโหลดให้จบ",
        effects: { cash: -10, uptime: 10 },
        reactions: [
          say("ops", "dev", "รอบนี้ไม่ล่มแน่ (มั้ง) 💪"),
          say("sales", "general", "เยี่ยม! ยิงแอดเพิ่มเลย{end}"),
        ],
      },
      {
        label: "ทำห้องรอคิวกับระบบกันบอท ยอมให้ลูกค้ารอนิดหน่อย",
        effects: { uptime: 6, security: 6, reputation: -3 },
        reactions: [
          say("sec", "dev", "บอทหายไปเยอะ{end} บัตรขโมยก็ลองไม่ได้ 🛡️"),
          say("sales", "dm", "ลูกค้าบ่นว่าต้องรอคิว แต่ก็ยังซื้อ{end}"),
        ],
      },
      {
        label: "ลุยตามเดิม ยอดขายสำคัญที่สุด",
        effects: { cash: 12, uptime: -12, reputation: -4 },
        reactions: [
          say("ops", "dm", "ถ้าล่มตอนเที่ยงคืน ใครจะตื่นมาช่วย"),
          say("sales", "general", "ยอดพุ่ง! (ตอนเว็บยังไม่ล่ม) 💰"),
        ],
      },
    ],
  },
  {
    id: "fintech-audit",
    business: "fintech",
    lines: [
      say("pm", "general", "หน่วยงานกำกับแจ้งว่าจะเข้าตรวจระบบสัปดาห์หน้า{end} ขอดูการทบทวนสิทธิ์และบันทึกเหตุการณ์ย้อนหลัง 6 เดือน"),
      say("sec", "dev", "การทบทวนสิทธิ์รอบล่าสุดคือ... ปีที่แล้ว 😰"),
      say("dev", "dev", "บัญชี admin ของคนที่ลาออกไปแล้วยังอยู่สามบัญชี"),
      say("sales", "general", "สัปดาห์หน้ามีเปิดตัวฟีเจอร์โอนเงินต่างประเทศนะ ยกเลิกไม่ได้"),
      say("sec", "dm", "CEO {I}แนะนำให้หยุดฟีเจอร์ใหม่ไว้ก่อน{end} ถ้าตรวจไม่ผ่าน ผลกระทบหนักกว่ามาก"),
    ],
    presence: { sec: at("ceo", "เตรียมเอกสารตรวจ", "😰"), pm: at("meeting", "ทำ checklist", "📋") },
    prompt: "หน่วยงานกำกับจะเข้าตรวจสัปดาห์หน้า จะเตรียมยังไง",
    options: [
      {
        label: "หยุดฟีเจอร์ใหม่ 2 สัปดาห์ ทุกคนช่วยเตรียมตรวจ",
        effects: { security: 10, reputation: 4, cash: -8 },
        reactions: [
          say("sec", "general", "ลบบัญชีที่ไม่ใช้แล้ว ทบทวนสิทธิ์ครบ{end} 🛡️"),
          say("sales", "dm", "เลื่อนเปิดตัวแล้ว พาร์ทเนอร์ไม่ค่อยพอใจ"),
        ],
      },
      {
        label: "จ้างที่ปรึกษาภายนอกช่วยเตรียม",
        effects: { cash: -14, security: 8 },
        reactions: [
          say("pm", "general", "ที่ปรึกษาเริ่มพรุ่งนี้{end} ทุกคนเตรียมตอบคำถามนะ{ask}"),
          say("dev", "dev", "เขาขอดู log ที่เราไม่เคยเก็บ..."),
        ],
      },
      {
        label: "ส่งเอกสารเท่าที่มี แล้วเปิดตัวฟีเจอร์ตามแผน",
        effects: { reputation: -8, security: -4, cash: 4 },
        reactions: [
          say("sec", "dm", "{I}ขอบันทึกไว้นะ{ask}ว่าเราเข้าตรวจทั้งที่ยังมีบัญชี admin ค้าง"),
          say("sales", "general", "ฟีเจอร์ใหม่เปิดแล้ว! 💸"),
        ],
      },
    ],
  },
  {
    id: "logistics-gps",
    business: "logistics",
    lines: [
      say("ops", "dev", "แอปไรเดอร์เวอร์ชันเก่ายังใช้งานอยู่ 40% และยังไม่ได้บังคับอัปเดต"),
      say("dev", "dev", "เวอร์ชันเก่าเชื่อตำแหน่ง GPS จากเครื่องอย่างเดียว มีกลุ่มใน Facebook สอนใช้แอป GPS ปลอมเพื่อโกงค่ารอบ"),
      say("sales", "general", "ลูกค้ารายใหญ่ถามว่าทำไมพัสดุขึ้นว่า 'ส่งแล้ว' แต่ยังไม่ถึง"),
      say("pm", "dm", "ถ้าบังคับอัปเดต ไรเดอร์บางคนมือถือเก่าจะใช้ไม่ได้นะ{ask} {I}กลัวคนไม่พอส่งของ"),
    ],
    presence: { dev: at("desk", "ไล่ดูข้อมูล GPS", "🧐"), pm: at("ceo", "กังวลเรื่องไรเดอร์", "😟") },
    prompt: "ไรเดอร์ใช้ GPS ปลอมโกงค่ารอบผ่านแอปเวอร์ชันเก่า จะทำยังไง",
    options: [
      {
        label: "บังคับอัปเดตแอป และช่วยค่ามือถือให้ไรเดอร์ที่เครื่องเก่า",
        effects: { security: 8, cash: -8, reputation: 4 },
        reactions: [
          say("dev", "dev", "เวอร์ชันใหม่ตรวจ GPS ปลอมได้แล้ว{end}"),
          say("pm", "general", "ไรเดอร์ส่วนใหญ่โอเค{end} ขอบคุณที่ช่วยค่าเครื่อง"),
        ],
      },
      {
        label: "ตรวจจับความผิดปกติฝั่งเซิร์ฟเวอร์แทน ไม่บังคับอัปเดต",
        effects: { security: 5, cash: -5, uptime: -2 },
        reactions: [
          say("dev", "dev", "จับได้บางส่วน แต่ยังหลุดอยู่{end}"),
          say("ops", "dev", "เซิร์ฟเวอร์ทำงานหนักขึ้นนิดหน่อย"),
        ],
      },
      {
        label: "ปล่อยไว้ก่อน หักเงินเฉพาะคนที่ถูกจับได้",
        effects: { cash: -6, reputation: -5, morale: 2 },
        reactions: [
          say("sales", "dm", "ลูกค้าบ่นเพิ่มอีกสองราย{end}"),
          say("pm", "general", "{I}จะทำรายชื่อไรเดอร์ที่น่าสงสัยไว้นะ{ask}"),
        ],
      },
    ],
  },
  {
    id: "gamestudio-cheat",
    business: "gamestudio",
    lines: [
      say("sales", "general", "community ระเบิดแล้ว{end} มีคนใช้โปรแกรมโกงเก็บเลเวลอันดับ 1 ทั้งตาราง 😤"),
      say("dev", "dev", "เซิร์ฟเวอร์เชื่อค่าที่ client ส่งมาทั้งหมด เลยโกงง่ายมาก"),
      say("intern", "random", "{I}ลองโหลดโปรแกรมโกงมาเทสต์ดู มีไวรัสติดมาด้วย{end} 😅"),
      say("sec", "random", "{intern}!!! ห้ามโหลดของแบบนั้นลงเครื่องบริษัทนะ{ask} 😱"),
      say("pm", "dm", "CEO ยอดเติมเงินลดลง 20% ตั้งแต่มีข่าว{end}"),
    ],
    presence: { sales: at("desk", "ตอบคอมเมนต์", "😤"), intern: at("desk", "สแกนไวรัส", "😰") },
    prompt: "ผู้เล่นใช้โปรแกรมโกงเต็มตารางอันดับ จะจัดการยังไง",
    options: [
      {
        label: "ย้ายการตรวจสอบไปฝั่งเซิร์ฟเวอร์และทำระบบ anti-cheat",
        effects: { reputation: 8, cash: -8, uptime: -3 },
        reactions: [
          say("dev", "dev", "เซิร์ฟเวอร์ไม่เชื่อ client แล้ว{end} คนโกงหายไปเยอะ"),
          say("sales", "general", "community กลับมาคึกคัก{end} 🎮"),
        ],
      },
      {
        label: "แบนบัญชีที่โกงรอบใหญ่ แล้วประกาศให้ชัด",
        effects: { reputation: 5, cash: -4 },
        reactions: [
          say("sales", "general", "ประกาศแล้ว คนชมเยอะ{end} แต่ก็มีคนสร้างบัญชีใหม่มาโกงอีก"),
          say("pm", "general", "ยอดเติมเงินฟื้นนิดหน่อย{end}"),
        ],
      },
      {
        label: "เงียบไว้ ไม่อยากให้เป็นข่าว",
        effects: { reputation: -8, morale: -3 },
        reactions: [
          say("sales", "dm", "{I}ตอบคอมเมนต์ไม่ไหวแล้ว{end} 😩"),
          say("dev", "dev", "โปรแกรมโกงอัปเดตเวอร์ชันใหม่แล้วด้วย"),
        ],
      },
    ],
  },
  {
    id: "smartfarm-router",
    business: "smartfarm",
    lines: [
      say("ops", "dev", "เราเตอร์ในสวนทุเรียน 40 จุด ยังใช้รหัส admin ค่าเริ่มต้นจากโรงงานทุกตัว"),
      say("sec", "dev", "เคยมีข่าวบอตเน็ตกวาดเราเตอร์แบบนี้ไปยิงเว็บอื่นนะ{ask} 😰"),
      say("dev", "dev", "เปลี่ยนผ่านระบบรีโมตได้ แต่ถ้าพลาด เราเตอร์จะดับ ต้องขับรถไปรีเซ็ตเอง"),
      say("sales", "dm", "ช่วงนี้ใกล้เก็บเกี่ยว ถ้าระบบน้ำดับ เกษตรกรเดือดร้อนแน่{end}"),
    ],
    presence: { ops: at("away", "ขับรถไปสวน", "😮‍💨"), sec: at("desk", "สแกนอุปกรณ์", "😰") },
    prompt: "เราเตอร์ในสวน 40 จุดใช้รหัสค่าเริ่มต้น จะแก้ยังไง",
    options: [
      {
        label: "ส่งทีมไปเปลี่ยนรหัสและอัปเดตทุกจุดด้วยมือ",
        effects: { security: 12, cash: -8, morale: -5 },
        reactions: [
          say("ops", "dm", "ขับรถไปสามจังหวัด แต่เสร็จแล้ว{end}"),
          say("sec", "general", "เปลี่ยนครบ 40 จุด 🛡️"),
        ],
      },
      {
        label: "เปลี่ยนผ่านระบบรีโมตทีละชุดเล็กๆ",
        effects: { security: 8, uptime: -5 },
        reactions: [
          say("dev", "dev", "ดับไป 3 ตัว ที่เหลือโอเค{end}"),
          say("ops", "dev", "พรุ่งนี้ไปรีเซ็ต 3 ตัวนั้น"),
        ],
      },
      {
        label: "รอรอบบำรุงรักษาหลังเก็บเกี่ยว",
        effects: { security: -6, reputation: 2 },
        reactions: [
          say("sec", "dm", "บอกแล้วนะ{ask}... {I}จะคอยดู traffic แปลกๆ ไว้"),
          say("sales", "general", "เกษตรกรขอบคุณที่ไม่รบกวนช่วงเก็บเกี่ยว{end}"),
        ],
      },
    ],
  },
  {
    id: "edtech-exam",
    business: "edtech",
    lines: [
      say("pm", "general", "ข้อสอบกลางภาคหลุดไปอยู่ใน TikTok ก่อนวันสอบ{end} 😱"),
      say("dev", "dev", "ไฟล์ข้อสอบอยู่ในโฟลเดอร์ที่แชร์ลิงก์แบบ 'ทุกคนที่มีลิงก์' ไว้"),
      say("sec", "dev", "เรามีข้อมูลนักเรียนที่ยังไม่บรรลุนิติภาวะด้วยนะ{ask} ต้องเช็คว่าโฟลเดอร์อื่นแชร์แบบนี้อีกไหม"),
      say("sales", "dm", "โรงเรียนพาร์ทเนอร์โทรมาถามแล้ว{end} ต้องรีบตอบ"),
    ],
    presence: { pm: at("ceo", "รายงานข้อสอบหลุด", "😱"), sec: at("desk", "ไล่ดูไฟล์แชร์", "😰") },
    prompt: "ข้อสอบหลุดเพราะลิงก์แชร์แบบสาธารณะ จะทำยังไง",
    options: [
      {
        label: "เลื่อนสอบ ออกข้อสอบใหม่ และไล่ปิดลิงก์สาธารณะทั้งหมด",
        effects: { security: 8, morale: -6, reputation: 4 },
        reactions: [
          say("pm", "general", "ครูออกข้อสอบใหม่ทั้งคืน{end} แต่เสร็จแล้ว"),
          say("sec", "general", "ปิดลิงก์สาธารณะไปอีก 37 โฟลเดอร์{end} 🛡️"),
        ],
      },
      {
        label: "สอบตามกำหนด แต่สลับข้อและตัวเลือก",
        effects: { reputation: -4, morale: 2 },
        reactions: [
          say("sales", "dm", "โรงเรียนยอมรับได้ แต่ยังกังวลอยู่{end}"),
          say("dev", "dev", "สคริปต์สลับข้อเสร็จแล้ว"),
        ],
      },
      {
        label: "ตั้งนโยบายแชร์ไฟล์ใหม่ทั้งองค์กร และอบรมทุกคน",
        effects: { security: 10, cash: -4, morale: -3 },
        reactions: [
          say("sec", "general", "ต่อไปไฟล์แชร์ได้เฉพาะในโดเมนบริษัท{end}"),
          say("pm", "general", "ครูบางคนบ่นว่าแชร์ให้นักเรียนยากขึ้น{end}"),
        ],
      },
    ],
  },
  {
    id: "hotel-network",
    business: "hotel",
    lines: [
      say("ops", "dev", "Wi-Fi แขกกับเครื่อง front desk อยู่ในเครือข่ายเดียวกัน แขกห้อง 302 สแกนเจอเครื่องพิมพ์ใบเสร็จเรา"),
      say("sec", "dev", "ถ้าแขกเห็นเครื่องพิมพ์ได้ ก็อาจเห็นระบบจองได้เหมือนกันนะ{ask} 😰"),
      say("sales", "general", "ไฮซีซั่นห้องเต็มทุกคืน{end} ระบบจองล่มไม่ได้เด็ดขาด"),
      say("pm", "dm", "เมื่อวานมีแขกโดน overbook สองห้อง {I}ต้องชดเชยไปแล้ว{end}"),
    ],
    presence: { ops: at("server", "ไล่สาย LAN", "😵"), sales: at("desk", "ดูยอดจอง", "🤩") },
    prompt: "Wi-Fi แขกกับระบบโรงแรมอยู่เครือข่ายเดียวกัน ช่วงไฮซีซั่น จะทำยังไง",
    options: [
      {
        label: "แยกเครือข่ายแขกกับระบบโรงแรมทันที",
        effects: { security: 10, cash: -6, uptime: -3 },
        reactions: [
          say("ops", "dev", "แยกเสร็จตอนตีสอง ไม่มีแขกรู้ตัว"),
          say("sec", "general", "แขกเห็นแค่อินเทอร์เน็ตแล้ว{end} 🛡️"),
        ],
      },
      {
        label: "อัปเกรดระบบจองก่อน กัน overbook",
        effects: { uptime: 8, cash: -10, reputation: 4 },
        reactions: [
          say("pm", "general", "ไม่มี overbook อีกเลย{end}"),
          say("sec", "dm", "แต่เครือข่ายยังปนกันอยู่นะ{ask}"),
        ],
      },
      {
        label: "รอหลังไฮซีซั่นค่อยแก้",
        effects: { security: -6, cash: 4 },
        reactions: [
          say("sales", "general", "ยอดเต็ม! ไม่มีอะไรสะดุด{end} 💰"),
          say("sec", "dm", "{I}จะคอยดู log ทุกคืนจนกว่าจะแยกเครือข่าย"),
        ],
      },
    ],
  },
  {
    id: "restaurant-pos",
    business: "restaurant",
    lines: [
      say("ops", "dev", "แท็บเล็ต POS ทุกสาขาต่อ Wi-Fi เดียวกับลูกค้า รหัส Wi-Fi แปะอยู่บนโต๊ะ"),
      say("sec", "dev", "ระบบรับบัตรอยู่ในเครือข่ายเดียวกับลูกค้าแบบนี้ เสี่ยงโดนดักข้อมูลบัตรนะ{ask} 😰"),
      say("sales", "general", "สาขาใหม่เปิดสุดสัปดาห์นี้{end} ทุกอย่างต้องพร้อม"),
      say("pm", "dm", "ผู้จัดการสาขาขอให้ Wi-Fi ลูกค้าแรงขึ้นด้วย {I}ส่งเรื่องมาให้ CEO ตัดสินใจ{end}"),
    ],
    presence: { ops: at("away", "ไปติดตั้งสาขาใหม่", "😮‍💨"), sec: at("desk", "วาดผังเครือข่าย", "😰") },
    prompt: "POS กับลูกค้าใช้ Wi-Fi เดียวกันทุกสาขา จะแก้ยังไง",
    options: [
      {
        label: "แยก Wi-Fi สำหรับ POS ทุกสาขา",
        effects: { security: 10, cash: -8 },
        reactions: [
          say("ops", "dev", "ต้องซื้อ access point เพิ่มทุกสาขา แต่เสร็จแล้ว"),
          say("sec", "general", "ระบบรับบัตรแยกจากลูกค้าแล้ว{end} 🛡️"),
        ],
      },
      {
        label: "เปลี่ยนรหัส Wi-Fi ทุกสัปดาห์",
        effects: { security: 3, morale: -4 },
        reactions: [
          say("pm", "general", "พนักงานหน้าร้านบ่นว่าต้องคอยบอกรหัสใหม่ลูกค้า{end}"),
          say("sec", "dm", "ช่วยได้นิดเดียวนะ{ask}"),
        ],
      },
      {
        label: "ปล่อยไว้ก่อน เน้นเปิดสาขาใหม่",
        effects: { security: -6, reputation: 3 },
        reactions: [
          say("sales", "general", "สาขาใหม่เปิดสวย! คิวยาวมาก{end} 🎉"),
          say("sec", "dm", "บอกแล้วนะ{ask}..."),
        ],
      },
    ],
  },
  {
    id: "media-breaking",
    business: "media",
    lines: [
      say("pm", "general", "ข่าวด่วน! คนเข้าเว็บพร้อมกันมากกว่าปกติ 50 เท่า{end}"),
      say("ops", "dev", "เว็บเริ่มช้า ฐานข้อมูลใกล้เต็ม"),
      say("sec", "dev", "ตอนเดียวกันมีคนพยายามเดารหัสบัญชีบรรณาธิการหลายร้อยครั้ง{end} 😰"),
      say("sales", "dm", "ช่วงนี้รายได้โฆษณาดีที่สุดของปี อย่าให้เว็บล่มนะ{ask}"),
    ],
    presence: { ops: at("server", "เพิ่มเครื่อง", "😵"), pm: at("desk", "เขียนข่าวด่วน", "😤") },
    prompt: "ข่าวด่วนทำคนเข้าเว็บพุ่ง และมีคนเดารหัสบัญชีบรรณาธิการ จะทำยังไง",
    options: [
      {
        label: "เปิด cache หน้าข่าว และบังคับ MFA ทุกบัญชีบรรณาธิการ",
        effects: { uptime: 6, security: 8, cash: -6 },
        reactions: [
          say("ops", "dev", "cache ช่วยได้เยอะ เว็บกลับมาเร็วแล้ว"),
          say("sec", "general", "การเดารหัสล้มเหลวทุกครั้ง{end} 🛡️"),
        ],
      },
      {
        label: "ขึ้นหน้าเว็บแบบเบาชั่วคราว ตัดโฆษณาบางส่วน",
        effects: { uptime: 8, cash: -4, reputation: 2 },
        reactions: [
          say("sales", "dm", "รายได้หายไปนิดหน่อย แต่เว็บไม่ล่ม{end}"),
          say("pm", "general", "ผู้อ่านชมว่าเว็บโหลดเร็ว{end}"),
        ],
      },
      {
        label: "ลุยต่อ เก็บรายได้โฆษณาให้เต็มที่",
        effects: { cash: 8, uptime: -10, security: -4 },
        reactions: [
          say("ops", "dm", "เว็บล่มไป 15 นาที กำลังกู้"),
          say("sales", "general", "รายได้วันนี้ทำสถิติ! (ก่อนล่ม) 💰"),
        ],
      },
    ],
  },
  {
    id: "accounting-season",
    business: "accounting",
    lines: [
      say("pm", "general", "ช่วงยื่นภาษีแล้ว{end} ลูกค้าส่งงบการเงินทางอีเมลวันละหลายร้อยไฟล์"),
      say("sec", "dev", "เมื่อเช้ามีอีเมลปลอมแอบอ้างเป็นกรมสรรพากร ขอให้กดลิงก์ยืนยันข้อมูล{end} 😰"),
      say("ops", "dev", "กล่องอีเมลเต็มทุกวัน backup ก็ช้าลงมาก"),
      say("sales", "dm", "ลูกค้าบอกว่าระบบส่งไฟล์ของเราใช้ยาก เลยส่งทางอีเมลแทน{end}"),
    ],
    presence: { pm: at("desk", "ปิดงบลูกค้า", "😵"), sec: at("desk", "บล็อกอีเมลปลอม", "😰") },
    prompt: "ช่วงยื่นภาษี ไฟล์ลูกค้าไหลเข้าทางอีเมลและมีอีเมลปลอมระบาด จะทำยังไง",
    options: [
      {
        label: "ทำระบบรับไฟล์ที่เข้ารหัสและใช้ง่าย แล้วแจ้งลูกค้า",
        effects: { security: 10, cash: -6, morale: -2 },
        reactions: [
          say("sec", "general", "ไฟล์ลูกค้าไม่ต้องผ่านอีเมลแล้ว{end} 🛡️"),
          say("sales", "general", "ลูกค้าบอกว่าใช้ง่ายกว่าเดิม{end}"),
        ],
      },
      {
        label: "อบรมด่วนเรื่องอีเมลปลอม และตั้งกฎกรองอีเมล",
        effects: { security: 6, morale: -3 },
        reactions: [
          say("sec", "general", "บล็อกอีเมลปลอมได้อีก 120 ฉบับวันนี้{end}"),
          say("pm", "general", "อบรม 30 นาทีในช่วงนี้ก็หนักอยู่นะ{ask}"),
        ],
      },
      {
        label: "ใช้วิธีเดิมไปก่อน ช่วงนี้ยุ่งมาก",
        effects: { security: -6, morale: 3 },
        reactions: [
          say("pm", "general", "ขอบคุณ{end} ทุกคนโฟกัสปิดงบได้เต็มที่"),
          say("sec", "dm", "{I}ขอบันทึกไว้นะ{ask}ว่าเรารับไฟล์การเงินทางอีเมลต่อ"),
        ],
      },
    ],
  },
  {
    id: "fitness-data",
    business: "fitness",
    lines: [
      say("sales", "general", "บริษัทหนึ่งเสนอเงินก้อนใหญ่ขอซื้อข้อมูลการออกกำลังกายและสุขภาพของผู้ใช้เรา{end} 💰"),
      say("sec", "dev", "ข้อมูลสุขภาพเป็นข้อมูลอ่อนไหวนะ{ask} ต้องมีความยินยอมชัดเจน"),
      say("dev", "dev", "ทำให้ไม่ระบุตัวตนได้ แต่ข้อมูลตำแหน่งวิ่งตอนเช้าก็ย้อนกลับไปหาบ้านคนได้อยู่ดี"),
      say("pm", "dm", "ถ้าผู้ใช้รู้ทีหลัง {I}ว่าแบรนด์เราเสียหายหนัก{end}"),
    ],
    presence: { sales: at("ceo", "นำเสนอดีลขายข้อมูล", "🤩"), sec: at("desk", "อ่านข้อตกลง", "😰") },
    prompt: "มีบริษัทขอซื้อข้อมูลสุขภาพผู้ใช้ จะตอบยังไง",
    options: [
      {
        label: "ปฏิเสธ และประกาศว่าเราไม่ขายข้อมูลผู้ใช้",
        effects: { reputation: 8, cash: -2 },
        reactions: [
          say("pm", "general", "ผู้ใช้ชมกันเยอะเลย{end}"),
          say("sales", "dm", "เงินก้อนนั้นน่าเสียดายนะ{ask}"),
        ],
      },
      {
        label: "ขายเฉพาะข้อมูลสรุปภาพรวม และขอความยินยอมก่อน",
        effects: { cash: 8, reputation: -2, security: -2 },
        reactions: [
          say("sec", "dev", "ตัดข้อมูลตำแหน่งออกทั้งหมดแล้ว{end}"),
          say("sales", "general", "ได้เงินน้อยลงแต่ก็ยังดี{end} 💼"),
        ],
      },
      {
        label: "ขายตามที่เขาขอ",
        effects: { cash: 15, reputation: -12, security: -4 },
        reactions: [
          say("sec", "dm", "{I}ไม่เห็นด้วยอย่างแรง{end} ขอบันทึกไว้"),
          say("sales", "general", "เงินเข้าแล้ว! 💰"),
        ],
      },
    ],
  },
  {
    id: "condo-keycard",
    business: "condo",
    lines: [
      say("sales", "general", "ลูกบ้านแจ้งว่ามีคนรับก๊อปคีย์การ์ดคอนโดเราขายใน Facebook ใบละ 200 บาท{end}"),
      say("ops", "dev", "การ์ดรุ่นที่ใช้อยู่ไม่มีการเข้ารหัส ก๊อปได้ด้วยเครื่องราคาถูก"),
      say("sec", "dev", "ถ้าก๊อปได้ ใครก็เข้าลิฟต์กับที่จอดรถได้นะ{ask} 😰"),
      say("pm", "dm", "เปลี่ยนการ์ดทั้งตึกต้องใช้งบเยอะ{end} {I}ต้องขออนุมัติ"),
    ],
    presence: { sec: at("away", "เดินตรวจลิฟต์", "😰"), pm: at("ceo", "ขอนุมัติงบ", "😟") },
    prompt: "คีย์การ์ดคอนโดถูกก๊อปขายในโซเชียล จะทำยังไง",
    options: [
      {
        label: "เปลี่ยนเป็นคีย์การ์ดรุ่นที่เข้ารหัสทั้งตึก",
        effects: { security: 10, cash: -12 },
        reactions: [
          say("ops", "dev", "แจกการ์ดใหม่ครบทุกห้องแล้ว"),
          say("sales", "general", "ลูกบ้านรู้สึกปลอดภัยขึ้น{end}"),
        ],
      },
      {
        label: "เพิ่มการตรวจ CCTV และให้ รปภ. เช็คที่ลิฟต์",
        effects: { security: 4, cash: -5, morale: -2 },
        reactions: [
          say("sec", "dev", "จับคนใช้การ์ดก๊อปได้หนึ่งราย{end}"),
          say("pm", "general", "รปภ. ขอเพิ่มคนอีกหนึ่งกะ{end}"),
        ],
      },
      {
        label: "ประกาศให้ลูกบ้านระวัง และอย่าให้ใครยืมการ์ด",
        effects: { reputation: -4, cash: 1 },
        reactions: [
          say("sales", "dm", "ลูกบ้านบางคนถามว่าแค่ประกาศเหรอ{end}"),
          say("sec", "dm", "บอกแล้วนะ{ask}..."),
        ],
      },
    ],
  },
  {
    id: "factory-remote",
    business: "factory",
    lines: [
      say("ops", "dev", "ผู้ขายเครื่องจักรขอรีโมตเข้า PLC ของไลน์ผลิตได้ตลอดเวลา ตอนนี้ใช้โปรแกรมรีโมตรหัสเดิมมาสามปี"),
      say("sec", "dev", "เครือข่ายโรงงานกับเครือข่ายออฟฟิศยังเชื่อมกันอยู่ด้วยนะ{ask} ถ้าออฟฟิศโดน ไลน์ผลิตก็โดน 😱"),
      say("sales", "general", "ลูกค้าค่ายรถสั่งของเพิ่ม ไลน์ผลิตหยุดไม่ได้เลย{end}"),
      say("pm", "dm", "ถ้าไลน์หยุดชั่วโมงเดียว เสียหายหลายแสน{end} {I}ต้องคิดให้ดี"),
    ],
    presence: { ops: at("server", "ตรวจเครือข่ายโรงงาน", "😬"), pm: at("meeting", "คุยกับผู้ขาย", "😟") },
    prompt: "ผู้ขายขอรีโมตเข้าไลน์ผลิตตลอดเวลา และเครือข่ายโรงงานปนกับออฟฟิศ จะทำยังไง",
    options: [
      {
        label: "ให้เข้าผ่าน jump server พร้อม MFA และเปิดเฉพาะตอนนัด",
        effects: { security: 10, uptime: -3 },
        reactions: [
          say("sec", "general", "ทุกการเข้าถึงมีบันทึกแล้ว{end} 🛡️"),
          say("ops", "dev", "ผู้ขายบ่นนิดหน่อยแต่ยอม"),
        ],
      },
      {
        label: "แยกเครือข่ายโรงงานออกจากออฟฟิศทั้งหมด",
        effects: { security: 12, cash: -14, uptime: -4 },
        reactions: [
          say("ops", "dev", "หยุดไลน์ช่วงกลางคืนสองคืน แต่แยกเสร็จแล้ว"),
          say("pm", "general", "งบเยอะ แต่ประกันภัยไซเบอร์ลดเบี้ยให้{end}"),
        ],
      },
      {
        label: "ให้ตามที่ผู้ขายขอ เพื่อให้แก้ปัญหาได้ไว",
        effects: { uptime: 6, security: -8 },
        reactions: [
          say("sales", "general", "ไลน์ไม่สะดุดเลย{end} 💼"),
          say("sec", "dm", "{I}ขอบันทึกไว้นะ{ask}ว่ารหัสรีโมตสามปียังไม่เปลี่ยน"),
        ],
      },
    ],
  },
  {
    id: "insurance-claims",
    business: "insurance",
    lines: [
      say("sales", "general", "ลูกค้าคนหนึ่งโพสต์ว่าเปิดลิงก์รูปเคลมของตัวเอง แล้วเปลี่ยนเลขท้ายลิงก์ก็เห็นรูปบัตรประชาชนของคนอื่น{end} 😱"),
      say("dev", "dev", "ที่เก็บไฟล์เคลมเปิดลิงก์แบบสาธารณะ และตั้งชื่อไฟล์เรียงเลข"),
      say("sec", "dev", "ต้องปิดก่อน แล้วดู log ว่ามีใครเข้าถึงไปแล้วบ้าง{end}"),
      say("pm", "dm", "เรื่องนี้น่าจะต้องคุยกับฝ่ายกฎหมายเรื่องการแจ้งลูกค้าด้วยนะ{ask}"),
    ],
    presence: { dev: at("desk", "ปิดลิงก์สาธารณะ", "😬"), sec: at("server", "ไล่ดู log", "😱") },
    prompt: "รูปบัตรประชาชนลูกค้าในระบบเคลมเปิดดูได้จากลิงก์สาธารณะ จะทำยังไง",
    options: [
      {
        label: "ปิดทันที ตรวจ log และแจ้งลูกค้าที่อาจได้รับผลกระทบ",
        effects: { security: 8, reputation: 4, cash: -8 },
        reactions: [
          say("sec", "general", "ปิดแล้ว log บอกว่ามีคนเข้าถึงไฟล์คนอื่น 12 ไฟล์{end}"),
          say("pm", "general", "ฝ่ายกฎหมายช่วยร่างอีเมลแจ้งลูกค้าแล้ว{end}"),
        ],
      },
      {
        label: "ปิดทันที แก้ระบบให้ลิงก์หมดอายุ แล้วค่อยประเมินว่าจะแจ้งใคร",
        effects: { security: 10, uptime: -3 },
        reactions: [
          say("dev", "dev", "ลิงก์ใหม่หมดอายุใน 15 นาทีแล้ว"),
          say("pm", "dm", "อย่าลืมเรื่องการแจ้งลูกค้านะ{ask}"),
        ],
      },
      {
        label: "ปิดเงียบๆ แล้วตอบโพสต์ว่าเป็นความเข้าใจผิด",
        effects: { security: 4, reputation: -10 },
        reactions: [
          say("sales", "dm", "ลูกค้าคนนั้นแคปหน้าจอไว้แล้ว{end} 😰"),
          say("sec", "dm", "{I}ไม่เห็นด้วยนะ{ask} ขอบันทึกไว้"),
        ],
      },
    ],
  },
];

// How many quiet scenes must pass before one can come back.
export const QUIET_REPEAT_GAP = Math.floor(QUIET_SCRIPTS.length / 2);
// How often a quiet day uses the business's own scene while it is fresh.
const BUSINESS_SCENE_CHANCE = 0.4;

// Roles a script cannot do without: every author of the opening lines and every {role} it names.
function requiredRoles(script: ScriptedScene): Set<RoleKey> {
  const roles = new Set<RoleKey>(script.lines.map((l) => l.role));
  const texts = [script.prompt, ...script.lines.map((l) => l.text), ...script.options.map((o) => o.label)];
  for (const text of texts) for (const [, key] of text.matchAll(/\{(\w+)\}/g)) if (isRoleKey(key)) roles.add(key);
  return roles;
}

// Picks a quiet scene the company has not seen recently and has the people for.
export function pickQuietScript(recent: string[], staff: Employee[], business: string): QuietScript {
  const castable = (s: QuietScript) => [...requiredRoles(s)].every((r) => holder(staff, r));
  const own = BUSINESS_SCRIPTS.filter((s) => s.business === business && castable(s) && !recent.includes(s.id));
  if (own.length && Math.random() < BUSINESS_SCENE_CHANCE) return own[Math.floor(Math.random() * own.length)];
  const generic = QUIET_SCRIPTS.filter(castable);
  const choices = generic.length ? generic : QUIET_SCRIPTS;
  const fresh = choices.filter((s) => !recent.includes(s.id));
  const pool = fresh.length ? fresh : choices;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function breachScript(risk: OpenRisk): ScriptedScene {
  return {
    lines: [
      say("sec", "dev", `บอกแล้ว บอกแล้ว!!! ${risk.newsId} ที่เราไม่ได้แก้ โดนใช้เจาะเข้ามาแล้ว{end} 😱🚨`),
      say("ops", "dev", "เห็น traffic แปลกๆ ออกจากเครื่องตั้งแต่ตีสอง กำลังไล่ดู log"),
      say("dev", "dev", "ที่เคยเลื่อน patch ไว้... ตอนนี้รู้แล้วว่าไม่ควรเลื่อน"),
      say("sales", "general", "ลูกค้าโทรมาถามแล้วว่าระบบเป็นอะไร {I}ควรตอบว่าอะไร{ask}"),
      say("pm", "dm", "{I}มีบันทึกว่าเรื่องนี้เคยถูกเตือนไว้แล้วนะ{ask} เผื่อ CEO ต้องใช้"),
    ],
    presence: {},
    prompt: "ระบบโดนเจาะ จะรับมือยังไง",
    options: [
      {
        label: "ตัดระบบที่โดนออกจากเครือข่าย แล้วสืบสวนให้ครบ",
        effects: { security: 10, uptime: -12 },
        reactions: [
          say("sec", "dev", "ดี{end} เก็บหลักฐานก่อน แล้วค่อยกู้ระบบจาก backup ที่สะอาด 🛡️"),
          say("sales", "general", "ระบบล่มทั้งบ่ายเลยเหรอ ลูกค้า{I}ร้องไห้แล้ว"),
        ],
      },
      {
        label: "แจ้งลูกค้าอย่างโปร่งใส พร้อมบอกว่ากำลังทำอะไร",
        effects: { reputation: 6, cash: -8 },
        reactions: [
          say("pm", "general", "{I}ช่วยร่างประกาศให้{end} ให้ฝ่ายกฎหมายดูก่อนส่งนะ{ask}"),
          say("ops", "dev", "อย่างน้อยไม่ต้องโกหกใคร"),
        ],
      },
      {
        label: "กู้ระบบเงียบๆ แล้วทำงานต่อ",
        effects: { uptime: 6, reputation: -10, security: -5 },
        reactions: [
          say("sec", "dm", "{I}ไม่เห็นด้วยนะ{ask} ถ้าคนร้ายยังฝังตัวอยู่ เดี๋ยวก็กลับมาอีก 😰"),
          say("dev", "dev", "ถ้าลูกค้ารู้ทีหลัง เรื่องจะใหญ่กว่านี้นะ"),
        ],
      },
    ],
  };
}

export function regressionScript(pkg: string, version: string): ScriptedScene {
  return {
    lines: [
      say("sales", "general", "หน้าชำระเงินขึ้น error ลูกค้าจ่ายเงินไม่ได้!!! 😱"),
      say("ops", "dev", `พังหลังอัปเกรด ${pkg} เป็น ${version} เมื่อวาน`),
      say("dev", "dev", "changelog เขียนไว้ว่ามี breaking change ไม่มีใครอ่านเหรอ... {I}ก็ไม่ได้อ่าน"),
      say("intern", "dm", "CEO {I}เป็นคนเปิด PR เอง{end} ขอโทษ 🙏"),
      say("sec", "dev", "ถ้า rollback ช่องโหว่เดิมจะกลับมานะ{ask} คิดดีๆ"),
    ],
    presence: {},
    prompt: `${pkg} ${version} ทำให้ระบบพัง จะกู้ยังไง`,
    options: [
      {
        label: "rollback กลับเวอร์ชันเดิมก่อน",
        effects: { uptime: 8, security: -6 },
        reactions: [
          say("ops", "dev", "rollback แล้ว ระบบกลับมาแล้ว"),
          say("sec", "dev", "จดไว้นะ{ask}ว่ายังต้องกลับไปอัปเกรดใหม่ 📝"),
        ],
      },
      {
        label: "แก้โค้ดให้รองรับเวอร์ชันใหม่ไปเลย",
        effects: { uptime: 4, morale: -6, cash: -3 },
        reactions: [
          say("dev", "dev", "คืนนี้ไม่ได้นอน แต่จะได้ไม่ต้องทำซ้ำ"),
          say("intern", "dev", "{I}นั่งดูพี่{dev}แก้ด้วย{end} อยากเรียนรู้ 🐣"),
        ],
      },
      {
        label: "แก้ด่วน แล้วเพิ่ม test ใน CI กันพังซ้ำ",
        effects: { uptime: 6, cash: -6, morale: -2 },
        reactions: [
          say("ops", "dev", "ดี รอบหน้าจะได้รู้ก่อน deploy"),
          say("sec", "dev", "อัปเกรดครั้งหน้าจะได้มั่นใจขึ้น{end} 👍"),
        ],
      },
    ],
  };
}

const WELCOME_LINES: Line[] = [
  say("pm", "general", "ยินดีต้อนรับ{end} CEO 😊 มีอะไรให้{I}ช่วยบอกได้เลยนะ{ask}"),
  say("intern", "general", "สวัสดี{end}! ชื่อ{intern} เป็น intern พร้อมลุยทุกงาน 💪"),
  say("dev", "dev", "CEO ใหม่อีกแล้วเหรอ... ก็ดี ขอแค่อย่าเพิ่งสั่ง refactor ก็พอ"),
  say("sec", "dev", "ขอเตือนไว้ก่อนเลยนะ{ask} ระบบเรายังไม่ได้ patch หลายตัว 🫠"),
];

export function welcomePosts(staff: Employee[], company: { name: string; business: string }): DraftMessage[] {
  return [
    {
      channel: "general",
      author: "system",
      kind: "system",
      text:
        `👋 ยินดีต้อนรับ CEO คนใหม่ของ ${company.name} (${company.business})! ออฟฟิศเริ่มทำงานแล้ว\n` +
        "เรื่องที่ต้องตัดสินใจจะเข้ามาใน 📥 Inbox (ตอบไม่ทันมีผลกระทบ) และพิมพ์คุยกับพนักงานได้ทุกคน\n" +
        "ข่าวใน #security-alerts เป็นข่าวจริงจาก CISA KEV (ผ่าน NVD) ส่วนบริษัทและพนักงานเป็นเรื่องสมมติ",
    },
    ...castLines(WELCOME_LINES, staff),
  ];
}

// Lines whose speaker or named colleague the company lacks are dropped.
function castLines(lines: Line[], staff: Employee[]): DraftMessage[] {
  const out: DraftMessage[] = [];
  for (const l of lines) {
    const speaker = holder(staff, l.role);
    const text = speaker ? renderText(l.text, staff, speaker) : null;
    if (!speaker || text === null) continue;
    const channel = l.channel === "dm" ? `dm-${speaker.id}` : l.channel;
    out.push({ channel, author: speaker.id, text, kind: "chat" });
  }
  return out;
}

function castPresence(presence: Partial<Record<RoleKey, Presence>>, staff: Employee[]): Partial<PresenceMap> {
  const out: Partial<PresenceMap> = {};
  for (const [role, p] of Object.entries(presence) as [RoleKey, Presence][]) {
    const person = holder(staff, role);
    if (person) out[person.id] = { ...p, activity: renderText(p.activity, staff) ?? p.activity };
  }
  return out;
}

export function toScene(script: ScriptedScene, staff: Employee[]): { scene: Scene; reactions: Record<string, DraftMessage[]> } {
  const options: DecisionOption[] = script.options.map((o, i) => ({
    id: String.fromCharCode(97 + i),
    label: renderText(o.label, staff) ?? o.label,
    effects: o.effects,
    patches: false,
  }));
  return {
    scene: {
      messages: castLines(script.lines, staff),
      decision: { prompt: renderText(script.prompt, staff) ?? script.prompt, options },
      presence: castPresence(script.presence, staff),
    },
    reactions: Object.fromEntries(options.map((o, i) => [o.id, castLines(script.options[i].reactions, staff)])),
  };
}

const EFFECT_REACTIONS: Record<StatKey, { up: Line; down: Line }> = {
  cash: {
    up: say("sales", "general", "เงินเข้า! แบบนี้ทีมขายทำงานสบายขึ้นเยอะ 💰"),
    down: say("sales", "general", "งบหายไปอีกก้อน ไตรมาสนี้ต้องปิดดีลให้ได้แล้ว 😅"),
  },
  morale: {
    up: say("intern", "general", "ทีมเราดีที่สุดเลย{end}! 🙌"),
    down: say("ops", "dm", "รับทราบ{end} ขอไปนั่งพักแป๊บนึง"),
  },
  security: {
    up: say("sec", "dev", "ดีมาก{end} CEO 🛡️ แบบนี้ค่อยนอนหลับหน่อย"),
    down: say("sec", "dm", "บอกแล้วนะ{ask}... ถ้าโดนเจาะอย่าว่า{I}ไม่เตือน 😱"),
  },
  reputation: {
    up: say("pm", "general", "ลูกค้าน่าจะประทับใจ{end} {I}จะเอาไปเล่าในรีวิวไตรมาสเลยนะ{ask} 😊"),
    down: say("pm", "dm", "{I}ช่วยร่างคำชี้แจงลูกค้าให้นะ{ask} แต่ใครตัดสินใจก็ต้องรับผิดชอบนะ 😊"),
  },
  uptime: {
    up: say("dev", "dev", "ระบบนิ่งขึ้น ดี ไม่ต้องโดนปลุกตอนตีสาม"),
    down: say("ops", "dev", "ระบบจะสะดุดนิดหน่อย คืนนี้เฝ้าเอง 😮‍💨"),
  },
};

// Reactions to an AI-written decision when the AI budget is spent: driven by its biggest effect.
export function fallbackReactions(chosen: DecisionOption, staff: Employee[]): DraftMessage[] {
  const key = STAT_KEYS.filter((k) => chosen.effects[k]).sort(
    (a, b) => Math.abs(chosen.effects[b]!) - Math.abs(chosen.effects[a]!),
  )[0];
  const lines: Line[] = [];
  if (key) lines.push(chosen.effects[key]! > 0 ? EFFECT_REACTIONS[key].up : EFFECT_REACTIONS[key].down);
  if (chosen.patches) lines.push(say("dev", "dev", "โอเค merge ให้แล้ว{end}"));
  const posts = castLines(lines, staff);
  if (!posts.length) {
    const anyone = staff[0];
    if (anyone) posts.push({ channel: "general", author: anyone.id, text: `รับทราบ${anyone.speech.end}`, kind: "chat" });
  }
  return posts;
}
