import type { Dependency, Employee, RoleKey, StackItem, Stats } from "../shared/types";
import { ROLES, roleCovers } from "./roles";

// The kinds of startup a new company can be. Each one decides the tech stack (which real KEV
// news hits it), the npm dependencies (which OSV advisories hit it), job titles, money and
// starting stats. Everything here is hand-written data, so creating a company costs no AI.

export type StackDef = StackItem & { keywords: string[] };

export interface Business {
  id: string;
  label: string;
  // Context for the model, in English.
  pitch: string;
  names: string[];
  titles: Partial<Record<RoleKey, string>>;
  // Starting roster (role ids, may repeat) and the extra roles the player can recruit.
  team: RoleKey[];
  hireable: RoleKey[];
  // Office map style.
  theme: string;
  // The business's own 0-100 measure: which roles push it, and how the game ends at zero.
  kpi: { label: string; start: number; ending: string; weights: Partial<Record<RoleKey, number>> };
  stack: StackDef[];
  packages: string[];
  salaryScale: number;
  fixedCost: number;
  startCash: number;
  // Revenue relative to monthly costs at the starting stats; below 1 burns cash from day one.
  margin: number;
  // 0-1: how much of the business is its own software. Low values mean fewer npm/PR tickets
  // and no coding-centred scripted scenes.
  software: number;
  // Day-to-day business problems, in English, so the model writes scenes about this business.
  concerns: string;
  stats: Omit<Stats, "cash" | "kpi">;
}

// One pinned version per package across every business, because dep_vulns stores a single
// "fixed" version per advisory and package. Versions are deliberately old.
export const PACKAGE_VERSIONS: Record<string, string> = {
  next: "14.2.10",
  express: "4.18.2",
  axios: "1.6.0",
  lodash: "4.17.20",
  jsonwebtoken: "8.5.1",
  ws: "8.11.0",
  multer: "1.4.4",
  moment: "2.29.1",
  nodemailer: "6.9.8",
  sharp: "0.32.5",
  "follow-redirects": "1.15.3",
  "node-forge": "1.2.1",
  "crypto-js": "4.1.1",
  semver: "7.5.1",
  "socket.io": "4.6.1",
  mongoose: "6.10.0",
  protobufjs: "7.2.3",
  minimist: "1.2.5",
  marked: "4.0.9",
  "sanitize-html": "2.7.0",
  ejs: "3.1.6",
  xlsx: "0.18.5",
  xml2js: "0.4.23",
  "tough-cookie": "4.1.2",
  "body-parser": "1.20.2",
};

export const ALL_DEPENDENCIES: Dependency[] = Object.entries(PACKAGE_VERSIONS).map(([name, version]) => ({ name, version }));

