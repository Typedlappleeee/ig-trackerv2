# ScaleFlow — Audit visuel & refonte UX/UI

> Juillet 2026 · 2ᵉ vague d'agents (design, pages, navigation, site marketing, screenshots réels).
> Complète `AUDIT-COMPLET-JUILLET2026.md` (sécurité, fiabilité, API GeeLark).
> **Aucune modification exécutée — analyse + propositions.**

---

## 0. TL;DR — le verdict visuel

**Ton style de base est bon** (dark premium, accent indigo, cartes soignées, animations propres). Le problème n'est **pas l'esthétique**, c'est **la cohérence et la densité** :

- **Le même geste est recodé 5-6 fois** avec 5-6 apparences différentes : sélection de téléphones (6 versions), cartes de job du Studio (5 designs), sélection de fichiers (3 pickers), affichage des logs (3 traitements).
- **Pas de vrai design system** : `theme.ts` est squelettique, `#6366F1` est écrit en dur **173 fois**, il y a **3 740 styles inline**, et un `MASTER.md` décrit un produit qui n'existe pas (vert/Plus Jakarta Sans).
- **La navigation est incohérente** : 2 systèmes de gating contradictoires, 4 routes fantômes, des doublons, une barre mobile sans « Publication ».
- **L'entrée est un tunnel** : ~7 gates + splash 4,8 s rejoué 3× + tour 10 étapes avant le premier post.
- **Le site marketing sabote la conversion** : paiement en DM Telegram/crypto, zéro capture produit réelle, pas d'OpenGraph/analytics, bugs responsive réels.
- **Rupture de marque** entre le site (cyan/violet SaaS) et l'app (noir/serif éditorial) : on dirait deux produits.

Aucun de ces points ne demande de « refaire le beau » — il faut **unifier** ce qui existe déjà.

---

## 1. Design system — l'état chiffré et les tokens proposés

### Constat (mesuré dans le code)
- **`#6366F1` (indigo accent) écrit en dur 173 fois**, `#22C55E` (vert) 20 fois — au lieu d'un token `--accent`.
- **3 740 occurrences de `style={{ }}`** dans `pages/` + `components/` ; seulement 13 fichiers sur 51 importent `theme.ts`.
- `theme.ts` = couleurs + 1 police, **aucune échelle** spacing/radius/shadow/typo.
- `index.css` a pourtant **281 classes `sf-*` cohérentes** (bonne base) — mais court-circuitées par l'inline.
- `design-system/MASTER.md` décrit un produit « Smart Home » vert/Plus Jakarta Sans **jamais suivi** → à supprimer, il induit en erreur.
- Emojis utilisés comme icônes à certains endroits (hubs, matrice de permissions, `VideoPreview` 🎬) alors que le reste utilise des SVG Lucide → incohérence.

### Proposition de tokens (à mettre dans `theme.ts` puis migrer progressivement)

