/**
 * NotificationChannels — configuration des alertes externes (Telegram / Discord / email).
 * Auto-géré : charge et enregistre `notification_settings` dans org_config (si une org
 * est active) ou app_config (solo). Bouton « Tester » qui envoie un message réel via /api/notify.
 */
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/lib/orgContext'
import { ACCENT, ACCENT_L, TEXT_1 as IVORY, TEXT_2 as MUTED, TEXT_3 as FAINT, HAIR, OK, ERR } from '@/lib/theme'
import { useTr } from '@/lib/i18n'

interface NotifySettings {
  telegram_token?: string
  telegram_chat?: string
  discord_webhook?: string
  email?: string
  events?: Record<string, boolean>
}

const EVENT_DEFS: { key: string; label: string; labelEn: string; desc: string; descEn: string }[] = [
  { key: 'account_flagged', label: 'Compte bloqué / shadowban', labelEn: 'Account blocked / shadowban', desc: 'Un compte vient d’être détecté bloqué ou en shadowban', descEn: 'An account was just detected as blocked or shadowbanned' },
  { key: 'task_paused', label: 'Tâche mise en pause', labelEn: 'Task paused', desc: 'Crédits épuisés ou pool de vidéos vide', descEn: 'Out of credits or empty video pool' },
  { key: 'post_failed', label: 'Publication échouée', labelEn: 'Post failed', desc: 'Un post programmé a échoué', descEn: 'A scheduled post failed' },
  { key: 'batch_done',  label: 'Batch terminé',       labelEn: 'Batch finished',   desc: 'Un mass posting se termine', descEn: 'A mass posting run just finished' },
]

