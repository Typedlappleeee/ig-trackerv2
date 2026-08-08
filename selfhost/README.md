# Cloud phones maison — branchés sur ScaleFlow

Objectif : faire tourner **tes propres téléphones Android** sur un serveur, et les
piloter depuis ScaleFlow (onglet admin **Cloud Phones**).

Compte ~**30 min** de mise en place. Aucune connaissance serveur avancée requise :
toutes les commandes sont à copier-coller.

---

## 1. Louer le serveur

Chez **Hetzner Cloud** (le moins cher pour de l'ARM) :

1. Crée un compte → **Cloud** → **New Project** → **Add Server**
2. **Location** : Falkenstein ou Helsinki
3. **Image** : **Ubuntu 24.04**
4. **Type** : onglet **Arm64 (Ampere)** → **CAX41** (16 vCPU, 31 Go) ≈ **33 €/mois**
   - Pour un simple test : **CAX21** (8 vCPU, 16 Go) ≈ 16 €/mois → 4-5 téléphones
5. **SSH key** : ajoute la tienne (ou choisis un mot de passe root, envoyé par mail)
6. **Create & Buy now**

> ⚠️ Prends bien un serveur **ARM (CAX)**, pas x86 (CX/CPX). Android tourne alors
> **nativement en ARM**, comme un vrai téléphone — c'est bien moins détectable.

Note l'**adresse IP** du serveur.

---

## 2. Préparer le serveur

Connecte-toi : `ssh root@TON_IP` puis colle **tout ce bloc** :

```bash
# Docker + ADB
apt update && apt install -y docker.io adb curl

# Module noyau "binder" requis par Android (Redroid)
apt install -y linux-modules-extra-$(uname -r)
modprobe binder_linux devices="binder,hwbinder,vndbinder"
echo 'binder_linux' >> /etc/modules-load.d/redroid.conf
echo 'options binder_linux devices=binder,hwbinder,vndbinder' > /etc/modprobe.d/redroid.conf

# Vérification (doit afficher des lignes "binder")
lsmod | grep binder
```

Si `lsmod | grep binder` n'affiche **rien**, arrête-toi et dis-le moi.

---

## 3. Installer l'agent ScaleFlow

L'agent est le petit service qui permet à ScaleFlow de piloter les téléphones.

```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs

# Dossier de l'agent
mkdir -p /opt/scaleflow-agent && cd /opt/scaleflow-agent
```

Copie ensuite le fichier `selfhost/agent/server.js` de ce dépôt dans
`/opt/scaleflow-agent/server.js` (par ex. avec `nano server.js` puis coller).

**Génère ton token secret** (il relie ScaleFlow à ton serveur) :

```bash
openssl rand -hex 24
```

👉 **Copie ce token, tu en auras besoin dans ScaleFlow.**

Puis crée le service pour qu'il démarre tout seul :

```bash
cat >/etc/systemd/system/scaleflow-agent.service <<'EOF'
[Unit]
Description=ScaleFlow phone agent
After=docker.service

[Service]
Environment=AGENT_TOKEN=COLLE_TON_TOKEN_ICI
Environment=PORT=8787
ExecStart=/usr/bin/node /opt/scaleflow-agent/server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# ⚠️ Remplace COLLE_TON_TOKEN_ICI par ton token, puis :
systemctl daemon-reload && systemctl enable --now scaleflow-agent
systemctl status scaleflow-agent --no-pager
```

Test : `curl -H "Authorization: Bearer TON_TOKEN" http://localhost:8787/health`
→ doit répondre `{"ok":true,...}`

---

## 4. Rendre l'agent accessible en HTTPS

ScaleFlow tourne en HTTPS : il ne peut pas appeler un serveur en `http://` simple.
Le plus simple — un nom de domaine + Caddy (certificat automatique) :

1. Fais pointer un sous-domaine (ex. `phones.tondomaine.com`) vers l'IP du serveur
2. Puis :

```bash
apt install -y caddy
cat >/etc/caddy/Caddyfile <<'EOF'
phones.tondomaine.com {
    reverse_proxy localhost:8787
}
EOF
systemctl restart caddy
```

Ton agent est maintenant sur `https://phones.tondomaine.com`.

> Pas de domaine ? Dis-le moi, on passera par un relais côté ScaleFlow.

---

## 5. Brancher dans ScaleFlow

Dans ScaleFlow (compte **admin**) → onglet **Cloud Phones** :

- **URL de l'agent** : `https://phones.tondomaine.com`
- **Token** : celui généré à l'étape 3

→ **Tester la connexion**, puis **Créer un téléphone**. Le premier démarrage prend
1-2 min (Android boote), ensuite tu le vois et tu le pilotes depuis ScaleFlow.

---

## Rappels importants

- **Un proxy par téléphone** : sans ça, tous tes comptes sortent sur l'IP du
  serveur → détection immédiate. Réutilise tes proxies existants.
- **Teste avec des comptes jetables** pendant 3-4 semaines avant d'y mettre tes
  vrais comptes. La survie des comptes est le seul vrai inconnu.
- **Capacité** : compte ~2,5 Go de RAM par téléphone (CAX41 = 31 Go → ~10-12).
