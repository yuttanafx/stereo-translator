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
1. ใส่ **Gemini API Key** (ขอฟรีที่ aistudio.google.com/app/apikey)
2. เลือกภาษา + เสียงแต่ละหู (เสียงจะดึงจากระบบ/เบราว์เซอร์ของคุณอัตโนมัติ)
3. กดไมค์ → พูด → รอ → กด ▶

## Tech Stack
- **Next.js 14** (App Router)
- **Web Speech API — SpeechRecognition** — รับเสียง (STT)
- **Google Gemini 2.5 Flash** (ผ่าน AI Studio API key) — แปลภาษา ฟรีและเร็ว
  - หมายเหตุ: `gemini-2.0-flash` ถูก Google ปลดระวางแล้ว (ปิดให้บริการ 1 มิ.ย. 2026)
    ถ้าเจอ error 429/404 ในอนาคต ให้เช็ครายชื่อโมเดลล่าสุดที่ ai.google.dev/gemini-api/docs/models
- **Web Speech API — SpeechSynthesis** — อ่านออกเสียง (TTS) ฟรี ทำงานในเบราว์เซอร์ ไม่ต้องมี backend
- เล่นเสียงทีละหู: ◀ หูซ้าย = ต้นทาง, หูขวา ▶ = แปลแล้ว
  - หมายเหตุ: Web Speech API ไม่ส่งคืน audio buffer ให้ใช้ AudioContext StereoPanner ได้ตรงๆ
    เหมือน MP3 ของ TTS API ทั่วไป ดังนั้นแอปนี้จึง "เล่นสลับหู" ทีละข้างแทนการ pan
    สัญญาณเสียงเดียวพร้อมกันสองหูจริง