// Shared stack building blocks. Keywords match KEV names and CPE vendor:product, lowercased.
const S = {
  next: { name: "Next.js / React", layer: "app", keywords: ["next.js", "vercel:next", "react server", "facebook:react", "meta:react"] },
  node: { name: "Node.js", layer: "app", keywords: ["node.js", "nodejs:node"] },
  nginx: { name: "nginx", layer: "edge", keywords: ["nginx"] },
  linux: { name: "Ubuntu Linux", layer: "host", keywords: ["linux kernel", "linux:linux_kernel", "canonical:", "ubuntu"] },
  postgres: { name: "PostgreSQL", layer: "data", keywords: ["postgresql"] },
  mysql: { name: "MySQL", layer: "data", keywords: ["mysql"] },
  mssql: { name: "Microsoft SQL Server", layer: "data", keywords: ["sql server", "microsoft:sql_server"] },
  mongo: { name: "MongoDB", layer: "data", keywords: ["mongodb"] },
  redis: { name: "Redis", layer: "data", keywords: ["redis"] },
  wordpress: { name: "WordPress", layer: "app", keywords: ["wordpress"] },
  github: { name: "GitHub", layer: "ci", keywords: ["github"] },
  gitlab: { name: "GitLab", layer: "ci", keywords: ["gitlab"] },
  jenkins: { name: "Jenkins", layer: "ci", keywords: ["jenkins"] },
  atlassian: { name: "Jira / Confluence", layer: "app", keywords: ["confluence", "jira", "atlassian"] },
  openssh: { name: "OpenSSH", layer: "host", keywords: ["openssh"] },
  chrome: { name: "Chrome (เครื่องพนักงาน)", layer: "endpoint", keywords: ["chrome", "chromium"] },
  windows: { name: "Windows (เครื่องพนักงาน)", layer: "endpoint", keywords: ["microsoft windows", "microsoft:windows"] },
  exchange: { name: "Microsoft Exchange", layer: "app", keywords: ["exchange server", "microsoft:exchange"] },
  sharepoint: { name: "SharePoint", layer: "app", keywords: ["sharepoint"] },
  fortinet: { name: "Fortinet VPN", layer: "edge", keywords: ["fortinet", "fortios"] },
  sonicwall: { name: "SonicWall VPN", layer: "edge", keywords: ["sonicwall"] },
  ivanti: { name: "Ivanti Connect Secure", layer: "edge", keywords: ["ivanti", "pulse secure"] },
  citrix: { name: "Citrix NetScaler", layer: "edge", keywords: ["citrix", "netscaler"] },
  paloalto: { name: "Palo Alto Firewall", layer: "edge", keywords: ["palo alto", "pan-os", "paloaltonetworks"] },
  bigip: { name: "F5 BIG-IP", layer: "edge", keywords: ["big-ip", "big_ip"] },
  cisco: { name: "Cisco Router", layer: "edge", keywords: ["cisco ios", "cisco:ios", "ios_xe", "ios xe"] },
  iotRouter: { name: "Router ราคาประหยัด (TP-Link/D-Link/Zyxel)", layer: "edge", keywords: ["tp-link", "tp_link", "d-link", "dlink", "zyxel"] },
  vmware: { name: "VMware ESXi / vCenter", layer: "host", keywords: ["esxi", "vcenter", "vmware:esxi", "vmware:vcenter"] },
  spring: { name: "Java Spring", layer: "app", keywords: ["spring framework", "vmware:spring", "spring_framework"] },
  tomcat: { name: "Apache Tomcat", layer: "app", keywords: ["tomcat"] },
  weblogic: { name: "Oracle WebLogic", layer: "app", keywords: ["weblogic"] },
  magento: { name: "Adobe Commerce (Magento)", layer: "app", keywords: ["magento", "adobe commerce"] },
  drupal: { name: "Drupal", layer: "app", keywords: ["drupal"] },
  moodle: { name: "Moodle", layer: "app", keywords: ["moodle"] },
  roundcube: { name: "Roundcube Webmail", layer: "app", keywords: ["roundcube"] },
  opera: { name: "Oracle OPERA (ระบบโรงแรม)", layer: "app", keywords: ["oracle hospitality", "hospitality_opera", "opera pms"] },
  sap: { name: "SAP NetWeaver (ERP)", layer: "app", keywords: ["netweaver", "sap:"] },
  moveit: { name: "MOVEit Transfer", layer: "data", keywords: ["moveit"] },
  veeam: { name: "Veeam Backup", layer: "data", keywords: ["veeam"] },
  nas: { name: "NAS (QNAP/Synology)", layer: "data", keywords: ["qnap", "synology"] },
  cctv: { name: "กล้อง CCTV Hikvision", layer: "endpoint", keywords: ["hikvision"] },
  papercut: { name: "PaperCut (ระบบพิมพ์)", layer: "endpoint", keywords: ["papercut"] },
  android: { name: "แอป Android", layer: "endpoint", keywords: ["android"] },
  ios: { name: "แอป iOS", layer: "endpoint", keywords: ["apple ios", "apple:iphone_os", "ipados", "apple multiple products"] },
  scada: { name: "ระบบ SCADA / PLC", layer: "host", keywords: ["siemens", "schneider", "rockwell", "scada"] },
} satisfies Record<string, StackDef>;

