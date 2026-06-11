# ScaleFlow Noir — Spec design (refonte éditoriale luxe)

Identité : éditorial noir cinématique. Fini le look "startup violet/rose néon".
Référence : Landing.tsx et Hub.tsx (déjà refaits — s'en inspirer fidèlement).

## Tokens (à déclarer en haut de chaque page si besoin)
```ts
const SERIF = "'Instrument Serif', 'Times New Roman', Georgia, serif"
const SANS  = "'Inter', system-ui, sans-serif"
const IVORY = '#F3F1EC'
const MUTED = 'rgba(243,241,236,0.42)'
const FAINT = 'rgba(243,241,236,0.22)'
const HAIR  = 'rgba(243,241,236,0.08)'   // hairline borders
const GOLD  = '#C9B584'
```
Fond pages : `#060608`. Surfaces : `rgba(243,241,236,0.02)`, hover `0.035`.

## Règles
1. **Headers de page** : micro-label uppercase letterspacing 0.3em précédé d'un tiret
   (couleur `rgba(201,181,132,0.65)`), puis titre : mot principal en SANS 900
   letterSpacing -0.04em IVORY + mot accent en SERIF italique GOLD légèrement plus grand.
   Filet hairline dessous. Ex : `MASS` + *Posting* en italique or.
2. **Numérotation éditoriale** : sections numérotées en serif italique or (`01`, `02`, `— 01`).
3. **Cartes** : coins carrés (radius 0–4px max), bord `1px solid HAIR`,
   fond `rgba(243,241,236,0.02)`. Hover : fond 0.035 + indicateur or (barre 2px gauche
   `scaleY` ou bord `rgba(201,181,132,0.5)`). PAS de glow violet, PAS de gradient rose.
4. **Grilles hairline** : `display:grid; gap:1px; background:HAIR; border:1px solid HAIR`
   avec cellules `background:#060608`.
5. **Boutons primaires** : fond IVORY, texte `#0A0A0C`, uppercase letterSpacing 0.2em,
   font 10–11px weight 700, coins carrés, hover → fond GOLD. Secondaires : transparent,
   bord `rgba(243,241,236,0.25)`, texte IVORY, hover bord 0.55.
6. **Inputs** : fond transparent, `borderBottom: 1px solid rgba(243,241,236,0.18)`
   (ou bord hairline complet pour textarea/select), focus → bord GOLD. Placeholder FAINT.
7. **Couleurs fonctionnelles** (statuts) conservées mais désaturées :
   succès `#7FD9B8`, erreur `#F0A0AB`, warning `#E5C07B`, info `#9DB8D9`.
   Fond badge statut : `rgba(couleur, 0.07)` + bord `rgba(couleur, 0.35)`, coins carrés.
8. **Remplacer** toutes les couleurs violet/rose/cyan décoratives
   (`#7c3aed`, `#ec4899`, `#a78bfa`, `rgba(139,92,246,…)`, `#22d3ee`, gradients)
   par IVORY / GOLD / hairlines. Les `sf-text-gradient` → texte serif italique GOLD.
9. **Emojis UI → jamais**. Icônes SVG stroke 1.5 uniquement, couleur `currentColor`,
   dans cercles hairline (`border-radius:50%; border:1px solid HAIR`) pour les icônes-vignettes.
10. **Modals** : fond `#0A0A0C`, bord HAIR, coins carrés, overlay `rgba(6,6,8,0.85)` + blur.
    Titre = même duo SANS 900 + SERIF italique or.
11. **Tableaux/listes** : lignes séparées par hairlines, header colonne en
    uppercase 9px letterSpacing 0.25em FAINT.
12. **NE PAS toucher à la logique** : props, hooks, handlers, i18n (`t(...)`),
    appels API, state — uniquement la présentation (styles inline, classNames couleurs).
13. Conserver `cursor-pointer`, focus visibles, aria-labels existants.
14. Classes partagées déjà refaites en Noir dans index.css (les garder) :
    `sf-card`, `btn-sf-primary`, `sf-search`, `sf-badge-*`, `glass-card`, `sf-topbar`.
