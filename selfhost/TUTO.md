# 📱 Tuto — Monter tes cloud phones et les brancher sur ScaleFlow

Suis les étapes dans l'ordre. Chaque commande est à **copier-coller telle quelle**.
À chaque étape je te dis **ce que tu dois voir** — si tu vois autre chose, arrête-toi
et envoie-moi le message.

⏱ Environ 30 minutes.

---

## Étape 1 — Louer le serveur

1. Va sur **[console.hetzner.cloud](https://console.hetzner.cloud)** → crée un compte
2. **New Project** → nomme-le `scaleflow` → **Add Server**
3. Renseigne :
   - **Location** : **Falkenstein**, **Nuremberg** ou **Helsinki** ← ⚠️ l'ARM
     n'existe QUE dans ces 3 villes. Ailleurs (US, Singapour), rien ne s'affichera.
   - **Image** : **Ubuntu 24.04**
   - **Type** : onglet **Arm64 (Ampere)** ← ⚠️ **très important**

   | Modèle | vCPU / RAM | Prix/mois | Téléphones |
   |---|---|---|---|
   | **CAX41** | 16 / 32 Go | **41,49 €** | ~10-12 |
   | **CAX31** | 8 / 16 Go | **21,49 €** | ~5-6 |
   | **CAX21** | 4 / 8 Go | **10,99 €** | ~2-3 *(test)* |

   - **SSH key** : ajoute la tienne, sinon coche le mot de passe root (reçu par mail)
4. **Create & Buy now**

📝 Note l'**adresse IP** affichée (ex. `128.140.x.x`).

> ⚠️ **ARM (CAX) obligatoire.** Sur un serveur x86 (CX/CPX), Android doit traduire
> les applis ARM → signal de détection évident pour Instagram.

### 🔴 « Not available » sur tous les modèles ?

C'est fréquent : **l'ARM Hetzner est souvent en rupture**. Dans l'ordre :

1. **Vérifie la localisation** — choisis **Falkenstein**, **Nuremberg** ou
   **Helsinki**. Sur toute autre ville, l'ARM n'est pas proposé du tout.
2. **Regarde le stock en direct** : [radar.iodev.org/cloud-status](https://radar.iodev.org/cloud-status)
   → tu vois quel modèle est dispo dans quelle ville, en temps réel.
3. **Essaie le CAX41** — les petits modèles (CAX11/21/31) partent en premier.
4. **Réessaie plus tard** — le stock revient en général **en quelques heures**.

**Si vraiment rien ne se libère**, alternatives ARM :

| Fournisseur | Offre | Prix |
|---|---|---|
| **Oracle Cloud** | Ampere A1 : 4 cœurs / 24 Go | **gratuit à vie** *(idéal pour tester)* |
| **Scaleway** | instances ARM Ampere | ~15-40 €/mois |
| **Netcup** | VPS ARM | ~8-25 €/mois |

Dis-moi lequel tu prends, je t'adapte le tuto (les commandes sont quasi identiques).

---

## Étape 2 — Se connecter au serveur

Sur ton PC, ouvre **PowerShell** (Windows) ou **Terminal** (Mac) :

```bash
ssh root@TON_IP
```

Remplace `TON_IP`. À la question `Are you sure you want to continue connecting?`
→ tape `yes`.

✅ **Tu dois voir** une invite du type `root@ubuntu-8gb-fsn1:~#`

---

## Étape 3 — Tout installer (une seule commande)

C'est ici que tout se fait : Docker, Android, l'agent, le service.

**3.1** — Ouvre l'éditeur :

```bash
nano install.sh
```

**3.2** — Colle **tout le contenu** du fichier `selfhost/install.sh`
(clic droit dans PowerShell = coller).

**3.3** — Enregistre et quitte : `Ctrl+O` → `Entrée` → `Ctrl+X`

**3.4** — Lance :

```bash
bash install.sh
```

⏳ Compte 2-3 minutes.

✅ **Tu dois voir à la fin :**

```
╔══════════════════════════════════════════════════════════════╗
║  ✅ INSTALLATION TERMINÉE                                    ║
╚══════════════════════════════════════════════════════════════╝

  🔑 TON TOKEN (à coller dans ScaleFlow) :

      a1b2c3d4e5f6...
```

📝 **Copie ce token précieusement** — il te servira dans ScaleFlow.

❌ **Si tu vois une erreur rouge** → copie-la et envoie-la moi.

---

## Étape 4 — Rendre l'agent accessible en HTTPS

ScaleFlow tourne en HTTPS et ne peut pas appeler un serveur en HTTP simple.
Il te faut donc une adresse sécurisée. **Deux cas :**

### 🅰️ Tu n'as PAS de nom de domaine → DuckDNS (gratuit)

**4.1** — Va sur **[duckdns.org](https://www.duckdns.org)** → connecte-toi (Google/GitHub)

**4.2** — Crée un sous-domaine, ex. `tonnom-phones` → il devient
`tonnom-phones.duckdns.org`

**4.3** — Dans le champ **current ip**, mets l'**IP de ton serveur** → **update ip**

**4.4** — Sur le serveur, installe le certificat automatique :

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

**4.5** — Configure (remplace par TON sous-domaine) :

```bash
cat >/etc/caddy/Caddyfile <<'EOF'
tonnom-phones.duckdns.org {
    reverse_proxy localhost:8787
}
EOF
systemctl restart caddy
```

### 🅱️ Tu AS un nom de domaine

Fais pointer un sous-domaine (ex. `phones.tondomaine.com`) vers l'IP du serveur
(enregistrement **A**), puis fais **4.4** et **4.5** avec ton domaine.

### Vérification (dans les deux cas)

Attends ~30 secondes (le certificat se génère), puis :

```bash
curl -H "Authorization: Bearer TON_TOKEN" https://TON_DOMAINE/health
```

✅ **Tu dois voir :** `{"ok":true,"image":"redroid/redroid:16.0.0-latest"}`

❌ Si erreur de certificat → attends 1 min et réessaie (Let's Encrypt met un peu
de temps). Si ça persiste, envoie-moi le retour de `journalctl -u caddy -n 30 --no-pager`.

---

## Étape 5 — Brancher dans ScaleFlow

Dans ScaleFlow (ton compte admin) → onglet **Cloud Phones** :

| Champ | Valeur |
|---|---|
| **URL de l'agent** | `https://tonnom-phones.duckdns.org` |
| **Token** | celui de l'étape 3 |

→ **Tester la connexion** → **Créer un téléphone**

⏳ Le tout premier démarrage prend **1-2 min** (Android boote). Ensuite tu vois
l'écran et tu le pilotes comme un téléphone GeeLark.

---

## 🔧 Problèmes courants

| Symptôme | Solution |
|---|---|
| `binder n'a pas pu être chargé` | Tu n'es pas sur Ubuntu 24.04, ou pas sur ARM. Recrée le serveur. |
| L'agent ne répond pas | `journalctl -u scaleflow-agent -n 40 --no-pager` → envoie-moi la sortie |
| Certificat HTTPS en erreur | Le domaine ne pointe pas encore vers l'IP. Attends 2 min. |
| Téléphone créé mais reste éteint | Premier boot = 1-2 min. Ensuite : `docker logs sfphone_NOM` |
| Plus de RAM | ~2,5 Go par téléphone. CAX41 (31 Go) → 10-12 max. |

**Commandes utiles :**

```bash
systemctl status scaleflow-agent     # état de l'agent
journalctl -u scaleflow-agent -f     # logs en direct
docker ps                            # téléphones qui tournent
free -h                              # RAM disponible
```

---

## ⚠️ Avant d'y mettre tes vrais comptes

1. **Un proxy par téléphone.** Sans ça, tous tes comptes sortent sur la **même IP**
   (celle du serveur) → détection quasi immédiate. Réutilise tes proxies existants.
2. **Teste 3-4 semaines avec des comptes jetables.** La survie des comptes face à
   la détection Instagram est le **seul vrai inconnu** de ce montage — et c'est
   précisément ce que tu paies chez GeeLark.