export const BUSINESSES: Business[] = [
  {
    id: "saas",
    team: ["dev", "sec", "ops", "sales", "pm", "cs"],
    hireable: ["intern", "designer"],
    theme: "office",
    kpi: { label: "ความพอใจลูกค้า", start: 60, ending: "ลูกค้าองค์กรยกเลิกสัญญาจนหมด บริษัทไปต่อไม่ได้ 📉", weights: { cs: 15, pm: 8, dev: 8, sales: 4 } },
    software: 1,
    concerns: "enterprise customer churn, feature requests from big clients, uptime SLAs, customers' security reviews",
    label: "SaaS ขายระบบให้องค์กร",
    pitch: "B2B SaaS selling HR and workflow software to companies; enterprise customers ask for security reviews",
    names: ["CloudDesk", "ไทยเวิร์คโฟลว์", "HRly", "สยามซอฟต์", "TaskThai", "OfficeMate Cloud"],
    titles: {},
    stack: [S.next, S.node, S.nginx, S.linux, S.postgres, { ...S.wordpress, name: "WordPress (เว็บการตลาด)" }, S.github, S.redis, S.openssh, S.chrome, S.windows, S.fortinet],
    packages: ["next", "express", "axios", "lodash", "jsonwebtoken", "ws"],
    salaryScale: 1,
    fixedCost: 120000,
    startCash: 3000000,
    margin: 1,
    stats: { morale: 65, security: 50, reputation: 60, uptime: 90 },
  },
  {
    id: "clinic",
    team: ["dentist", "nurse", "receptionist", "itsupport", "pm", "intern"],
    hireable: ["dentist", "nurse", "accountant", "sec", "dev"],
    theme: "clinic",
    kpi: { label: "ความพึงพอใจคนไข้", start: 70, ending: "คนไข้หนีไปคลินิกอื่นหมด ต้องปิดคลินิก 🦷", weights: { dentist: 15, nurse: 8, receptionist: 6, pm: 4 } },
    software: 0.2,
    concerns: "appointment no-shows, dentists' schedules, patient privacy (PDPA), equipment costs, online reviews",
    label: "คลินิกทันตกรรมหลายสาขา",
    pitch: "multi-branch dental clinic with online booking; holds patient records and X-ray images (sensitive personal data under Thailand's PDPA)",
    names: ["ยิ้มสวยเดนทัล", "ฟันดีคลินิก", "SmilePlus Dental", "บ้านหมอฟัน", "เดนทัลแคร์สยาม", "Happy Teeth"],
    titles: { dev: "Developer", sales: "ฝ่ายประสานงานคนไข้", ops: "IT Support", pm: "ผู้จัดการคลินิก", intern: "ผู้ช่วยฝึกหัด" },
    stack: [S.windows, S.chrome, S.exchange, S.sonicwall, S.nas, S.cctv, { ...S.wordpress, name: "WordPress (ระบบนัดออนไลน์)" }, S.mysql, S.github, S.node],
    packages: ["express", "jsonwebtoken", "multer", "moment", "nodemailer", "lodash"],
    salaryScale: 0.9,
    fixedCost: 180000,
    startCash: 2400000,
    margin: 1.02,
    stats: { morale: 70, security: 40, reputation: 70, uptime: 85 },
  },
  {
    id: "ecommerce",
    team: ["dev", "itsupport", "sales", "warehouse", "cs", "pm"],
    hireable: ["sec", "ops", "designer", "intern"],
    theme: "warehouse",
    kpi: { label: "ความพอใจลูกค้า", start: 65, ending: "ลูกค้าเลิกสั่งเพราะของช้าและรีวิวแย่ ร้านต้องปิดตัว 📦", weights: { warehouse: 12, cs: 10, dev: 5, sales: 4 } },
    software: 0.7,
    concerns: "flash sales, shipping delays, returns and fake reviews, ad spend, payment fraud",
    label: "ร้านเสื้อผ้าออนไลน์",
    pitch: "online fashion shop living on flash sales (11.11, 12.12); stores payment details and customer addresses",
    names: ["แต่งตัวดี.com", "Siam Closet", "เสื้อสวยช็อป", "ThaiThread", "ชุดนี้ดีย์", "StyleMart TH"],
    titles: { sales: "Marketing", pm: "E-commerce Manager" },
    stack: [S.magento, S.wordpress, S.nginx, S.mysql, S.redis, S.linux, S.chrome, S.windows, S.github, { ...S.android, name: "แอปร้าน (Android)" }],
    packages: ["express", "axios", "sharp", "multer", "lodash", "follow-redirects"],
    salaryScale: 0.85,
    fixedCost: 150000,
    startCash: 2000000,
    margin: 0.98,
    stats: { morale: 65, security: 45, reputation: 65, uptime: 80 },
  },
  {
    id: "fintech",
    team: ["dev", "sec", "ops", "sales", "pm", "compliance"],
    hireable: ["cs", "intern", "designer"],
    theme: "office",
    kpi: { label: "ความเชื่อมั่นผู้ใช้", start: 55, ending: "ผู้ใช้ถอนเงินออกหมด และหน่วยงานกำกับสั่งระงับบริการ 🏦", weights: { compliance: 12, sec: 8, cs: 8, pm: 4 } },
    software: 1,
    concerns: "regulator rules, scams targeting users, transaction limits, partner banks, app store reviews",
    label: "e-wallet / fintech",
    pitch: "e-wallet app under financial regulator supervision; moves customers' money and must report incidents to the regulator",
    names: ["จ่ายจ๊ะ", "PaySabai", "วอลเล็ตใจดี", "Baht+", "โอนไว", "SiamPayGo"],
    titles: { sales: "Business Development", sec: "Security Lead", ops: "SRE", pm: "Product Owner" },
    stack: [S.spring, S.tomcat, S.paloalto, S.bigip, S.postgres, S.redis, S.jenkins, S.gitlab, S.android, S.ios, S.vmware, S.linux],
    packages: ["jsonwebtoken", "node-forge", "crypto-js", "axios", "express", "semver"],
    salaryScale: 1.35,
    fixedCost: 300000,
    startCash: 6000000,
    margin: 0.96,
    stats: { morale: 60, security: 60, reputation: 55, uptime: 90 },
  },
  {
    id: "logistics",
    team: ["dispatcher", "itsupport", "sales", "pm", "warehouse", "intern"],
    hireable: ["dispatcher", "dev", "accountant"],
    theme: "warehouse",
    kpi: { label: "ส่งตรงเวลา", start: 60, ending: "ส่งช้าจนลูกค้ารายใหญ่ย้ายไปเจ้าอื่นหมด 🚚", weights: { dispatcher: 14, warehouse: 10, pm: 5 } },
    software: 0.5,
    concerns: "late deliveries, rider pay and protests, fuel costs, lost parcels, hub capacity",
    label: "บริษัทขนส่งพัสดุด่วน",
    pitch: "parcel delivery company with a rider app, sorting hubs and live tracking",
    names: ["ส่งไวเอ็กซ์เพรส", "ThaiRider Logistics", "ด่วนจี๋", "ParcelGo", "ขนส่งใจดี", "SpeedBox TH"],
    titles: { sales: "Account Manager", ops: "IT Infra", pm: "Operations Manager" },
    stack: [{ ...S.android, name: "แอปไรเดอร์ (Android)" }, S.cisco, S.ivanti, S.vmware, S.mssql, S.windows, S.chrome, S.nginx, S.github, S.mongo],
    packages: ["socket.io", "express", "mongoose", "axios", "moment", "ws"],
    salaryScale: 0.9,
    fixedCost: 260000,
    startCash: 2800000,
    margin: 1,
    stats: { morale: 60, security: 45, reputation: 60, uptime: 85 },
  },
  {
    id: "gamestudio",
    team: ["dev", "artist", "sec", "ops", "sales", "pm"],
    hireable: ["intern", "designer", "artist", "cs"],
    theme: "office",
    kpi: { label: "ความสนุกของเกม", start: 60, ending: "ผู้เล่นเลิกเล่นจนเซิร์ฟเวอร์ร้าง ต้องปิดเกม 🎮", weights: { artist: 12, dev: 10, pm: 5, intern: 3 } },
    software: 0.9,
    concerns: "the player community, in-game events, monetization backlash, cheaters, launch deadlines",
    label: "สตูดิโอเกมมือถือ",
    pitch: "mobile game studio running online multiplayer servers, in-app purchases and a loud player community",
    names: ["ปิกเซลช้าง", "Tuk Tuk Games", "มังกรน้อยสตูดิโอ", "Lanna Pixel", "เกมดีมีสุข", "Siam Arcade"],
    titles: { dev: "Game Programmer", sales: "Community Manager", ops: "Server Ops", intern: "QA Intern", pm: "Producer" },
    stack: [S.jenkins, S.atlassian, S.linux, S.redis, S.windows, S.chrome, S.android, S.ios, S.github, S.nginx],
    packages: ["socket.io", "ws", "express", "protobufjs", "lodash", "axios"],
    salaryScale: 0.95,
    fixedCost: 140000,
    startCash: 2500000,
    margin: 0.97,
    stats: { morale: 75, security: 45, reputation: 55, uptime: 85 },
  },
  {
    id: "smartfarm",
    team: ["agronomist", "dev", "itsupport", "sales", "pm", "intern"],
    hireable: ["agronomist", "ops", "sec"],
    theme: "farm",
    kpi: { label: "ผลผลิตลูกค้า", start: 60, ending: "ผลผลิตในสวนลูกค้าเสียหายหนัก เกษตรกรเลิกใช้ระบบ 🌱", weights: { agronomist: 14, dev: 6, itsupport: 5 } },
    software: 0.5,
    concerns: "harvest season, farmers' cash flow, broken field devices, weather, distributors",
    label: "Smart farm / IoT เกษตร",
    pitch: "IoT sensors and automatic irrigation for durian orchards and greenhouses; hundreds of field devices and cameras",
    names: ["ฟาร์มฉลาด", "ทุเรียนเทค", "GreenSense", "สวนดีไอโอที", "AgriThai Tech", "น้ำหยดอัจฉริยะ"],
    titles: { dev: "IoT Developer", sales: "ฝ่ายขายเกษตรกร", itsupport: "Field Engineer / IT" },
    stack: [S.iotRouter, S.cctv, { ...S.linux, name: "Linux (Raspberry Pi ในสวน)" }, S.nginx, S.postgres, S.node, S.github, S.chrome, S.windows, S.openssh],
    packages: ["express", "ws", "axios", "lodash", "jsonwebtoken", "minimist"],
    salaryScale: 0.8,
    fixedCost: 160000,
    startCash: 1800000,
    margin: 1,
    stats: { morale: 70, security: 35, reputation: 60, uptime: 80 },
  },
  {
    id: "edtech",
    team: ["tutor", "dev", "itsupport", "sales", "pm", "cs"],
    hireable: ["tutor", "sec", "designer", "intern"],
    theme: "office",
    kpi: { label: "คุณภาพการสอน", start: 65, ending: "ผู้ปกครองยกเลิกคอร์สกันหมด แพลตฟอร์มต้องปิดตัว 📚", weights: { tutor: 14, pm: 6, cs: 5, dev: 4 } },
    software: 0.8,
    concerns: "exam season, parents' complaints, tutors' contracts, content quality, school partnerships",
    label: "แพลตฟอร์มเรียนออนไลน์",
    pitch: "online learning platform for high-school students: video lessons and exams; holds data about minors",
    names: ["ติวเก่ง", "เรียนดีออนไลน์", "ครูใจดีออนไลน์", "SmartKid TH", "ห้องเรียนไร้ขอบ", "StudyBuddy"],
    titles: { dev: "Full-stack Dev", sales: "Partnership", pm: "Academic Manager" },
    stack: [S.moodle, S.wordpress, S.nginx, S.postgres, S.atlassian, S.chrome, S.windows, S.github, S.linux, S.redis],
    packages: ["next", "express", "axios", "jsonwebtoken", "marked", "sanitize-html"],
    salaryScale: 0.85,
    fixedCost: 130000,
    startCash: 2200000,
    margin: 0.99,
    stats: { morale: 70, security: 45, reputation: 65, uptime: 85 },
  },
  {
    id: "hotel",
    team: ["receptionist", "housekeeping", "chef", "itsupport", "sales", "pm"],
    hireable: ["accountant", "intern", "chef", "housekeeping"],
    theme: "hotel",
    kpi: { label: "รีวิวแขก", start: 70, ending: "รีวิวแย่จนไม่มีแขกจอง รีสอร์ทต้องปิด 🏝️", weights: { housekeeping: 10, receptionist: 8, chef: 8, pm: 4 } },
    software: 0.2,
    concerns: "high and low season occupancy, booking-site commissions, guest complaints and reviews, staff turnover, weddings and events",
    label: "กลุ่มรีสอร์ทริมทะเล",
    pitch: "beach resort group with an online booking engine, guest data and front-desk systems; busy high season",
    names: ["ทะเลใสรีสอร์ท", "Andaman Breeze", "บ้านริมหาด", "Lanta Hideaway", "ภูผาวิลล่า", "Coral Bay Stay"],
    titles: { sales: "Revenue Manager", ops: "IT Manager", receptionist: "Front Office", pm: "ผู้จัดการรีสอร์ท" },
    stack: [S.opera, S.exchange, S.fortinet, S.windows, S.chrome, { ...S.wordpress, name: "WordPress (เว็บจองห้อง)" }, S.mysql, S.cctv, S.papercut, S.github],
    packages: ["express", "axios", "moment", "nodemailer", "lodash", "ejs"],
    salaryScale: 0.85,
    fixedCost: 350000,
    startCash: 3500000,
    margin: 1.01,
    stats: { morale: 65, security: 40, reputation: 70, uptime: 85 },
  },
  {
    id: "restaurant",
    team: ["chef", "branchmgr", "sales", "itsupport", "accountant", "intern"],
    hireable: ["chef", "branchmgr", "cs"],
    theme: "kitchen",
    kpi: { label: "คุณภาพอาหาร", start: 65, ending: "คุณภาพอาหารตกจนลูกค้าเลิกมา ต้องปิดร้าน 🍽️", weights: { chef: 16, branchmgr: 8, intern: 2 } },
    software: 0.2,
    concerns: "food costs and suppliers, staff shortages at branches, delivery-app commissions, health inspections, menu changes, reviews",
    label: "เชนร้านอาหาร",
    pitch: "restaurant chain with POS tablets in every branch, delivery app integrations and a loyalty app",
    names: ["ข้าวมันไก่เฮียตี๋", "ส้มตำแซ่บนัว", "Noodle Nation", "ครัวคุณยาย", "หมูกระทะบุฟเฟ่ต์ดี", "Kafe Ka-Nom"],
    titles: { dev: "Developer", sales: "Marketing", ops: "IT Support", pm: "Operations Manager", intern: "พนักงานฝึกหัด" },
    stack: [{ ...S.windows, name: "Windows (เครื่อง POS)" }, { ...S.android, name: "แท็บเล็ต POS (Android)" }, S.sonicwall, S.iotRouter, S.cctv, S.mssql, S.chrome, S.nginx, S.github, S.node],
    packages: ["express", "axios", "socket.io", "moment", "jsonwebtoken", "lodash"],
    salaryScale: 0.8,
    fixedCost: 400000,
    startCash: 2000000,
    margin: 1,
    stats: { morale: 60, security: 40, reputation: 65, uptime: 85 },
  },
  {
    id: "media",
    team: ["reporter", "pm", "dev", "sales", "itsupport", "designer"],
    hireable: ["reporter", "sec", "intern"],
    theme: "office",
    kpi: { label: "ความน่าเชื่อถือของข่าว", start: 65, ending: "ข่าวผิดซ้ำๆ จนไม่มีใครเชื่อ ผู้ลงโฆษณาถอนหมด 📰", weights: { reporter: 10, pm: 10, designer: 3 } },
    software: 0.6,
    concerns: "ad revenue, corrections and fake news, viral stories, editors' workload, social media algorithm changes",
    label: "สำนักข่าวออนไลน์",
    pitch: "online news site living on ad revenue; traffic spikes on breaking news; editors' accounts are a target",
    names: ["ข่าวไว", "ThaiDaily Now", "ทันข่าว", "Siam Buzz", "เล่าข่าวเช้า", "Newsroom TH"],
    titles: { dev: "Web Developer", sales: "Ad Sales", pm: "บรรณาธิการ" },
    stack: [S.wordpress, S.drupal, S.nginx, S.mysql, S.chrome, S.windows, S.github, S.linux, S.roundcube, S.redis],
    packages: ["next", "axios", "sanitize-html", "marked", "express", "sharp"],
    salaryScale: 0.85,
    fixedCost: 160000,
    startCash: 2000000,
    margin: 0.98,
    stats: { morale: 65, security: 40, reputation: 65, uptime: 85 },
  },
  {
    id: "accounting",
    team: ["accountant", "accountant", "sales", "itsupport", "pm", "intern"],
    hireable: ["accountant", "sec"],
    theme: "office",
    kpi: { label: "งานเสร็จทันกำหนด", start: 70, ending: "ส่งงบลูกค้าไม่ทันจนโดนปรับ และลูกค้าย้ายหนีหมด 🧾", weights: { accountant: 12, pm: 5, intern: 2 } },
    software: 0.2,
    concerns: "tax season deadlines, clients' missing documents, staff overtime, new regulations, keeping big clients",
    label: "สำนักงานบัญชีและที่ปรึกษาภาษี",
    pitch: "accounting and tax firm handling clients' financial statements and large file transfers; peak in tax season",
    names: ["บัญชีใจดี", "TaxEasy TH", "สำนักงานบัญชีสยาม", "Ledger Plus", "ภาษีไม่ปวดหัว", "CountOn Accounting"],
    titles: { dev: "Developer", sales: "Client Manager", ops: "IT Admin", pm: "Partner" },
    stack: [S.exchange, S.sharepoint, S.moveit, S.veeam, S.nas, S.fortinet, S.windows, S.chrome, S.papercut, S.github],
    packages: ["express", "xlsx", "jsonwebtoken", "multer", "axios", "xml2js"],
    salaryScale: 0.9,
    fixedCost: 150000,
    startCash: 2600000,
    margin: 1.02,
    stats: { morale: 65, security: 45, reputation: 70, uptime: 90 },
  },
  {
    id: "fitness",
    team: ["trainer", "dev", "itsupport", "sales", "pm", "cs"],
    hireable: ["trainer", "sec", "designer"],
    theme: "gym",
    kpi: { label: "ความพอใจสมาชิก", start: 70, ending: "สมาชิกยกเลิกกันหมด สตูดิโอเงียบจนต้องปิด 🏋️", weights: { trainer: 14, cs: 6, dev: 4 } },
    software: 0.8,
    concerns: "membership churn, trainers, wearable partners, influencer marketing, users' health data",
    label: "แอปฟิตเนสและสตูดิโอ",
    pitch: "fitness app with wearable integration, memberships and studio bookings; stores users' health data",
    names: ["ฟิตดีทุกวัน", "Sweat Siam", "แข็งแรงแอป", "FitBuddy TH", "ยืดเหยียดคลับ", "PulseUp"],
    titles: { dev: "Mobile Dev", sales: "Membership Sales" },
    stack: [S.ios, S.android, S.nginx, S.mongo, S.node, S.redis, S.github, S.chrome, S.windows, S.linux],
    packages: ["express", "mongoose", "jsonwebtoken", "axios", "socket.io", "lodash"],
    salaryScale: 0.9,
    fixedCost: 200000,
    startCash: 2300000,
    margin: 0.99,
    stats: { morale: 75, security: 45, reputation: 60, uptime: 85 },
  },
  {
    id: "condo",
    team: ["pm", "technician", "receptionist", "itsupport", "accountant", "intern"],
    hireable: ["technician", "sec"],
    theme: "condo",
    kpi: { label: "ความพอใจลูกบ้าน", start: 65, ending: "ลูกบ้านรวมตัวเปลี่ยนบริษัทบริหารอาคาร 🏢", weights: { technician: 12, receptionist: 6, pm: 6 } },
    software: 0.3,
    concerns: "residents' complaints, parcel lockers, maintenance contractors, common fees, security guards",
    label: "บริหารคอนโดอัจฉริยะ",
    pitch: "smart condo management: keycards, CCTV, a resident app and parcel lockers across several buildings",
    names: ["คอนโดสบาย", "Smart Living TH", "บ้านฉลาด", "The Nest Residence", "อยู่ดีคอนโด", "UrbanKey"],
    titles: { dev: "Developer", sales: "Customer Relations", ops: "Building IT", pm: "Property Manager", receptionist: "ฝ่ายลูกบ้านสัมพันธ์" },
    stack: [S.cctv, S.iotRouter, S.android, S.ios, S.windows, S.chrome, S.nas, S.nginx, S.postgres, S.github],
    packages: ["express", "axios", "ws", "jsonwebtoken", "moment", "tough-cookie"],
    salaryScale: 0.8,
    fixedCost: 220000,
    startCash: 2200000,
    margin: 1.01,
    stats: { morale: 65, security: 40, reputation: 65, uptime: 85 },
  },
  {
    id: "factory",
    team: ["engineer", "linelead", "purchaser", "safety", "itsupport", "sales"],
    hireable: ["engineer", "accountant", "intern", "sec", "dev"],
    theme: "factory",
    kpi: { label: "กำลังการผลิต", start: 65, ending: "ไลน์ผลิตส่งของไม่ได้ ค่ายรถยกเลิกออร์เดอร์ทั้งหมด 🏭", weights: { engineer: 12, linelead: 10, purchaser: 4, safety: 3 } },
    software: 0.2,
    concerns: "production targets, machine downtime, supplier delays, worker safety, car makers' audits",
    label: "โรงงานผลิตชิ้นส่วนรถยนต์",
    pitch: "auto parts factory: production lines run on PLC/SCADA, plus an ERP and a supplier portal",
    names: ["สยามออโต้พาร์ท", "ไทยชิ้นส่วนยนต์", "Eastern Gear Works", "อะไหล่ดีการช่าง", "Rayong Precision", "ProParts Thailand"],
    titles: { dev: "ERP Developer", sales: "Sales Engineer", pm: "Plant Manager", itsupport: "OT / IT Engineer" },
    stack: [S.sap, S.citrix, S.vmware, S.windows, S.chrome, S.scada, S.mssql, S.fortinet, S.veeam, S.github],
    packages: ["express", "axios", "xml2js", "lodash", "moment", "jsonwebtoken"],
    salaryScale: 1,
    fixedCost: 600000,
    startCash: 5000000,
    margin: 1.02,
    stats: { morale: 60, security: 35, reputation: 65, uptime: 90 },
  },
  {
    id: "insurance",
    team: ["adjuster", "sales", "dev", "sec", "pm", "cs"],
    hireable: ["adjuster", "compliance", "intern"],
    theme: "office",
    kpi: { label: "ความพอใจลูกค้า", start: 60, ending: "ลูกค้าร้องเรียนเรื่องเคลมจนถูกสั่งระงับการขาย 📉", weights: { adjuster: 12, cs: 8, pm: 4 } },
    software: 0.6,
    concerns: "claim disputes, fraudulent claims, agents' commissions, regulator rules, price competition",
    label: "โบรกเกอร์ประกันภัยออนไลน์",
    pitch: "online car and travel insurance broker; stores claim photos, ID card scans and payment data",
    names: ["ประกันง่าย", "Safe Sabai", "คุ้มครองดี", "InsureMe TH", "ชัวร์ไว้ก่อน", "RodPlus Insurance"],
    titles: { sales: "Insurance Sales", pm: "Claims Manager" },
    stack: [S.citrix, S.weblogic, S.exchange, S.sharepoint, S.fortinet, S.windows, S.chrome, S.postgres, S.jenkins, S.next],
    packages: ["next", "express", "axios", "jsonwebtoken", "multer", "body-parser"],
    salaryScale: 1.1,
    fixedCost: 250000,
    startCash: 4000000,
    margin: 0.98,
    stats: { morale: 60, security: 50, reputation: 60, uptime: 90 },
  },
];

