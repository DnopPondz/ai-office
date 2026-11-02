# ออฟฟิศ AI (wedeb)

เกมจำลองบริษัทแบบ Slack ที่เดินเอง: คุณเป็น CEO ของบริษัทสมมติ ทุกครั้งที่เริ่มใหม่จะสุ่มประเภทธุรกิจ (16 แบบ), ทีม, ชื่อพนักงาน และนิสัย
เหตุการณ์มาจากข่าวช่องโหว่จริง (CISA KEV ผ่าน NVD API และ OSV.dev) ปนกับปัญหาประจำธุรกิจ เรื่องที่ต้องตัดสินใจเข้ามาเป็นตั๋วอีเมลหรือ DM ที่มีเส้นตาย และพิมพ์คุยกับพนักงานได้ทุกคน

ทำงานบน Cloudflare free plan ทั้งหมด: Workers + Static Assets, Durable Objects (SQLite), D1, Workers AI, Cron Triggers

## โครงสร้าง

| Path | หน้าที่ |
|---|---|
| `worker/index.ts` | API router (`/api/state`, `/api/chat`, `/api/answer`, `/api/team`, `/api/reset`), PIN gate, cron |
| `worker/company.ts` | Durable Object 1 ตัวต่อบริษัท: นาฬิกาเกม, ตั๋ว, งาน AI (ทำทีละงานใน alarm), แชท, migration ของ state เก่า |
| `worker/business.ts` | ธุรกิจ 16 แบบ: ทีมเริ่มต้น, ตำแหน่งที่จ้างได้, KPI, ธีมแผนผัง, stack, package.json และสูตรเงิน/KPI |
| `worker/roles.ts` | catalog ตำแหน่ง ~30 ตำแหน่ง แต่ละตำแหน่งครอบคลุม "งาน" (dev, sec, sales, ops, intern, pm) อะไรบ้าง |
| `worker/roster.ts` | สุ่มพนักงาน: ชื่อไม่ซ้ำ, นิสัย, เป้าหมายลับ, คำลงท้าย, รูป pixel; `holder()` หาคนจากตำแหน่งหรืองาน |
| `worker/tickets.ts` | ตั๋วตัดสินใจ (อีเมล / DM) เส้นตาย และผลเมื่อตอบไม่ทัน |
| `worker/hr.ts` | ขวัญกำลังใจรายคน, KPI รายวัน, ขอขึ้นเงินเดือน, ลาออก, รับสมัคร, เลิกจ้าง |
| `worker/scripted.ts` | ฉากที่เขียนไว้แล้ว (ทั่วไป, ทุกธุรกิจ, เฉพาะธุรกิจ 2 ฉากต่อแบบ) เลือกนักแสดงคนละคนต่อบท |
| `worker/chatter.ts` | บทคุยเล่นระหว่างพนักงาน (ไม่ใช้ AI) |
| `worker/game.ts` | prompt ทั้งหมด (ฉาก, ปฏิกิริยา, แชท, ตีความคำตอบ, ต้อนรับ + นิสัยพนักงาน) และตัวกรองผลลัพธ์ AI |
| `worker/news.ts`, `worker/osv.ts` | ข่าว KEV จาก NVD และช่องโหว่ npm จาก OSV.dev เก็บลง D1 |
| `worker/budget.ts` | นับ neurons ของ Workers AI ทั้งบัญชีต่อวัน |
| `worker/pool.ts` | cron นาทีที่ 47 สร้างฉากข่าวล่วงหน้าต่อประเภทธุรกิจที่มีคนเล่น |
| `shared/types.ts` | type ที่ใช้ร่วมกันระหว่าง Worker และ UI |
| `src/` | หน้าเว็บ React (`App.tsx`, `OfficeMap.tsx` แผนผัง pixel art ตามธีม, `pixel.tsx` sprite) |
| `tests/` | `npm test`: รันโค้ด worker จริงกับ storage/D1/AI จำลอง ไม่ใช้เน็ตและโควตา |
| `migrations/` | schema ของ D1 |

## รันในเครื่อง

```sh
npm install
npm test                    # ตรวจ logic ทั้งหมด (ไม่ต้องใช้ workerd)
npm run typecheck && npm run build
npx wrangler login          # ถ้าจะรัน dev: Workers AI เรียกของจริงบน Cloudflare (ใช้โควตาฟรี)
npm run db:migrate:local
npm run dev                 # http://localhost:5173
```

## Deploy

push เข้า `main` แล้ว Cloudflare Workers Builds จะ build (`npm run build`) และ deploy (`npx wrangler deploy`) ให้อัตโนมัติ

- migration ใหม่ของ D1 ต้องรันเองก่อน push: `npx wrangler d1 migrations apply wedeb-db --remote`
- secret (`ACCESS_PIN`, `SESSION_SECRET`) เก็บที่ Worker ไม่อยู่ใน repo เปลี่ยนด้วย `npx wrangler secret put <ชื่อ>`
- repo นี้เป็น public ห้าม commit token, PIN หรือ `.env`

## หลักที่ต้องยึด

- ข้อเท็จจริงของข่าวมาจาก feed เท่านั้น (SecBot สร้างจากข้อมูล ไม่ผ่าน AI) ส่วนบริษัทและพนักงานเป็นเรื่องสมมติ
- ไม่สร้าง exploit อธิบายแค่ผลกระทบ การแก้ไข และการตรวจจับ
- ข้อมูลทั้งหมดอยู่บน Cloudflare และ GitHub เท่านั้น ไม่ใช้ CDN, ฟอนต์ หรือ analytics ภายนอก
- โควตา Workers AI ฟรีคือ 10,000 neurons/วันต่อทั้งบัญชี เกมนับไว้ใน D1 และหยุดเรียก AI ที่ 9,000 รีเซ็ต 00:00 UTC (07:00 น. เวลาไทย) เมื่อหมด เกมยังเดินต่อด้วยฉากที่เตรียมไว้และฉากที่เขียนไว้
- เวลา: ตอนเปิดหน้าเว็บเวลาเดินตามจริง (poll ทุก 3 วินาที) ตอนไม่อยู่เดินช้าลง 30 เท่า (alarm) เหตุการณ์ประมาณทุก 2 นาที 1 วันในเกม = 2 นาที จ่ายเงินเดือนทุก 5 วัน
- งาน AI ทำทีละงานใน alarm ไม่ทำใน request ของผู้เล่น และโหลด state ใหม่ก่อนบันทึกผล เพื่อไม่ให้ทับกับ request ที่เข้ามาระหว่างรอ AI
- ข้อความแชทจาก AI และบทที่เขียนไว้เข้าคิว (`outbox`) แล้วทยอยขึ้นตามความยาวข้อความ คิวแยกตามช่อง พนักงานคุยเล่นเป็นบทสนทนา และงาน AI `talk` เขียนบทสนทนาระหว่างพนักงานทุกราว 4 นาทีตอนผู้เล่นออนไลน์
- บทที่เขียนไว้อ้าง "งาน" (`{sec}`, `{pm}`) หรือ "ตำแหน่ง" (`{chef}`) แล้วเลือกคนจริงตอนเล่น โดยไม่ให้คนเดียวเล่นสองบทในฉากเดียวกัน
