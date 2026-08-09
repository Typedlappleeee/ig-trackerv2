# 📱 Tuto Oracle Cloud — Cloud phones + ScaleFlow

Tu as déjà ton compte Oracle Cloud actif. Suis les étapes dans l'ordre, chaque
commande est à **copier-coller telle quelle**. ~25 minutes.

---

## Étape 1 — Créer l'instance ARM

1. Connecte-toi sur **[cloud.oracle.com](https://cloud.oracle.com)**
2. Menu ☰ (en haut à gauche) → **Compute** → **Instances** → **Create Instance**
3. Renseigne :
   - **Name** : `scaleflow-phones`
   - **Image and shape** → **Edit** :
     - **Image** : **Ubuntu 24.04** (change l'image par défaut si besoin)
     - **Shape** → **Change shape** → onglet **Ampere** → **VM.Standard.A1.Flex**
       - **OCPUs** : `4` (le max gratuit)
       - **Memory** : `24` GB (le max gratuit)
   - **Add SSH keys** : laisse Oracle en générer une → **clique « Save private key »**
     et garde ce fichier (`ssh-key-xxxx.key`) précieusement, c'est ta clé de connexion
4. **Create**

⏳ Attends que le statut passe à **RUNNING** (1-2 min), puis note l'**IP publique**
affichée sur la page de l'instance.

---

## Étape 2 — Ouvrir le port du réseau (pare-feu Oracle)

Oracle bloque tout par défaut. Il faut ouvrir le port `8787` (celui de l'agent) :

1. Sur la page de ton instance → section **Primary VNIC** → clique le nom du
   **subnet** (lien bleu)
2. Clique le **Security List** associé (souvent `Default Security List for...`)
3. **Add Ingress Rules** :
   - **Source CIDR** : `0.0.0.0/0`
   - **IP Protocol** : `TCP`
   - **Destination Port Range** : `8787`
   - (répète avec `443` pour le HTTPS de l'étape 4)
4. **Add Ingress Rules**

---

## Étape 3 — Se connecter au serveur

Sur ton PC (Windows : PowerShell ; Mac/Linux : Terminal), dans le dossier où est
ta clé téléchargée :

```bash
chmod 400 ssh-key-xxxx.key
ssh -i ssh-key-xxxx.key ubuntu@TON_IP
```

Remplace `ssh-key-xxxx.key` par le nom réel de ton fichier, et `TON_IP`.
À `Are you sure you want to continue connecting?` → tape `yes`.

✅ **Tu dois voir** une invite du type `ubuntu@scaleflow-phones:~$`

> Sur Oracle, l'utilisateur est **`ubuntu`**, pas `root`. Pour les commandes qui
> suivent, ajoute `sudo` devant si besoin (le script s'en charge déjà).

---

## Étape 4 — Tout installer (une seule commande)

**4.1** — Passe en root pour simplifier la suite :

```bash
sudo -i
```

✅ L'invite devient `root@scaleflow-phones:~#`

**4.2** — Ouvre l'éditeur :

```bash
nano install.sh
```

**4.3** — Colle **tout le contenu** du fichier `selfhost/install.sh`
(clic droit = coller dans PowerShell/Terminal).

**4.4** — Enregistre et quitte : `Ctrl+O` → `Entrée` → `Ctrl+X`

**4.5** — Oracle bloque aussi le firewall **dans** la machine (iptables), en plus
du pare-feu réseau de l'étape 2. On l'ouvre :

```bash
iptables -I INPUT -p tcp --dport 8787 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
netfilter-persistent save 2>/dev/null || true
```

**4.6** — Lance :

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

📝 **Copie ce token** — il te servira dans ScaleFlow.

❌ Erreur rouge ? Copie-la et envoie-la moi.

---

## Étape 5 — Rendre l'agent accessible en HTTPS

ScaleFlow tourne en HTTPS, il ne peut pas appeler du `http://` simple.

### Tu n'as PAS de nom de domaine → DuckDNS (gratuit, 2 min)

**5.1** — Va sur **[duckdns.org](https://www.duckdns.org)** → connecte-toi
(Google/GitHub)

**5.2** — Crée un sous-domaine, ex. `tonnom-phones` → devient
`tonnom-phones.duckdns.org`

**5.3** — Dans **current ip**, mets l'**IP publique de ton instance Oracle** →
**update ip**

**5.4** — Sur le serveur (toujours en root) :

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

**5.5** — Configure Caddy pour utiliser le token de l'étape 4 (remplace
`tonnom-phones.duckdns.org` par TON sous-domaine, et `TON_TOKEN` par le token) :

```bash
mkdir -p /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/override.conf <<EOF
[Service]
Environment=SCALEFLOW_TOKEN=TON_TOKEN
EOF

cat >/etc/caddy/Caddyfile <<'EOF'
tonnom-phones.duckdns.org {
    # Agent (API pilotée par ScaleFlow)
    reverse_proxy /health* localhost:8787
    reverse_proxy /instances* localhost:8787

    # Écran FLUIDE (ws-scrcpy) — servi À LA RACINE du domaine (ws-scrcpy génère
    # des chemins d'assets absolus ; le monter sous /live/ avec strip_prefix
    # casse leur chargement → écran noir). ws-scrcpy n'a pas d'auth native, donc
    # seule la page d'accueil (/) est gardée par un token en query string (jamais
    # tronqué par Chrome, contrairement à des identifiants dans l'URL) — les
    # assets et le flux WebSocket qu'elle charge ensuite restent ouverts sur ce
    # sous-domaine à part (résiduel acceptable pour un usage admin uniquement).
    @sansToken {
        path /
        not query token={$SCALEFLOW_TOKEN}
    }
    respond @sansToken "Non autorisé" 401

    reverse_proxy localhost:8000
}
EOF
systemctl daemon-reload
systemctl restart caddy
```

### Vérification

Attends ~30 secondes (génération du certificat), puis :

```bash
curl -H "Authorization: Bearer TON_TOKEN" https://tonnom-phones.duckdns.org/health
```

✅ **Tu dois voir :** `{"ok":true,"image":"redroid/redroid:13.0.0-latest"}`

❌ Erreur de certificat → attends 1 min, réessaie. Toujours en erreur → envoie-moi
la sortie de `journalctl -u caddy -n 30 --no-pager`.

---

## Étape 6 — Brancher dans ScaleFlow

Dans ScaleFlow (compte admin) → onglet **Cloud Phones** :

| Champ | Valeur |
|---|---|
| **URL de l'agent** | `https://tonnom-phones.duckdns.org` |
| **Token** | celui de l'étape 4 |

→ **Tester la connexion** → **Créer un téléphone**. Premier boot Android = 1-2 min.

---

## 🔧 Spécificités Oracle — problèmes courants

| Symptôme | Solution |
|---|---|
| `ssh: connect: Connection timed out` | Le port SSH (22) n'est pas ouvert dans la Security List → refais l'étape 2 avec le port 22 |
| Agent installé mais injoignable de l'extérieur | Tu as sauté l'étape 4.5 (iptables) ou l'étape 2 (Security List port 8787) |
| `binder n'a pas pu être chargé` | Rare sur Oracle A1, mais possible selon le noyau → envoie-moi `uname -a` |
| Instance très lente à créer | Capacité ARM Oracle parfois saturée dans ta région → change de région (Availability Domain) |
| Compte suspendu après création | Contacte le support Oracle (rare une fois l'instance déjà créée) |

**Commandes utiles :**

```bash
systemctl status scaleflow-agent     # état de l'agent
journalctl -u scaleflow-agent -f     # logs en direct
docker ps                            # téléphones qui tournent
free -h                              # RAM disponible (24 Go max gratuit → ~9 téléphones)
```

---

## ⚠️ Avant tes vrais comptes

1. **Un proxy par téléphone** — sinon tous tes comptes sortent sur l'IP Oracle →
   détection immédiate.
2. **Teste 3-4 semaines avec des comptes jetables** avant de migrer tes vrais
   comptes.