const BY_ID = new Map(BUSINESSES.map((b) => [b.id, b]));

export function getBusiness(id: string | undefined): Business {
  return (id && BY_ID.get(id)) || BUSINESSES[0];
}

// A different kind of business from the last one, when possible.
export function randomBusiness(previous?: string): Business {
  const pool = BUSINESSES.filter((b) => b.id !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function randomCompanyName(b: Business): string {
  return b.names[Math.floor(Math.random() * b.names.length)];
}

export function companyDeps(b: Business): Record<string, string> {
  return Object.fromEntries(b.packages.map((p) => [p, PACKAGE_VERSIONS[p]]));
}

// ---------------------------------------------------------------------------
// Money, in baht. A "month" is DAYS_PER_MONTH game days; payday settles revenue and costs.

export const DAYS_PER_MONTH = 5;

function round1000(n: number): number {
  return Math.round(n / 1000) * 1000;
}

export function baseSalary(role: RoleKey, b: Business): number {
  return round1000((ROLES[role]?.salary ?? 30000) * b.salaryScale);
}

export function roleTitle(role: RoleKey, b: Business): string {
  return b.titles[role] ?? ROLES[role]?.title ?? role;
}

export function hireRoles(b: Business): RoleKey[] {
  return [...new Set([...b.team, ...b.hireable])];
}

const LEVEL_FACTOR: Record<number, number> = { 1: 0.8, 2: 1, 3: 1.25 };

// How much one employee pushes the KPI: their role's weight, scaled by level and mood.
function kpiPush(b: Business, role: RoleKey, level: number, morale: number): number {
  return (b.kpi.weights[role] ?? 0) * (LEVEL_FACTOR[level] ?? 1) * (0.6 + 0.4 * (morale / 100));
}

// Where the KPI drifts each day given who is on staff; the starting team holds it at kpi.start.
export function kpiTarget(b: Business, staff: Employee[]): number {
  const startPush = b.team.reduce((sum, r) => sum + kpiPush(b, r, ROLES[r]?.startLevel ?? 2, 70), 0);
  const push = staff.reduce((sum, e) => sum + kpiPush(b, e.roleKey, e.level, e.morale), 0);
  return Math.max(0, Math.min(100, Math.round(b.kpi.start - startPush + push)));
}

// Salaries vary up to 15% around the business's base.
export function randomSalary(role: RoleKey, b: Business): number {
  return round1000(baseSalary(role, b) * (0.85 + Math.random() * 0.3));
}

// Decision effects on cash are written in points; one point is about 1/150 of starting cash.
// The live office asks for a decision every couple of minutes, so a point has to be small
// enough that a company survives hours of play, not just a few dozen turns.
export function cashUnit(b: Business): number {
  return Math.max(5000, Math.round(b.startCash / 150 / 5000) * 5000);
}

export function monthlyCost(b: Business, staff: Employee[]): number {
  return staff.reduce((sum, e) => sum + (e.salary ?? 0), 0) + b.fixedCost;
}

// Revenue tracks reputation, uptime and the business KPI; at the starting stats it is about
// margin x costs. Without anyone selling it drops by a quarter; each extra seller adds 10%.
export function monthlyRevenue(b: Business, stats: Stats, staff?: Employee[]): number {
  const basePayroll = b.team.reduce((sum, r) => sum + baseSalary(r, b), 0);
  const factor = (rep: number, up: number, kpi: number) =>
    (0.6 + 0.8 * (rep / 100)) * (0.5 + 0.5 * (up / 100)) * (0.6 + 0.8 * (kpi / 100));
  const base = ((basePayroll + b.fixedCost) * b.margin) / factor(b.stats.reputation, b.stats.uptime, b.kpi.start);
  const sales = staff ? staff.filter((e) => roleCovers(e.roleKey, "sales")).length : 1;
  const salesFactor = sales === 0 ? 0.75 : 1 + 0.1 * (sales - 1);
  return round1000(base * factor(stats.reputation, stats.uptime, stats.kpi ?? b.kpi.start) * salesFactor);
}

export function formatBaht(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} บาท`;
}
