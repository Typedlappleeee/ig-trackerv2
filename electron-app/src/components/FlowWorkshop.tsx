// Workshop — créer une automatisation SANS coder, façon GeeLark.
//
// Principe (recorder INTELLIGENT, pas un bête rejeu de coordonnées) : on affiche
// l'écran live du tel ; quand tu cliques sur un bouton, on lit l'arbre UI et on
// enregistre l'ÉLÉMENT (texte/id/desc), pas la position. Au rejeu, le flow
// retrouve le bouton par son sens → résistant aux changements de layout/version.
import { useState, useRef, useEffect, useCallback } from 'react'
import { cloudPhones, type CpInstance } from '@/lib/cloudPhones'
import { dumpUi, matcherAt } from '@/lib/phoneAutomation'
import { runFlow, type Step, type Flow } from '@/lib/flowRunner'
import { upsertFlow, newFlowId, type Visibility } from '@/lib/flowStore'

interface Props { phones: CpInstance[]; userId: string; orgId: string | null; onSaved: () => void }

export function FlowWorkshop({ phones, userId, orgId, onSaved }: Props) {
  const [phoneId, setPhoneId] = useState('')
  const [snap, setSnap] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [labels, setLabels] = useState<string[]>([])   // libellé lisible par étape (aligné avec steps)
  const [name, setName] = useState('')
  const [recording, setRecording] = useState(false)
  const [busy, setBusy] = useState('')
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [visibility, setVisibility] = useState<Visibility>('private')
  const imgRef = useRef<HTMLImageElement>(null)
  const gestureRef = useRef<{ x: number; y: number; t: number } | null>(null)

  useEffect(() => { setPhoneId(p => p || phones[0]?.id || '') }, [phones])

  const refreshSnap = useCallback(async () => {
    if (!phoneId) return
    const r = await cloudPhones.screenshot(phoneId)
    if (r.ok && r.data?.dataUrl) setSnap(r.data.dataUrl)
  }, [phoneId])

  useEffect(() => { refreshSnap() }, [refreshSnap])
  // Rafraîchit l'aperçu régulièrement (léger, pour voir où on en est).
  useEffect(() => {
    if (!phoneId) return
    const t = window.setInterval(refreshSnap, 2500)
    return () => window.clearInterval(t)
  }, [phoneId, refreshSnap])

  const addStep = (s: Step, label: string) => { setSteps(v => [...v, s]); setLabels(v => [...v, label]) }
  const removeStep = (i: number) => { setSteps(v => v.filter((_, k) => k !== i)); setLabels(v => v.filter((_, k) => k !== i)) }
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= steps.length) return
    setSteps(v => { const a = [...v];[a[i], a[j]] = [a[j], a[i]]; return a })
    setLabels(v => { const a = [...v];[a[i], a[j]] = [a[j], a[i]]; return a })
  }

  // L'aperçu est une VRAIE télécommande : chaque geste agit sur le tel (tap =
  // clic bref, swipe = glisser). En mode enregistrement, on capture en plus :
  //   • un tap → étape « taper {élément} » (on lit l'ÉLÉMENT, pas la position),
  //   • un swipe → étape « swipe » (le défilement est positionnel par nature).
  const toDevice = (clientX: number, clientY: number) => {
    const img = imgRef.current
    if (!img || !img.naturalWidth) return null
    const r = img.getBoundingClientRect()
    return { x: Math.round((clientX - r.left) / r.width * img.naturalWidth), y: Math.round((clientY - r.top) / r.height * img.naturalHeight) }
  }
  const onDown = (e: React.PointerEvent<HTMLImageElement>) => {
    const p = toDevice(e.clientX, e.clientY)
    if (p) gestureRef.current = { ...p, t: performance.now() }
  }
  const onUp = async (e: React.PointerEvent<HTMLImageElement>) => {
    const start = gestureRef.current; gestureRef.current = null
    const end = toDevice(e.clientX, e.clientY)
    if (!start || !end || !phoneId) return
    const dist = Math.hypot(end.x - start.x, end.y - start.y)
    if (dist < 18) {
      // TAP : agit toujours ; capture l'élément si enregistrement
      await cloudPhones.shell(phoneId, `input tap ${start.x} ${start.y}`)
      if (recording) {
        setBusy('Lecture de l’élément…')
        const hit = matcherAt(await dumpUi(phoneId), start.x, start.y)
        setBusy('')
        if (hit) addStep({ do: 'tap', any: [hit.matcher], label: hit.label }, `Taper ${hit.label}`)
        else { setBusy('Élément non identifié — étape non ajoutée'); window.setTimeout(() => setBusy(''), 2200) }
      }
    } else {
      // SWIPE : navigue toujours ; enregistre le geste si enregistrement
      const dur = Math.min(600, Math.max(120, Math.round(performance.now() - start.t)))
      await cloudPhones.shell(phoneId, `input swipe ${start.x} ${start.y} ${end.x} ${end.y} ${dur}`)
      if (recording) addStep({ do: 'swipe', x1: start.x, y1: start.y, x2: end.x, y2: end.y, ms: dur }, 'Swipe')
    }
    window.setTimeout(refreshSnap, 650)
  }
  // Défilement rapide (boutons) : swipe vertical centré, relatif à la résolution.
  const scroll = (dir: 'down' | 'up') => {
    const img = imgRef.current
    if (!img?.naturalWidth || !phoneId) return
    const W = img.naturalWidth, H = img.naturalHeight, cx = Math.round(W / 2)
    const y1 = Math.round(H * (dir === 'down' ? 0.72 : 0.28))
    const y2 = Math.round(H * (dir === 'down' ? 0.28 : 0.72))
    cloudPhones.shell(phoneId, `input swipe ${cx} ${y1} ${cx} ${y2} 300`)
    if (recording) addStep({ do: 'swipe', x1: cx, y1, x2: cx, y2, ms: 300 }, dir === 'down' ? 'Défiler ↓' : 'Défiler ↑')
    window.setTimeout(refreshSnap, 650)
  }

  const addType = () => { const t = window.prompt('Texte à écrire (emoji ok) :'); if (t) addStep({ do: 'type', text: t }, `Écrire « ${t} »`) }
  const addWait = () => { const s = window.prompt('Attendre combien de secondes ?', '2'); const ms = Math.round((Number(s) || 0) * 1000); if (ms > 0) addStep({ do: 'wait', ms }, `Attendre ${ms / 1000}s`) }
  const addOpen = () => { const p = window.prompt('Package de l’app à ouvrir :', 'com.instagram.android'); if (p) addStep({ do: 'open', pkg: p.trim() }, `Ouvrir ${p.trim()}`) }
  const addPopups = () => addStep({ do: 'popups' }, 'Fermer les popups')
  const addBack = () => addStep({ do: 'key', key: 'back' }, 'Retour')

  const test = async () => {
    if (!phoneId || !steps.length) return
    setRunning(true); setLog([])
    const flow: Flow = { id: 'test', name: name || 'Test', steps }
    const res = await runFlow(phoneId, flow, { log: m => setLog(l => [...l, m]) })
    setRunning(false)
    if (!res.ok) setLog(l => [...l, `❌ Bloqué à : ${res.failedAt}`])
    refreshSnap()
  }

  const save = async () => {
    if (!name.trim() || !steps.length) { setBusy('Donne un nom et au moins une étape'); window.setTimeout(() => setBusy(''), 2500); return }
    setBusy('Enregistrement…')
    const flow: Flow = { id: newFlowId(), name: name.trim(), steps, official: false }
    const res = await upsertFlow(flow, { userId, orgId, visibility })
    if (res.ok) {
      setBusy(visibility === 'community' ? '✓ Publié dans la communauté' : '✓ Automatisation enregistrée')
      onSaved()
      window.setTimeout(() => setBusy(''), 2500)
    } else setBusy(`Échec : ${res.error}`)
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Écran live du tel */}
      <div style={{ flex: '0 0 260px' }}>
        <select value={phoneId} onChange={e => setPhoneId(e.target.value)} style={selectStyle}>
          {phones.length === 0 && <option>Aucun tel en ligne</option>}
          {phones.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: '#050609', aspectRatio: '9/16', display: 'grid', placeItems: 'center' }}>
          {snap
            ? <img ref={imgRef} src={snap} alt="écran" draggable={false} onPointerDown={onDown} onPointerUp={onUp}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }} />
            : <span style={{ fontSize: 11, color: '#6b6b7c' }}>…</span>}
        </div>
        {/* Navigation : défilement + retour/accueil + rafraîchir */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <TB onClick={() => scroll('down')}>⬇︎ Défiler</TB>
          <TB onClick={() => scroll('up')}>⬆︎ Défiler</TB>
          <TB onClick={() => { if (phoneId) cloudPhones.shell(phoneId, 'input keyevent 4'); window.setTimeout(refreshSnap, 650) }}>◁ Retour</TB>
          <TB onClick={() => { if (phoneId) cloudPhones.shell(phoneId, 'input keyevent 3'); window.setTimeout(refreshSnap, 650) }}>○ Accueil</TB>
          <TB onClick={refreshSnap}>↻</TB>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: recording ? '#34D399' : '#c8c8d8', cursor: 'pointer', fontWeight: recording ? 800 : 400 }}>
          <input type="checkbox" checked={recording} onChange={e => setRecording(e.target.checked)} />
          🔴 Mode enregistrement {recording ? '(ON — tes gestes créent des étapes)' : '(OFF)'}
        </label>
        <p style={{ fontSize: 10.5, color: '#6b6b7c', margin: '6px 0 0', lineHeight: 1.5 }}>L’écran est une télécommande live : <b>clique</b> = tap, <b>glisse</b> = swipe. En mode enregistrement, un tap capture <b>l’élément</b> (pas la position) → robuste au rejeu.</p>
      </div>

      {/* Étapes + actions */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <TB onClick={addType}>➕ Écrire</TB>
          <TB onClick={addWait}>➕ Attendre</TB>
          <TB onClick={addOpen}>➕ Ouvrir app</TB>
          <TB onClick={addBack}>➕ Retour</TB>
          <TB onClick={addPopups}>➕ Fermer popups</TB>
        </div>

        <div style={{ borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', minHeight: 120, padding: 8 }}>
          {steps.length === 0
            ? <p style={{ fontSize: 12, color: '#6b6b7c', textAlign: 'center', margin: '30px 0' }}>Clique sur l’écran ou ajoute des étapes ci-dessus.</p>
            : steps.map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, background: 'rgba(0,0,0,0.25)', marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#6b6b7c', width: 18 }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 12, color: '#E9E9F2' }}>{labels[i]}</span>
                <button onClick={() => move(i, -1)} style={iconBtn}>↑</button>
                <button onClick={() => move(i, 1)} style={iconBtn}>↓</button>
                <button onClick={() => removeStep(i)} style={{ ...iconBtn, color: '#F87171' }}>✕</button>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l’automatisation" style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          <select value={visibility} onChange={e => setVisibility(e.target.value as Visibility)} style={{ ...inputStyle, width: 'auto' }} title="Visibilité">
            <option value="private">🔒 Privé</option>
            {orgId && <option value="org">🏢 Mon agence</option>}
            <option value="community">🌍 Communauté</option>
          </select>
          <button onClick={test} disabled={running || !steps.length} style={{ ...ghost, opacity: (running || !steps.length) ? 0.5 : 1 }}>{running ? '⏳' : '▶️ Tester'}</button>
          <button onClick={save} style={primary}>💾 Enregistrer</button>
        </div>
        {busy && <div style={{ fontSize: 11.5, color: busy.startsWith('✓') ? '#34D399' : '#c8c8d8', marginTop: 8 }}>{busy}</div>}
        {log.length > 0 && (
          <div style={{ marginTop: 10, padding: 8, borderRadius: 8, background: 'rgba(0,0,0,0.3)', maxHeight: 160, overflowY: 'auto', fontSize: 11, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap', color: '#c8c8d8' }}>
            {log.map((l, i) => <div key={i} style={{ color: l.startsWith('✅') ? '#34D399' : l.startsWith('❌') ? '#F87171' : l.startsWith('  ✗') ? '#FBBF24' : '#c8c8d8' }}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '8px 10px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.35)', color: '#E9E9F2' }
const inputStyle: React.CSSProperties = { ...selectStyle }
const primary: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: '#fff', cursor: 'pointer' }
const ghost: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)', color: '#d2d2e0', cursor: 'pointer' }
const iconBtn: React.CSSProperties = { width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#c8c8d8', cursor: 'pointer', fontSize: 12 }
function TB({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} style={ghost}>{children}</button>
}

export default FlowWorkshop
