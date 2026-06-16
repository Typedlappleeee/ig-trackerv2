# Audit Performance — ScaleFlow
*12 juin 2026 — 5 audits parallèles : Mixer, CloneVid, MassRemix/Montage, Uploads GeeLark, Flows de posting*

## TL;DR

| Zone | Gain potentiel | Effort |
|---|---|---|
| **Posting / Mass Posting** | **~70–85 s par run de 50 phones** | Faible-moyen |
| **MassRemix / Montage** | **1,5–2× plus rapide** | Faible-moyen |
| **Mixer (mélangeur)** | **3–4× sur le chemin critique** | Moyen |
| **CloneVid (repurpose)** | **30–40 % par clonage** | Faible |
| **Uploads GeeLark** | **6–15 s par run de 10 vidéos** | Faible |

Ce qui est déjà bon : upload vidéo dédupliqué (1 vidéo = 1 token pour N phones ✓), démarrage des phones batché ✓, pipeline Montage en une seule passe FFmpeg ✓.

---

## 1. Posting / Mass Posting — le plus gros gisement

### 🔴 Création des tâches RPA une par une — `MassPosting.tsx:641` / `Posting.tsx:463`
Chaque tâche Instagram est créée avec un `await` dans une boucle. 50 phones × ~500 ms de latence = **~25 s de pur réseau**.
**Fix** : `Promise.allSettled()` sur toutes les créations. **Gain : ~20–25 s.**

### 🔴 Arrêts de phones individuels — `MassPosting.tsx:669, 779`
Pendant le polling, chaque phone fini déclenche son propre appel `/phone/stop`. 50 phones = 50 appels au lieu d'un seul groupé.
**Fix** : accumuler les ids et arrêter par batch (toutes les 30 s ou en fin de run). **Gain : ~25 s + moins de saturation réseau.**

### 🟠 Boot fixe de 30 s — `MassPosting.tsx:629` / `Posting.tsx:442`
On attend 30 s quoi qu'il arrive, même si les phones sont prêts en 15 s.
**Fix** : poller `/phone/status` toutes les 2 s et démarrer dès que ~80 % des phones répondent. **Gain : ~10–15 s.**

### 🟠 Uploads séquentiels des vidéos — `MassPosting.tsx:581`
Les N vidéos distinctes sont uploadées une par une.
**Fix** : `Promise.all` (limité à 3-4 simultanés). **Gain : ~5–10 s pour 5 vidéos.**

### 🟡 Délai final de 5 s — `MassPosting.tsx:844`
Attente cosmétique avant reset. **Fix : 500 ms. Gain : ~4,5 s.**

---

## 2. MassRemix / Montage

### 🔴 Concurrence figée à 3 — `MassRemix.tsx:831`
3 remix FFmpeg en parallèle max, même sur un CPU 8-12 cœurs.
**Fix** : `Math.min(6, navigator.hardwareConcurrency - 2)`. **Gain : 20–50 % sur machines récentes.**

### 🔴 Détection de scène décode toute la vidéo — `electron/main.ts:758`
FFmpeg décode l'intégralité du clip en 2 fps pour détecter les scènes, écrit le raw sur disque puis le relit.
**Fix** : limiter avec `-t 10` (10 premières secondes) + pipe stdout au lieu d'un fichier temp. **Gain : 20–40 % sur clips > 30 s.**

### 🟠 Frames IA re-extraites pour chaque remix — `MassRemix.tsx:603`
Si la même source sert à N remix, ses frames sont extraites N fois.
**Fix** : cache `Map<originalPath, frames>` au niveau session. **Gain : 15–30 % en multi-remix.**

### 🟠 Audio ré-encodé systématiquement — `main.ts:727, 896, 1158`
`-c:a aac` même quand la source est déjà en AAC.
**Fix** : ffprobe le codec, `-c:a copy` si AAC. **Gain : 5–15 %.**

