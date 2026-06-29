# 🎧 Stereo Voice Translator

แปลภาษาด้วยเสียง แยกหูซ้าย-ขวาจริง ผ่าน Bluetooth Headphone

## Deploy บน Vercel (วิธีง่ายที่สุด)

### วิธีที่ 1: Drag & Drop (ไม่ต้อง GitHub)
1. ไปที่ https://vercel.com/new
2. ลาก folder `stereo-translator` ทั้ง folder ไปวาง
3. กด Deploy — เสร็จใน 1 นาที!

### วิธีที่ 2: ผ่าน GitHub
1. สร้าง repo ใหม่บน GitHub
2. อัปโหลดไฟล์ทั้งหมดเข้า repo
3. ไปที่ vercel.com/new → Import GitHub repo → Deploy

## ใช้งาน
1. ใส่ **Anthropic API Key** (claude.ai → API Keys)
2. ใส่ **OpenAI API Key** (platform.openai.com → API Keys)
3. เลือกภาษา + เสียงแต่ละหู
4. กดไมค์ → พูด → รอ → กด ▶

## Tech Stack
- **Next.js 14** (App Router)
- **Web Speech API** — รับเสียง (STT)
- **Claude claude-sonnet-4-6** — แปลภาษา
- **OpenAI TTS** — สร้างเสียง
- **AudioContext StereoPanner** — แยกหูซ้าย/ขวาจริง
  - หูซ้าย pan = -1.0 (ต้นทาง)
  - หูขวา pan = +1.0 (แปลแล้ว)
