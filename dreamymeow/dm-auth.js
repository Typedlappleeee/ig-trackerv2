/* dreamymeow — comptes, licences et banque (module partagé par toutes les pages).
 *
 * Comptes « pseudo + mot de passe » (email interne <pseudo>@users.dreamymeow.com,
 * jamais affiché). Les outils exigent une licence active (clé DM-XXXX-XXXX-XXXX).
 * Tant que le script SQL n'est pas installé côté Supabase, le site reste ouvert
 * comme avant (aucun blocage pendant la mise en place).
 *
 * API : window.dm = { ready, gate(opts), me, login, signup, logout, redeem, bank }
 */
(() => {
  const SB_URL = 'https://fvmkmkspfksscgqyvysl.supabase.co'
  const SB_KEY = 'sb_publishable_hip63djbBYnu3EsSx2gA4w_0tgjweEo'
  const DOMAIN = 'users.dreamymeow.com'
  const BUCKET = 'dreamymeow'
  const KEEP_DAYS = 7

  const sb = window.supabase.createClient(SB_URL, SB_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'dm-auth' },
  })

  // ── Langue (suit le sélecteur FR/EN du site) ─────────────────────────────
  const T = {
    fr: {
      login: 'Connexion', signup: 'Créer un compte', username: 'Pseudo', password: 'Mot de passe', password2: 'Confirme le mot de passe',
      go_login: 'Se connecter', go_signup: 'Créer mon compte', wait: 'Un instant…',
      hello: 'Connecte-toi pour utiliser les spoofers.', hello_signup: 'Choisis un pseudo et un mot de passe.',
      bad_login: 'Pseudo ou mot de passe incorrect.', mismatch: 'Les deux mots de passe ne correspondent pas.',
      net: 'Connexion au serveur impossible. Vérifie ta connexion puis réessaie.', retry: 'Réessayer',
      lic_title: 'Active ta licence', lic_sub: 'Entre ta clé de licence pour débloquer les spoofers.', lic_key: 'Clé de licence',
      lic_go: 'Activer', lic_none: 'Pas de clé ? Demande-la à l\'administrateur.', lic_ok: 'Licence activée ✓',
      lic_expired: 'Ta licence a expiré — entre une nouvelle clé.', logout: 'Se déconnecter', bank: 'Ma banque', admin: 'Admin',
      add_key: 'Ajouter une clé', until: d => `Licence jusqu'au ${d}`, nolic: 'Aucune licence active', adminTag: 'Administrateur',
      admin_only: 'Cette page est réservée aux administrateurs.', back: '← Retour au spoofer',
      saved: 'En banque ✓', save: 'Banque', saving: 'Envoi…', save_err: 'Échec',
      keep: `Conservé ${KEEP_DAYS} jours dans ta banque`,
    },
    en: {
      login: 'Log in', signup: 'Create account', username: 'Username', password: 'Password', password2: 'Confirm password',
      go_login: 'Log in', go_signup: 'Create my account', wait: 'One moment…',
      hello: 'Log in to use the spoofers.', hello_signup: 'Pick a username and a password.',
      bad_login: 'Wrong username or password.', mismatch: 'Passwords do not match.',
      net: 'Cannot reach the server. Check your connection and try again.', retry: 'Retry',
      lic_title: 'Activate your license', lic_sub: 'Enter your license key to unlock the spoofers.', lic_key: 'License key',
      lic_go: 'Activate', lic_none: 'No key? Ask the administrator.', lic_ok: 'License activated ✓',
      lic_expired: 'Your license has expired — enter a new key.', logout: 'Log out', bank: 'My bank', admin: 'Admin',
      add_key: 'Add a key', until: d => `License until ${d}`, nolic: 'No active license', adminTag: 'Administrator',
      admin_only: 'This page is for administrators only.', back: '← Back to the spoofer',
      saved: 'In bank ✓', save: 'Bank', saving: 'Uploading…', save_err: 'Failed',
      keep: `Kept ${KEEP_DAYS} days in your bank`,
    },
  }
  const lang = () => {
    let l = null
    try { l = localStorage.getItem('dreamymeow-lang') } catch (_) {}
    return l || ((navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en')
  }
  const t = k => (T[lang()] || T.fr)[k] ?? T.fr[k] ?? k
  const fmtDate = iso => new Date(iso).toLocaleDateString(lang() === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  // ── État ─────────────────────────────────────────────────────────────────
  // installed=false : fonctions SQL absentes → site ouvert comme avant.
  const state = { session: null, me: null, installed: true, offline: false }
  const listeners = new Set()
  const notify = () => listeners.forEach(fn => { try { fn(state) } catch (_) {} })

  const notInstalled = err => !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message || ''))

  async function refresh() {
    state.offline = false
    const { data: s } = await sb.auth.getSession()
    state.session = s.session
    // Appelé même sans session : permet de savoir si le système est installé.
    const { data, error } = await sb.rpc('dm_me')
    if (error) {
      if (notInstalled(error)) { state.installed = false; state.me = null; return }
      state.offline = true
      return
    }
    state.installed = true
    state.me = state.session ? data : null
  }

  const ready = (async () => {
    try { await refresh() } catch (_) { state.offline = true }
    notify()
    return state
  })()

  const emailOf = u => `${String(u).trim().toLowerCase()}@${DOMAIN}`
  const friendly = e => {
    const m = (e && (e.message || e.error_description)) || String(e)
    if (/invalid login credentials/i.test(m)) return t('bad_login')
    if (/failed to fetch|network/i.test(m)) return t('net')
    return m
  }

  async function login(username, password) {
    const { error } = await sb.auth.signInWithPassword({ email: emailOf(username), password })
    if (error) throw new Error(friendly(error))
    await refresh(); notify()
  }
  async function signup(username, password) {
    const { error } = await sb.rpc('dm_signup', { p_username: username, p_password: password })
    if (error) {
      if (notInstalled(error)) { state.installed = false; notify(); throw new Error('Système de comptes pas encore installé.') }
      throw new Error(friendly(error))
    }
    await login(username, password)
  }
  async function logout() { await sb.auth.signOut(); state.session = null; state.me = null; notify() }
  async function redeem(key) {
    const { error } = await sb.rpc('dm_redeem', { p_key: String(key).trim() })
    if (error) throw new Error(friendly(error))
    await refresh(); notify()
  }

  // ── Banque (bucket privé, dossier <user_id>/, 7 jours) ───────────────────
  const bank = {
    async save(blob, name, kind) {
      const uid = state.session?.user?.id
      if (!uid) throw new Error('Non connecté')
      const ext = (String(name).match(/\.([a-z0-9]{2,5})$/i)?.[1] || (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase()
      const path = `${uid}/${crypto.randomUUID()}.${ext}`
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || (kind === 'video' ? 'video/mp4' : 'image/jpeg'), upsert: false })
      if (up.error) throw new Error(up.error.message)
      const { error } = await sb.from('dm_bank').insert({ user_id: uid, path, name, kind, size: blob.size })
      if (error) { await sb.storage.from(BUCKET).remove([path]); throw new Error(error.message) }
    },
    async list() {
      const { data, error } = await sb.from('dm_bank').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data || []
    },
    async url(row, download = false) {
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(row.path, 3600, download ? { download: row.name } : undefined)
      if (error) throw new Error(error.message)
      return data.signedUrl
    },
    async remove(rows) {
      const list = Array.isArray(rows) ? rows : [rows]
      if (!list.length) return
      await sb.storage.from(BUCKET).remove(list.map(r => r.path))
      await sb.from('dm_bank').delete().in('id', list.map(r => r.id))
    },
    // Supprime les fichiers expirés visibles (les siens ; tous si admin).
    async purgeExpired() {
      const { data } = await sb.from('dm_bank').select('id,path').lte('expires_at', new Date().toISOString()).limit(500)
      if (data && data.length) await bank.remove(data)
      return data ? data.length : 0
    },
  }

  // ── Styles (palette du site) ─────────────────────────────────────────────
  const css = document.createElement('style')
  css.textContent = `
  .dm-ov{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,6,10,.82);backdrop-filter:blur(8px);font-family:'Manrope',system-ui,sans-serif}
  .dm-card{width:100%;max-width:400px;padding:26px 24px 22px;border-radius:18px;background:linear-gradient(168deg,rgba(28,22,52,.96),rgba(14,12,26,.98));border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px -20px rgba(0,0,0,.8);color:#F2F0FF}
  .dm-card h2{margin:0 0 6px;font-family:'Space Grotesk',sans-serif;font-size:22px;letter-spacing:-.02em}
  .dm-card p.s{margin:0 0 18px;color:#9a97a8;font-size:13px;line-height:1.5}
  .dm-tabs{display:flex;gap:4px;padding:4px;margin-bottom:16px;border-radius:11px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
  .dm-tabs button{flex:1;height:32px;border:none;border-radius:8px;background:transparent;color:#9a97a8;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer}
  .dm-tabs button.on{background:linear-gradient(135deg,#c084fc,#7c3aed);color:#fff}
  .dm-f{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
  .dm-f label{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8b88a0}
  .dm-f input{height:42px;padding:0 13px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#F2F0FF;font-size:14px;font-family:inherit;outline:none}
  .dm-f input:focus{border-color:rgba(192,132,252,.6)}
  .dm-go{width:100%;height:46px;margin-top:4px;border:none;border-radius:12px;cursor:pointer;font-family:inherit;font-size:14.5px;font-weight:800;color:#fff;background:linear-gradient(135deg,#c084fc,#7c3aed);box-shadow:0 14px 32px -12px rgba(168,85,247,.9)}
  .dm-go:disabled{opacity:.5;cursor:wait}
  .dm-err{min-height:18px;margin:10px 0 0;font-size:12.5px;color:#f87171;line-height:1.45}
  .dm-ok{color:#34d399}
  .dm-foot{margin-top:14px;font-size:12px;color:#8b88a0;text-align:center}
  .dm-foot a,.dm-link{color:#c084fc;cursor:pointer;text-decoration:none;background:none;border:none;font-family:inherit;font-size:inherit;padding:0}
  .dm-acc{position:relative}
  .dm-acc>button{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 10px 0 6px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#F2F0FF;font:700 12px 'Manrope',system-ui,sans-serif;cursor:pointer}
  .dm-av{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#c084fc,#7c3aed);font-size:10.5px;font-weight:800;color:#fff;text-transform:uppercase}
  .dm-menu{position:absolute;right:0;top:36px;z-index:900;width:230px;padding:6px;border-radius:12px;background:#17151f;border:1px solid rgba(255,255,255,.1);box-shadow:0 20px 50px -14px rgba(0,0,0,.8);font-family:'Manrope',system-ui,sans-serif}
  .dm-menu .h{padding:8px 10px 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:4px}
  .dm-menu .h b{display:block;color:#F2F0FF;font-size:13px}
  .dm-menu .h span{font-size:11px;color:#9a97a8}
  .dm-menu a,.dm-menu button{display:block;width:100%;text-align:left;padding:8px 10px;border-radius:8px;border:none;background:none;color:#d4d2e0;font-weight:600;font-size:12.5px;font-family:inherit;text-decoration:none;cursor:pointer}
  .dm-menu a:hover,.dm-menu button:hover{background:rgba(255,255,255,.05)}
  .dm-menu .danger{color:#f87171}
  `
  document.head.appendChild(css)

  // ── Porte d'accès ────────────────────────────────────────────────────────
  let ov = null
  function closeGate() { if (ov) { ov.remove(); ov = null } }

  function renderLogin(mode, done) {
    ov.innerHTML = `
      <div class="dm-card" role="dialog" aria-modal="true">
        <h2>dreamymeow</h2>
        <p class="s">${mode === 'login' ? t('hello') : t('hello_signup')}</p>
        <div class="dm-tabs"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">${t('login')}</button><button data-m="signup" class="${mode === 'signup' ? 'on' : ''}">${t('signup')}</button></div>
        <form autocomplete="on">
          <div class="dm-f"><label for="dm-u">${t('username')}</label><input id="dm-u" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required minlength="3" maxlength="24"></div>
          <div class="dm-f"><label for="dm-p">${t('password')}</label><input id="dm-p" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="${mode === 'login' ? 1 : 8}"></div>
          ${mode === 'signup' ? `<div class="dm-f"><label for="dm-p2">${t('password2')}</label><input id="dm-p2" type="password" autocomplete="new-password" required></div>` : ''}
          <button class="dm-go" type="submit">${mode === 'login' ? t('go_login') : t('go_signup')}</button>
          <div class="dm-err" role="alert"></div>
        </form>
      </div>`
    ov.querySelectorAll('.dm-tabs button').forEach(b => b.onclick = () => renderLogin(b.dataset.m, done))
    const f = ov.querySelector('form'), err = ov.querySelector('.dm-err'), go = ov.querySelector('.dm-go')
    ov.querySelector('#dm-u').focus()
    f.onsubmit = async e => {
      e.preventDefault()
      const u = ov.querySelector('#dm-u').value.trim(), p = ov.querySelector('#dm-p').value
      if (mode === 'signup' && p !== ov.querySelector('#dm-p2').value) { err.textContent = t('mismatch'); return }
      go.disabled = true; go.textContent = t('wait'); err.textContent = ''
      try { mode === 'login' ? await login(u, p) : await signup(u, p); done() }
      catch (x) { err.textContent = x.message; go.disabled = false; go.textContent = mode === 'login' ? t('go_login') : t('go_signup') }
    }
  }

  function renderLicense(done, expired) {
    ov.innerHTML = `
      <div class="dm-card" role="dialog" aria-modal="true">
        <h2>${t('lic_title')}</h2>
        <p class="s">${expired ? t('lic_expired') : t('lic_sub')}</p>
        <form>
          <div class="dm-f"><label for="dm-k">${t('lic_key')}</label><input id="dm-k" placeholder="DM-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" required style="font-family:'JetBrains Mono',monospace;letter-spacing:.06em"></div>
          <button class="dm-go" type="submit">${t('lic_go')}</button>
          <div class="dm-err" role="alert"></div>
        </form>
        <div class="dm-foot">${t('lic_none')}<br><button class="dm-link" data-out>${t('logout')} (${esc(state.me?.username || '')})</button></div>
      </div>`
    const f = ov.querySelector('form'), err = ov.querySelector('.dm-err'), go = ov.querySelector('.dm-go')
    ov.querySelector('#dm-k').focus()
    ov.querySelector('[data-out]').onclick = async () => { await logout(); renderLogin('login', done) }
    f.onsubmit = async e => {
      e.preventDefault()
      go.disabled = true; err.textContent = ''
      try { await redeem(ov.querySelector('#dm-k').value); err.className = 'dm-err dm-ok'; err.textContent = t('lic_ok'); setTimeout(done, 500) }
      catch (x) { err.className = 'dm-err'; err.textContent = x.message; go.disabled = false }
    }
  }

  function renderOffline(retry) {
    ov.innerHTML = `<div class="dm-card"><h2>dreamymeow</h2><p class="s">${t('net')}</p><button class="dm-go">${t('retry')}</button></div>`
    ov.querySelector('.dm-go').onclick = retry
  }

  function renderAdminOnly() {
    ov.innerHTML = `<div class="dm-card"><h2>${t('admin')}</h2><p class="s">${t('admin_only')}</p><a class="dm-go" style="display:grid;place-items:center;text-decoration:none" href="/">${t('back')}</a></div>`
  }

  // gate({ need: 'access' | 'admin' }) → résout quand l'utilisateur est autorisé.
  function gate(opts = {}) {
    const need = opts.need || 'access'
    return new Promise(resolve => {
      const check = async () => {
        await ready
        if (!state.installed) { closeGate(); return resolve(state) }      // système pas encore installé → ouvert
        if (!ov) { ov = document.createElement('div'); ov.className = 'dm-ov'; document.body.appendChild(ov) }
        if (state.offline) return renderOffline(async () => { try { await refresh() } catch (_) { state.offline = true } notify(); check() })
        if (!state.session || !state.me) return renderLogin('login', check)
        if (need === 'admin' && !state.me.is_admin) return renderAdminOnly()
        if (!state.me.access) return renderLicense(check, !!state.me.had_license)
        closeGate(); notify(); resolve(state)
      }
      check()
    })
  }

  // ── Menu de compte (dans le header, à gauche du sélecteur de langue) ─────
  function mountAccount() {
    const right = document.querySelector('header .right')
    if (!right) return
    let box = right.querySelector('.dm-acc')
    if (!state.installed || !state.me) { if (box) box.remove(); return }
    if (!box) { box = document.createElement('div'); box.className = 'dm-acc'; right.insertBefore(box, right.querySelector('#lang')) }
    const me = state.me
    const lic = me.is_admin ? t('adminTag') : me.license_until ? t('until')(fmtDate(me.license_until)) : t('nolic')
    box.innerHTML = `<button aria-haspopup="true" aria-expanded="false"><span class="dm-av">${esc(me.username[0] || '?')}</span>${esc(me.username)}</button>`
    const btn = box.querySelector('button')
    btn.onclick = e => {
      e.stopPropagation()
      const open = box.querySelector('.dm-menu')
      if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return }
      const m = document.createElement('div'); m.className = 'dm-menu'; m.setAttribute('role', 'menu')
      m.innerHTML = `<div class="h"><b>${esc(me.username)}</b><span>${esc(lic)}</span></div>
        <a href="/bank" role="menuitem">☁ ${t('bank')}</a>
        ${me.is_admin ? `<a href="/admin" role="menuitem">🛡 ${t('admin')}</a>` : ''}
        <button data-k role="menuitem">🔑 ${t('add_key')}</button>
        <button data-out class="danger" role="menuitem">${t('logout')}</button>`
      m.querySelector('[data-out]').onclick = async () => { await logout(); location.reload() }
      m.querySelector('[data-k]').onclick = () => {
        m.remove()
        ov = document.createElement('div'); ov.className = 'dm-ov'; document.body.appendChild(ov)
        renderLicense(() => { closeGate(); mountAccount() }, false)
        ov.addEventListener('click', e2 => { if (e2.target === ov) closeGate() })
      }
      box.appendChild(m); btn.setAttribute('aria-expanded', 'true')
    }
  }
  document.addEventListener('click', () => document.querySelectorAll('.dm-menu').forEach(m => m.remove()))
  listeners.add(mountAccount)
  window.addEventListener('dm-lang', () => { mountAccount() })

  window.dm = {
    ready, gate, refresh, login, signup, logout, redeem, bank, t, sb, KEEP_DAYS,
    get me() { return state.me }, get installed() { return state.installed },
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn) },
  }
})()

// Le header peut ne pas être encore parsé quand le module démarre.
document.addEventListener('DOMContentLoaded', () => window.dm && window.dm.ready.then(() => window.dispatchEvent(new Event('dm-lang'))))