```ts
// theme.ts — source de vérité unique
export const tokens = {
  color: {
    // Surfaces (du plus sombre au plus clair)
    bg:        '#0A0B0E',   // fond app
    surface1:  '#111318',   // cartes
    surface2:  '#171A21',   // cartes surélevées / hover
    surface3:  '#1E2229',   // inputs, popovers
    border:    'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',

    // Texte (échelle de luminance, tous AA sur bg)
    text1: '#F3F4F8',       // titres
    text2: '#C7CAD3',       // corps
    text3: '#9297A3',       // secondaire (AA ✓)
    text4: '#6B7180',       // désactivé — NE PAS utiliser pour du texte lisible

    // Accent (indigo — un seul, décliné)
    accent:       '#6366F1',
    accentHover:  '#7C7EF5',
    accentSubtle: 'rgba(99,102,241,0.14)',  // fonds de badge/section

    // Statuts (utilisés partout : posting, jobs, comptes)
    success: '#34D399', successBg: 'rgba(52,211,153,0.14)',
    warning: '#F5B84B', warningBg: 'rgba(245,184,75,0.14)',
    danger:  '#F87171', dangerBg:  'rgba(248,113,113,0.14)',
    info:    '#818CF8', infoBg:    'rgba(129,140,248,0.14)',
  },
  // Échelle d'espacement 4px — remplace les valeurs magiques
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32, '3xl': 48 },
  // Échelle typo (7 tailles au lieu de dizaines)
  font: {
    size:   { xs: 11, sm: 12.5, base: 14, md: 16, lg: 20, xl: 26, '2xl': 34 },
    weight: { normal: 400, medium: 500, semibold: 600, bold: 700, black: 800 },
    family: { sans: "'Inter', system-ui, sans-serif" },
  },
  radius: { sm: 6, md: 10, lg: 14, xl: 20, full: 9999 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 4px 16px rgba(0,0,0,0.35)',
    lg: '0 12px 40px rgba(0,0,0,0.55)',
    glow: '0 0 0 1px rgba(99,102,241,0.4), 0 8px 30px rgba(99,102,241,0.25)',
  },
}
```

### Migration visuelle sans tout casser
1. Définir les tokens + les exposer aussi en **variables CSS** (`:root { --accent: … }`) pour les classes `sf-*`.
2. **Codemod** : remplacer les `#6366F1` littéraux par `var(--accent)` / `tokens.color.accent` (script sur les 173 occurrences).
3. Créer 4-5 composants primitifs manquants (`<Button>`, `<Card>`, `<Badge>`, `<Input>`, `<Field>`) qui consomment les tokens, et les substituer page par page aux blocs inline répétés.
4. Supprimer `design-system/MASTER.md`, bannir les emojis d'UI restants au profit des SVG Lucide déjà présents.

---

## 2. Navigation — de 33 pages à 7 espaces

**Problèmes** : 2 systèmes de gating contradictoires (la sidebar filtre par plan/superadmin et **ignore le rôle**, le Hub filtre par rôle → un `viewer` voit « Publication » dans la sidebar mais pas dans le Hub) ; 4 routes fantômes (`montage`, `repurpose`, `stats`, `scaleia` — aucun lien) ; `photoposting` référencé sans route (**écran blanc**) ; `posting`/`massposting` = alias du même écran ; `TikTokPosting` redondant avec le sélecteur de plateforme ; `Autocomment.tsx` = code mort ; barre mobile 5 items figés **sans Publication**.

### Arborescence cible (7 espaces)