### 🟡 Cache des signed URLs Supabase — `Montage.tsx:622`
Chaque clip refait son lookup signedURL (~200 ms). **Fix** : cache local. **Gain : ~2 s sur 10 clips.**

---

## 3. Mixer (mélangeur)

### 🔴 Re-encodage complet pour un simple texte — `api/mix-overlay.js:127`
Le serveur ré-encode toute la vidéo en libx264 même quand la seule modification est un texte en overlay. C'est **le** goulot : ~60 s pour une vidéo de 10 min.
**Fix** : faire l'overlay texte côté client (le Canvas existe déjà dans le code) puis remux serveur en `-c copy` (zéro encodage). **Gain : 3–4× (60 s → 10 s).**

### 🟠 Concurrence 3 → 5-6 — `Mixer.tsx:328`
Les jobs partent par blocs de 3 ; un bloc attend que ses 3 vidéos finissent avant le suivant. **Gain : 40–60 % sur N vidéos.**

### 🟠 Métadonnées via copie complète en WASM — `ffmpeg-web.ts:127`
Pour lire durée/résolution, le fichier entier (parfois 500 Mo) est copié en mémoire WASM.
**Fix** : parser les en-têtes MP4 en JS (quelques Ko suffisent). **Gain : 10–50× sur cette étape.**

### 🟡 CRF 28 → 23 — `mix-overlay.js:128`
Aucun coût en temps, meilleure qualité Instagram. À unifier partout.

---

## 4. CloneVid (VideoRepurpose)

### 🟠 Thumbnails extraites une par une — `VideoRepurpose.tsx:333`
Après le traitement, les vignettes des 5 variantes sont générées séquentiellement. **Fix** : `Promise.all`. **Gain : 2–3 s.**

### 🟠 Uploads + inserts DB séquentiels — `VideoRepurpose.tsx:342`
Chaque variante est uploadée puis insérée en DB avant la suivante. **Fix** : paralléliser. **Gain : 1,5–2 s.**

### 🟡 Re-render de tous les jobs à chaque tick d'upload — `VideoRepurpose.tsx:312`
`onUploadProgress` met à jour chaque job individuellement → O(n) renders par tick. **Fix** : un seul `setJobs` batché.

---

## 5. Uploads GeeLark

### ✅ Déjà bon
Le `resourceUrl` GeeLark est bien réutilisé : 1 vidéo = 1 upload pour N phones.

### 🟠 URL présignée redemandée à chaque upload — `webAPI.ts:289`
`/upload/getUrl` est rappelé pour chaque fichier, même identique. **Fix** : sortir l'appel de la boucle. **Gain : 2–5 s.**

### 🟠 Fichier entier en RAM — `main.ts:672`, `geelark-upload.js:36`
`readFileSync` + `Buffer.from` chargent 500 Mo en mémoire avant le PUT.
**Fix** : `createReadStream` côté Electron, `dlRes.body` streamé côté proxy. **Gain : 1–3 s + RAM serveur libérée.**

### 🟡 Double PUT sans backoff — `webAPI.ts:304`
Échec → retry immédiat sans délai. **Fix** : backoff exponentiel (2 s, 4 s).

---

## Plan d'attaque recommandé

**Sprint 1 — gains massifs, effort faible (1 journée)**
1. Paralléliser création tâches RPA (Posting + MassPosting) → ~25 s/run
2. Batcher les `/phone/stop` → ~25 s/run
3. Concurrence MassRemix 3→6 et Mixer 3→5
4. Délai final 5 s → 0,5 s
5. Thumbnails + uploads CloneVid en `Promise.all`

**Sprint 2 — gains forts, effort moyen (2-3 jours)**
6. Overlay texte client + remux `-c copy` dans Mixer → 3-4×
7. Boot adaptatif (poll status au lieu de 30 s fixes)
8. Détection scène limitée à 10 s + pipe
9. Cache frames IA par source

**Sprint 3 — finitions**
10. Audio `-c copy` si source AAC
11. Streaming uploads (RAM)
12. CRF unifié à 23, presets veryfast
