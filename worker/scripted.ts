import type { DecisionOption, OfficeSpot, OpenRisk, Presence, StatKey, Stats } from "../shared/types";
import { STAT_KEYS } from "../shared/types";
import type { DraftMessage, PresenceMap, Scene } from "./game";

// Hand-written scenes that cost no AI: every quiet office day, and breach or regression turns
// once the daily AI budget is spent. Each option carries its own reactions, so the decision
// that follows needs no AI either.

interface ScriptedOption {
  label: string;
  effects: Partial<Stats>;
  reactions: DraftMessage[];
}

export interface ScriptedScene {
  messages: DraftMessage[];
  presence: Partial<PresenceMap>;
  prompt: string;
  options: ScriptedOption[];
}

interface QuietScript extends ScriptedScene {
  id: string;
}

const at = (spot: OfficeSpot, activity: string, mood: string): Presence => ({ spot, activity, mood });
const say = (author: string, channel: string, text: string): DraftMessage => ({ author, channel, text, kind: "chat" });

const QUIET_SCRIPTS: QuietScript[] = [
  {
    id: "fah-raise",
    messages: [
      say("fah", "dev", "เมื่อคืนโดนปลุกไปแก้ server อีกแล้ว รอบที่สามของอาทิตย์นี้"),
      say("kan", "dev", "ก็ alert มันดังทุกเรื่องอะ เดี๋ยวค่อยจูน"),
      say("ton", "random", "พี่ฟ้าเก่งมากเลยครับ ผมเห็น commit ตอนตีสี่ 😮"),
      say("fah", "dm-fah", "CEO มีเวลาคุยเรื่องเงินเดือนไหม ทำงานแบบนี้มาปีกว่าแล้ว ยังไม่เคยปรับเลย"),
      say("prae", "general", "ช่วงนี้งบตึงนะคะทุกคน แพรแค่อยากเตือนไว้เฉยๆ ค่ะ 😊"),
    ],
    presence: { fah: at("ceo", "ขอคุยเรื่องเงินเดือน", "😮‍💨"), prae: at("pantry", "จิบกาแฟฟังเงียบๆ", "🙂") },
    prompt: "ฟ้าขอปรับเงินเดือน จะตอบยังไง",
    options: [
      {
        label: "ปรับเงินเดือนให้ฟ้าทันที",
        effects: { cash: -12, morale: 12 },
        reactions: [
          say("fah", "dm-fah", "ขอบคุณจริงๆ ไม่คิดว่าจะได้ เดี๋ยวคืนนี้ไปจูน alert ให้เอง"),
          say("oat", "general", "แล้วทีมขายล่ะ ปรับด้วยไหม 👀"),
        ],
      },
      {
        label: "ให้วันหยุดพิเศษ 3 วันแทน",
        effects: { morale: 6, uptime: -5 },
        reactions: [
          say("fah", "dm-fah", "ก็ดี ได้พักบ้าง แต่ใครจะเฝ้าระบบตอนไม่อยู่"),
          say("kan", "dev", "อย่ามองมาทางนี้นะ"),
        ],
      },
      {
        label: "ขอให้รอรอบประเมินปลายปี",
        effects: { morale: -10, cash: 2 },
        reactions: [
          say("fah", "dm-fah", "รับทราบ"),
          say("prae", "dm-prae", "CEO ตัดสินใจรอบคอบดีค่ะ แต่ช่วงนี้ฟ้าดูเงียบๆ ไปนะคะ แพรแค่สังเกตเฉยๆ"),
        ],
      },
    ],
  },
  {
    id: "oat-promise",
    messages: [
      say("oat", "general", "ข่าวดีทุกคน! ลูกค้ารายใหญ่จะเซ็นสัญญาแล้ว ถ้าเรามีระบบ export รายงานภายในวันศุกร์ 🚀"),
      say("kan", "dev", "ระบบ export ไหน เรายังไม่มี"),
      say("oat", "dev", "ก็ทำสิ ผมรับปากไปแล้ว ง่ายๆ แค่ปุ่มเดียวเอง"),
      say("mai", "dev", "ถ้ารีบทำ อย่าลืมเช็คสิทธิ์การเข้าถึงข้อมูลด้วยนะคะ ไม่งั้นลูกค้า A เห็นข้อมูลลูกค้า B 😰"),
      say("prae", "dm-prae", "แพรไม่ได้อยู่ในห้องตอนโอ๊ตรับปากนะคะ เผื่อ CEO อยากรู้ค่ะ"),
    ],
    presence: { oat: at("ceo", "ขายฝันให้ CEO", "🤩"), kan: at("desk", "ถอนหายใจใส่จอ", "🙄") },
    prompt: "โอ๊ตรับปากลูกค้าเรื่องฟีเจอร์ที่ยังไม่มี จะทำยังไง",
    options: [
      {
        label: "ให้ทีมเร่งทำให้ทันวันศุกร์",
        effects: { cash: 10, reputation: 6, morale: -12 },
        reactions: [
          say("oat", "general", "เยี่ยม! ผมจะไปบอกลูกค้าเลยว่าเรียบร้อย 💼"),
          say("kan", "dev", "เสาร์อาทิตย์นี้ก็ลาก่อน"),
        ],
      },
      {
        label: "บอกลูกค้าตรงๆ ว่าขอเลื่อน 2 สัปดาห์",
        effects: { reputation: -6, morale: 6 },
        reactions: [
          say("oat", "dm-oat", "ถ้าดีลหลุด อย่าหาว่าไม่เตือนนะ"),
          say("mai", "dev", "ดีค่ะ จะได้มีเวลาทำเรื่องสิทธิ์ให้ถูก 🛡️"),
        ],
      },
      {
        label: "ทำเวอร์ชันง่ายๆ ส่งไปก่อน ค่อยเก็บงานทีหลัง",
        effects: { cash: 6, security: -6 },
        reactions: [
          say("kan", "dev", "ได้ เดี๋ยวค่อยแก้... ประโยคนี้ผมพูดบ่อยไปไหม"),
          say("mai", "dev", "จดไว้ก่อนนะคะว่าเป็นหนี้ทางเทคนิค 📝"),
        ],
      },
    ],
  },
  {
    id: "ton-staging",
    messages: [
      say("ton", "dev", "พี่ๆ ครับ ผมกดลบ database ที่ชื่อ staging-old ไปครับ คิดว่าไม่มีใครใช้แล้ว 😅"),
      say("kan", "dev", "อันนั้นคือ staging ที่ทุกคนใช้อยู่ ชื่อมันหลอก"),
      say("fah", "dev", "backup ล่าสุดเมื่อวาน กู้ได้ แต่ข้อมูลทดสอบหายไปหนึ่งวัน"),
      say("ton", "dm-ton", "CEO ครับ ผมขอโทษจริงๆ ครับ ผมจะไม่ทำอีกแล้วครับ 🙏"),
      say("prae", "general", "แพรว่าเราควรมีกระบวนการที่ชัดเจนกว่านี้นะคะ ใครเป็นคนให้สิทธิ์ต้นคะ"),
    ],
    presence: { ton: at("ceo", "ขอโทษ CEO", "😰"), fah: at("server", "กู้ backup", "😵"), kan: at("desk", "หัวเราะในใจ", "😏") },
    prompt: "ต้นลบ database staging โดยไม่ตั้งใจ จะจัดการยังไง",
    options: [
      {
        label: "ทำ post-mortem แบบไม่โทษใคร แล้วแก้ชื่อระบบให้ชัด",
        effects: { morale: 6, uptime: -3 },
        reactions: [
          say("ton", "dev", "ขอบคุณครับ ผมเขียนสรุปเหตุการณ์เองเลยครับ ✍️"),
          say("mai", "dev", "เพิ่มเรื่องสิทธิ์ลบ database ใน checklist ด้วยนะคะ"),
        ],
      },
      {
        label: "ถอนสิทธิ์ลบของ intern ทั้งหมด",
        effects: { security: 8, morale: -6 },
        reactions: [
          say("ton", "dm-ton", "เข้าใจครับ... ผมจะพิสูจน์ตัวเองใหม่ครับ"),
          say("mai", "general", "least privilege ค่ะทุกคน ดีมาก 🛡️"),
        ],
      },
      {
        label: "ให้กานเป็นพี่เลี้ยงต้นหนึ่งเดือน",
        effects: { security: 4, uptime: 3, morale: -4 },
        reactions: [
          say("kan", "dev", "ได้... เริ่มพรุ่งนี้ วันนี้ขอทำงานตัวเองก่อน"),
          say("ton", "dev", "เย้ พี่กานจะสอนผม! 🐣"),
        ],
      },
    ],
  },
  {
    id: "prae-roadmap",
    messages: [
      say("prae", "general", "แพรร่าง roadmap ไตรมาสหน้าเสร็จแล้วนะคะ มี 12 ฟีเจอร์ ทุกอย่างลูกค้าขอมาหมดเลยค่ะ 📋"),
      say("kan", "dev", "12 ฟีเจอร์ คนทำมีสองคน"),
      say("oat", "general", "ผมชอบ! ขายได้ทุกข้อ"),
      say("fah", "dev", "ใน roadmap ไม่มีเรื่องอัปเกรดระบบเลยนะ"),
      say("prae", "dm-prae", "ถ้า roadmap ไม่สำเร็จ แพรคิดว่าน่าจะเป็นเพราะ dev ประเมินงานไม่แม่นนะคะ แพรแค่บอกไว้ก่อนค่ะ"),
    ],
    presence: { prae: at("meeting", "นำเสนอ roadmap", "😊"), kan: at("meeting", "นับนิ้ว", "🙄"), oat: at("meeting", "ปรบมือ", "🤩") },
    prompt: "roadmap ของแพรมี 12 ฟีเจอร์ จะอนุมัติไหม",
    options: [
      {
        label: "อนุมัติทั้งหมดตามที่แพรเสนอ",
        effects: { reputation: 8, cash: -6, morale: -8 },
        reactions: [
          say("prae", "general", "ขอบคุณค่ะ CEO แพรจะติดตามความคืบหน้าทุกวันนะคะ 😊"),
          say("fah", "dev", "งั้นเรื่องอัปเกรดระบบก็ปีหน้าละกัน"),
        ],
      },
      {
        label: "ให้ dev ประเมินงานก่อน แล้วเลือกแค่ 4 ข้อ",
        effects: { morale: 6, reputation: -3 },
        reactions: [
          say("kan", "dev", "ในที่สุดก็มีคนถามคนทำ"),
          say("prae", "dm-prae", "แพรเคารพการตัดสินใจค่ะ แต่ลูกค้าบางรายอาจผิดหวังนะคะ"),
        ],
      },
      {
        label: "เอาฟีเจอร์ลูกค้า 3 ข้อ บวกงานอัปเกรดระบบ",
        effects: { uptime: 6, security: 4, reputation: -4 },
        reactions: [
          say("fah", "dev", "ขอบคุณ จะได้ไม่ต้องโดนปลุกตอนตีสาม"),
          say("oat", "general", "แล้วผมจะขายอะไรล่ะไตรมาสนี้ 😩"),
        ],
      },
    ],
  },
  {
    id: "mai-training",
    messages: [
      say("mai", "general", "ทุกคนคะ เมื่อวานมีอีเมลปลอมแอบอ้างเป็น CEO ส่งมาขอให้โอนเงิน มีคนกดลิงก์ไปสองคนค่ะ 😱"),
      say("oat", "random", "ใครกดอะ... (ไม่ใช่ผมนะ)"),
      say("ton", "random", "ผมกดครับ แต่ไม่ได้ใส่รหัสนะครับ! น่าจะไม่ได้ใส่ครับ"),
      say("mai", "dm-mai", "CEO คะ ใหม่ขอซื้อคอร์ส security awareness ให้ทุกคนได้ไหมคะ รอบนี้รอดเพราะโชคช่วยจริงๆ"),
      say("kan", "dev", "คอร์สออนไลน์แบบกดข้ามได้ใช่ไหม ถ้าใช่ก็ได้"),
    ],
    presence: { mai: at("ceo", "ของบอบรม", "🚨"), ton: at("desk", "เปลี่ยนรหัสผ่าน", "😰") },
    prompt: "มีอีเมล phishing หลุดเข้ามา จะลงทุนเรื่องการอบรมแค่ไหน",
    options: [
      {
        label: "ซื้อคอร์สอบรมให้ทุกคน พร้อมทดสอบ phishing รายไตรมาส",
        effects: { security: 12, cash: -10 },
        reactions: [
          say("mai", "general", "ขอบคุณค่ะ CEO 🛡️ ใครไม่ผ่านต้องสอบใหม่นะคะ"),
          say("kan", "dev", "กดข้ามไม่ได้ด้วยเหรอ"),
        ],
      },
      {
        label: "ให้ใหม่ทำ phishing test เองแบบไม่บอกล่วงหน้า",
        effects: { security: 6, morale: -6 },
        reactions: [
          say("mai", "dev", "จะทำให้แนบเนียนที่สุดค่ะ 😈"),
          say("oat", "general", "ตอนนี้ผมไม่กล้าเปิดอีเมลไหนแล้ว ลูกค้าส่งมาก็ไม่กล้าเปิด"),
        ],
      },
      {
        label: "ส่งอีเมลเตือนทุกคนพอ ไว้ไตรมาสหน้าค่อยว่ากัน",
        effects: { cash: 3, security: -5 },
        reactions: [
          say("mai", "dm-mai", "บอกแล้วนะคะ ถ้ารอบหน้ามีคนโอนเงินจริง อย่าว่าใหม่ไม่เตือนนะคะ 😤"),
          say("prae", "general", "แพรจดไว้แล้วค่ะว่าเรื่องนี้ตัดสินใจวันไหน"),
        ],
      },
    ],
  },
  {
    id: "kan-refactor",
    messages: [
      say("kan", "dev", "โค้ดส่วน payment ไม่มีใครกล้าแตะแล้ว มี comment ว่า 'อย่าลบบรรทัดนี้ ไม่รู้ทำไมแต่ลบแล้วพัง'"),
      say("ton", "dev", "ผมลบไปเมื่อวานครับ แล้วก็ใส่คืนแล้วครับ 😅"),
      say("fah", "dev", "เพราะงั้นไงเมื่อวานบ่ายถึงล่มไป 10 นาที"),
      say("kan", "dm-kan", "CEO ขอเวลา refactor ส่วนนี้หนึ่งสัปดาห์ ไม่ทำตอนนี้ วันหนึ่งมันพังจริงแน่"),
      say("oat", "general", "สัปดาห์นึงไม่มีฟีเจอร์ใหม่เลยเหรอ ลูกค้ารออยู่นะ"),
    ],
    presence: { kan: at("ceo", "ขอเวลา refactor", "😤"), ton: at("desk", "ทำตัวลีบ", "😰") },
    prompt: "กานขอหยุดทำฟีเจอร์หนึ่งสัปดาห์เพื่อ refactor ระบบ payment",
    options: [
      {
        label: "ให้เต็มสัปดาห์",
        effects: { uptime: 8, morale: 6, cash: -8 },
        reactions: [
          say("kan", "dev", "จริงดิ โอเค เริ่มเลย ไม่ต้องเดี๋ยวค่อยทำแล้ว"),
          say("oat", "dm-oat", "ผมจะบอกลูกค้าว่าเรากำลัง 'ยกระดับความเสถียร' ละกัน"),
        ],
      },
      {
        label: "ให้ทุกบ่ายวันศุกร์ไปเรื่อยๆ",
        effects: { uptime: 3, morale: 3, cash: -3 },
        reactions: [
          say("kan", "dev", "ก็ยังดี แต่บ่ายวันศุกร์ใครจะมีแรง"),
          say("fah", "dev", "ขอให้ทันก่อนมันพังละกัน"),
        ],
      },
      {
        label: "ไม่อนุมัติ ลูกค้าต้องมาก่อน",
        effects: { cash: 4, morale: -8 },
        reactions: [
          say("kan", "dm-kan", "ได้ แต่ถ้าพังผมแค่ชี้ไปที่ข้อความนี้นะ"),
          say("oat", "general", "เยี่ยม! ลุยฟีเจอร์ใหม่กัน 💼"),
        ],
      },
    ],
  },
  {
    id: "layoff-rumor",
    messages: [
      say("ton", "random", "พี่ๆ ครับ ที่มุมกาแฟมีคนพูดกันว่าบริษัทจะเลิกจ้าง จริงไหมครับ 😨"),
      say("fah", "random", "ได้ยินมาเหมือนกัน"),
      say("oat", "random", "ทีมขายไม่โดนใช่ไหม ทีมขายคือคนหาเงินนะ"),
      say("prae", "dm-prae", "แพรไม่รู้ว่าข่าวลือมาจากไหนนะคะ แต่ CEO ควรรีบชี้แจงก่อนคนเริ่มหางานใหม่ค่ะ"),
      say("kan", "dev", "ไม่ต้องห่วง ถ้าจะเลิกจ้างคงไม่เลิกจ้างคนเดียวที่รู้ว่า server อยู่ไหน"),
    ],
    presence: {
      ton: at("pantry", "ซุบซิบข่าวลือ", "😨"),
      fah: at("pantry", "ฟังข่าวลือ", "😮‍💨"),
      prae: at("ceo", "แนะนำ CEO", "😊"),
      kan: at("away", "ออกไปหาหมอ (มั้ง)", "😶"),
    },
    prompt: "มีข่าวลือเรื่องเลิกจ้างในออฟฟิศ จะทำยังไง",
    options: [
      {
        label: "เรียก all-hands ชี้แจงตัวเลขบริษัทตรงๆ",
        effects: { morale: 8, uptime: -3 },
        reactions: [
          say("ton", "general", "โล่งเลยครับ ขอบคุณ CEO ครับ 🙏"),
          say("prae", "dm-prae", "เปิดเผยตัวเลขขนาดนั้นเลยเหรอคะ กล้าดีค่ะ"),
        ],
      },
      {
        label: "ส่ง memo สั้นๆ ว่าไม่มีแผนเลิกจ้าง",
        effects: { morale: 3 },
        reactions: [
          say("fah", "random", "memo สั้นจัง ยิ่งน่าสงสัย"),
          say("oat", "random", "ผมเชื่อ CEO นะ (แต่ก็อัปเดตโปรไฟล์ไว้ก่อน)"),
        ],
      },
      {
        label: "เงียบไว้ เดี๋ยวข่าวลือก็หายไปเอง",
        effects: { morale: -10, reputation: -3 },
        reactions: [
          say("ton", "random", "CEO ไม่ตอบ... แสดงว่าจริงใช่ไหมครับ 😭"),
          say("prae", "general", "แพรว่าเราควรสื่อสารกันมากกว่านี้นะคะ ใครเห็นด้วยบ้างคะ"),
        ],
      },
    ],
  },
  {
    id: "oncall",
    messages: [
      say("fah", "dev", "เดือนนี้ฟ้าเข้าเวร on-call คนเดียวทุกคืน 31 คืน"),
      say("kan", "dev", "ก็ฟ้าเก่งสุด"),
      say("mai", "dev", "ถ้าฟ้าป่วยขึ้นมา ไม่มีใครรู้วิธีกู้ระบบเลยนะคะ อันนี้คือความเสี่ยงจริงๆ 😰"),
      say("fah", "dm-fah", "ขอแค่มีคนช่วยแบ่งเวร ไม่งั้นคงไม่ไหวแล้ว"),
    ],
    presence: { fah: at("lounge", "หลับบนโซฟา", "😴"), mai: at("desk", "เขียน runbook", "😰") },
    prompt: "ฟ้าเข้าเวร on-call คนเดียวมาทั้งเดือน จะแก้ยังไง",
    options: [
      {
        label: "จ้าง DevOps part-time มาช่วย",
        effects: { cash: -12, morale: 8, uptime: 5 },
        reactions: [
          say("fah", "dm-fah", "ขอบคุณมาก คืนนี้จะได้นอน"),
          say("prae", "general", "งบส่วนนี้มาจากไหนคะ แพรถามเพื่อทำรายงานเฉยๆ ค่ะ"),
        ],
      },
      {
        label: "หมุนเวร on-call ให้ dev ทุกคน",
        effects: { morale: 2, uptime: -3, security: 3 },
        reactions: [
          say("kan", "dev", "เวรผมวันไหน... วันศุกร์ไม่ได้นะ ผมมีธุระ"),
          say("ton", "dev", "ผมอยากเข้าเวรครับ! สอนผมด้วยนะครับ 🐣"),
        ],
      },
      {
        label: "ซื้อระบบ monitoring ที่ลด alert ไร้สาระ",
        effects: { cash: -6, uptime: 6 },
        reactions: [
          say("fah", "dev", "อย่างน้อยไม่ต้องตื่นเพราะ disk เต็ม 80%"),
          say("mai", "dev", "แต่ยังไม่มีใครสำรองฟ้าอยู่ดีนะคะ"),
        ],
      },
    ],
  },
  {
    id: "questionnaire",
    messages: [
      say("oat", "general", "ลูกค้ารายใหญ่ส่งแบบสอบถาม security มา 200 ข้อ ต้องตอบภายในพรุ่งนี้!"),
      say("oat", "dev", "ตอบ 'มี' ทุกข้อไปเลยได้ไหม ข้อ 47 ถามว่ามี SOC ไหม เรามีใช่ไหม"),
      say("mai", "dev", "เราไม่มีค่ะ และถ้าตอบไม่จริงแล้วลูกค้ามาตรวจเจอ เรื่องจะใหญ่กว่าเสียดีลนะคะ 😱"),
      say("kan", "dev", "ข้อ 112 ถามว่ามีการทดสอบ backup ไหม... ฟ้า เราเคยทดสอบไหม"),
      say("fah", "dev", "เคย ตอนที่ต้นลบ database"),
      say("oat", "dm-oat", "CEO ดีลนี้ใหญ่ที่สุดของปีเลยนะ ช่วยตัดสินใจทีว่าจะตอบยังไง"),
    ],
    presence: { oat: at("desk", "รีบกรอกแบบสอบถาม", "😅"), mai: at("desk", "อ่านทีละข้อ", "😰") },
    prompt: "ลูกค้าส่งแบบสอบถาม security มา จะตอบยังไง",
    options: [
      {
        label: "ตอบตามจริงทุกข้อ พร้อมแผนปรับปรุง",
        effects: { reputation: 5, cash: -4 },
        reactions: [
          say("mai", "general", "ดีค่ะ ลูกค้าส่วนใหญ่ชอบความตรงไปตรงมามากกว่านะคะ"),
          say("oat", "dm-oat", "ถ้าดีลหลุด ผมจะอ้างอิงข้อความนี้นะ"),
        ],
      },
      {
        label: "ตอบให้ดูดีที่สุดก่อน แล้วค่อยทำให้จริงทีหลัง",
        effects: { cash: 12, reputation: -10 },
        reactions: [
          say("oat", "general", "ดีลมา! 💰"),
          say("mai", "dm-mai", "ใหม่ขอบันทึกไว้นะคะว่าไม่เห็นด้วย ถ้ามีการตรวจสอบเมื่อไหร่ เราไม่มีหลักฐานรองรับเลยค่ะ"),
        ],
      },
      {
        label: "ขอเลื่อนส่ง ให้ใหม่ทำ gap assessment ก่อน",
        effects: { security: 8, cash: -6 },
        reactions: [
          say("mai", "general", "ขอบคุณค่ะ จะได้รู้ว่าเราขาดอะไรบ้าง 📝"),
          say("oat", "general", "ลูกค้าบอกว่ารอได้ 3 วัน ไม่มากกว่านั้นนะ"),
        ],
      },
    ],
  },
  {
    id: "password-chat",
    messages: [
      say("ton", "random", "ใครต้องการรหัส admin ของ database production บ้างครับ ผมแปะไว้ตรงนี้เลยนะครับจะได้หาง่าย"),
      say("mai", "random", "ต้น!!! ลบเดี๋ยวนี้เลยค่ะ 😱😱😱"),
      say("kan", "dev", "รหัสนั้นใช้มาตั้งแต่ก่อตั้งบริษัท ไม่เคยเปลี่ยน"),
      say("fah", "dev", "เปลี่ยนตอนนี้ ทุก service ที่ใช้รหัสนี้ต้อง restart"),
      say("mai", "dm-mai", "CEO คะ เราควรใช้ password manager กับเก็บ secret ให้เป็นระบบได้แล้วค่ะ"),
    ],
    presence: { mai: at("server", "ไล่เปลี่ยนรหัส", "🚨"), ton: at("desk", "ลบข้อความ", "😰") },
    prompt: "ต้นแปะรหัส admin ไว้ในแชท จะจัดการยังไง",
    options: [
      {
        label: "เปลี่ยนรหัสทั้งหมด และเริ่มใช้ password manager",
        effects: { security: 12, uptime: -4, cash: -4 },
        reactions: [
          say("mai", "general", "ในที่สุด 🛡️ ทุกคนเปิด MFA ใน password manager ด้วยนะคะ"),
          say("fah", "dev", "restart ครบทุก service แล้ว ไม่มีอะไรพัง (รอบนี้)"),
        ],
      },
      {
        label: "เปลี่ยนแค่รหัสที่หลุด",
        effects: { security: 4, uptime: -2 },
        reactions: [
          say("mai", "dev", "ก็ดีกว่าไม่ทำค่ะ แต่รหัสตัวอื่นยังเก็บไว้ในไฟล์ txt อยู่นะคะ"),
          say("kan", "dev", "ไฟล์นั้นชื่อ passwords_final_v2.txt ใช่ไหม"),
        ],
      },
      {
        label: "ลบข้อความแล้วจบ ไม่มีใครเห็นหรอก",
        effects: { security: -8, morale: 2 },
        reactions: [
          say("mai", "dm-mai", "บอกแล้วนะคะ ข้อความในแชทมีคนเห็นไปแล้วอย่างน้อย 6 คน 😤"),
          say("ton", "random", "ขอบคุณครับ CEO ผมนึกว่าจะโดนดุ 😅"),
        ],
      },
    ],
  },
  {
    id: "kan-absent",
    messages: [
      say("kan", "general", "บ่ายนี้ขอลาไปหาหมอนะ"),
      say("ton", "random", "พี่กานไปหาหมอบ่อยจัง เดือนนี้ครั้งที่สี่แล้ว ไม่สบายหนักหรือเปล่าครับ 🥺"),
      say("prae", "dm-prae", "แพรเห็นพี่กานใส่เสื้อเชิ้ตรีดเรียบไปหาหมอค่ะ แปลกดีนะคะ แพรไม่ได้คิดอะไรนะคะ"),
      say("fah", "dev", "ถ้ากานไม่อยู่ ส่วน payment ไม่มีใครรู้เรื่องเลยนะ"),
    ],
    presence: { kan: at("away", "ไปหาหมอ", "😶"), prae: at("ceo", "เล่าเรื่องกาน", "😊") },
    prompt: "กานลาบ่อยผิดปกติ จะทำยังไง",
    options: [
      {
        label: "ชวนกานคุยเรื่องเส้นทางอาชีพแบบเปิดใจ",
        effects: { morale: 6, cash: -6 },
        reactions: [
          say("kan", "dm-kan", "ก็... ไม่คิดว่า CEO จะถาม ขอคิดดูก่อนนะ"),
          say("fah", "dev", "ถ้ากานอยู่ต่อ ช่วยเขียนเอกสาร payment หน่อยนะ"),
        ],
      },
      {
        label: "ให้กานเขียนเอกสารส่งต่องานไว้ เผื่อไว้ก่อน",
        effects: { uptime: 4, morale: -4 },
        reactions: [
          say("kan", "dev", "เขียนเอกสารส่งต่องาน... เหมือนรู้อะไรเลยนะ"),
          say("ton", "dev", "ผมช่วยอ่านทบทวนให้ครับ! 📖"),
        ],
      },
      {
        label: "ให้แพรช่วยสังเกตต่อไป",
        effects: { morale: -10, reputation: -2 },
        reactions: [
          say("prae", "dm-prae", "ยินดีค่ะ CEO แพรจะรายงานทุกอาทิตย์นะคะ 😊"),
          say("oat", "random", "ทำไมช่วงนี้บรรยากาศมันแปลกๆ"),
        ],
      },
    ],
  },
  {
    id: "team-outing",
    messages: [
      say("ton", "general", "พี่ๆ ครับ บริษัทเราไม่เคยไปเที่ยวด้วยกันเลย ไปทะเลกันไหมครับ 🏖️"),
      say("oat", "general", "ไป! ผมจองโต๊ะคาราโอเกะให้"),
      say("fah", "general", "ถ้าทุกคนไป ใครเฝ้าระบบ"),
      say("mai", "general", "ถ้าไปจริง ห้ามโพสต์รูปบัตรพนักงานลงโซเชียลนะคะ 🫠"),
      say("prae", "dm-prae", "แพรว่าเป็นไอเดียที่ดีค่ะ แต่งบปีนี้... CEO ตัดสินใจเลยค่ะ"),
    ],
    presence: { ton: at("pantry", "ชวนทุกคนไปเที่ยว", "🤩"), oat: at("pantry", "เลือกเพลงคาราโอเกะ", "🎤") },
    prompt: "ทีมอยากไปเที่ยวด้วยกัน จะอนุมัติไหม",
    options: [
      {
        label: "จัดทริปทะเล 2 วัน บริษัทออกให้",
        effects: { morale: 12, cash: -10, uptime: -2 },
        reactions: [
          say("ton", "general", "เย้!!! CEO ใจดีที่สุดเลยครับ 🙌"),
          say("fah", "dev", "ฟ้าจะเอาโน้ตบุ๊กไปด้วย เผื่อ"),
        ],
      },
      {
        label: "จัด hackathon ในออฟฟิศพร้อมอาหารเย็น",
        effects: { morale: 6, security: 3, cash: -3 },
        reactions: [
          say("kan", "dev", "hackathon ได้ ถ้าหัวข้อไม่ใช่ 'ฟีเจอร์ที่โอ๊ตขายไปแล้ว'"),
          say("mai", "dev", "ใหม่ขอหัวข้อ 'ปิดช่องโหว่ให้มากที่สุดใน 1 คืน' ค่ะ 🛡️"),
        ],
      },
      {
        label: "ยังไม่จัด รอให้บริษัทกำไรก่อน",
        effects: { morale: -6, cash: 2 },
        reactions: [
          say("ton", "random", "ไม่เป็นไรครับ ปีหน้าก็ได้ครับ... 🥲"),
          say("oat", "random", "งั้นคาราโอเกะหลังเลิกงาน ผมออกเอง"),
        ],
      },
    ],
  },
  {
    id: "mfa-rollout",
    messages: [
      say("mai", "general", "ตั้งแต่วันจันทร์ ทุกบัญชีต้องเปิด MFA นะคะ ไม่มีข้อยกเว้นค่ะ 🔐"),
      say("oat", "general", "ไม่ไหว เวลาลูกค้าโทรมา ผมต้องรอรหัสในมือถืออีก ช้าไปหลายวินาที"),
      say("kan", "dev", "MFA ใน GitHub เปิดไว้แล้ว ไม่เห็นยากตรงไหน"),
      say("oat", "dm-oat", "ขอยกเว้นทีมขายได้ไหม ตัวเลขไตรมาสนี้สำคัญมาก"),
      say("mai", "dm-mai", "ถ้ายกเว้นทีมขาย ก็เท่ากับเปิดประตูหลังไว้ค่ะ บัญชีขายมีข้อมูลลูกค้าทั้งหมดนะคะ"),
    ],
    presence: { mai: at("ceo", "ขอให้บังคับ MFA", "🔐"), oat: at("ceo", "ขอยกเว้น MFA", "😩") },
    prompt: "ใหม่จะบังคับ MFA ทุกบัญชี แต่โอ๊ตขอยกเว้นทีมขาย",
    options: [
      {
        label: "บังคับ MFA ทุกบัญชี ไม่มีข้อยกเว้น",
        effects: { security: 12, morale: -4 },
        reactions: [
          say("mai", "general", "ขอบคุณค่ะ CEO 🛡️ ใครติดปัญหาทักใหม่ได้เลยนะคะ"),
          say("oat", "random", "ก็ได้... แต่ถ้ายอดตก ผมรู้ว่าจะโทษใคร"),
        ],
      },
      {
        label: "บังคับทุกคน แต่ให้ทีมขายใช้ passkey ที่เร็วกว่า",
        effects: { security: 10, cash: -4 },
        reactions: [
          say("oat", "general", "แตะนิ้วทีเดียวเหรอ อันนี้โอเค 👍"),
          say("mai", "dev", "passkey กันฟิชชิ่งได้ดีกว่ารหัส OTP อีกค่ะ ดีเลย"),
        ],
      },
      {
        label: "เลื่อนไปก่อนจนกว่าจะปิดไตรมาส",
        effects: { security: -8, morale: 3 },
        reactions: [
          say("oat", "general", "CEO เข้าใจทีมขายที่สุด! 💼"),
          say("mai", "dm-mai", "บอกแล้วนะคะ... ใหม่จะเตรียม incident response plan รอไว้เลยค่ะ 😤"),
        ],
      },
    ],
  },
];

