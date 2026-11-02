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

## Deploy (ยังไม่ได้ทำ)

1. `npx wrangler d1 create wedeb-db` แล้วนำ `database_id` ไปใส่ใน `wrangler.jsonc`
2. `npx wrangler d1 migrations apply wedeb-db --remote`
3. `npm run build && npx wrangler deploy`

## หลักที่ต้องยึด

- ข้อเท็จจริงของข่าวมาจาก feed เท่านั้น (SecBot สร้างจากข้อมูล ไม่ผ่าน AI) ส่วนบริษัทและพนักงานเป็นเรื่องสมมติ
- ไม่สร้าง exploit อธิบายแค่ผลกระทบ การแก้ไข และการตรวจจับ
- ข้อมูลทั้งหมดอยู่บน Cloudflare และ GitHub เท่านั้น ไม่ใช้ CDN, ฟอนต์ หรือ analytics ภายนอก
- จำกัด 20 รอบต่อบริษัทต่อวัน (~52 neurons ต่อรอบ) เพื่อให้อยู่ในโควตา Workers AI ฟรี 10,000 neurons/วัน
