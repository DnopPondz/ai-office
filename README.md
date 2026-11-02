# ออฟฟิศ AI (wedeb)

เกมจำลองออฟฟิศแบบ Slack: คุณเป็น CEO ของ startup สมมติที่มีพนักงาน AI 6 คน
เหตุการณ์ในเกมมาจากข่าวช่องโหว่จริง (CISA KEV ผ่าน NVD API) พนักงานตอบสนองตามนิสัย และคุณต้องตัดสินใจ

ทำงานบน Cloudflare free plan ทั้งหมด: Workers + Static Assets, Durable Objects (SQLite), D1, Workers AI, Cron Triggers

## โครงสร้าง

| Path | หน้าที่ |
|---|---|
| `worker/index.ts` | API router, cookie ผู้เล่น, cron ดึงข่าว |
| `worker/company.ts` | Durable Object 1 ตัวต่อบริษัท: ค่าสถานะ, การตัดสินใจ, แชท |
| `worker/game.ts` | พนักงาน, stack บริษัท, prompt และตัวกรองผลลัพธ์ AI |
| `worker/news.ts` | ดึงข่าว KEV จาก NVD เก็บลง D1 |
| `worker/osv.ts` | ช่องโหว่ของ npm dependency สมมติ จาก OSV.dev |
| `worker/budget.ts` | นับ neurons ของ Workers AI ทั้งบัญชีต่อวัน |
| `worker/pool.ts` | cron นาทีที่ 47 สร้างฉากข่าวล่วงหน้าด้วยโควตาที่เหลือ |
| `worker/scripted.ts` | ฉากที่เขียนไว้แล้ว: วันไม่มีข่าว และสำรองตอนโควตาหมด |
| `shared/types.ts` | type ที่ใช้ร่วมกันระหว่าง Worker และ UI |
| `src/` | หน้าเว็บ React |
| `migrations/` | schema ของ D1 |

## รันในเครื่อง

```sh
npm install
npx wrangler login          # Workers AI ใน local dev เรียกของจริงบน Cloudflare (ใช้โควตาฟรี)
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
- โควตา Workers AI ฟรีคือ 10,000 neurons/วัน ต่อทั้งบัญชี เกมนับ neurons ที่ใช้ไว้ใน D1 (`worker/budget.ts`) และหยุดเรียก AI ที่ 9,000 เพื่อเผื่อค่าประมาณคลาดเคลื่อน รีเซ็ต 00:00 UTC (07:00 น. เวลาไทย)
- เมื่อโควตาหมด เกมยังเล่นต่อได้: ฉากข่าวที่ cron สร้างไว้ล่วงหน้า (`worker/pool.ts`, ตาราง `scene_pool`) และฉากที่เขียนไว้แล้ว (`worker/scripted.ts`)
- วันที่ไม่มีข่าว ใช้ฉากที่เขียนไว้แล้วเสมอ ไม่เรียก AI
