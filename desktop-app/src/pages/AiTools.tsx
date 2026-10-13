// Outils IA : légendes et bios générées par lot (Groq), pseudos générés localement.
// Les résultats partent directement là où ils servent : banque de légendes, ou
// Warmup → Édition en masse (pseudos / bio pré-remplis via openTool).
import { useState } from 'react'
import { takeOpenArg, type OpenArg } from '@/lib/openTool'
import type { User } from '@supabase/supabase-js'
import type { Theme } from '@/lib/theme'
import type { OrgState } from '@/lib/data'
import type { PageKey } from '@/Shell'
import { supabase } from '@/lib/supabase'
import { useConnections } from '@/lib/connections'
import { generateBatch, genUsernames, type BatchKind } from '@/lib/ai'
import { Btn, Empty, FIELD, Icon, PageHead, Panel, PanelHead, Segmented, SkeletonRows, Toggle, toast, useNarrow } from '@/lib/ui'

type Tab = 'captions' | 'bios' | 'usernames'
const TONES = ['Séduisant', 'Drôle', 'Mystère', 'Lifestyle', 'Motivation'] as const
const COPY = 'M9 9h11v11H9z|M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'
const SPARK = 'M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z'

async function copy(text: string, msg = 'Copié.') {
  try { await navigator.clipboard.writeText(text); toast(msg, 'ok') } catch { toast('Copie impossible.', 'bad') }
}
const label = (t: string) => <span style={{ fontSize: 12, fontWeight: 500, color: '#8B8B94' }}>{t}</span>

