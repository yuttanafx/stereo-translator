'use client'

import { useEffect, useRef, useState } from 'react'

const LANG_NAMES: Record<string, string> = {
  th: 'Thai', en: 'English', ja: 'Japanese',
  zh: 'Chinese', ko: 'Korean', fr: 'French', es: 'Spanish',
}
const LANG_STT: Record<string, string> = {
  th: 'th-TH', en: 'en-US', ja: 'ja-JP',
  zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', es: 'es-ES',
}
// BCP-47 prefixes used to auto-pick a matching system voice for each language
const LANG_VOICE_PREFIX: Record<string, string> = {
  th: 'th', en: 'en', ja: 'ja', zh: 'zh', ko: 'ko', fr: 'fr', es: 'es',
}

type Turn = { who: 'A' | 'B'; fromLang: string; toLang: string; original: string; translated: string }

export default function Home() {
  const [geminiKey, setGeminiKey]       = useState('')
  const [langA, setLangA]               = useState('en')   // person A's language → spoken out LEFT
  const [langB, setLangB]               = useState('th')   // person B's language → spoken out RIGHT
  const [voices, setVoices]             = useState<SpeechSynthesisVoice[]>([])
  const [voiceA, setVoiceA]             = useState('')
  const [voiceB, setVoiceB]             = useState('')
  const [activeSpeaker, setActiveSpeaker] = useState<'A' | 'B' | null>(null) // who is currently being listened to
  const [phase, setPhase]               = useState<'idle'|'listening'|'translating'|'speaking'>('idle')
  const [status, setStatus]             = useState('')
  const [statusType, setStatusType]     = useState('')
  const [history, setHistory]           = useState<Turn[]>([])
  const [barL, setBarL]                 = useState(0)
  const [barR, setBarR]                 = useState(0)

  const recognitionRef  = useRef<any>(null)
  const vizRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeSpeakerRef = useRef<'A' | 'B' | null>(null) // mirrors state for use inside async callbacks
  const phaseRef         = useRef<'idle'|'listening'|'translating'|'speaking'>('idle')

  useEffect(() => {
    const gem = localStorage.getItem('gemini_key') || ''
    if (gem) setGeminiKey(gem)

    const synth = (window as any).speechSynthesis
    if (!synth) return

    function loadVoices() {
      const list: SpeechSynthesisVoice[] = synth.getVoices()
      if (!list.length) return
      setVoices(list)
      const savedA = localStorage.getItem('voice_a') || ''
      const savedB = localStorage.getItem('voice_b') || ''
      setVoiceA(savedA && list.some(v => v.name === savedA) ? savedA : pickVoiceFor(langA, list))
      setVoiceB(savedB && list.some(v => v.name === savedB) ? savedB : pickVoiceFor(langB, list))
    }
    loadVoices()
    synth.onvoiceschanged = loadVoices
    return () => { synth.onvoiceschanged = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickVoiceFor(lang: string, list: SpeechSynthesisVoice[]) {
    const prefix = LANG_VOICE_PREFIX[lang] || lang
    const match = list.find(v => v.lang.toLowerCase().startsWith(prefix))
    return match ? match.name : (list[0]?.name || '')
  }

  useEffect(() => {
    if (!voices.length) return
    setVoiceA(prev => (prev && voices.some(v => v.name === prev && v.lang.toLowerCase().startsWith(LANG_VOICE_PREFIX[langA] || langA))) ? prev : pickVoiceFor(langA, voices))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langA, voices])

  useEffect(() => {
    if (!voices.length) return
    setVoiceB(prev => (prev && voices.some(v => v.name === prev && v.lang.toLowerCase().startsWith(LANG_VOICE_PREFIX[langB] || langB))) ? prev : pickVoiceFor(langB, voices))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langB, voices])

  function saveKeys() {
    localStorage.setItem('gemini_key', geminiKey)
    localStorage.setItem('voice_a', voiceA)
    localStorage.setItem('voice_b', voiceB)
    showStatus('✓ บันทึก API Key แล้ว', 'done')
    setTimeout(() => showStatus(''), 2000)
  }

  function showStatus(msg: string, type = '') {
    setStatus(msg); setStatusType(type)
  }

  function setPhaseBoth(p: 'idle'|'listening'|'translating'|'speaking') {
    phaseRef.current = p
    setPhase(p)
  }

  // ── Press-to-speak: tap A or B before speaking ──────────────────────────────
  function pressSpeaker(who: 'A' | 'B') {
    if (phaseRef.current !== 'idle') {
      // currently busy (listening/translating/speaking) — pressing again cancels
      stopListening()
      return
    }
    if (!geminiKey) { showStatus('⚠ ใส่ Gemini API Key ก่อน', 'error'); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { showStatus('⚠ Browser ไม่รองรับ Speech Recognition', 'error'); return }

    const lang = who === 'A' ? langA : langB
    const rec = new SR()
    rec.lang = LANG_STT[lang] || 'en-US'
    rec.interimResults = true
    rec.continuous = false
    recognitionRef.current = rec
    activeSpeakerRef.current = who
    setActiveSpeaker(who)

    rec.onstart = () => {
      setPhaseBoth('listening')
      showStatus(who === 'A' ? '🎙 A กำลังพูด…' : '🎙 B กำลังพูด…', 'active')
      startViz(who === 'A', who === 'B')
    }
    rec.onresult = (e: any) => {
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
      }
      if (final) handleFinalTranscript(who, final.trim())
    }
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') { resetIdle(); return }
      showStatus('⚠ ' + e.error, 'error')
      resetIdle()
    }
    rec.onend = () => {
      // if recognition ended without producing a final transcript, go back to idle
      if (activeSpeakerRef.current && phaseRef.current === 'listening') resetIdle()
    }
    rec.start()
  }

  function stopListening() {
    try { recognitionRef.current?.stop() } catch {}
    resetIdle()
  }

  function resetIdle() {
    stopViz()
    setPhaseBoth('idle')
    setActiveSpeaker(null)
    activeSpeakerRef.current = null
    showStatus('')
  }

  // ── Translate (Gemini 2.5 Flash) then speak the translation only ───────────
  async function handleFinalTranscript(who: 'A' | 'B', text: string) {
    setPhaseBoth('translating')
    stopViz()
    showStatus('🔄 กำลังแปล…', 'active')

    const fromLang = who === 'A' ? langA : langB
    const toLang   = who === 'A' ? langB : langA
    const fromName = LANG_NAMES[fromLang] || fromLang
    const toName    = LANG_NAMES[toLang] || toLang

    try {
      const resp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: `Translate from ${fromName} to ${toName}. Return ONLY the translated text, nothing else.\n\n${text}` }],
            }],
          }),
        }
      )
      if (!resp.ok) {
        const errBody = await resp.text().catch(() => '')
        throw new Error('Gemini API ' + resp.status + (errBody ? ': ' + errBody.slice(0, 120) : ''))
      }
      const data = await resp.json()
      const translated = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()
      if (!translated) throw new Error('ไม่ได้รับคำแปลจาก Gemini')

      setHistory(h => [...h, { who, fromLang, toLang, original: text, translated }])

      // speak the translation out the listener's ear: A speaks → B hears on the
      // language-B side (right), B speaks → A hears on the language-A side (left)
      setPhaseBoth('speaking')
      const outVoice = who === 'A' ? voiceB : voiceA
      const outLang  = toLang
      showStatus(who === 'A' ? '▶ หูขวา — คำแปลถึง B' : '◀ หูซ้าย — คำแปลถึง A', 'active')
      startViz(who === 'B', who === 'A') // output ear is the OTHER person's side
      await speak(translated, outVoice, outLang)
      stopViz()
      resetIdle()
    } catch (err: any) {
      showStatus('⚠ ' + err.message, 'error')
      resetIdle()
    }
  }

  // ── TTS (Web Speech API) ─────────────────────────────────────────────────
  function speak(text: string, voiceName: string, lang: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const synth = (window as any).speechSynthesis
      if (!synth) { reject(new Error('Browser ไม่รองรับ Speech Synthesis')); return }
      const utter = new SpeechSynthesisUtterance(text)
      const v = voices.find(v => v.name === voiceName)
      if (v) utter.voice = v
      utter.lang = v?.lang || LANG_STT[lang] || 'en-US'
      utter.onend = () => resolve()
      utter.onerror = (e: any) => reject(new Error(e?.error || 'พูดไม่สำเร็จ'))
      synth.cancel()
      synth.speak(utter)
    })
  }

  function startViz(l: boolean, r: boolean) {
    if (vizRef.current) clearInterval(vizRef.current)
    let lv = 0, rv = 0, ld = 1, rd = 1
    vizRef.current = setInterval(() => {
      if (l) { lv = Math.max(10, Math.min(92, lv + ld * (Math.random() * 14))); if (lv > 88 || lv < 12) ld *= -1 }
      if (r) { rv = Math.max(10, Math.min(92, rv + rd * (Math.random() * 14))); if (rv > 88 || rv < 12) rd *= -1 }
      setBarL(l ? lv : 0); setBarR(r ? rv : 0)
    }, 80)
  }

  function stopViz() {
    if (vizRef.current) clearInterval(vizRef.current)
    setBarL(0); setBarR(0)
  }

  // group voices by language prefix match, fall back to showing all
  function voicesFor(lang: string) {
    const prefix = LANG_VOICE_PREFIX[lang] || lang
    const matched = voices.filter(v => v.lang.toLowerCase().startsWith(prefix))
    return matched.length ? matched : voices
  }

  const busy = phase !== 'idle'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;600;700&display=swap');
        :root{--bg:#0a0a0f;--surface:#13131a;--border:#1e1e2e;--left:#4f8fff;--right:#ff6b6b;--left-dim:rgba(79,143,255,0.12);--right-dim:rgba(255,107,107,0.12);--text:#e8e8f0;--muted:#6b6b80}
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:var(--bg);color:var(--text);font-family:'Space Grotesk',sans-serif}
        select option{background:#1a1a28}
        @keyframes pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.7);opacity:0}}
      `}</style>

      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', padding:'24px 16px', background:'var(--bg)', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif" }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:11, letterSpacing:4, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>Live Conversation</div>
          <h1 style={{ fontSize:24, fontWeight:700 }}>🎧 Stereo Translator</h1>
          <div style={{ fontSize:12, color:'var(--muted)', marginTop:8, lineHeight:1.6 }}>
            กดปุ่มของคนที่จะพูดก่อนพูดทุกครั้ง พูดจบ ระบบแปล+พูดออกอัตโนมัติ
          </div>
        </div>

        {/* API Key */}
        <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:'var(--muted)', textTransform:'uppercase', marginBottom:10 }}>🔑 Gemini API Key</div>
          <div style={{ display:'flex', gap:8, marginBottom:6, alignItems:'center' }}>
            <span style={{ fontSize:11, color:'var(--muted)', width:85, flexShrink:0 }}>Gemini</span>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..."
              style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:12, outline:'none' }} />
          </div>
          <div style={{ fontSize:10.5, color:'var(--muted)', marginBottom:8, lineHeight:1.5 }}>
            ขอฟรีได้ที่ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color:'var(--left)' }}>aistudio.google.com/app/apikey</a>
          </div>
          <button onClick={saveKeys} style={{ marginTop:4, background:'var(--left-dim)', border:'1px solid var(--left)', color:'var(--left)', borderRadius:8, padding:'8px 16px', fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:600, cursor:'pointer' }}>💾 บันทึก Key</button>
        </div>

        {/* Language selector for A / B */}
        <div style={{ display:'flex', gap:8, width:'100%', maxWidth:480, marginBottom:12 }}>
          {[['A', langA, setLangA, 'var(--left)'],['B', langB, setLangB, 'var(--right)']].map(([label, val, setter, color]: any) => (
            <div key={label} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px' }}>
              <label style={{ fontSize:10, letterSpacing:1.5, color, textTransform:'uppercase', display:'block', marginBottom:4 }}>คน {label} พูดภาษา</label>
              <select value={val} onChange={e => setter(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:13.5, fontWeight:600, outline:'none', cursor:'pointer', width:'100%' }}>
                {Object.entries(LANG_NAMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Voice pickers */}
        <div style={{ display:'flex', gap:8, width:'100%', maxWidth:480, marginBottom:6 }}>
          {[['◀ เสียง A', voiceA, setVoiceA, 'var(--left)', langA],['เสียง B ▶', voiceB, setVoiceB, 'var(--right)', langB]].map(([label, val, setter, color, lang]: any) => (
            <div key={label} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px' }}>
              <label style={{ fontSize:10, letterSpacing:1.5, color, textTransform:'uppercase', display:'block', marginBottom:4 }}>{label}</label>
              {voicesFor(lang).length ? (
                <select value={val} onChange={e => setter(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:12.5, fontWeight:600, outline:'none', cursor:'pointer', width:'100%' }}>
                  {voicesFor(lang).map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
                </select>
              ) : (
                <div style={{ fontSize:11.5, color:'var(--muted)' }}>กำลังโหลดเสียง…</div>
              )}
            </div>
          ))}
        </div>
        <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center', marginBottom:18, lineHeight:1.5 }}>
          เสียงมาจากระบบ/เบราว์เซอร์ของคุณ — รายการอาจต่างกันในแต่ละเครื่อง
        </div>

        {/* Press-to-speak buttons */}
        <div style={{ display:'flex', gap:14, width:'100%', maxWidth:480, marginBottom:16, justifyContent:'center' }}>
          {(['A','B'] as const).map(who => {
            const color = who === 'A' ? 'var(--left)' : 'var(--right)'
            const dim   = who === 'A' ? 'var(--left-dim)' : 'var(--right-dim)'
            const thisActive = activeSpeaker === who
            const disabled = busy && !thisActive
            return (
              <div key={who} style={{ position:'relative', flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}>
                <button onClick={() => pressSpeaker(who)} disabled={disabled}
                  style={{
                    width:'100%', aspectRatio:'1', maxWidth:130, borderRadius:'50%',
                    border:`2px solid ${thisActive ? color : 'var(--border)'}`,
                    background: thisActive ? dim : 'var(--surface)',
                    color: disabled ? 'var(--muted)' : 'var(--text)',
                    fontSize:15, fontWeight:700, cursor: disabled ? 'default' : 'pointer',
                    opacity: disabled ? 0.4 : 1,
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4,
                    position:'relative', zIndex:1, transition:'all 0.2s',
                  }}>
                  <span style={{ fontSize:24 }}>{thisActive && phase === 'listening' ? '⏹' : '🎙️'}</span>
                  <span>{who}</span>
                </button>
                {thisActive && phase === 'listening' && (
                  <div style={{ position:'absolute', top:0, width:'100%', maxWidth:130, aspectRatio:'1', borderRadius:'50%', border:`2px solid ${color}`, opacity:0.5, animation:'pulse 1.4s ease-out infinite' }} />
                )}
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:8, textAlign:'center' }}>
                  {LANG_NAMES[who === 'A' ? langA : langB]}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize:12, minHeight:16, marginBottom:14, textAlign:'center', color: statusType==='error' ? 'var(--right)' : statusType==='done' ? '#4fff8f' : statusType==='active' ? 'var(--left)' : 'var(--muted)' }}>{status}</div>

        {/* Stereo visualizer */}
        <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:'var(--muted)', textTransform:'uppercase', marginBottom:12 }}>🎧 เสียงออกหู — ตามภาษาปลายทาง</div>
          {[['L', barL, 'var(--left)', LANG_NAMES[langA]],['R', barR, 'var(--right)', LANG_NAMES[langB]]].map(([side, val, color, desc]: any) => (
            <div key={side} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, width:14, textAlign:'center', color }}>{side}</span>
              <div style={{ flex:1, height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, width: val+'%', background:`linear-gradient(90deg,${color},${color}88)`, transition:'width 0.08s ease' }} />
              </div>
              <span style={{ fontSize:11, color, width:60, textAlign:'right' }}>{desc}</span>
            </div>
          ))}
        </div>

        {/* Conversation history */}
        {history.length > 0 && (
          <div style={{ width:'100%', maxWidth:480, marginBottom:12, display:'flex', flexDirection:'column', gap:8 }}>
            {history.slice().reverse().map((t, i) => {
              const color = t.who === 'A' ? 'var(--left)' : 'var(--right)'
              return (
                <div key={i} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:12 }}>
                  <div style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, textTransform:'uppercase', color, marginBottom:5 }}>
                    {t.who} พูด ({LANG_NAMES[t.fromLang] || t.fromLang})
                  </div>
                  <div style={{ fontSize:13, color:'var(--text)', marginBottom:6, wordBreak:'break-word' }}>{t.original}</div>
                  <div style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, textTransform:'uppercase', color:'var(--muted)', marginBottom:5 }}>
                    แปลถึง {t.who === 'A' ? 'B' : 'A'} ({LANG_NAMES[t.toLang] || t.toLang})
                  </div>
                  <div style={{ fontSize:13, color:'var(--text)', wordBreak:'break-word' }}>{t.translated}</div>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:6, lineHeight:1.7 }}>
          Web Speech API (ฟัง) → Gemini 2.5 Flash (แปล) → Web Speech API (พูด)<br/>
          A พูด → แปล → พูดออกหู R (ฝั่ง B) · B พูด → แปล → พูดออกหู L (ฝั่ง A)
        </div>
      </div>
    </>
  )
}
