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
const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
const VOICE_LABELS: Record<string, string> = {
  alloy: 'Alloy (กลาง)', echo: 'Echo (ชาย)', fable: 'Fable (อังกฤษ)',
  onyx: 'Onyx (ชายลึก)', nova: 'Nova (หญิง)', shimmer: 'Shimmer (หญิงนุ่ม)',
}

export default function Home() {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey]       = useState('')
  const [srcLang, setSrcLang]           = useState('en')
  const [tgtLang, setTgtLang]           = useState('th')
  const [voiceSrc, setVoiceSrc]         = useState('nova')
  const [voiceTgt, setVoiceTgt]         = useState('echo')
  const [playMode, setPlayMode]         = useState<'sequential'|'simultaneous'>('sequential')
  const [srcText, setSrcText]           = useState('')
  const [tgtText, setTgtText]           = useState('')
  const [status, setStatus]             = useState('')
  const [statusType, setStatusType]     = useState('')
  const [isRecording, setIsRecording]   = useState(false)
  const [isPlaying, setIsPlaying]       = useState(false)
  const [ready, setReady]               = useState(false)
  const [barL, setBarL]                 = useState(0)
  const [barR, setBarR]                 = useState(0)
  const [micHint, setMicHint]           = useState('กดเพื่อเริ่มพูด')

  const recognitionRef  = useRef<any>(null)
  const audioCtxRef     = useRef<AudioContext | null>(null)
  const srcAudioRef     = useRef<ArrayBuffer | null>(null)
  const tgtAudioRef     = useRef<ArrayBuffer | null>(null)
  const vizRef          = useRef<ReturnType<typeof setInterval> | null>(null)
  const currentSrcRef   = useRef('')
  const currentTgtRef   = useRef('')

  useEffect(() => {
    const ant = localStorage.getItem('ant_key') || ''
    const oai = localStorage.getItem('oai_key') || ''
    if (ant) setAnthropicKey(ant)
    if (oai) setOpenaiKey(oai)
  }, [])

  function saveKeys() {
    localStorage.setItem('ant_key', anthropicKey)
    localStorage.setItem('oai_key', openaiKey)
    showStatus('✓ บันทึก API Keys แล้ว', 'done')
    setTimeout(() => showStatus(''), 2000)
  }

  function showStatus(msg: string, type = '') {
    setStatus(msg); setStatusType(type)
  }

  function swapLangs() {
    setSrcLang(tgtLang); setTgtLang(srcLang)
  }

  function getAudioCtx() {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  // ── Mic ──────────────────────────────────────────────────────────────────
  function toggleMic() {
    if (isRecording) stopMic()
    else startMic()
  }

  function startMic() {
    if (!anthropicKey) { showStatus('⚠ ใส่ Anthropic API Key ก่อน', 'error'); return }
    if (!openaiKey)    { showStatus('⚠ ใส่ OpenAI API Key ก่อน', 'error'); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { showStatus('⚠ Browser ไม่รองรับ Speech Recognition', 'error'); return }

    const rec = new SR()
    rec.lang = LANG_STT[srcLang] || 'en-US'
    rec.interimResults = true
    rec.continuous = false
    recognitionRef.current = rec

    rec.onstart = () => {
      setIsRecording(true)
      setMicHint('กำลังฟัง… พูดได้เลย')
      showStatus('🎙 รับเสียง…', 'active')
      setReady(false)
      srcAudioRef.current = null
      tgtAudioRef.current = null
    }
    rec.onresult = (e: any) => {
      let final = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setSrcText(final || interim)
      if (final) { currentSrcRef.current = final; doTranslate(final) }
    }
    rec.onerror = (e: any) => { showStatus('⚠ ' + e.error, 'error'); stopMic() }
    rec.onend = () => stopMic()
    rec.start()
  }

  function stopMic() {
    setIsRecording(false)
    setMicHint('กดเพื่อเริ่มพูด')
    try { recognitionRef.current?.stop() } catch {}
  }

  // ── Translate ─────────────────────────────────────────────────────────────
  async function doTranslate(text: string) {
    showStatus('🔄 กำลังแปลด้วย Claude…', 'active')
    const srcName = LANG_NAMES[srcLang] || 'English'
    const tgtName = LANG_NAMES[tgtLang] || 'Thai'
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [{ role: 'user', content: `Translate from ${srcName} to ${tgtName}. Return ONLY the translated text.\n\n${text}` }],
        }),
      })
      if (!resp.ok) throw new Error('Claude API ' + resp.status)
      const data = await resp.json()
      const translated = data.content?.[0]?.text?.trim() || ''
      currentTgtRef.current = translated
      setTgtText(translated)
      await buildTTS(text, translated)
    } catch (err: any) {
      showStatus('⚠ ' + err.message, 'error')
    }
  }

  // ── TTS ───────────────────────────────────────────────────────────────────
  async function fetchTTS(text: string, voice: string): Promise<ArrayBuffer> {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
      body: JSON.stringify({ model: 'tts-1', input: text, voice, response_format: 'mp3' }),
    })
    if (!resp.ok) throw new Error('OpenAI TTS ' + resp.status)
    return resp.arrayBuffer()
  }

  async function buildTTS(src: string, tgt: string) {
    showStatus('🎵 กำลังสร้างเสียง TTS…', 'active')
    try {
      const [srcBuf, tgtBuf] = await Promise.all([
        fetchTTS(src, voiceSrc),
        fetchTTS(tgt, voiceTgt),
      ])
      srcAudioRef.current = srcBuf
      tgtAudioRef.current = tgtBuf
      showStatus('✓ พร้อมแล้ว! กด ▶ เพื่อฟัง', 'done')
      setReady(true)
    } catch (err: any) {
      showStatus('⚠ TTS: ' + err.message, 'error')
    }
  }

  // ── Play stereo ───────────────────────────────────────────────────────────
  function playPanned(buf: ArrayBuffer, pan: number): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const ctx = getAudioCtx()
      try {
        const decoded = await ctx.decodeAudioData(buf.slice(0))
        const source  = ctx.createBufferSource()
        source.buffer = decoded
        const panner  = ctx.createStereoPanner()
        panner.pan.value = pan
        source.connect(panner)
        panner.connect(ctx.destination)
        source.onended = () => resolve()
        source.start(0)
      } catch (e) { reject(e) }
    })
  }

  function startViz(l: boolean, r: boolean) {
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

  async function playStereo() {
    if (!srcAudioRef.current || !tgtAudioRef.current) return
    setIsPlaying(true)
    try {
      if (playMode === 'sequential') {
        showStatus('◀ หูซ้าย — เสียงต้นทาง', 'active')
        startViz(true, false)
        await playPanned(srcAudioRef.current, -1.0)
        stopViz()
        await sleep(400)
        showStatus('▶ หูขวา — เสียงแปล', 'active')
        startViz(false, true)
        await playPanned(tgtAudioRef.current, +1.0)
        stopViz()
      } else {
        showStatus('⊕ ทั้งสองหูพร้อมกัน', 'active')
        startViz(true, true)
        await Promise.all([
          playPanned(srcAudioRef.current, -1.0),
          playPanned(tgtAudioRef.current, +1.0),
        ])
        stopViz()
      }
      showStatus('✓ เล่นเสร็จแล้ว 🎧', 'done')
    } catch (err: any) {
      stopViz(); showStatus('⚠ ' + err.message, 'error')
    } finally {
      setIsPlaying(false)
    }
  }

  function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

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
          <div style={{ fontSize:11, letterSpacing:4, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>True Stereo</div>
          <h1 style={{ fontSize:24, fontWeight:700 }}>🎧 Stereo Translator</h1>
          <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:8 }}>
            <span style={{ fontSize:11, fontWeight:600, letterSpacing:1.5, padding:'3px 12px', borderRadius:20, background:'var(--left-dim)', color:'var(--left)', textTransform:'uppercase' }}>◀ L · ต้นทาง</span>
            <span style={{ fontSize:11, fontWeight:600, letterSpacing:1.5, padding:'3px 12px', borderRadius:20, background:'var(--right-dim)', color:'var(--right)', textTransform:'uppercase' }}>R ▶ · แปลแล้ว</span>
          </div>
        </div>

        {/* API Keys */}
        <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:'var(--muted)', textTransform:'uppercase', marginBottom:10 }}>🔑 API Keys</div>
          {[['Anthropic', anthropicKey, setAnthropicKey, 'sk-ant-...'],['OpenAI TTS', openaiKey, setOpenaiKey, 'sk-...']].map(([label, val, setter, ph]: any) => (
            <div key={label} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'var(--muted)', width:85, flexShrink:0 }}>{label}</span>
              <input type="password" value={val} onChange={e => setter(e.target.value)} placeholder={ph}
                style={{ flex:1, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:12, outline:'none' }} />
            </div>
          ))}
          <button onClick={saveKeys} style={{ marginTop:4, background:'var(--left-dim)', border:'1px solid var(--left)', color:'var(--left)', borderRadius:8, padding:'8px 16px', fontFamily:"'Space Grotesk',sans-serif", fontSize:12, fontWeight:600, cursor:'pointer' }}>💾 บันทึก Keys</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display:'flex', gap:6, width:'100%', maxWidth:480, marginBottom:12 }}>
          {(['sequential','simultaneous'] as const).map(m => (
            <button key={m} onClick={() => setPlayMode(m)}
              style={{ flex:1, padding:'8px', borderRadius:8, border:'1px solid', borderColor: playMode===m ? 'var(--left)' : 'var(--border)', background: playMode===m ? 'var(--left-dim)' : 'transparent', color: playMode===m ? 'var(--left)' : 'var(--muted)', fontFamily:"'Space Grotesk',sans-serif", fontSize:11, fontWeight:600, cursor:'pointer' }}>
              {m === 'sequential' ? '▶▶ เล่นต่อกัน' : '⊕ พร้อมกันสองหู'}
            </button>
          ))}
        </div>

        {/* Language selector */}
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 16px', width:'100%', maxWidth:480, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:10, letterSpacing:1.5, color:'var(--muted)', textTransform:'uppercase', display:'block', marginBottom:3 }}>ต้นทาง (หูซ้าย)</label>
            <select value={srcLang} onChange={e => setSrcLang(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:600, outline:'none', cursor:'pointer', width:'100%' }}>
              {Object.entries(LANG_NAMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button onClick={swapLangs} style={{ background:'var(--border)', border:'none', color:'var(--muted)', width:34, height:34, borderRadius:'50%', cursor:'pointer', fontSize:15, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>⇄</button>
          <div style={{ flex:1, textAlign:'right' }}>
            <label style={{ fontSize:10, letterSpacing:1.5, color:'var(--muted)', textTransform:'uppercase', display:'block', marginBottom:3 }}>เป้าหมาย (หูขวา)</label>
            <select value={tgtLang} onChange={e => setTgtLang(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:14, fontWeight:600, outline:'none', cursor:'pointer', width:'100%', textAlign:'right' }}>
              {Object.entries(LANG_NAMES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        {/* Voice pickers */}
        <div style={{ display:'flex', gap:8, width:'100%', maxWidth:480, marginBottom:14 }}>
          {[['◀ L เสียงต้นทาง', voiceSrc, setVoiceSrc, 'var(--left)'],['R ▶ เสียงแปล', voiceTgt, setVoiceTgt, 'var(--right)']].map(([label, val, setter, color]: any) => (
            <div key={label} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 12px' }}>
              <label style={{ fontSize:10, letterSpacing:1.5, color, textTransform:'uppercase', display:'block', marginBottom:4 }}>{label}</label>
              <select value={val} onChange={e => setter(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:600, outline:'none', cursor:'pointer', width:'100%' }}>
                {VOICES.map(v => <option key={v} value={v}>{VOICE_LABELS[v]}</option>)}
              </select>
            </div>
          ))}
        </div>

        {/* Mic */}
        <div style={{ position:'relative', margin:'8px 0 10px', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <button onClick={toggleMic}
            style={{ width:76, height:76, borderRadius:'50%', border:`2px solid ${isRecording ? 'var(--left)' : 'var(--border)'}`, background: isRecording ? 'var(--left-dim)' : 'var(--surface)', color:'var(--text)', fontSize:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex:1, transition:'all 0.2s' }}>
            {isRecording ? '⏹' : '🎙️'}
          </button>
          {isRecording && (
            <div style={{ position:'absolute', inset:-14, borderRadius:'50%', border:'2px solid var(--left)', opacity:0.5, animation:'pulse 1.4s ease-out infinite' }} />
          )}
        </div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10, textAlign:'center' }}>{micHint}</div>
        <div style={{ fontSize:12, color: statusType==='error' ? 'var(--right)' : statusType==='done' ? '#4fff8f' : statusType==='active' ? 'var(--left)' : 'var(--muted)', marginBottom:12, height:16, textAlign:'center' }}>{status}</div>

        {/* Text panels */}
        <div style={{ display:'flex', gap:10, width:'100%', maxWidth:480, marginBottom:12 }}>
          {[['left','ต้นทาง', srcText,'var(--left)'],['right','แปลแล้ว', tgtText,'var(--right)']].map(([side, label, text, color]: any) => (
            <div key={side} style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:12, minHeight:90 }}>
              <div style={{ fontSize:10, fontWeight:600, letterSpacing:2, textTransform:'uppercase', color, display:'flex', alignItems:'center', gap:5, marginBottom:5 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:color, display:'inline-block' }} />{label}
              </div>
              <div style={{ fontSize:13, lineHeight:1.6, color: text ? 'var(--text)' : 'var(--muted)', wordBreak:'break-word' }}>
                {text || (side==='left' ? 'เสียงที่พูดจะปรากฏที่นี่…' : 'คำแปลจะปรากฏที่นี่…')}
              </div>
            </div>
          ))}
        </div>

        {/* Stereo visualizer */}
        <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px', marginBottom:12 }}>
          <div style={{ fontSize:10, letterSpacing:2, color:'var(--muted)', textTransform:'uppercase', marginBottom:12 }}>🎧 Stereo Output — Real AudioContext Panning</div>
          {[['L', barL, 'var(--left)', 'หูซ้าย'],['R', barR, 'var(--right)', 'หูขวา']].map(([side, val, color, desc]: any) => (
            <div key={side} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, width:14, textAlign:'center', color }}>{side}</span>
              <div style={{ flex:1, height:8, background:'var(--border)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, width: val+'%', background:`linear-gradient(90deg,${color},${color}88)`, transition:'width 0.08s ease' }} />
              </div>
              <span style={{ fontSize:11, color, width:50, textAlign:'right' }}>{desc}</span>
            </div>
          ))}
        </div>

        {/* Play button */}
        {ready && (
          <button onClick={playStereo} disabled={isPlaying}
            style={{ width:'100%', maxWidth:480, padding:13, borderRadius:12, border:'1px solid var(--border)', background:'linear-gradient(135deg,rgba(79,143,255,0.1),rgba(255,107,107,0.1))', color:'var(--text)', fontFamily:"'Space Grotesk',sans-serif", fontSize:13, fontWeight:600, cursor: isPlaying ? 'default' : 'pointer', opacity: isPlaying ? 0.5 : 1, marginBottom:10 }}>
            {isPlaying ? '⏳ กำลังเล่น…' : '🎧 เล่นสเตอริโอจริง (หูซ้าย = ต้นทาง · หูขวา = แปล)'}
          </button>
        )}

        <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:6, lineHeight:1.7 }}>
          Web Speech API → Claude (แปล) → OpenAI TTS → AudioContext StereoPanner<br/>
          หูซ้าย pan = -1.0 · หูขวา pan = +1.0 · รองรับ Bluetooth headphone
        </div>
      </div>
    </>
  )
}
