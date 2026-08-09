# Auto-retry Oracle ARM (VM.Standard.A1.Flex)

Ce script retente la création de ton instance ARM **toutes les 60 secondes**
jusqu'à ce qu'un slot se libère à Paris. Tu le lances et tu peux fermer le PC —
il continue de tourner (si tu le lances sur un petit serveur), ou tu le laisses
tourner sur ton PC pendant que tu fais autre chose.

---

## Étape 1 — Installer le CLI Oracle

**Windows (PowerShell en administrateur) :**
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.ps1')"
```

**Mac / Linux :**
```bash
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"
```

Répond `Y` aux questions. Une fois fini, **ferme et rouvre** ton terminal.

Vérifie : `oci --version` → doit afficher un numéro de version.

---

## Étape 2 — Générer tes clés API Oracle

1. Dans la console Oracle → clique ton **avatar** (en haut à droite) → **User settings**
2. Section **API keys** → **Add API key**
3. Choisis **Generate API key pair** → **Download private key** (garde ce fichier)
4. Clique **Add**
5. Une fenêtre **Configuration File Preview** s'affiche → **copie tout ce texte**,
   tu en as besoin à l'étape suivante

---

## Étape 3 — Configurer le CLI

```bash
oci setup config
```

Réponds aux questions :
- **Location for config** : laisse par défaut (Entrée)
- **User OCID** : trouvable en haut de la page "User settings" (commence par `ocid1.user...`)
- **Tenancy OCID** : dans le texte copié à l'étape 2 (ligne `tenancy=...`)
- **Region** : `eu-paris-1`
- **Generate new key pair** : réponds `N` (tu as déjà téléchargé la clé) →
  donne le **chemin** vers le fichier `.pem` téléchargé

---

## Étape 4 — Récupérer les infos manquantes

Il te faut 3 identifiants (OCID) pour le script. Dans la console Oracle :

- **Compartment ID** : Menu ☰ → Identity → Compartments → clique `root` → copie l'OCID
- **Subnet ID** : Menu ☰ → Networking → Virtual Cloud Networks → ton VCN → Subnets → copie l'OCID
- **Image ID** : c'était dans ton URL d'erreur précédente — commence par
  `ocid1.image.oc1.eu-paris-1...` (celui de l'image aarch64 Ubuntu 24.04 Minimal)
- **SSH key** : le contenu de ta clé publique (`ssh-key-xxxx.key.pub`, PAS le `.key`)

---

## Étape 5 — Lancer le script

Copie `retry.sh` (à côté de ce README) sur ton PC, ouvre-le, remplace les 5
valeurs en haut (`COMPARTMENT_ID`, `SUBNET_ID`, `IMAGE_ID`, `SSH_KEY_PATH`,
`DISPLAY_NAME`), puis :

```bash
bash retry.sh
```

Il va afficher `Tentative #1... capacité indisponible` toutes les minutes, et
**s'arrêter automatiquement avec un ✅** dès que l'instance est créée.

Laisse-le tourner en fond (heures ou nuit) — dès qu'un slot Paris se libère, il
le capte immédiatement, bien plus vite qu'en cliquant à la main.