export default function AiTools({ theme, user, org, onGo }: { theme: Theme; user: User; org: OrgState; onGo: (p: PageKey, arg?: OpenArg) => void }) {
  const conns = useConnections(user, org)
  const narrow = useNarrow(900)
  const [tab, setTab] = useState<Tab>(() => (takeOpenArg<{ tab?: Tab }>('ai')?.tab) ?? 'captions')
  const [niche, setNiche] = useState('Modèle FR, lifestyle')
  const [tone, setTone] = useState<string>('Séduisant')
  const [lang, setLang] = useState<'fr' | 'en'>('fr')
  const [n, setN] = useState('20')
  const [hashtags, setHashtags] = useState(true)
  const [name, setName] = useState('')
  const [base, setBase] = useState('lea')
  const [busy, setBusy] = useState(false)
  const [items, setItems] = useState<Record<Tab, string[]>>({ captions: [], bios: [], usernames: [] })
  const [sel, setSel] = useState<Set<number>>(new Set())
  const list = items[tab]
  const chosen = sel.size ? list.filter((_, i) => sel.has(i)) : list

  const switchTab = (t: Tab) => { setTab(t); setSel(new Set()) }
  async function run() {
    setSel(new Set())
    if (tab === 'usernames') { setItems(x => ({ ...x, usernames: genUsernames(base, Number(n)) })); return }
    if (!conns.groq) { toast('Ajoute ta clé Groq dans Réglages → Intégrations.', 'info', 6000); return }
    setBusy(true)
    const r = await generateBatch(conns.groq, tab as BatchKind, { niche, tone: tone.toLowerCase(), lang, n: Number(n), hashtags, name })
    setBusy(false)
    if (!r?.length) { toast('Génération impossible — vérifie ta clé Groq ou réessaie.', 'bad', 6000); return }
    setItems(x => ({ ...x, [tab]: r }))
  }
  async function saveCaptions() {
    const rows = chosen.map(c => ({ user_id: user.id, org_id: org.currentOrg?.id ?? null, title: c.slice(0, 40), content: c, used_count: 0 }))
    const { error } = await supabase.from('caption_bank').insert(rows)
    if (error) toast(`Échec : ${error.message}`, 'bad'); else toast(`${rows.length} légende(s) ajoutée(s) à ta banque.`, 'ok')
  }
  const toggle = (i: number) => setSel(s => { const x = new Set(s); x.has(i) ? x.delete(i) : x.add(i); return x })

  const SUBS: Record<Tab, string> = {
    captions: 'Des légendes de Reels dans le ton de ta niche, rangées dans ta banque en un clic.',
    bios: 'Des bios Instagram prêtes à coller ou à envoyer dans l’édition en masse.',
    usernames: 'Des @ valides et variés à partir d’un prénom, pour l’édition en masse.',
  }

  return (
    <div style={{ animation: 'aIn .3s cubic-bezier(0.16,1,0.3,1) both' }}>
      <PageHead title="Outils IA" sub="Génère en quelques secondes ce qui prend des heures à écrire." />
      <div style={{ marginBottom: 14 }}>
        <Segmented value={tab} onChange={switchTab} options={[{ v: 'captions', l: '✨ Légendes' }, { v: 'bios', l: '🖊 Bios' }, { v: 'usernames', l: '@ Pseudos' }]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'minmax(0,1fr)' : '340px minmax(0,1fr)', gap: 12, alignItems: 'start' }}>
        {/* Réglages */}
        <Panel theme={theme}>
          <PanelHead title={tab === 'captions' ? 'Légendes IA' : tab === 'bios' ? 'Bios IA' : 'Générateur de pseudos'} sub={SUBS[tab]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            {tab === 'usernames' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Prénom ou base')}<input value={base} onChange={e => setBase(e.target.value)} placeholder="ex. lea, chloe.paris" style={FIELD} /></label>
            ) : (<>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Niche')}<input value={niche} onChange={e => setNiche(e.target.value)} placeholder="ex. modèle FR, fitness, cosplay" style={FIELD} /></label>
              {tab === 'bios' && <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Prénom (optionnel)')}<input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Léa" style={FIELD} /></label>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Ton')}
                <Segmented sm value={tone} onChange={setTone} options={TONES.map(t => ({ v: t, l: t }))} />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Langue')}<Segmented sm value={lang} onChange={setLang} options={[{ v: 'fr', l: 'FR' }, { v: 'en', l: 'EN' }]} /></div>
                {tab === 'captions' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Hashtags')}<Toggle on={hashtags} onChange={setHashtags} /></div>}
              </div>
            </>)}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{label('Combien ?')}
              <Segmented sm value={n} onChange={setN} options={['10', '20', '30', '50'].map(v => ({ v, l: v }))} />
            </div>
            <Btn theme={theme} tone="primary" icon={SPARK} label={busy ? 'Génération…' : list.length ? 'Régénérer' : 'Générer'} disabled={busy} onClick={() => void run()} />
            {tab !== 'usernames' && !conns.loading && !conns.groq && (
              <div style={{ fontSize: 12.5, color: '#FCD34D', lineHeight: 1.5 }}>
                Il faut une clé Groq (gratuite).{' '}
                <button type="button" onClick={() => onGo('settings', { tab: 'integrations' })} style={{ border: 'none', background: 'none', color: '#EDEDEF', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 12.5 }}>L’ajouter dans Réglages</button>
              </div>
            )}
          </div>
        </Panel>

        {/* Résultats */}
        <Panel theme={theme}>
          <PanelHead title="Résultats" sub={list.length ? `${list.length} élément(s)${sel.size ? ` · ${sel.size} sélectionné(s)` : ''}` : 'Rien encore'}
            right={list.length > 0 ? (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn theme={theme} sm icon={COPY} label={sel.size ? 'Copier la sélection' : 'Tout copier'} onClick={() => void copy(chosen.join('\n'), `${chosen.length} élément(s) copié(s).`)} />
                {tab === 'captions' && <Btn theme={theme} sm tone="primary" label={`Ajouter ${chosen.length} à la banque`} onClick={() => void saveCaptions()} />}
                {tab === 'usernames' && <Btn theme={theme} sm tone="primary" label="Utiliser dans l’édition en masse" onClick={() => onGo('warmup', { tab: 'edit', usernames: chosen.join('\n') })} />}
              </span>
            ) : undefined} />
          {busy ? <SkeletonRows rows={6} /> : list.length === 0 ? (
            <Empty icon={SPARK} title="Lance une génération" text={tab === 'usernames' ? 'Entre un prénom à gauche puis clique sur « Générer ».' : 'Choisis ta niche et ton ton à gauche, puis clique sur « Générer ».'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 560, overflowY: 'auto' }}>
              {list.map((t, i) => {
                const on = sel.has(i)
                return (
                  <div key={`${i}-${t}`} onClick={() => toggle(i)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none', cursor: 'pointer', background: on ? 'rgba(139,124,246,0.08)' : 'transparent', animation: `aIn .3s ${Math.min(i, 20) * 0.02}s both` }}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, marginTop: 1, flexShrink: 0, borderRadius: 5, border: `1px solid ${on ? '#8B7CF6' : 'rgba(255,255,255,0.2)'}`, background: on ? '#8B7CF6' : 'transparent', color: '#fff' }}>{on && <Icon d="M20 6L9 17l-5-5" size={11} sw={2.6} />}</span>
                    <span data-no-tr style={{ flex: 1, fontSize: 13.5, lineHeight: 1.5, color: '#E4E4E7', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: tab === 'usernames' ? "'JetBrains Mono',monospace" : undefined }}>{tab === 'usernames' ? `@${t}` : t}</span>
                    {tab === 'bios' && <span style={{ fontSize: 11, color: t.length > 150 ? '#F87171' : '#52525B', marginTop: 3 }}>{t.length}/150</span>}
                    <span style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      {tab === 'bios' && <Btn theme={theme} sm label="Utiliser" onClick={() => onGo('warmup', { tab: 'edit', bio: t })} />}
                      <button type="button" aria-label="Copier" onClick={() => void copy(tab === 'usernames' ? t : t)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: '#161618', color: '#A1A1AA', cursor: 'pointer' }}><Icon d={COPY} size={12} /></button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