function Field({ label, hint, value, onChange, placeholder, type = 'text' }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 5 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 12px', fontSize: 13, color: IVORY,
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${HAIR}`, borderRadius: 9, outline: 'none',
        }}
      />
      {hint && <p style={{ fontSize: 11, color: FAINT, margin: '5px 0 0', lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}

export function NotificationChannels({ user }: { user: User }) {
  const tr = useTr()
  const { currentOrg } = useOrg()
  const [s, setS]             = useState<NotifySettings>({ events: {} })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const table  = currentOrg ? 'org_config' : 'app_config'
  const keyCol = currentOrg ? 'org_id' : 'user_id'
  const keyVal = currentOrg ? currentOrg.id : user.id

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase.from(table).select('notification_settings').eq(keyCol, keyVal).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const ns = (data?.notification_settings ?? {}) as NotifySettings
        setS({ events: {}, ...ns })
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [table, keyCol, keyVal])

  const setEvent = (k: string, v: boolean) => setS(p => ({ ...p, events: { ...(p.events ?? {}), [k]: v } }))

  async function save() {
    setSaving(true); setSaved(false)
    const payload = { [keyCol]: keyVal, notification_settings: s }
    const { error } = await supabase.from(table).upsert(payload, { onConflict: keyCol })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    else setTestMsg({ ok: false, text: tr(`Erreur d'enregistrement : ${error.message}`, `Save error: ${error.message}`) })
  }

  async function test() {
    setTesting(true); setTestMsg(null)
    try {
      const r = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: s,
          subject: tr('✅ Test ScaleFlow', '✅ ScaleFlow test'),
          message: tr('Si tu reçois ce message, tes notifications sont bien configurées.', 'If you received this message, your notifications are correctly configured.'),
        }),
      })
      const j = await r.json()
      if (j.configured === 0) setTestMsg({ ok: false, text: tr('Aucun canal configuré — renseigne au moins Telegram, Discord ou un email.', 'No channel configured — set at least Telegram, Discord or an email.') })
      else if (j.ok)          setTestMsg({ ok: true, text: tr(`Message envoyé sur ${j.configured} canal(aux). Vérifie tes notifications.`, `Message sent to ${j.configured} channel(s). Check your notifications.`) })
      else                    setTestMsg({ ok: false, text: tr(`Échec d'envoi. Vérifie tes identifiants. (${JSON.stringify(j.results)})`, `Send failed. Check your credentials. (${JSON.stringify(j.results)})`) })
    } catch (e) {
      setTestMsg({ ok: false, text: tr(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`, `Network error: ${e instanceof Error ? e.message : String(e)}`) })
    } finally {
      setTesting(false)
    }
  }

  if (loading) return <div style={{ padding: 20, color: FAINT, fontSize: 13 }}>{tr('Chargement…', 'Loading…')}</div>

  return (
    <div className="sf-card" style={{ padding: '18px 22px' }}>
      <h3 className="text-[11px] font-semibold uppercase mb-1" style={{ letterSpacing: '0.12em', color: 'var(--muted)', borderLeft: '2px solid var(--accent)', paddingLeft: 8 }}>
        {tr('Canaux externes', 'External channels')} {currentOrg ? tr('(organisation)', '(organization)') : ''}
      </h3>
      <p style={{ fontSize: 12.5, color: FAINT, margin: '8px 0 16px', lineHeight: 1.5 }}>
        {tr(
          "Reçois des alertes hors de l'app — même PC éteint. Telegram et Discord marchent tout de suite, l'email nécessite une clé Resend côté serveur.",
          'Get alerts outside the app — even with your PC off. Telegram and Discord work right away; email requires a Resend key on the server.'
        )}
      </p>

      <Field
        label={tr('Discord — URL de webhook', 'Discord — webhook URL')}
        hint={tr("Le plus simple : Discord → Paramètres du salon → Intégrations → Webhooks → copier l'URL.", 'Easiest: Discord → Channel settings → Integrations → Webhooks → copy the URL.')}
        value={s.discord_webhook ?? ''}
        onChange={v => setS(p => ({ ...p, discord_webhook: v }))}
        placeholder="https://discord.com/api/webhooks/…"
      />
      <Field
        label={tr('Telegram — token du bot', 'Telegram — bot token')}
        hint={tr('Crée un bot via @BotFather sur Telegram, colle le token ici.', 'Create a bot via @BotFather on Telegram, then paste the token here.')}
        value={s.telegram_token ?? ''}
        onChange={v => setS(p => ({ ...p, telegram_token: v }))}
        placeholder="123456:ABC-DEF…"
      />
      <Field
        label={tr('Telegram — chat ID', 'Telegram — chat ID')}
        hint={tr('Envoie un message à ton bot, puis récupère ton chat_id (ex : via @userinfobot).', 'Send a message to your bot, then get your chat_id (e.g. via @userinfobot).')}
        value={s.telegram_chat ?? ''}
        onChange={v => setS(p => ({ ...p, telegram_chat: v }))}
        placeholder="123456789"
      />
      <Field
        label={tr('Email', 'Email')}
        type="email"
        hint={tr('Nécessite RESEND_API_KEY côté serveur (Vercel + Supabase).', 'Requires RESEND_API_KEY on the server (Vercel + Supabase).')}
        value={s.email ?? ''}
        onChange={v => setS(p => ({ ...p, email: v }))}
        placeholder="moi@exemple.com"
      />

      {/* Event toggles */}
      <div style={{ marginTop: 8, marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: MUTED, marginBottom: 8 }}>{tr('Quand être alerté', 'When to be alerted')}</label>
        {EVENT_DEFS.map(ev => {
          const on = s.events?.[ev.key] !== false // défaut ON
          return (
            <button
              key={ev.key}
              onClick={() => setEvent(ev.key, !on)}
              className="cursor-pointer"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '9px 12px', marginBottom: 6, borderRadius: 9, textAlign: 'left',
                background: on ? 'rgba(99,102,241,0.07)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${on ? 'rgba(99,102,241,0.25)' : HAIR}`,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: IVORY }}>{tr(ev.label, ev.labelEn)}</p>
                <p style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{tr(ev.desc, ev.descEn)}</p>
              </div>
              <span style={{
                flexShrink: 0, width: 34, height: 19, borderRadius: 99, position: 'relative',
                background: on ? ACCENT : 'rgba(255,255,255,0.1)', transition: 'background 0.15s',
              }}>
                <span style={{
                  position: 'absolute', top: 2, left: on ? 17 : 2, width: 15, height: 15, borderRadius: '50%',
                  background: '#fff', transition: 'left 0.15s',
                }} />
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={saving} className="sf-btn sf-btn-primary sf-btn-sm" style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? tr('Enregistrement…', 'Saving…') : saved ? tr('✓ Enregistré', '✓ Saved') : tr('Enregistrer', 'Save')}
        </button>
        <button onClick={test} disabled={testing} className="sf-btn sf-btn-ghost sf-btn-sm" style={{ opacity: testing ? 0.6 : 1 }}>
          {testing ? tr('Envoi…', 'Sending…') : tr('✈ Tester', '✈ Test')}
        </button>
        {testMsg && (
          <span style={{ fontSize: 12, fontWeight: 600, color: testMsg.ok ? OK : ERR }}>{testMsg.text}</span>
        )}
      </div>
    </div>
  )
}
