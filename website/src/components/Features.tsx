const FEATURES = [
  {
    icon: '⚡',
    title: 'Mass Posting',
    text: 'Poste sur des dizaines de comptes en parallèle. Sélectionne un dossier de vidéos, lance, et chaque téléphone se ferme dès sa publication faite.',
    color: '#a78bfa',
  },
  {
    icon: '🗂',
    title: 'Banque de contenu',
    text: 'Organise tes vidéos par dossiers, importe en glisser-déposer, génère des miniatures auto. Stockage cloud sécurisé partagé par orga.',
    color: '#ec4899',
  },
  {
    icon: '🤖',
    title: 'IA intégrée',
    text: 'Génération de captions, hashtags, idées de contenu, remix de vidéos automatique. Powered by Claude & Groq.',
    color: '#34d399',
  },
  {
    icon: '📈',
    title: 'Stats temps réel',
    text: 'Suis followers, vues, engagement de tous tes comptes en un seul dashboard. Historique complet et alertes personnalisables.',
    color: '#fbbf24',
  },
  {
    icon: '👥',
    title: 'Multi-utilisateurs',
    text: 'Invite ton équipe, attribue des rôles (admin, membre, viewer), restreins les accès par dossier ou par groupe de téléphones.',
    color: '#60a5fa',
  },
  {
    icon: '🎯',
    title: 'Auto-warmup',
    text: 'Chauffage automatique de nouveaux comptes : likes, follows, vues d\'autres profils. Routines configurables par groupe.',
    color: '#f472b6',
  },
  {
    icon: '✂',
    title: 'Montage rapide',
    text: 'Couper, fusionner, ajouter sous-titres et watermarks à la volée. Pré-réglages réutilisables pour préparer du contenu en masse.',
    color: '#a78bfa',
  },
  {
    icon: '💬',
    title: 'Auto-commentaires',
    text: 'Programme des commentaires automatiques sur les posts de tes comptes pour booster l\'engagement initial.',
    color: '#ec4899',
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[11px] text-accent uppercase tracking-widest mb-3 font-semibold">Tout pour scaler</p>
          <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            Une seule app, <span className="gradient-text">tout dedans.</span>
          </h2>
          <p className="text-text2 max-w-2xl mx-auto">
            Plus besoin de jongler entre 10 outils. ScaleFlow regroupe ce dont tu as besoin pour gérer ton empire Instagram.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="glass rounded-2xl p-6 transition-all hover:scale-[1.02] hover:bg-white/[0.06]">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                   style={{ background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
                {f.icon}
              </div>
              <h3 className="text-white text-base font-bold mb-2">{f.title}</h3>
              <p className="text-text2 text-sm leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