| Espace | Icône | Absorbe | Sous-onglets |
|---|---|---|---|
| **Accueil** | `layout-dashboard` | Hub | — |
| **Téléphones** | `smartphone` | Phones | — |
| **Publication** | `send` | PublishHub, Publish, MassPosting, StoryLink, TikTokPosting, Scheduler, Tasks, Warmup | Nouvelle publi · Programmation · Tâches auto · Warmup |
| **Studio** | `clapperboard` | VideoStudio, Remix, Spoof, Subtitles, Mixer, Montage, Repurpose, AiTools | (grille d'outils) |
| **Banque** | `folder-open` | BankHub, Bank, CaptionBank | Médias · Captions |
| **Analytics** | `bar-chart-3` | Reports, Stats, History | Aujourd'hui · Tendances · Historique |
| **Communauté** | `messages-square` | Community, Support | Fil · Support |
| _(pied)_ Paramètres / Admin | `settings` / `shield` | Settings / Licences | — |

**Décisions clés** : supprimer `TikTokPosting` + `Autocomment` ; réintégrer les 4 fantômes ; retirer l'alias `massposting` ; désactiver proprement `photoposting` (carte « Bientôt ») ; dégater `reports` et `tasks` (aujourd'hui superadmin-only alors qu'ils sont pour les clients) ; mettre `ScaleIA` en teaser.

### Gating unifié (une seule fonction pour sidebar + Hub + mobile)
```ts
function isNodeVisible(node, { isSuperAdmin, plan, role, overrides }) {
  if (isSuperAdmin) return true
  if (node.superAdminOnly) return false
  if (node.minPlan && RANK[plan] < RANK[node.minPlan]) return false   // upsell géré à l'affichage
  if (node.rolePerm && role) {
    const o = overrides?.tabs?.[node.rolePerm]
    return typeof o === 'boolean' ? o : ROLE_TABS[role][node.rolePerm]  // seule source de vérité
  }
  return true
}
// espace visible si ≥1 enfant visible ; consommé par Layout (sidebar+mobile), Hub, AppTour
```

### Barre mobile cible
`[ Accueil ] [ Publication ] [ Téléphones ] [ Banque ] [ Plus ]` — « Plus » ouvre un bottom-sheet (Studio, Analytics, Communauté, Paramètres). Chaque item passe par le gating (aujourd'hui figé).

### Navigation secondaire
Segmented control `sf-tabs` (déjà utilisé dans BankHub) en tête d'espace ; fil d'Ariane via l'event `sf:breadcrumb` **déjà écouté** par Layout, à généraliser. Onglet mémorisé par espace + deep-links (`publish?tab=schedule`). Migration : **table de redirection** des anciens ids (les notifications pointent vers `posting`/`scheduler`/`tasks` — critique à préserver) + BetaPopup de nouveautés + annonce Communauté.

---

## 3. Publication — le cœur, à unifier

**Ce qui marche déjà** (à garder) : la checklist « Préparation 0/4 » de MassPosting (meilleur onboarding du produit), le recap « 8/10 réussis », la table de répartition téléphone→vidéo, les couleurs de statut du calendrier, le « Mode test » (dry-run) de StoryLink, le TaskWizard (5 étapes claires + presets de fréquence + carte récap).

**Problèmes majeurs** :
- **La sélection de téléphones est recodée 6 fois** (6 positions de checkbox, 6 styles) → extraire **un seul `<PhonePicker>`**.
- **3 popups de plateforme** à l'entrée (dont StoryLink où TikTok est désactivé = popup à une seule option) → remplacer par un segmented control mémorisé.
- **Aucun empty state sur MassPosting** (la page la plus importante) : un client sans téléphone voit une colonne vide + une checklist qui pointe vers ce vide = **impasse totale au premier usage**.
- **4 chemins pour programmer** un post + **2 créateurs de tâches concurrents** (wizard + modal « Avancé ») + **2 modèles de données** dans le modal (`segments` vs `steps` = mode séquence) exposés crûment.
- Suivi de run **sans ETA** ; journal monospace non filtrable (pas de « voir seulement les échecs »).
- Calendrier : **création par clic droit invisible** (seul indice = un `title`) ; pas d'empty state ; collision des blocs à la même heure.

**Flow idéal** : plateforme = segmented control (pas de popup) → si 0 téléphone, carte onboarding « Connecte tes comptes » **avant** le formulaire → layout 2 colonnes stable (`PhonePicker` unifié à gauche | sections 01 Contenu / 02 Message / 03 Répartition / **04 Options repliées** à droite) → barre sticky « 12 comptes · 4 vidéos · 240 crédits » + 3 actions (Mode test · Programmer ▾ · Publier) → **RunPanel partagé** avec ETA (« 6/12 · ~4 min »), 3 compteurs cliquables (En cours / Réussis / **Échecs (2)** filtrable), « Relancer les échecs » à la fin. Le TaskWizard devient l'unique créateur **et** éditeur de tâches (supprimer le modal Avancé, fusionner segments/steps).

**Principe** : *3 décisions visibles par défaut (qui / quoi / quand), tout le reste replié.*

---

## 4. Studio vidéo — 8 outils, 1 layout

**Problème structurel** : le hub n'affiche que **4 cartes sur 8+** — **Montage, CloneVid (Repurpose), Métadonnées et Texte IA sont inaccessibles** depuis le Studio (routes orphelines). Et les 8 outils ont **5 layouts, 3 pickers, 5 designs de carte de job, 5 vocabulaires de statut**, avec du FR/EN mélangé. Le **Montage affiche des réglages (vitesse, filtres, textes) qui ne sont PAS appliqués à l'export** (malhonnêteté UI). Aucun outil n'indique le chargement du moteur wasm (31 Mo) ni ne distingue rendu serveur (rapide) vs local (lent) ; MassRemix a une barre de progression « menteuse » (0 %→100 % d'un coup).

**Renommage client proposé** :

| Actuel | Proposé | Sous-titre |
|---|---|---|
| Remix / Mass Remix | **Remix** | « Colle une intro accrocheuse devant ta vidéo, en masse » |
| Repurpose / CloneVid | **CloneVid** | « 1 vidéo → N variantes uniques anti-détection » |
| Spoof | **Empreinte** | « Nouvelles métadonnées iPhone + GPS à chaque export » |
| Mixer | **Accroche** | « Incruste une phrase choc sur tes vidéos en lot » |
| Metadata | **Nettoyeur** | « Efface toutes les métadonnées, sans ré-encoder » |
| TextCopy | **Multi-texte** | « Même texte à N positions = N copies uniques » |
| Subtitles | **Sous-titres** | « Transcription Whisper + incrustation auto » |
| Montage | **Éditeur** | « Timeline multi-clips, trim, transitions » |

**Studio unifié** : un rail d'opérations à gauche (les 8 outils en 2 familles *Rendre unique* / *Éditer & habiller*) → zone de travail centrale identique (Source via **un seul `BankPicker`** + Réglages + Aperçu `contain` avant/après) → **file de jobs partagée persistante à droite** (une seule `<JobCard>` : vignette 9:16, **barre de progression réelle**, statut normalisé et traduit `En file → Préparation moteur 31 Mo → Rendu serveur|local 62% → Terminé`, actions Télécharger + Enregistrer). Jamais la file dans un modal. Masquer les réglages Montage non exportés tant que le pipeline ne les applique pas.

---

## 5. Entrée dans l'app — supprimer le tunnel

**Aujourd'hui** : Landing (tunnel + reveal = 2 clics cérémoniels) → splash **4,8 s rejoué 3×** (démarre à `false` à chaque montage) → auth → **~7 gates** (onboarding 2 écrans + activer licence + créer orga + reload) → BetaPopup **et** AppTour **10 étapes passives** (qui ne surlignent aucun élément réel). `AiModelPopup` et `BugScreen` = **code mort**. Toasts sans aucune action (« Réessayer »/« Voir »). Landing : `cursor:none` (a11y), login `StudioAuth` dupliqué **sans mot de passe oublié**.

**Settings** : bien organisé (7 panneaux) **mais aucun bouton « Tester » ni statut sur les credentials** (GeeLark/Groq/Anthropic sont de simples champs password) — alors que l'onboarding, lui, teste le token en live. Le champ « Session ID Instagram » promis par l'onboarding **n'existe pas**.

**Séquence idéale** : Landing en une vue (nav + « ce que c'est/pour qui/prix » visibles, intro skippable) → splash **≤1,5 s une seule fois** → auth unique (web+desktop, avec reset + resend email) → **un seul stepper** (Licence → Orga → Connexion GeeLark **avec bouton Tester** → clés IA optionnelles) → Hub avec **checklist actionnable** (« Importe une vidéo ▢ · Sélectionne un compte ▢ · Publie ton 1er post ▢ ») qui **exécute** chaque étape → premier post → toast **avec action** « Voir le résultat ». Supprimer `AiModelPopup`/`BugScreen`, fusionner BetaPopup+AppTour. Ajouter partout un **bouton Tester + pastille de statut** sur les credentials.

---

## 6. Site marketing — débloquer la conversion

**Bugs visuels confirmés sur screenshots réels** :
- **Cartes stats qui se chevauchent en mobile** (les chiffres se superposent) — défaut responsive à corriger.
- **Collision texte/navbar au scroll** : les titres de section passent derrière la navbar sticky semi-transparente (illisible).
- Curseur machine-à-écrire « | » orphelin en fin de H1 (ressemble à un bug).
- 4 CTA concurrents dans le hero ; vides structurels (footer, sous « Comment ça marche »).

**Freins business (P0)** :
1. **Paiement en DM Telegram / crypto / virement** → tue la conversion agence. Mettre **Stripe Checkout self-serve** sur chaque plan (garder Telegram en « entreprise »). Corriger la FAQ qui dit « annuler via Stripe » (contradiction).
2. **CTA n°1 = un `.exe` Windows** (inutilisable sur mobile) → « Démarrer gratuitement » (web) en primaire, détection d'OS pour le download.
3. **TikTok totalement absent du site** alors que le produit le gère → l'ajouter partout (hero, feature, FAQ).
4. **Zéro capture produit réelle ni démo vidéo** (le mockup est codé en JSX) → vraies captures + démo 60-90 s.
5. Preuve sociale faible (initiales, stats rondes non sourcées) → témoignages avec handle/avatar + études de cas chiffrées.

**Quick wins SEO/perf** : créer `website/public/` (favicon, **og-image 1200×630**, robots.txt, sitemap.xml) ; ajouter **OpenGraph + Twitter card + canonical** dans `index.html` (aujourd'hui 0) ; **JSON-LD** (SoftwareApplication/Offer/FAQPage) ; **analytics** (Plausible/GA4 + events sur les CTA) ; réduire les 6 graisses Inter chargées en bloquant.

**Rupture de marque** : le site (cyan→violet, sans-serif) et l'app (noir/serif éditorial « SCALE/Flow », voire la direction noir/ivoire/or de `DESIGN_NOIR.md`) racontent **deux marques différentes**. À trancher **avant** d'investir davantage — sinon tu refais le design deux fois. Recommandation : choisir UNE direction (le lockup SCALE/Flow est le plus distinctif) et l'appliquer aux deux surfaces + au logo.

---

## 7. Plan d'action visuel priorisé

**Sprint 1 — corrections rapides à fort impact**
- Fix responsive cartes stats mobile + collision navbar + curseur orphelin (site) — bugs vus sur captures.
- Empty state sur MassPosting (impasse premier usage) + carte « Connecte tes comptes ».
- Bouton « Tester » + pastille de statut sur les 3 credentials (Settings).
- Supprimer le code mort (`Autocomment`, `AiModelPopup`, `BugScreen`, wrapper `Remix`) + réintégrer/désactiver les routes fantômes.
- Splash ≤1,5 s non rejoué ; retirer le popup plateforme quand un choix est mémorisé.
- OpenGraph + favicon + analytics sur le site.

**Sprint 2 — unification des composants partagés**
- `<PhonePicker>` unique (remplace les 6 versions).
- `<JobCard>` + file de jobs partagée (remplace les 5 designs du Studio).
- `theme.ts` en vrais tokens + codemod `#6366F1` → `var(--accent)`.
- Gating unifié (une fonction pour sidebar/Hub/mobile) + barre mobile avec Publication.

**Sprint 3 — les 7 espaces + les 2 flows unifiés**
- Fusion des pages en 7 espaces à onglets (`sf-tabs` + breadcrumbs) + table de redirection.
- Flow de publication unifié (composer → RunPanel avec ETA + échecs filtrables).
- Studio unifié (rail + zone + file partagée) + renommage client des 8 outils.
- Checklist d'onboarding actionnable (remplace l'AppTour).

**Sprint 4 — marque & site**
- Trancher la direction de marque unique, l'appliquer app + site + logo.
- Site : Stripe self-serve, TikTok, vraies captures + démo, preuve sociale, pages légales.