// Picks a quiet scene the company has not seen recently.
export function pickQuietScript(recent: string[]): QuietScript {
  const fresh = QUIET_SCRIPTS.filter((s) => !recent.includes(s.id));
  const pool = fresh.length ? fresh : QUIET_SCRIPTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// How many quiet scenes must pass before one can come back.
export const QUIET_REPEAT_GAP = Math.floor(QUIET_SCRIPTS.length / 2);

export function breachScript(risk: OpenRisk): ScriptedScene {
  return {
    messages: [
      say("mai", "dev", `บอกแล้ว บอกแล้ว บอกแล้วค่ะ!!! ${risk.newsId} ที่เราไม่ได้แก้ โดนใช้เจาะเข้ามาแล้ว 😱🚨`),
      say("fah", "dev", "เห็น traffic แปลกๆ ออกจากเครื่องตั้งแต่ตีสอง กำลังไล่ดู log"),
      say("kan", "dev", "ใครเป็นคนบอกว่าเดี๋ยวค่อยแก้... อ๋อ ผมเอง"),
      say("oat", "general", "ลูกค้าโทรมาถามแล้วว่าระบบเป็นอะไร ผมควรตอบว่าอะไร"),
      say("prae", "dm-prae", "แพรมีบันทึกว่าเรื่องนี้เคยถูกเตือนไว้แล้วนะคะ เผื่อ CEO ต้องใช้ค่ะ"),
    ],
    presence: {},
    prompt: "ระบบโดนเจาะ จะรับมือยังไง",
    options: [
      {
        label: "ตัดระบบที่โดนออกจากเครือข่าย แล้วสืบสวนให้ครบ",
        effects: { security: 10, uptime: -12 },
        reactions: [
          say("mai", "dev", "ดีค่ะ เก็บหลักฐานก่อน แล้วค่อยกู้ระบบจาก backup ที่สะอาด 🛡️"),
          say("oat", "general", "ระบบล่มทั้งบ่ายเลยเหรอ ลูกค้าผมร้องไห้แล้ว"),
        ],
      },
      {
        label: "แจ้งลูกค้าอย่างโปร่งใส พร้อมบอกว่ากำลังทำอะไร",
        effects: { reputation: 6, cash: -8 },
        reactions: [
          say("prae", "general", "แพรช่วยร่างประกาศให้ค่ะ ให้ฝ่ายกฎหมายดูก่อนส่งนะคะ"),
          say("fah", "dev", "อย่างน้อยไม่ต้องโกหกใคร"),
        ],
      },
      {
        label: "กู้ระบบเงียบๆ แล้วทำงานต่อ",
        effects: { uptime: 6, reputation: -10, security: -5 },
        reactions: [
          say("mai", "dm-mai", "ใหม่ไม่เห็นด้วยนะคะ ถ้าคนร้ายยังฝังตัวอยู่ เดี๋ยวก็กลับมาอีก 😰"),
          say("kan", "dev", "ถ้าลูกค้ารู้ทีหลัง เรื่องจะใหญ่กว่านี้นะ"),
        ],
      },
    ],
  };
}

export function regressionScript(pkg: string, version: string): ScriptedScene {
  return {
    messages: [
      say("oat", "general", "หน้าชำระเงินขึ้น error ลูกค้าจ่ายเงินไม่ได้!!! 😱"),
      say("fah", "dev", `พังหลังอัปเกรด ${pkg} เป็น ${version} เมื่อวาน`),
      say("kan", "dev", "changelog เขียนไว้ว่ามี breaking change ไม่มีใครอ่านเหรอ... ผมก็ไม่ได้อ่าน"),
      say("ton", "dm-ton", "CEO ครับ ผมเป็นคนเปิด PR เองครับ ขอโทษครับ 🙏"),
      say("mai", "dev", "ถ้า rollback ช่องโหว่เดิมจะกลับมานะคะ คิดดีๆ ค่ะ"),
    ],
    presence: {},
    prompt: `${pkg} ${version} ทำให้ระบบพัง จะกู้ยังไง`,
    options: [
      {
        label: "rollback กลับเวอร์ชันเดิมก่อน",
        effects: { uptime: 8, security: -6 },
        reactions: [
          say("fah", "dev", "rollback แล้ว ระบบกลับมาแล้ว"),
          say("mai", "dev", "จดไว้นะคะว่ายังต้องกลับไปอัปเกรดใหม่ 📝"),
        ],
      },
      {
        label: "แก้โค้ดให้รองรับเวอร์ชันใหม่ไปเลย",
        effects: { uptime: 4, morale: -6, cash: -3 },
        reactions: [
          say("kan", "dev", "คืนนี้ไม่ได้นอน แต่จะได้ไม่ต้องทำซ้ำ"),
          say("ton", "dev", "ผมนั่งดูพี่กานแก้ด้วยครับ อยากเรียนรู้ 🐣"),
        ],
      },
      {
        label: "แก้ด่วน แล้วเพิ่ม test ใน CI กันพังซ้ำ",
        effects: { uptime: 6, cash: -6, morale: -2 },
        reactions: [
          say("fah", "dev", "ดี รอบหน้าจะได้รู้ก่อน deploy"),
          say("mai", "dev", "อัปเกรดครั้งหน้าจะได้มั่นใจขึ้นค่ะ 👍"),
        ],
      },
    ],
  };
}

export function toScene(script: ScriptedScene): { scene: Scene; reactions: Record<string, DraftMessage[]> } {
  const options: DecisionOption[] = script.options.map((o, i) => ({
    id: String.fromCharCode(97 + i),
    label: o.label,
    effects: o.effects,
    patches: false,
  }));
  return {
    scene: { messages: script.messages, decision: { prompt: script.prompt, options }, presence: script.presence },
    reactions: Object.fromEntries(options.map((o, i) => [o.id, script.options[i].reactions])),
  };
}

const EFFECT_REACTIONS: Record<StatKey, { up: DraftMessage; down: DraftMessage }> = {
  cash: {
    up: say("oat", "general", "เงินเข้า! แบบนี้ทีมขายทำงานสบายขึ้นเยอะ 💰"),
    down: say("oat", "general", "งบหายไปอีกก้อน ไตรมาสนี้ต้องปิดดีลให้ได้แล้ว 😅"),
  },
  morale: {
    up: say("ton", "general", "ทีมเราดีที่สุดเลยครับ! 🙌"),
    down: say("fah", "dm-fah", "รับทราบ ขอไปนั่งพักแป๊บนึง"),
  },
  security: {
    up: say("mai", "dev", "ดีมากค่ะ CEO 🛡️ แบบนี้ค่อยนอนหลับหน่อย"),
    down: say("mai", "dm-mai", "บอกแล้วนะคะ... ถ้าโดนเจาะอย่าว่าใหม่ไม่เตือนนะคะ 😱"),
  },
  reputation: {
    up: say("prae", "general", "ลูกค้าน่าจะประทับใจค่ะ แพรจะเอาไปเล่าในรีวิวไตรมาสเลยนะคะ 😊"),
    down: say("prae", "dm-prae", "แพรช่วยร่างคำชี้แจงลูกค้าให้นะคะ แต่ใครตัดสินใจก็ต้องรับผิดชอบนะคะ 😊"),
  },
  uptime: {
    up: say("kan", "dev", "ระบบนิ่งขึ้น ดี ไม่ต้องโดนปลุกตอนตีสาม"),
    down: say("fah", "dev", "ระบบจะสะดุดนิดหน่อย คืนนี้เฝ้าเอง 😮‍💨"),
  },
};

// Reactions to an AI-written decision when the AI budget is spent: driven by its biggest effect.
export function fallbackReactions(chosen: DecisionOption): DraftMessage[] {
  const key = STAT_KEYS.filter((k) => chosen.effects[k]).sort(
    (a, b) => Math.abs(chosen.effects[b]!) - Math.abs(chosen.effects[a]!),
  )[0];
  const posts: DraftMessage[] = [];
  if (key) posts.push(chosen.effects[key]! > 0 ? EFFECT_REACTIONS[key].up : EFFECT_REACTIONS[key].down);
  if (chosen.patches) posts.push(say("kan", "dev", "โอเค merge ให้แล้ว ครั้งนี้ไม่มีเดี๋ยวค่อยทำ"));
  if (!posts.length) posts.push(say("kan", "dev", "รับทราบ"));
  return posts;
}
