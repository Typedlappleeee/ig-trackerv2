# IG Tracker

Dashboard pour tracker tes comptes Instagram — statut, détection de ban, stats vidéos.

## Installation

### 1. Prérequis
- Python 3.10+
- Un VPS (Ubuntu/Debian recommandé) ou Windows local

### 2. Setup

```bash
# Clone / copie le dossier ig-tracker sur ton serveur
cd ig-tracker

# Installe les dépendances
pip install -r requirements.txt

# Lance le serveur
python main.py
```

Le dashboard est accessible sur **http://localhost:8000**
(ou http://TON_IP_VPS:8000 si sur un VPS)

---

## Configuration

### Ajouter des comptes
Deux façons :
1. **Via le dashboard** → champ en haut, tape le username et clique Ajouter
2. **Manuellement** → édite `accounts.json` :
```json
["username1", "username2", "username3"]
```

### Modifier la fréquence de refresh
Dans `main.py`, ligne `time.sleep(3600)` → change `3600` (secondes).
- Toutes les 30min → `1800`
- Toutes les 2h → `7200`

---

## Structure des fichiers

```
ig-tracker/
├── main.py           # Serveur + scraper
├── requirements.txt  # Dépendances Python
├── accounts.json     # Liste de tes comptes (auto-créé)
├── data.json         # Données scrapées (auto-créé)
└── templates/
    └── index.html    # Dashboard web
```

---

## Lancer en arrière-plan sur VPS (Linux)

```bash
# Avec nohup
nohup python main.py > tracker.log 2>&1 &

# Ou avec screen
screen -S igtracker
python main.py
# Ctrl+A puis D pour détacher
```

---

## Notes

- Le scraper utilise l'API mobile non-officielle d'Instagram (pas de clé API requise)
- Instagram peut bloquer les requêtes si elles sont trop fréquentes → ne pas passer en-dessous de 30min
- Les données sont stockées localement dans `data.json`
