import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog, simpledialog
import threading, hashlib, time, json, httpx, sys, subprocess, shutil, random, re
import concurrent.futures
import http.server, socketserver, socket, urllib.parse as _urlparse
from datetime import datetime
from pathlib import Path

BASE_DIR      = Path(sys.argv[0]).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
DATA_FILE     = BASE_DIR / "data.json"
CONFIG_FILE   = BASE_DIR / "config.json"
BANK_FILE     = BASE_DIR / "bank.json"
PRESETS_FILE  = BASE_DIR / "presets.json"
IG_SESS_DIR   = BASE_DIR / "ig_sessions"

try:
    from PIL import Image, ImageTk, ImageDraw, ImageFont, ImageFilter, ImageEnhance
    PIL_OK = True
except ImportError:
    PIL_OK = False

try:
    from tkinterdnd2 import TkinterDnD, DND_FILES
    DND_OK = True
except ImportError:
    DND_OK = False

# ── Thèmes de couleur ─────────────────────────────────────────────────────────
THEMES = {
    "Lime":    {"accent": "#4f8ef7", "accent2": "#3d7ae5", "ok": "#00d4aa"},
    "Bleu":    {"accent": "#4f9eff", "accent2": "#2070dd", "ok": "#00d4aa"},
    "Violet":  {"accent": "#a56ef5", "accent2": "#7c3ed4", "ok": "#00d4aa"},
    "Ambre":   {"accent": "#ffb830", "accent2": "#e09000", "ok": "#00d4aa"},
    "Rouge":   {"accent": "#ff5c6e", "accent2": "#cc2d3e", "ok": "#00d4aa"},
    "Cyan":    {"accent": "#00e5d4", "accent2": "#00aaa0", "ok": "#00d4aa"},
    "Rose":    {"accent": "#ff6ec7", "accent2": "#cc1a8a", "ok": "#00d4aa"},
    "Vert":    {"accent": "#2dde78", "accent2": "#1aaa55", "ok": "#00d4aa"},
}

# ── Palette principale ────────────────────────────────────────────────────────
BG       = "#07080d"
SURFACE  = "#0c0e17"
SURFACE2 = "#12141f"
SURFACE3 = "#181b28"
BORDER   = "#1e2133"
CARD     = "#0f1119"
HL       = "#191d2e"
ACCENT   = "#4f8ef7"
ACCENT2  = "#3d7ae5"
DANGER   = "#ff3d51"
OK       = "#00d4aa"
WARN     = "#ff9f1c"
TEXT     = "#dde3f0"
TEXT2    = "#5d6680"
MUTED    = "#2a2f44"

# ── Internationalisation ──────────────────────────────────────────────────────
TRANSLATIONS = {
    "fr": {
        # Sidebar
        "tab.dashboard":    "Dashboard",
        "tab.phones":       "Téléphones",
        "tab.insta":        "INSTA",
        "tab.stats":        "Stats",
        "tab.posting":      "Posting",
        "tab.masspost":     "Mass Posting",
        "tab.bank":         "Banque vidéos",
        "tab.autocomment":  "Automatisation",
        "tab.tools":        "Outils IA",
        "tab.montage":      "MONTAGE",
        "tab.automation":   "Montage vidéo",
        "tab.settings":     "Paramètres",
        # Dashboard
        "dash.title":       "Dashboard",
        "dash.subtitle":    "Vues totales par jour — temps réel",
        "dash.range.24h":   "24 h",
        "dash.range.7d":    "7 jours",
        "dash.range.30d":   "30 jours",
        "dash.range.all":   "Tout",
        "dash.kpi.today":   "VUES AUJOURD'HUI",
        "dash.kpi.delta":   "ÉVOLUTION 24 H",
        "dash.kpi.peak":    "PIC MAX",
        "dash.kpi.avg":     "MOYENNE / JOUR",
        "dash.empty":       "Pas encore d'historique — rafraîchis pour démarrer le suivi",
        # Stat cards
        "card.phones":      "TÉLÉPHONES",
        "card.active":      "IG ACTIFS",
        "card.banned":      "BANNIS",
        "card.views":       "VUES TOTALES",
        "card.click_filter": "cliquer pour filtrer",
        # Common
        "common.refresh":   "↺  Rafraîchir",
        "common.save":      "💾  Sauvegarder",
        "common.cancel":    "Annuler",
        "common.delete":    "Supprimer",
        "common.rename":    "Renommer",
        # Settings sub-tabs
        "settings.profile":      "Profil",
        "settings.connections":  "Connexions",
        "settings.api":          "API Keys",
        "settings.appearance":   "Apparence",
        "settings.notifications": "Notifications",
        "settings.language":     "Langue",
        # Coming soon
        "soon.label":            "BIENTÔT",
        "soon.twitter":          "Twitter",
        "soon.threads":          "Threads",
        # Posting tab
        "post.title":            "Posting",
        "post.subtitle":         "Publiez des Reels sur vos comptes GéeLark",
        "post.video":            "Vidéo à poster",
        "post.no_video":         "Aucune vidéo sélectionnée",
        "post.bank_empty":       "Banque vide — ajoute des vidéos",
        "post.targets":          "Comptes cibles",
        "post.group":            "Groupe :",
        "post.all":              "Tous",
        "post.caption":          "Caption",
        "post.caption_hint":     "Ctrl+A pour tout sélectionner · Ctrl+V pour coller",
        "post.delay":            "Délai entre comptes :",
        "post.delay_hint":       "min entre chaque compte",
        "post.launch":           "🚀  Lancer le posting",
        "post.waiting":          "En attente",
        "post.no_account":       "⚠ Sélectionne au moins un téléphone",
        "post.no_video_msg":     "⚠ Sélectionne une vidéo dans la banque",
        "post.no_caption":       "⚠ La caption est obligatoire",
        "post.no_token":         "❌ Bearer Token GéeLark manquant",
        "post.journal":          "Journal détaillé",
        # Mass posting
        "mp.title":              "Mass Posting",
        "mp.video_pool":         "📹  POOL DE VIDÉOS",
        "mp.caption_pool":       "💬  POOL DE CAPTIONS",
        "mp.add":                "+ Ajouter",
        "mp.remove":             "✕ Retirer",
        # Bank tab
        "bank.title":            "Banque de vidéos",
        "bank.subtitle":         "Toutes tes vidéos exportées",
        "bank.empty":            "Aucune vidéo — exporte depuis Montage",
        # Stats tab
        "stats.title":           "Stats Instagram",
        "stats.subtitle":        "Statistiques de tes comptes Instagram",
        "stats.select":          "Sélectionne un compte →",
        "stats.no_videos":       "Aucune vidéo enregistrée",
        "stats.sort_recent":     "Plus récent",
        "stats.sort_old":        "Plus ancien",
        "stats.sort_views_desc": "+ de vues",
        "stats.sort_views_asc":  "- de vues",
        "stats.sort_likes_desc": "+ de likes",
        # Common
        "common.add":            "Ajouter",
        "common.load":           "Charger",
        "common.export":         "Exporter",
        "common.start":          "▶ Démarrer",
        "common.stop":           "■ Arrêter",
        "common.test":           "Tester",
        "common.copy":           "📋 Copier",
        "common.browse":         "📂 Parcourir",
    },
    "en": {
        "tab.dashboard":    "Dashboard",
        "tab.phones":       "Phones",
        "tab.insta":        "INSTA",
        "tab.stats":        "Stats",
        "tab.posting":      "Posting",
        "tab.masspost":     "Mass Posting",
        "tab.bank":         "Video Bank",
        "tab.autocomment":  "Automation",
        "tab.tools":        "AI Tools",
        "tab.montage":      "EDITING",
        "tab.automation":   "Video Editor",
        "tab.settings":     "Settings",
        "dash.title":       "Dashboard",
        "dash.subtitle":    "Total views per day — live",
        "dash.range.24h":   "24 h",
        "dash.range.7d":    "7 days",
        "dash.range.30d":   "30 days",
        "dash.range.all":   "All",
        "dash.kpi.today":   "VIEWS TODAY",
        "dash.kpi.delta":   "24H CHANGE",
        "dash.kpi.peak":    "PEAK",
        "dash.kpi.avg":     "AVG / DAY",
        "dash.empty":       "No history yet — refresh to start tracking",
        "card.phones":      "PHONES",
        "card.active":      "IG ACTIVE",
        "card.banned":      "BANNED",
        "card.views":       "TOTAL VIEWS",
        "card.click_filter": "click to filter",
        "common.refresh":   "↺  Refresh",
        "common.save":      "💾  Save",
        "common.cancel":    "Cancel",
        "common.delete":    "Delete",
        "common.rename":    "Rename",
        "settings.profile":      "Profile",
        "settings.connections":  "Connections",
        "settings.api":          "API Keys",
        "settings.appearance":   "Appearance",
        "settings.notifications": "Notifications",
        "settings.language":     "Language",
        "post.title":            "Posting",
        "post.subtitle":         "Publish Reels to your GéeLark accounts",
        "post.video":            "Video to post",
        "post.no_video":         "No video selected",
        "post.bank_empty":       "Bank empty — add videos",
        "post.targets":          "Target accounts",
        "post.group":            "Group:",
        "post.all":              "All",
        "post.caption":          "Caption",
        "post.caption_hint":     "Ctrl+A to select all · Ctrl+V to paste",
        "post.delay":            "Delay between accounts:",
        "post.delay_hint":       "min between each account",
        "post.launch":           "🚀  Launch posting",
        "post.waiting":          "Waiting",
        "post.no_account":       "⚠ Select at least one phone",
        "post.no_video_msg":     "⚠ Select a video from the bank",
        "post.no_caption":       "⚠ Caption is required",
        "post.no_token":         "❌ GéeLark Bearer Token missing",
        "post.journal":          "Detailed log",
        "mp.title":              "Mass Posting",
        "mp.video_pool":         "📹  VIDEO POOL",
        "mp.caption_pool":       "💬  CAPTION POOL",
        "mp.add":                "+ Add",
        "mp.remove":             "✕ Remove",
        "bank.title":            "Video bank",
        "bank.subtitle":         "All your exported videos",
        "bank.empty":            "No videos — export from Editor",
        "stats.title":           "Instagram Stats",
        "stats.subtitle":        "Stats for your Instagram accounts",
        "stats.select":          "Select an account →",
        "stats.no_videos":       "No videos recorded",
        "stats.sort_recent":     "Most recent",
        "stats.sort_old":        "Oldest",
        "stats.sort_views_desc": "Most views",
        "stats.sort_views_asc":  "Fewest views",
        "stats.sort_likes_desc": "Most likes",
        "common.add":            "Add",
        "common.load":           "Load",
        "common.export":         "Export",
        "common.start":          "▶ Start",
        "common.stop":           "■ Stop",
        "common.test":           "Test",
        "common.copy":           "📋 Copy",
        "common.browse":         "📂 Browse",
        "soon.label":            "SOON",
        "soon.twitter":          "Twitter",
        "soon.threads":          "Threads",
    },
}

def t(key, lang="fr"):
    """Translate a key. Falls back to French if missing in target language."""
    return TRANSLATIONS.get(lang, {}).get(key) or TRANSLATIONS["fr"].get(key, key)

def apply_theme_globals(theme_name):
    global ACCENT, ACCENT2, OK
    t = THEMES.get(theme_name, THEMES["Lime"])
    ACCENT  = t["accent"]
    ACCENT2 = t["accent2"]
    OK      = t["ok"]

# ── Helpers ───────────────────────────────────────────────────────────────────
def normalize_proxy(p: str) -> str:
    """
    Normalise les formats de proxy courants vers socks5://user:pass@host:port.
    Gère : host:port:user:pass  et  socks5://host:port:user:pass
    """
    if not p or not p.strip():
        return ""
    p = p.strip()
    # Déjà bien formé si on trouve @ après le schéma
    if re.match(r'^(socks5|socks4|https?)://[^:@]+:[^@]+@', p):
        return p
    # Schéma présent mais sans @ : socks5://host:port:user:pass
    m = re.match(r'^(socks5|socks4|https?)://([^:]+):(\d+):([^:]+):(.+)$', p)
    if m:
        scheme, host, port, user, pwd = m.groups()
        return f"{scheme}://{user}:{pwd}@{host}:{port}"
    # Sans schéma : host:port:user:pass
    m = re.match(r'^([^:]+):(\d+):([^:]+):(.+)$', p)
    if m:
        host, port, user, pwd = m.groups()
        return f"socks5://{user}:{pwd}@{host}:{port}"
    return p  # on renvoie tel quel si on ne reconnaît pas le format

def load_config():
    try:
        if CONFIG_FILE.exists():
            t = CONFIG_FILE.read_text(encoding="utf-8").strip()
            if t:
                cfg = json.loads(t)
                # Normalise le proxy au chargement
                if cfg.get("proxy"):
                    cfg["proxy"] = normalize_proxy(cfg["proxy"])
                return cfg
    except:
        pass
    return {}

def save_config(c):
    try:
        CONFIG_FILE.write_text(json.dumps(c, indent=2), encoding="utf-8")
    except:
        pass

def load_data():
    try:
        if DATA_FILE.exists():
            t = DATA_FILE.read_text(encoding="utf-8").strip()
            if t:
                return json.loads(t)
    except:
        pass
    return {}

def save_data(d):
    try:
        DATA_FILE.write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    except:
        pass

def load_bank():
    try:
        if BANK_FILE.exists():
            t = BANK_FILE.read_text(encoding="utf-8").strip()
            if t:
                return json.loads(t)
    except:
        pass
    return []

def save_bank(b):
    try:
        BANK_FILE.write_text(json.dumps(b, indent=2, ensure_ascii=False), encoding="utf-8")
    except:
        pass

def load_presets():
    try:
        if PRESETS_FILE.exists():
            t = PRESETS_FILE.read_text(encoding="utf-8").strip()
            if t:
                return json.loads(t)
    except:
        pass
    return {}

def save_presets(p):
    try:
        PRESETS_FILE.write_text(json.dumps(p, indent=2, ensure_ascii=False), encoding="utf-8")
    except:
        pass

def fmt(n):
    try:
        n = int(n)
    except:
        return "0"
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)

def randomize_mp4_metadata(src, dst):
    shutil.copy2(src, dst)
    try:
        with open(dst, 'r+b') as f:
            data = bytearray(f.read(64))
            for i in [12, 13, 14, 15, 24, 25]:
                if i < len(data):
                    data[i] = random.randint(0, 255)
            f.seek(0)
            f.write(bytes(data))
    except:
        pass

# ── GéeLark ───────────────────────────────────────────────────────────────────
def fetch_phones(bearer):
    try:
        items, page = [], 1
        while True:
            r = httpx.post(
                "https://openapi.geelark.com/open/v1/phone/list",
                json={"page": page, "pageSize": 50},
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {bearer}"},
                timeout=20)
            d = r.json()
            if d.get("code") != 0:
                break
            batch = d.get("data", {}).get("items", [])
            items.extend(batch)
            if len(items) >= d.get("data", {}).get("total", 0) or not batch:
                break
            page += 1
        return items
    except:
        return []

# ── Instagram ─────────────────────────────────────────────────────────────────
_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

def _proxy_url(proxy):
    """Return a normalized proxy URL string, or None if invalid/placeholder."""
    if not proxy:
        return None
    p = normalize_proxy(proxy)
    if p and re.match(r'^(socks5|socks4|https?)://', p) and "user:pass" not in p:
        return p
    return None

def _parse_ig_graphql(user, username):
    """Extract standard result dict from a graphql user node."""
    posts = user.get("edge_owner_to_timeline_media", {})
    videos = []
    for e in posts.get("edges", []):
        n = e.get("node", {})
        if n.get("is_video"):
            caps = n.get("edge_media_to_caption", {}).get("edges", [])
            videos.append({
                "id":            n.get("shortcode"),
                "url":           f"https://www.instagram.com/reel/{n.get('shortcode')}/",
                "views":         n.get("video_view_count", 0),
                "likes":         n.get("edge_liked_by", {}).get("count", 0),
                "comments":      n.get("edge_media_to_comment", {}).get("count", 0),
                "shares":        n.get("reshare_count", 0),
                "caption":       (caps[0]["node"]["text"][:120] if caps else ""),
                "thumbnail_url": n.get("thumbnail_src") or n.get("display_url", ""),
                "display_url":   n.get("display_url", ""),
                "taken_at":      n.get("taken_at_timestamp", 0),
            })
    return {
        "ig_status":   "active",
        "ig_username": user.get("username", username),
        "full_name":   user.get("full_name", ""),
        "followers":   user.get("edge_followed_by", {}).get("count", 0),
        "following":   user.get("edge_follow", {}).get("count", 0),
        "posts_count": posts.get("count", 0),
        "bio":         user.get("biography", ""),
        "videos":      videos[:20],
        "last_checked": datetime.now().isoformat(),
    }

def scrape_ig(username, proxy=None, sessionid=None):
    """Multi-strategy Instagram scraper. Best results with a valid sessionid cookie."""
    purl = _proxy_url(proxy)
    kw = {"timeout": 25, "follow_redirects": True}
    if purl:
        kw["proxy"] = purl

    errors = []   # collect per-strategy errors for reporting

    try:
        with httpx.Client(**kw) as client:
            # ── Step 1: get csrf token (always needed) ────────────────────────
            csrf = ""
            try:
                init = client.get("https://www.instagram.com/", headers={
                    "User-Agent":      _BROWSER_UA,
                    "Accept":          "text/html,application/xhtml+xml,*/*;q=0.8",
                    "Accept-Language": "fr-FR,fr;q=0.9",
                }, timeout=15)
                csrf = init.cookies.get("csrftoken", "")
            except Exception as ex:
                errors.append(f"init:{ex}")

            # Build cookie header — inject sessionid if provided
            cookie_parts = []
            if sessionid:
                cookie_parts.append(f"sessionid={sessionid}")
            if csrf:
                cookie_parts.append(f"csrftoken={csrf}")
            cookie_hdr = "; ".join(cookie_parts)

            base_headers = {
                "User-Agent":      _BROWSER_UA,
                "Accept-Language": "fr-FR,fr;q=0.9",
                "Accept-Encoding": "gzip, deflate",
                "Origin":          "https://www.instagram.com",
                "Referer":         f"https://www.instagram.com/{username}/",
            }
            if cookie_hdr:
                base_headers["Cookie"] = cookie_hdr
            if csrf:
                base_headers["X-CSRFToken"] = csrf

            # ── Strategy A: official API endpoints (retry once on 429) ───────
            api_headers = {**base_headers,
                "Accept":         "application/json",
                "X-IG-App-ID":    "936619743392459",
                "X-ASBD-ID":      "198387",
                "X-IG-WWW-Claim": "0",
            }
            got_429 = False
            for api_base in (
                "https://www.instagram.com/api/v1/users/web_profile_info/?username=",
                "https://i.instagram.com/api/v1/users/web_profile_info/?username=",
            ):
                try:
                    for attempt in range(2):
                        r = client.get(api_base + username, headers=api_headers)
                        if r.status_code == 429 and attempt == 0:
                            got_429 = True
                            time.sleep(3)
                            continue
                        break
                    if r.status_code == 200:
                        user = r.json().get("data", {}).get("user")
                        if user:
                            return _parse_ig_graphql(user, username)
                        errors.append(f"A:{api_base[:28]}→200 user=null")
                    elif r.status_code == 404:
                        return {"ig_status": "banned", "ig_error": "Compte introuvable"}
                    elif r.status_code == 401:
                        return {"ig_status": "private", "ig_error": "Compte privé"}
                    else:
                        errors.append(f"A:{api_base[:28]}→HTTP{r.status_code}")
                except Exception as ex:
                    errors.append(f"A:{api_base[:28]}→{ex}")

            # ── Strategy A2: GraphQL — deux query_hash connus ────────────────
            time.sleep(1)
            import urllib.parse as _up
            for qh, qvars in [
                ("d4d88dc1500312af6f937f7b804c68c3",
                 json.dumps({"username": username, "include_reel": True})),
                ("69cba40317214236af40e7eda986947c",
                 json.dumps({"username": username})),
            ]:
                try:
                    gql_url = (f"https://www.instagram.com/graphql/query/"
                               f"?query_hash={qh}&variables={_up.quote(qvars)}")
                    rg = client.get(gql_url, headers={**api_headers,
                        "X-Requested-With": "XMLHttpRequest"})
                    if rg.status_code in (200, 201):
                        try:
                            user = rg.json().get("data", {}).get("user")
                            if user:
                                return _parse_ig_graphql(user, username)
                            errors.append(f"A2:{qh[:8]}→user=null")
                        except Exception:
                            errors.append(f"A2:{qh[:8]}→JSON err")
                    else:
                        errors.append(f"A2:{qh[:8]}→HTTP{rg.status_code}")
                except Exception as ex:
                    errors.append(f"A2:{qh[:8]}→{ex}")

            # ── Strategy A3: search via www (pas i.instagram.com) ────────────
            try:
                rs = client.get(
                    f"https://www.instagram.com/web/search/topsearch/"
                    f"?context=blended&query={username}&count=5",
                    headers={**api_headers, "X-Requested-With": "XMLHttpRequest"}
                )
                if rs.status_code in (200, 201):
                    try:
                        data = rs.json()
                        users_list = data.get("users", [])
                        for item in users_list:
                            u = item.get("user", {})
                            if u.get("username", "").lower() == username.lower():
                                return {
                                    "ig_status":   "active",
                                    "ig_username": u.get("username", username),
                                    "full_name":   u.get("full_name", ""),
                                    "followers":   u.get("follower_count", 0),
                                    "following":   u.get("following_count", 0),
                                    "posts_count": u.get("media_count", 0),
                                    "bio":         u.get("biography", ""),
                                    "videos":      [],
                                    "last_checked": datetime.now().isoformat(),
                                }
                        errors.append(f"A3:topsearch→200 '{username}' absent")
                    except Exception:
                        errors.append("A3:topsearch→JSON error")
                else:
                    errors.append(f"A3:topsearch→HTTP{rs.status_code}")
            except Exception as ex:
                errors.append(f"A3:topsearch→{ex}")

            # ── Strategy B: ?__a=1 (deux variantes) ──────────────────────────
            time.sleep(1)
            for b_url in [
                f"https://www.instagram.com/{username}/?__a=1&__d=dis",
                f"https://www.instagram.com/{username}/?__a=1",
            ]:
                try:
                    r2 = client.get(b_url, headers={**base_headers,
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest"})
                    tag = "B" if "&__d=dis" in b_url else "B2"
                    if r2.status_code in (200, 201):
                        try:
                            data = r2.json()
                            user = (data.get("graphql", {}).get("user")
                                    or data.get("data", {}).get("user")
                                    or data.get("user"))
                            if user:
                                return _parse_ig_graphql(user, username)
                            snippet = r2.text[:120].replace("\n", " ")
                            errors.append(f"{tag}:2xx no-user body={snippet!r}")
                        except Exception:
                            snippet = r2.text[:80].replace("\n", " ")
                            errors.append(f"{tag}:2xx non-JSON body={snippet!r}")
                    else:
                        errors.append(f"{tag}:HTTP{r2.status_code}")
                except Exception as ex:
                    errors.append(f"B:{ex}")

            # ── Strategy C: scrape HTML page ──────────────────────────────────
            time.sleep(1)
            try:
                r3 = client.get(
                    f"https://www.instagram.com/{username}/",
                    headers={**base_headers,
                             "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
                )
                if r3.status_code == 200:
                    html = r3.text

                    if r3.status_code in (404, 410) or "Page Not Found" in html:
                        return {"ig_status": "banned", "ig_error": "Compte introuvable"}
                    if "Log in" in html or "login" in str(r3.url):
                        return {"ig_status": "private",
                                "ig_error": "Connexion requise — sessionid invalide ?"}

                    # C1: window.__additionalDataLoaded
                    for chunk in re.findall(
                        r'window\.__additionalDataLoaded\s*\([^,]+,\s*(\{.+?\})\s*\)',
                        html, re.DOTALL
                    ):
                        try:
                            d = json.loads(chunk)
                            user = (d.get("graphql", {}).get("user")
                                    or d.get("data", {}).get("user"))
                            if user and user.get("edge_followed_by"):
                                return _parse_ig_graphql(user, username)
                        except Exception:
                            pass

                    # C2: LD+JSON schema block
                    for ld in re.findall(
                        r'<script type="application/ld\+json">(.*?)</script>',
                        html, re.DOTALL
                    ):
                        try:
                            d = json.loads(ld)
                            for item in (d if isinstance(d, list) else [d]):
                                for s in item.get("mainEntity", item).get(
                                        "interactionStatistic", []):
                                    if "Follow" in s.get("interactionType", ""):
                                        followers = int(s.get("userInteractionCount", 0))
                                        if followers:
                                            return {
                                                "ig_status":   "active",
                                                "ig_username": username,
                                                "full_name":   item.get("name", ""),
                                                "followers":   followers,
                                                "following":   0,
                                                "posts_count": 0,
                                                "bio":         item.get("description", ""),
                                                "videos":      [],
                                                "last_checked": datetime.now().isoformat(),
                                            }
                        except Exception:
                            pass

                    # C3: scan ALL <script> blocks for any follower data (2024+)
                    # Instagram embeds data in various script types; search them all
                    all_scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
                    for script_content in all_scripts:
                        if "follower_count" not in script_content and \
                                "edge_followed_by" not in script_content:
                            continue
                        # try as JSON first
                        for json_blob in re.findall(r'\{[^{}]{20,}\}', script_content):
                            try:
                                d = json.loads(json_blob)
                                fc = (d.get("follower_count")
                                      or d.get("edge_followed_by", {}).get("count"))
                                if fc:
                                    return {
                                        "ig_status":   "active",
                                        "ig_username": username,
                                        "full_name":   d.get("full_name", ""),
                                        "followers":   int(fc),
                                        "following":   int(d.get("following_count")
                                                          or d.get("edge_follow", {})
                                                              .get("count", 0)),
                                        "posts_count": int(d.get("media_count")
                                                          or d.get("edge_owner_to_timeline_media",
                                                                   {}).get("count", 0)),
                                        "bio":         d.get("biography", ""),
                                        "videos":      [],
                                        "last_checked": datetime.now().isoformat(),
                                    }
                            except Exception:
                                pass
                        # fallback: regex directly on the script text
                        fc_m = (re.search(r'"follower_count"\s*:\s*(\d+)', script_content)
                                or re.search(r'"edge_followed_by":\{"count":(\d+)\}',
                                             script_content))
                        if fc_m:
                            fwg_m  = (re.search(r'"following_count"\s*:\s*(\d+)', script_content)
                                      or re.search(r'"edge_follow":\{"count":(\d+)\}',
                                                   script_content))
                            name_m = re.search(r'"full_name"\s*:\s*"((?:[^"\\]|\\.)*)"',
                                               script_content)
                            post_m = (re.search(r'"media_count"\s*:\s*(\d+)', script_content)
                                      or re.search(
                                          r'"edge_owner_to_timeline_media":\{"count":(\d+)',
                                          script_content))
                            bio_m  = re.search(r'"biography"\s*:\s*"((?:[^"\\]|\\.)*)"',
                                               script_content)
                            return {
                                "ig_status":   "active",
                                "ig_username": username,
                                "full_name":   name_m.group(1) if name_m else "",
                                "followers":   int(fc_m.group(1)),
                                "following":   int(fwg_m.group(1)) if fwg_m else 0,
                                "posts_count": int(post_m.group(1)) if post_m else 0,
                                "bio":         bio_m.group(1) if bio_m else "",
                                "videos":      [],
                                "last_checked": datetime.now().isoformat(),
                            }

                    # C4: last-resort regex on entire raw HTML
                    fol_m = (re.search(r'"edge_followed_by":\{"count":(\d+)\}', html)
                             or re.search(r'"follower_count"\s*:\s*(\d+)', html))
                    if fol_m:
                        fwg_m  = (re.search(r'"edge_follow":\{"count":(\d+)\}', html)
                                  or re.search(r'"following_count"\s*:\s*(\d+)', html))
                        name_m = re.search(r'"full_name"\s*:\s*"((?:[^"\\]|\\.)*)"', html)
                        post_m = (re.search(r'"edge_owner_to_timeline_media":\{"count":(\d+)', html)
                                  or re.search(r'"media_count"\s*:\s*(\d+)', html))
                        bio_m  = re.search(r'"biography"\s*:\s*"((?:[^"\\]|\\.)*)"', html)
                        return {
                            "ig_status":   "active",
                            "ig_username": username,
                            "full_name":   name_m.group(1) if name_m else "",
                            "followers":   int(fol_m.group(1)),
                            "following":   int(fwg_m.group(1)) if fwg_m else 0,
                            "posts_count": int(post_m.group(1)) if post_m else 0,
                            "bio":         bio_m.group(1) if bio_m else "",
                            "videos":      [],
                            "last_checked": datetime.now().isoformat(),
                        }

                    # Log a snippet of the HTML to help debug future misses
                    snippet = html[1000:1200].replace("\n", " ") if len(html) > 1000 else html[:200]
                    errors.append(f"C:200 no-data html_snippet={snippet!r:.120}")
                elif r3.status_code in (404, 410):
                    return {"ig_status": "banned", "ig_error": "Compte introuvable"}
                else:
                    errors.append(f"C:HTTP{r3.status_code}")
            except Exception as ex:
                errors.append(f"C:{ex}")

            n429 = sum(1 for e in errors if "429" in e)
            if n429 >= 3:
                tip = " — IP bloquée, attendez 30min ou changez de proxy"
            else:
                tip = ""
            err_detail = " | ".join(errors) if errors else "toutes stratégies échouées"
            return {"ig_status": "error", "ig_error": f"Échec{tip} ({err_detail})"}

    except httpx.TimeoutException:
        return {"ig_status": "error", "ig_error": "Timeout (>25s)"}
    except Exception as ex:
        return {"ig_status": "error", "ig_error": str(ex)}

# ══════════════════════════════════════════════════════════════════════════════
# DIRECT LOGIN  — instagrapi (private mobile API, 100 % fiable pour comptes
#                 qu'on possède, même IP bloquée sur le scraping public)
# ══════════════════════════════════════════════════════════════════════════════
def _ensure_instagrapi():
    """Import instagrapi, auto-install if missing. Returns the module."""
    try:
        import instagrapi
        return instagrapi
    except ImportError:
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "instagrapi", "--quiet"],
            capture_output=True
        )
        import instagrapi
        return instagrapi


def ig_client_get(username: str, password: str, proxy: str | None = None):
    """
    Return an authenticated instagrapi Client.
    Reuses a cached session (ig_sessions/{username}.json) when possible.
    Raises exceptions from instagrapi on auth errors.
    """
    ig = _ensure_instagrapi()
    from instagrapi import Client
    from instagrapi.exceptions import LoginRequired

    IG_SESS_DIR.mkdir(exist_ok=True)
    session_file = IG_SESS_DIR / f"{username}.json"

    cl = Client()
    cl.delay_range = [1, 3]
    if proxy:
        purl = _proxy_url(proxy)
        if purl:
            cl.set_proxy(purl)

    # Try restoring cached session
    if session_file.exists():
        try:
            cl.load_settings(session_file)
            cl.login(username, password)          # refreshes token if needed
            cl.get_timeline_feed()                # smoke-test
            return cl
        except Exception:
            session_file.unlink(missing_ok=True)
            cl = Client()
            cl.delay_range = [1, 3]
            if proxy:
                purl = _proxy_url(proxy)
                if purl:
                    cl.set_proxy(purl)

    # Fresh login
    cl.login(username, password)
    cl.dump_settings(session_file)
    return cl


def scrape_ig_direct(username: str, password: str, proxy: str | None = None,
                     challenge_callback=None) -> dict:
    """
    Get Instagram account stats using direct login (instagrapi).
    challenge_callback(cl, username) → code_str | None  — called when Instagram
    issues a security challenge; should block until the user enters the code.
    Returns the same dict format as scrape_ig().
    """
    try:
        from instagrapi.exceptions import (
            BadPassword, ChallengeRequired, TwoFactorRequired,
            LoginRequired, UserNotFound,
        )
    except ImportError:
        _ensure_instagrapi()
        from instagrapi.exceptions import (
            BadPassword, ChallengeRequired, TwoFactorRequired,
            LoginRequired, UserNotFound,
        )

    session_file = IG_SESS_DIR / f"{username}.json"
    # Purge sessions created with a proxy — we now connect without proxy
    if proxy is None and session_file.exists():
        try:
            import json as _j
            if _j.loads(session_file.read_text()).get("proxy"):
                session_file.unlink(missing_ok=True)
        except Exception:
            pass

    def _build_result(cl, username):
        uid = cl.user_id_from_username(username)
        u = cl.user_info(uid)
        videos = []
        try:
            for m in cl.user_medias(u.pk, amount=20):
                views = getattr(m, "view_count", 0) or getattr(m, "play_count", 0) or 0
                tu = getattr(m, "thumbnail_url", "") or ""
                if not tu:
                    pic = getattr(m, "video_url", "") or getattr(m, "display_uri", "") or ""
                    tu = str(pic) if pic else ""
                videos.append({
                    "id":            m.code,
                    "views":         views,
                    "likes":         m.like_count or 0,
                    "comments":      m.comment_count or 0,
                    "shares":        getattr(m, "reshare_count", 0) or 0,
                    "caption":       (m.caption_text or "")[:80],
                    "thumbnail_url": str(tu),
                    "taken_at":      int(getattr(m, "taken_at", 0).timestamp()) if getattr(m, "taken_at", None) else 0,
                })
        except Exception:
            pass
        return {
            "ig_status":    "active",
            "ig_username":  u.username,
            "full_name":    u.full_name or "",
            "followers":    u.follower_count,
            "following":    u.following_count,
            "posts_count":  u.media_count,
            "bio":          u.biography or "",
            "is_private":   u.is_private,
            "is_verified":  u.is_verified,
            "profile_pic":  str(u.profile_pic_url or ""),
            "videos":       videos,
            "last_checked": datetime.now().isoformat(),
        }

    try:
        cl = ig_client_get(username, password, proxy)
        return _build_result(cl, username)

    except ChallengeRequired:
        session_file.unlink(missing_ok=True)
        if challenge_callback is None:
            return {"ig_status": "error",
                    "ig_error": "⚠ Challenge Instagram — vérifie l'email/SMS du compte puis réessaie"}
        # Ask UI for the code, then resolve
        try:
            code = challenge_callback(cl, username)
            if not code:
                return {"ig_status": "error", "ig_error": "Challenge annulé"}
            cl.challenge_resolve(cl.last_challenge, code)
            cl.dump_settings(session_file)
            return _build_result(cl, username)
        except Exception as ex:
            return {"ig_status": "error", "ig_error": f"Challenge échoué: {ex}"}

    except BadPassword:
        return {"ig_status": "error", "ig_error": "❌ Mot de passe incorrect"}
    except TwoFactorRequired:
        return {"ig_status": "error",
                "ig_error": "🔐 2FA requis — entre le code dans l'app ou désactive le 2FA"}
    except UserNotFound:
        return {"ig_status": "banned", "ig_error": "Compte introuvable"}
    except LoginRequired:
        session_file.unlink(missing_ok=True)
        return {"ig_status": "error",
                "ig_error": "Session expirée — relance le scrape"}
    except Exception as ex:
        return {"ig_status": "error", "ig_error": str(ex)}


_IG_PRIVATE_HEADERS = {
    "User-Agent":      "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100)",
    "X-IG-App-ID":     "936619743392459",
    "Accept-Language": "en-US",
    "Accept-Encoding": "gzip, deflate",
    "Connection":      "keep-alive",
}

def _ig_session_client(sessionid: str) -> httpx.Client:
    """Return an httpx client pre-configured with the Instagram session cookie."""
    return httpx.Client(
        headers=_IG_PRIVATE_HEADERS,
        cookies={"sessionid": sessionid},
        base_url="https://i.instagram.com",
        follow_redirects=True,
        timeout=15,
    )

def scrape_ig_by_session(username: str, sessionid: str) -> dict:
    """Direct private API call — no instagrapi, no web GraphQL, no challenges."""
    try:
        with _ig_session_client(sessionid) as cl:
            # Own account info — edit=false returns full stats (follower/following counts)
            r = cl.get("/api/v1/accounts/current_user/", params={"edit": "false"})
            if r.status_code == 401:
                return {"ig_status": "error",
                        "ig_error": "Session expirée — récupère un nouveau sessionid depuis GéeLark"}
            r.raise_for_status()
            u = r.json()["user"]
            user_id = u.get("pk") or u.get("id", "")

            # If follower_count still 0, fetch from user info endpoint
            if not u.get("follower_count"):
                try:
                    ui = cl.get(f"/api/v1/users/{user_id}/info/")
                    if ui.status_code == 200:
                        u2 = ui.json().get("user", {})
                        u["follower_count"] = u2.get("follower_count", 0)
                        u["following_count"] = u2.get("following_count", 0)
                        u["media_count"]     = u2.get("media_count", 0)
                except Exception:
                    pass

            # Fetch all media: regular feed + reels (clips have play_count)
            media_map = {}  # code -> item dict

            # 1) Regular feed (photos + videos)
            try:
                mr = cl.get(f"/api/v1/feed/user/{user_id}/", params={"count": "20"})
                if mr.status_code == 200:
                    for item in mr.json().get("items", []):
                        code = item.get("code", "")
                        if code:
                            media_map[code] = item
            except Exception:
                pass

            # 2) Reels/Clips — this endpoint returns play_count reliably
            try:
                cr = cl.post("/api/v1/clips/user/",
                             json={"target_user_id": str(user_id), "page_size": 20})
                if cr.status_code == 200:
                    for item in cr.json().get("items", []):
                        media = item.get("media", item)
                        code  = media.get("code", "")
                        if code:
                            # Merge: keep feed entry but override with reel play_count
                            existing = media_map.get(code, {})
                            existing.update({
                                "code":       code,
                                "play_count": media.get("play_count") or media.get("view_count") or 0,
                                "like_count": media.get("like_count", existing.get("like_count", 0)),
                                "comment_count": media.get("comment_count", existing.get("comment_count", 0)),
                                "caption":    media.get("caption"),
                            })
                            media_map[code] = existing
            except Exception:
                pass

            videos = []
            for code, item in list(media_map.items())[:20]:
                views = (item.get("play_count") or
                         item.get("video_view_count") or
                         item.get("view_count") or 0)
                caps  = item.get("caption") or {}
                # Best thumbnail: image_versions2.candidates[0].url
                thumb_url = ""
                try:
                    iv2 = item.get("image_versions2", {}) or {}
                    cands = iv2.get("candidates") or []
                    if cands:
                        thumb_url = cands[0].get("url", "")
                except Exception:
                    pass
                videos.append({
                    "id":            code,
                    "views":         views,
                    "likes":         item.get("like_count", 0),
                    "comments":      item.get("comment_count", 0),
                    "shares":        item.get("reshare_count", 0),
                    "caption":       (caps.get("text", "") if isinstance(caps, dict) else "")[:80],
                    "thumbnail_url": thumb_url,
                    "taken_at":      int(item.get("taken_at") or 0),
                })

            return {
                "ig_status":    "active",
                "ig_username":  u.get("username", username),
                "full_name":    u.get("full_name", ""),
                "followers":    u.get("follower_count", 0),
                "following":    u.get("following_count", 0),
                "posts_count":  u.get("media_count", 0),
                "bio":          u.get("biography", ""),
                "is_private":   u.get("is_private", False),
                "is_verified":  u.get("is_verified", False),
                "profile_pic":  u.get("profile_pic_url", ""),
                "videos":       videos,
                "last_checked": datetime.now().isoformat(),
            }
    except Exception as ex:
        msg = str(ex)
        if "401" in msg or "login" in msg.lower():
            return {"ig_status": "error",
                    "ig_error": "Session expirée — récupère un nouveau sessionid depuis GéeLark"}
        return {"ig_status": "error", "ig_error": msg}


def get_username_from_session(sessionid: str) -> str | None:
    """Fetch the Instagram username for a session ID — no instagrapi."""
    try:
        with _ig_session_client(sessionid) as cl:
            r = cl.get("/api/v1/accounts/current_user/", params={"edit": "true"})
            if r.status_code == 200:
                return r.json()["user"]["username"]
    except Exception:
        pass
    return None


# ══════════════════════════════════════════════════════════════════════════════
# PUSH SERVER  — GéeLark phones POST stats to this local HTTP server
# ══════════════════════════════════════════════════════════════════════════════
def _safe_int(v):
    try:
        return int(str(v).replace(",", "").replace(" ", "").replace(".", ""))
    except Exception:
        return None

class _PushHandler(http.server.BaseHTTPRequestHandler):
    """Minimal HTTP handler for the push endpoint."""
    app_ref = None  # set to App instance before server starts

    def _respond(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _handle(self, params):
        def first(*keys):
            for k in keys:
                v = params.get(k)
                if v:
                    return v[0] if isinstance(v, list) else v
            return None

        username = (first("u", "username") or "").lstrip("@").strip()
        if not username:
            self._respond(400, {"ok": False, "error": "Param manquant: u=username"})
            return
        stats = {
            "followers":   _safe_int(first("f", "followers")),
            "following":   _safe_int(first("fw", "following")),
            "posts_count": _safe_int(first("p", "posts")),
            "full_name":   first("n", "name") or "",
            "bio":         first("b", "bio") or "",
        }
        if self.app_ref:
            self.app_ref.root.after(
                0, lambda u=username, s=stats: self.app_ref._on_push_update(u, s)
            )
            self._respond(200, {"ok": True, "username": username,
                                "followers": stats["followers"]})
        else:
            self._respond(500, {"ok": False, "error": "App non connectée"})

    def do_GET(self):
        parsed = _urlparse.urlparse(self.path)
        if parsed.path not in ("/push", "/push/"):
            self._respond(404, {"ok": False, "error": "Utilise /push?u=USERNAME&f=FOLLOWERS..."})
            return
        self._handle(_urlparse.parse_qs(parsed.query))

    def do_POST(self):
        parsed = _urlparse.urlparse(self.path)
        if parsed.path not in ("/push", "/push/"):
            self._respond(404, {"ok": False, "error": "Utilise POST /push avec JSON body"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            data = json.loads(body)
        except Exception:
            data = {}
        # merge query params + body
        qs = _urlparse.parse_qs(parsed.query)
        merged = {k: v[0] if isinstance(v, list) else v for k, v in qs.items()}
        merged.update({k: v for k, v in data.items()})
        self._handle(merged)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *_):
        pass  # suppress console noise


# ══════════════════════════════════════════════════════════════════════════════
# LOGIN
# ══════════════════════════════════════════════════════════════════════════════
def _set_window_icon(root):
    """Set taskbar + title-bar icon from logo.png (Windows + Linux)."""
    png = BASE_DIR / "logo.png"
    ico = BASE_DIR / "icon.ico"
    try:
        if PIL_OK and png.exists():
            img = Image.open(str(png)).convert("RGBA")
            # iconphoto works on both Windows and Linux (always applied)
            sizes = [256, 128, 64, 48, 32, 16]
            tk_imgs = [ImageTk.PhotoImage(img.resize((s, s), Image.LANCZOS))
                       for s in sizes]
            root.wm_iconphoto(True, *tk_imgs)
            # Store refs so GC doesn't collect them
            root._icon_refs = tk_imgs
            # Also try iconbitmap on Windows for taskbar
            if not ico.exists():
                frames = [img.resize((s, s), Image.LANCZOS) for s in sizes]
                frames[0].save(str(ico), format="ICO",
                               sizes=[(s, s) for s in sizes],
                               append_images=frames[1:])
            try:
                root.iconbitmap(default=str(ico))
            except Exception:
                pass
    except Exception:
        pass


class LoginWindow:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("IG Tracker")
        self.root.geometry("400x440")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
        _set_window_icon(self.root)
        self._build()
        self.root.mainloop()

    def _build(self):
        tk.Label(self.root, text="IG Tracker", font=("Segoe UI", 26, "bold"),
                 bg=BG, fg=ACCENT).pack(pady=(40, 4))
        tk.Label(self.root, text="OFM Dashboard", font=("Segoe UI", 11),
                 bg=BG, fg=TEXT2).pack()
        f = tk.Frame(self.root, bg=SURFACE, padx=24, pady=20)
        f.pack(padx=32, fill="x", pady=20)
        self.ev = tk.StringVar(value=load_config().get("email", ""))
        self.pv = tk.StringVar()
        for lbl, var, show in [("Email", self.ev, None), ("Mot de passe", self.pv, "●")]:
            tk.Label(f, text=lbl, font=("Segoe UI", 10), bg=SURFACE,
                     fg=TEXT2, anchor="w").pack(fill="x", pady=(8, 2))
            tk.Entry(f, textvariable=var, font=("Consolas", 12), bg=SURFACE2, fg=TEXT,
                     insertbackground=TEXT, relief="flat", bd=0, highlightthickness=1,
                     highlightcolor=ACCENT, highlightbackground=BORDER,
                     show=show).pack(fill="x", ipady=7)
        self.err = tk.Label(self.root, text="", font=("Segoe UI", 10), bg=BG, fg=DANGER)
        self.err.pack()
        tk.Button(self.root, text="Connexion", font=("Segoe UI", 12, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  activebackground=ACCENT2,
                  command=self._login).pack(padx=32, pady=10, fill="x")
        self.root.bind("<Return>", lambda e: self._login())

    def _login(self):
        email, pw = self.ev.get().strip(), self.pv.get().strip()
        if not email or not pw:
            self.err.config(text="Champs requis")
            return
        cfg = load_config()
        h = hashlib.sha256(pw.encode()).hexdigest()
        if not cfg.get("password_hash"):
            cfg.update({"email": email, "password_hash": h,
                        "bearer_token": "", "proxy": ""})
            save_config(cfg)
            self.root.destroy()
            App(email, cfg)
        elif cfg.get("password_hash") == h and cfg.get("email") == email:
            self.root.destroy()
            App(email, cfg)
        else:
            self.err.config(text="Identifiants incorrects")

# ══════════════════════════════════════════════════════════════════════════════
# APP
# ══════════════════════════════════════════════════════════════════════════════
class App:
    def __init__(self, email, cfg):
        self.email   = email
        self.cfg     = cfg
        self.data    = load_data()
        self.running = True
        self.sel_ids = []
        self._bank_selected = None
        self._preview_after = None
        self.output_video_path = None
        # Drag preview state
        self._is_dragging = False
        self._cached_pil_frame = None
        self._preview_img_offset = (0, 0)
        self._preview_img_size = (400, 500)

        self._video_paths = []
        self._active_video_idx = 0
        self._thumb_jobs = {}

        # Appliquer le thème avant de construire l'UI
        apply_theme_globals(self.cfg.get("theme", "Bleu"))

        if DND_OK:
            self.root = TkinterDnD.Tk()
        else:
            self.root = tk.Tk()
        self.root.title("IG Tracker")
        self.root.geometry("1400x900")
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        _set_window_icon(self.root)

        self._setup_styles()
        self._build_layout()
        self._show_tab("phones")
        # First launch wizard (chained: beta → wizard if first run)
        if not self.cfg.get("first_run_done"):
            self.root.after(600, self._show_first_launch_wizard)
        else:
            self.root.after(600, self._show_beta_popup)

        self._auto_interval = int(self.cfg.get("auto_refresh_min", 5)) * 60
        self._next_refresh   = 0   # epoch — 0 = pas encore planifié

        # Afficher les téléphones en cache immédiatement (avant le retour API)
        self.root.after(200, self._refresh_table)

        threading.Thread(target=self._load_phones, daemon=True).start()
        threading.Thread(target=self._scheduler, daemon=True).start()

        # Auto-scrape au démarrage si au moins un compte a des credentials
        def _startup_scrape():
            time.sleep(2)   # laisse le temps à l'UI de s'initialiser
            has_creds = any(
                d.get("ig_sessionid") or d.get("ig_password")
                for d in self.data.values()
            )
            if has_creds and self.running:
                self._scrape_sel()

        threading.Thread(target=_startup_scrape, daemon=True).start()
        self._tick_countdown()
        self.root.mainloop()

    def _on_close(self):
        self.running = False
        self.root.destroy()

    def _show_beta_popup(self):
        pop = tk.Toplevel(self.root)
        pop.overrideredirect(True)          # sans barre de titre
        pop.configure(bg=BG)
        pop.attributes("-topmost", True)

        W, H = 460, 340
        rx = self.root.winfo_x() + (self.root.winfo_width()  - W) // 2
        ry = self.root.winfo_y() + (self.root.winfo_height() - H) // 2
        pop.geometry(f"{W}x{H}+{rx}+{ry}")

        # Outer border frame
        border = tk.Frame(pop, bg=ACCENT, padx=2, pady=2)
        border.pack(fill="both", expand=True)
        inner = tk.Frame(border, bg=BG)
        inner.pack(fill="both", expand=True)

        # Top accent bar
        tk.Frame(inner, height=3, bg=ACCENT).pack(fill="x")

        body = tk.Frame(inner, bg=BG, padx=32, pady=24)
        body.pack(fill="both", expand=True)

        # Badge
        badge_row = tk.Frame(body, bg=BG)
        badge_row.pack(anchor="w", pady=(0, 14))
        tk.Label(badge_row, text="BETA", font=("Segoe UI", 9, "bold"),
                 bg=ACCENT, fg="#07080d", padx=10, pady=3).pack(side="left")
        tk.Label(badge_row, text="  v2.0", font=("Segoe UI", 9),
                 bg=BG, fg=TEXT2).pack(side="left")

        tk.Label(body, text="Bienvenue sur IG Tracker",
                 font=("Segoe UI", 18, "bold"), bg=BG, fg=TEXT,
                 anchor="w").pack(anchor="w")
        tk.Label(body, text="Version Bêta — Accès Anticipé",
                 font=("Segoe UI", 10), bg=BG, fg=ACCENT,
                 anchor="w").pack(anchor="w", pady=(2, 16))

        notes = [
            ("⚡", "Fonctionnalités en cours de développement actif"),
            ("🐛", "Des bugs peuvent survenir — merci de les signaler"),
            ("🔒", "Tes données restent locales, rien n'est envoyé"),
            ("🚀", "Twitter & Threads arrivent très bientôt"),
        ]
        for ico, txt in notes:
            row = tk.Frame(body, bg=BG)
            row.pack(anchor="w", pady=2)
            tk.Label(row, text=ico, font=("Segoe UI", 11), bg=BG).pack(side="left")
            tk.Label(row, text=f"  {txt}", font=("Segoe UI", 9),
                     bg=BG, fg=TEXT2).pack(side="left")

        # Close button
        def _close():
            pop.destroy()

        btn_frame = tk.Frame(body, bg=BG)
        btn_frame.pack(fill="x", pady=(20, 0))
        close_btn = tk.Button(btn_frame, text="C'est parti  🚀",
                              font=("Segoe UI", 11, "bold"),
                              bg=ACCENT, fg="#07080d", relief="flat",
                              cursor="hand2", pady=10, bd=0,
                              command=_close)
        close_btn.pack(fill="x")
        self._bind_hover(close_btn, ACCENT, ACCENT2, "#07080d", "#07080d")

        # Close on Escape
        pop.bind("<Escape>", lambda e: _close())
        pop.focus_force()

        # Fade-in animation
        pop.attributes("-alpha", 0.0)
        def _fade(a=0.0):
            a = min(a + 0.08, 1.0)
            if pop.winfo_exists():
                pop.attributes("-alpha", a)
                if a < 1.0:
                    pop.after(16, lambda: _fade(a))
        _fade()

    def _show_first_launch_wizard(self):
        """Multi-step setup wizard shown on first launch."""
        wiz = tk.Toplevel(self.root)
        wiz.overrideredirect(True)
        wiz.configure(bg=BG)
        wiz.attributes("-topmost", True)
        W, H = 540, 540
        rx = self.root.winfo_x() + (self.root.winfo_width()  - W) // 2
        ry = self.root.winfo_y() + (self.root.winfo_height() - H) // 2
        wiz.geometry(f"{W}x{H}+{rx}+{ry}")

        border = tk.Frame(wiz, bg=ACCENT, padx=2, pady=2)
        border.pack(fill="both", expand=True)
        inner = tk.Frame(border, bg=BG)
        inner.pack(fill="both", expand=True)
        tk.Frame(inner, height=3, bg=ACCENT).pack(fill="x")

        # Step indicator
        steps = ["Bienvenue", "GéeLark", "Groq IA", "Terminé"]
        step_idx = [0]

        step_bar = tk.Frame(inner, bg=BG, padx=24, pady=14)
        step_bar.pack(fill="x")
        step_dots = []
        for i, s in enumerate(steps):
            chunk = tk.Frame(step_bar, bg=BG)
            chunk.pack(side="left", expand=True, fill="x")
            dot = tk.Canvas(chunk, width=20, height=20, bg=BG, highlightthickness=0)
            dot.pack()
            dot.create_oval(2, 2, 18, 18, fill=MUTED, outline="", tags="circle")
            dot.create_text(10, 10, text=str(i + 1), font=("Segoe UI", 8, "bold"),
                             fill=TEXT, tags="num")
            tk.Label(chunk, text=s, font=("Segoe UI", 8),
                     bg=BG, fg=TEXT2).pack()
            step_dots.append(dot)

        body = tk.Frame(inner, bg=BG, padx=32, pady=8)
        body.pack(fill="both", expand=True)

        # Variables to collect
        bearer_var = tk.StringVar(value=self.cfg.get("bearer_token", ""))
        groq_var   = tk.StringVar(value=self.cfg.get("groq_api_key", ""))

        # Step containers
        s1 = tk.Frame(body, bg=BG)
        s2 = tk.Frame(body, bg=BG)
        s3 = tk.Frame(body, bg=BG)
        s4 = tk.Frame(body, bg=BG)

        # ─── STEP 1: Welcome ───────────────────────────────────────────────────
        tk.Label(s1, text="🚀  Bienvenue !", font=("Segoe UI", 22, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w", pady=(20, 6))
        tk.Label(s1, text="On va te configurer en 30 secondes.",
                 font=("Segoe UI", 11), bg=BG, fg=ACCENT).pack(anchor="w")
        tk.Label(s1,
                 text=("\nIG Tracker te permet de :\n\n"
                       "• Suivre tes comptes Instagram (followers, vues, likes…)\n"
                       "• Poster sur tes téléphones GéeLark depuis ton PC\n"
                       "• Faire du Mass Posting jusqu'à 20 phones simultanés\n"
                       "• Monter tes vidéos (texte overlay, cuts, effets)\n"
                       "• Et plein d'autres trucs cool 😎"),
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2,
                 justify="left").pack(anchor="w")

        tk.Label(s1,
                 text="Tu peux cliquer sur « Plus tard » pour configurer après.",
                 font=("Segoe UI", 9), bg=BG, fg=MUTED).pack(anchor="w", pady=(20, 0))

        # ─── STEP 2: GéeLark Token ─────────────────────────────────────────────
        tk.Label(s2, text="🔑  Bearer Token GéeLark",
                 font=("Segoe UI", 18, "bold"), bg=BG, fg=TEXT).pack(anchor="w", pady=(10, 6))
        tk.Label(s2, text="Indispensable pour piloter tes téléphones cloud",
                 font=("Segoe UI", 10), bg=BG, fg=ACCENT).pack(anchor="w")

        tk.Label(s2,
                 text="\nComment l'obtenir :\n\n"
                      "1. Va sur app.geelark.com → Profile → API\n"
                      "2. Clique sur « Create Token » et copie la clé\n"
                      "3. Colle-la ci-dessous",
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2,
                 justify="left").pack(anchor="w", pady=(0, 14))

        tk.Label(s2, text="Bearer Token :", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w")
        be = tk.Entry(s2, textvariable=bearer_var, show="•", font=("Segoe UI", 11),
                      bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                      relief="flat", bd=0, highlightthickness=1,
                      highlightcolor=ACCENT, highlightbackground=BORDER)
        be.pack(fill="x", ipady=8, pady=(4, 6))

        show_b = tk.IntVar(value=0)
        def _toggle_show():
            be.config(show="" if show_b.get() else "•")
        tk.Checkbutton(s2, text="Afficher le token", variable=show_b,
                       command=_toggle_show, bg=BG, fg=TEXT2,
                       activebackground=BG, selectcolor=SURFACE2,
                       font=("Segoe UI", 9), cursor="hand2").pack(anchor="w")

        tk.Label(s2,
                 text="Tu peux aussi cliquer sur « Plus tard » et le mettre dans Paramètres.",
                 font=("Segoe UI", 9), bg=BG, fg=MUTED, wraplength=440,
                 justify="left").pack(anchor="w", pady=(14, 0))

        # ─── STEP 3: Groq (optional) ───────────────────────────────────────────
        tk.Label(s3, text="✨  Clé API Groq",
                 font=("Segoe UI", 18, "bold"), bg=BG, fg=TEXT).pack(anchor="w", pady=(10, 6))
        tk.Label(s3, text="Optionnel — pour générer des captions IG par IA",
                 font=("Segoe UI", 10), bg=BG, fg=OK).pack(anchor="w")

        tk.Label(s3,
                 text="\nGroq fournit Llama-3 GRATUITEMENT (jusqu'à 14 400 req/jour).\n\n"
                      "1. Va sur console.groq.com\n"
                      "2. Crée un compte (gratuit, sans carte bleue)\n"
                      "3. API Keys → Create Key → copie la clé",
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2, justify="left"
                 ).pack(anchor="w", pady=(0, 14))

        tk.Label(s3, text="Groq API Key :", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w")
        ge = tk.Entry(s3, textvariable=groq_var, show="•", font=("Segoe UI", 11),
                      bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                      relief="flat", bd=0, highlightthickness=1,
                      highlightcolor=ACCENT, highlightbackground=BORDER)
        ge.pack(fill="x", ipady=8, pady=(4, 6))

        show_g = tk.IntVar(value=0)
        def _toggle_show_g():
            ge.config(show="" if show_g.get() else "•")
        tk.Checkbutton(s3, text="Afficher la clé", variable=show_g,
                       command=_toggle_show_g, bg=BG, fg=TEXT2,
                       activebackground=BG, selectcolor=SURFACE2,
                       font=("Segoe UI", 9), cursor="hand2").pack(anchor="w")

        tk.Label(s3, text="Tu peux passer cette étape — ce n'est pas obligatoire.",
                 font=("Segoe UI", 9), bg=BG, fg=MUTED).pack(anchor="w", pady=(14, 0))

        # ─── STEP 4: Done ──────────────────────────────────────────────────────
        tk.Label(s4, text="🎉  Tu es prêt !",
                 font=("Segoe UI", 24, "bold"), bg=BG, fg=ACCENT).pack(pady=(40, 6))
        tk.Label(s4, text="La config a été enregistrée.",
                 font=("Segoe UI", 11), bg=BG, fg=TEXT2).pack()
        tk.Label(s4,
                 text=("\nQuelques tips pour démarrer :\n\n"
                       "📱  Onglet Téléphones → tes phones GéeLark\n"
                       "🚀  Onglet Posting → poster une vidéo\n"
                       "⚡  Onglet Mass Posting → poster sur 20 phones\n"
                       "📊  Onglet Stats → voir tes métriques IG\n"
                       "⚙   Paramètres → modifier les clés à tout moment"),
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2,
                 justify="left").pack(pady=(0, 10))

        screens = [s1, s2, s3, s4]

        # Footer with nav buttons
        footer = tk.Frame(inner, bg=BG, padx=24, pady=14)
        footer.pack(fill="x", side="bottom")
        tk.Frame(inner, height=1, bg=BORDER).pack(fill="x", side="bottom")

        prev_btn = self._mk_btn(footer, "◀  Précédent", "ghost",
                                 cmd=lambda: _go(-1),
                                 font=("Segoe UI", 10), pady=8)
        prev_btn.pack(side="left")

        skip_btn = self._mk_btn(footer, "Plus tard", "ghost",
                                 cmd=lambda: _finish(skip=True),
                                 font=("Segoe UI", 10), pady=8)
        skip_btn.pack(side="left", padx=(8, 0))

        next_btn = self._mk_btn(footer, "Suivant  ▶", "primary",
                                 cmd=lambda: _go(1),
                                 font=("Segoe UI", 10, "bold"), pady=8)
        next_btn.pack(side="right")

        def _render():
            for sc in screens:
                sc.pack_forget()
            screens[step_idx[0]].pack(fill="both", expand=True)
            # update step dots
            for i, dot in enumerate(step_dots):
                fill = ACCENT if i == step_idx[0] else (OK if i < step_idx[0] else MUTED)
                dot.itemconfig("circle", fill=fill)
                dot.itemconfig("num", fill="#07080d" if i <= step_idx[0] else TEXT)
            prev_btn.config(state="normal" if step_idx[0] > 0 else "disabled")
            if step_idx[0] == len(screens) - 1:
                next_btn.config(text="Terminer  🚀")
                skip_btn.pack_forget()
            else:
                next_btn.config(text="Suivant  ▶")
                try: skip_btn.pack(side="left", padx=(8, 0))
                except: pass

        def _go(delta):
            new = step_idx[0] + delta
            if new < 0:
                return
            if new >= len(screens):
                return _finish(skip=False)
            step_idx[0] = new
            _render()

        def _finish(skip):
            if not skip:
                self.cfg["bearer_token"] = bearer_var.get().strip()
                self.cfg["groq_api_key"] = groq_var.get().strip()
            self.cfg["first_run_done"] = True
            save_config(self.cfg)
            try: wiz.destroy()
            except: pass
            self._show_toast("✅ Configuration enregistrée",
                              "Tu peux modifier ces valeurs dans Paramètres",
                              col=OK, duration=4000)

        _render()

        wiz.bind("<Escape>", lambda e: _finish(skip=True))
        wiz.focus_force()
        wiz.attributes("-alpha", 0.0)
        def _fade(a=0.0):
            a = min(a + 0.08, 1.0)
            if wiz.winfo_exists():
                wiz.attributes("-alpha", a)
                if a < 1.0:
                    wiz.after(16, lambda: _fade(a))
        _fade()

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        for name in ["T", "Bank", "Vid"]:
            style.configure(f"{name}.Treeview",
                background=SURFACE, fieldbackground=SURFACE, foreground=TEXT,
                rowheight=36, font=("Segoe UI", 10), borderwidth=0)
            style.configure(f"{name}.Treeview.Heading",
                background=SURFACE2, foreground=TEXT2,
                font=("Segoe UI", 9, "bold"), relief="flat", padding=(8, 8))
            style.map(f"{name}.Treeview",
                background=[("selected", HL)],
                foreground=[("selected", ACCENT)])
        style.configure("TCombobox",
            fieldbackground=SURFACE2, background=SURFACE2,
            foreground=TEXT, selectbackground=HL,
            arrowcolor=TEXT2, borderwidth=0)
        style.map("TCombobox",
            fieldbackground=[("readonly", SURFACE2)],
            foreground=[("readonly", TEXT)])
        style.configure("TScrollbar",
            background=SURFACE3, troughcolor=SURFACE,
            borderwidth=0, arrowsize=0)

    # ── Animation helpers ─────────────────────────────────────────────────────
    def _pulse_widget(self, widget, color_a, color_b, interval=900, _state=None):
        """Alternate widget foreground between two colors forever."""
        if _state is None:
            _state = [True]
        if not widget.winfo_exists():
            return
        widget.config(fg=color_a if _state[0] else color_b)
        _state[0] = not _state[0]
        widget.after(interval, lambda: self._pulse_widget(
            widget, color_a, color_b, interval, _state))

    def _animate_value(self, label, target, prefix="", suffix="", steps=12):
        """Count-up animation for stat labels."""
        try:
            target = int(str(target).replace(",", "").replace(" ", ""))
        except Exception:
            label.config(text=f"{prefix}{target}{suffix}")
            return
        current = [0]
        step = max(1, target // steps)
        def _tick():
            if not label.winfo_exists():
                return
            current[0] = min(current[0] + step, target)
            label.config(text=f"{prefix}{current[0]:,}{suffix}".replace(",", " "))
            if current[0] < target:
                label.after(40, _tick)
        _tick()

    def _mk_btn(self, parent, text, kind="secondary", cmd=None, **kw):
        """Styled button with hover animation. kind: primary|secondary|danger|ok|warn|ghost"""
        palettes = {
            "primary":   (ACCENT,   ACCENT2,  "#07080d", "#07080d"),
            "secondary": (SURFACE2, SURFACE3, TEXT2,     TEXT),
            "danger":    (SURFACE2, DANGER,   DANGER,    "#07080d"),
            "ok":        (SURFACE2, OK,       OK,        "#07080d"),
            "warn":      (SURFACE2, WARN,     WARN,      "#07080d"),
            "ghost":     (BG,       SURFACE2, TEXT2,     TEXT),
        }
        bg_n, bg_h, fg_n, fg_h = palettes.get(kind, palettes["secondary"])
        defaults = dict(font=("Segoe UI", 10), relief="flat", cursor="hand2",
                        padx=12, pady=6, bd=0, activebackground=bg_h,
                        activeforeground=fg_h)
        defaults.update(kw)
        b = tk.Button(parent, text=text, bg=bg_n, fg=fg_n,
                      command=cmd, **defaults)
        self._bind_hover(b, bg_n, bg_h, fg_n, fg_h)
        return b

    def _tab_header(self, parent, icon, title, subtitle=None, accent_col=None):
        """Consistent tab header with accent bar + icon + title."""
        col = accent_col or ACCENT
        hdr = tk.Frame(parent, bg=BG)
        hdr.pack(fill="x", padx=0, pady=(0, 12))
        # Top accent line
        tk.Frame(hdr, height=2, bg=col).pack(fill="x")
        inner = tk.Frame(hdr, bg=BG)
        inner.pack(fill="x", padx=20, pady=(12, 0))
        title_row = tk.Frame(inner, bg=BG)
        title_row.pack(fill="x")
        tk.Label(title_row, text=icon, font=("Segoe UI", 13),
                 bg=BG, fg=col).pack(side="left", padx=(0, 10))
        text_col = tk.Frame(title_row, bg=BG)
        text_col.pack(side="left", fill="x", expand=True)
        tk.Label(text_col, text=title, font=("Segoe UI", 12, "bold"),
                 bg=BG, fg=TEXT, anchor="w").pack(anchor="w")
        if subtitle:
            tk.Label(text_col, text=subtitle, font=("Segoe UI", 9),
                     bg=BG, fg=TEXT2, anchor="w").pack(anchor="w", pady=(1, 0))
        return hdr

    def _section_label(self, parent, text, col=None):
        """Small section divider label."""
        row = tk.Frame(parent, bg=BG)
        row.pack(fill="x", pady=(10, 4))
        tk.Frame(row, width=3, bg=col or ACCENT).pack(side="left", fill="y", padx=(0, 8))
        tk.Label(row, text=text, font=("Segoe UI", 9, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        return row

    def log(self, msg, level="info"):
        colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_box.config(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n", level)
        self.log_box.tag_config(level, foreground=colors.get(level, TEXT2))
        self.log_box.see("end")
        self.log_box.config(state="disabled")

    def _round_card(self, parent, radius=12, bg=None, border=None, border_w=1,
                     hover_border=None, parent_bg=None):
        """
        Create a card with truly rounded corners using a Canvas backdrop.
        Returns (outer_frame, content_frame).
        Pack/place the outer; populate the content as if it were a regular Frame.

        Auto-grows the card height to match the content's natural reqheight,
        unless the caller pins outer.configure(height=...) + pack_propagate(False).
        """
        bg     = bg or CARD
        border = border or BORDER
        try:
            pbg = parent_bg or parent.cget("bg")
        except Exception:
            pbg = BG
        outer = tk.Frame(parent, bg=pbg)
        cv = tk.Canvas(outer, bg=pbg, highlightthickness=0, bd=0)
        cv.pack(fill="both", expand=True)
        content = tk.Frame(cv, bg=bg)
        win_id = [None]
        _last_req = [(0, 0)]
        _manual_height = [False]

        def _redraw(_e=None):
            w = cv.winfo_width()
            h = cv.winfo_height()
            if w < 4 or h < 4:
                return
            cv.delete("bg")
            r = max(2, min(radius, w // 2, h // 2))
            pts = [
                r, 0, w - r, 0, w, 0, w, r,
                w, h - r, w, h, w - r, h,
                r, h, 0, h, 0, h - r,
                0, r, 0, 0,
            ]
            cv.create_polygon(pts, smooth=True, splinesteps=24,
                              fill=bg, outline=border, width=border_w, tags="bg")
            if win_id[0] is None:
                win_id[0] = cv.create_window(border_w + 1, border_w + 1,
                                              anchor="nw", window=content)
            cv.itemconfig(win_id[0],
                          width=max(1, w - 2 * (border_w + 1)),
                          height=max(1, h - 2 * (border_w + 1)))
            cv.tag_raise(win_id[0])

        cv.bind("<Configure>", _redraw)

        def _content_resize(_e=None):
            """Auto-grow canvas height to fit content's natural reqheight."""
            if _manual_height[0]:
                return
            try:
                rw = content.winfo_reqwidth()
                rh = content.winfo_reqheight()
                # Skip tiny / unchanged sizes
                if rh < 5 or (abs(rh - _last_req[0][1]) < 2 and abs(rw - _last_req[0][0]) < 2):
                    return
                _last_req[0] = (rw, rh)
                target_h = rh + 2 * (border_w + 1)
                cv.configure(height=target_h)
            except Exception:
                pass
        content.bind("<Configure>", _content_resize)

        # Mark that the user manually pinned a height when they call
        # outer.configure(height=...) + pack_propagate(False)
        _orig_configure = outer.configure
        def _wrapped_configure(*a, **kw):
            if "height" in kw and kw["height"] > 5:
                _manual_height[0] = True
                try:
                    cv.configure(height=kw["height"])
                except Exception:
                    pass
            return _orig_configure(*a, **kw)
        outer.configure = _wrapped_configure
        outer.config = _wrapped_configure

        outer._cv = cv
        outer._content = content
        outer._set_border = lambda c: cv.itemconfig("bg", outline=c) if cv.find_withtag("bg") else None

        if hover_border:
            def _h(_e): outer._set_border(hover_border)
            def _u(_e): outer._set_border(border)
            for w in (cv, content):
                w.bind("<Enter>", _h, add="+")
                w.bind("<Leave>", _u, add="+")

        return outer, content

    def _show_toast(self, title, msg="", col=None, duration=4000):
        """Toast notification in top-right corner."""
        if not self.cfg.get("notify_popup", True):
            return
        col = col or OK
        try:
            t = tk.Toplevel(self.root)
            t.overrideredirect(True)
            t.attributes("-topmost", True)
            t.configure(bg=CARD)
            tw, th = 340, 82
            sw = self.root.winfo_screenwidth()
            t.geometry(f"{tw}x{th}+{sw - tw - 24}+{24}")
            f = tk.Frame(t, bg=CARD, highlightthickness=1, highlightbackground=col)
            f.pack(fill="both", expand=True)
            tk.Frame(f, height=3, bg=col).pack(fill="x")
            inner = tk.Frame(f, bg=CARD, padx=14, pady=10)
            inner.pack(fill="both", expand=True)
            # icon row
            ir = tk.Frame(inner, bg=CARD)
            ir.pack(fill="x")
            tk.Label(ir, text="●", font=("Segoe UI", 8), bg=CARD, fg=col).pack(side="left", padx=(0,6))
            tk.Label(ir, text=title, font=("Segoe UI", 11, "bold"), bg=CARD, fg=TEXT).pack(side="left")
            # close button
            tk.Label(ir, text="✕", font=("Segoe UI", 9), bg=CARD, fg=MUTED, cursor="hand2").pack(side="right")
            if msg:
                tk.Label(inner, text=msg, font=("Segoe UI", 9), bg=CARD, fg=TEXT2,
                         wraplength=300, anchor="w").pack(anchor="w", pady=(2, 0))
            def dismiss(e=None):
                try: t.destroy()
                except: pass
            for w in t.winfo_children() + [t]:
                try: w.bind("<Button-1>", dismiss)
                except: pass
            t.after(duration, dismiss)
            # Slide-in from right: animate x from sw to sw-tw-24
            t.attributes("-alpha", 0.0)
            def _fade(alpha=0.0):
                if alpha >= 1.0 or not t.winfo_exists(): return
                t.attributes("-alpha", min(1.0, alpha + 0.12))
                t.after(20, lambda: _fade(alpha + 0.12))
            _fade()
        except Exception:
            pass

    def _play_notify_sound(self):
        """Play notification sound if enabled."""
        if not self.cfg.get("notify_sound", True):
            return
        try:
            import winsound
            winsound.MessageBeep(winsound.MB_ICONASTERISK)
        except Exception:
            pass

    # ── LAYOUT ───────────────────────────────────────────────────────────────
    def _build_layout(self):
        self.bg_canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0)
        self.bg_canvas.pack(fill="both", expand=True)

        SIDEBAR_W = 230
        SB_BG = "#0b0e18"

        self._sidebar_icons  = {}
        self._sidebar_outers = {}
        self._sidebar_lpads  = {}

        self.sidebar = tk.Frame(self.bg_canvas, bg=SB_BG, width=SIDEBAR_W)
        self.sidebar.pack_propagate(False)
        self._sidebar_win = self.bg_canvas.create_window(
            0, 0, anchor="nw", window=self.sidebar, width=SIDEBAR_W)

        self._sep_win = self.bg_canvas.create_line(
            SIDEBAR_W, 0, SIDEBAR_W, 800, fill="#141c2e", width=1)

        self.main_frame = tk.Frame(self.bg_canvas, bg="#050810")
        self._main_win  = self.bg_canvas.create_window(
            SIDEBAR_W + 1, 0, anchor="nw", window=self.main_frame)

        def _on_canvas_resize(e):
            w, h = e.width, e.height
            self.bg_canvas.itemconfig(self._sidebar_win, height=h)
            self.bg_canvas.coords(self._sep_win, SIDEBAR_W, 0, SIDEBAR_W, h)
            self.bg_canvas.itemconfig(self._main_win,
                                       width=max(0, w - SIDEBAR_W - 1), height=h)
        self.bg_canvas.bind("<Configure>", _on_canvas_resize)

        L = self.cfg.get("lang", "fr")
        _ = lambda k: t(k, L)

        # ── Logo / app header ─────────────────────────────────────────────────
        logo_row = tk.Frame(self.sidebar, bg=SB_BG)
        logo_row.pack(fill="x", padx=14, pady=(16, 12))

        # App icon rounded square
        ico_cv = tk.Canvas(logo_row, bg="#4f8ef7", width=34, height=34,
                           highlightthickness=0)
        ico_cv.pack(side="left")
        ico_cv.create_rectangle(4, 4, 30, 30, fill="#4f8ef7", outline="",
                                 width=0)
        ico_cv.create_text(17, 17, text="📱", font=("Segoe UI", 14))

        name_col = tk.Frame(logo_row, bg=SB_BG)
        name_col.pack(side="left", padx=(10, 0))
        tk.Label(name_col, text="IG Tracker",
                 font=("Segoe UI", 11, "bold"), bg=SB_BG,
                 fg="#e8eaf0").pack(anchor="w")
        dot_row = tk.Frame(name_col, bg=SB_BG)
        dot_row.pack(anchor="w")
        dot_cv = tk.Canvas(dot_row, bg=SB_BG, width=7, height=7,
                           highlightthickness=0)
        dot_cv.pack(side="left")
        dot_cv.create_oval(0, 0, 7, 7, fill=OK, outline="")
        tk.Label(dot_row, text="  actif" if L == "fr" else "  online",
                 font=("Segoe UI", 7), bg=SB_BG, fg="#3a4d66").pack(side="left")

        tk.Frame(self.sidebar, bg="#141c2e", height=1).pack(fill="x")

        # ── Nav ───────────────────────────────────────────────────────────────
        self.tab_btns = {}
        self._sidebar_indicators = {}

        def _reg(key, icon, label, parent=self.sidebar,
                 indent=False, badge=None, badge_col=None):
            row, lbl, ind = self._make_sidebar_item(parent, icon, label, key,
                                                     indent=indent, badge=badge,
                                                     badge_col=badge_col)
            row.pack(fill="x")
            self.tab_btns[key]            = lbl
            self._sidebar_indicators[key] = ind

        # ── Principal section (collapsible) ───────────────────────────────────
        princ_frame, self._expand_princ = self._make_collapsible_section(
            self.sidebar, "Principal")
        _reg("dashboard", "📊", _("tab.dashboard"), princ_frame)
        _reg("phones",    "📱", _("tab.phones"),    princ_frame)

        # ── Instagram section (collapsible) ───────────────────────────────────
        insta_frame, self._expand_insta = self._make_collapsible_section(
            self.sidebar, "Instagram")
        self._insta_group_children = insta_frame

        _reg("stats",       "📈", _("tab.stats"),       insta_frame)
        _reg("posting",     "🚀", _("tab.posting"),     insta_frame)
        _reg("masspost",    "⚡", _("tab.masspost"),    insta_frame,
             badge="BETA", badge_col="#e0245e")
        _reg("bank",        "🗂", _("tab.bank"),        insta_frame)
        _reg("autocomment", "🤖", _("tab.autocomment"), insta_frame,
             badge="BETA", badge_col="#e0245e")
        _reg("tools",       "🔧", _("tab.tools"),       insta_frame,
             badge="BETA", badge_col="#e0245e")

        # ── Montage section (collapsible) ─────────────────────────────────────
        mont_frame, self._expand_mont = self._make_collapsible_section(
            self.sidebar, "Montage")
        _reg("automation", "✂", _("tab.automation"), mont_frame)

        # ── Bientôt section ────────────────────────────────────────────────────
        self._make_sidebar_section(self.sidebar, "Bientôt" if L == "fr" else "Coming soon")

        # Shared tooltip window for "Soon" items
        _sb_tooltip = {"win": None}

        def _hide_tooltip():
            if _sb_tooltip["win"]:
                try:
                    _sb_tooltip["win"].destroy()
                except Exception:
                    pass
                _sb_tooltip["win"] = None

        def _show_tooltip(widget, title, body, accent="#4f8ef7"):
            _hide_tooltip()
            tip = tk.Toplevel(self.root)
            tip.overrideredirect(True)
            tip.attributes("-topmost", True)
            tip.configure(bg="#0c111a")
            _sb_tooltip["win"] = tip
            # border frame
            border = tk.Frame(tip, bg="#1a2235", padx=1, pady=1)
            border.pack()
            inner = tk.Frame(border, bg="#0c111a", padx=14, pady=10)
            inner.pack()
            tk.Label(inner, text=title, font=("Segoe UI", 9, "bold"),
                     bg="#0c111a", fg=accent).pack(anchor="w")
            tk.Label(inner, text=body, font=("Segoe UI", 8),
                     bg="#0c111a", fg="#8b93a8", wraplength=240, justify="left").pack(anchor="w", pady=(4, 0))
            # Position near widget
            self.root.update_idletasks()
            wx = widget.winfo_rootx() + widget.winfo_width() + 6
            wy = widget.winfo_rooty()
            tip.geometry(f"+{wx}+{wy}")

        def _soon(icon, label, tooltip_title=None, tooltip_body=None, tip_accent="#4f8ef7"):
            row = tk.Frame(self.sidebar, bg=SB_BG)
            row.pack(fill="x")
            tk.Frame(row, bg=SB_BG, width=3).pack(side="left", fill="y")
            tk.Frame(row, bg=SB_BG, width=10).pack(side="left")
            ico_lbl = tk.Label(row, text=icon, font=("Segoe UI", 11),
                     bg=SB_BG, fg="#222d42", width=2, anchor="center")
            ico_lbl.pack(side="left")
            txt_lbl = tk.Label(row, text=label, font=("Segoe UI", 9),
                     bg=SB_BG, fg="#2a3550", padx=8, pady=9, anchor="w")
            txt_lbl.pack(side="left", fill="x", expand=True)
            tk.Label(row, text="Soon", font=("Segoe UI", 7, "bold"),
                     bg="#1a1208", fg="#7a6020",
                     padx=5, pady=1).pack(side="right", padx=(0, 14))
            if tooltip_title and tooltip_body:
                for w in [row, ico_lbl, txt_lbl]:
                    w.bind("<Enter>", lambda e, r=row, t=tooltip_title, b=tooltip_body, a=tip_accent:
                           _show_tooltip(r, t, b, a))
                    w.bind("<Leave>", lambda e: _hide_tooltip())

        _soon("𝕏",  "Twitter / X")
        _soon("🧵", "Threads")
        _soon("🟠", "Reddit")
        _soon("🌐", "Multiposting",
              tooltip_title="🌐  Multiposting — Bientôt disponible !",
              tooltip_body="Poste le même Reel sur plusieurs réseaux en même temps avec un seul clic.\nInstagram · Twitter · Threads · Reddit et plus encore.",
              tip_accent="#a56ef5")

        # Spacer pushes bottom items down
        tk.Frame(self.sidebar, bg=SB_BG).pack(fill="both", expand=True)

        # ── Bottom section — account info card ─────────────────────────────────
        tk.Frame(self.sidebar, bg="#141c2e", height=1).pack(fill="x")

        bottom_card = tk.Frame(self.sidebar, bg="#0e1424", padx=14, pady=10)
        bottom_card.pack(fill="x")

        # Account row
        acc_row = tk.Frame(bottom_card, bg="#0e1424")
        acc_row.pack(fill="x", pady=(0, 6))

        acc_ico = tk.Canvas(acc_row, bg="#162040", width=28, height=28,
                            highlightthickness=0)
        acc_ico.pack(side="left")
        acc_ico.create_oval(2, 2, 26, 26, fill=ACCENT, outline="")
        acc_ico.create_text(14, 14, text="IG", font=("Segoe UI", 7, "bold"),
                             fill="#ffffff")

        acc_info = tk.Frame(acc_row, bg="#0e1424")
        acc_info.pack(side="left", padx=(8, 0))
        tk.Label(acc_info, text="IG Tracker Pro",
                 font=("Segoe UI", 8, "bold"),
                 bg="#0e1424", fg="#c8d0e0").pack(anchor="w")
        tk.Label(acc_info, text="v1.0.0",
                 font=("Segoe UI", 7),
                 bg="#0e1424", fg="#3a4d66").pack(anchor="w")

        # Stats row (phones count)
        stats_row = tk.Frame(bottom_card, bg="#0e1424")
        stats_row.pack(fill="x", pady=(0, 6))
        n_phones = len(self.data)
        tk.Label(stats_row,
                 text=f"📱 {n_phones} téléphone{'s' if n_phones != 1 else ''}",
                 font=("Segoe UI", 8),
                 bg="#0e1424", fg="#4f8ef7").pack(side="left")

        self.status_lbl = tk.Label(bottom_card, text="—",
            font=("Consolas", 7), bg="#0e1424", fg="#2a3550")
        self.status_lbl.pack(anchor="w")

        # Refresh button
        ref_frame = tk.Frame(self.sidebar, bg=SB_BG, padx=12, pady=8)
        ref_frame.pack(fill="x")
        self.refresh_btn = tk.Button(ref_frame, text=_("common.refresh"),
            font=("Segoe UI", 9, "bold"), bg=ACCENT, fg="#07080d",
            relief="flat", cursor="hand2", activebackground=ACCENT2,
            pady=8, bd=0, command=self._manual_refresh)
        self.refresh_btn.pack(fill="x")
        self._bind_hover(self.refresh_btn, ACCENT, ACCENT2, "#07080d", "#07080d")

        tk.Frame(self.sidebar, bg="#141c2e", height=1).pack(fill="x")
        _reg("settings", "⚙", _("tab.settings"))

        # Top stat cards removed per user request

        self.sv = {}  # kept as a no-op dict to avoid AttributeError in _refresh_table

        # Global mousewheel routing
        self.root.bind_all("<MouseWheel>", self._on_global_scroll, add="+")

        self.tab_container = tk.Frame(self.main_frame, bg="#080b12")
        self.tab_container.pack(fill="both", expand=True, padx=16, pady=(0, 16))

        self.tabs = {}
        for build_fn in (self._build_dashboard_tab,
                         self._build_phones_tab,
                         self._build_stats_tab,
                         self._build_automation_tab,
                         self._build_posting_tab,
                         self._build_masspost_tab,
                         self._build_bank_tab,
                         self._build_autocomment_tab,
                         self._build_tools_tab,
                         self._build_settings_tab):
            try:
                build_fn()
            except Exception as _e:
                import traceback
                traceback.print_exc()
                print(f"[BUILD ERROR] {build_fn.__name__}: {_e}")

    def _bind_mousewheel(self, widget, canvas):
        widget.bind("<MouseWheel>",
                    lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"),
                    add="+")
        for child in widget.winfo_children():
            self._bind_mousewheel(child, canvas)

    def _post_load_preview_into(self, cv, video_path, ref_attr):
        """Extract a thumbnail from video_path and render onto canvas cv."""
        if not cv or not cv.winfo_exists() or not PIL_OK:
            return
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg or not Path(video_path).exists():
            return

        def _bg():
            try:
                cache_dir = BASE_DIR / "_bank_thumbs"
                cache_dir.mkdir(exist_ok=True)
                key = hashlib.md5(str(video_path).encode()).hexdigest()[:12]
                jpg = cache_dir / f"post_{key}.jpg"
                if not jpg.exists():
                    subprocess.run([ffmpeg, "-y", "-ss", "1", "-i", video_path,
                                    "-frames:v", "1", "-q:v", "4",
                                    "-vf", "scale=540:-2", str(jpg)],
                                    capture_output=True, timeout=8)
                if not jpg.exists():
                    return
                img = Image.open(jpg).convert("RGB")
                w = cv.winfo_width() or 280
                h = int(cv.cget("height")) or 130
                iw, ih = img.size
                target = w / h
                src = iw / ih
                if src > target:
                    nw = int(ih * target)
                    img = img.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
                else:
                    nh = int(iw / target)
                    img = img.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
                img = img.resize((w, h), Image.LANCZOS)
                overlay = Image.new("RGBA", (w, h), (0, 0, 0, 60))
                final = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
                photo = ImageTk.PhotoImage(final)

                def _apply():
                    if not cv.winfo_exists():
                        return
                    cv.delete("all")
                    setattr(self, ref_attr, photo)
                    cv.create_image(0, 0, anchor="nw", image=photo)
                    cx, cy = w // 2, h // 2
                    cv.create_oval(cx - 20, cy - 20, cx + 20, cy + 20,
                                    outline="#ffffff88", width=2)
                    cv.create_polygon(cx - 6, cy - 10, cx - 6, cy + 10, cx + 10, cy,
                                       fill="#ffffff", outline="")
                    name = Path(video_path).name
                    cv.create_rectangle(8, h - 22, 8 + 8 + len(name) * 6, h - 6,
                                         fill="#000000aa", outline="")
                    cv.create_text(12, h - 14, anchor="w", text=name,
                                    fill="#ffffff", font=("Consolas", 8, "bold"))
                self.root.after(0, _apply)
            except Exception:
                pass

        threading.Thread(target=_bg, daemon=True).start()

    def _post_load_preview(self, video_path):
        cv = getattr(self, "_post_preview_canvas", None)
        if not cv:
            return
        if not video_path or not Path(video_path).exists():
            self._post_draw_preview(Path(video_path).name if video_path else "—")
            return
        self._post_load_preview_into(cv, video_path, "_post_preview_img_ref")

    def _bind_hover(self, widget, bg_normal, bg_hover, fg_normal=None, fg_hover=None):
        """Smooth hover animation on any button/label."""
        _anim = [0]

        def _lerp(c1, c2, t):
            try:
                r1,g1,b1 = widget.winfo_rgb(c1)
                r2,g2,b2 = widget.winfo_rgb(c2)
                r = int(r1+(r2-r1)*t)>>8
                g = int(g1+(g2-g1)*t)>>8
                b = int(b1+(b2-b1)*t)>>8
                return f"#{r:02x}{g:02x}{b:02x}"
            except Exception:
                return c2 if t > 0.5 else c1

        def _tick(direction):
            _anim[0] = max(0, min(6, _anim[0] + direction))
            t = _anim[0] / 6
            if widget.winfo_exists():
                kw = {"bg": _lerp(bg_normal, bg_hover, t)}
                if fg_normal and fg_hover:
                    kw["fg"] = _lerp(fg_normal, fg_hover, t)
                try:
                    widget.config(**kw)
                except Exception:
                    pass
            if (direction > 0 and _anim[0] < 6) or (direction < 0 and _anim[0] > 0):
                widget.after(18, lambda: _tick(direction))

        widget.bind("<Enter>", lambda e: _tick(1), add="+")
        widget.bind("<Leave>", lambda e: _tick(-1), add="+")

    def _make_sidebar_item(self, parent, icon, label, key,
                           indent=False, badge=None, badge_col=None):
        SB  = "#0b0e18"
        HOV = "#131b2e"
        ACT = "#162040"

        outer = tk.Frame(parent, bg=SB, cursor="hand2")

        # 3-px left accent bar
        indicator = tk.Frame(outer, width=3, bg=SB)
        indicator.pack(side="left", fill="y")

        # Left padding
        lpad = tk.Frame(outer, bg=SB, width=10 if not indent else 22)
        lpad.pack(side="left")

        # Icon label (colored separately for active state)
        icon_lbl = tk.Label(outer, text=icon, font=("Segoe UI", 11),
                            bg=SB, fg="#3d4a63",
                            cursor="hand2", anchor="center", width=2)
        icon_lbl.pack(side="left", pady=0)

        # Text label
        text_lbl = tk.Label(outer, text=label,
                            font=("Segoe UI", 9),
                            bg=SB, fg="#6b7a99",
                            cursor="hand2", anchor="w", padx=8, pady=9)
        text_lbl.pack(side="left", fill="x", expand=True)

        if badge:
            bcol = badge_col or "#e0245e"
            blbl = tk.Label(outer, text=badge, font=("Segoe UI", 7, "bold"),
                            bg=bcol, fg="#ffffff", padx=5, pady=1,
                            cursor="hand2", relief="flat")
            blbl.pack(side="right", padx=(0, 12))
            blbl.bind("<Button-1>", lambda e, x=key: self._show_tab(x))

        def _click(_e=None):
            self._show_tab(key)
        for w in (outer, icon_lbl, text_lbl, lpad):
            w.bind("<Button-1>", _click)

        def _hl(on):
            if getattr(self, "_active_tab", "") != key:
                bg2 = HOV if on else SB
                for w2 in (outer, icon_lbl, text_lbl, lpad):
                    w2.config(bg=bg2)
                text_lbl.config(fg="#b0bcd6" if on else "#6b7a99")
                icon_lbl.config(fg="#8899bb" if on else "#3d4a63")
        outer.bind("<Enter>",  lambda e: _hl(True))
        outer.bind("<Leave>",  lambda e: _hl(False))
        icon_lbl.bind("<Enter>",  lambda e: _hl(True))
        icon_lbl.bind("<Leave>",  lambda e: _hl(False))
        text_lbl.bind("<Enter>",  lambda e: _hl(True))
        text_lbl.bind("<Leave>",  lambda e: _hl(False))

        # Store icon_lbl for active-state color updates in _show_tab
        if not hasattr(self, "_sidebar_icons"):
            self._sidebar_icons = {}
        self._sidebar_icons[key] = icon_lbl
        if not hasattr(self, "_sidebar_outers"):
            self._sidebar_outers = {}
        self._sidebar_outers[key] = outer
        if not hasattr(self, "_sidebar_lpads"):
            self._sidebar_lpads = {}
        self._sidebar_lpads[key] = lpad

        return outer, text_lbl, indicator

    def _make_sidebar_group(self, parent, icon, label, badge=None, col=None):
        SB = "#0b0e18"
        outer = tk.Frame(parent, bg=SB)
        children = tk.Frame(outer, bg=SB)
        children.pack(fill="x")
        return outer, children

    def _make_sidebar_section(self, parent, label):
        """Section header label in GeeLark style (uppercase muted text)."""
        SB = "#0b0e18"
        tk.Label(parent, text=label.upper(),
                 font=("Segoe UI", 7, "bold"),
                 bg=SB, fg="#2e3d55",
                 anchor="w", padx=16, pady=(8)).pack(fill="x")

    def _make_collapsible_section(self, parent, label, initially_open=True):
        """Collapsible sidebar section — returns (children_frame, expand_fn).

        Uses an outer wrapper so pack_forget/pack on children never moves
        them to the bottom of the sidebar.
        """
        SB  = "#0b0e18"
        HOV = "#0f1420"
        state = [initially_open]

        # Outer wrapper — always packed at the correct position in parent
        outer = tk.Frame(parent, bg=SB)
        outer.pack(fill="x")

        # Header inside outer
        hdr = tk.Frame(outer, bg=SB, cursor="hand2")
        hdr.pack(fill="x")

        chevron = tk.Label(hdr, text="▾" if initially_open else "▸",
                           font=("Segoe UI", 8), bg=SB, fg="#3a4d66",
                           cursor="hand2")
        chevron.pack(side="right", padx=(0, 12))
        tk.Label(hdr, text=label.upper(),
                 font=("Segoe UI", 7, "bold"),
                 bg=SB, fg="#3a4d66",
                 anchor="w", padx=16, pady=8,
                 cursor="hand2").pack(side="left")

        # Children container inside outer — pack/forget stays within outer
        children = tk.Frame(outer, bg=SB)
        if initially_open:
            children.pack(fill="x")

        def _expand():
            if not state[0]:
                children.pack(fill="x")
                chevron.config(text="▾")
                state[0] = True

        def _toggle(e=None):
            if state[0]:
                children.pack_forget()
                chevron.config(text="▸")
                state[0] = False
            else:
                _expand()

        for w in hdr.winfo_children() + [hdr]:
            w.bind("<Button-1>", _toggle)
        hdr.bind("<Enter>", lambda e: hdr.config(bg=HOV))
        hdr.bind("<Leave>", lambda e: hdr.config(bg=SB))

        return children, _expand

    def _show_tab(self, key):
        self._active_tab = key
        # Auto-expand collapsible sections when navigating to a tab inside them
        _insta_keys = {"stats", "posting", "masspost", "bank", "autocomment", "tools"}
        _princ_keys = {"dashboard", "phones"}
        _mont_keys  = {"automation"}
        if key in _insta_keys:
            if hasattr(self, "_expand_insta"):
                self._expand_insta()
            elif hasattr(self, "_insta_group_children"):
                c = self._insta_group_children
                if not c.winfo_ismapped():
                    c.pack(fill="x")
        if key in _princ_keys and hasattr(self, "_expand_princ"):
            self._expand_princ()
        if key in _mont_keys and hasattr(self, "_expand_mont"):
            self._expand_mont()

        SB_BG = "#0b0e18"
        ACT   = "#162040"
        ICON_ACT  = "#4f8ef7"
        ICON_IDLE = "#3d4a63"
        for k, ind in self._sidebar_indicators.items():
            active = k == key
            text_lbl = self.tab_btns[k]
            icon_lbl = getattr(self, "_sidebar_icons", {}).get(k)
            outer    = getattr(self, "_sidebar_outers", {}).get(k)
            lpad_w   = getattr(self, "_sidebar_lpads", {}).get(k)
            if active:
                ind.config(bg=ACCENT)
                text_lbl.config(bg=ACT, fg="#e8eaf0",
                                font=("Segoe UI", 9, "bold"))
                if icon_lbl:
                    icon_lbl.config(bg=ACT, fg=ICON_ACT)
                if outer:
                    outer.config(bg=ACT)
                if lpad_w:
                    lpad_w.config(bg=ACT)
            else:
                ind.config(bg=SB_BG)
                text_lbl.config(bg=SB_BG, fg="#6b7a99",
                                font=("Segoe UI", 9))
                if icon_lbl:
                    icon_lbl.config(bg=SB_BG, fg=ICON_IDLE)
                if outer:
                    outer.config(bg=SB_BG)
                if lpad_w:
                    lpad_w.config(bg=SB_BG)

        for k, frame in self.tabs.items():
            if k == key:
                frame.place(x=0, y=0, relwidth=1, relheight=1)
                frame.lift()
            else:
                frame.place_forget()

        if key == "stats":    self._refresh_ig_list()
        if key == "bank":     self._refresh_bank()
        if key == "automation": self._refresh_auto_phones()
        if key == "masspost":
            self._mp_refresh_phones()
            try:
                self._mp_refresh_bank_pool()
            except Exception:
                pass
        if key == "dashboard":
            try: self._dash_refresh_sidebar()
            except Exception: pass
            self._dash_redraw_chart()

    def _on_global_scroll(self, event):
        """Route mousewheel only to widgets that genuinely need scrolling.
        Walk up from cursor; only scroll widgets that have actual scroll content:
        - Listbox / Text / Treeview: always allowed
        - Canvas: only if scrollregion is bigger than visible area
        - Spinbox: handle its own value changes
        - All other widget types (Frame, Toplevel, Tk, Button, etc.): skip
        Stop walking once we cross a Toplevel/Tk boundary.
        """
        w = event.widget
        delta = int(-1 * (event.delta / 120)) if event.delta else 0
        if delta == 0:
            return
        for _ in range(15):
            if w is None:
                return
            try:
                cls = w.winfo_class()
            except Exception:
                return
            if cls in ("Listbox", "Text", "Treeview"):
                try:
                    w.yview_scroll(delta, "units")
                except Exception:
                    pass
                return
            if cls == "Canvas":
                try:
                    sr = w.cget("scrollregion")
                    if sr and str(sr).strip():
                        parts = str(sr).split()
                        if len(parts) == 4:
                            sr_h = float(parts[3]) - float(parts[1])
                            visible_h = w.winfo_height()
                            if sr_h > visible_h + 2:
                                w.yview_scroll(delta, "units")
                                return
                except Exception:
                    pass
            if cls in ("Toplevel", "Tk", "Wm"):
                return
            w = getattr(w, "master", None)

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET TÉLÉPHONES
    # ══════════════════════════════════════════════════════════════════════════
    # ══════════════════════════════════════════════════════════════════════════
    # DASHBOARD TAB
    # ══════════════════════════════════════════════════════════════════════════
    def _views_history_path(self):
        return BASE_DIR / "views_history.json"

    def _views_history_load(self):
        p = self._views_history_path()
        if not p.exists():
            return {}
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _views_history_snapshot(self):
        """Snapshot views per account + total for today."""
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            hist  = self._views_history_load()
            entry = hist.get(today, {})

            total = 0
            for pid, d in self.data.items():
                acct_views = sum(int(v.get("views") or 0)
                                 for v in (d.get("videos") or []))
                entry[pid] = acct_views
                total += acct_views
            entry["__total__"] = total

            hist[today] = entry
            # Keep last 365 days
            keys = sorted(hist.keys())[-365:]
            hist = {k: hist[k] for k in keys}
            self._views_history_path().write_text(
                json.dumps(hist, indent=2), encoding="utf-8")
            self._dash_redraw_chart()
        except Exception:
            pass

    def _dash_hist_for(self, hist, pid):
        """Extract a {date: value} series for a given pid (or '__total__')."""
        out = {}
        for date, entry in hist.items():
            if isinstance(entry, dict):
                out[date] = int(entry.get(pid, 0))
            elif pid == "__total__":
                out[date] = int(entry)   # old flat format
        return out

    def _build_dashboard_tab(self):
        L = self.cfg.get("lang", "fr")
        self._dash_selected_pid = "__total__"   # None = all, or a phone id

        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["dashboard"] = f

        # ══════════════════════════════════════════════════════════════════════
        # LEFT SIDEBAR — account list (OnlyFans style)
        # ══════════════════════════════════════════════════════════════════════
        sidebar = tk.Frame(f, bg="#0e1118", width=210)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)

        # Sidebar header
        sb_hdr = tk.Frame(sidebar, bg="#0e1118", padx=12, pady=10)
        sb_hdr.pack(fill="x")
        tk.Label(sb_hdr, text=("Comptes" if L == "fr" else "Accounts"),
                 font=("Segoe UI", 10, "bold"), bg="#0e1118", fg=TEXT).pack(anchor="w")

        # Separator
        tk.Frame(sidebar, bg=BORDER, height=1).pack(fill="x")

        # Scrollable list
        sb_cv = tk.Canvas(sidebar, bg="#0e1118", highlightthickness=0)
        sb_cv.pack(fill="both", expand=True)
        self._dash_sb_inner = tk.Frame(sb_cv, bg="#0e1118")
        _sb_win = sb_cv.create_window((0, 0), window=self._dash_sb_inner, anchor="nw")
        self._dash_sb_inner.bind("<Configure>",
            lambda e: sb_cv.configure(scrollregion=sb_cv.bbox("all")))
        sb_cv.bind("<Configure>",
            lambda e: sb_cv.itemconfig(_sb_win, width=e.width))
        self._bind_mousewheel(self._dash_sb_inner, sb_cv)
        self._dash_sb_canvas = sb_cv
        self._dash_sb_rows   = {}   # pid → row frame

        # ══════════════════════════════════════════════════════════════════════
        # RIGHT — scrollable content
        # ══════════════════════════════════════════════════════════════════════
        right_wrap = tk.Frame(f, bg=BG)
        right_wrap.pack(side="left", fill="both", expand=True)

        scroll_cv = tk.Canvas(right_wrap, bg=BG, highlightthickness=0)
        scroll_sb = ttk.Scrollbar(right_wrap, orient="vertical", command=scroll_cv.yview)
        scroll_cv.configure(yscrollcommand=scroll_sb.set)
        scroll_sb.pack(side="right", fill="y")
        scroll_cv.pack(side="left", fill="both", expand=True)
        inner = tk.Frame(scroll_cv, bg=BG)
        _scroll_win = scroll_cv.create_window((0, 0), window=inner, anchor="nw")
        def _on_inner_cfg(e):
            scroll_cv.configure(scrollregion=scroll_cv.bbox("all"))
            scroll_cv.itemconfig(_scroll_win, width=scroll_cv.winfo_width())
        inner.bind("<Configure>", _on_inner_cfg)
        scroll_cv.bind("<Configure>",
                       lambda e: scroll_cv.itemconfig(_scroll_win, width=e.width))
        self._bind_mousewheel(inner, scroll_cv)

        pad = dict(padx=16, pady=(0, 14))

        # ── Section title (dynamic) ───────────────────────────────────────────
        self._dash_title_lbl = tk.Label(inner, text="",
                                         font=("Segoe UI", 11, "bold"),
                                         bg=BG, fg=TEXT, anchor="w")
        self._dash_title_lbl.pack(fill="x", padx=16, pady=(12, 8))

        # ── Summary row ───────────────────────────────────────────────────────
        summ_row = tk.Frame(inner, bg=CARD,
                            highlightthickness=1, highlightbackground=BORDER)
        summ_row.pack(fill="x", **pad)

        tot_frame = tk.Frame(summ_row, bg=CARD, padx=20, pady=16)
        tot_frame.pack(side="left")
        self._dash_icon_cv = tk.Canvas(tot_frame, bg=ACCENT, width=46, height=46,
                                        highlightthickness=0)
        self._dash_icon_cv.pack()
        self._dash_icon_cv.create_oval(0, 0, 46, 46, fill=ACCENT, outline="")
        self._dash_icon_cv.create_text(23, 23, text="👁", font=("Segoe UI", 16))
        self._dash_icon_sublbl = tk.Label(tot_frame,
                                           text=("Total vues" if L == "fr" else "Total views"),
                                           font=("Segoe UI", 9), bg=CARD, fg=ACCENT)
        self._dash_icon_sublbl.pack(pady=(4, 0))
        self._dash_total_lbl = tk.Label(tot_frame, text="—",
                                         font=("Segoe UI", 24, "bold"), bg=CARD, fg=TEXT)
        self._dash_total_lbl.pack()

        tk.Frame(summ_row, bg=BORDER, width=1).pack(side="left", fill="y", pady=10)

        grid_frame = tk.Frame(summ_row, bg=CARD)
        grid_frame.pack(side="left", fill="both", expand=True, padx=8, pady=8)

        self._dash_kpis = {}
        stat_defs = [
            ("today",  "👁",  ("Vues aujourd'hui" if L == "fr" else "Today's views"), ACCENT),
            ("delta",  "📈",  ("Croissance"       if L == "fr" else "Growth"),        OK),
            ("extra1", "📱",  ("Téléphones actifs" if L == "fr" else "Active phones"),"#5b9cf6"),
            ("peak",   "🏆",  ("Record journalier" if L == "fr" else "Daily peak"),   WARN),
            ("avg",    "📊",  ("Moyenne / jour"   if L == "fr" else "Daily avg"),     TEXT2),
            ("extra2", "🚫",  ("Bannis"           if L == "fr" else "Banned"),        DANGER),
        ]
        self._dash_stat_defs = stat_defs
        for idx, (k, ico, lbl, col) in enumerate(stat_defs):
            r, c = divmod(idx, 3)
            cell = tk.Frame(grid_frame, bg=SURFACE2,
                            highlightthickness=1, highlightbackground=BORDER)
            cell.grid(row=r, column=c, padx=3, pady=3, sticky="nsew")
            grid_frame.columnconfigure(c, weight=1)
            top_r = tk.Frame(cell, bg=SURFACE2)
            top_r.pack(fill="x", padx=10, pady=(8, 0))
            val_lbl = tk.Label(top_r, text="—",
                               font=("Segoe UI", 18, "bold"), bg=SURFACE2, fg=col)
            val_lbl.pack(side="left")
            ico_cv = tk.Canvas(top_r, bg=SURFACE3, width=28, height=28,
                               highlightthickness=0)
            ico_cv.pack(side="right")
            ico_cv.create_oval(1, 1, 27, 27, fill=SURFACE3, outline=col, width=1)
            ico_cv.create_text(14, 14, text=ico, font=("Segoe UI", 10))
            lbl_w = tk.Label(cell, text=lbl, font=("Segoe UI", 8),
                             bg=SURFACE2, fg=TEXT2)
            lbl_w.pack(anchor="w", padx=10, pady=(2, 8))
            self._dash_kpis[k]          = val_lbl
            self._dash_kpis[k + "_lbl"] = lbl_w   # store label widget too

        # ── Trends section ────────────────────────────────────────────────────
        trend_hdr = tk.Frame(inner, bg=BG)
        trend_hdr.pack(fill="x", padx=16, pady=(0, 6))
        tk.Label(trend_hdr,
                 text=("Tendances des vues" if L == "fr" else "Views trends"),
                 font=("Segoe UI", 11, "bold"), bg=BG, fg=TEXT).pack(side="left")

        self._dash_range = tk.StringVar(value="30d")
        self._dash_range_btns = {}
        rng_frame = tk.Frame(trend_hdr, bg=BG)
        rng_frame.pack(side="right")
        for code, lbl in [("24h", "24h"), ("7d", "7j"), ("30d", "30j"), ("all", "Tout")]:
            b = tk.Button(rng_frame, text=lbl, font=("Segoe UI", 9),
                          bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                          padx=10, pady=4, bd=0,
                          command=lambda c=code: self._dash_set_range(c))
            b.pack(side="left", padx=(0, 4))
            self._dash_range_btns[code] = b

        chart_frame = tk.Frame(inner, bg=CARD,
                               highlightthickness=1, highlightbackground=BORDER)
        chart_frame.pack(fill="x", **pad)

        self._dash_chart = tk.Canvas(chart_frame, bg=CARD,
                                      highlightthickness=0, height=280)
        self._dash_chart.pack(fill="both", expand=True)
        self._dash_chart.bind("<Configure>", lambda e: self._dash_redraw_chart())
        self._dash_chart.bind("<Motion>",    self._dash_on_hover)
        self._dash_chart.bind("<Leave>",     lambda e: self._dash_hide_tooltip())
        self._dash_bar_rects   = []
        self._dash_tooltip_ids = []

        # Populate sidebar + draw chart
        self._dash_refresh_sidebar()
        self._dash_set_range("30d")
        self.root.after(300, self._dash_redraw_chart)

    def _dash_refresh_sidebar(self):
        """Rebuild the account list in the sidebar."""
        inner = self._dash_sb_inner
        for w in inner.winfo_children():
            w.destroy()
        self._dash_sb_rows = {}
        L = self.cfg.get("lang", "fr")

        def _select(pid):
            self._dash_selected_pid = pid
            self._dash_refresh_sidebar()
            self._dash_redraw_chart()

        # Colour palette for avatars
        AVATAR_COLORS = ["#3b5bdb", "#2f9e44", "#c2255c", "#e8590c",
                         "#5c7cfa", "#0ca678", "#f76707", "#9c36b5"]

        # "Tous les comptes" row
        is_total = (self._dash_selected_pid == "__total__")
        _all_bg = "#1e2a4a" if is_total else "#0e1118"
        all_row = tk.Frame(inner, bg=_all_bg, cursor="hand2")
        all_row.pack(fill="x")
        all_row.bind("<Button-1>", lambda e: _select("__total__"))
        # left accent bar
        tk.Frame(all_row, bg=ACCENT if is_total else "#0e1118",
                 width=3).pack(side="left", fill="y")
        av = tk.Canvas(all_row, bg="#3b5bdb", width=32, height=32,
                       highlightthickness=0)
        av.pack(side="left", padx=(8, 8), pady=8)
        av.create_oval(0, 0, 32, 32, fill="#3b5bdb", outline="")
        av.create_text(16, 16, text="📊", font=("Segoe UI", 12))
        av.bind("<Button-1>", lambda e: _select("__total__"))
        name_lbl = tk.Label(all_row,
                            text=("Tous les comptes" if L == "fr" else "All accounts"),
                            font=("Segoe UI", 9, "bold" if is_total else "normal"),
                            bg=_all_bg, fg=TEXT if is_total else TEXT2,
                            cursor="hand2")
        name_lbl.pack(side="left", anchor="w")
        name_lbl.bind("<Button-1>", lambda e: _select("__total__"))

        tk.Frame(inner, bg=BORDER, height=1).pack(fill="x")

        # Per-phone rows
        phones = [(pid, d) for pid, d in self.data.items() if d.get("phone_name")]
        phones.sort(key=lambda x: x[1].get("phone_name", ""))

        for i, (pid, d) in enumerate(phones):
            name  = d.get("phone_name", pid)
            ig    = d.get("ig_username", "") or ""
            status = d.get("ig_status", "")
            dot_col = OK if status == "active" else (DANGER if status == "banned" else MUTED)
            is_sel = (self._dash_selected_pid == pid)
            row_bg = "#1e2a4a" if is_sel else "#0e1118"
            av_col = AVATAR_COLORS[i % len(AVATAR_COLORS)]
            initials = (name[:2]).upper()

            row = tk.Frame(inner, bg=row_bg, cursor="hand2")
            row.pack(fill="x")
            self._dash_sb_rows[pid] = row

            def _bind_row(w, p=pid):
                w.bind("<Button-1>", lambda e: _select(p))
                w.bind("<Enter>",
                       lambda e, r=row, bg=row_bg: r.config(
                           bg="#16203a" if bg == "#0e1118" else bg))
                w.bind("<Leave>",
                       lambda e, r=row, bg=row_bg: r.config(bg=bg))

            # Left accent bar
            acc = tk.Frame(row, bg=ACCENT if is_sel else row_bg, width=3)
            acc.pack(side="left", fill="y")
            _bind_row(acc)

            # Avatar circle
            av2 = tk.Canvas(row, bg=av_col, width=32, height=32,
                            highlightthickness=0)
            av2.pack(side="left", padx=(8, 8), pady=8)
            av2.create_oval(0, 0, 32, 32, fill=av_col, outline="")
            av2.create_text(16, 16, text=initials,
                            fill="#fff", font=("Segoe UI", 10, "bold"))
            _bind_row(av2)

            # Name + IG handle
            txt_frame = tk.Frame(row, bg=row_bg)
            txt_frame.pack(side="left", fill="x", expand=True)
            n_lbl = tk.Label(txt_frame, text=name[:20],
                             font=("Segoe UI", 9, "bold" if is_sel else "normal"),
                             bg=row_bg, fg=TEXT if is_sel else TEXT2,
                             cursor="hand2", anchor="w")
            n_lbl.pack(anchor="w")
            if ig:
                ig_lbl = tk.Label(txt_frame, text=f"@{ig[:18]}",
                                  font=("Segoe UI", 7), bg=row_bg,
                                  fg=MUTED, cursor="hand2", anchor="w")
                ig_lbl.pack(anchor="w")
                _bind_row(ig_lbl)
            _bind_row(txt_frame); _bind_row(n_lbl); _bind_row(row)

            # Status dot
            dot = tk.Canvas(row, bg=row_bg, width=10, height=10,
                            highlightthickness=0)
            dot.pack(side="right", padx=(0, 10))
            dot.create_oval(1, 1, 9, 9, fill=dot_col, outline="")
            _bind_row(dot)

        # Trigger scrollregion update
        self._dash_sb_canvas.configure(
            scrollregion=self._dash_sb_canvas.bbox("all"))

    def _dash_on_hover(self, event):
        cv = self._dash_chart
        x, y = event.x, event.y
        hit = None
        for (x1, x2, bar_top, value, key_str, prev_v) in self._dash_bar_rects:
            if x1 <= x <= x2:
                hit = (x1, x2, bar_top, value, key_str, prev_v)
                break
        self._dash_hide_tooltip()
        if not hit:
            return
        x1, x2, bar_top, value, key_str, prev_v = hit
        try:
            d = datetime.strptime(key_str, "%Y-%m-%d")
            date_lbl = d.strftime("%d %b %Y")
        except Exception:
            date_lbl = key_str
        growth = ((value - prev_v) / max(1, prev_v) * 100) if prev_v else 0
        sign   = "+" if growth >= 0 else ""
        lines  = [date_lbl, f"Vues : {fmt(value)}", f"Variation : {sign}{growth:.2f}%"]
        L_tip  = 160
        H_tip  = 58
        tx = (x1 + x2) // 2
        ty = max(10, bar_top - H_tip - 8)
        if tx + L_tip // 2 > cv.winfo_width():
            tx = cv.winfo_width() - L_tip // 2 - 6
        if tx - L_tip // 2 < 0:
            tx = L_tip // 2 + 6
        ids = []
        ids.append(cv.create_rectangle(tx - L_tip//2, ty,
                                        tx + L_tip//2, ty + H_tip,
                                        fill="#1a1f2e", outline=ACCENT, width=1))
        ids.append(cv.create_line((x1+x2)//2, bar_top, (x1+x2)//2, ty+H_tip,
                                   fill=ACCENT, dash=(2,3)))
        for li, line in enumerate(lines):
            col = TEXT if li == 0 else (ACCENT if li == 1 else
                                         (OK if growth >= 0 else DANGER))
            fnt = ("Segoe UI", 8, "bold") if li == 0 else ("Segoe UI", 8)
            ids.append(cv.create_text(tx, ty + 10 + li * 16,
                                       text=line, fill=col, font=fnt))
        self._dash_tooltip_ids = ids

    def _dash_hide_tooltip(self):
        cv = getattr(self, "_dash_chart", None)
        if not cv:
            return
        for iid in getattr(self, "_dash_tooltip_ids", []):
            try:
                cv.delete(iid)
            except Exception:
                pass
        self._dash_tooltip_ids = []

    def _dash_set_range(self, code):
        self._dash_range.set(code)
        for c, b in self._dash_range_btns.items():
            if c == code:
                b.config(bg="#3d5a99", fg="#ffffff", font=("Segoe UI", 9, "bold"))
            else:
                b.config(bg=SURFACE2, fg=TEXT2, font=("Segoe UI", 9))
        self._dash_redraw_chart()

    def _dash_redraw_chart(self):
        cv = getattr(self, "_dash_chart", None)
        if not cv or not cv.winfo_exists():
            return
        L   = self.cfg.get("lang", "fr")
        pid = getattr(self, "_dash_selected_pid", "__total__")
        is_total = (pid == "__total__")

        raw_hist = self._views_history_load()

        # Always add live today entry
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            raw_hist = dict(raw_hist)
            today_entry = dict(raw_hist.get(today, {})) if isinstance(
                raw_hist.get(today), dict) else {}
            total_live = 0
            for apid, d in self.data.items():
                v = sum(int(x.get("views") or 0) for x in (d.get("videos") or []))
                today_entry[apid] = v
                total_live += v
            today_entry["__total__"] = total_live
            raw_hist[today] = today_entry
        except Exception:
            pass

        # Extract per-pid series
        hist = self._dash_hist_for(raw_hist, pid)

        # Update dashboard title + icon sublabel
        try:
            if is_total:
                self._dash_title_lbl.config(
                    text=("Résumé des vues" if L == "fr" else "Views summary"))
                self._dash_icon_sublbl.config(
                    text=("Total vues" if L == "fr" else "Total views"))
            else:
                pname = self.data.get(pid, {}).get("phone_name", pid)
                self._dash_title_lbl.config(text=f"📱  {pname}")
                self._dash_icon_sublbl.config(
                    text=("Vues du compte" if L == "fr" else "Account views"))
        except Exception:
            pass

        if not hist:
            cv.delete("all")
            w = cv.winfo_width() or 600
            h = cv.winfo_height() or 240
            msg = ("Aucune donnée — actualisez l'onglet Téléphones d'abord"
                   if L == "fr" else
                   "No data yet — refresh the Phones tab first")
            cv.create_text(w//2, h//2, text=msg, fill=TEXT2, font=("Segoe UI", 11))
            for k, v2 in self._dash_kpis.items():
                if not k.endswith("_lbl"):
                    v2.config(text="—")
            return

        rng = self._dash_range.get()
        all_keys = sorted(hist.keys())
        if rng == "24h":
            keys = all_keys[-2:]
        elif rng == "7d":
            keys = all_keys[-7:]
        elif rng == "30d":
            keys = all_keys[-30:]
        else:
            keys = all_keys
        if not keys:
            keys = all_keys[-1:]

        values = [int(hist.get(k, 0)) for k in keys]

        # ── KPI updates ───────────────────────────────────────────────────────
        today_v = values[-1] if values else 0
        prev_v  = values[-2] if len(values) > 1 else today_v
        delta   = today_v - prev_v
        peak    = max(values) if values else 0
        avg     = sum(values) // max(1, len(values))
        total   = sum(values)

        self._dash_kpis["today"].config(text=fmt(today_v))
        pct  = (delta / max(1, prev_v) * 100)
        sign = "+" if pct >= 0 else ""
        self._dash_kpis["delta"].config(text=f"{sign}{pct:.1f}%",
                                         fg=OK if pct >= 0 else DANGER)
        self._dash_kpis["peak"].config(text=fmt(peak))
        self._dash_kpis["avg"].config(text=fmt(avg))
        self._dash_total_lbl.config(text=fmt(total))

        # extra1 / extra2 differ by mode
        try:
            if is_total:
                active = sum(1 for d in self.data.values()
                             if d.get("ig_status") == "active")
                banned = sum(1 for d in self.data.values()
                             if d.get("ig_status") == "banned")
                self._dash_kpis["extra1"].config(text=str(active))
                self._dash_kpis["extra1_lbl"].config(
                    text=("Téléphones actifs" if L == "fr" else "Active phones"))
                self._dash_kpis["extra2"].config(text=str(banned), fg=DANGER)
                self._dash_kpis["extra2_lbl"].config(
                    text=("Bannis" if L == "fr" else "Banned"))
            else:
                d = self.data.get(pid, {})
                ig_status = d.get("ig_status", "—")
                nb_vids   = len(d.get("videos") or [])
                status_col = OK if ig_status == "active" else (
                    DANGER if ig_status == "banned" else TEXT2)
                self._dash_kpis["extra1"].config(text=ig_status.capitalize(),
                                                  fg=status_col)
                self._dash_kpis["extra1_lbl"].config(
                    text=("Statut IG" if L == "fr" else "IG Status"))
                self._dash_kpis["extra2"].config(text=str(nb_vids), fg=TEXT2)
                self._dash_kpis["extra2_lbl"].config(
                    text=("Vidéos" if L == "fr" else "Videos"))
        except Exception:
            pass

        # ── Bar chart ─────────────────────────────────────────────────────────
        self._dash_bar_rects = []
        cv.delete("all")
        w = cv.winfo_width() or 800
        h = cv.winfo_height() or 300
        ml, mr, mt, mb = 56, 20, 20, 44
        plot_w = w - ml - mr
        plot_h = h - mt - mb
        if plot_w < 10 or plot_h < 10:
            return

        max_v    = max(values) if values else 1
        chart_max = max_v * 1.12            # 12% headroom
        chart_min = 0
        rng_v    = max(1, chart_max - chart_min)

        n = len(keys)
        # Horizontal grid lines with labels (OnlyFans style: dashed)
        grid_steps = 5
        for i in range(grid_steps + 1):
            gy = mt + i * plot_h / grid_steps
            gv = chart_max - (i * chart_max / grid_steps)
            cv.create_line(ml, gy, w - mr, gy, fill="#2a2f44", dash=(4, 6))
            cv.create_text(ml - 6, gy, anchor="e", text=fmt(int(gv)),
                           fill="#666d85", font=("Segoe UI", 8))

        # Bottom axis line
        cv.create_line(ml, mt + plot_h, w - mr, mt + plot_h,
                       fill="#3a3f55", width=1)

        # Bar width + gap
        total_slots = n
        bar_gap  = max(2, int(plot_w / total_slots * 0.18))
        bar_w    = max(4, int(plot_w / total_slots) - bar_gap)
        today_key = datetime.now().strftime("%Y-%m-%d")

        # Date label step: show every N days to avoid crowding
        step = max(1, n // 14)

        for i, (k, v) in enumerate(zip(keys, values)):
            slot_x = ml + i * plot_w / total_slots
            bx1 = int(slot_x + bar_gap / 2)
            bx2 = int(bx1 + bar_w)
            bar_h_px = int((v - chart_min) / rng_v * plot_h)
            by1 = mt + plot_h - bar_h_px
            by2 = mt + plot_h

            is_today = (k == today_key)
            bar_col  = "#5b7fd4" if not is_today else ACCENT

            # Bar body
            cv.create_rectangle(bx1, by1, bx2, by2,
                                 fill=bar_col, outline="", width=0)
            # Slight highlight on top edge
            cv.create_rectangle(bx1, by1, bx2, by1 + 2,
                                 fill="#8aabef" if not is_today else "#d4f96a",
                                 outline="", width=0)

            prev_val = values[i - 1] if i > 0 else v
            self._dash_bar_rects.append((bx1, bx2, by1, v, k, prev_val))

            # X date labels
            if i % step == 0 or i == n - 1:
                try:
                    d = datetime.strptime(k, "%Y-%m-%d")
                    x_lbl = d.strftime("%-d %b") if hasattr(d, "day") else d.strftime("%d/%m")
                except Exception:
                    x_lbl = k
                cv.create_text((bx1 + bx2) // 2, mt + plot_h + 14,
                               anchor="n", text=x_lbl,
                               fill="#666d85", font=("Segoe UI", 8))

    def _build_phones_tab(self):
        L = self.cfg.get("lang", "fr")
        _ = lambda k: t(k, L)
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["phones"] = f

        self._tab_header(f, "📱",
                         "Téléphones GéeLark" if L == "fr" else "GéeLark Phones",
                         ("Gérez vos cloud phones et comptes Instagram liés"
                          if L == "fr"
                          else "Manage your cloud phones and linked Instagram accounts"),
                         ACCENT)

        # ── Stat cards row ────────────────────────────────────────────────────
        sf = tk.Frame(f, bg=BG)
        sf.pack(fill="x", padx=0, pady=(0, 10))
        card_data = [
            ("phones", "📱", _("card.phones"), ACCENT, "all"),
            ("active", "✅", _("card.active"), OK,     "active"),
            ("banned", "🚫", _("card.banned"), DANGER, "banned"),
            ("views",  "👁", _("card.views"),  WARN,   "views"),
        ]
        for k, ico, lbl, col, filt in card_data:
            card_outer, card = self._round_card(sf, radius=12, bg=CARD,
                                                 border=BORDER, border_w=1,
                                                 hover_border=col)
            card_outer.pack(side="left", fill="both", expand=True, padx=(0, 8))
            card_outer.configure(height=90)
            card_outer.pack_propagate(False)
            tk.Frame(card, height=2, bg=col).pack(fill="x")
            inner = tk.Frame(card, bg=CARD, padx=14, pady=10, cursor="hand2")
            inner.pack(fill="both", expand=True)
            row_top = tk.Frame(inner, bg=CARD)
            row_top.pack(fill="x")
            tk.Label(row_top, text=ico, font=("Segoe UI", 12), bg=CARD, fg=col,
                     cursor="hand2").pack(side="left")
            tk.Label(row_top, text=lbl, font=("Segoe UI", 8, "bold"),
                     bg=CARD, fg=TEXT2, cursor="hand2").pack(side="left", padx=(5, 0))
            v = tk.Label(inner, text="—", font=("Segoe UI", 22, "bold"), bg=CARD, fg=col,
                         cursor="hand2")
            v.pack(anchor="w", pady=(2, 0))
            self.sv[k] = v
            def _card_click(e, f2=filt):
                self._phone_stat_filter = f2
                self._refresh_table()
            for w in [card, inner, row_top, v, card_outer._cv]:
                try: w.bind("<Button-1>", _card_click, add="+")
                except Exception: pass

        # ── Toolbar row 1: filters ─────────────────────────────────────────────
        tb1 = tk.Frame(f, bg=SURFACE2, padx=12, pady=8,
                       highlightthickness=1, highlightbackground=BORDER)
        tb1.pack(fill="x", pady=(0, 2))

        tk.Label(tb1, text="Groupe", font=("Segoe UI", 9),
                 bg=SURFACE2, fg=TEXT2).pack(side="left")
        self.grp_var = tk.StringVar(value="Tous")
        self.grp_combo = ttk.Combobox(tb1, textvariable=self.grp_var,
                                       state="readonly", width=18, font=("Segoe UI", 9))
        self.grp_combo["values"] = ["Tous"]
        self.grp_combo.pack(side="left", padx=(6, 16))
        self.grp_combo.bind("<<ComboboxSelected>>", lambda e: self._refresh_table())

        tk.Label(tb1, text="🔍", font=("Segoe UI", 11),
                 bg=SURFACE2, fg=TEXT2).pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace("w", lambda *a: self._refresh_table())
        tk.Entry(tb1, textvariable=self.search_var, font=("Segoe UI", 10),
                 bg=SURFACE, fg=TEXT, insertbackground=TEXT, relief="flat", bd=0,
                 highlightthickness=1, highlightcolor=ACCENT, highlightbackground=BORDER,
                 width=22).pack(side="left", padx=(4, 0), ipady=5)

        self.sel_lbl = tk.Label(tb1, text="", font=("Segoe UI", 9), bg=SURFACE2, fg=MUTED)
        self.sel_lbl.pack(side="right", padx=6)

        # ── Auto-refresh mini controls ────────────────────────────────────────
        tk.Frame(tb1, bg=BORDER, width=1).pack(side="right", fill="y", padx=(8, 8))
        self._countdown_var = tk.StringVar(value="↻ --:--")
        tk.Label(tb1, textvariable=self._countdown_var,
                 font=("Segoe UI", 9, "bold"), bg=SURFACE2, fg=ACCENT).pack(side="right")
        tk.Label(tb1, text="min", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2).pack(side="right")
        self._auto_interval_var = tk.StringVar(value=str(self.cfg.get("auto_refresh_min", 5)))
        interval_cb = ttk.Combobox(tb1, textvariable=self._auto_interval_var,
                                    values=["1", "2", "5", "10", "30", "60"],
                                    state="readonly", width=3, font=("Segoe UI", 9))
        interval_cb.pack(side="right", padx=(2, 2))
        tk.Label(tb1, text="Auto :", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2).pack(side="right")

        def _on_interval_change(e=None):
            try:
                m = int(self._auto_interval_var.get())
            except ValueError:
                m = 5
            self._set_auto_interval(m)
        interval_cb.bind("<<ComboboxSelected>>", _on_interval_change)

        # Hidden link_var for compatibility
        self.link_var = tk.StringVar()

        # ── Hidden Treeview (data backend only — not displayed) ──────────────
        cols = ("no", "name", "group", "ig", "status", "followers", "views", "vids", "checked", "act")
        self.tree = ttk.Treeview(f, columns=cols, show="headings",
                                  style="T.Treeview", selectmode="extended")
        for col, head, w, anchor in [
            ("no",       "#",          40,  "center"),
            ("name",     "Téléphone",  155, "w"),
            ("group",    "Groupe",     120, "center"),
            ("ig",       "@Instagram", 140, "w"),
            ("status",   "Statut",     100, "center"),
            ("followers","Followers",  90,  "center"),
            ("views",    "Vues",       80,  "center"),
            ("vids",     "Vidéos",     60,  "center"),
            ("checked",  "Vérifié",    90,  "center"),
            ("act",      "  ⋮",        36,  "center"),
        ]:
            self.tree.heading(col, text=head)
            self.tree.column(col, width=w, anchor=anchor, minwidth=w)
        self.tree.tag_configure("active",  foreground=OK)
        self.tree.tag_configure("banned",  foreground=DANGER)
        self.tree.tag_configure("error",   foreground=WARN)
        self.tree.tag_configure("noig",    foreground=MUTED)
        self.tree.tag_configure("odd",     background=SURFACE)
        self.tree.tag_configure("even",    background=CARD)
        # NOT packed — visual canvas replaces it

        # ── Column header bar ─────────────────────────────────────────────────
        _T_BG   = "#0b0e18"
        _T_ODD  = "#0d1117"
        _T_EVEN = "#0b0f1c"
        _T_SEL  = "#162040"
        _T_SEP  = "#1a2235"
        _T_HDR  = "#0b0e18"
        _T_HFGA = "#4f8ef7"
        _T_HFGM = "#2e3d55"
        _T_TEXT = "#c9d1d9"
        _T_MUTE = "#6b7a99"
        _T_ONG  = "#f97316"   # orange profile ID
        _T_BLUE = "#4f8ef7"   # phone icon
        _T_GRN  = "#22c55e"   # android green
        self._p_colors = dict(
            BG=_T_BG, ODD=_T_ODD, EVEN=_T_EVEN, SEL=_T_SEL, SEP=_T_SEP,
            TEXT=_T_TEXT, MUTED=_T_MUTE, ONG=_T_ONG, BLUE=_T_BLUE, GRN=_T_GRN,
        )

        # (key, px_width, anchor, label)
        _COLS = [
            ("no",        40,  "center", "#"),
            ("icon",      44,  "center", ""),
            ("device",   180,  "w",      "Téléphone"),
            ("name",     145,  "w",      "Nom"),
            ("group",    100,  "center", "Groupe"),
            ("ig",       145,  "w",      "@Instagram"),
            ("status",   110,  "center", "Statut"),
            ("followers", 85,  "center", "Followers"),
            ("views",     70,  "center", "Vues"),
            ("vids",      55,  "center", "Vidéos"),
            ("checked",   85,  "center", "Vérifié"),
            ("gl",        44,  "center", ""),
            ("act",       40,  "center", "⋮"),
        ]
        self._p_cols = _COLS

        hdr = tk.Frame(f, bg=_T_HDR, height=34)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        tk.Frame(hdr, bg=_T_SEP, height=1).pack(side="bottom", fill="x")
        for key, w, anc, lbl in _COLS:
            cell = tk.Frame(hdr, bg=_T_HDR, width=w if key not in ("device","name","ig") else w)
            if key in ("device", "name", "ig"):
                cell.pack(side="left", fill="y", expand=(key == "ig"))
            else:
                cell.pack(side="left", fill="y")
                cell.pack_propagate(False)
            fg = _T_HFGA if lbl and lbl not in ("⋮",) else _T_HFGM
            tk.Label(cell, text=lbl, font=("Segoe UI", 8, "bold"),
                     bg=_T_HDR, fg=fg, anchor=anc, padx=4
                     ).pack(fill="both", expand=True)
            if key != "act":
                tk.Frame(hdr, bg=_T_SEP, width=1).pack(side="left", fill="y", pady=6)

        # ── Scrollable rows canvas ────────────────────────────────────────────
        rows_wrap = tk.Frame(f, bg=_T_ODD)
        rows_wrap.pack(fill="both", expand=True)

        _p_vsb = ttk.Scrollbar(rows_wrap, orient="vertical")
        _p_vsb.pack(side="right", fill="y")

        rc = tk.Canvas(rows_wrap, bg=_T_ODD, highlightthickness=0,
                       yscrollcommand=_p_vsb.set)
        rc.pack(side="left", fill="both", expand=True)
        _p_vsb.config(command=rc.yview)

        ri = tk.Frame(rc, bg=_T_ODD)
        rc.create_window((0, 0), window=ri, anchor="nw", tags="inner")
        ri.bind("<Configure>",
                lambda e: rc.configure(scrollregion=rc.bbox("all")))
        # Force ri to always match canvas width so rows fill "x" correctly
        rc.bind("<Configure>",
                lambda e: rc.itemconfig("inner", width=e.width))
        rc.bind("<MouseWheel>",
                lambda e: rc.yview_scroll(int(-1*(e.delta/120)), "units"))

        self._p_rows_inner  = ri
        self._p_rows_canvas = rc
        self._p_row_frames  = {}
        self._p_sel_iid     = [None]

    # ── Visual phone table ────────────────────────────────────────────────────
    def _phones_draw_table(self):
        """Rebuild the custom visual rows from the hidden self.tree data."""
        if not hasattr(self, "_p_rows_inner"):
            return
        c = self._p_colors

        for w in self._p_rows_inner.winfo_children():
            w.destroy()
        self._p_row_frames.clear()

        iids = self.tree.get_children()
        if not iids:
            emp = tk.Frame(self._p_rows_inner, bg=c["ODD"])
            emp.pack(fill="both", expand=True, pady=80)
            tk.Label(emp, text="📱", font=("Segoe UI", 36),
                     bg=c["ODD"], fg="#1a2540").pack()
            tk.Label(emp, text="Aucun téléphone",
                     font=("Segoe UI", 13, "bold"),
                     bg=c["ODD"], fg=c["MUTED"]).pack(pady=(8, 2))
            tk.Label(emp, text="Synchronise tes cloud phones depuis GeeLark",
                     font=("Segoe UI", 9), bg=c["ODD"], fg="#1e2d45").pack()
            return

        sel = self._p_sel_iid[0]

        def _set_bg(widget, bg):
            try: widget.config(bg=bg)
            except Exception: pass
            for ch in widget.winfo_children():
                _set_bg(ch, bg)

        for i, iid in enumerate(iids):
            d      = self.data.get(iid, {})
            vals   = self.tree.item(iid, "values")
            is_sel = (iid == sel)
            base   = c["SEL"] if is_sel else (c["ODD"] if i % 2 == 0 else c["EVEN"])
            has_ig = bool(d.get("ig_username"))

            row = tk.Frame(self._p_rows_inner, bg=base, height=50, cursor="hand2")
            row.pack(fill="x")
            row.pack_propagate(False)
            tk.Frame(row, bg=c["SEP"], height=1).pack(side="bottom", fill="x")

            inner = tk.Frame(row, bg=base)
            inner.pack(fill="both", expand=True)

            def _sep(bg=base):
                tk.Frame(inner, bg=c["SEP"], width=1).pack(
                    side="left", fill="y", pady=5)

            def _cell(w, expand=False, bg=base):
                f2 = tk.Frame(inner, bg=bg, width=w)
                if expand:
                    f2.pack(side="left", fill="both", expand=True)
                else:
                    f2.pack(side="left", fill="y")
                    f2.pack_propagate(False)
                return f2

            def _lbl(parent, text, font=("Segoe UI", 9), fg=None,
                     anchor="center", bg=base, padx=4):
                tk.Label(parent, text=text, font=font,
                         bg=bg, fg=fg or c["TEXT"],
                         anchor=anchor, padx=padx
                         ).pack(fill="both", expand=True)

            # ── # ──────────────────────────────────────────────────────────
            _lbl(_cell(40), str(i + 1), fg=c["MUTED"], font=("Segoe UI", 9))
            _sep()

            # ── Phone icon ─────────────────────────────────────────────────
            ic = _cell(44)
            tk.Label(ic, text="📱", font=("Segoe UI", 15),
                     bg=base, fg=c["BLUE"]).pack(fill="both", expand=True)
            _sep()

            # ── Serial + Profile ID (2 lines) ──────────────────────────────
            dev = _cell(180)
            serial_txt  = str(d.get("serial_no") or (vals[0] if vals else ""))
            pid_txt     = str(d.get("phone_id")  or iid)
            tk.Label(dev, text=serial_txt,
                     font=("Segoe UI", 10, "bold"),
                     bg=base, fg=c["TEXT"] if has_ig else c["MUTED"],
                     anchor="w", padx=6).pack(fill="x", pady=(9, 0))
            tk.Label(dev, text=pid_txt,
                     font=("Consolas", 7),
                     bg=base, fg=c["ONG"] if has_ig else "#2e3d55",
                     anchor="w", padx=6).pack(fill="x", pady=(0, 9))
            _sep()

            # ── Phone name ─────────────────────────────────────────────────
            name_txt = d.get("phone_name") or (vals[1] if vals else "—")
            _lbl(_cell(145), name_txt,
                 fg=c["TEXT"] if has_ig else c["MUTED"],
                 anchor="w", padx=8)
            _sep()

            # ── Groupe ─────────────────────────────────────────────────────
            grp_txt = d.get("group_name") or (vals[2] if vals else "—") or "—"
            _lbl(_cell(100), grp_txt, fg=c["MUTED"], anchor="center")
            _sep()

            # ── @Instagram ─────────────────────────────────────────────────
            ig_u  = d.get("ig_username", "")
            ig_lbl = ("@" + ig_u) if ig_u else "—"
            ig_fg  = c["BLUE"] if ig_u else c["MUTED"]
            _lbl(_cell(145, expand=True), ig_lbl, fg=ig_fg, anchor="w", padx=8)
            _sep()

            # ── Statut ─────────────────────────────────────────────────────
            st     = d.get("ig_status", "")
            st_map = {
                "active":  ("● Actif",   OK),
                "banned":  ("● Banni",   DANGER),
                "private": ("● Privé",   WARN),
                "error":   ("● Erreur",  WARN),
            }
            st_txt2, st_fg = st_map.get(
                st, ("— Sans IG" if not ig_u else "○ Non vérifié", c["MUTED"]))
            _lbl(_cell(110), st_txt2, fg=st_fg, anchor="center")
            _sep()

            # ── Followers ──────────────────────────────────────────────────
            fol = vals[5] if vals else "—"
            _lbl(_cell(85), str(fol), fg=c["TEXT"], anchor="center")
            _sep()

            # ── Vues ───────────────────────────────────────────────────────
            vws = vals[6] if vals else "—"
            _lbl(_cell(70), str(vws), fg=c["TEXT"], anchor="center")
            _sep()

            # ── Vidéos ─────────────────────────────────────────────────────
            vds = vals[7] if vals else "—"
            _lbl(_cell(55), str(vds), fg=c["TEXT"], anchor="center")
            _sep()

            # ── Vérifié ────────────────────────────────────────────────────
            chk = vals[8] if vals else "—"
            _lbl(_cell(85), str(chk), font=("Segoe UI", 8),
                 fg=c["MUTED"], anchor="center")
            _sep()

            # ── GL / Android icon ──────────────────────────────────────────
            gl_ok = d.get("gl_status", 0) == 1
            gl_lbl = tk.Label(_cell(44), text="🤖",
                              font=("Segoe UI", 13),
                              bg=base, fg=c["GRN"] if gl_ok else c["MUTED"])
            gl_lbl.pack(fill="both", expand=True)
            _sep()

            # ── ⋮ ──────────────────────────────────────────────────────────
            dot = tk.Label(_cell(40), text="⋮",
                           font=("Segoe UI", 14, "bold"),
                           bg=base, fg=c["MUTED"], cursor="hand2")
            dot.pack(fill="both", expand=True)

            # ── Bindings ───────────────────────────────────────────────────
            def _click(e, iid2=iid, row2=row, base2=base, hi=has_ig):
                old = self._p_sel_iid[0]
                self._p_sel_iid[0] = iid2
                if old and old in self._p_row_frames:
                    old_i   = list(self.tree.get_children()).index(old)
                    old_bg  = c["ODD"] if old_i % 2 == 0 else c["EVEN"]
                    _set_bg(self._p_row_frames[old], old_bg)
                _set_bg(row2, c["SEL"])
                self.sel_ids = [iid2]
                self.tree.selection_set(iid2)
                self.sel_lbl.config(text="1 sélectionné(s)")
                if hi:
                    self._show_tab("stats")
                    self._show_ig_detail(iid2)

            def _dbl(e, iid2=iid):
                d2 = self.data.get(iid2, {})
                if d2.get("ig_username"):
                    self._show_tab("stats")
                    self._show_ig_detail(iid2)

            def _dots(e, iid2=iid):
                self.sel_ids  = [iid2]
                self._p_sel_iid[0] = iid2
                self.tree.selection_set(iid2)
                self._show_phone_menu(e.x_root, e.y_root)
                return "break"

            def _hover_on(e, row2=row, base2=base, i2=i):
                if self._p_sel_iid[0] != iid:
                    hov = "#131b2e"
                    _set_bg(row2, hov)

            def _hover_off(e, row2=row, base2=base, i2=i):
                if self._p_sel_iid[0] != iid:
                    _set_bg(row2, base2)

            for wgt in [row, inner] + row.winfo_children() + inner.winfo_children():
                try:
                    wgt.bind("<Button-1>",  _click)
                    wgt.bind("<Double-1>",  _dbl)
                    wgt.bind("<Enter>",     _hover_on)
                    wgt.bind("<Leave>",     _hover_off)
                except Exception:
                    pass
            dot.bind("<Button-1>", _dots)

            self._p_row_frames[iid] = row

        self._p_rows_canvas.update_idletasks()
        self._p_rows_canvas.configure(
            scrollregion=self._p_rows_canvas.bbox("all"))

    def _on_sel(self, e):
        self.sel_ids = list(self.tree.selection())
        self.sel_lbl.config(
            text=f"{len(self.sel_ids)} sélectionné(s)" if self.sel_ids else "")

    def _on_dbl(self, e):
        if self.sel_ids:
            d = self.data.get(self.sel_ids[0], {})
            if d.get("ig_username"):
                self._show_tab("stats")
                self._show_ig_detail(self.sel_ids[0])

    def _phone_dot_click(self, event):
        """Show context menu when the ⋮ column is clicked."""
        region = self.tree.identify("region", event.x, event.y)
        col    = self.tree.identify_column(event.x)
        if region == "cell" and col == "#10":  # act column = 10th
            row = self.tree.identify_row(event.y)
            if row:
                self.tree.selection_set(row)
                self._show_phone_menu(event.x_root, event.y_root)

    def _phone_context_menu(self, event):
        """Right-click context menu on treeview."""
        row = self.tree.identify_row(event.y)
        if row:
            if row not in self.tree.selection():
                self.tree.selection_set(row)
            self._show_phone_menu(event.x_root, event.y_root)

    def _show_phone_menu(self, x, y):
        """Popup actions menu for a phone row."""
        pid = self.sel_ids[0] if self.sel_ids else None
        d   = self.data.get(pid, {}) if pid else {}
        ig  = d.get("ig_username", "")

        menu = tk.Menu(self.root, tearoff=0,
                       bg=SURFACE3, fg=TEXT, activebackground=ACCENT,
                       activeforeground="#07080d", relief="flat",
                       font=("Segoe UI", 10), bd=0)

        # Link / Unlink
        def _do_link():
            val = simpledialog.askstring(
                "Lier Instagram", "Entrez le @username Instagram :",
                parent=self.root)
            if val:
                self.link_var.set(val.strip().lstrip("@"))
                self._link()

        menu.add_command(label="  🔗  Lier Instagram…",    command=_do_link)
        menu.add_command(label="  ✂️  Délier Instagram",   command=self._unlink)
        menu.add_separator()
        menu.add_command(label="  📊  Scraper les stats",
                         command=lambda: threading.Thread(
                             target=self._scrape_sel, daemon=True).start())
        menu.add_command(label="  🔑  Identifiants",       command=self._show_credentials_dialog)
        menu.add_separator()
        if ig:
            menu.add_command(label=f"  📈  Voir stats @{ig}",
                             command=lambda: (self._show_tab("stats"),
                                             self._show_ig_detail(pid)))
        menu.add_separator()
        menu.add_command(label="  🗑  Supprimer ce téléphone",
                         foreground=DANGER, activebackground=DANGER,
                         activeforeground="#07080d",
                         command=self._delete_selected)
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def _delete_selected(self):
        if not self.sel_ids:
            return
        if messagebox.askyesno("Supprimer",
                               f"Supprimer {len(self.sel_ids)} téléphone(s) ?"):
            for pid in self.sel_ids:
                self.data.pop(pid, None)
            save_data(self.data)
            self._refresh_table()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET STATS — Interface redesignée
    # ══════════════════════════════════════════════════════════════════════════
    def _build_stats_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["stats"] = f

        # ── Left sidebar: account cards ───────────────────────────────────────
        left = tk.Frame(f, bg=SURFACE, width=240)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)
        tk.Frame(left, height=2, bg=OK).pack(fill="x")

        # Header
        lhdr = tk.Frame(left, bg=SURFACE)
        lhdr.pack(fill="x", padx=12, pady=(10, 6))
        tk.Label(lhdr, text="COMPTES LIÉS", font=("Segoe UI", 8, "bold"),
                 bg=SURFACE, fg=TEXT2).pack(side="left")
        self._st_count_lbl = tk.Label(lhdr, text="", font=("Segoe UI", 8),
                                       bg=SURFACE, fg=MUTED)
        self._st_count_lbl.pack(side="right")

        # Scrollable account list
        acct_canvas = tk.Canvas(left, bg=SURFACE, highlightthickness=0)
        acct_sb = ttk.Scrollbar(left, orient="vertical", command=acct_canvas.yview)
        acct_canvas.configure(yscrollcommand=acct_sb.set)
        acct_canvas.pack(side="left", fill="both", expand=True)
        acct_sb.pack(side="right", fill="y")
        self._st_acct_inner = tk.Frame(acct_canvas, bg=SURFACE)
        acct_canvas.create_window((0, 0), window=self._st_acct_inner, anchor="nw")
        def _acct_conf(e=None):
            acct_canvas.configure(scrollregion=acct_canvas.bbox("all"))
        self._st_acct_inner.bind("<Configure>", _acct_conf)
        self._st_acct_canvas = acct_canvas
        self._st_selected_pid = [None]

        # ── Right detail panel ────────────────────────────────────────────────
        right = tk.Frame(f, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        # Profile header card (rounded, with Reel preview on the right)
        prof_outer, prof_inner_card = self._round_card(right, radius=14, bg=CARD,
                                                        border=BORDER, border_w=1)
        prof_outer.pack(fill="x", padx=(10, 0), pady=(0, 8))
        prof_outer.configure(height=200)
        prof_outer.pack_propagate(False)
        tk.Frame(prof_inner_card, height=2, bg=OK).pack(fill="x")
        prof_inner = tk.Frame(prof_inner_card, bg=CARD)
        prof_inner.pack(fill="both", expand=True, padx=18, pady=14)

        # Avatar canvas (circular) - bigger for premium feel
        self._st_avatar_canvas = tk.Canvas(prof_inner, bg=CARD, highlightthickness=0,
                                            width=72, height=72)
        self._st_avatar_canvas.pack(side="left", padx=(0, 16))
        self._st_avatar_img_ref = None

        # Name + bio column
        name_col = tk.Frame(prof_inner, bg=CARD)
        name_col.pack(side="left", fill="both", expand=True)
        name_row = tk.Frame(name_col, bg=CARD)
        name_row.pack(fill="x")
        self.det_name = tk.Label(name_row, text="Sélectionne un compte →",
                                  font=("Segoe UI", 16, "bold"), bg=CARD, fg=TEXT)
        self.det_name.pack(side="left")
        self.det_status = tk.Label(name_row, text="",
                                    font=("Segoe UI", 9, "bold"), bg=CARD, fg=TEXT2,
                                    padx=8, pady=3)
        self.det_status.pack(side="left", padx=(10, 0))
        self._st_fullname_lbl = tk.Label(name_col, text="",
                                          font=("Segoe UI", 11), bg=CARD, fg=TEXT2)
        self._st_fullname_lbl.pack(anchor="w", pady=(2, 0))
        self._st_bio_lbl = tk.Label(name_col, text="",
                                     font=("Segoe UI", 9), bg=CARD, fg=MUTED,
                                     wraplength=320, justify="left")
        self._st_bio_lbl.pack(anchor="w", pady=(4, 0))

        # KPI row
        kf = tk.Frame(right, bg=BG)
        kf.pack(fill="x", padx=(10, 0), pady=(0, 8))
        self.kpis = {}
        for k, icon, lbl, col in [
            ("followers", "👥", "FOLLOWERS", ACCENT),
            ("following", "➡", "FOLLOWING", TEXT2),
            ("posts",     "📸", "POSTS",     OK),
            ("views",     "👁", "VUES TOTAL", WARN),
        ]:
            kc_outer, ki = self._round_card(kf, radius=12, bg=CARD,
                                             border=BORDER, border_w=1)
            kc_outer.pack(side="left", fill="both", expand=True, padx=(0, 6))
            kc_outer.configure(height=78)
            kc_outer.pack_propagate(False)
            tk.Frame(ki, height=2, bg=col).pack(fill="x")
            kp = tk.Frame(ki, bg=CARD, padx=12, pady=8)
            kp.pack(fill="both", expand=True)
            top_row = tk.Frame(kp, bg=CARD)
            top_row.pack(fill="x")
            tk.Label(top_row, text=icon, font=("Segoe UI", 14),
                     bg=CARD, fg=col).pack(side="left", padx=(0, 6))
            v = tk.Label(top_row, text="—", font=("Segoe UI", 18, "bold"), bg=CARD, fg=col)
            v.pack(side="left")
            self.kpis[k] = v
            tk.Label(kp, text=lbl, font=("Segoe UI", 7, "bold"),
                     bg=CARD, fg=TEXT2).pack(anchor="w", pady=(2, 0))

        # Sort / filter bar
        vfbar = tk.Frame(right, bg=BG)
        vfbar.pack(fill="x", padx=(10, 0), pady=(0, 6))
        self._st_vid_count_lbl = tk.Label(vfbar, text="VIDÉOS",
                                           font=("Segoe UI", 9, "bold"),
                                           bg=BG, fg=TEXT2)
        self._st_vid_count_lbl.pack(side="left")
        tk.Label(vfbar, text="Trier :", font=("Segoe UI", 9),
                 bg=BG, fg=TEXT2).pack(side="left", padx=(14, 4))
        self._vid_sort_var = tk.StringVar(value="Plus récent")
        sort_opts = [("recent", "Plus récent"), ("old", "Plus ancien"),
                     ("views_desc", "+ de vues"), ("views_asc", "- de vues"),
                     ("likes_desc", "+ de likes")]
        self._vid_sort_keys = {lbl: key for key, lbl in sort_opts}
        sort_cb = ttk.Combobox(vfbar, textvariable=self._vid_sort_var,
                               state="readonly", width=14, font=("Segoe UI", 9))
        sort_cb["values"] = [lbl for _, lbl in sort_opts]
        sort_cb.pack(side="left")
        sort_cb.bind("<<ComboboxSelected>>", lambda e: self._refresh_vid_cards())

        # Video cards scrollable area
        vid_outer = tk.Frame(right, bg=BG)
        vid_outer.pack(fill="both", expand=True, padx=(10, 0))
        self._st_vid_canvas = tk.Canvas(vid_outer, bg=BG, highlightthickness=0)
        vid_sb = ttk.Scrollbar(vid_outer, orient="vertical",
                                command=self._st_vid_canvas.yview)
        self._st_vid_canvas.configure(yscrollcommand=vid_sb.set)
        self._st_vid_canvas.pack(side="left", fill="both", expand=True)
        vid_sb.pack(side="right", fill="y")
        self._st_vid_inner = tk.Frame(self._st_vid_canvas, bg=BG)
        self._st_vid_inner_id = self._st_vid_canvas.create_window(
            (0, 0), window=self._st_vid_inner, anchor="nw")
        def _vid_conf(e=None):
            self._st_vid_canvas.configure(
                scrollregion=self._st_vid_canvas.bbox("all"))
        def _vid_canvas_conf(e=None):
            # Match inner frame width to canvas width so cards fill horizontally
            self._st_vid_canvas.itemconfig(
                self._st_vid_inner_id, width=self._st_vid_canvas.winfo_width())
        self._st_vid_inner.bind("<Configure>", _vid_conf)
        self._st_vid_canvas.bind("<Configure>", _vid_canvas_conf)
        self._current_vid_pid = [None]

        # Placeholder label
        self._st_placeholder = tk.Label(self._st_vid_inner,
                                         text="← Sélectionne un compte pour voir ses vidéos",
                                         font=("Segoe UI", 11), bg=BG, fg=MUTED)
        self._st_placeholder.pack(pady=40)

    def _render_reel_preview(self, top_video, ig_username):
        """Draw an Instagram-Reel-style mockup on _st_reel_canvas."""
        cv = getattr(self, "_st_reel_canvas", None)
        if not cv or not cv.winfo_exists():
            return
        cv.delete("all")
        W, H = 98, 170
        r = 14  # rounded radius

        # Phone frame (rounded rectangle) - dark frame
        # Outer black
        cv.create_polygon([
            r, 0, W-r, 0, W, 0, W, r,
            W, H-r, W, H, W-r, H,
            r, H, 0, H, 0, H-r,
            0, r, 0, 0,
        ], smooth=True, splinesteps=24, fill="#000", outline=BORDER, width=1)

        # Screen area inset
        sx, sy = 4, 4
        sw, sh = W - 8, H - 8

        # Background gradient (using rectangles to fake gradient)
        if top_video:
            # Use a tinted gradient based on view popularity
            views = top_video.get("views", 0)
            if views > 5000:
                grad_top, grad_bot = "#7e22ce", "#dc2626"  # purple → red
            elif views > 1000:
                grad_top, grad_bot = "#1e40af", "#7c3aed"  # blue → purple
            else:
                grad_top, grad_bot = "#374151", "#111827"  # gray
        else:
            grad_top, grad_bot = "#1f2937", "#111827"

        # Fake gradient
        for i in range(20):
            t = i / 19
            try:
                rr = int(int(grad_top[1:3], 16) * (1 - t) + int(grad_bot[1:3], 16) * t)
                gg = int(int(grad_top[3:5], 16) * (1 - t) + int(grad_bot[3:5], 16) * t)
                bb = int(int(grad_top[5:7], 16) * (1 - t) + int(grad_bot[5:7], 16) * t)
                col = f"#{rr:02x}{gg:02x}{bb:02x}"
            except Exception:
                col = grad_top
            y0 = sy + i * sh / 20
            y1 = sy + (i + 1) * sh / 20
            cv.create_rectangle(sx, y0, sx + sw, y1, fill=col, outline="")

        # ▶ Play icon center (subtle)
        cx, cy = W // 2, H // 2 - 8
        cv.create_polygon(cx - 7, cy - 9, cx - 7, cy + 9, cx + 9, cy,
                          fill="#ffffff", outline="", smooth=False)
        # Halo
        cv.create_oval(cx - 16, cy - 16, cx + 16, cy + 16,
                        outline="#ffffff66", width=2)

        if not top_video:
            cv.create_text(W // 2, H // 2 + 22, text="Aucun reel",
                            fill="#ffffffaa", font=("Segoe UI", 8))
            return

        # Top: @username chip
        uname = ig_username[:11] if ig_username else "user"
        cv.create_text(sx + 6, sy + 8, anchor="w",
                        text=f"@{uname}", fill="#ffffff",
                        font=("Segoe UI", 8, "bold"))
        # Online dot
        cv.create_oval(sx + 4, sy + 5, sx + 10, sy + 11, fill=ACCENT, outline="")

        # Right side: vertical stack of IG-style icons + counts
        ix = sx + sw - 14
        iy = sh - 14
        for emoji, val in [
            ("♥", fmt(top_video.get("likes", 0))),
            ("✎", fmt(top_video.get("comments", 0))),
            ("↗", fmt(top_video.get("shares", 0))),
        ]:
            cv.create_text(ix, iy, text=emoji, fill="#ffffff",
                            font=("Segoe UI", 12, "bold"), anchor="center")
            cv.create_text(ix, iy + 11, text=val, fill="#ffffff",
                            font=("Segoe UI", 6, "bold"), anchor="center")
            iy -= 26

        # Bottom: views + caption
        v = fmt(top_video.get("views", 0))
        cv.create_text(sx + 6, sh - 18, anchor="w",
                        text=f"▶ {v}", fill="#ffffff",
                        font=("Segoe UI", 9, "bold"))

        cap = (top_video.get("caption", "") or "")[:14]
        if cap:
            cv.create_text(sx + 6, sh - 8, anchor="w",
                            text=cap + ("…" if len(top_video.get("caption", "")) > 14 else ""),
                            fill="#ffffffcc", font=("Segoe UI", 7))

        # Save URL for click
        sc = top_video.get("id", "")
        if sc:
            self._st_reel_url[0] = f"https://www.instagram.com/reel/{sc}/"
        else:
            self._st_reel_url[0] = None

    def _stats_make_avatar(self, letter, color, size=54):
        """Return a circular PIL ImageTk with the given letter."""
        if not PIL_OK:
            return None
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.ellipse([0, 0, size - 1, size - 1], fill=color)
        # Draw letter
        try:
            font = ImageFont.truetype("arial.ttf", size // 2)
        except Exception:
            font = ImageFont.load_default()
        bb = draw.textbbox((0, 0), letter, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        draw.text(((size - tw) / 2 - bb[0], (size - th) / 2 - bb[1]),
                  letter, fill="#07080d", font=font)
        return ImageTk.PhotoImage(img)

    def _stats_avatar_color(self, text):
        """Deterministic color from text hash."""
        palette = [ACCENT, OK, WARN, "#4f9eff", "#a56ef5", "#ff6ec7", "#00e5d4", "#2dde78"]
        return palette[hash(text) % len(palette)]

    def _refresh_ig_list(self):
        for w in self._st_acct_inner.winfo_children():
            w.destroy()
        accounts = [(pid, d) for pid, d in self.data.items()
                    if d.get("ig_username")]
        self._st_count_lbl.config(text=f"{len(accounts)} comptes")
        for pid, d in accounts:
            ig   = d.get("ig_username", "")
            fn   = d.get("full_name", "")
            st   = d.get("ig_status", "")
            fol  = d.get("followers", 0)
            st_map = {"active": ("✅ Actif", OK), "banned": ("❌ Banni", DANGER),
                      "private": ("🔒 Privé", WARN), "error": ("⚠ Erreur", DANGER)}
            st_text, st_col = st_map.get(st, ("—", MUTED))
            col  = self._stats_avatar_color(ig)
            letter = (ig[0] if ig else "?").upper()

            card = tk.Frame(self._st_acct_inner, bg=SURFACE2,
                            highlightthickness=1, highlightbackground=BORDER,
                            cursor="hand2")
            card.pack(fill="x", padx=6, pady=3)

            inner = tk.Frame(card, bg=SURFACE2)
            inner.pack(fill="x", padx=10, pady=8)

            # Small avatar
            av_cv = tk.Canvas(inner, bg=SURFACE2, highlightthickness=0,
                               width=38, height=38)
            av_cv.pack(side="left", padx=(0, 10))
            av_img = self._stats_make_avatar(letter, col, size=38)
            if av_img:
                av_cv.create_image(19, 19, image=av_img)
                av_cv._img_ref = av_img

            txt_col = tk.Frame(inner, bg=SURFACE2)
            txt_col.pack(side="left", fill="x", expand=True)
            tk.Label(txt_col, text=f"@{ig}", font=("Segoe UI", 10, "bold"),
                     bg=SURFACE2, fg=TEXT, anchor="w").pack(anchor="w")
            if fn:
                tk.Label(txt_col, text=fn, font=("Segoe UI", 8),
                         bg=SURFACE2, fg=TEXT2, anchor="w").pack(anchor="w")
            bot_row = tk.Frame(txt_col, bg=SURFACE2)
            bot_row.pack(fill="x")
            tk.Label(bot_row, text=f"👥 {fmt(fol)}", font=("Segoe UI", 8),
                     bg=SURFACE2, fg=TEXT2).pack(side="left")
            tk.Label(bot_row, text=st_text, font=("Segoe UI", 7, "bold"),
                     bg=SURFACE2, fg=st_col).pack(side="right")

            # Hover + click
            def _hover_in(e, c=card): c.config(highlightbackground=ACCENT)
            def _hover_out(e, c=card): c.config(highlightbackground=BORDER)
            def _click(e, p=pid): self._show_ig_detail(p)
            for w in [card, inner, av_cv, txt_col, bot_row] + list(inner.winfo_children()) + list(txt_col.winfo_children()) + list(bot_row.winfo_children()):
                try:
                    w.bind("<Enter>", _hover_in)
                    w.bind("<Leave>", _hover_out)
                    w.bind("<Button-1>", _click)
                except Exception:
                    pass

        self._st_acct_canvas.configure(
            scrollregion=self._st_acct_canvas.bbox("all"))

    def _on_ig_list_sel(self):
        pass  # kept for compatibility; selection now via card click

    def _show_ig_detail(self, pid):
        d = self.data.get(pid, {})
        st   = d.get("ig_status", "")
        fn   = d.get("full_name", "")
        ig   = d.get("ig_username", "")
        bio  = d.get("bio", "")

        # Avatar (centered in 72x72 canvas)
        col    = self._stats_avatar_color(ig)
        letter = (ig[0] if ig else "?").upper()
        av_img = self._stats_make_avatar(letter, col, size=64)
        self._st_avatar_canvas.delete("all")
        if av_img:
            self._st_avatar_canvas.create_image(36, 36, image=av_img)
            self._st_avatar_img_ref = av_img

        # Name / status
        self.det_name.config(text=f"@{ig}")
        self._st_fullname_lbl.config(text=fn)
        self._st_bio_lbl.config(text=bio[:120] if bio else "")
        st_map = {"active": ("✅ Actif", OK), "banned": ("❌ Banni", DANGER),
                  "private": ("🔒 Privé", WARN), "error": ("⚠ Erreur", WARN)}
        st_text, st_col = st_map.get(st, ("—", MUTED))
        self.det_status.config(text=st_text, fg="#07080d", bg=st_col)

        # KPIs
        videos = d.get("videos", [])
        total_views = sum(v.get("views", 0) for v in videos)
        self.kpis["followers"].config(text=fmt(d.get("followers", 0)))
        self.kpis["following"].config(text=fmt(d.get("following", 0)))
        self.kpis["posts"].config(text=str(d.get("posts_count", 0)))
        self.kpis["views"].config(text=fmt(total_views))

        self._current_vid_pid[0] = pid
        self._refresh_vid_cards()

    def _refresh_vid_cards(self):
        pid = self._current_vid_pid[0] if hasattr(self, '_current_vid_pid') else None
        # Clear existing cards
        for w in self._st_vid_inner.winfo_children():
            w.destroy()
        if not pid:
            tk.Label(self._st_vid_inner,
                     text="← Sélectionne un compte pour voir ses vidéos",
                     font=("Segoe UI", 11), bg=BG, fg=MUTED).pack(pady=40)
            return

        d = self.data.get(pid, {})
        videos = list(d.get("videos", []))
        sort_lbl = self._vid_sort_var.get()
        sort_key = self._vid_sort_keys.get(sort_lbl, "recent")
        if sort_key == "old":
            videos = list(reversed(videos))
        elif sort_key == "views_desc":
            videos.sort(key=lambda v: v.get("views", 0), reverse=True)
        elif sort_key == "views_asc":
            videos.sort(key=lambda v: v.get("views", 0))
        elif sort_key == "likes_desc":
            videos.sort(key=lambda v: v.get("likes", 0), reverse=True)

        count = len(videos)
        self._st_vid_count_lbl.config(
            text=f"VIDÉOS  ·  {count} reels")

        if not videos:
            tk.Label(self._st_vid_inner, text="Aucune vidéo enregistrée",
                     font=("Segoe UI", 11), bg=BG, fg=MUTED).pack(pady=40)
            return

        # Max views for relative bar scaling
        max_views = max((v.get("views", 0) for v in videos), default=1) or 1

        # 2-column card grid (like banque tab)
        grid = tk.Frame(self._st_vid_inner, bg=BG)
        grid.pack(fill="both", expand=True, padx=2, pady=2)
        COLS = 2
        for c in range(COLS):
            grid.columnconfigure(c, weight=1, uniform="vidcol")

        for i, vid in enumerate(videos):
            r, c = divmod(i, COLS)
            sc       = vid.get("id", "")
            views    = vid.get("views", 0)
            likes    = vid.get("likes", 0)
            comments = vid.get("comments", 0)
            shares   = vid.get("shares", 0)
            caption  = vid.get("caption", "")
            url      = f"https://www.instagram.com/reel/{sc}/"
            ratio    = views / max_views
            # Color tier per popularity
            if ratio > 0.7:
                tier_top, tier_bot = "#7e22ce", "#dc2626"  # purple → red (top)
                accent_c = ACCENT
            elif ratio > 0.3:
                tier_top, tier_bot = "#1e40af", "#7c3aed"  # blue → purple (mid)
                accent_c = OK
            else:
                tier_top, tier_bot = "#374151", "#111827"  # gray
                accent_c = TEXT2

            # Rounded card
            card_outer, card = self._round_card(grid, radius=12, bg=CARD,
                                                 border=BORDER, border_w=1,
                                                 hover_border=accent_c)
            card_outer.grid(row=r, column=c, padx=4, pady=4, sticky="nsew")
            card_outer.configure(height=210)
            card_outer.pack_propagate(False)

            # ── Top: thumbnail banner ─────────────────────────────────────────
            thumb_url = vid.get("thumbnail_url", "")
            banner = tk.Canvas(card, bg="#111", height=90,
                                highlightthickness=0)
            banner.pack(fill="x")
            banner._img_ref = None  # prevent GC

            def _load_thumb(cv=banner, s=sc, tu=thumb_url,
                            top=tier_top, bot=tier_bot, ac=accent_c):
                """Try to load IG CDN thumbnail, fall back to gradient."""
                img_pil = None
                if PIL_OK:
                    candidates = []
                    if tu:
                        candidates.append(tu)
                    if s:
                        # Public CDN proxy fallbacks
                        candidates.append(f"https://www.instagram.com/p/{s}/media/?size=l")
                        candidates.append(f"https://www.instagram.com/p/{s}/media/?size=m")
                    headers = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                                       " AppleWebKit/537.36 (KHTML, like Gecko)"
                                       " Chrome/120.0 Safari/537.36",
                    }
                    for url in candidates:
                        try:
                            import urllib.request
                            req = urllib.request.Request(url, headers=headers)
                            with urllib.request.urlopen(req, timeout=6) as resp:
                                data = resp.read()
                            from io import BytesIO
                            img_pil = Image.open(BytesIO(data)).convert("RGB")
                            if img_pil.size[0] >= 100:
                                break
                            img_pil = None
                        except Exception:
                            continue

                def _apply(img=img_pil):
                    if not cv.winfo_exists():
                        return
                    w = cv.winfo_width() or 200
                    h = 90
                    cv.delete("all")
                    if img and PIL_OK:
                        # Crop to 16:9-ish, fill width
                        iw, ih = img.size
                        target_ratio = w / h
                        src_ratio = iw / ih
                        if src_ratio > target_ratio:
                            new_w = int(ih * target_ratio)
                            left = (iw - new_w) // 2
                            img_c = img.crop((left, 0, left + new_w, ih))
                        else:
                            new_h = int(iw / target_ratio)
                            top_c = (ih - new_h) // 2
                            img_c = img.crop((0, top_c, iw, top_c + new_h))
                        img_r = img_c.resize((w, h), Image.LANCZOS)
                        # Dark overlay for readability
                        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 90))
                        img_rgba = img_r.convert("RGBA")
                        img_final = Image.alpha_composite(img_rgba, overlay).convert("RGB")
                        photo = ImageTk.PhotoImage(img_final)
                        cv._img_ref = photo
                        cv.create_image(0, 0, anchor="nw", image=photo)
                    else:
                        # Aesthetic gradient fallback: diagonal blend + glow + grid
                        for k in range(40):
                            t = k / 39
                            try:
                                rr = int(int(top[1:3], 16)*(1-t) + int(bot[1:3], 16)*t)
                                gg = int(int(top[3:5], 16)*(1-t) + int(bot[3:5], 16)*t)
                                bb = int(int(top[5:7], 16)*(1-t) + int(bot[5:7], 16)*t)
                                col = f"#{rr:02x}{gg:02x}{bb:02x}"
                            except Exception:
                                col = top
                            cv.create_rectangle(0, k*h/40, w, (k+1)*h/40,
                                                 fill=col, outline="")
                        # Soft radial-ish glow at center
                        for rad in range(50, 8, -8):
                            cv.create_oval(w//2 - rad, h//2 - rad,
                                            w//2 + rad, h//2 + rad,
                                            outline="#ffffff14", width=1)
                        # Subtle grid lines for "video frame" feel
                        for gx in range(0, w, 24):
                            cv.create_line(gx, 0, gx, h, fill="#ffffff08")
                    # Play circle overlay
                    cx, cy = w // 2, h // 2
                    cv.create_oval(cx-18, cy-18, cx+18, cy+18,
                                    outline="#ffffff88", width=2)
                    cv.create_polygon(cx-6, cy-9, cx-6, cy+9, cx+9, cy,
                                       fill="#ffffff", outline="")
                    # REEL chip
                    cv.create_rectangle(w-56, 6, w-6, 22,
                                         fill="#00000099", outline="")
                    cv.create_text(w-31, 14, text="REEL", fill="#ffffff",
                                    font=("Consolas", 7, "bold"))

                try:
                    cv.after(0, _apply)
                except Exception:
                    pass

            # Draw gradient immediately, load thumb async
            def _init_banner(cv=banner, fn=_load_thumb):
                cv.after(10, lambda: threading.Thread(target=fn, daemon=True).start())
            banner.bind("<Configure>", lambda e, fn=_init_banner: fn() if not getattr(banner, '_loaded', False) else None)
            banner._loaded = False

            # ── Body: stats ──────────────────────────────────────────────────
            body = tk.Frame(card, bg=CARD, padx=14, pady=10)
            body.pack(fill="both", expand=True)

            # Hero: views
            hero = tk.Frame(body, bg=CARD)
            hero.pack(fill="x")
            tk.Label(hero, text="▶", font=("Segoe UI", 18, "bold"),
                     bg=CARD, fg=accent_c).pack(side="left")
            tk.Label(hero, text=fmt(views),
                     font=("Segoe UI", 20, "bold"),
                     bg=CARD, fg=TEXT).pack(side="left", padx=(6, 4))
            tk.Label(hero, text="vues", font=("Segoe UI", 9),
                     bg=CARD, fg=TEXT2).pack(side="left", pady=(8, 0))

            # Progress bar (relative)
            bar_bg = tk.Frame(body, bg=SURFACE3, height=3)
            bar_bg.pack(fill="x", pady=(6, 8))
            bar_bg.pack_propagate(False)
            tk.Frame(bar_bg, bg=accent_c, height=3).place(
                relx=0, rely=0, relwidth=max(ratio, 0.02), relheight=1)

            # Stats row (♥ ✎ ↗) - white icons
            stats = tk.Frame(body, bg=CARD)
            stats.pack(fill="x")
            for icon, val in [
                ("♥", fmt(likes)),
                ("✎", fmt(comments)),
                ("↗", fmt(shares)),
            ]:
                chunk = tk.Frame(stats, bg=CARD)
                chunk.pack(side="left", padx=(0, 14))
                tk.Label(chunk, text=icon, font=("Segoe UI", 12, "bold"),
                         bg=CARD, fg=TEXT).pack(side="left")
                tk.Label(chunk, text=val, font=("Segoe UI", 10, "bold"),
                         bg=CARD, fg=TEXT).pack(side="left", padx=(3, 0))

            # Caption
            if caption:
                cap_text = caption[:60].replace("\n", " ")
                if len(caption) > 60:
                    cap_text += "…"
                tk.Label(body, text=cap_text, font=("Segoe UI", 8),
                         bg=CARD, fg=TEXT2, wraplength=240, justify="left",
                         anchor="w").pack(fill="x", pady=(6, 0))

            # Click → open reel
            def _open(e=None, u=url):
                import webbrowser
                webbrowser.open(u)
            for w in [card, banner, body, hero, stats] + list(stats.winfo_children()) + list(hero.winfo_children()):
                try:
                    w.bind("<Button-1>", _open, add="+")
                    w.config(cursor="hand2")
                except Exception:
                    pass
            try:
                card_outer._cv.bind("<Button-1>", _open, add="+")
                card_outer._cv.config(cursor="hand2")
            except Exception:
                pass

        self._st_vid_canvas.configure(
            scrollregion=self._st_vid_canvas.bbox("all"))

    def _refresh_vid_tree(self):
        self._refresh_vid_cards()

    def _on_vid_tree_sel(self, e=None):
        pass

    # ══════════════════════════════════════════════════════════════════════════
    # HELPERS ACCORDION + PANNEAU SCROLLABLE
    # ══════════════════════════════════════════════════════════════════════════
    def _collapsible(self, parent, title, open_by_default=True):
        """Crée une section accordion. Retourne le frame content."""
        wrap = tk.Frame(parent, bg=BG)
        wrap.pack(fill="x", pady=(0, 6))

        hdr = tk.Frame(wrap, bg=HL, cursor="hand2")
        hdr.pack(fill="x")

        arrow = tk.Label(hdr, text="▼" if open_by_default else "▶",
                         font=("Segoe UI", 8), bg=HL, fg=ACCENT)
        arrow.pack(side="left", padx=(10, 4), pady=6)
        tk.Label(hdr, text=title, font=("Consolas", 8, "bold"),
                 bg=HL, fg=TEXT2).pack(side="left", pady=6)

        content = tk.Frame(wrap, bg=CARD, padx=14, pady=10)
        state = [open_by_default]

        def toggle(e=None):
            state[0] = not state[0]
            if state[0]:
                content.pack(fill="x")
                arrow.config(text="▼")
            else:
                content.pack_forget()
                arrow.config(text="▶")

        for w in (hdr, arrow) + tuple(hdr.winfo_children()):
            w.bind("<Button-1>", toggle)
        hdr.bind("<Button-1>", toggle)

        if open_by_default:
            content.pack(fill="x")
        return content

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET AUTOMATISATION
    # ══════════════════════════════════════════════════════════════════════════
    def _build_automation_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["automation"] = f

        # ── Panneau gauche scrollable ────────────────────────────────────────
        left_wrap = tk.Frame(f, bg=BG, width=400)
        left_wrap.pack(side="left", fill="y")
        left_wrap.pack_propagate(False)

        left_canvas = tk.Canvas(left_wrap, bg=BG, highlightthickness=0, width=400)
        left_scroll = ttk.Scrollbar(left_wrap, orient="vertical",
                                     command=left_canvas.yview)
        left_canvas.configure(yscrollcommand=left_scroll.set)
        left_scroll.pack(side="right", fill="y")
        left_canvas.pack(side="left", fill="both", expand=True)
        left = tk.Frame(left_canvas, bg=BG)
        left_canvas.create_window((0, 0), window=left, anchor="nw", width=385)
        left.bind("<Configure>", lambda e: left_canvas.configure(
            scrollregion=left_canvas.bbox("all")))
        def _lc_scroll(e): left_canvas.yview_scroll(int(-1*(e.delta/120)), "units")
        left_canvas.bind("<MouseWheel>", _lc_scroll)
        # Deferred recursive bind so all children exist
        self.root.after(200, lambda: self._bind_mousewheel(left, left_canvas))

        tk.Label(left, text="🎬  Montage", font=("Segoe UI", 13, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w", padx=2, pady=(8, 2))
        tk.Label(left, text="Composition automatique de vidéos", font=("Segoe UI", 9),
                 bg=BG, fg=TEXT2).pack(anchor="w", padx=2, pady=(0, 8))

        # ── Section 1 : Vidéos source ────────────────────────────────────────
        vs = self._collapsible(left, "VIDÉOS SOURCE", open_by_default=True)
        vtop = tk.Frame(vs, bg=CARD)
        vtop.pack(fill="x", pady=(0, 8))
        def _add_videos_choice():
            top = tk.Toplevel(self.root)
            top.title("Ajouter des vidéos")
            top.resizable(False, False)
            top.configure(bg=SURFACE)
            top.geometry("280x120")
            top.grab_set()
            tk.Label(top, text="Choisir la source", font=("Segoe UI", 10, "bold"),
                     bg=SURFACE, fg=TEXT).pack(pady=(16, 10))
            btn_row2 = tk.Frame(top, bg=SURFACE)
            btn_row2.pack()
            def _from_bank():
                top.destroy()
                self._open_bank_picker(lambda paths: [
                    setattr(self, '_video_paths', list(dict.fromkeys(self._video_paths + list(paths)))),
                    self._rebuild_video_grid(),
                    self._select_video(0) if self._video_paths else None
                ], multi=True)
            def _from_pc():
                top.destroy()
                self._add_videos()
            tk.Button(btn_row2, text="📦  Depuis la banque", font=("Segoe UI", 9, "bold"),
                      bg=ACCENT, fg="#ffffff", relief="flat", cursor="hand2",
                      padx=14, pady=8, activebackground=ACCENT2,
                      command=_from_bank).pack(side="left", padx=(0, 8))
            tk.Button(btn_row2, text="💾  Depuis le PC", font=("Segoe UI", 9, "bold"),
                      bg=SURFACE2, fg=TEXT, relief="flat", cursor="hand2",
                      padx=14, pady=8, activebackground=SURFACE3,
                      command=_from_pc).pack(side="left")
        self._mk_btn(vtop, "+ Ajouter vidéos", "primary", _add_videos_choice,
                     pady=5).pack(side="left")
        self._mk_btn(vtop, "Vider", "danger", self._clear_videos,
                     pady=5).pack(side="left", padx=(6, 0))

        self.vgrid_canvas = tk.Canvas(vs, bg=SURFACE, highlightthickness=0, height=118)
        self.vgrid_canvas.pack(fill="x")
        vgrid_scroll = ttk.Scrollbar(vs, orient="horizontal",
                                      command=self.vgrid_canvas.xview)
        vgrid_scroll.pack(fill="x")
        self.vgrid_canvas.configure(xscrollcommand=vgrid_scroll.set)
        self.vgrid_inner = tk.Frame(self.vgrid_canvas, bg=SURFACE)
        self.vgrid_canvas.create_window((0, 0), window=self.vgrid_inner, anchor="nw")
        self.vgrid_inner.bind("<Configure>", lambda e: self.vgrid_canvas.configure(
            scrollregion=self.vgrid_canvas.bbox("all")))

        def _vgrid_wheel(e):
            self.vgrid_canvas.xview_scroll(int(-1*(e.delta/120)), "units")
        self.vgrid_canvas.bind("<MouseWheel>", _vgrid_wheel)
        self.vgrid_inner.bind("<MouseWheel>", _vgrid_wheel)

        # Drop zone label
        if DND_OK:
            self.vgrid_canvas.drop_target_register(DND_FILES)
            self.vgrid_canvas.dnd_bind("<<Drop>>", self._on_video_drop)
        dz_hint = "Ctrl+clic pour multi-sélection · Glisse depuis l'explorateur"
        if not DND_OK:
            dz_hint = "Ctrl+clic pour multi-sélection dans l'explorateur"
        tk.Label(vs, text=dz_hint,
                 font=("Segoe UI", 7), bg=CARD, fg=MUTED).pack(anchor="w", pady=(4, 0))

        self.video_path_var = tk.StringVar()
        self.path_lbl = tk.Label(vs, text="Aucune vidéo sélectionnée",
                                  font=("Segoe UI", 9), bg=CARD, fg=MUTED, anchor="w")
        self.path_lbl.pack(fill="x", pady=(2, 0))

        # ── Section 2 : Texte overlay ────────────────────────────────────────
        oc = self._collapsible(left, "TEXTE SUR LA VIDÉO", open_by_default=True)
        self.overlay_text_widget = tk.Text(
            oc, font=("Segoe UI", 12), bg=SURFACE2, fg=TEXT,
            insertbackground=TEXT, relief="flat", bd=0, height=3,
            highlightthickness=1, highlightcolor=ACCENT,
            highlightbackground=BORDER, wrap="word", padx=8, pady=6)
        self.overlay_text_widget.pack(fill="x")
        self.overlay_text_widget.bind("<<Modified>>", self._on_overlay_modified)
        self.overlay_var = tk.StringVar()  # kept for compat with preset system
        tk.Label(oc, text="Maj+Entrée pour retour à la ligne",
                 font=("Segoe UI", 7), bg=CARD, fg=MUTED).pack(anchor="w", pady=(3, 0))

        # ── Section 3 : Ajustements ──────────────────────────────────────────
        sc = self._collapsible(left, "AJUSTEMENTS", open_by_default=True)
        self.fontsize_var = tk.DoubleVar(value=52)
        self.pos_x_var    = tk.DoubleVar(value=50)
        self.pos_y_var    = tk.DoubleVar(value=78)
        self.speed_var    = tk.DoubleVar(value=1.0)
        self.wrap_var     = tk.DoubleVar(value=80)  # % de largeur image

        def make_slider(parent, label, var, lo, hi, decimals=0, suffix=""):
            row = tk.Frame(parent, bg=CARD)
            row.pack(fill="x", pady=3)
            tk.Label(row, text=label, font=("Segoe UI", 9), bg=CARD,
                     fg=TEXT2, width=14, anchor="w").pack(side="left")
            fmt_fn = ((lambda v: f"{int(v)}{suffix}") if decimals == 0
                      else (lambda v: f"{v:.{decimals}f}{suffix}"))
            val_lbl = tk.Label(row, text=fmt_fn(var.get()),
                               font=("Consolas", 10, "bold"), bg=CARD, fg=ACCENT, width=7)
            val_lbl.pack(side="right")
            entry_var = tk.StringVar(value=f"{var.get():.{decimals}f}")
            entry = tk.Entry(row, textvariable=entry_var, font=("Consolas", 10),
                             bg=SURFACE2, fg=ACCENT, insertbackground=ACCENT,
                             relief="flat", bd=0, highlightthickness=1,
                             highlightcolor=ACCENT, highlightbackground=BORDER,
                             width=6, justify="center")
            entry.pack(side="right", padx=(0, 4), ipady=3)
            c = tk.Canvas(row, bg=SURFACE2, height=22, highlightthickness=0, cursor="hand2")
            c.pack(side="left", fill="x", expand=True, padx=(4, 6))

            def draw(val=None):
                if val is None:
                    val = var.get()
                w = c.winfo_width() or 160
                c.delete("all")
                ratio = max(0, min(1, (val-lo)/(hi-lo) if hi!=lo else 0))
                fx = 8 + ratio*(w-16)
                c.create_rectangle(8, 10, w-8, 13, fill=SURFACE, outline="")
                if fx > 8:
                    c.create_rectangle(8, 10, fx, 13, fill=ACCENT, outline="")
                c.create_oval(fx-7, 4, fx+7, 18, fill=BG, outline=ACCENT, width=2)
                c.create_oval(fx-3, 8, fx+3, 14, fill=ACCENT, outline="")

            def on_drag(e):
                w = c.winfo_width()
                ratio = max(0, min(1, (e.x-8)/(w-16)))
                val = lo + ratio*(hi-lo)
                val = round(val, decimals) if decimals > 0 else int(val)
                var.set(val)
            c.bind("<Button-1>", on_drag)
            c.bind("<B1-Motion>", on_drag)
            c.bind("<Configure>", lambda e: draw())

            def on_var(*a):
                v = var.get()
                draw(v)
                val_lbl.config(text=fmt_fn(v))
                entry_var.set(f"{v:.{decimals}f}")
                if not self._is_dragging:
                    self._schedule_preview()
            var.trace("w", on_var)

            def on_entry(e=None):
                try:
                    v = float(entry_var.get())
                    v = max(lo, min(hi, round(v, decimals) if decimals > 0 else int(v)))
                    var.set(v)
                except:
                    pass
            entry.bind("<Return>", on_entry)
            entry.bind("<FocusOut>", on_entry)
            sc.after(80, draw)

        make_slider(sc, "Taille texte",  self.fontsize_var, 16,  120, suffix="px")
        make_slider(sc, "Largeur texte", self.wrap_var,     20,  100, suffix="%")
        make_slider(sc, "Position X",    self.pos_x_var,    0,   100, suffix="%")
        make_slider(sc, "Position Y",    self.pos_y_var,    0,   100, suffix="%")
        make_slider(sc, "Vitesse",       self.speed_var,    1.0, 1.1, decimals=3, suffix="x")

        # ── Section 4 : Grading couleur ──────────────────────────────────────
        gc = self._collapsible(left, "GRADING COULEUR", open_by_default=False)
        self.brightness_var = tk.DoubleVar(value=0.0)
        self.contrast_var   = tk.DoubleVar(value=1.0)
        self.saturation_var = tk.DoubleVar(value=1.0)
        make_slider(gc, "Luminosité",   self.brightness_var, -1.0, 1.0, decimals=2)
        make_slider(gc, "Contraste",    self.contrast_var,    0.0, 3.0, decimals=2)
        make_slider(gc, "Saturation",   self.saturation_var,  0.0, 3.0, decimals=2)
        tk.Button(gc, text="Réinitialiser", font=("Segoe UI", 8),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=6, pady=3,
                  command=lambda: [self.brightness_var.set(0.0),
                                   self.contrast_var.set(1.0),
                                   self.saturation_var.set(1.0)]).pack(anchor="e", pady=(4, 0))

        # ── Section 5 : Préréglages ──────────────────────────────────────────
        pc = self._collapsible(left, "PRÉRÉGLAGES", open_by_default=False)
        save_row = tk.Frame(pc, bg=CARD)
        save_row.pack(fill="x", pady=(0, 4))
        self.preset_name_var = tk.StringVar()
        tk.Entry(save_row, textvariable=self.preset_name_var,
                 font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT,
                 insertbackground=TEXT, relief="flat", bd=0,
                 highlightthickness=1, highlightcolor=ACCENT,
                 highlightbackground=BORDER).pack(side="left", fill="x", expand=True, ipady=5)
        tk.Button(save_row, text="💾 Sauvegarder", font=("Segoe UI", 9, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2", padx=8,
                  command=self._save_preset).pack(side="right", padx=(6, 0))
        load_row = tk.Frame(pc, bg=CARD)
        load_row.pack(fill="x")
        self.preset_combo_var = tk.StringVar()
        self.preset_combo = ttk.Combobox(load_row, textvariable=self.preset_combo_var,
                                          state="readonly", font=("Segoe UI", 10), width=16)
        self.preset_combo.pack(side="left", fill="x", expand=True)
        tk.Button(load_row, text="Charger", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=ACCENT, relief="flat", cursor="hand2", padx=8,
                  command=self._load_preset).pack(side="right", padx=(4, 0))
        tk.Button(load_row, text="✕", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=DANGER, relief="flat", cursor="hand2", padx=6,
                  command=self._delete_preset).pack(side="right", padx=(4, 0))
        self._refresh_preset_combo()

        # ── Boutons export ───────────────────────────────────────────────────
        btn_area = tk.Frame(left, bg=BG)
        btn_area.pack(fill="x", pady=(4, 8), padx=2)

        self.process_btn = self._mk_btn(
            btn_area, "✂  Traiter & Exporter la vidéo sélectionnée",
            "primary", font=("Segoe UI", 11, "bold"), pady=12,
            cmd=lambda: threading.Thread(target=self._process_video, daemon=True).start())
        self.process_btn.pack(fill="x", pady=(0, 5))
        self._bind_hover(self.process_btn, ACCENT, ACCENT2, "#06080f", "#06080f")

        self._mk_btn(btn_area, "⚡  Exporter toutes les vidéos en parallèle",
                     "secondary", font=("Segoe UI", 10, "bold"), pady=10,
                     cmd=lambda: threading.Thread(
                         target=self._batch_export, daemon=True).start()
                     ).pack(fill="x", pady=(0, 5))

        self.process_status = tk.Label(btn_area, text="", font=("Segoe UI", 9),
                                        bg=BG, fg=TEXT2, wraplength=380)
        self.process_status.pack(fill="x")

        self._mk_btn(btn_area, "🚀  Poster sur les téléphones",
                     "ok", self._open_post_window, pady=9
                     ).pack(fill="x", pady=(5, 0))

        # Compatible caption_text (banque)
        self.caption_text = tk.Text(btn_area, height=1)
        self.caption_text.pack_forget()

        # ── Panneau droit : aperçu + timeline ────────────────────────────────
        right = tk.Frame(f, bg=CARD)
        right.pack(side="left", fill="both", expand=True, padx=(10, 0))

        # Header
        prh = tk.Frame(right, bg=CARD)
        prh.pack(fill="x", padx=14, pady=(12, 6))
        tk.Label(prh, text="APERÇU EN DIRECT", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(side="left")
        self._tl_time_lbl = tk.Label(prh, text="0:00 / 0:00",
                                       font=("Consolas", 9, "bold"),
                                       bg=CARD, fg=ACCENT)
        self._tl_time_lbl.pack(side="right")

        # Preview canvas (fills available space)
        self.preview_canvas = tk.Canvas(right, bg="#000", highlightthickness=0)
        self.preview_canvas.pack(fill="both", expand=True, padx=14, pady=(0, 4))
        self.preview_canvas.bind("<Button-1>",        self._preview_click)
        self.preview_canvas.bind("<B1-Motion>",       self._preview_drag)
        self.preview_canvas.bind("<ButtonRelease-1>", self._preview_release)
        self.preview_img_ref = None
        tk.Label(right, text="✦ Glisse le texte sur l'aperçu · Snap au centre (±3%)",
                 font=("Segoe UI", 8), bg=CARD, fg=MUTED).pack(pady=(0, 4))

        # ── Timeline ─────────────────────────────────────────────────────────
        tl_wrap = tk.Frame(right, bg=CARD)
        tl_wrap.pack(fill="x", padx=14, pady=(2, 4))

        tl_hdr = tk.Frame(tl_wrap, bg=CARD)
        tl_hdr.pack(fill="x", pady=(0, 4))
        tk.Label(tl_hdr, text="TIMELINE", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(side="left")
        self._tl_cut_lbl = tk.Label(tl_hdr, text="",
                                      font=("Segoe UI", 8), bg=CARD, fg=TEXT2)
        self._tl_cut_lbl.pack(side="left", padx=(10, 0))

        # Play / Rogner buttons
        self._tl_playing = [False]
        self._tl_play_after = [None]
        self._tl_play_btn = self._mk_btn(tl_hdr, "▶  Lecture", "primary",
                                          lambda: self._tl_toggle_play(),
                                          font=("Segoe UI", 8, "bold"), pady=2)
        self._tl_play_btn.pack(side="left", padx=(10, 4))

        self._mk_btn(tl_hdr, "✂ Rogner ici →", "ok",
                     lambda: self._tl_set_cut("start"),
                     font=("Segoe UI", 8), pady=2).pack(side="right", padx=(4, 0))
        self._mk_btn(tl_hdr, "← Rogner ici ✂", "danger",
                     lambda: self._tl_set_cut("end"),
                     font=("Segoe UI", 8), pady=2).pack(side="right", padx=(4, 0))
        self._mk_btn(tl_hdr, "↺", "ghost",
                     lambda: self._tl_reset_cut(),
                     font=("Segoe UI", 8), pady=2).pack(side="right")

        self._tl_canvas = tk.Canvas(tl_wrap, bg=SURFACE, highlightthickness=1,
                                     highlightbackground=BORDER, height=72)
        self._tl_canvas.pack(fill="x")
        self._tl_canvas.bind("<Configure>", lambda e: self._tl_redraw())
        self._tl_canvas.bind("<Button-1>",  self._tl_click)
        self._tl_canvas.bind("<B1-Motion>", self._tl_drag)
        self._tl_canvas.bind("<ButtonRelease-1>", self._tl_release)
        self._tl_canvas.bind("<Button-3>", self._tl_right_click)
        self._tl_drag_target = [None]   # 'playhead' | 'start' | 'end' | None

        # Init state
        self._tl_duration = 0.0
        self._tl_playhead_t = 2.0
        self._tl_cut_start = 0.0
        self._tl_cut_end = 0.0
        self._tl_thumbs_pil = []

        # ── Info bar (rounded card with video stats) ────────────────────────
        info_outer, info_card = self._round_card(right, radius=10, bg=SURFACE2,
                                                   border=BORDER, border_w=1)
        info_outer.pack(fill="x", padx=14, pady=(4, 4))
        info_outer.configure(height=68)
        info_outer.pack_propagate(False)

        info_inner = tk.Frame(info_card, bg=SURFACE2, padx=14, pady=8)
        info_inner.pack(fill="both", expand=True)

        # Stat chips for: filename, duration, resolution, size
        self._auto_info_chips = {}
        chip_data = [
            ("file", "🎬", "—",     ACCENT),
            ("dur",  "⏱", "—",     OK),
            ("res",  "📐", "—",     WARN),
            ("size", "💾", "—",     TEXT2),
            ("cut",  "✂",  "Aucune coupe", DANGER),
        ]
        for k, icon, val, col in chip_data:
            chip = tk.Frame(info_inner, bg=SURFACE2)
            chip.pack(side="left", padx=(0, 18))
            tk.Label(chip, text=icon, font=("Segoe UI", 13, "bold"),
                     bg=SURFACE2, fg=col).pack(side="left")
            v = tk.Label(chip, text=val, font=("Segoe UI", 9, "bold"),
                          bg=SURFACE2, fg=TEXT)
            v.pack(side="left", padx=(4, 0))
            self._auto_info_chips[k] = v

        # ── Progress bar card ─────────────────────────────────────────────────
        auto_prog_outer, auto_prog_card = self._round_card(right, radius=10,
                                                            bg=SURFACE2, border=BORDER)
        auto_prog_outer.pack(fill="x", padx=14, pady=(0, 6))
        auto_prog_outer.configure(height=72)
        auto_prog_outer.pack_propagate(False)
        ap_inner = tk.Frame(auto_prog_card, bg=SURFACE2, padx=12, pady=8)
        ap_inner.pack(fill="both", expand=True)

        ap_top = tk.Frame(ap_inner, bg=SURFACE2)
        ap_top.pack(fill="x")
        self._auto_step_lbl = tk.Label(ap_top, text="En attente",
                                        font=("Segoe UI", 9, "bold"),
                                        bg=SURFACE2, fg=TEXT)
        self._auto_step_lbl.pack(side="left")
        self._auto_pct_lbl = tk.Label(ap_top, text="",
                                       font=("Consolas", 9, "bold"),
                                       bg=SURFACE2, fg=ACCENT)
        self._auto_pct_lbl.pack(side="right")

        ap_bar_bg = tk.Frame(ap_inner, bg=SURFACE3, height=6)
        ap_bar_bg.pack(fill="x", pady=(6, 0))
        ap_bar_bg.pack_propagate(False)
        self._auto_prog_bar = tk.Canvas(ap_bar_bg, bg=SURFACE3, height=6,
                                         highlightthickness=0)
        self._auto_prog_bar.pack(fill="both", expand=True)
        self._auto_prog_pct = [0]
        self._auto_prog_target = [0]

        def _auto_animate_bar():
            cur = self._auto_prog_pct[0]
            tgt = self._auto_prog_target[0]
            if cur < tgt:
                cur = min(tgt, cur + max(1, (tgt - cur) // 5))
                self._auto_prog_pct[0] = cur
            w = self._auto_prog_bar.winfo_width() or 300
            self._auto_prog_bar.delete("all")
            if cur > 0:
                fw = max(6, int(w * cur / 100))
                col = OK if cur >= 100 else ACCENT
                self._auto_prog_bar.create_rectangle(0, 0, fw, 6, fill=col, outline="")
                self._auto_prog_bar.create_rectangle(0, 0, fw, 2, fill="#ffffff22", outline="")
            self.root.after(30, _auto_animate_bar)
        self.root.after(120, _auto_animate_bar)

        def _auto_set_progress(pct, step, detail=""):
            self._auto_prog_target[0] = pct
            col = OK if pct >= 100 else (DANGER if "❌" in step else ACCENT)
            self._auto_step_lbl.config(text=step, fg=TEXT)
            self._auto_pct_lbl.config(text=f"{pct}%" if pct > 0 else "", fg=col)
        self._auto_set_progress = _auto_set_progress

        # ── Compact collapsible log ──────────────────────────────────────────
        log_row = tk.Frame(right, bg=CARD)
        log_row.pack(fill="x", padx=14, pady=(0, 10))
        self._auto_log_visible = [False]
        log_btn = tk.Label(log_row, text="▶  Journal détaillé",
                            font=("Segoe UI", 8), bg=CARD, fg=TEXT2,
                            cursor="hand2")
        log_btn.pack(side="left", anchor="w")

        self.auto_log = scrolledtext.ScrolledText(right, bg=SURFACE, fg=TEXT2,
                                                   font=("Consolas", 8), relief="flat",
                                                   state="disabled", wrap="word", height=4)

        def _toggle_log(_e=None):
            if self._auto_log_visible[0]:
                self.auto_log.pack_forget()
                log_btn.config(text="▶  Journal détaillé")
                self._auto_log_visible[0] = False
            else:
                self.auto_log.pack(fill="x", padx=14, pady=(0, 10))
                log_btn.config(text="▼  Journal détaillé")
                self._auto_log_visible[0] = True
        log_btn.bind("<Button-1>", _toggle_log)

    # ── Timeline interactions ───────────────────────────────────────────────
    def _tl_pos_to_time(self, x):
        w = self._tl_canvas.winfo_width() or 600
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            return 0.0
        return max(0.0, min(dur, x / w * dur))

    def _tl_click(self, e):
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            return
        w = self._tl_canvas.winfo_width() or 600
        cs = getattr(self, "_tl_cut_start", 0.0)
        ce = getattr(self, "_tl_cut_end", dur)
        x_cs = int(cs / dur * w)
        x_ce = int(ce / dur * w)
        # Decide which marker is closest (within 12px)
        if abs(e.x - x_cs) < 12:
            self._tl_drag_target[0] = "start"
        elif abs(e.x - x_ce) < 12:
            self._tl_drag_target[0] = "end"
        else:
            self._tl_drag_target[0] = "playhead"
            self._tl_playhead_t = self._tl_pos_to_time(e.x)
            self._tl_redraw()
            self._tl_seek_preview()

    def _tl_drag(self, e):
        target = self._tl_drag_target[0]
        if not target:
            return
        t = self._tl_pos_to_time(e.x)
        if target == "playhead":
            self._tl_playhead_t = t
        elif target == "start":
            self._tl_cut_start = min(t, self._tl_cut_end - 0.1)
        elif target == "end":
            self._tl_cut_end = max(t, self._tl_cut_start + 0.1)
        self._tl_update_labels()
        self._tl_redraw()
        if target == "playhead":
            self._tl_seek_preview()

    def _tl_release(self, e):
        if self._tl_drag_target[0] in ("start", "end"):
            # Move playhead to that cut point for visual feedback
            if self._tl_drag_target[0] == "start":
                self._tl_playhead_t = self._tl_cut_start
            else:
                self._tl_playhead_t = self._tl_cut_end
            self._tl_seek_preview()
        self._tl_drag_target[0] = None

    def _tl_seek_preview(self):
        """Debounced preview update at the new playhead position."""
        if hasattr(self, "_tl_seek_after") and self._tl_seek_after:
            try: self.root.after_cancel(self._tl_seek_after)
            except Exception: pass
        self._tl_seek_after = self.root.after(150, self._tl_do_seek)

    def _tl_do_seek(self, fast=False):
        src = self.video_path_var.get()
        if not src or not Path(src).exists():
            return
        if not PIL_OK:
            return
        seek = getattr(self, "_tl_playhead_t", 0)

        # Fast path: cached frame
        cached = self._tl_frame_for_time(seek)
        if cached:
            try:
                img = Image.open(cached).convert("RGB")
                self._cached_pil_frame = img
                self.root.after(0, lambda: self._redraw_overlay_fast(glowing=False))
                self.root.after(0, self._tl_update_labels)
                return
            except Exception:
                pass

        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return
        frame = BASE_DIR / "_seek.jpg"
        try:
            cmd = [ffmpeg, "-y", "-ss", f"{seek:.2f}", "-i", src,
                   "-frames:v", "1", "-q:v", "4"]
            if getattr(self, "_tl_playing", [False])[0]:
                cmd += ["-vf", "scale=540:-2"]
            cmd.append(str(frame))
            subprocess.run(cmd, capture_output=True, timeout=5)
            if frame.exists():
                img = Image.open(frame).convert("RGB")
                self._cached_pil_frame = img
                self.root.after(0, lambda: self._redraw_overlay_fast(glowing=False))
        except Exception:
            pass
        self.root.after(0, self._tl_update_labels)

    def _tl_toggle_play(self):
        """Toggle play/pause for timeline preview."""
        if self._tl_playing[0]:
            self._tl_stop_play()
        else:
            self._tl_start_play()

    def _tl_start_play(self):
        if not self.video_path_var.get() or not getattr(self, "_tl_duration", 0):
            return
        self._tl_playing[0] = True
        try:
            self._tl_play_btn.config(text="⏸  Pause")
        except Exception:
            pass
        self._tl_play_step()

    def _tl_stop_play(self):
        self._tl_playing[0] = False
        try:
            self._tl_play_btn.config(text="▶  Lecture")
        except Exception:
            pass
        if self._tl_play_after[0] is not None:
            try: self.root.after_cancel(self._tl_play_after[0])
            except Exception: pass
            self._tl_play_after[0] = None

    def _tl_play_step(self):
        """Advance playhead at ~15fps using pre-extracted frames when available."""
        if not self._tl_playing[0]:
            return
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            self._tl_stop_play()
            return
        ce = getattr(self, "_tl_cut_end", dur) or dur
        cs = getattr(self, "_tl_cut_start", 0.0)
        cur = getattr(self, "_tl_playhead_t", 0.0)

        frames_ready = getattr(self, "_tl_frames_ready", False)
        step = (1.0 / self.TL_FPS) if frames_ready else 0.25
        interval_ms = int(1000 / self.TL_FPS) if frames_ready else 0

        if cur >= ce - step or cur < cs:
            cur = cs
        cur += step
        if cur >= ce:
            cur = cs
        self._tl_playhead_t = cur
        self._tl_redraw()
        self._tl_update_labels()

        if frames_ready:
            # Fast path: load cached frame and schedule next step at fixed interval
            frame_path = self._tl_frame_for_time(cur)
            if frame_path and frame_path.exists():
                try:
                    img = Image.open(frame_path).convert("RGB")
                    self._cached_pil_frame = img
                    self._redraw_overlay_fast(glowing=False)
                except Exception:
                    pass
            self._tl_play_after[0] = self.root.after(interval_ms, self._tl_play_step)
        else:
            # Slow path: spawn ffmpeg in background; schedule next step when done
            def _extract_and_advance():
                self._tl_do_seek()
                if self._tl_playing[0]:
                    self._tl_play_after[0] = self.root.after(0, self._tl_play_step)
            threading.Thread(target=_extract_and_advance, daemon=True).start()

    def _tl_set_cut(self, side):
        ph = getattr(self, "_tl_playhead_t", 0)
        if side == "start":
            self._tl_cut_start = min(ph, self._tl_cut_end - 0.1)
        else:
            self._tl_cut_end = max(ph, self._tl_cut_start + 0.1)
        self._tl_update_labels()
        self._tl_redraw()

    def _tl_reset_cut(self):
        self._tl_cut_start = 0.0
        self._tl_cut_end = getattr(self, "_tl_duration", 0.0)
        self._tl_update_labels()
        self._tl_redraw()

    def _tl_right_click(self, event):
        """Right-click on timeline: context menu to delete cut region or reset."""
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            return
        cs = getattr(self, "_tl_cut_start", 0.0)
        ce = getattr(self, "_tl_cut_end", dur)
        click_t = self._tl_pos_to_time(event.x)
        has_cut = cs > 0.05 or ce < dur - 0.05

        menu = tk.Menu(self.root, tearoff=0, bg=SURFACE2, fg=TEXT,
                       activebackground=ACCENT, activeforeground="#06080f",
                       relief="flat", bd=1)

        def _fmt(t):
            return f"{int(t)//60}:{int(t)%60:02d}"

        if has_cut and cs <= click_t <= ce:
            menu.add_command(
                label=f"  ✂  Supprimer ce segment  ({_fmt(cs)}–{_fmt(ce)})",
                command=self._tl_reset_cut)
            menu.add_separator()

        menu.add_command(label="  ✂ Rogner ici → (début)",
                         command=lambda: self._tl_set_cut_at(click_t, "start"))
        menu.add_command(label="  ← Rogner ici ✂ (fin)",
                         command=lambda: self._tl_set_cut_at(click_t, "end"))
        if has_cut:
            menu.add_separator()
            menu.add_command(label="  ↺  Réinitialiser la découpe",
                             command=self._tl_reset_cut)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _tl_set_cut_at(self, t, side):
        if side == "start":
            self._tl_cut_start = min(t, self._tl_cut_end - 0.1)
        else:
            self._tl_cut_end = max(t, self._tl_cut_start + 0.1)
        self._tl_playhead_t = t
        self._tl_update_labels()
        self._tl_redraw()

    def _tl_update_labels(self):
        def _fmt(t):
            t = max(0, t)
            return f"{int(t)//60}:{int(t)%60:02d}"
        dur = getattr(self, "_tl_duration", 0.0)
        ph  = getattr(self, "_tl_playhead_t", 0.0)
        try:
            self._tl_time_lbl.config(text=f"{_fmt(ph)} / {_fmt(dur)}")
        except Exception:
            pass
        cs = getattr(self, "_tl_cut_start", 0.0)
        ce = getattr(self, "_tl_cut_end", dur)
        try:
            if abs(cs) < 0.01 and abs(ce - dur) < 0.01:
                self._tl_cut_lbl.config(text="(pas de découpe)")
            else:
                self._tl_cut_lbl.config(
                    text=f"Cut : {_fmt(cs)} → {_fmt(ce)}  ({_fmt(ce - cs)})")
        except Exception:
            pass
        # Sync info chip
        try:
            chips = getattr(self, "_auto_info_chips", {})
            if "cut" in chips:
                if dur and (cs > 0.05 or (ce > 0 and ce < dur - 0.05)):
                    chips["cut"].config(
                        text=f"{_fmt(cs)}→{_fmt(ce)}", fg=DANGER)
                else:
                    chips["cut"].config(text="Aucune coupe", fg=TEXT2)
        except Exception:
            pass

    def _preview_click(self, e):
        self._is_dragging = True

    def _preview_drag(self, e):
        cw = self.preview_canvas.winfo_width() or 400
        ch = self.preview_canvas.winfo_height() or 500
        ox, oy = self._preview_img_offset
        iw, ih = self._preview_img_size
        rx = (e.x - ox) / iw if iw else e.x / cw
        ry = (e.y - oy) / ih if ih else e.y / ch
        px = max(0.0, min(100.0, round(rx * 100, 1)))
        py = max(0.0, min(100.0, round(ry * 100, 1)))
        # Magnetic snap to center
        SNAP = 3.0
        if abs(px - 50.0) < SNAP: px = 50.0
        if abs(py - 50.0) < SNAP: py = 50.0
        self.pos_x_var.set(px)
        self.pos_y_var.set(py)
        self._redraw_overlay_fast(glowing=True)

    def _preview_release(self, e):
        self._is_dragging = False
        self._redraw_overlay_fast(glowing=False)

    def _get_overlay_text(self):
        try:
            return self.overlay_text_widget.get("1.0", "end-1c")
        except:
            return self.overlay_var.get()

    def _on_overlay_modified(self, e=None):
        try:
            self.overlay_text_widget.edit_modified(False)
        except:
            pass
        if not self._is_dragging:
            self._schedule_preview()

    def _on_video_drop(self, e):
        raw = e.data
        # tkinterdnd2 wraps paths with spaces in {}
        paths = re.findall(r'\{([^}]+)\}|(\S+)', raw)
        exts = {'.mp4', '.mov', '.avi', '.mkv', '.webm'}
        for a, b in paths:
            p = a or b
            if p and Path(p).suffix.lower() in exts and p not in self._video_paths:
                self._video_paths.append(p)
        self._rebuild_video_grid()
        if self._video_paths and not self.video_path_var.get():
            self._select_video(0)

    def _redraw_overlay_fast(self, glowing=False):
        """Re-composite text on the cached PIL frame — no ffmpeg, instant."""
        if not PIL_OK or self._cached_pil_frame is None:
            return
        try:
            base = self._cached_pil_frame.copy()
            w, h = base.size

            # Apply color grading live
            b = getattr(self, 'brightness_var', None)
            c_var = getattr(self, 'contrast_var', None)
            s_var = getattr(self, 'saturation_var', None)
            if b:
                bv = b.get()
                if abs(bv) > 0.01:
                    factor = 1.0 + bv
                    base = ImageEnhance.Brightness(base).enhance(max(0, factor))
            if c_var:
                cv = c_var.get()
                if abs(cv - 1.0) > 0.01:
                    base = ImageEnhance.Contrast(base).enhance(max(0, cv))
            if s_var:
                sv = s_var.get()
                if abs(sv - 1.0) > 0.01:
                    base = ImageEnhance.Color(base).enhance(max(0, sv))
            txt = self._get_overlay_text()
            if txt:
                draw = ImageDraw.Draw(base)
                fs = max(10, int(self.fontsize_var.get() * w / 1080))
                try:
                    font = ImageFont.truetype("arial.ttf", fs)
                except:
                    font = ImageFont.load_default()
                px_pct = self.pos_x_var.get() / 100
                py_pct = self.pos_y_var.get() / 100
                wrap_w = int(w * (self.wrap_var.get() / 100))
                # Wrap text manually for multi-line
                lines = []
                for raw_line in txt.split("\n"):
                    if not raw_line.strip():
                        lines.append("")
                        continue
                    # Wrap each paragraph
                    words = raw_line.split()
                    cur = ""
                    for word in words:
                        test = (cur + " " + word).strip()
                        bb_t = draw.textbbox((0, 0), test, font=font)
                        if bb_t[2] - bb_t[0] > wrap_w and cur:
                            lines.append(cur)
                            cur = word
                        else:
                            cur = test
                    if cur:
                        lines.append(cur)
                # Measure total block
                line_h = fs + max(4, fs // 8)
                block_h = len(lines) * line_h
                block_w = max((draw.textbbox((0,0), l, font=font)[2] for l in lines if l), default=0)
                bx = int((w - block_w) * px_pct)
                by = int((h - block_h) * py_pct)
                for i, line in enumerate(lines):
                    if not line:
                        continue
                    lx, ly = bx, by + i * line_h
                    for dx, dy in [(-2,-2),(2,-2),(-2,2),(2,2),(0,2),(0,-2),(2,0),(-2,0)]:
                        draw.text((lx+dx, ly+dy), line, font=font, fill=(0,0,0,200))
                    if glowing:
                        for r in range(6, 0, -2):
                            for dx2, dy2 in [(-r,0),(r,0),(0,-r),(0,r),(-r,-r),(r,-r),(-r,r),(r,r)]:
                                draw.text((lx+dx2, ly+dy2), line, font=font,
                                          fill=(212,245,60, int(80/r)))
                    fill_col = ACCENT if glowing else "white"
                    draw.text((lx, ly), line, font=font, fill=fill_col)

            cw = self.preview_canvas.winfo_width() or 400
            ch = self.preview_canvas.winfo_height() or 500
            base.thumbnail((cw, ch), Image.LANCZOS)
            bw, bh = base.size
            self._preview_img_size = (bw, bh)
            self._preview_img_offset = ((cw - bw) // 2, (ch - bh) // 2)
            photo = ImageTk.PhotoImage(base)
            self.preview_canvas.delete("all")
            self.preview_canvas.create_image(cw//2, ch//2, anchor="center", image=photo)
            self.preview_img_ref = photo

            px_val = self.pos_x_var.get()
            py_val = self.pos_y_var.get()
            ox, oy = self._preview_img_offset
            iw2, ih2 = self._preview_img_size
            if abs(px_val - 50) < 5:
                cx = ox + iw2 // 2
                self.preview_canvas.create_line(cx, oy, cx, oy+ih2,
                    fill=ACCENT, width=1, dash=(4,4), tags="guide")
            if abs(py_val - 50) < 5:
                cy = oy + ih2 // 2
                self.preview_canvas.create_line(ox, cy, ox+iw2, cy,
                    fill=ACCENT, width=1, dash=(4,4), tags="guide")
        except Exception as ex:
            print(f"Overlay fast: {ex}")

    def _alog(self, msg, level="info"):
        colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
        self.auto_log.config(state="normal")
        self.auto_log.insert("end", f"{msg}\n", level)
        self.auto_log.tag_config(level, foreground=colors.get(level, TEXT2))
        self.auto_log.see("end")
        self.auto_log.config(state="disabled")
        # Mirror important messages to progress label
        fn = getattr(self, "_auto_set_progress", None)
        if fn:
            if level == "ok" and "✅" in msg:
                fn(100, msg[:60], "")
            elif level == "error":
                fn(0, msg[:60], "")
            elif level == "accent":
                fn(50, msg[:60], "")

    def _add_videos(self):
        paths = filedialog.askopenfilenames(
            title="Sélectionne des vidéos",
            filetypes=[("Vidéos", "*.mp4 *.mov *.avi *.mkv *.webm"), ("Tous", "*.*")])
        if not paths:
            return
        for p in paths:
            if p not in self._video_paths:
                self._video_paths.append(p)
        self._rebuild_video_grid()
        if self._video_paths:
            self._select_video(0)

    def _clear_videos(self):
        self._video_paths.clear()
        self._active_video_idx = 0
        self.video_path_var.set("")
        self.path_lbl.config(text="Aucune vidéo sélectionnée", fg=MUTED)
        for w in self.vgrid_inner.winfo_children():
            w.destroy()
        self._cached_pil_frame = None

    def _select_video(self, idx):
        if idx < 0 or idx >= len(self._video_paths):
            return
        self._active_video_idx = idx
        path = self._video_paths[idx]
        self.video_path_var.set(path)
        self.path_lbl.config(text=Path(path).name, fg=TEXT)
        self.output_video_path = None
        self.process_status.config(text="")
        self._cached_pil_frame = None
        self._schedule_preview()
        self._highlight_grid_selection()

    def _highlight_grid_selection(self):
        for i, child in enumerate(self.vgrid_inner.winfo_children()):
            is_sel = (i == self._active_video_idx)
            child.config(bg=HL if is_sel else SURFACE)
            for sub in child.winfo_children():
                if isinstance(sub, tk.Canvas):
                    sub.config(highlightthickness=2 if is_sel else 0,
                               highlightbackground=ACCENT if is_sel else SURFACE)
                elif isinstance(sub, tk.Label):
                    sub.config(bg=HL if is_sel else SURFACE,
                               fg=ACCENT if is_sel else TEXT2)

    def _rebuild_video_grid(self):
        for w in self.vgrid_inner.winfo_children():
            w.destroy()
        for idx, path in enumerate(self._video_paths):
            self._add_video_thumb(idx, path)

    def _add_video_thumb(self, idx, path):
        cell = tk.Frame(self.vgrid_inner, bg=SURFACE, cursor="hand2",
                        padx=3, pady=3)
        cell.grid(row=0, column=idx, padx=(0, 4))
        c = tk.Canvas(cell, width=90, height=90, bg=SURFACE2,
                      highlightthickness=0, cursor="hand2")
        c.pack()
        c.create_text(45, 45, text="⏳", fill=MUTED, font=("Segoe UI", 18))
        nm = Path(path).stem[:12]
        lbl = tk.Label(cell, text=nm, font=("Segoe UI", 8), bg=SURFACE,
                       fg=TEXT2, wraplength=90, justify="center")
        lbl.pack()
        cell.bind("<Button-1>", lambda e, i=idx: self._select_video(i))
        c.bind("<Button-1>",    lambda e, i=idx: self._select_video(i))
        lbl.bind("<Button-1>",  lambda e, i=idx: self._select_video(i))

        def load_thumb(p=path, canvas=c, cell_ref=cell):
            ffmpeg = self._find_ffmpeg()
            if not ffmpeg or not PIL_OK:
                return
            tmp = BASE_DIR / f"_th_{abs(hash(p))}.jpg"
            try:
                subprocess.run([ffmpeg, "-y", "-ss", "00:00:01", "-i", p,
                               "-frames:v", "1", "-q:v", "5",
                               "-vf", "scale=90:90:force_original_aspect_ratio=increase,crop=90:90",
                               str(tmp)], capture_output=True, timeout=8)
                if tmp.exists():
                    img = Image.open(tmp).resize((90, 90), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(img)
                    self._thumb_jobs[p] = photo
                    def update_canvas(c=canvas, ph=photo):
                        if c.winfo_exists():
                            c.delete("all")
                            c.create_image(45, 45, anchor="center", image=ph)
                    self.root.after(0, update_canvas)
            except:
                pass
        threading.Thread(target=load_thumb, daemon=True).start()

    def _browse_video(self):
        self._add_videos()

    def _set_video(self, path):
        path = path.strip().strip("{}")
        if not Path(path).exists():
            return
        self.video_path_var.set(path)
        self.path_lbl.config(text=Path(path).name, fg=TEXT)
        self.output_video_path = None
        self.process_status.config(text="")
        # Stop any current playback
        try: self._tl_stop_play()
        except Exception: pass
        # Reset timeline state for the new video
        self._tl_duration = 0.0
        self._tl_playhead_t = 1.0
        self._tl_cut_start = 0.0
        self._tl_cut_end = 0.0
        self._tl_thumbs_pil = []
        self._tl_thumbs_loaded_for = None
        if hasattr(self, "_tl_canvas"):
            self._tl_redraw()
            self._tl_update_labels()
        # Update info chips
        threading.Thread(target=self._auto_update_info, args=(path,), daemon=True).start()
        self._schedule_preview()

    def _auto_update_info(self, path):
        """Populate the info chips with file metadata extracted via ffmpeg/ffprobe."""
        if not hasattr(self, "_auto_info_chips"):
            return
        chips = self._auto_info_chips
        p = Path(path)
        try:
            size_mb = p.stat().st_size / 1024 / 1024
            self.root.after(0, lambda: chips["file"].config(
                text=p.name[:24] + ("…" if len(p.name) > 24 else "")))
            self.root.after(0, lambda: chips["size"].config(text=f"{size_mb:.1f} MB"))
        except Exception:
            pass
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return
        try:
            r = subprocess.run([ffmpeg, "-i", str(p)], capture_output=True,
                               text=True, timeout=10)
            out = (r.stdout or "") + (r.stderr or "")
            # Duration
            m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", out)
            if m:
                h, mi, s = m.groups()
                dur = int(h) * 3600 + int(mi) * 60 + float(s)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                self.root.after(0, lambda d=dur_str: chips["dur"].config(text=d))
            # Resolution
            m = re.search(r"(\d{3,4})x(\d{3,4})", out)
            if m:
                w_v, h_v = m.groups()
                self.root.after(0, lambda: chips["res"].config(text=f"{w_v}×{h_v}"))
            # Cut info
            def _refresh_cut():
                cs = getattr(self, "_tl_cut_start", 0.0)
                ce = getattr(self, "_tl_cut_end", 0.0)
                d2 = getattr(self, "_tl_duration", 0.0)
                if d2 and (cs > 0.05 or (ce > 0 and ce < d2 - 0.05)):
                    chips["cut"].config(text=f"{int(cs)//60}:{int(cs)%60:02d}→{int(ce)//60}:{int(ce)%60:02d}", fg=DANGER)
                else:
                    chips["cut"].config(text="Aucune coupe", fg=TEXT2)
            self.root.after(500, _refresh_cut)
        except Exception:
            pass

    def _schedule_preview(self):
        if self._preview_after:
            self.root.after_cancel(self._preview_after)
        self._preview_after = self.root.after(400, self._update_preview)

    def _update_preview(self):
        """Extract frame from video (ffmpeg), cache it, then render overlay."""
        if not PIL_OK:
            return
        src = self.video_path_var.get()
        if not src or not Path(src).exists():
            return
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return
        frame_path = BASE_DIR / "_prev.jpg"
        # Seek to current scrubber position (default 2s)
        seek = getattr(self, "_tl_playhead_t", 2.0)
        try:
            subprocess.run([ffmpeg, "-y", "-ss", f"{seek:.2f}", "-i", src,
                            "-frames:v", "1", "-q:v", "3", str(frame_path)],
                           capture_output=True, timeout=10)
        except:
            return
        if not frame_path.exists():
            return
        try:
            img = Image.open(frame_path).convert("RGB")
            self._cached_pil_frame = img  # cache raw frame
            self._redraw_overlay_fast(glowing=False)
        except Exception as e:
            print(f"Preview: {e}")
        # Refresh timeline thumbnails (debounced)
        if not getattr(self, "_tl_thumbs_loaded_for", None) == src:
            self._tl_thumbs_loaded_for = src
            threading.Thread(target=self._tl_load_thumbnails,
                             args=(src,), daemon=True).start()
            threading.Thread(target=self._tl_get_duration,
                             args=(src,), daemon=True).start()

    def _tl_get_duration(self, src):
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return
        try:
            r = subprocess.run([ffmpeg, "-i", src],
                               capture_output=True, text=True, timeout=10)
            out = (r.stdout or "") + (r.stderr or "")
            m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)", out)
            if m:
                h, mi, s = m.groups()
                dur = int(h) * 3600 + int(mi) * 60 + float(s)
                self._tl_duration = dur
                self._tl_cut_start = 0.0
                self._tl_cut_end = dur
                self.root.after(0, self._tl_redraw)
                # Pre-extract frame cache for smooth playback
                threading.Thread(target=self._tl_prefetch_frames,
                                  args=(src,), daemon=True).start()
        except Exception as e:
            print(f"Duration: {e}")

    # Frame cache for smooth playback (~15 fps target)
    TL_FPS = 15

    def _tl_prefetch_frames(self, src):
        """Pre-extract a frame sequence for smooth playback.
        15 fps × 540px wide JPEGs cached in BASE_DIR/_tl_frames/{key}/
        """
        if not PIL_OK:
            return
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            return
        key = hashlib.md5(str(Path(src).resolve()).encode()).hexdigest()[:12]
        cache_dir = BASE_DIR / "_tl_frames" / key
        cache_dir.mkdir(parents=True, exist_ok=True)

        self._tl_frame_dir = cache_dir
        self._tl_frame_key = key

        # Skip extraction if first/last frames already cached and counts match
        existing = sorted(cache_dir.glob("f_*.jpg"))
        dur = getattr(self, "_tl_duration", 0)
        expected = int(dur * self.TL_FPS) if dur else 0
        if existing and abs(len(existing) - expected) < self.TL_FPS:
            self._tl_frames_ready = True
            return

        # Clear stale frames
        for f in existing:
            try: f.unlink()
            except Exception: pass

        try:
            subprocess.run(
                [ffmpeg, "-y", "-i", src,
                 "-vf", f"fps={self.TL_FPS},scale=540:-2",
                 "-q:v", "5",
                 str(cache_dir / "f_%05d.jpg")],
                capture_output=True, timeout=300)
            self._tl_frames_ready = True
        except Exception:
            self._tl_frames_ready = False

    def _tl_frame_for_time(self, t):
        """Return path to cached frame for time t, or None if not ready."""
        if not getattr(self, "_tl_frames_ready", False):
            return None
        cache_dir = getattr(self, "_tl_frame_dir", None)
        if not cache_dir:
            return None
        idx = max(1, int(t * self.TL_FPS) + 1)
        p = cache_dir / f"f_{idx:05d}.jpg"
        return p if p.exists() else None

    def _tl_load_thumbnails(self, src):
        """Extract evenly-spaced thumbnails for timeline strip."""
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg or not PIL_OK:
            return
        # Wait until we know the duration
        for _ in range(40):
            if hasattr(self, "_tl_duration") and self._tl_duration:
                break
            time.sleep(0.1)
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            return
        N = 10
        thumbs = []
        for i in range(N):
            t = (i + 0.5) * dur / N
            tmp = BASE_DIR / f"_tl_{i}.jpg"
            try:
                subprocess.run([ffmpeg, "-y", "-ss", f"{t:.2f}", "-i", src,
                                "-frames:v", "1", "-vf", "scale=-2:60",
                                "-q:v", "5", str(tmp)],
                               capture_output=True, timeout=5)
                if tmp.exists():
                    img = Image.open(tmp).convert("RGB")
                    thumbs.append(img)
            except Exception:
                continue
        self._tl_thumbs_pil = thumbs
        self.root.after(0, self._tl_redraw)

    def _tl_redraw(self):
        """Redraw the timeline canvas: thumbs + playhead + cut markers."""
        if not hasattr(self, "_tl_canvas") or not self._tl_canvas.winfo_exists():
            return
        cv = self._tl_canvas
        cv.delete("all")
        w = cv.winfo_width() or 600
        h = cv.winfo_height() or 70
        dur = getattr(self, "_tl_duration", 0)
        if not dur:
            cv.create_text(w // 2, h // 2, text="Charge une vidéo pour la timeline",
                           fill=MUTED, font=("Segoe UI", 9))
            return

        # Draw thumbnail strip
        thumbs = getattr(self, "_tl_thumbs_pil", [])
        self._tl_thumb_imgs = []  # keep refs
        if thumbs and PIL_OK:
            tw = w // max(1, len(thumbs))
            for i, im in enumerate(thumbs):
                try:
                    im2 = im.resize((tw, h - 18), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(im2)
                    cv.create_image(i * tw, 0, anchor="nw", image=photo)
                    self._tl_thumb_imgs.append(photo)
                except Exception:
                    pass
        else:
            cv.create_rectangle(0, 0, w, h - 18, fill=SURFACE2, outline="")

        # Time ruler
        cv.create_rectangle(0, h - 18, w, h, fill=SURFACE3, outline="")
        for i in range(0, 11):
            x = i * w // 10
            t = i * dur / 10
            mins = int(t) // 60
            secs = int(t) % 60
            cv.create_line(x, h - 18, x, h - 14, fill=TEXT2, width=1)
            cv.create_text(x + 1, h - 6, anchor="w" if i < 10 else "e",
                            text=f"{mins}:{secs:02d}",
                            fill=TEXT2, font=("Consolas", 7))

        # Cut region (selected range) - subtle accent overlay
        cs = getattr(self, "_tl_cut_start", 0.0)
        ce = getattr(self, "_tl_cut_end", dur)
        x_cs = int(cs / dur * w) if dur else 0
        x_ce = int(ce / dur * w) if dur else w
        # Dim outside region
        if x_cs > 0:
            cv.create_rectangle(0, 0, x_cs, h - 18, fill="#000000", outline="",
                                stipple="gray50")
        if x_ce < w:
            cv.create_rectangle(x_ce, 0, w, h - 18, fill="#000000", outline="",
                                stipple="gray50")
        # Cut start marker (green)
        cv.create_rectangle(x_cs - 1, 0, x_cs + 1, h - 18, fill=OK, outline="",
                            tags="cs_marker")
        cv.create_polygon(x_cs - 6, 0, x_cs + 6, 0, x_cs, 8,
                          fill=OK, outline="", tags="cs_marker")
        # Cut end marker (red)
        cv.create_rectangle(x_ce - 1, 0, x_ce + 1, h - 18, fill=DANGER, outline="",
                            tags="ce_marker")
        cv.create_polygon(x_ce - 6, 0, x_ce + 6, 0, x_ce, 8,
                          fill=DANGER, outline="", tags="ce_marker")

        # Playhead (yellow)
        ph = getattr(self, "_tl_playhead_t", 2.0)
        x_ph = int(ph / dur * w) if dur else 0
        cv.create_rectangle(x_ph - 1, 0, x_ph + 1, h - 18, fill=ACCENT,
                            outline="", tags="ph_marker")
        cv.create_polygon(x_ph - 6, h - 18, x_ph + 6, h - 18, x_ph, h - 26,
                          fill=ACCENT, outline="", tags="ph_marker")

    def _find_ffmpeg(self):
        ff = shutil.which("ffmpeg")
        if not ff:
            desktop = Path.home() / "Desktop"
            candidates = [BASE_DIR / "ffmpeg.exe",
                          Path(r"C:\ffmpeg\bin\ffmpeg.exe")]
            try:
                for d in desktop.iterdir():
                    if d.is_dir() and "ffmpeg" in d.name.lower():
                        candidates.append(d / "bin" / "ffmpeg.exe")
            except:
                pass
            for p in candidates:
                if Path(p).exists():
                    ff = str(p)
                    break
        return ff

    # ── Préréglages ───────────────────────────────────────────────────────────
    def _refresh_preset_combo(self):
        names = list(load_presets().keys())
        self.preset_combo["values"] = names
        if names and not self.preset_combo_var.get():
            self.preset_combo_var.set(names[0])

    def _save_preset(self):
        name = self.preset_name_var.get().strip()
        if not name:
            return
        presets = load_presets()
        presets[name] = {
            "text":     self._get_overlay_text(),
            "fontsize": self.fontsize_var.get(),
            "pos_x":    self.pos_x_var.get(),
            "pos_y":    self.pos_y_var.get(),
            "speed":    self.speed_var.get(),
        }
        save_presets(presets)
        self._refresh_preset_combo()
        self.preset_combo_var.set(name)

    def _load_preset(self):
        name = self.preset_combo_var.get()
        if not name:
            return
        p = load_presets().get(name)
        if not p:
            return
        if p.get("text"):
            try:
                self.overlay_text_widget.delete("1.0", "end")
                self.overlay_text_widget.insert("1.0", p["text"])
            except:
                self.overlay_var.set(p["text"])
        self.fontsize_var.set(p.get("fontsize", 52))
        self.pos_x_var.set(p.get("pos_x", 50))
        self.pos_y_var.set(p.get("pos_y", 78))
        self.speed_var.set(p.get("speed", 1.0))

    def _delete_preset(self):
        name = self.preset_combo_var.get()
        if not name:
            return
        presets = load_presets()
        presets.pop(name, None)
        save_presets(presets)
        self.preset_combo_var.set("")
        self._refresh_preset_combo()
        names = list(load_presets().keys())
        if names:
            self.preset_combo_var.set(names[0])

    def _process_video(self):
        src = self.video_path_var.get()
        if not src or not Path(src).exists():
            self.root.after(0, lambda: self._alog("⚠ Sélectionne une vidéo", "warn"))
            return
        overlay = self._get_overlay_text().strip()
        if not overlay:
            self.root.after(0, lambda: self._alog("⚠ Entre un texte overlay", "warn"))
            return
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            self.root.after(0, lambda: self._alog("❌ ffmpeg non trouvé", "error"))
            return

        src_path = Path(src)
        export_dir = self.cfg.get("export_dir", "").strip()
        out_dir = (Path(export_dir) if export_dir and Path(export_dir).exists()
                   else BASE_DIR)

        # Numérotation automatique reels1, reels2, ...
        bank = load_bank()
        existing = {b.get("filename", "") for b in bank}
        i = 1
        while f"reels{i}.mp4" in existing or (out_dir / f"reels{i}.mp4").exists():
            i += 1
        out_path = out_dir / f"reels{i}.mp4"

        fs    = int(self.fontsize_var.get())
        px    = self.pos_x_var.get() / 100
        py    = self.pos_y_var.get() / 100
        speed = round(self.speed_var.get(), 3)
        bright = getattr(self, 'brightness_var', None)
        cont   = getattr(self, 'contrast_var', None)
        sat    = getattr(self, 'saturation_var', None)
        wrap_pct = getattr(self, 'wrap_var', None)

        self.root.after(0, lambda: self._alog("⏳ Traitement en cours...", "accent"))
        self.root.after(0, lambda: self.process_status.config(text="⏳ Traitement...", fg=WARN))
        if fn := getattr(self, "_auto_set_progress", None):
            self.root.after(0, lambda: fn(20, "⏳ Traitement en cours…", ""))
        try:
            result = self._process_single_video(
                src_path, out_path, overlay, fs, px, py, speed,
                bright, cont, sat, wrap_pct, ffmpeg
            )
            if result == "ok":
                bank = load_bank()
                bank.insert(0, {
                    "id":       f"{int(time.time())}_{random.randint(1000,9999)}",
                    "filename": out_path.name,
                    "path":     str(out_path),
                    "overlay":  overlay,
                    "caption":  "",
                    "size_mb":  round(out_path.stat().st_size / 1_000_000, 1),
                    "created":  datetime.now().isoformat(),
                    "posted_to": [],
                })
                save_bank(bank)
                self.output_video_path = str(out_path)
                self.root.after(0, lambda: self._alog(f"✅ Exportée → {out_path.name}", "ok"))
                self.root.after(0, lambda: self.process_status.config(
                    text=f"✅ {out_path.name}", fg=OK))
            else:
                self.root.after(0, lambda: self._alog(f"❌ {result}", "error"))
                self.root.after(0, lambda: self.process_status.config(
                    text="❌ Erreur", fg=DANGER))
        except Exception as e:
            self.root.after(0, lambda: self._alog(f"❌ {e}", "error"))

    def _process_single_video(self, src_path, out_path, overlay, fs, px, py, speed,
                               bright_var, cont_var, sat_var, wrap_var, ffmpeg):
        """Process one video: overlay text via PIL overlay PNG + optional color grading + speed."""
        src = str(src_path)
        overlay_png = None

        # Build PIL overlay PNG if PIL available (supports multi-line)
        if PIL_OK and overlay.strip():
            try:
                import tempfile
                # Get video dimensions via ffprobe / ffmpeg
                probe = subprocess.run(
                    [ffmpeg, "-i", src],
                    capture_output=True, text=True, timeout=10
                )
                w, h = 1080, 1920
                for line in probe.stderr.split("\n"):
                    m = re.search(r"(\d{3,4})x(\d{3,4})", line)
                    if m:
                        w, h = int(m.group(1)), int(m.group(2))
                        break

                overlay_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                d = ImageDraw.Draw(overlay_img)
                wrap_frac = (wrap_var.get() / 100) if wrap_var else 0.8
                max_w = int(w * wrap_frac)

                try:
                    font = ImageFont.truetype("arialbd.ttf", fs)
                except:
                    try:
                        font = ImageFont.truetype("arial.ttf", fs)
                    except:
                        font = ImageFont.load_default()

                paragraphs = overlay.split("\n")
                lines = []
                for para in paragraphs:
                    words = para.split()
                    if not words:
                        lines.append("")
                        continue
                    cur = ""
                    for word in words:
                        test = (cur + " " + word).strip()
                        bb = d.textbbox((0, 0), test, font=font)
                        if bb[2] - bb[0] <= max_w:
                            cur = test
                        else:
                            if cur:
                                lines.append(cur)
                            cur = word
                    if cur:
                        lines.append(cur)

                lh = fs + 8
                total_h = len(lines) * lh
                bx = int(w * px)
                by = int(h * py) - total_h // 2

                for i, line in enumerate(lines):
                    if not line:
                        continue
                    bb = d.textbbox((0, 0), line, font=font)
                    lw = bb[2] - bb[0]
                    lx = bx - lw // 2
                    ly = by + i * lh
                    for ox2, oy2 in [(-2,-2),(2,-2),(-2,2),(2,2),(0,-3),(0,3),(-3,0),(3,0)]:
                        d.text((lx+ox2, ly+oy2), line, font=font, fill=(0,0,0,200))
                    d.text((lx, ly), line, font=font, fill=(255, 255, 255, 255))

                tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
                overlay_img.save(tmp.name)
                overlay_png = tmp.name
            except Exception as e:
                overlay_png = None

        # Build ffmpeg filter chain
        filters = []
        if overlay_png:
            filters.append(f"[0:v][1:v]overlay=0:0")
        else:
            txt = overlay.replace("\\", "\\\\").replace("'", "\\'").replace(":", r"\:")
            filters.append(f"drawtext=text='{txt}':fontcolor=white:fontsize={fs}:"
                           f"x=(w-text_w)*{px:.4f}:y=(h-text_h)*{py:.4f}:"
                           f"borderw=3:bordercolor=black:font=Arial")

        # Color grading
        eq_parts = []
        if bright_var:
            b = bright_var.get()
            if abs(b) > 0.01:
                eq_parts.append(f"brightness={b/100:.3f}")
        if cont_var:
            c = cont_var.get()
            if abs(c - 1.0) > 0.01:
                eq_parts.append(f"contrast={c:.3f}")
        if sat_var:
            s = sat_var.get()
            if abs(s - 1.0) > 0.01:
                eq_parts.append(f"saturation={s:.3f}")
        if eq_parts:
            if overlay_png:
                # chain after overlay
                filters.append("eq=" + ":".join(eq_parts))
            else:
                filters[-1] += ",eq=" + ":".join(eq_parts)

        if abs(speed - 1.0) > 0.001:
            pts = round(1.0 / speed, 6)
            if overlay_png:
                filters.append(f"setpts={pts}*PTS")
            else:
                filters[-1] += f",setpts={pts}*PTS"

        # Build cut flags from timeline markers
        cut_args = []
        try:
            cs = float(getattr(self, "_tl_cut_start", 0.0))
            ce = float(getattr(self, "_tl_cut_end", 0.0))
            dur = float(getattr(self, "_tl_duration", 0.0))
            if dur and (cs > 0.05 or (ce > 0 and ce < dur - 0.05)):
                if cs > 0.05:
                    cut_args += ["-ss", f"{cs:.2f}"]
                if ce > 0 and ce < dur - 0.05:
                    cut_args += ["-to", f"{ce:.2f}"]
        except Exception:
            cut_args = []

        if overlay_png:
            # complex filtergraph
            vf_chain = ",".join(f for f in filters[1:]) if len(filters) > 1 else ""
            if vf_chain:
                fg = f"{filters[0]},{vf_chain}"
            else:
                fg = filters[0]
            if abs(speed - 1.0) > 0.001:
                af = f"atempo={speed}"
                cmd = [ffmpeg, "-y"] + cut_args + ["-i", src, "-i", overlay_png,
                       "-filter_complex", fg,
                       "-af", af, "-c:v", "libx264", "-preset", "fast", str(out_path)]
            else:
                cmd = [ffmpeg, "-y"] + cut_args + ["-i", src, "-i", overlay_png,
                       "-filter_complex", fg,
                       "-c:a", "copy", "-c:v", "libx264", "-preset", "fast", str(out_path)]
        else:
            vf = filters[0]
            if abs(speed - 1.0) > 0.001:
                af = f"atempo={speed}"
                cmd = [ffmpeg, "-y"] + cut_args + ["-i", src, "-vf", vf, "-af", af,
                       "-c:v", "libx264", "-preset", "fast", str(out_path)]
            else:
                cmd = [ffmpeg, "-y"] + cut_args + ["-i", src, "-vf", vf,
                       "-c:a", "copy", "-c:v", "libx264", "-preset", "fast", str(out_path)]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        finally:
            if overlay_png:
                try:
                    Path(overlay_png).unlink(missing_ok=True)
                except:
                    pass

        if result.returncode == 0:
            return "ok"
        return result.stderr[-400:] if result.stderr else "ffmpeg error"

    def _batch_export(self):
        """Export all videos in parallel using the current overlay/settings."""
        if not self._video_paths:
            self._alog("⚠ Aucune vidéo dans la grille", "warn")
            return
        overlay = self._get_overlay_text().strip()
        if not overlay:
            self._alog("⚠ Entre un texte overlay", "warn")
            return
        ffmpeg = self._find_ffmpeg()
        if not ffmpeg:
            self._alog("❌ ffmpeg non trouvé", "error")
            return

        fs    = int(self.fontsize_var.get())
        px    = self.pos_x_var.get() / 100
        py    = self.pos_y_var.get() / 100
        speed = round(self.speed_var.get(), 3)
        bright = getattr(self, 'brightness_var', None)
        cont   = getattr(self, 'contrast_var', None)
        sat    = getattr(self, 'saturation_var', None)
        wrap_pct = getattr(self, 'wrap_var', None)

        export_dir = self.cfg.get("export_dir", "").strip()
        out_dir = (Path(export_dir) if export_dir and Path(export_dir).exists() else BASE_DIR)

        bank = load_bank()
        existing = {b.get("filename", "") for b in bank}
        # Assign unique output filenames
        jobs = []
        idx = 1
        for vp in self._video_paths:
            while f"reels{idx}.mp4" in existing or (out_dir / f"reels{idx}.mp4").exists():
                idx += 1
            out_path = out_dir / f"reels{idx}.mp4"
            existing.add(f"reels{idx}.mp4")
            jobs.append((Path(vp), out_path))
            idx += 1

        total = len(jobs)
        self._alog(f"⏳ Export parallèle de {total} vidéos...", "accent")
        self.process_status.config(text=f"⏳ Export {total} vidéos...", fg=WARN)

        def run_batch():
            done = 0
            errors = 0
            new_entries = []
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, total)) as ex:
                future_map = {
                    ex.submit(self._process_single_video,
                              src, out, overlay, fs, px, py, speed,
                              bright, cont, sat, wrap_pct, ffmpeg): (src, out)
                    for src, out in jobs
                }
                for fut in concurrent.futures.as_completed(future_map):
                    src, out = future_map[fut]
                    res = fut.result()
                    if res == "ok":
                        done += 1
                        new_entries.append({
                            "id":       f"{int(time.time())}_{random.randint(1000,9999)}",
                            "filename": out.name,
                            "path":     str(out),
                            "overlay":  overlay,
                            "caption":  "",
                            "size_mb":  round(out.stat().st_size / 1_000_000, 1),
                            "created":  datetime.now().isoformat(),
                            "posted_to": [],
                        })
                        self.root.after(0, lambda n=out.name: self._alog(f"✅ {n}", "ok"))
                    else:
                        errors += 1
                        self.root.after(0, lambda e=res, n=src.name:
                                        self._alog(f"❌ {n}: {e[:80]}", "error"))

            if new_entries:
                b2 = load_bank()
                b2[0:0] = new_entries
                save_bank(b2)

            msg = f"✅ {done}/{total} exportées"
            if errors:
                msg += f"  ({errors} erreurs)"
            self.root.after(0, lambda: self._alog(msg, "ok" if not errors else "warn"))
            self.root.after(0, lambda: self.process_status.config(text=msg, fg=OK))

        import threading
        threading.Thread(target=run_batch, daemon=True).start()

    def _refresh_auto_phones(self):
        if not hasattr(self, 'auto_phone_inner'):
            return
        for w in self.auto_phone_inner.winfo_children():
            w.destroy()
        self.auto_phone_vars = {}
        grp = self.auto_grp_var.get() if hasattr(self, "auto_grp_var") else "Tous"
        groups = set()
        for d in self.data.values():
            if d.get("group_name"):
                groups.add(d["group_name"])
        if hasattr(self, "auto_grp_combo"):
            self.auto_grp_combo["values"] = ["Tous"] + sorted(groups)
        for pid, d in sorted(self.data.items(),
                             key=lambda x: int(x[1].get("serial_no", 0) or 0)):
            if not d.get("phone_name"):
                continue
            if grp != "Tous" and d.get("group_name", "") != grp:
                continue
            var = tk.BooleanVar(value=False)
            self.auto_phone_vars[pid] = var
            row = tk.Frame(self.auto_phone_inner, bg=SURFACE)
            row.pack(fill="x", padx=8, pady=1)
            tk.Checkbutton(row, variable=var, bg=SURFACE,
                           activebackground=SURFACE, selectcolor=SURFACE2).pack(side="left")
            ig  = d.get("ig_username", "")
            lbl = f"#{d.get('serial_no','')}  {d.get('phone_name', pid)}"
            if ig:
                lbl += f"  →  @{ig}"
            tk.Label(row, text=lbl, font=("Segoe UI", 10), bg=SURFACE,
                     fg=OK if ig else MUTED, anchor="w").pack(side="left", padx=4)

    def _open_post_window(self):
        if not self.output_video_path or not Path(self.output_video_path).exists():
            messagebox.showwarning("Vidéo", "Traite d'abord la vidéo")
            return
        self._post_window(self.output_video_path, "")

    def _post_window(self, video_path, caption=""):
        import random as _random
        win = tk.Toplevel(self.root)
        win.title("🚀 Publier un Reel")
        win.geometry("760x720")
        win.configure(bg=BG)

        # ── Header ──────────────────────────────────────────────────────────
        hdr = tk.Frame(win, bg=BG)
        hdr.pack(fill="x", padx=20, pady=(16, 0))
        tk.Label(hdr, text="🚀 Publier un Reel",
                 font=("Segoe UI", 13, "bold"), bg=BG, fg=ACCENT).pack(side="left")
        tk.Label(hdr, text=f"  {Path(video_path).name}",
                 font=("Segoe UI", 9), bg=BG, fg=MUTED).pack(side="left")

        # ── Main split: left=phones, right=options ───────────────────────────
        main = tk.Frame(win, bg=BG)
        main.pack(fill="both", expand=True, padx=20, pady=10)

        # LEFT — phone selector
        left = tk.Frame(main, bg=BG, width=280)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        hdr2 = tk.Frame(left, bg=BG)
        hdr2.pack(fill="x")
        tk.Label(hdr2, text="Comptes cibles", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        groups = set(d.get("group_name", "") for d in self.data.values() if d.get("group_name"))
        grp2   = tk.StringVar(value="Tous")
        gc2    = ttk.Combobox(hdr2, textvariable=grp2, state="readonly",
                              width=12, font=("Segoe UI", 9))
        gc2["values"] = ["Tous"] + sorted(groups)
        gc2.pack(side="right")

        phone_frame = tk.Frame(left, bg=SURFACE, highlightthickness=1,
                               highlightbackground=BORDER)
        phone_frame.pack(fill="both", expand=True, pady=(6, 0))
        cv2     = tk.Canvas(phone_frame, bg=SURFACE, highlightthickness=0)
        sv2     = ttk.Scrollbar(phone_frame, orient="vertical", command=cv2.yview)
        inner2  = tk.Frame(cv2, bg=SURFACE)
        win2_id = cv2.create_window((0, 0), window=inner2, anchor="nw")
        inner2.bind("<Configure>", lambda e: cv2.configure(scrollregion=cv2.bbox("all")))
        cv2.bind("<Configure>",    lambda e: cv2.itemconfig(win2_id, width=e.width))
        cv2.configure(yscrollcommand=sv2.set)
        sv2.pack(side="right", fill="y")
        cv2.pack(side="left",  fill="both", expand=True)

        pv2 = {}
        def populate(g="Tous"):
            for w in inner2.winfo_children():
                w.destroy()
            pv2.clear()
            for pid, d in sorted(self.data.items(),
                                  key=lambda x: int(x[1].get("serial_no") or 0)):
                name = d.get("phone_name") or d.get("ig_username") or ""
                if not name:
                    continue
                if g != "Tous" and d.get("group_name", "") != g:
                    continue
                var = tk.BooleanVar()
                pv2[pid] = var
                row = tk.Frame(inner2, bg=SURFACE)
                row.pack(fill="x", padx=6, pady=2)
                tk.Checkbutton(row, variable=var, bg=SURFACE,
                               activebackground=SURFACE, selectcolor=SURFACE2,
                               cursor="hand2").pack(side="left")
                ig  = d.get("ig_username", "")
                lbl = f"{d.get('phone_name', pid)}"
                if ig:
                    lbl += f"\n  @{ig}"
                fg = OK if ig else MUTED
                tk.Label(row, text=lbl, font=("Segoe UI", 9), bg=SURFACE,
                         fg=fg, anchor="w", justify="left",
                         cursor="hand2").pack(side="left", padx=4)
                row.bind("<Button-1>", lambda e, v=var: v.set(not v.get()))
            if not pv2:
                tk.Label(inner2, text="Aucun téléphone.\nAjoute un Bearer Token\ndans Paramètres.",
                         font=("Segoe UI", 9), bg=SURFACE, fg=MUTED, justify="center").pack(pady=20)

        populate()
        gc2.bind("<<ComboboxSelected>>", lambda e: populate(grp2.get()))

        sel_row = tk.Frame(left, bg=BG)
        sel_row.pack(fill="x", pady=(4, 0))
        tk.Button(sel_row, text="Tout", font=("Segoe UI", 8), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: [v.set(True) for v in pv2.values()]).pack(side="left")
        tk.Button(sel_row, text="Aucun", font=("Segoe UI", 8), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: [v.set(False) for v in pv2.values()]).pack(side="left", padx=(4,0))

        # RIGHT — caption + schedule
        right = tk.Frame(main, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(14, 0))

        tk.Label(right, text="Caption", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w")
        caption_box = tk.Text(right, bg=SURFACE, fg=TEXT, font=("Segoe UI", 10),
                              relief="flat", height=6, wrap="word",
                              insertbackground=TEXT, padx=8, pady=6,
                              highlightthickness=1, highlightbackground=BORDER,
                              highlightcolor=ACCENT)
        caption_box.pack(fill="x", pady=(4, 10))
        if caption:
            caption_box.insert("1.0", caption)

        # Schedule options
        sched_frame = tk.Frame(right, bg=SURFACE, highlightthickness=1,
                               highlightbackground=BORDER)
        sched_frame.pack(fill="x", pady=(0, 10))
        tk.Label(sched_frame, text="📅  Planification", font=("Segoe UI", 10, "bold"),
                 bg=SURFACE, fg=TEXT2).pack(anchor="w", padx=12, pady=(10, 6))

        mode_var = tk.StringVar(value="now")
        modes = [
            ("now",      "🚀  Maintenant  (warmup 3-8 min avant chaque post)"),
            ("stagger",  "⏱  Échelonné  (délai aléatoire entre chaque compte)"),
        ]
        for val, lbl in modes:
            tk.Radiobutton(sched_frame, text=lbl, variable=mode_var, value=val,
                           font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2,
                           selectcolor=SURFACE2, activebackground=SURFACE,
                           cursor="hand2").pack(anchor="w", padx=20)

        stagger_row = tk.Frame(sched_frame, bg=SURFACE)
        stagger_row.pack(fill="x", padx=20, pady=(4, 10))
        tk.Label(stagger_row, text="Délai entre comptes :", font=("Segoe UI", 9),
                 bg=SURFACE, fg=TEXT2).pack(side="left")
        stagger_min = tk.IntVar(value=10)
        tk.Spinbox(stagger_row, from_=2, to=120, textvariable=stagger_min,
                   font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT, width=4,
                   relief="flat", buttonbackground=SURFACE2).pack(side="left", padx=4)
        tk.Label(stagger_row, text="min (±50%)", font=("Segoe UI", 9),
                 bg=SURFACE, fg=MUTED).pack(side="left")

        # Log output
        plog_box = scrolledtext.ScrolledText(right, bg=SURFACE, fg=TEXT2,
                                             font=("Consolas", 8), relief="flat",
                                             state="disabled", wrap="word", height=6)
        plog_box.pack(fill="both", expand=True, pady=(0, 8))

        def plog(msg, lv="info"):
            colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
            plog_box.config(state="normal")
            plog_box.insert("end", f"{msg}\n", lv)
            plog_box.tag_config(lv, foreground=colors.get(lv, TEXT2))
            plog_box.see("end")
            plog_box.config(state="disabled")

        launch_btn = tk.Button(win, text="🚀  Lancer le posting",
                               font=("Segoe UI", 12, "bold"), bg=ACCENT, fg="#06080f",
                               relief="flat", cursor="hand2", pady=10)
        launch_btn.pack(fill="x", padx=20, pady=(0, 16))

        def do_post():
            sel = [pid for pid, v in pv2.items() if v.get()]
            if not sel:
                plog("⚠ Sélectionne au moins un téléphone", "warn")
                return
            final_caption = caption_box.get("1.0", "end").strip()
            if not final_caption:
                plog("⚠ La caption est obligatoire pour GéeLark", "warn")
                return
            bearer = self.cfg.get("bearer_token", "")
            if not bearer:
                plog("❌ Bearer Token GéeLark manquant — va dans Paramètres", "error")
                return
            launch_btn.config(state="disabled", text="⏳ En cours...")
            def _done():
                if launch_btn.winfo_exists():
                    launch_btn.config(state="normal", text="🚀  Lancer le posting")
            mode     = mode_var.get()
            stagger  = stagger_min.get() if mode == "stagger" else 5
            threading.Thread(
                target=self._upload_and_post,
                args=(sel, bearer, final_caption, video_path, plog, stagger, _done),
                daemon=True).start()

        launch_btn.config(command=do_post)

    def _upload_and_post(self, selected, bearer, caption, video_path, log_fn,
                         stagger_min=5, done_cb=None, progress_fn=None):
        api_hdrs = {"Content-Type": "application/json",
                    "Authorization": f"Bearer {bearer}"}

        def _progress(pct, step, detail=""):
            if progress_fn:
                try:
                    self.root.after(0, lambda p=pct, s=step, d=detail: progress_fn(p, s, d))
                except Exception:
                    pass

        # ── Step 1: get a temporary upload URL from GéeLark ──────────────────
        log_fn("📤 Obtention de l'URL d'upload...", "accent")
        _progress(5, "Upload", "Obtention URL...")
        try:
            r = httpx.post(
                "https://openapi.geelark.com/open/v1/upload/getUrl",
                json={"fileType": "mp4"},
                headers=api_hdrs, timeout=20,
                follow_redirects=False)
            try:
                rj = r.json()
            except Exception:
                log_fn(f"❌ Réponse invalide de GéeLark (HTTP {r.status_code}): {r.text[:300]}", "error")
                return
            if rj.get("code") != 0:
                log_fn(f"❌ GéeLark: {rj.get('msg', rj)}", "error")
                return
            upload_url   = rj["data"]["uploadUrl"]
            resource_url = rj["data"]["resourceUrl"]
        except Exception as e:
            log_fn(f"❌ {e}", "error")
            return

        # ── Step 2: PUT the file — NO extra headers (OSS requirement) ────────
        log_fn("📤 Upload vidéo en cours...", "accent")
        _progress(10, "Upload", "Envoi de la vidéo...")
        try:
            file_size = Path(video_path).stat().st_size
            chunk_size = 262144  # 256 KB
            uploaded = 0

            def _chunked_iter():
                nonlocal uploaded
                with open(video_path, "rb") as fl:
                    while True:
                        chunk = fl.read(chunk_size)
                        if not chunk:
                            break
                        uploaded += len(chunk)
                        pct = 10 + int(uploaded / file_size * 20) if file_size else 20
                        _progress(pct, "Upload",
                                  f"Envoi… {uploaded//(1024*1024)}/{file_size//(1024*1024)} Mo")
                        yield chunk

            up = httpx.put(upload_url, content=_chunked_iter(), timeout=300)
            if up.status_code not in (200, 204):
                log_fn(f"❌ Upload échoué (HTTP {up.status_code}): {up.text[:200]}", "error")
                return
            log_fn("✅ Vidéo uploadée", "ok")
            _progress(30, "Upload", "Vidéo envoyée ✓")
        except Exception as e:
            log_fn(f"❌ Upload: {e}", "error")
            return

        # ── Step 3: start phones, create tasks, then poll status ─────────────
        import random
        base_time   = int(time.time())
        stagger_sec = stagger_min * 60

        # Start all phones first so they're ready when the task fires
        log_fn("📱 Démarrage des téléphones...", "accent")
        _progress(35, "Démarrage", "Démarrage des téléphones...")
        try:
            sr = httpx.post(
                "https://openapi.geelark.com/open/v1/phone/start",
                json={"ids": selected},
                headers=api_hdrs, timeout=20, follow_redirects=False)
            sj = sr.json() if sr.status_code == 200 else {}
            ok  = sj.get("data", {}).get("successAmount", 0)
            fail = sj.get("data", {}).get("failAmount", 0)
            log_fn(f"  {ok} démarrés, {fail} déjà actifs/erreur", "info")
        except Exception as e:
            log_fn(f"  ⚠ Impossible de démarrer les téléphones: {e}", "warn")

        # Give phones 30s to boot before first task
        log_fn("⏳ Attente 30s (démarrage)...", "info")
        for _bi in range(30):
            _progress(35 + _bi, "Boot", f"Démarrage téléphones… {_bi+1}/30s")
            time.sleep(1)

        task_ids = {}  # pid → task_id
        for i, pid in enumerate(selected):
            name = self.data.get(pid, {}).get("phone_name", pid)
            offset  = int(stagger_sec * (0.75 + random.random() * 0.5))
            post_at = base_time + 30 + i * offset  # stagger after boot delay

            try:
                r = httpx.post(
                    "https://openapi.geelark.com/open/v1/rpa/task/instagramPubReels",
                    json={
                        "id":          pid,
                        "description": caption,
                        "video":       [resource_url],
                        "scheduleAt":  post_at,
                    },
                    headers=api_hdrs, timeout=30, follow_redirects=False)
                rj = r.json()
                if rj.get("code") == 0:
                    tid = rj["data"].get("taskId", "")
                    task_ids[pid] = tid
                    mins = max(0, (post_at - int(time.time())) // 60)
                    log_fn(f"✅ {name} — tâche {tid} (dans ~{mins} min)", "ok")
                else:
                    log_fn(f"⚠ {name}: {rj.get('msg', str(rj))}", "warn")
            except Exception as e:
                log_fn(f"❌ {name}: {e}", "error")

        _progress(70, "Polling", "Suivi des tâches...")

        if not task_ids:
            log_fn("❌ Aucune tâche créée", "error")
            if done_cb:
                try: self.root.after(0, done_cb)
                except Exception: pass
            return

        # ── Poll task status until all done or 8 min timeout ─────────────────
        log_fn("⏳ Suivi des tâches...", "accent")
        _progress(70, "Suivi", "Suivi des tâches...")
        STATUS = {1: "⏳ En attente", 2: "🔄 En cours", 3: "✅ Terminé", 4: "❌ Échoué", 7: "🚫 Annulé"}
        deadline  = time.time() + 480  # 8 min max
        pending   = dict(task_ids)
        reported  = set()
        poll_num  = 0
        n_total   = len(task_ids)
        while pending and time.time() < deadline:
            for _pi in range(15):
                elapsed_ratio = min(1.0, (480 - (deadline - time.time())) / 480)
                pct = 70 + int(elapsed_ratio * 25)
                done = n_total - len(pending)
                _progress(pct, "Suivi",
                          f"{done}/{n_total} terminés • poll #{poll_num+1}")
                time.sleep(1)
            poll_num += 1
            try:
                qr = httpx.post(
                    "https://openapi.geelark.com/open/v1/task/query",
                    json={"ids": list(pending.values())},
                    headers=api_hdrs, timeout=15, follow_redirects=False)
                items = qr.json().get("data", {}).get("items", [])
                for item in items:
                    tid    = item.get("id", "")
                    status = item.get("status", 0)
                    pid    = next((p for p, t in task_ids.items() if t == tid), None)
                    name   = self.data.get(pid, {}).get("phone_name", pid) if pid else tid
                    if status in (3, 4, 7) and tid not in reported:
                        reported.add(tid)
                        if pid in pending: del pending[pid]
                        lv = "ok" if status == 3 else "error"
                        fail_desc = item.get("failDesc", "")
                        fail_code = item.get("failCode", "")
                        msg = f"{STATUS.get(status, str(status))} {name}"
                        if fail_desc:
                            msg += f" — {fail_desc} (code {fail_code})"
                        log_fn(msg, lv)
                    elif status in (1, 2) and poll_num % 4 == 0:
                        # Show progress every ~60s for still-pending tasks
                        log_fn(f"  {STATUS.get(status, '?')} {name}...", "info")
            except Exception as e:
                log_fn(f"⚠ Erreur polling: {e}", "warn")

        if pending:
            for pid, tid in pending.items():
                name = self.data.get(pid, {}).get("phone_name", pid)
                log_fn(f"⏳ {name} — tâche toujours en cours (vérifie GéeLark)", "warn")

        # Stop all phones that were started
        log_fn("📴 Arrêt des téléphones...", "info")
        try:
            httpx.post("https://openapi.geelark.com/open/v1/phone/stop",
                       json={"ids": selected},
                       headers=api_hdrs, timeout=15, follow_redirects=False)
            log_fn("✅ Téléphones éteints", "ok")
        except Exception as e:
            log_fn(f"⚠ Impossible d'éteindre les téléphones: {e}", "warn")

        _progress(100, "Terminé", "Posting terminé ✓")
        log_fn("Terminé ✓", "ok")
        if done_cb:
            try:
                self.root.after(0, done_cb)
            except Exception:
                pass

    # ══════════════════════════════════════════════════════════════════════════
    # BANK PICKER MODAL (full-screen overlay)
    # ══════════════════════════════════════════════════════════════════════════
    def _open_bank_picker(self, callback, multi=True):
        """Open a full-screen bank picker modal. callback(paths: list[str]) on import."""
        MODAL_BG   = "#0d1117"
        SIDEBAR_BG = "#111827"
        CARD_BG    = "#161d2b"
        CARD_SEL   = "#0e1f3d"
        BORDER_C   = "#1e2a3a"
        ACCENT_C   = "#4f8ef7"  # blue checkmark / import button
        TEXT_C     = "#e8eaf0"
        TEXT2_C    = "#8b95b0"
        MUTED_C    = "#4a5568"

        top = tk.Toplevel(self.root)
        top.title("Banque de vidéos")
        top.configure(bg=MODAL_BG)
        # Match root window geometry
        rw = self.root.winfo_width()
        rh = self.root.winfo_height()
        rx = self.root.winfo_rootx()
        ry = self.root.winfo_rooty()
        top.geometry(f"{rw}x{rh}+{rx}+{ry}")
        top.resizable(True, True)
        top.grab_set()

        selected_paths = {}   # path → BooleanVar
        thumb_refs = []       # GC protection

        # ── Header ────────────────────────────────────────────────────────────
        hdr = tk.Frame(top, bg="#070a10", height=52)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        tk.Label(hdr, text="🎬  Banque de vidéos",
                 font=("Segoe UI", 13, "bold"),
                 bg="#070a10", fg=TEXT_C).pack(side="left", padx=20)
        tk.Button(hdr, text="✕", font=("Segoe UI", 12), bg="#070a10",
                  fg=TEXT2_C, relief="flat", cursor="hand2", bd=0,
                  activebackground="#070a10", activeforeground=TEXT_C,
                  command=top.destroy).pack(side="right", padx=16)
        if not multi:
            tk.Label(hdr, text="Sélection unique",
                     font=("Segoe UI", 9), bg="#070a10",
                     fg=MUTED_C).pack(side="right", padx=4)

        # ── Body ──────────────────────────────────────────────────────────────
        body = tk.Frame(top, bg=MODAL_BG)
        body.pack(fill="both", expand=True)

        # Left sidebar (folders)
        sidebar = tk.Frame(body, bg=SIDEBAR_BG, width=210)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        tk.Frame(sidebar, height=1, bg=BORDER_C).pack(fill="x")
        tk.Label(sidebar, text="DOSSIERS",
                 font=("Segoe UI", 8, "bold"), bg=SIDEBAR_BG,
                 fg=MUTED_C, anchor="w", padx=14, pady=10).pack(fill="x")

        folder_filter = [None]   # [None] = all folders

        # Folder inner (scrollable list)
        folder_inner = tk.Frame(sidebar, bg=SIDEBAR_BG)
        folder_inner.pack(fill="both", expand=True, padx=0)

        # Right area
        right_area = tk.Frame(body, bg=MODAL_BG)
        right_area.pack(side="left", fill="both", expand=True)

        # Scrollable grid
        grid_outer = tk.Frame(right_area, bg=MODAL_BG)
        grid_outer.pack(fill="both", expand=True, padx=0, pady=0)

        grid_canvas = tk.Canvas(grid_outer, bg=MODAL_BG,
                                 highlightthickness=0, bd=0)
        grid_sb = ttk.Scrollbar(grid_outer, orient="vertical",
                                  command=grid_canvas.yview)
        grid_canvas.configure(yscrollcommand=grid_sb.set)
        grid_sb.pack(side="right", fill="y")
        grid_canvas.pack(side="left", fill="both", expand=True)
        grid_inner = tk.Frame(grid_canvas, bg=MODAL_BG)
        grid_win = grid_canvas.create_window((0, 0), window=grid_inner, anchor="nw")

        grid_inner.bind("<Configure>",
            lambda _e: grid_canvas.configure(
                scrollregion=grid_canvas.bbox("all")))
        grid_canvas.bind("<Configure>",
            lambda e: grid_canvas.itemconfig(grid_win, width=e.width))

        def _wheel(e):
            grid_canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        grid_canvas.bind("<MouseWheel>", _wheel)
        grid_inner.bind("<MouseWheel>", _wheel)

        # ── Bottom bar ────────────────────────────────────────────────────────
        bottom = tk.Frame(top, bg="#0a0f1a", height=56)
        bottom.pack(fill="x", side="bottom")
        bottom.pack_propagate(False)

        sel_count_lbl = tk.Label(bottom,
                                  text="Aucune vidéo sélectionnée",
                                  font=("Segoe UI", 9), bg="#0a0f1a",
                                  fg=TEXT2_C)
        sel_count_lbl.pack(side="left", padx=20)

        def _clear_sel():
            for v in selected_paths.values():
                v.set(False)
            _update_bottom()
            _rebuild_grid()

        tk.Button(bottom, text="✕  Effacer",
                  font=("Segoe UI", 9), bg="#0a0f1a", fg=TEXT2_C,
                  relief="flat", cursor="hand2", bd=0,
                  activebackground="#0a0f1a",
                  command=_clear_sel).pack(side="left", padx=4)

        import_btn = tk.Button(bottom, text="Importer (0)",
                                font=("Segoe UI", 10, "bold"),
                                bg=ACCENT_C, fg="#ffffff",
                                relief="flat", cursor="hand2", bd=0,
                                padx=24, pady=10,
                                activebackground="#3d7ae5")
        import_btn.pack(side="right", padx=20, pady=8)

        def _do_import():
            paths = [p for p, v in selected_paths.items() if v.get()]
            top.destroy()
            if paths:
                callback(paths)

        import_btn.configure(command=_do_import)

        def _update_bottom():
            n = sum(1 for v in selected_paths.values() if v.get())
            if n == 0:
                sel_count_lbl.config(text="Aucune vidéo sélectionnée")
            else:
                sel_count_lbl.config(
                    text=f"Sélectionné  {n}",
                    fg=ACCENT_C)
            import_btn.config(text=f"Importer ({n})" if n else "Importer")

        # ── Grid builder ──────────────────────────────────────────────────────
        COLS = 4

        def _rebuild_grid(filter_folder=None):
            for w in list(grid_inner.winfo_children()):
                try:
                    w.destroy()
                except Exception:
                    pass
            bank = load_bank()
            if filter_folder is not None:
                bank = [e for e in bank if e.get("folder", "") == filter_folder]

            if not bank:
                tk.Label(grid_inner,
                         text="Aucune vidéo" + (f' dans "{filter_folder}"'
                                                 if filter_folder else ""),
                         font=("Segoe UI", 11), bg=MODAL_BG,
                         fg=MUTED_C).pack(padx=40, pady=60)
                return

            for idx, entry in enumerate(bank):
                path = entry.get("path", "")
                name = entry.get("filename") or Path(path).name or "—"
                exists = Path(path).exists()
                date_str = entry.get("added_date", "")[:10] if entry.get("added_date") else ""

                if path not in selected_paths:
                    selected_paths[path] = tk.BooleanVar(value=False)
                var = selected_paths[path]

                r, c = divmod(idx, COLS)
                card = tk.Canvas(grid_inner, bg=CARD_BG,
                                  width=150, height=140,
                                  highlightthickness=1,
                                  highlightbackground=BORDER_C,
                                  cursor="hand2")
                card.grid(row=r, column=c, padx=6, pady=6, sticky="nsew")
                grid_inner.grid_columnconfigure(c, weight=1, uniform="pikcol")

                thumb_img_ref = [None]

                def _draw_card(canvas=card, v=var, nm=name, dt=date_str, ex=exists,
                                ref=thumb_img_ref):
                    canvas.delete("all")
                    w2 = canvas.winfo_width() or 150
                    h2 = canvas.winfo_height() or 140
                    is_sel = v.get()
                    bg2 = CARD_SEL if is_sel else CARD_BG

                    # Background
                    canvas.configure(bg=bg2,
                                      highlightbackground=ACCENT_C if is_sel else BORDER_C)

                    # Thumbnail or placeholder
                    if ref[0]:
                        try:
                            canvas.create_image(w2//2, h2//2 - 10,
                                                 image=ref[0], anchor="center")
                        except Exception:
                            pass
                    else:
                        canvas.create_text(w2//2, h2//2 - 10,
                                            text="🎬" if ex else "✗",
                                            font=("Segoe UI", 22),
                                            fill=MUTED_C if ex else "#e05050")

                    # Date top-left
                    if dt:
                        canvas.create_text(8, 6, text=dt,
                                            font=("Segoe UI", 7), fill=TEXT2_C,
                                            anchor="nw")

                    # Checkmark circle top-right
                    cr = 11  # radius
                    cx, cy = w2 - cr - 6, cr + 6
                    if is_sel:
                        canvas.create_oval(cx-cr, cy-cr, cx+cr, cy+cr,
                                            fill=ACCENT_C, outline="")
                        canvas.create_text(cx, cy, text="✓",
                                            font=("Segoe UI", 10, "bold"),
                                            fill="#ffffff")
                    else:
                        canvas.create_oval(cx-cr, cy-cr, cx+cr, cy+cr,
                                            fill="", outline=TEXT2_C, width=1.5)

                    # Filename bottom
                    short = nm[:20] + "…" if len(nm) > 20 else nm
                    canvas.create_text(w2//2, h2 - 12, text=short,
                                        font=("Segoe UI", 8),
                                        fill=TEXT_C if ex else MUTED_C,
                                        anchor="center")

                def _make_toggle(v, draw_fn, canvas):
                    def _toggle(_e=None):
                        if not multi:
                            # single-select: deselect all others
                            for ov in selected_paths.values():
                                ov.set(False)
                            # Redraw all cards
                            for w2 in grid_inner.winfo_children():
                                if hasattr(w2, "_picker_redraw"):
                                    w2._picker_redraw()
                        v.set(not v.get())
                        draw_fn()
                        _update_bottom()
                    return _toggle

                _draw_fn = _draw_card
                card._picker_redraw = _draw_card
                card.bind("<Button-1>", _make_toggle(var, _draw_card, card))
                card.bind("<Configure>", lambda _e, fn=_draw_card: fn())
                top.after(50, _draw_card)

                # Async thumbnail load
                if exists and PIL_OK:
                    def _load(e=entry, ref=thumb_img_ref, fn=_draw_card):
                        img = self._extract_bank_thumb(e)
                        if img is None:
                            return
                        try:
                            img.thumbnail((140, 100), Image.LANCZOS)
                            photo = ImageTk.PhotoImage(img)
                        except Exception:
                            return
                        def _apply(r=ref, ph=photo, draw=fn):
                            r[0] = ph
                            thumb_refs.append(ph)
                            try:
                                draw()
                            except Exception:
                                pass
                        try:
                            top.after(0, _apply)
                        except Exception:
                            pass
                    threading.Thread(target=_load, daemon=True).start()

        # ── Folder sidebar builder ─────────────────────────────────────────────
        def _rebuild_folders():
            for w in list(folder_inner.winfo_children()):
                try:
                    w.destroy()
                except Exception:
                    pass
            bank = load_bank()
            folders = sorted({e.get("folder", "") for e in bank if e.get("folder", "")})

            def _make_row(fld):
                is_all = fld is None
                is_sel = (folder_filter[0] == fld)
                row_bg = "#1a2640" if is_sel else SIDEBAR_BG
                row = tk.Frame(folder_inner, bg=row_bg, cursor="hand2")
                row.pack(fill="x", pady=1)
                lbl = tk.Label(row,
                               text=("🗂  Toute la banque" if is_all else f"📁  {fld}"),
                               font=("Segoe UI", 9, "bold" if is_all else "normal"),
                               bg=row_bg,
                               fg=ACCENT_C if is_sel else TEXT2_C,
                               anchor="w", padx=14, pady=8)
                lbl.pack(fill="x")
                if not is_all:
                    cnt = sum(1 for e in bank if e.get("folder", "") == fld)
                    tk.Label(row, text=str(cnt), font=("Consolas", 8),
                              bg=row_bg, fg=TEXT2_C, padx=8).pack(side="right")

                def _click(_e=None, f=fld):
                    folder_filter[0] = f
                    _rebuild_folders()
                    _rebuild_grid(f)
                for w2 in (row, lbl):
                    w2.bind("<Button-1>", _click)

            _make_row(None)
            for f2 in folders:
                _make_row(f2)

        _rebuild_folders()
        _rebuild_grid()
        _update_bottom()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET POSTING PERMANENT
    # ══════════════════════════════════════════════════════════════════════════
    def _build_posting_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["posting"] = f

        body = tk.Frame(f, bg=BG)
        body.pack(fill="both", expand=True, padx=16, pady=12)

        # ─── LEFT PANEL (260px) — Account selector ───────────────────────────
        left = tk.Frame(body, bg="#0a0d15", width=260)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # Header
        hdr = tk.Frame(left, bg="#0a0d15", padx=12, pady=10)
        hdr.pack(fill="x")
        tk.Label(hdr, text="📱  Comptes", font=("Segoe UI", 11, "bold"), bg="#0a0d15", fg="#e8eaf0").pack(side="left")

        # Group filter
        grp_row = tk.Frame(left, bg="#0a0d15", padx=12)
        grp_row.pack(fill="x", pady=(0, 8))
        tk.Label(grp_row, text="Groupe", font=("Segoe UI", 8), bg="#0a0d15", fg="#6b7a99").pack(side="left")
        self._post_grp_var = tk.StringVar(value="Tous")
        self._post_grp_cb = ttk.Combobox(grp_row, textvariable=self._post_grp_var, state="readonly", width=12, font=("Segoe UI", 8))
        self._post_grp_cb.pack(side="left", padx=(6, 0))

        tk.Frame(left, bg="#141c2e", height=1).pack(fill="x")

        # Scrollable phone list (Instagram-style)
        ph_canvas = tk.Canvas(left, bg="#0a0d15", highlightthickness=0)
        ph_vsb = ttk.Scrollbar(left, orient="vertical", command=ph_canvas.yview)
        ph_inner = tk.Frame(ph_canvas, bg="#0a0d15")
        ph_win = ph_canvas.create_window((0, 0), window=ph_inner, anchor="nw")
        ph_inner.bind("<Configure>", lambda e: ph_canvas.configure(scrollregion=ph_canvas.bbox("all")))
        ph_canvas.bind("<Configure>", lambda e: ph_canvas.itemconfig(ph_win, width=e.width))
        ph_canvas.configure(yscrollcommand=ph_vsb.set)
        ph_vsb.pack(side="right", fill="y")
        ph_canvas.pack(side="left", fill="both", expand=True)

        self._post_pvars = {}

        def _populate_phones(g="Tous"):
            for w in ph_inner.winfo_children():
                w.destroy()
            self._post_pvars.clear()
            groups = set(d.get("group_name", "") for d in self.data.values() if d.get("group_name"))
            self._post_grp_cb["values"] = ["Tous"] + sorted(groups)
            for pid, d in sorted(self.data.items(), key=lambda x: int(x[1].get("serial_no") or 0)):
                name = d.get("phone_name") or d.get("ig_username") or ""
                if not name:
                    continue
                if g != "Tous" and d.get("group_name", "") != g:
                    continue
                var = tk.BooleanVar()
                self._post_pvars[pid] = var
                # Instagram-style account row
                row = tk.Frame(ph_inner, bg="#0a0d15", cursor="hand2")
                row.pack(fill="x")

                # Avatar circle
                av = tk.Canvas(row, bg="#162040", width=36, height=36, highlightthickness=0)
                av.pack(side="left", padx=(12, 8), pady=6)
                av.create_oval(2, 2, 34, 34, fill="#1e3060", outline="")
                ig = d.get("ig_username", "")
                initials = (ig[0].upper() if ig else name[0].upper()) if (ig or name) else "?"
                av.create_text(18, 18, text=initials, font=("Segoe UI", 11, "bold"), fill=ACCENT)

                # Name + handle
                txt_col = tk.Frame(row, bg="#0a0d15")
                txt_col.pack(side="left", fill="x", expand=True)
                tk.Label(txt_col, text=d.get("phone_name", pid), font=("Segoe UI", 9, "bold"), bg="#0a0d15", fg="#c9d1d9", anchor="w").pack(anchor="w")
                if ig:
                    tk.Label(txt_col, text=f"@{ig}", font=("Segoe UI", 8), bg="#0a0d15", fg="#4f8ef7", anchor="w").pack(anchor="w")

                # Checkbox (right side)
                cb = tk.Checkbutton(row, variable=var, bg="#0a0d15", activebackground="#0a0d15",
                                    selectcolor="#162040", fg=ACCENT, activeforeground=ACCENT, cursor="hand2")
                cb.pack(side="right", padx=12)

                # Click entire row
                for w in [row, txt_col, av] + txt_col.winfo_children():
                    try:
                        w.bind("<Button-1>", lambda e, v=var: v.set(not v.get()))
                    except Exception:
                        pass

                # Separator
                tk.Frame(ph_inner, bg="#0d1520", height=1).pack(fill="x", padx=12)

            if not self._post_pvars:
                tk.Label(ph_inner, text="Aucun téléphone.\nAjoute un Bearer Token\ndans Paramètres.",
                         font=("Segoe UI", 9), bg="#0a0d15", fg=MUTED, justify="center").pack(pady=30)

        self._post_populate_phones = _populate_phones
        _populate_phones()
        self._post_grp_cb.bind("<<ComboboxSelected>>", lambda e: _populate_phones(self._post_grp_var.get()))

        # Tout / Aucun
        tk.Frame(left, bg="#141c2e", height=1).pack(fill="x")
        sel_row = tk.Frame(left, bg="#0a0d15", padx=12, pady=8)
        sel_row.pack(fill="x")
        for txt, val in [("Tout", True), ("Aucun", False)]:
            tk.Button(sel_row, text=txt, font=("Segoe UI", 8), bg="#0d1520", fg="#6b7a99",
                      relief="flat", cursor="hand2", padx=10, pady=4,
                      command=lambda v=val: [x.set(v) for x in self._post_pvars.values()]
                      ).pack(side="left", padx=(0, 6))

        # ─── RIGHT PANEL — Instagram "New post" form ─────────────────────────
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(12, 0))

        # Card container
        card_outer, card = self._round_card(right, radius=14, bg="#0b0f1a", border="#1a2235", border_w=1)
        card_outer.pack(fill="both", expand=True)

        # ── Top bar inside card: "Nouveau post" ──────────────────────────────
        top_bar = tk.Frame(card, bg="#0b0f1a", padx=16, pady=12)
        top_bar.pack(fill="x")
        tk.Frame(top_bar, bg="#1a2235", width=1).pack(side="right", fill="y", padx=(16, 0))
        tk.Label(top_bar, text="Nouveau post", font=("Segoe UI", 12, "bold"), bg="#0b0f1a", fg="#e8eaf0").pack(side="left")

        # refresh bank button
        def _post_refresh_bank():
            self._post_bank_entries = load_bank()
        self._post_refresh_bank = _post_refresh_bank
        _post_refresh_bank()

        tk.Button(top_bar, text="↺", font=("Segoe UI", 10), bg="#0b0f1a", fg="#4f8ef7",
                  relief="flat", cursor="hand2", padx=4,
                  command=_post_refresh_bank).pack(side="right")

        tk.Frame(card, bg="#1a2235", height=1).pack(fill="x")

        # Scrollable content inside card
        card_scroll_canvas = tk.Canvas(card, bg="#0b0f1a", highlightthickness=0)
        card_vsb = ttk.Scrollbar(card, orient="vertical", command=card_scroll_canvas.yview)
        card_inner = tk.Frame(card_scroll_canvas, bg="#0b0f1a")
        _win = card_scroll_canvas.create_window((0, 0), window=card_inner, anchor="nw")
        card_inner.bind("<Configure>", lambda e: card_scroll_canvas.configure(scrollregion=card_scroll_canvas.bbox("all")))
        card_scroll_canvas.bind("<Configure>", lambda e: card_scroll_canvas.itemconfig(_win, width=e.width))
        card_scroll_canvas.configure(yscrollcommand=card_vsb.set)
        card_vsb.pack(side="right", fill="y")
        card_scroll_canvas.pack(side="left", fill="both", expand=True)

        # ── Video preview + pick button row ──────────────────────────────────
        media_row = tk.Frame(card_inner, bg="#0b0f1a", padx=16, pady=14)
        media_row.pack(fill="x")

        # Portrait preview canvas (9:16 ratio — 120x213)
        preview_wrap = tk.Frame(media_row, bg="#000000", width=120, height=213,
                                highlightthickness=1, highlightbackground="#1a2235")
        preview_wrap.pack(side="left")
        preview_wrap.pack_propagate(False)

        self._post_preview_canvas = tk.Canvas(preview_wrap, bg="#000000",
                                               highlightthickness=0, width=120, height=213)
        self._post_preview_canvas.pack(fill="both", expand=True)
        self._post_preview_img_ref = None

        self.post_vid_path = [None]
        self._post_bank_entries = []

        def _draw_post_preview(text="Choisir\nune vidéo"):
            cv = self._post_preview_canvas
            cv.delete("all")
            w, h = 120, 213
            for k in range(30):
                tt = k / 29
                rr = int(0x08*(1-tt) + 0x14*tt)
                gg = int(0x0a*(1-tt) + 0x18*tt)
                bb = int(0x14*(1-tt) + 0x2e*tt)
                cv.create_rectangle(0, k*h/30, w, (k+1)*h/30,
                                     fill=f"#{rr:02x}{gg:02x}{bb:02x}", outline="")
            cv.create_text(w//2, h//2-14, text="📹", font=("Segoe UI", 22), fill="#2a3d5a")
            cv.create_text(w//2, h//2+18, text=text, fill="#3a4d66",
                            font=("Segoe UI", 8), justify="center")
        self._post_preview_canvas.bind("<Configure>",
            lambda e: _draw_post_preview() if not self.post_vid_path[0]
                      else self._post_load_preview(self.post_vid_path[0]))
        self._post_draw_preview = _draw_post_preview
        _draw_post_preview()

        # Right of preview: file name + pick button
        pick_info = tk.Frame(media_row, bg="#0b0f1a", padx=14)
        pick_info.pack(side="left", fill="both", expand=True)

        tk.Label(pick_info, text="Vidéo", font=("Segoe UI", 8, "bold"),
                 bg="#0b0f1a", fg="#6b7a99").pack(anchor="w")

        self.post_vid_lbl = tk.Label(pick_info, text="Aucune vidéo sélectionnée",
                                      font=("Segoe UI", 9), bg="#0b0f1a", fg="#6b7a99",
                                      anchor="w", wraplength=200, justify="left")
        self.post_vid_lbl.pack(anchor="w", pady=(2, 10))

        def _post_on_pick(paths):
            if not paths:
                return
            path = paths[0]
            self.post_vid_path[0] = path
            self.post_vid_lbl.config(text=Path(path).name, fg="#c9d1d9")
            bank = load_bank()
            for e in bank:
                if e.get("path") == path:
                    cap = e.get("description") or e.get("caption") or ""
                    self.post_caption_box.delete("1.0", "end")
                    self.post_caption_box.insert("1.0", cap)
                    n = len(cap)
                    self.post_char_lbl.config(text=f"{n} / 2200",
                                               fg=DANGER if n > 2200 else "#6b7a99")
                    break
            self._post_load_preview(path)

        pick_btn = tk.Button(pick_info,
                              text="📂  Choisir depuis la banque",
                              font=("Segoe UI", 9, "bold"),
                              bg=ACCENT, fg="#ffffff",
                              relief="flat", cursor="hand2", bd=0,
                              padx=12, pady=7,
                              activebackground=ACCENT2,
                              command=lambda: self._open_bank_picker(_post_on_pick, multi=False))
        pick_btn.pack(anchor="w", fill="x")

        # ── Caption area ──────────────────────────────────────────────────────
        tk.Frame(card_inner, bg="#1a2235", height=1).pack(fill="x")
        cap_row = tk.Frame(card_inner, bg="#0b0f1a", padx=16, pady=12)
        cap_row.pack(fill="x")
        tk.Label(cap_row, text="Caption", font=("Segoe UI", 8, "bold"),
                 bg="#0b0f1a", fg="#6b7a99").pack(anchor="w", pady=(0, 4))

        self.post_caption_box = tk.Text(cap_row, bg="#080c14", fg="#c9d1d9",
                                         font=("Segoe UI", 10),
                                         relief="flat", height=5, wrap="word",
                                         insertbackground="#4f8ef7",
                                         padx=12, pady=10,
                                         highlightthickness=1,
                                         highlightbackground="#1a2235",
                                         highlightcolor=ACCENT)
        self.post_caption_box.pack(fill="x")
        self.post_char_lbl = tk.Label(cap_row, text="0 / 2200",
                                       font=("Segoe UI", 8), bg="#0b0f1a",
                                       fg="#6b7a99", anchor="e")
        self.post_char_lbl.pack(fill="x", pady=(4, 0))

        def _update_char(*_):
            n = len(self.post_caption_box.get("1.0", "end").strip())
            self.post_char_lbl.config(text=f"{n} / 2200",
                                       fg=DANGER if n > 2200 else "#6b7a99")
        self.post_caption_box.bind("<KeyRelease>", _update_char)

        # ── Generate caption button ───────────────────────────────────────────
        gen_row = tk.Frame(cap_row, bg="#0b0f1a")
        gen_row.pack(fill="x", pady=(8, 0))

        _post_gen_btn = tk.Button(gen_row, text="✨  Générer une description",
                                   font=("Segoe UI", 8, "bold"),
                                   bg="#0d1520", fg="#8b93a8",
                                   relief="flat", cursor="hand2", padx=12, pady=6,
                                   activebackground="#141c2e")
        _post_gen_btn.pack(side="left")

        _post_gen_topic = tk.Entry(gen_row, bg="#080c14", fg="#c9d1d9",
                                    insertbackground="#4f8ef7", relief="flat",
                                    font=("Segoe UI", 8),
                                    highlightthickness=1, highlightbackground="#1a2235")
        _post_gen_topic.insert(0, "sujet / niche…")
        _post_gen_topic.config(fg="#3a4d66")
        _post_gen_topic.pack(side="left", fill="x", expand=True, padx=(8, 0), ipady=4)

        def _topic_focus_in(e):
            if _post_gen_topic.get() == "sujet / niche…":
                _post_gen_topic.delete(0, "end")
                _post_gen_topic.config(fg="#c9d1d9")
        def _topic_focus_out(e):
            if not _post_gen_topic.get().strip():
                _post_gen_topic.insert(0, "sujet / niche…")
                _post_gen_topic.config(fg="#3a4d66")
        _post_gen_topic.bind("<FocusIn>",  _topic_focus_in)
        _post_gen_topic.bind("<FocusOut>", _topic_focus_out)

        def _post_generate():
            existing = self.post_caption_box.get("1.0", "end").strip()
            topic = _post_gen_topic.get().strip()
            if topic == "sujet / niche…":
                topic = ""
            hint = f"Sujet : {topic}." if topic else (f"Contexte : {existing[:80]}." if existing else "")
            if not hint and not self.post_vid_path[0]:
                _post_gen_topic.focus_set()
                return
            vid_hint = f" Vidéo : {Path(self.post_vid_path[0]).stem}." if self.post_vid_path[0] else ""
            prompt = (f"Écris une légende Instagram virale pour un Reel. {hint}{vid_hint} "
                      f"Format : accroche forte (1 ligne), corps (2-3 lignes), CTA, "
                      f"puis 15 hashtags pertinents. Max 220 mots. Réponds uniquement avec la légende.")
            _post_gen_btn.config(text="⏳  Génération…", state="disabled", fg="#4f8ef7")
            def _ok(text):
                self.post_caption_box.delete("1.0", "end")
                self.post_caption_box.insert("1.0", text)
                _update_char()
                _post_gen_btn.config(text="✨  Générer une description", state="normal", fg="#8b93a8")
            def _err(msg):
                _post_gen_btn.config(text="❌  " + msg[:40], state="normal", fg=DANGER)
                self.root.after(3000, lambda: _post_gen_btn.config(
                    text="✨  Générer une description", fg="#8b93a8"))
            self._ai_groq_call(prompt, _ok, _err, max_tokens=350)

        _post_gen_btn.config(command=_post_generate)

        # ── Option rows (Instagram-style) ─────────────────────────────────────
        def _option_row(parent, icon, label, right_widget=None):
            tk.Frame(parent, bg="#1a2235", height=1).pack(fill="x")
            row = tk.Frame(parent, bg="#0b0f1a", padx=16, pady=0)
            row.pack(fill="x")
            tk.Label(row, text=icon, font=("Segoe UI", 12), bg="#0b0f1a", fg="#6b7a99").pack(side="left", pady=12)
            tk.Label(row, text=label, font=("Segoe UI", 10), bg="#0b0f1a", fg="#c9d1d9", padx=10).pack(side="left")
            if right_widget:
                right_widget(row)

        # Delay option
        def _delay_widget(parent):
            tk.Label(parent, text="min", font=("Segoe UI", 9), bg="#0b0f1a", fg="#6b7a99").pack(side="right", padx=(0, 4))
            self.post_stagger_var = tk.IntVar(value=5)
            tk.Spinbox(parent, from_=0, to=120, textvariable=self.post_stagger_var,
                       font=("Segoe UI", 9), bg="#0d1421", fg="#c9d1d9",
                       width=4, relief="flat",
                       buttonbackground="#0d1421",
                       insertbackground="#4f8ef7").pack(side="right", padx=4)

        _option_row(card_inner, "📅", "Délai entre comptes", _delay_widget)

        # ── Progress section ──────────────────────────────────────────────────
        tk.Frame(card_inner, bg="#1a2235", height=1).pack(fill="x")
        prog_wrap = tk.Frame(card_inner, bg="#0b0f1a", padx=16, pady=14)
        prog_wrap.pack(fill="x")

        prog_top = tk.Frame(prog_wrap, bg="#0b0f1a")
        prog_top.pack(fill="x")
        tk.Label(prog_top, text="Progression", font=("Segoe UI", 9, "bold"),
                 bg="#0b0f1a", fg="#6b7a99").pack(side="left")
        self._post_pct_lbl = tk.Label(prog_top, text="",
                                       font=("Consolas", 9, "bold"), bg="#0b0f1a", fg=ACCENT)
        self._post_pct_lbl.pack(side="right")

        self._post_step_lbl = tk.Label(prog_wrap, text="En attente",
                                        font=("Segoe UI", 10, "bold"), bg="#0b0f1a", fg="#c9d1d9")
        self._post_step_lbl.pack(anchor="w", pady=(4, 2))

        self._post_detail_lbl = tk.Label(prog_wrap, text="Sélectionne une vidéo et des comptes",
                                          font=("Segoe UI", 9), bg="#0b0f1a", fg="#6b7a99")
        self._post_detail_lbl.pack(anchor="w", pady=(0, 8))

        # Progress bar
        bar_bg = tk.Frame(prog_wrap, bg="#0d1421", height=6,
                          highlightthickness=0)
        bar_bg.pack(fill="x", pady=(0, 6))
        bar_bg.pack_propagate(False)
        self._post_prog_bar = tk.Canvas(bar_bg, bg="#0d1421", height=6, highlightthickness=0)
        self._post_prog_bar.pack(fill="both", expand=True)
        self._post_prog_pct = [0]
        self._post_prog_target = [0]

        def _animate_bar():
            cur = self._post_prog_pct[0]
            tgt = self._post_prog_target[0]
            if cur < tgt:
                cur = min(tgt, cur + max(1, (tgt - cur) // 6))
                self._post_prog_pct[0] = cur
            w = self._post_prog_bar.winfo_width() or 300
            self._post_prog_bar.delete("all")
            if cur > 0:
                fill_w = max(6, int(w * cur / 100))
                col = OK if cur >= 100 else ACCENT
                self._post_prog_bar.create_rectangle(0, 0, fill_w, 6, fill=col, outline="")
                self._post_prog_bar.create_rectangle(0, 0, fill_w, 2, fill="#ffffff22", outline="")
            self.root.after(30, _animate_bar)
        self.root.after(100, _animate_bar)

        # Log toggle
        log_toggle_btn = tk.Label(prog_wrap, text="▶  Journal détaillé",
                                   font=("Segoe UI", 8), bg="#0b0f1a", fg="#6b7a99",
                                   cursor="hand2")
        log_toggle_btn.pack(anchor="w", pady=(4, 0))
        self._log_visible = [False]

        self.post_log_box = tk.Text(prog_wrap, bg="#080c14", fg="#6b7a99",
                                     font=("Consolas", 8), relief="flat",
                                     state="disabled", wrap="word", height=6,
                                     padx=8, pady=6,
                                     highlightthickness=1, highlightbackground="#1a2235")

        def _toggle_log(e=None):
            if self._log_visible[0]:
                self.post_log_box.pack_forget()
                log_toggle_btn.config(text="▶  Journal détaillé")
                self._log_visible[0] = False
            else:
                self.post_log_box.pack(fill="both", expand=True, pady=(6, 0))
                log_toggle_btn.config(text="▼  Journal détaillé")
                self._log_visible[0] = True
        log_toggle_btn.bind("<Button-1>", _toggle_log)

        def _plog(msg, lv="info"):
            colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
            try:
                self.post_log_box.config(state="normal")
                ts = datetime.now().strftime("%H:%M:%S")
                self.post_log_box.insert("end", f"[{ts}] {msg}\n", lv)
                self.post_log_box.tag_config(lv, foreground=colors.get(lv, TEXT2))
                self.post_log_box.see("end")
                self.post_log_box.config(state="disabled")
            except Exception:
                pass

        def _post_set_progress(pct, step, detail=""):
            col = OK if pct >= 100 else (DANGER if "❌" in detail else ACCENT)
            self._post_prog_target[0] = pct
            self._post_step_lbl.config(text=step, fg="#c9d1d9")
            self._post_pct_lbl.config(text=f"{pct}%", fg=col)
            if detail:
                self._post_detail_lbl.config(text=detail, fg="#6b7a99")
        self._post_set_progress = _post_set_progress

        # ── Share / Launch button ─────────────────────────────────────────────
        tk.Frame(card_inner, bg="#1a2235", height=1).pack(fill="x")
        btn_row = tk.Frame(card_inner, bg="#0b0f1a", padx=16, pady=14)
        btn_row.pack(fill="x")

        self.post_launch_btn = tk.Button(
            btn_row, text="🚀  Lancer le posting",
            font=("Segoe UI", 11, "bold"), bg=ACCENT, fg="#ffffff",
            relief="flat", cursor="hand2", pady=11, bd=0,
            activebackground=ACCENT2, activeforeground="#ffffff")
        self.post_launch_btn.pack(fill="x")
        self._bind_hover(self.post_launch_btn, ACCENT, ACCENT2, "#ffffff", "#ffffff")

        def _do_post():
            sel = [pid for pid, v in self._post_pvars.items() if v.get()]
            if not sel:
                _plog("⚠ Sélectionne au moins un téléphone", "warn")
                _post_set_progress(0, "En attente", "⚠ Sélectionne au moins un téléphone")
                return
            vpath = self.post_vid_path[0]
            if not vpath or not Path(vpath).exists():
                _plog("⚠ Sélectionne une vidéo dans la banque", "warn")
                _post_set_progress(0, "En attente", "⚠ Sélectionne une vidéo dans la banque")
                return
            cap = self.post_caption_box.get("1.0", "end").strip()
            if not cap:
                _plog("⚠ La caption est obligatoire pour GéeLark", "warn")
                _post_set_progress(0, "En attente", "⚠ La caption est obligatoire")
                return
            bearer = self.cfg.get("bearer_token", "")
            if not bearer:
                _plog("❌ Bearer Token GéeLark manquant — va dans Paramètres", "error")
                _post_set_progress(0, "Erreur", "❌ Bearer Token GéeLark manquant")
                return
            stagger = self.post_stagger_var.get()
            job_id = getattr(self, "_post_job_counter", 0) + 1
            self._post_job_counter = job_id
            active = getattr(self, "_post_active_jobs", 0) + 1
            self._post_active_jobs = active
            _update_launch_btn()
            vid_name = Path(vpath).name
            _plog(f"── Job #{job_id} : {vid_name} → {len(sel)} compte(s) ──", "accent")

            def _done(jid=job_id):
                self._post_active_jobs = max(0, getattr(self, "_post_active_jobs", 1) - 1)
                self.root.after(0, _update_launch_btn)
                self.root.after(0, lambda: _plog(f"── Job #{jid} terminé ──", "accent"))
                n_phones = len(sel)
                self.root.after(0, lambda: self._show_toast(
                    "✅ Posting terminé",
                    f"Job #{jid} · {n_phones} compte(s) · Reel publié",
                    col=OK))
                self.root.after(0, self._play_notify_sound)

            _post_set_progress(0, "Démarrage...", "Initialisation du posting...")
            threading.Thread(
                target=self._upload_and_post,
                args=(sel, bearer, cap, vpath, _plog, stagger, _done),
                kwargs={"progress_fn": _post_set_progress},
                daemon=True).start()

        def _update_launch_btn():
            n = getattr(self, "_post_active_jobs", 0)
            if not self.post_launch_btn.winfo_exists():
                return
            if n == 0:
                self.post_launch_btn.config(text="🚀  Lancer le posting")
            else:
                self.post_launch_btn.config(text=f"🚀  Lancer  ({n} en cours)")

        self.post_launch_btn.config(command=_do_post)

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET MASS POSTING
    # ══════════════════════════════════════════════════════════════════════════
    def _build_masspost_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["masspost"] = f

        L = self.cfg.get("lang", "fr")

        body = tk.Frame(f, bg=BG)
        body.pack(fill="both", expand=True, padx=16, pady=12)

        # ══════════════════════════════════════════════════════════════════════
        # LEFT PANEL (260px) — Video pool + caption
        # ══════════════════════════════════════════════════════════════════════
        left = tk.Frame(body, bg="#0a0d15", width=260)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # Header
        mp_lhdr = tk.Frame(left, bg="#0a0d15", padx=12, pady=10)
        mp_lhdr.pack(fill="x")
        tk.Label(mp_lhdr, text="📹  Pool de vidéos",
                 font=("Segoe UI", 11, "bold"), bg="#0a0d15", fg="#e8eaf0").pack(side="left")

        tk.Frame(left, bg="#141c2e", height=1).pack(fill="x")

        linner = tk.Frame(left, bg="#0a0d15", padx=12, pady=10)
        linner.pack(fill="both", expand=True)

        # Video pool state
        self._mp_vid_paths = []
        self._mp_bank_card_vars = {}
        self._mp_bank_thumb_refs = []
        self._mp_vid_lb = None
        self._mp_selected_vid = [None]  # currently previewed video path

        self._mp_sel_count_lbl = tk.Label(linner, text="Aucune vidéo — clique pour prévisualiser",
                                           font=("Segoe UI", 8), bg="#0a0d15",
                                           fg="#6b7a99", anchor="w", wraplength=220)
        self._mp_sel_count_lbl.pack(fill="x", pady=(0, 4))

        # ── Video preview (portrait 9:16, hidden until a video is selected) ───
        _mp_preview_wrap = tk.Frame(linner, bg="#000000", width=108, height=192,
                                     highlightthickness=1, highlightbackground="#1a2235")
        _mp_preview_wrap.pack(pady=(0, 6))
        _mp_preview_wrap.pack_propagate(False)
        _mp_preview_cv = tk.Canvas(_mp_preview_wrap, bg="#000000",
                                    highlightthickness=0, width=108, height=192)
        _mp_preview_cv.pack(fill="both", expand=True)
        self._mp_preview_img_ref = None

        def _mp_draw_empty_preview(text="Clique sur\nune vidéo"):
            _mp_preview_cv.delete("all")
            w, h = 108, 192
            for k in range(20):
                tt = k / 19
                rr = int(0x08*(1-tt)+0x12*tt)
                gg = int(0x0a*(1-tt)+0x16*tt)
                bb = int(0x14*(1-tt)+0x28*tt)
                _mp_preview_cv.create_rectangle(0, k*h/20, w, (k+1)*h/20,
                                                 fill=f"#{rr:02x}{gg:02x}{bb:02x}", outline="")
            _mp_preview_cv.create_text(w//2, h//2-10, text="📹", font=("Segoe UI", 18), fill="#2a3d5a")
            _mp_preview_cv.create_text(w//2, h//2+20, text=text, fill="#3a4d66",
                                        font=("Segoe UI", 7), justify="center")

        _mp_draw_empty_preview()

        def _mp_load_preview(path):
            # Runs in background thread — all tkinter calls go through after(0,...)
            import tempfile, os as _os
            tmp_path = None
            try:
                from PIL import Image, ImageTk
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    tmp_path = tmp.name
                ffmpeg = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"
                result = subprocess.run(
                    [ffmpeg, "-y", "-i", path, "-ss", "00:00:01", "-vframes", "1",
                     "-vf", "scale=108:192:force_original_aspect_ratio=increase,crop=108:192",
                     tmp_path],
                    capture_output=True, timeout=10)
                if _os.path.exists(tmp_path) and _os.path.getsize(tmp_path) > 0:
                    img   = Image.open(tmp_path).resize((108, 192), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(img)
                    try:
                        _os.unlink(tmp_path)
                    except Exception:
                        pass
                    def _show(ph=photo):
                        self._mp_preview_img_ref = ph
                        _mp_preview_cv.delete("all")
                        _mp_preview_cv.create_image(0, 0, anchor="nw", image=ph)
                    self.root.after(0, _show)
                else:
                    stem = Path(path).stem[:12]
                    self.root.after(0, lambda s=stem: _mp_draw_empty_preview(s))
            except Exception:
                stem = Path(path).stem[:12]
                self.root.after(0, lambda s=stem: _mp_draw_empty_preview(s))
                if tmp_path:
                    try:
                        import os as _os2; _os2.unlink(tmp_path)
                    except Exception:
                        pass

        # ── Scrollable video list ─────────────────────────────────────────────
        _mp_list_outer = tk.Frame(linner, bg="#0d1520",
                                   highlightthickness=1, highlightbackground="#141c2e")
        _mp_list_outer.pack(fill="x", pady=(0, 6))
        self._mp_pool_canvas = tk.Canvas(_mp_list_outer, bg="#0d1520",
                                          highlightthickness=0, bd=0, height=100)
        _pool_sb = ttk.Scrollbar(_mp_list_outer, orient="vertical",
                                   command=self._mp_pool_canvas.yview)
        self._mp_pool_canvas.configure(yscrollcommand=_pool_sb.set)
        _pool_sb.pack(side="right", fill="y")
        self._mp_pool_canvas.pack(side="left", fill="both", expand=True)
        self._mp_pool_inner = tk.Frame(self._mp_pool_canvas, bg="#0d1520")
        self._mp_pool_win = self._mp_pool_canvas.create_window(
            (0, 0), window=self._mp_pool_inner, anchor="nw")
        self._mp_pool_inner.bind(
            "<Configure>",
            lambda _e: self._mp_pool_canvas.configure(
                scrollregion=self._mp_pool_canvas.bbox("all")))
        self._mp_pool_canvas.bind(
            "<Configure>",
            lambda e: self._mp_pool_canvas.itemconfig(
                self._mp_pool_win, width=e.width))

        def _mp_pool_wheel(e):
            self._mp_pool_canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        self._mp_pool_canvas.bind("<MouseWheel>", _mp_pool_wheel)
        self._mp_pool_inner.bind("<MouseWheel>", _mp_pool_wheel)

        def _mp_select_video(path):
            """Click on a video row: load its thumbnail preview and sync its caption."""
            self._mp_selected_vid[0] = path
            # Preview in background thread (all canvas calls marshalled via after(0,...))
            threading.Thread(target=_mp_load_preview, args=(path,), daemon=True).start()
            # Always sync caption to this video's bank entry (clear if no caption)
            cap = ""
            try:
                bank = load_bank()
                for entry in bank:
                    if entry.get("path") == path:
                        cap = entry.get("description") or entry.get("caption") or ""
                        break
            except Exception:
                pass
            self._mp_cap_box.delete("1.0", "end")
            if cap:
                self._mp_cap_box.insert("1.0", cap)

        def _mp_on_pick(paths):
            self._mp_vid_paths = list(paths)
            self._mp_bank_card_vars = {p: tk.BooleanVar(value=True) for p in paths}
            n = len(paths)
            self._mp_sel_count_lbl.config(
                text=f"{n} vidéo{'s' if n != 1 else ''} · clique pour prévisualiser" if n else
                     "Aucune vidéo — clique pour prévisualiser",
                fg=ACCENT if n else "#6b7a99")
            for w2 in list(self._mp_pool_inner.winfo_children()):
                try:
                    w2.destroy()
                except Exception:
                    pass
            if not paths:
                _mp_draw_empty_preview()
                self._mp_selected_vid[0] = None
            for i, p in enumerate(paths):
                nm = Path(p).name
                short = nm[:28] + "…" if len(nm) > 28 else nm
                vrow = tk.Frame(self._mp_pool_inner, bg="#0d1520", cursor="hand2")
                vrow.pack(fill="x", padx=2, pady=1)
                num_lbl  = tk.Label(vrow, text=f"{i+1}.", font=("Consolas", 8),
                                    bg="#0d1520", fg="#3a4d66", width=3)
                num_lbl.pack(side="left")
                play_lbl = tk.Label(vrow, text="▶", font=("Segoe UI", 7),
                                    bg="#0d1520", fg=ACCENT)
                play_lbl.pack(side="left", padx=(0, 4))
                name_lbl = tk.Label(vrow, text=short, font=("Segoe UI", 8),
                                    bg="#0d1520", fg="#c9d1d9", anchor="w")
                name_lbl.pack(side="left", fill="x")
                for w2 in [vrow, num_lbl, play_lbl, name_lbl]:
                    w2.bind("<Button-1>", lambda e, _p=p: _mp_select_video(_p))
                    w2.bind("<Enter>",    lambda e, r=vrow: r.config(bg="#111827") or
                            [c.config(bg="#111827") for c in r.winfo_children()])
                    w2.bind("<Leave>",    lambda e, r=vrow: r.config(bg="#0d1520") or
                            [c.config(bg="#0d1520") for c in r.winfo_children()])
            # Auto-select first video
            if paths:
                _mp_select_video(paths[0])
            try:
                self._mp_rebuild_assign()
            except Exception:
                pass

        # Bank picker button
        tk.Button(linner,
                   text="📂  Sélectionner depuis la banque",
                   font=("Segoe UI", 9, "bold"),
                   bg=ACCENT, fg="#ffffff",
                   relief="flat", cursor="hand2", bd=0,
                   padx=12, pady=8,
                   activebackground=ACCENT2,
                   command=lambda: self._open_bank_picker(_mp_on_pick, multi=True)
                   ).pack(fill="x", pady=(0, 3))

        def _mp_clear():
            _mp_on_pick([])
        tk.Button(linner, text="✕  Vider la sélection",
                  font=("Segoe UI", 8), bg="#0d1520", fg="#6b7a99",
                  relief="flat", cursor="hand2", padx=8, pady=3,
                  command=_mp_clear).pack(fill="x", pady=(0, 4))

        # ── Caption + Generate ────────────────────────────────────────────────
        tk.Frame(left, bg="#141c2e", height=1).pack(fill="x")
        cap_section = tk.Frame(left, bg="#0a0d15", padx=12, pady=10)
        cap_section.pack(fill="x")

        cap_hdr = tk.Frame(cap_section, bg="#0a0d15")
        cap_hdr.pack(fill="x", pady=(0, 6))
        tk.Label(cap_hdr, text="💬  Caption", font=("Segoe UI", 9, "bold"),
                 bg="#0a0d15", fg="#e8eaf0").pack(side="left")

        self._mp_cap_box = tk.Text(cap_section, bg="#0d1520", fg="#c9d1d9",
                                    insertbackground="#c9d1d9", relief="flat",
                                    height=4, font=("Segoe UI", 9), wrap="word",
                                    highlightthickness=1, highlightbackground="#141c2e",
                                    highlightcolor=ACCENT)
        self._mp_cap_box.pack(fill="x")
        tk.Label(cap_section, text="Partagée entre tous les téléphones",
                 font=("Segoe UI", 7), bg="#0a0d15", fg="#3a4d66").pack(anchor="w", pady=(3, 6))

        # Generate description button
        _mp_gen_btn = tk.Button(cap_section, text="✨  Générer une description",
                                 font=("Segoe UI", 8, "bold"),
                                 bg="#0d1520", fg="#8b93a8",
                                 relief="flat", cursor="hand2", padx=10, pady=5,
                                 activebackground="#141c2e")
        _mp_gen_btn.pack(fill="x", pady=(0, 4))

        def _mp_generate_caption():
            vid = self._mp_selected_vid[0]
            existing = self._mp_cap_box.get("1.0", "end").strip()
            vid_hint = f" Vidéo : {Path(vid).stem}." if vid else ""
            ctx_hint = f" Contexte : {existing[:80]}." if existing else ""
            if not vid and not existing:
                _mp_gen_btn.config(text="⚠  Sélectionne une vidéo d'abord", fg=WARN)
                self.root.after(2500, lambda: _mp_gen_btn.config(
                    text="✨  Générer une description", fg="#8b93a8"))
                return
            prompt = (f"Écris une légende Instagram virale pour un Reel.{vid_hint}{ctx_hint} "
                      f"Format : accroche forte (1 ligne), corps (2-3 lignes), CTA, "
                      f"puis 15 hashtags pertinents. Max 220 mots. Réponds uniquement avec la légende.")
            _mp_gen_btn.config(text="⏳  Génération…", state="disabled", fg="#4f8ef7")
            def _ok(text):
                self._mp_cap_box.delete("1.0", "end")
                self._mp_cap_box.insert("1.0", text)
                _mp_gen_btn.config(text="✨  Générer une description", state="normal", fg="#8b93a8")
            def _err(msg):
                _mp_gen_btn.config(text="❌  " + msg[:38], state="normal", fg=DANGER)
                self.root.after(3000, lambda: _mp_gen_btn.config(
                    text="✨  Générer une description", fg="#8b93a8"))
            self._ai_groq_call(prompt, _ok, _err, max_tokens=350)

        _mp_gen_btn.config(command=_mp_generate_caption)

        # ══════════════════════════════════════════════════════════════════════
        # RIGHT PANEL — Instagram "New post" style card
        # ══════════════════════════════════════════════════════════════════════
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(12, 0))

        card_outer, card = self._round_card(right, radius=14, bg="#0b0f1a",
                                             border="#1a2235", border_w=1)
        card_outer.pack(fill="both", expand=True)

        # ── Bottom buttons packed FIRST (side=bottom) ────────────────────────
        tk.Frame(card, bg="#1a2235", height=1).pack(side="bottom", fill="x")
        btn_row = tk.Frame(card, bg="#0b0f1a", padx=16, pady=12)
        btn_row.pack(side="bottom", fill="x")

        # ── Top bar ──────────────────────────────────────────────────────────
        top_bar = tk.Frame(card, bg="#0b0f1a", padx=16, pady=14)
        top_bar.pack(fill="x")
        tk.Label(top_bar, text="Mass Posting", font=("Segoe UI", 13, "bold"),
                 bg="#0b0f1a", fg="#e8eaf0").pack(side="left")
        tk.Label(top_bar, text="1 vidéo / téléphone", font=("Segoe UI", 8),
                 bg="#0b0f1a", fg="#6b7a99").pack(side="left", padx=(10, 0))
        tk.Frame(card, bg="#1a2235", height=1).pack(fill="x")

        # ── Single scrollable column — NO nested canvases ────────────────────
        # scroll_wrap isolates the side=left/right from card's pack manager
        scroll_wrap = tk.Frame(card, bg="#0b0f1a")
        scroll_wrap.pack(fill="both", expand=True)
        rscroll_vsb = ttk.Scrollbar(scroll_wrap, orient="vertical")
        rscroll_cv  = tk.Canvas(scroll_wrap, bg="#0b0f1a", highlightthickness=0,
                                yscrollcommand=rscroll_vsb.set)
        rscroll_vsb.config(command=rscroll_cv.yview)
        rscroll_inner = tk.Frame(rscroll_cv, bg="#0b0f1a")
        _rwin = rscroll_cv.create_window((0, 0), window=rscroll_inner, anchor="nw")
        rscroll_inner.bind("<Configure>",
                           lambda e: rscroll_cv.configure(scrollregion=rscroll_cv.bbox("all")))
        rscroll_cv.bind("<Configure>",
                        lambda e: rscroll_cv.itemconfig(_rwin, width=e.width))
        rscroll_vsb.pack(side="right", fill="y")
        rscroll_cv.pack(side="left", fill="both", expand=True)

        # ── Utility: Instagram-style option row ───────────────────────────────
        def _ig_row(parent, icon, label, right_fn=None, last=False):
            row = tk.Frame(parent, bg="#0b0f1a", padx=16, pady=12)
            row.pack(fill="x")
            tk.Label(row, text=icon, font=("Segoe UI", 12), bg="#0b0f1a", fg="#8b93a8").pack(side="left", padx=(0, 10))
            tk.Label(row, text=label, font=("Segoe UI", 9), bg="#0b0f1a", fg="#c9d1d9").pack(side="left")
            if right_fn:
                right_fn(row)
            if not last:
                tk.Frame(parent, bg="#1a2235", height=1).pack(fill="x")
            return row

        # ── Phone selector ────────────────────────────────────────────────────
        ph_hdr = tk.Frame(rscroll_inner, bg="#0b0f1a", padx=16, pady=12)
        ph_hdr.pack(fill="x")
        tk.Label(ph_hdr, text="📱", font=("Segoe UI", 12), bg="#0b0f1a", fg="#8b93a8").pack(side="left", padx=(0, 10))
        tk.Label(ph_hdr, text="Téléphones cibles", font=("Segoe UI", 9, "bold"),
                 bg="#0b0f1a", fg="#c9d1d9").pack(side="left")
        for txt, val in [("Tout", True), ("Aucun", False)]:
            tk.Button(ph_hdr, text=txt, font=("Segoe UI", 8), bg="#0d1520", fg="#6b7a99",
                      relief="flat", cursor="hand2", padx=10, pady=3,
                      command=lambda v=val: [x.set(v) for x in self._mp_phone_vars.values()]
                      ).pack(side="right", padx=(4, 0))
        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # Phone rows go directly here — no nested canvas
        self._mp_phone_inner  = tk.Frame(rscroll_inner, bg="#0b0f1a")
        self._mp_phone_inner.pack(fill="x")
        self._mp_phone_vars   = {}
        self._mp_phone_canvas = None  # no nested canvas

        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # ── Assignment table ──────────────────────────────────────────────────
        assign_hdr = tk.Frame(rscroll_inner, bg="#0b0f1a", padx=16, pady=12)
        assign_hdr.pack(fill="x")
        tk.Label(assign_hdr, text="🎯", font=("Segoe UI", 12), bg="#0b0f1a", fg="#8b93a8").pack(side="left", padx=(0, 10))
        tk.Label(assign_hdr, text="Assignation automatique", font=("Segoe UI", 9, "bold"),
                 bg="#0b0f1a", fg="#c9d1d9").pack(side="left")
        self._mp_assign_count = tk.Label(assign_hdr, text="", font=("Segoe UI", 8),
                                          bg="#0b0f1a", fg="#6b7a99")
        self._mp_assign_count.pack(side="right")
        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # Assignment rows go directly here — no nested canvas
        self._mp_assign_inner = tk.Frame(rscroll_inner, bg="#0b0f1a")
        self._mp_assign_inner.pack(fill="x")
        self._mp_assign_cv    = None  # no nested canvas

        def _mp_rebuild_assign():
            for w in self._mp_assign_inner.winfo_children():
                w.destroy()
            phones = [pid for pid, v in self._mp_phone_vars.items() if v.get()]
            vids   = self._mp_vid_paths
            if not phones or not vids:
                tk.Label(self._mp_assign_inner,
                         text="Sélectionne des téléphones et ajoute des vidéos",
                         font=("Segoe UI", 8), bg="#0b0f1a", fg="#3a4d66").pack(padx=16, pady=10)
                self._mp_assign_count.config(text="")
                return
            self._mp_assign_count.config(
                text=f"{len(phones)} tél · {len(vids)} vidéo{'s' if len(vids)!=1 else ''}")
            # Column header
            hrow = tk.Frame(self._mp_assign_inner, bg="#0c111a")
            hrow.pack(fill="x")
            tk.Label(hrow, text="TÉLÉPHONE", font=("Consolas", 7, "bold"),
                     bg="#0c111a", fg="#3a4d66", anchor="w").pack(
                     side="left", padx=(16, 0), pady=5, fill="x", expand=True)
            tk.Label(hrow, text="VIDÉO ASSIGNÉE", font=("Consolas", 7, "bold"),
                     bg="#0c111a", fg="#3a4d66", anchor="w").pack(
                     side="left", padx=(0, 16), pady=5, fill="x", expand=True)
            for i, pid in enumerate(phones):
                vid_name   = Path(vids[i % len(vids)]).name
                phone_name = self.data.get(pid, {}).get("phone_name", pid)
                ig         = self.data.get(pid, {}).get("ig_username", "")
                row_bg = "#0b0f1a" if i % 2 == 0 else "#0d1122"
                drow = tk.Frame(self._mp_assign_inner, bg=row_bg)
                drow.pack(fill="x")
                p_cell = tk.Frame(drow, bg=row_bg)
                p_cell.pack(side="left", fill="x", expand=True, padx=(16, 8), pady=5)
                tk.Label(p_cell, text=phone_name[:24], font=("Segoe UI", 8, "bold"),
                         bg=row_bg, fg="#c9d1d9", anchor="w").pack(anchor="w")
                if ig:
                    tk.Label(p_cell, text=f"@{ig}", font=("Segoe UI", 7),
                             bg=row_bg, fg="#4f8ef7", anchor="w").pack(anchor="w")
                v_cell = tk.Frame(drow, bg=row_bg)
                v_cell.pack(side="left", fill="x", expand=True, padx=(0, 16), pady=5)
                tk.Label(v_cell, text=f"▶  {vid_name[:32]}", font=("Segoe UI", 8),
                         bg=row_bg, fg=ACCENT, anchor="w").pack(anchor="w")
            rscroll_cv.after_idle(
                lambda: rscroll_cv.configure(scrollregion=rscroll_cv.bbox("all")))

        self._mp_rebuild_assign = _mp_rebuild_assign
        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # ── Config ────────────────────────────────────────────────────────────
        self._mp_max_var     = tk.IntVar(value=20)
        self._mp_stagger_var = tk.IntVar(value=5)
        self._mp_mode_var    = tk.StringVar(value="Séquentiel")

        for lbl, icon, var, frm, to in [
            ("Max simultanés", "⚡", self._mp_max_var, 1, 50),
            ("Délai entre posts (min)", "⏱", self._mp_stagger_var, 0, 60),
        ]:
            def _make_spinbox(parent, _var=var, _frm=frm, _to=to):
                tk.Spinbox(parent, from_=_frm, to=_to, textvariable=_var, width=5,
                           bg="#0d1520", fg="#c9d1d9", relief="flat", font=("Segoe UI", 9),
                           bd=0, buttonbackground="#141c2e",
                           highlightthickness=1, highlightbackground="#1a2235",
                           insertbackground="#c9d1d9").pack(side="right")
            _ig_row(rscroll_inner, icon, lbl, right_fn=_make_spinbox)

        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # ── Progress rows (direct frame, no canvas) ───────────────────────────
        prog_hdr = tk.Frame(rscroll_inner, bg="#0b0f1a", padx=16, pady=12)
        prog_hdr.pack(fill="x")
        tk.Label(prog_hdr, text="📊", font=("Segoe UI", 12), bg="#0b0f1a", fg="#8b93a8").pack(side="left", padx=(0, 10))
        tk.Label(prog_hdr, text="Progression", font=("Segoe UI", 9, "bold"),
                 bg="#0b0f1a", fg="#c9d1d9").pack(side="left")
        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        self._mp_prog_inner  = tk.Frame(rscroll_inner, bg="#0b0f1a")
        self._mp_prog_inner.pack(fill="x")
        self._mp_prog_labels = {}

        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        # ── Log (only this needs its own scrollbar) ───────────────────────────
        log_hdr = tk.Frame(rscroll_inner, bg="#0b0f1a", padx=16, pady=10)
        log_hdr.pack(fill="x")
        tk.Label(log_hdr, text="📋", font=("Segoe UI", 12), bg="#0b0f1a", fg="#8b93a8").pack(side="left", padx=(0, 10))
        tk.Label(log_hdr, text="Log", font=("Segoe UI", 9, "bold"),
                 bg="#0b0f1a", fg="#c9d1d9").pack(side="left")
        tk.Button(log_hdr, text="Effacer", font=("Segoe UI", 8), bg="#0d1520", fg="#6b7a99",
                  relief="flat", cursor="hand2", padx=8, pady=2,
                  command=self._mp_log_clear).pack(side="right")
        tk.Frame(rscroll_inner, bg="#1a2235", height=1).pack(fill="x")

        log_wrap = tk.Frame(rscroll_inner, bg="#080c14", height=200)
        log_wrap.pack(fill="x")
        log_wrap.pack_propagate(False)
        log_vsb = ttk.Scrollbar(log_wrap, orient="vertical")
        self._mp_log_box = tk.Text(log_wrap, bg="#080c14", fg="#8b93a8",
                                    relief="flat", state="disabled", font=("Consolas", 8),
                                    wrap="word", insertbackground="#c9d1d9",
                                    yscrollcommand=log_vsb.set, highlightthickness=0)
        log_vsb.config(command=self._mp_log_box.yview)
        log_vsb.pack(side="right", fill="y")
        self._mp_log_box.pack(side="left", fill="both", expand=True, padx=(12, 0), pady=8)
        for tag, col in [("ok", OK), ("warn", WARN), ("error", DANGER),
                         ("accent", ACCENT), ("info", "#6b7a99")]:
            self._mp_log_box.tag_config(tag, foreground=col)

        tk.Frame(rscroll_inner, bg="#0b0f1a", height=16).pack(fill="x")

        self._mp_running   = [False]
        self._mp_stop_flag = [False]

        def _launch():
            if self._mp_running[0]:
                return
            vids   = list(self._mp_vid_paths)
            phones = [pid for pid, v in self._mp_phone_vars.items() if v.get()]
            cap    = self._mp_cap_box.get("1.0", "end").strip()
            if not vids:
                messagebox.showwarning("Mass Posting",
                    "Ajoute au moins une vidéo dans le pool.")
                return
            if not phones:
                messagebox.showwarning("Mass Posting",
                    "Sélectionne au moins un téléphone.")
                return
            bearer = self.cfg.get("bearer_token", "") or self.cfg.get("geelark_token", "")
            if not bearer:
                messagebox.showwarning("Mass Posting",
                    "Bearer Token GéeLark manquant — Paramètres → API Keys.")
                return
            self._mp_running[0]   = True
            self._mp_stop_flag[0] = False
            self._mp_launch_btn.config(state="disabled")
            self._mp_stop_btn.config(state="normal")
            self._mp_log_clear()
            self._mp_progress_clear(phones)
            captions = [cap] if cap else [""]
            threading.Thread(target=self._run_mass_post,
                             args=(phones, vids, captions, bearer),
                             daemon=True).start()

        def _stop():
            self._mp_stop_flag[0] = True
            self._mp_log("⏹ Arrêt demandé...", "warn")
            self._mp_stop_btn.config(state="disabled")

        self._mp_launch_btn = tk.Button(
            btn_row, text="⚡  Lancer le Mass Posting",
            font=("Segoe UI", 11, "bold"),
            bg=ACCENT, fg="#ffffff", relief="flat", cursor="hand2",
            padx=16, pady=12, activebackground=ACCENT2,
            command=_launch)
        self._mp_launch_btn.pack(side="left", fill="x", expand=True, padx=(0, 8))

        self._mp_stop_btn = tk.Button(
            btn_row, text="⏹  Arrêter",
            font=("Segoe UI", 11, "bold"),
            bg=DANGER, fg="#ffffff", relief="flat", cursor="hand2",
            padx=16, pady=12, activebackground="#cc2233",
            state="disabled", command=_stop)
        self._mp_stop_btn.pack(side="left", fill="x", expand=True)

        self._mp_needs_phone_refresh = True

    def _mp_refresh_phones(self):
        for w in self._mp_phone_inner.winfo_children():
            w.destroy()
        self._mp_phone_vars.clear()
        phones = [(pid, d) for pid, d in self.data.items() if d.get("phone_name")]
        phones.sort(key=lambda x: x[1].get("phone_name", ""))

        def _on_check():
            try:
                self._mp_rebuild_assign()
            except Exception:
                pass

        for pid, d in phones:
            name = d.get("phone_name", pid)
            ig = d.get("ig_username", "")
            v = tk.BooleanVar(value=False)
            self._mp_phone_vars[pid] = v

            row = tk.Frame(self._mp_phone_inner, bg="#0b0f1a", cursor="hand2")
            row.pack(fill="x")

            # Avatar
            av = tk.Canvas(row, bg="#162040", width=32, height=32, highlightthickness=0)
            av.pack(side="left", padx=(12, 8), pady=5)
            av.create_oval(2, 2, 30, 30, fill="#1e3060", outline="")
            initials = (ig[0].upper() if ig else name[0].upper()) if (ig or name) else "?"
            av.create_text(16, 16, text=initials, font=("Segoe UI", 10, "bold"), fill=ACCENT)

            # Name + handle
            txt_col = tk.Frame(row, bg="#0b0f1a")
            txt_col.pack(side="left", fill="x", expand=True)
            tk.Label(txt_col, text=name[:24], font=("Segoe UI", 8, "bold"),
                     bg="#0b0f1a", fg="#c9d1d9", anchor="w").pack(anchor="w")
            if ig:
                tk.Label(txt_col, text=f"@{ig}", font=("Segoe UI", 7),
                         bg="#0b0f1a", fg="#4f8ef7", anchor="w").pack(anchor="w")

            cb = tk.Checkbutton(row, variable=v, command=_on_check,
                                bg="#0b0f1a", activebackground="#0b0f1a",
                                selectcolor="#162040", fg=ACCENT,
                                activeforeground=ACCENT, cursor="hand2")
            cb.pack(side="right", padx=10)

            for w2 in [row, txt_col, av] + txt_col.winfo_children():
                try:
                    w2.bind("<Button-1>", lambda e, vr=v: vr.set(not vr.get()) or _on_check())
                except Exception:
                    pass

            tk.Frame(self._mp_phone_inner, bg="#0d1520", height=1).pack(fill="x", padx=12)

        if not phones:
            tk.Label(self._mp_phone_inner, text="Aucun téléphone.\nAjoute un Bearer Token.",
                     font=("Segoe UI", 8), bg="#0b0f1a", fg="#3a4d66",
                     justify="center").pack(pady=20)

        try:
            self._mp_rebuild_assign()
        except Exception:
            pass

    def _mp_sync_vid_paths(self):
        """Sync self._mp_vid_paths from checked bank card vars, then rebuild assign."""
        self._mp_vid_paths = [p for p, v in self._mp_bank_card_vars.items() if v.get()]
        try:
            self._mp_rebuild_assign()
        except Exception:
            pass

    def _mp_refresh_bank_pool(self):
        """No-op: pool is now managed via the bank picker modal."""
        pass

    def _ai_groq_call(self, prompt, on_success, on_error, max_tokens=400):
        """Background Groq API call. Calls on_success(text) or on_error(msg) on main thread."""
        def run():
            try:
                try:
                    from groq import Groq
                except ImportError:
                    subprocess.run(
                        [sys.executable, "-m", "pip", "install", "groq", "--quiet"],
                        capture_output=True, timeout=60)
                    from groq import Groq
                key = self.cfg.get("groq_api_key", "")
                if not key:
                    raise ValueError("Clé API Groq manquante → Paramètres > API Keys")
                client = Groq(api_key=key)
                resp = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=max_tokens)
                result = resp.choices[0].message.content.strip()
                self.root.after(0, lambda r=result: on_success(r))
            except Exception as ex:
                msg = str(ex)
                self.root.after(0, lambda m=msg: on_error(m))
        threading.Thread(target=run, daemon=True).start()

    def _mp_log(self, msg, level="info"):
        colors = {"ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT, "info": TEXT2}
        ts = datetime.now().strftime("%H:%M:%S")
        self._mp_log_box.config(state="normal")
        self._mp_log_box.insert("end", f"[{ts}] {msg}\n", level)
        self._mp_log_box.tag_config(level, foreground=colors.get(level, TEXT2))
        self._mp_log_box.see("end")
        self._mp_log_box.config(state="disabled")

    def _mp_log_clear(self):
        self._mp_log_box.config(state="normal")
        self._mp_log_box.delete("1.0", "end")
        self._mp_log_box.config(state="disabled")

    def _mp_progress_clear(self, phone_ids):
        for w in self._mp_prog_inner.winfo_children():
            w.destroy()
        self._mp_prog_labels.clear()
        for pid in phone_ids:
            name = self.data.get(pid, {}).get("phone_name", pid)
            row = tk.Frame(self._mp_prog_inner, bg=CARD)
            row.pack(fill="x", pady=1)
            tk.Label(row, text=f"📱 {name[:24]}", font=("Segoe UI", 9),
                     bg=CARD, fg=TEXT2, width=26, anchor="w").pack(side="left")
            lbl = tk.Label(row, text="⏳ En attente", font=("Segoe UI", 9),
                           bg=CARD, fg=TEXT2, anchor="w")
            lbl.pack(side="left")
            self._mp_prog_labels[pid] = lbl

    def _mp_set_status(self, pid, text, col):
        lbl = self._mp_prog_labels.get(pid)
        if lbl:
            try:
                self.root.after(0, lambda l=lbl, t=text, c=col: l.config(text=t, fg=c))
            except Exception:
                pass

    def _run_mass_post(self, phone_ids, video_paths, captions, bearer):
        api_hdrs = {"Content-Type": "application/json",
                    "Authorization": f"Bearer {bearer}"}
        mode = self._mp_mode_var.get()
        stagger_min = self._mp_stagger_var.get()
        max_workers = min(self._mp_max_var.get(), len(phone_ids))

        def done():
            self._mp_running[0] = False
            try:
                self.root.after(0, lambda: self._mp_launch_btn.config(state="normal"))
                self.root.after(0, lambda: self._mp_stop_btn.config(state="disabled"))
            except Exception:
                pass

        # ── Step 1: upload each unique video once ─────────────────────────────
        resource_urls = {}
        unique_paths = list(dict.fromkeys(video_paths))
        for vp in unique_paths:
            if self._mp_stop_flag[0]:
                self._mp_log("⏹ Arrêté avant upload.", "warn")
                done()
                return
            vname = Path(vp).name
            self._mp_log(f"📤 Upload: {vname}...", "accent")
            try:
                r = httpx.post("https://openapi.geelark.com/open/v1/upload/getUrl",
                               json={"fileType": "mp4"}, headers=api_hdrs,
                               timeout=20, follow_redirects=False)
                rj = r.json()
                if rj.get("code") != 0:
                    self._mp_log(f"❌ GéeLark upload URL: {rj.get('msg', rj)}", "error")
                    done()
                    return
                upload_url   = rj["data"]["uploadUrl"]
                resource_url = rj["data"]["resourceUrl"]
            except Exception as e:
                self._mp_log(f"❌ Upload URL: {e}", "error")
                done()
                return

            try:
                with open(vp, "rb") as fl:
                    up = httpx.put(upload_url, content=fl.read(), timeout=300)
                if up.status_code not in (200, 204):
                    self._mp_log(f"❌ PUT vidéo échoué ({up.status_code})", "error")
                    done()
                    return
                resource_urls[vp] = resource_url
                self._mp_log(f"✅ {vname} uploadée", "ok")
            except Exception as e:
                self._mp_log(f"❌ Upload vidéo: {e}", "error")
                done()
                return

        if not resource_urls:
            self._mp_log("❌ Aucune vidéo uploadée", "error")
            done()
            return

        res_list = list(resource_urls.values())
        cap_list = captions

        # ── Step 2: build per-phone assignments ───────────────────────────────
        assignments = {}
        for i, pid in enumerate(phone_ids):
            if mode == "Aléatoire":
                res = random.choice(res_list)
                cap = random.choice(cap_list)
            else:
                res = res_list[i % len(res_list)]
                cap = cap_list[i % len(cap_list)]
            assignments[pid] = (res, cap)

        # ── Step 3: start phones ──────────────────────────────────────────────
        self._mp_log(f"📱 Démarrage de {len(phone_ids)} téléphones...", "accent")
        try:
            sr = httpx.post("https://openapi.geelark.com/open/v1/phone/start",
                            json={"ids": phone_ids}, headers=api_hdrs,
                            timeout=20, follow_redirects=False)
            sj = sr.json() if sr.status_code == 200 else {}
            ok_c  = sj.get("data", {}).get("successAmount", 0)
            fail_c = sj.get("data", {}).get("failAmount", 0)
            self._mp_log(f"  {ok_c} démarrés, {fail_c} déjà actifs/erreur", "info")
        except Exception as e:
            self._mp_log(f"⚠ Démarrage téléphones: {e}", "warn")

        self._mp_log("⏳ Attente 30s (boot)...", "info")
        for _ in range(30):
            if self._mp_stop_flag[0]:
                self._mp_log("⏹ Arrêté pendant le boot.", "warn")
                done()
                return
            time.sleep(1)

        # ── Step 4: create tasks (batched by max_workers) ─────────────────────
        base_time   = int(time.time())
        stagger_sec = stagger_min * 60
        task_ids = {}

        batches = [phone_ids[i:i+max_workers]
                   for i in range(0, len(phone_ids), max_workers)]
        for batch_num, batch in enumerate(batches):
            if self._mp_stop_flag[0]:
                self._mp_log("⏹ Arrêté avant création tâches.", "warn")
                break
            for j, pid in enumerate(batch):
                if self._mp_stop_flag[0]:
                    break
                name = self.data.get(pid, {}).get("phone_name", pid)
                res, cap = assignments[pid]
                offset  = int(stagger_sec * (0.75 + random.random() * 0.5))
                post_at = base_time + 30 + (batch_num * len(batch) + j) * max(offset, 1)
                self._mp_set_status(pid, "🔄 Création tâche...", ACCENT)
                try:
                    r = httpx.post(
                        "https://openapi.geelark.com/open/v1/rpa/task/instagramPubReels",
                        json={"id": pid, "description": cap,
                              "video": [res], "scheduleAt": post_at},
                        headers=api_hdrs, timeout=30, follow_redirects=False)
                    rj = r.json()
                    if rj.get("code") == 0:
                        tid = rj["data"].get("taskId", "")
                        task_ids[pid] = tid
                        mins = max(0, (post_at - int(time.time())) // 60)
                        self._mp_log(f"✅ {name} — tâche {tid} (~{mins}min)", "ok")
                        self._mp_set_status(pid, f"📅 Planifié dans ~{mins}min", OK)
                    else:
                        self._mp_log(f"⚠ {name}: {rj.get('msg', str(rj))}", "warn")
                        self._mp_set_status(pid, "⚠ Échec tâche", WARN)
                except Exception as e:
                    self._mp_log(f"❌ {name}: {e}", "error")
                    self._mp_set_status(pid, "❌ Erreur", DANGER)

        if not task_ids:
            self._mp_log("❌ Aucune tâche créée", "error")
            done()
            return

        # ── Step 5: poll until all done or stopped ────────────────────────────
        self._mp_log("⏳ Suivi des tâches en cours...", "accent")
        STATUS = {1: "⏳ En attente", 2: "🔄 En cours", 3: "✅ Terminé",
                  4: "❌ Échoué", 7: "🚫 Annulé"}
        STATUS_COL = {3: OK, 4: DANGER, 7: WARN}
        deadline = time.time() + 600
        pending  = dict(task_ids)
        reported = set()
        poll_n   = 0
        while pending and time.time() < deadline:
            if self._mp_stop_flag[0]:
                self._mp_log("⏹ Polling arrêté.", "warn")
                break
            time.sleep(15)
            poll_n += 1
            try:
                qr = httpx.post("https://openapi.geelark.com/open/v1/task/query",
                                json={"ids": list(pending.values())},
                                headers=api_hdrs, timeout=15, follow_redirects=False)
                items = qr.json().get("data", {}).get("items", [])
                for item in items:
                    tid    = item.get("id", "")
                    status = item.get("status", 0)
                    pid    = next((p for p, t in task_ids.items() if t == tid), None)
                    name   = self.data.get(pid, {}).get("phone_name", pid) if pid else tid
                    if status in (3, 4, 7) and tid not in reported:
                        reported.add(tid)
                        if pid in pending:
                            del pending[pid]
                        lv = "ok" if status == 3 else "error"
                        fd = item.get("failDesc", "")
                        msg = f"{STATUS.get(status, str(status))} {name}"
                        if fd:
                            msg += f" — {fd}"
                        self._mp_log(msg, lv)
                        self._mp_set_status(pid, STATUS.get(status, "?"),
                                            STATUS_COL.get(status, WARN))
                    elif status in (1, 2) and poll_n % 4 == 0 and pid:
                        self._mp_set_status(pid, STATUS.get(status, "?"), TEXT2)
            except Exception as e:
                self._mp_log(f"⚠ Polling: {e}", "warn")

        for pid in list(pending):
            name = self.data.get(pid, {}).get("phone_name", pid)
            self._mp_log(f"⏳ {name} — tâche encore en cours (vérifie GéeLark)", "warn")

        # ── Step 6: stop phones ───────────────────────────────────────────────
        self._mp_log("📴 Arrêt des téléphones...", "info")
        try:
            httpx.post("https://openapi.geelark.com/open/v1/phone/stop",
                       json={"ids": phone_ids}, headers=api_hdrs,
                       timeout=15, follow_redirects=False)
            self._mp_log("✅ Téléphones éteints", "ok")
        except Exception as e:
            self._mp_log(f"⚠ Arrêt: {e}", "warn")

        self._mp_log("⚡ Mass Posting terminé ✓", "accent")
        done()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET BANQUE
    # ══════════════════════════════════════════════════════════════════════════
    def _build_bank_tab(self):
        # ── Vault Pro style dark media library ─────────────────────────────
        SB_BG    = "#0b0e18"
        CARD_BG  = "#161d2b"
        FILTER_BG = "#070a10"
        ACCENT_C = "#4f8ef7"
        TEXT_C   = "#e8eaf0"
        TEXT2_C  = "#6b7a99"

        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["bank"] = f

        # ── TOP BAR ────────────────────────────────────────────────────────
        top_bar = tk.Frame(f, bg=FILTER_BG, height=52)
        top_bar.pack(fill="x")
        top_bar.pack_propagate(False)

        tk.Label(top_bar, text="🗂  Banque de médias",
                 font=("Segoe UI", 13, "bold"),
                 bg=FILTER_BG, fg=TEXT_C).pack(side="left", padx=16)

        # right-side action buttons (packed right-to-left)
        self.export_dir_lbl = tk.Label(
            top_bar,
            text=f"Export : {self.cfg.get('export_dir', 'Même dossier')}",
            font=("Segoe UI", 8), bg=FILTER_BG, fg=TEXT2_C)
        self.export_dir_lbl.pack(side="right", padx=(0, 10))

        self._mk_btn(top_bar, "+ Ajouter un média", "primary",
                     cmd=self._bank_add_media, pady=4,
                     font=("Segoe UI", 9, "bold")).pack(side="right", padx=(0, 8))
        self._mk_btn(top_bar, "⬇ Télécharger", "secondary",
                     self._bank_download, pady=4).pack(side="right", padx=(0, 4))
        self._mk_btn(top_bar, "📂 Export dir", "secondary",
                     self._choose_export_dir, pady=4).pack(side="right", padx=(0, 4))
        self._mk_btn(top_bar, "🔀 Randomiser", "warn",
                     cmd=lambda: threading.Thread(
                         target=self._randomize_meta, daemon=True).start(),
                     pady=4).pack(side="right", padx=(0, 4))
        self._mk_btn(top_bar, "↺ Rafraîchir", "ghost",
                     self._refresh_bank, pady=4).pack(side="right", padx=(0, 4))

        # ── BODY (sidebar + main area) ─────────────────────────────────────
        body = tk.Frame(f, bg=BG)
        body.pack(fill="both", expand=True)

        # ── LEFT SIDEBAR ───────────────────────────────────────────────────
        self._bank_folder_filter = None   # None = all, str = folder name
        sidebar = tk.Frame(body, bg=SB_BG, width=190)
        sidebar.pack(side="left", fill="y")
        sidebar.pack_propagate(False)
        self._bank_sidebar_frame = sidebar

        # Sidebar header
        sb_hdr = tk.Frame(sidebar, bg=SB_BG)
        sb_hdr.pack(fill="x", padx=8, pady=(10, 4))
        tk.Label(sb_hdr, text="Personnalisé",
                 font=("Segoe UI", 8), bg=SB_BG, fg=TEXT2_C).pack(side="left")
        tk.Button(sb_hdr, text="🔍", relief="flat", bd=0,
                  bg=SB_BG, fg=TEXT2_C, font=("Segoe UI", 9), cursor="hand2",
                  command=lambda: None).pack(side="right")
        tk.Button(sb_hdr, text="+", relief="flat", bd=0,
                  bg=SB_BG, fg=TEXT2_C, font=("Segoe UI", 10, "bold"), cursor="hand2",
                  command=self._bank_new_folder).pack(side="right", padx=(0, 2))

        tk.Frame(sidebar, height=1, bg="#1a2035").pack(fill="x")

        # "Tous les médias" row
        def _show_all(_e=None):
            self._bank_folder_filter = None
            self._bank_refresh_folder_sidebar()
            self._refresh_bank()

        all_media_row = tk.Frame(sidebar, bg=SB_BG, cursor="hand2")
        all_media_row.pack(fill="x", pady=(6, 2))
        self._bank_all_lbl = tk.Label(
            all_media_row, text="🗂 Tous les médias",
            font=("Segoe UI", 9, "bold"), bg=ACCENT_C, fg="#ffffff",
            anchor="w", padx=10, pady=6)
        self._bank_all_lbl.pack(fill="x")
        self._bank_all_lbl.bind("<Button-1>", _show_all)
        all_media_row.bind("<Button-1>", _show_all)

        tk.Frame(sidebar, height=1, bg="#1a2035").pack(fill="x", pady=(4, 0))

        # Scrollable folder list
        folder_list_frame = tk.Frame(sidebar, bg=SB_BG)
        folder_list_frame.pack(fill="both", expand=True)
        folder_cv = tk.Canvas(folder_list_frame, bg=SB_BG,
                               highlightthickness=0, bd=0)
        folder_cv.pack(side="left", fill="both", expand=True)
        folder_vsb = ttk.Scrollbar(folder_list_frame, orient="vertical",
                                    command=folder_cv.yview)
        folder_cv.configure(yscrollcommand=folder_vsb.set)
        folder_vsb.pack(side="right", fill="y")
        self._bank_folder_cv = folder_cv
        self._bank_folder_inner = tk.Frame(folder_cv, bg=SB_BG)
        self._bank_folder_inner_win = folder_cv.create_window(
            (0, 0), window=self._bank_folder_inner, anchor="nw")
        self._bank_folder_inner.bind("<Configure>",
            lambda _e: folder_cv.configure(
                scrollregion=folder_cv.bbox("all")))
        folder_cv.bind("<Configure>",
            lambda e: folder_cv.itemconfig(self._bank_folder_inner_win, width=e.width))

        # ── MAIN AREA (right of sidebar) ──────────────────────────────────
        main_area = tk.Frame(body, bg=BG)
        main_area.pack(side="left", fill="both", expand=True)

        # Filter bar
        filter_bar = tk.Frame(main_area, bg=FILTER_BG)
        filter_bar.pack(fill="x", padx=0, pady=0)

        self._bank_search_var = tk.StringVar()
        search_entry = tk.Entry(
            filter_bar, textvariable=self._bank_search_var,
            font=("Segoe UI", 10), bg="#0e1424", fg=TEXT2_C,
            insertbackground=TEXT2_C, relief="flat", bd=0,
            highlightthickness=1, highlightbackground="#1e2a3a",
            highlightcolor=ACCENT_C)
        search_entry.pack(side="left", padx=12, pady=8, ipadx=8, ipady=4, fill="x", expand=True)
        search_entry.insert(0, "🔍  Rechercher…")
        def _on_search_focus_in(e):
            if search_entry.get() == "🔍  Rechercher…":
                search_entry.delete(0, "end")
                search_entry.config(fg=TEXT_C)
        def _on_search_focus_out(e):
            if not search_entry.get():
                search_entry.insert(0, "🔍  Rechercher…")
                search_entry.config(fg=TEXT2_C)
        search_entry.bind("<FocusIn>", _on_search_focus_in)
        search_entry.bind("<FocusOut>", _on_search_focus_out)
        self._bank_search_var.trace_add("write", lambda *_: self._refresh_bank())

        tk.Label(filter_bar, text="Récent ▼",
                 font=("Segoe UI", 9), bg=FILTER_BG, fg=TEXT2_C,
                 cursor="hand2").pack(side="right", padx=8)
        tk.Label(filter_bar, text="⊞",
                 font=("Segoe UI", 12), bg=FILTER_BG, fg=ACCENT_C,
                 cursor="hand2").pack(side="right", padx=(0, 4))
        tk.Label(filter_bar, text="≡",
                 font=("Segoe UI", 12), bg=FILTER_BG, fg=TEXT2_C,
                 cursor="hand2").pack(side="right", padx=(0, 2))

        # Type tabs / pills bar
        self._bank_type_filter = "all"
        type_bar = tk.Frame(main_area, bg="#080b12")
        type_bar.pack(fill="x")
        _pill_types = [("Tous", "all"), ("Vidéo", "video"), ("Photo", "photo"),
                       ("GIF", "gif"), ("Audio", "audio")]
        self._bank_pill_btns = {}
        def _make_pill_cmd(tkey):
            def _cmd():
                self._bank_type_filter = tkey
                for k, b in self._bank_pill_btns.items():
                    b.config(bg=ACCENT_C if k == tkey else "#080b12",
                             fg="#ffffff" if k == tkey else TEXT2_C)
                self._refresh_bank()
            return _cmd
        for label, tkey in _pill_types:
            is_active = (tkey == "all")
            btn = tk.Button(
                type_bar, text=label,
                font=("Segoe UI", 9), relief="flat", bd=0, cursor="hand2",
                bg=ACCENT_C if is_active else "#080b12",
                fg="#ffffff" if is_active else TEXT2_C,
                padx=12, pady=5, command=_make_pill_cmd(tkey))
            btn.pack(side="left", padx=(8 if tkey == "all" else 2, 0), pady=6)
            self._bank_pill_btns[tkey] = btn

        # Status bar
        self.bank_status = tk.Label(
            type_bar, text="", font=("Segoe UI", 8),
            bg="#080b12", fg=TEXT2_C)
        self.bank_status.pack(side="right", padx=12)

        # Grid frame (canvas + scrollbar)
        grid_frame = tk.Frame(main_area, bg=BG)
        grid_frame.pack(fill="both", expand=True)

        self.bank_grid_canvas = tk.Canvas(grid_frame, bg=BG,
                                           highlightthickness=0, bd=0)
        bank_vsb = ttk.Scrollbar(grid_frame, orient="vertical",
                                  command=self.bank_grid_canvas.yview)
        self.bank_grid_canvas.configure(yscrollcommand=bank_vsb.set)
        bank_vsb.pack(side="right", fill="y")
        self.bank_grid_canvas.pack(side="left", fill="both", expand=True)

        self.bank_grid_inner = tk.Frame(self.bank_grid_canvas, bg=BG)
        self._bank_grid_window = self.bank_grid_canvas.create_window(
            (0, 0), window=self.bank_grid_inner, anchor="nw")

        def _bank_grid_configure(_e=None):
            self.bank_grid_canvas.configure(
                scrollregion=self.bank_grid_canvas.bbox("all"))
        self.bank_grid_inner.bind("<Configure>", _bank_grid_configure)

        def _bank_canvas_resize(e):
            self.bank_grid_canvas.itemconfig(self._bank_grid_window, width=e.width)
        self.bank_grid_canvas.bind("<Configure>", _bank_canvas_resize)

        def _bank_wheel(e):
            self.bank_grid_canvas.yview_scroll(int(-1 * (e.delta / 120)), "units")
        self.bank_grid_canvas.bind("<MouseWheel>", _bank_wheel)
        self.bank_grid_inner.bind("<MouseWheel>", _bank_wheel)
        self._bank_grid_wheel = _bank_wheel

        # DnD drop target on the grid canvas
        if DND_OK:
            self.bank_grid_canvas.drop_target_register(DND_FILES)
            self.bank_grid_canvas.dnd_bind("<<Drop>>", self._on_bank_drop)

        # Card storage
        self._bank_card_widgets = {}      # entry_id → canvas card
        self._bank_card_thumbs = {}       # entry_id → canvas card (alias)
        self._bank_thumb_refs = []        # GC prevention for PhotoImage refs
        self._bank_thumb_jobs = set()     # entry_ids loading async
        self._bank_grid_cols = 4
        self.bank_tree = None             # retro-compat

        # ── DETAIL PANEL (bottom, initially hidden) ────────────────────────
        detail_panel = tk.Frame(main_area, bg=CARD, height=260)
        # Store for show/hide
        self._bank_detail_panel = detail_panel
        self._bank_detail_visible = False

        # Detail panel header
        dp_hdr = tk.Frame(detail_panel, bg=CARD)
        dp_hdr.pack(fill="x", padx=14, pady=(8, 0))
        tk.Label(dp_hdr, text="APERÇU", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(side="left")
        tk.Button(dp_hdr, text="✕", relief="flat", bd=0,
                  bg=CARD, fg=TEXT2, font=("Segoe UI", 9), cursor="hand2",
                  command=self._bank_hide_detail).pack(side="right")

        # Detail panel content (preview + description side by side)
        dp_body = tk.Frame(detail_panel, bg=CARD)
        dp_body.pack(fill="both", expand=True, padx=14, pady=(4, 8))

        # Preview canvas (left)
        self.bank_preview = tk.Canvas(dp_body, bg="#000",
                                       highlightthickness=0, height=190, width=240)
        self.bank_preview.pack(side="left", padx=(0, 14))
        self.bank_preview_ref = None
        self.bank_preview.create_text(120, 95, text="Sélectionne un média",
                                       fill=MUTED, font=("Segoe UI", 9))

        # Description area (right)
        desc_area = tk.Frame(dp_body, bg=CARD)
        desc_area.pack(side="left", fill="both", expand=True)

        dh = tk.Frame(desc_area, bg=CARD)
        dh.pack(fill="x", pady=(0, 4))
        tk.Label(dh, text="DESCRIPTION", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(side="left")
        self.gen_btn = self._mk_btn(
            dh, "✨ Générer (Groq)", "primary", pady=3,
            cmd=lambda: threading.Thread(
                target=self._generate_desc, daemon=True).start(),
            font=("Segoe UI", 8))
        self.gen_btn.pack(side="right")

        self.desc_box = tk.Text(
            desc_area, font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT,
            insertbackground=TEXT, relief="flat", bd=0, height=6,
            highlightthickness=1, highlightcolor=ACCENT,
            highlightbackground=BORDER, wrap="word", padx=6, pady=6)
        self.desc_box.pack(fill="both", expand=True, pady=(0, 4))

        br = tk.Frame(desc_area, bg=CARD)
        br.pack(fill="x")
        self._mk_btn(br, "💾 Sauvegarder", "ok", self._save_desc,
                     pady=3, font=("Segoe UI", 8)).pack(side="left")
        self._mk_btn(br, "📋 Copier", "secondary", self._copy_desc,
                     pady=3, font=("Segoe UI", 8)).pack(side="left", padx=(4, 0))
        self.desc_status = tk.Label(br, text="", font=("Segoe UI", 8),
                                     bg=CARD, fg=TEXT2)
        self.desc_status.pack(side="left", padx=6)

        br2 = tk.Frame(desc_area, bg=CARD)
        br2.pack(fill="x", pady=(4, 0))
        self._mk_btn(br2, "📥 Ouvrir", "ghost", self._bank_open,
                     pady=3, font=("Segoe UI", 8)).pack(side="left")
        self._mk_btn(br2, "⬇ DL", "secondary", self._bank_download,
                     pady=3, font=("Segoe UI", 8)).pack(side="left", padx=(4, 0))
        self._mk_btn(br2, "🗑 Suppr.", "danger", self._bank_delete,
                     pady=3, font=("Segoe UI", 8)).pack(side="left", padx=(4, 0))
        self._mk_btn(br2, "📂 Déplacer", "ghost", self._bank_move_to_folder,
                     pady=3, font=("Segoe UI", 8)).pack(side="left", padx=(4, 0))

        # Initially hidden — shown on card click
        # (do NOT pack here; _on_bank_sel_card will pack it when needed)

    def _bank_hide_detail(self):
        try:
            self._bank_detail_panel.pack_forget()
            self._bank_detail_visible = False
        except Exception:
            pass

    def _bank_show_detail(self):
        try:
            if not self._bank_detail_visible:
                self._bank_detail_panel.pack(fill="x", side="bottom")
                self._bank_detail_visible = True
        except Exception:
            pass

    def _bank_add_media(self):
        """Open file dialog to add videos to the bank."""
        from uuid import uuid4
        paths = filedialog.askopenfilenames(
            title="Ajouter des médias à la banque",
            filetypes=[("Vidéos", "*.mp4 *.mov *.avi *.mkv *.webm *.m4v"),
                       ("Tous les fichiers", "*.*")])
        if not paths:
            return
        bank = load_bank()
        known = {b["path"] for b in bank}
        added = 0
        for p in paths:
            fp = Path(p)
            if not fp.exists() or str(fp) in known:
                continue
            eid = uuid4().hex[:12]
            bank.append({
                "id":          eid,
                "filename":    fp.name,
                "path":        str(fp),
                "folder":      getattr(self, "_bank_folder_filter", "") or "",
                "size_mb":     round(fp.stat().st_size / 1_000_000, 1),
                "created":     datetime.now().isoformat(),
                "posted_to":   [],
                "overlay":     "",
                "description": "",
            })
            known.add(str(fp))
            added += 1
        if added:
            save_bank(bank)
            self._refresh_bank()
            try:
                self.bank_status.config(
                    text=f"✅ {added} média(s) ajouté(s)", fg=OK)
                self.root.after(3000, lambda: self.bank_status.config(text=""))
            except Exception:
                pass

    def _on_bank_sel(self, e=None):
        # Conservé pour rétro-compatibilité ; la sélection se fait désormais via cartes.
        if self._bank_selected:
            self._on_bank_sel_card(self._bank_selected)

    def _on_bank_sel_card(self, entry_id):
        """Click handler pour les cartes de la grille bank."""
        if not entry_id:
            return
        old_id = getattr(self, "_bank_selected", None)
        self._bank_selected = entry_id
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == entry_id), None)
        if not entry:
            return
        # Redraw old card (deselect) and new card (select) using canvas _picker_redraw
        for eid in (old_id, entry_id):
            if not eid:
                continue
            card = self._bank_card_widgets.get(eid)
            if card and hasattr(card, "_picker_redraw"):
                try:
                    card._picker_redraw()
                except Exception:
                    pass
            elif card:
                # fallback: update highlight border color
                try:
                    is_sel = (eid == entry_id)
                    col = "#4f8ef7" if is_sel else "#1e2a3a"
                    card.config(highlightbackground=col,
                                bg="#1a2845" if is_sel else "#161d2b")
                except Exception:
                    pass
        # Show detail panel
        self._bank_show_detail()
        # Description
        try:
            self.desc_box.delete("1.0", "end")
            if entry.get("description"):
                self.desc_box.insert("1.0", entry["description"])
            self.desc_status.config(text="")
        except Exception:
            pass
        # Aperçu vidéo
        threading.Thread(target=self._load_bank_preview,
                          args=(entry,), daemon=True).start()

    def _load_bank_preview(self, entry):
        if not PIL_OK:
            return
        p = Path(entry.get("path", ""))
        if not p.exists():
            return
        ff = self._find_ffmpeg()
        if not ff:
            return
        frame = BASE_DIR / "_bprev.jpg"
        try:
            subprocess.run([ff, "-y", "-ss", "00:00:01", "-i", str(p),
                            "-frames:v", "1", "-q:v", "3", str(frame)],
                           capture_output=True, timeout=10)
        except:
            return
        if not frame.exists():
            return
        try:
            cw = self.bank_preview.winfo_width() or 380
            ch = 220
            img = Image.open(frame)
            img.thumbnail((cw, ch), Image.LANCZOS)
            photo = ImageTk.PhotoImage(img)
            def upd():
                self.bank_preview.delete("all")
                self.bank_preview.create_image(cw // 2, ch // 2,
                                                anchor="center", image=photo)
                self.bank_preview_ref = photo
            self.root.after(0, upd)
        except:
            pass

    def _generate_desc(self):
        if not self._bank_selected:
            self.root.after(0, lambda: self.desc_status.config(
                text="⚠ Sélectionne une vidéo", fg=WARN))
            return
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == self._bank_selected), None)
        if not entry:
            return
        theme = entry.get("overlay", "") or Path(entry.get("path", "")).stem
        self.root.after(0, lambda: self.gen_btn.config(
            state="disabled", text="⏳ Génération..."))
        self.root.after(0, lambda: self.desc_status.config(text="En cours...", fg=WARN))
        cfg = load_config()
        GROQ_KEY = cfg.get("groq_api_key", "")
        if not GROQ_KEY:
            self.root.after(0, lambda: self.gen_btn.config(state="normal", text="Générer description"))
            self.root.after(0, lambda: self.desc_status.config(
                text="Clé Groq manquante (Settings → Groq API Key)", fg=ERR))
            return
        base = (
            "J'ai 19 ans et peut-être que j'en montre un peu trop parfois… "
            "ou juste assez pour faire parler. Je joue, je souris, je provoque… "
            "mais tout ce que je fais, je le fais avec mon cœur. Et ça, on l'oublie souvent. "
            "Derrière les tenues, les poses, les regards qui piquent un peu trop, y'a juste une "
            "fille qui s'assume, mais qui ressent tout. Chaque message, chaque jugement, chaque "
            "compliment volé ou chaque insulte glissée « juste pour rigoler »… je les lis. "
            "Et parfois, ça pique. Mais tu sais quoi ? Je préfère vivre comme ça, entière, "
            "imparfaite, libre… que de me cacher derrière une version sage de moi-même pour "
            "rassurer les autres."
        )
        prompt = (
            f"Voici une description de base pour un reel Instagram :\n\n{base}\n\n"
            f"Le thème de la vidéo est : \"{theme}\"\n\n"
            "Prends cette base et change l'histoire pour qu'elle convienne parfaitement au thème. "
            "Garde le même style (voix féminine, intime, légèrement provocateur, authentique). "
            "Ajoute 4 ou 5 emojis bien placés. "
            "Réponds UNIQUEMENT avec la description finale, sans introduction."
        )
        try:
            r = httpx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_KEY}",
                         "Content-Type": "application/json"},
                json={"model": "llama-3.3-70b-versatile", "max_tokens": 1024,
                      "messages": [{"role": "user", "content": prompt}]},
                timeout=30)
            rj = r.json()
            if r.status_code == 200:
                text = rj["choices"][0]["message"]["content"].strip()
                def upd():
                    self.desc_box.delete("1.0", "end")
                    self.desc_box.insert("1.0", text)
                    self.desc_status.config(text="✅ Générée", fg=OK)
                    self.gen_btn.config(state="normal",
                                        text="✨ Générer (Groq — gratuit)")
                self.root.after(0, upd)
            else:
                err = rj.get("error", {}).get("message", "Erreur")
                self.root.after(0, lambda: self.desc_status.config(
                    text=f"❌ {err[:50]}", fg=DANGER))
                self.root.after(0, lambda: self.gen_btn.config(
                    state="normal", text="✨ Générer (Groq — gratuit)"))
        except Exception as e:
            self.root.after(0, lambda: self.desc_status.config(
                text=f"❌ {str(e)[:50]}", fg=DANGER))
            self.root.after(0, lambda: self.gen_btn.config(
                state="normal", text="✨ Générer (Groq — gratuit)"))

    def _save_desc(self):
        if not self._bank_selected:
            return
        text = self.desc_box.get("1.0", "end").strip()
        bank = load_bank()
        for e in bank:
            if e["id"] == self._bank_selected:
                e["description"] = text
                break
        save_bank(bank)
        self.desc_status.config(text="✅ Sauvegardé", fg=OK)

    def _copy_desc(self):
        text = self.desc_box.get("1.0", "end").strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.desc_status.config(text="📋 Copié !", fg=OK)

    def _choose_export_dir(self):
        d = filedialog.askdirectory(title="Choisir le dossier d'export")
        if d:
            self.cfg["export_dir"] = d
            save_config(self.cfg)
            self.export_dir_lbl.config(text=f"Export : {d}")

    def _bank_refresh_folder_sidebar(self):
        """Rebuild the folder list in the left sidebar (Vault Pro dark style)."""
        if not hasattr(self, "_bank_folder_inner"):
            return
        for w in list(self._bank_folder_inner.winfo_children()):
            try:
                w.destroy()
            except Exception:
                pass
        SB_BG    = "#0b0e18"
        ACTIVE_BG = "#162040"
        ACTIVE_FG = "#4f8ef7"
        INACT_FG  = "#6b7a99"
        bank = load_bank()
        folders = sorted({e.get("folder", "") for e in bank if e.get("folder", "")})

        # Update "all" label highlight
        try:
            if self._bank_folder_filter is None:
                self._bank_all_lbl.configure(bg=ACTIVE_BG, fg=ACTIVE_FG)
            else:
                self._bank_all_lbl.configure(bg=SB_BG, fg=INACT_FG)
        except Exception:
            pass

        for folder in folders:
            count = sum(1 for e in bank if e.get("folder", "") == folder)
            is_sel = (self._bank_folder_filter == folder)
            row_bg = ACTIVE_BG if is_sel else SB_BG
            row_fg = ACTIVE_FG if is_sel else INACT_FG

            row = tk.Frame(self._bank_folder_inner, bg=row_bg, cursor="hand2")
            row.pack(fill="x", pady=1)

            lbl = tk.Label(row, text=f"📁  {folder}",
                            font=("Segoe UI", 9), bg=row_bg, fg=row_fg,
                            anchor="w", padx=10, pady=6)
            lbl.pack(side="left", fill="x", expand=True)

            # Count badge
            badge = tk.Label(row, text=str(count),
                              font=("Consolas", 8), bg=row_bg, fg=row_fg,
                              padx=4)
            badge.pack(side="right")

            # "..." context button
            dot_btn = tk.Button(row, text="…", relief="flat", bd=0,
                                 bg=row_bg, fg=INACT_FG,
                                 font=("Segoe UI", 9), cursor="hand2",
                                 padx=2)
            dot_btn.pack(side="right")

            def _make_folder_click(fn):
                def _click(_e=None):
                    self._bank_folder_filter = fn
                    self._bank_refresh_folder_sidebar()
                    self._refresh_bank()
                return _click

            def _make_folder_rclick(fn):
                def _rclick(e):
                    self._bank_folder_context(e, fn)
                return _rclick

            def _make_hover(r, bg_h, bg_n):
                def _enter(_e=None):
                    try:
                        for c in r.winfo_children():
                            c.configure(bg=bg_h)
                        r.configure(bg=bg_h)
                    except Exception:
                        pass
                def _leave(_e=None):
                    try:
                        for c in r.winfo_children():
                            c.configure(bg=bg_n)
                        r.configure(bg=bg_n)
                    except Exception:
                        pass
                return _enter, _leave

            _fc  = _make_folder_click(folder)
            _frc = _make_folder_rclick(folder)
            _hover_in, _hover_out = _make_hover(
                row,
                "#1c2a50" if not is_sel else ACTIVE_BG,
                row_bg)

            for w in (row, lbl, badge):
                w.bind("<Button-1>", _fc)
                w.bind("<Button-3>", _frc)
                w.bind("<Enter>", _hover_in)
                w.bind("<Leave>", _hover_out)
            dot_btn.bind("<Button-1>", _frc)
            dot_btn.bind("<Button-3>", _frc)

        try:
            self._bank_folder_cv.configure(
                scrollregion=self._bank_folder_cv.bbox("all"))
        except Exception:
            pass

    def _bank_folder_context(self, event, folder_name):
        """Right-click context menu on a folder row."""
        menu = tk.Menu(self.root, tearoff=0, bg=SURFACE2, fg=TEXT,
                       activebackground=HL, activeforeground=ACCENT,
                       font=("Segoe UI", 10), bd=0, relief="flat")
        menu.add_command(label="✏  Renommer",
                          command=lambda: self._bank_rename_folder(folder_name))
        menu.add_command(label="🗑  Supprimer",
                          command=lambda: self._bank_delete_folder(folder_name))
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _bank_new_folder(self):
        name = simpledialog.askstring("Nouveau dossier", "Nom du dossier :",
                                       parent=self.root)
        if not name or not name.strip():
            return
        name = name.strip()
        # Create folder by ensuring at least a note; actual videos get assigned
        # We just refresh sidebar so the folder appears once a video is moved there
        # For now create a placeholder by noting in status
        self.bank_status.config(
            text=f"✅ Dossier « {name} » créé — assignez des vidéos", fg=OK)
        self.root.after(3000, lambda: self.bank_status.config(text=""))
        self._bank_refresh_folder_sidebar()

    def _bank_rename_folder(self, old_name):
        new_name = simpledialog.askstring("Renommer dossier", "Nouveau nom :",
                                           initialvalue=old_name, parent=self.root)
        if not new_name or not new_name.strip() or new_name.strip() == old_name:
            return
        new_name = new_name.strip()
        bank = load_bank()
        for e in bank:
            if e.get("folder", "") == old_name:
                e["folder"] = new_name
        save_bank(bank)
        if self._bank_folder_filter == old_name:
            self._bank_folder_filter = new_name
        self._bank_refresh_folder_sidebar()
        self._refresh_bank()

    def _bank_delete_folder(self, folder_name):
        if not messagebox.askyesno(
                "Supprimer dossier",
                f"Supprimer le dossier « {folder_name} » ?\n"
                "Les vidéos seront déplacées vers la racine."):
            return
        bank = load_bank()
        for e in bank:
            if e.get("folder", "") == folder_name:
                e["folder"] = ""
        save_bank(bank)
        if self._bank_folder_filter == folder_name:
            self._bank_folder_filter = None
        self._bank_refresh_folder_sidebar()
        self._refresh_bank()

    def _bank_move_to_folder(self):
        """Move selected video to a folder."""
        if not self._bank_selected:
            messagebox.showwarning("Sélection", "Sélectionne une vidéo d'abord")
            return
        bank = load_bank()
        folders = sorted({e.get("folder", "") for e in bank if e.get("folder", "")})
        # Build a simple dialog
        dlg = tk.Toplevel(self.root)
        dlg.title("Déplacer vers dossier")
        dlg.configure(bg=SURFACE2)
        dlg.grab_set()
        dlg.resizable(False, False)
        tk.Label(dlg, text="Choisir ou créer un dossier :",
                 font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT).pack(padx=16, pady=(12, 4))
        var = tk.StringVar()
        # Dropdown of existing folders + empty option
        options = ["(Racine — pas de dossier)"] + folders
        cb = ttk.Combobox(dlg, textvariable=var, values=options, width=28,
                          font=("Segoe UI", 10))
        cb.pack(padx=16, pady=4)
        entry_lbl = tk.Label(dlg, text="Ou saisir un nouveau nom :",
                              font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2)
        entry_lbl.pack(padx=16, pady=(4, 0))
        new_var = tk.StringVar()
        tk.Entry(dlg, textvariable=new_var, bg=SURFACE2,
                 fg=TEXT, font=("Segoe UI", 10),
                 relief="flat", highlightthickness=1,
                 highlightbackground=BORDER).pack(padx=16, pady=(2, 8), fill="x")
        result = [None]
        def _apply():
            raw = new_var.get().strip()
            if raw:
                result[0] = raw
            else:
                sel = var.get()
                if sel == "(Racine — pas de dossier)" or not sel:
                    result[0] = ""
                else:
                    result[0] = sel
            dlg.destroy()
        def _cancel():
            dlg.destroy()
        btn_row = tk.Frame(dlg, bg=SURFACE2)
        btn_row.pack(fill="x", padx=16, pady=(0, 12))
        self._mk_btn(btn_row, "Appliquer", "primary", _apply, pady=5).pack(side="left", padx=(0, 6))
        self._mk_btn(btn_row, "Annuler", "ghost", _cancel, pady=5).pack(side="left")
        dlg.wait_window()
        if result[0] is None:
            return
        for e in bank:
            if e["id"] == self._bank_selected:
                e["folder"] = result[0]
                break
        save_bank(bank)
        self._bank_refresh_folder_sidebar()
        self._refresh_bank()
        self.bank_status.config(
            text=f"✅ Vidéo déplacée vers « {result[0] or 'Racine'} »", fg=OK)
        self.root.after(3000, lambda: self.bank_status.config(text=""))

    def _on_bank_drop(self, event):
        """Handle drag-and-drop of video files onto the bank grid."""
        import re as _re
        raw = event.data.strip()
        paths = []
        for m in _re.finditer(r'\{([^}]+)\}|(\S+)', raw):
            paths.append(m.group(1) or m.group(2))
        bank = load_bank()
        known = {b["path"] for b in bank}
        added = 0
        for p in paths:
            if not p.lower().endswith((".mp4", ".mov", ".avi", ".mkv")):
                continue
            fp = Path(p)
            if not fp.exists():
                continue
            if str(fp) in known:
                continue
            from uuid import uuid4
            eid = uuid4().hex[:12]
            bank.append({
                "id":          eid,
                "filename":    fp.name,
                "path":        str(fp),
                "folder":      self._bank_folder_filter or "",
                "size_mb":     round(fp.stat().st_size / 1_000_000, 1),
                "created":     datetime.now().isoformat(),
                "posted_to":   [],
                "overlay":     "",
                "description": "",
            })
            known.add(str(fp))
            added += 1
        if added:
            save_bank(bank)
            self._refresh_bank()
            self.bank_status.config(text=f"✅ {added} vidéo(s) ajoutée(s)", fg=OK)
            self.root.after(3000, lambda: self.bank_status.config(text=""))

    def _refresh_bank(self):
        # Reconstruction de la grille de cartes
        if not hasattr(self, "bank_grid_inner"):
            return
        for child in list(self.bank_grid_inner.winfo_children()):
            try:
                child.destroy()
            except Exception:
                pass
        self._bank_card_widgets = {}
        self._bank_card_thumbs = {}
        self._bank_thumb_refs = []

        # Rebuild folder sidebar
        self._bank_refresh_folder_sidebar()

        bank = load_bank()
        export_dir = self.cfg.get("export_dir", "").strip()
        known = {b["path"] for b in bank}
        if export_dir and Path(export_dir).exists():
            for fp in sorted(Path(export_dir).glob("*.mp4"),
                             key=lambda x: x.stat().st_mtime, reverse=True):
                if str(fp) not in known:
                    bank.append({
                        "id":       f"scan_{fp.stem}",
                        "filename": fp.name,
                        "path":     str(fp),
                        "overlay":  "",
                        "size_mb":  round(fp.stat().st_size / 1_000_000, 1),
                        "created":  datetime.fromtimestamp(fp.stat().st_mtime).isoformat(),
                        "posted_to": [],
                        "folder":   "",
                    })

        # Filter by folder
        folder_filter = getattr(self, "_bank_folder_filter", None)
        if folder_filter is not None:
            bank = [e for e in bank if e.get("folder", "") == folder_filter]

        # Filter by type
        type_filter = getattr(self, "_bank_type_filter", "all")
        if type_filter != "all":
            _VIDEO_EXT  = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
            _PHOTO_EXT  = {".jpg", ".jpeg", ".png", ".webp"}
            _GIF_EXT    = {".gif"}
            _AUDIO_EXT  = {".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"}
            def _type_of(e):
                ext = Path(e.get("path", "")).suffix.lower()
                if ext in _VIDEO_EXT:  return "video"
                if ext in _PHOTO_EXT:  return "photo"
                if ext in _GIF_EXT:    return "gif"
                if ext in _AUDIO_EXT:  return "audio"
                return "other"
            bank = [e for e in bank if _type_of(e) == type_filter]

        # Filter by search query
        try:
            search_raw = getattr(self, "_bank_search_var", None)
            search_q = search_raw.get().strip().lower() if search_raw else ""
            # Ignore placeholder text
            if search_q in ("", "🔍  rechercher…"):
                search_q = ""
        except Exception:
            search_q = ""
        if search_q:
            bank = [e for e in bank
                    if search_q in (e.get("filename", "") or "").lower()
                    or search_q in (e.get("display_name", "") or "").lower()
                    or search_q in (e.get("overlay", "") or "").lower()]

        cols = max(1, getattr(self, "_bank_grid_cols", 3))
        for c in range(cols):
            try:
                self.bank_grid_inner.grid_columnconfigure(c, weight=1, uniform="bankcol")
            except Exception:
                pass

        if not bank:
            if folder_filter is not None:
                msg = f"Aucune vidéo dans « {folder_filter} »\n⬇  Glissez vos vidéos ici"
            else:
                msg = "Aucune vidéo en banque\n⬇  Glissez vos vidéos ici"
            empty = tk.Label(self.bank_grid_inner,
                              text=msg,
                              font=("Segoe UI", 10), bg=BG, fg=TEXT2, justify="center")
            empty.grid(row=0, column=0, columnspan=cols, padx=10, pady=40, sticky="nsew")
            empty.bind("<MouseWheel>", self._bank_grid_wheel)
            self.bank_status.config(text="0 vidéo(s)", fg=TEXT2)
            return

        for idx, e in enumerate(bank):
            r, c = divmod(idx, cols)
            self._build_bank_card(self.bank_grid_inner, e, r, c)

        # Reset du scroll
        self.bank_grid_inner.update_idletasks()
        try:
            self.bank_grid_canvas.configure(
                scrollregion=self.bank_grid_canvas.bbox("all"))
        except Exception:
            pass
        self.bank_status.config(text=f"{len(bank)} vidéo(s)", fg=TEXT2)

        # Restaurer la sélection visuelle
        if self._bank_selected and self._bank_selected in self._bank_card_widgets:
            card = self._bank_card_widgets[self._bank_selected]
            try:
                if hasattr(card, "_picker_redraw"):
                    card._picker_redraw()
                elif hasattr(card, "_set_border"):
                    card._set_border(ACCENT)
            except Exception:
                pass

    def _build_bank_card(self, parent, entry, row, col):
        """Construit une carte Canvas Vault Pro style dans la grille."""
        eid = entry["id"]
        exists = Path(entry.get("path", "")).exists()
        name = (entry.get("display_name")
                or entry.get("filename")
                or Path(entry.get("path", "")).name or "—")

        # Date formatting
        ts_raw = entry.get("created", "")
        date_str = ""
        try:
            _dt = datetime.fromisoformat(ts_raw)
            _MONTHS = ["jan", "fév", "mar", "avr", "mai", "juin",
                       "juil", "août", "sep", "oct", "nov", "déc"]
            date_str = f"{_dt.day} {_MONTHS[_dt.month - 1]} {_dt.year}"
        except Exception:
            date_str = ts_raw[:10] if ts_raw else ""

        CARD_BG  = "#161d2b"
        CARD_SEL = "#1a2845"
        ACCENT_C = "#4f8ef7"
        TEXT2_C  = "#6b7a99"
        TEXT_C   = "#e8eaf0"
        MUTED_C  = "#3d4a63"

        W, H = 160, 155
        THUMB_H = int(H * 0.72)   # ~112px for thumbnail area
        BOTTOM_Y = THUMB_H        # separator Y

        is_sel = (getattr(self, "_bank_selected", None) == eid)

        card = tk.Canvas(parent, bg=CARD_SEL if is_sel else CARD_BG,
                         width=W, height=H,
                         highlightthickness=1,
                         highlightbackground=ACCENT_C if is_sel else "#1e2a3a",
                         cursor="hand2")
        card.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
        parent.grid_columnconfigure(col, weight=1, uniform="bankcol2")

        # Placeholder background for thumb area
        card.create_rectangle(0, 0, W, THUMB_H,
                               fill="#1a2035", outline="")

        # 🎬 emoji placeholder (shown until real thumb loads)
        _placeholder_id = card.create_text(
            W // 2, THUMB_H // 2, text="🎬",
            font=("Segoe UI", 18), fill=MUTED_C, tags="placeholder")

        # Date pill top-left
        if date_str:
            card.create_rectangle(4, 4, 4 + len(date_str) * 5 + 8, 18,
                                   fill="#0b0e18", outline="", stipple="")
            card.create_text(8, 11, text=date_str,
                             font=("Consolas", 6), fill=TEXT2_C, anchor="w")

        # Checkmark circle top-right
        cx, cy, cr = W - 12, 12, 8
        if is_sel:
            card.create_oval(cx - cr, cy - cr, cx + cr, cy + cr,
                              fill=ACCENT_C, outline="")
            card.create_text(cx, cy, text="✓",
                              font=("Segoe UI", 8, "bold"), fill="#ffffff")
        else:
            card.create_oval(cx - cr, cy - cr, cx + cr, cy + cr,
                              fill="", outline=MUTED_C, width=1)

        # Separator line
        card.create_line(0, BOTTOM_Y, W, BOTTOM_Y, fill="#1e2a3a", width=1)

        # Filename centered in bottom area
        disp = name if len(name) <= 22 else name[:21] + "…"
        card.create_text(W // 2, BOTTOM_Y + (H - BOTTOM_Y) // 2,
                          text=disp,
                          font=("Segoe UI", 8), fill=TEXT_C if exists else TEXT2_C,
                          width=W - 10, anchor="center")

        # Video ▶ badge bottom-right of thumb area
        card.create_rectangle(W - 26, THUMB_H - 18, W - 2, THUMB_H - 2,
                               fill="#0b0e18", outline="")
        card.create_text(W - 14, THUMB_H - 10, text="▶",
                          font=("Segoe UI", 7), fill="#ffffff")

        # Missing file indicator
        if not exists:
            card.create_rectangle(2, THUMB_H - 16, 30, THUMB_H - 2,
                                   fill="#3d1020", outline="")
            card.create_text(16, THUMB_H - 9, text="✗",
                              font=("Consolas", 7), fill=DANGER)

        # ── Redraw function (used on selection change) ──────────────────────
        def _redraw(_eid=eid, _card=card):
            _is_sel = (getattr(self, "_bank_selected", None) == _eid)
            try:
                _card.config(
                    bg=CARD_SEL if _is_sel else CARD_BG,
                    highlightbackground=ACCENT_C if _is_sel else "#1e2a3a")
                # Update checkmark
                _card.delete("check_items")
                _cx, _cy, _cr = W - 12, 12, 8
                if _is_sel:
                    _card.create_oval(_cx - _cr, _cy - _cr, _cx + _cr, _cy + _cr,
                                       fill=ACCENT_C, outline="", tags="check_items")
                    _card.create_text(_cx, _cy, text="✓",
                                       font=("Segoe UI", 8, "bold"), fill="#ffffff",
                                       tags="check_items")
                else:
                    _card.create_oval(_cx - _cr, _cy - _cr, _cx + _cr, _cy + _cr,
                                       fill="", outline=MUTED_C, width=1,
                                       tags="check_items")
            except Exception:
                pass

        card._picker_redraw = _redraw

        # Bindings
        def _click(_e=None, _id=eid):
            self._on_bank_sel_card(_id)
        def _rclick(e, _id=eid):
            self._bank_card_context(e, _id)

        card.bind("<Button-1>", _click)
        card.bind("<Button-3>", _rclick)
        card.bind("<MouseWheel>", self._bank_grid_wheel)

        # Store in both dicts
        self._bank_card_widgets[eid] = card
        self._bank_card_thumbs[eid] = card   # alias — async loader updates this

        # Launch async thumbnail loading
        if exists and PIL_OK:
            threading.Thread(target=self._async_load_bank_thumb,
                              args=(entry,), daemon=True).start()

    def _extract_bank_thumb(self, entry):
        """Renvoie une PIL.Image (ou None) pour la vidéo de l'entrée bank.
        Cache JPEG dans BASE_DIR/_bank_thumbs/{id}.jpg."""
        if not PIL_OK:
            return None
        eid = entry.get("id") or ""
        path = Path(entry.get("path", ""))
        if not path.exists():
            return None
        cache_dir = BASE_DIR / "_bank_thumbs"
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            pass
        # Nom de cache safe (l'id peut contenir des caractères divers)
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", str(eid)) or "thumb"
        cache_file = cache_dir / f"{safe}.jpg"

        # Si le cache est plus récent que la vidéo, on le réutilise
        try:
            if (cache_file.exists()
                    and cache_file.stat().st_mtime >= path.stat().st_mtime):
                return Image.open(cache_file).convert("RGB")
        except Exception:
            pass

        ff = self._find_ffmpeg()
        if not ff:
            return None
        try:
            subprocess.run(
                [ff, "-y", "-ss", "00:00:01", "-i", str(path),
                 "-frames:v", "1", "-vf", "scale=180:-2",
                 "-q:v", "3", str(cache_file)],
                capture_output=True, timeout=15)
        except Exception:
            return None
        if not cache_file.exists():
            return None
        try:
            return Image.open(cache_file).convert("RGB")
        except Exception:
            return None

    def _async_load_bank_thumb(self, entry):
        """Charge le thumbnail en thread, met à jour le label via root.after."""
        eid = entry.get("id")
        if not eid or eid in self._bank_thumb_jobs:
            return
        self._bank_thumb_jobs.add(eid)
        try:
            img = self._extract_bank_thumb(entry)
        finally:
            self._bank_thumb_jobs.discard(eid)
        if img is None:
            return
        try:
            # Limite douce pour ne pas exploser le rendu
            img.thumbnail((220, 180), Image.LANCZOS)
            photo = ImageTk.PhotoImage(img)
        except Exception:
            return

        def _apply():
            card = self._bank_card_thumbs.get(eid)
            if not card:
                return
            try:
                if isinstance(card, tk.Canvas):
                    # Canvas-based card: draw image and remove placeholder
                    W = card.winfo_width() or 160
                    THUMB_H = int(155 * 0.72)
                    # Resize to fit thumb area
                    tw, th = W, THUMB_H
                    img_copy = photo._PhotoImage__photo  # internal PIL ref if any
                    card.delete("placeholder")
                    card.delete("thumb_img")
                    card.create_image(W // 2, THUMB_H // 2,
                                       image=photo, anchor="center",
                                       tags="thumb_img")
                    card._thumb_photo = photo  # prevent GC
                else:
                    # Legacy Label-based (fallback)
                    card.configure(image=photo, text="", height=0)
                    card.image = photo
                self._bank_thumb_refs.append(photo)
            except Exception:
                pass
        try:
            self.root.after(0, _apply)
        except Exception:
            pass

    def _bank_card_context(self, event, entry_id):
        """Right-click sur une carte : sélectionne puis affiche le menu contextuel."""
        self._on_bank_sel_card(entry_id)
        self._bank_context_menu(event)

    def _get_bank_entry(self):
        if not self._bank_selected:
            return None, None
        bank = load_bank()
        return self._bank_selected, next(
            (b for b in bank if b["id"] == self._bank_selected), None)

    def _bank_open(self):
        _, entry = self._get_bank_entry()
        if not entry:
            messagebox.showwarning("Sélection", "Sélectionne une vidéo")
            return
        p = Path(entry["path"])
        if p.exists():
            subprocess.run(["explorer", "/select,", str(p)])
        else:
            messagebox.showerror("Fichier", "Fichier introuvable")

    def _bank_download(self):
        _, entry = self._get_bank_entry()
        if not entry:
            messagebox.showwarning("Sélection", "Sélectionne une vidéo")
            return
        src = Path(entry["path"])
        if not src.exists():
            messagebox.showerror("Fichier", "Fichier introuvable")
            return
        dst = filedialog.asksaveasfilename(
            title="Enregistrer la vidéo",
            initialfile=src.name,
            defaultextension=".mp4",
            filetypes=[("Vidéo MP4", "*.mp4"), ("Tous", "*.*")])
        if dst:
            try:
                shutil.copy2(src, dst)
                self.bank_status.config(text=f"✅ Téléchargé : {Path(dst).name}", fg=OK)
            except Exception as ex:
                messagebox.showerror("Erreur", str(ex))

    def _randomize_meta(self):
        _, entry = self._get_bank_entry()
        if not entry:
            self.root.after(0, lambda: self.bank_status.config(
                text="⚠ Sélectionne une vidéo", fg=WARN))
            return
        src = Path(entry["path"])
        if not src.exists():
            self.root.after(0, lambda: self.bank_status.config(
                text="❌ Fichier introuvable", fg=DANGER))
            return
        # Remplace le fichier original (pas de copie)
        tmp = src.parent / f"_tmp_{random.randint(10000,99999)}{src.suffix}"
        randomize_mp4_metadata(str(src), str(tmp))
        src.unlink()
        tmp.rename(src)
        bank = load_bank()
        for e in bank:
            if e["id"] == self._bank_selected:
                e["meta_randomized"] = True
                e["meta_date"] = datetime.now().isoformat()
                break
        save_bank(bank)
        self.root.after(0, self._refresh_bank)
        self.root.after(0, lambda: self.bank_status.config(
            text="✅ Métadonnées randomisées", fg=OK))

    def _post_from_bank(self):
        _, entry = self._get_bank_entry()
        if not entry:
            messagebox.showwarning("Sélection", "Sélectionne une vidéo")
            return
        if not Path(entry["path"]).exists():
            messagebox.showerror("Fichier", "Fichier introuvable")
            return

        # Navigate to posting tab
        self._show_tab("posting")

        # Refresh bank list in posting tab and pre-select the matching entry
        self._post_refresh_bank()
        for i, e in enumerate(self._post_bank_entries):
            if e["id"] == entry["id"]:
                self.post_bank_lb.selection_clear(0, "end")
                self.post_bank_lb.selection_set(i)
                self.post_bank_lb.see(i)
                self.post_bank_lb.event_generate("<<ListboxSelect>>")
                break

    def _bank_delete(self):
        if not self._bank_selected:
            return
        sels = {self._bank_selected}
        if not messagebox.askyesno(
                "Supprimer",
                f"Supprimer {len(sels)} vidéo(s) de la banque ?\n(fichiers conservés sur disque)"):
            return
        bank = [b for b in load_bank() if b["id"] not in sels]
        save_bank(bank)
        self._bank_selected = None
        self._refresh_bank()

    def _bank_context_menu(self, event):
        # Avec la grille de cartes, l'entry id est déjà sélectionné par le wrapper.
        if not self._bank_selected:
            return
        menu = tk.Menu(self.root, tearoff=0, bg=SURFACE2, fg=TEXT,
                       activebackground=HL, activeforeground=ACCENT,
                       font=("Segoe UI", 10), bd=0, relief="flat")
        menu.add_command(label="✏  Renommer",    command=self._bank_rename)
        menu.add_command(label="🗑  Supprimer",   command=self._bank_delete)
        menu.add_separator()
        menu.add_command(label="ℹ  Voir détails",  command=self._bank_show_details)
        menu.add_command(label="📁  Ouvrir dossier", command=self._bank_open_folder)
        try:
            menu.tk_popup(event.x_root, event.y_root)
        finally:
            menu.grab_release()

    def _bank_rename(self):
        if not hasattr(self, "_bank_selected") or not self._bank_selected:
            return
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == self._bank_selected), None)
        if not entry:
            return
        current = entry.get("display_name") or entry.get("filename") or Path(entry.get("path","")).name
        new_name = simpledialog.askstring(
            "Renommer", "Nouveau nom :", initialvalue=current, parent=self.root)
        if not new_name or new_name.strip() == current:
            return
        new_name = new_name.strip()
        for e in bank:
            if e["id"] == self._bank_selected:
                e["display_name"] = new_name
                break
        save_bank(bank)
        self._refresh_bank()
        self._post_refresh_bank()
        self.bank_status.config(text=f"✓ Renommé en « {new_name} »", fg=OK)
        self.root.after(3000, lambda: self.bank_status.config(text=""))

    def _bank_show_details(self):
        if not hasattr(self, "_bank_selected") or not self._bank_selected:
            return
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == self._bank_selected), None)
        if not entry:
            return
        p = Path(entry.get("path", ""))
        size_mb = f"{p.stat().st_size / 1024 / 1024:.1f} MB" if p.exists() else "Introuvable"
        name = entry.get("display_name") or entry.get("filename") or p.name
        info = (f"Nom : {name}\n"
                f"Fichier : {p.name}\n"
                f"Taille : {size_mb}\n"
                f"Chemin : {p}\n"
                f"Overlay : {entry.get('overlay','—')}")
        messagebox.showinfo("Détails de la vidéo", info, parent=self.root)

    def _bank_open_folder(self):
        if not hasattr(self, "_bank_selected") or not self._bank_selected:
            return
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == self._bank_selected), None)
        if not entry:
            return
        p = Path(entry.get("path", ""))
        folder = p.parent if p.exists() else BASE_DIR
        try:
            if sys.platform == "win32":
                subprocess.Popen(["explorer", str(folder)])
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(folder)])
            else:
                subprocess.Popen(["xdg-open", str(folder)])
        except Exception as e:
            messagebox.showerror("Erreur", str(e))

    # ══════════════════════════════════════════════════════════════════════════
    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET AUTOMATISATION
    # ══════════════════════════════════════════════════════════════════════════
    def _build_autocomment_tab(self):
        import json as _json
        import time as _time

        STATE_FILE = Path(__file__).parent / "autocomment_state.json"

        def _load_state():
            try:
                return _json.loads(STATE_FILE.read_text())
            except Exception:
                return {}

        def _save_state(s):
            STATE_FILE.write_text(_json.dumps(s, indent=2))

        # ── colour palette ────────────────────────────────────────────────────
        SB_BG    = "#0b0e18"
        TAB_BG   = "#070a10"
        TAB_ACT  = "#131b2e"
        ITEM_BG  = "#0e1220"
        ITEM_HOV = "#141e30"
        ITEM_SEL = "#162040"
        ACCENT_C = "#4f8ef7"
        OK_C     = "#22c55e"
        TEXT_C   = "#e8eaf0"
        TEXT2_C  = "#6b7a99"
        MUTED_C  = "#3d4a63"
        SEP_C    = "#141c2e"

        _AVATAR_COLS = ["#4f8ef7","#22c55e","#f59e0b","#e0245e",
                        "#8b5cf6","#06b6d4","#f97316","#ec4899"]

        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["autocomment"] = f
        L = self.cfg.get("lang", "fr")

        # ── hidden functional widgets (logic reads from these) ─────────────
        self._ac_acc_var  = tk.StringVar()
        self._ac_acc_map  = {}
        self._ac_acc_cb   = ttk.Combobox(f, textvariable=self._ac_acc_var,
                                          state="readonly")  # hidden, not packed
        self._ac_media_items = []
        self._ac_vid_lb   = tk.Listbox(f, exportselection=False)  # hidden
        self._ac_groq_var = tk.StringVar(value=self.cfg.get("groq_api_key", ""))
        self._ac_intv_var = tk.IntVar(value=int(self.cfg.get("ac_interval_min", 5)))
        self._ac_running  = False
        self._ac_stop_flag = [False]

        # ── ACCOUNT TABS BAR (top) ────────────────────────────────────────────
        tabs_bar = tk.Frame(f, bg=TAB_BG, height=58)
        tabs_bar.pack(fill="x")
        tabs_bar.pack_propagate(False)

        # Thin accent line at bottom of tab bar
        tk.Frame(f, bg=SEP_C, height=1).pack(fill="x")

        # Scrollable tabs container
        tabs_inner_wrap = tk.Frame(tabs_bar, bg=TAB_BG)
        tabs_inner_wrap.pack(side="left", fill="both", expand=True, pady=0)
        self._ac_tabs_inner = tk.Frame(tabs_inner_wrap, bg=TAB_BG)
        self._ac_tabs_inner.pack(side="left", fill="y", padx=(8, 0))

        # "+" refresh button at right
        tk.Button(tabs_bar, text="+", font=("Segoe UI", 14),
                  bg=TAB_BG, fg=TEXT2_C, relief="flat", bd=0, cursor="hand2",
                  activebackground=TAB_BG,
                  command=lambda: _rebuild_acct_tabs()).pack(side="right", padx=12)

        # ── BODY (left panel + right panel) ───────────────────────────────────
        body = tk.Frame(f, bg=BG)
        body.pack(fill="both", expand=True)

        # ── LEFT PANEL (post list) ─────────────────────────────────────────────
        left_panel = tk.Frame(body, bg=SB_BG, width=310)
        left_panel.pack(side="left", fill="y")
        left_panel.pack_propagate(False)
        tk.Frame(body, bg=SEP_C, width=1).pack(side="left", fill="y")

        # Left header
        lhdr = tk.Frame(left_panel, bg=SB_BG, pady=10)
        lhdr.pack(fill="x", padx=14)
        self._ac_lhdr_lbl = tk.Label(lhdr, text="Sélectionne un compte",
                                      font=("Segoe UI", 11, "bold"),
                                      bg=SB_BG, fg=TEXT_C)
        self._ac_lhdr_lbl.pack(side="left")
        # Reload videos button
        load_vid_btn = tk.Button(lhdr, text="⟳", font=("Segoe UI", 11),
                                  bg=SB_BG, fg=TEXT2_C, relief="flat", bd=0,
                                  cursor="hand2", activebackground=SB_BG,
                                  activeforeground=TEXT_C)
        load_vid_btn.pack(side="right")

        tk.Frame(left_panel, bg=SEP_C, height=1).pack(fill="x")

        # Filter pills
        pill_bar = tk.Frame(left_panel, bg=SB_BG)
        pill_bar.pack(fill="x", padx=10, pady=8)
        _pill_filter = ["all"]

        def _make_pill(parent, text, fkey, bg_act=ACCENT_C, bg_idle=SB_BG):
            btn = tk.Button(parent, text=text,
                            font=("Segoe UI", 8, "bold"),
                            relief="flat", bd=0, cursor="hand2",
                            padx=10, pady=4,
                            bg=bg_act if _pill_filter[0] == fkey else bg_idle,
                            fg="#ffffff" if _pill_filter[0] == fkey else TEXT2_C)
            def _cmd(k=fkey, b=btn):
                _pill_filter[0] = k
                for pb in _all_pills:
                    pb.config(bg=SB_BG, fg=TEXT2_C)
                b.config(bg=ACCENT_C, fg="#ffffff")
                _ac_rebuild_visual_list()
            btn.config(command=_cmd)
            return btn

        _all_pills = []
        p1 = _make_pill(pill_bar, "Tous", "all")
        p2 = _make_pill(pill_bar, "✓ Commentés", "replied",
                        bg_act=OK_C)
        p3 = _make_pill(pill_bar, "Nouveau", "new",
                        bg_act="#e0245e")
        p1.config(bg=ACCENT_C, fg="#ffffff")
        for p in (p1, p2, p3):
            _all_pills.append(p)
            p.pack(side="left", padx=(0, 4))

        tk.Frame(left_panel, bg=SEP_C, height=1).pack(fill="x")

        # Scrollable post list
        list_outer = tk.Frame(left_panel, bg=SB_BG)
        list_outer.pack(fill="both", expand=True)
        list_canvas = tk.Canvas(list_outer, bg=SB_BG,
                                 highlightthickness=0, bd=0)
        list_sb = ttk.Scrollbar(list_outer, orient="vertical",
                                 command=list_canvas.yview)
        list_canvas.configure(yscrollcommand=list_sb.set)
        list_sb.pack(side="right", fill="y")
        list_canvas.pack(side="left", fill="both", expand=True)
        self._ac_list_inner = tk.Frame(list_canvas, bg=SB_BG)
        _list_win = list_canvas.create_window(
            (0, 0), window=self._ac_list_inner, anchor="nw")
        self._ac_list_inner.bind("<Configure>",
            lambda _e: list_canvas.configure(
                scrollregion=list_canvas.bbox("all")))
        list_canvas.bind("<Configure>",
            lambda e: list_canvas.itemconfig(_list_win, width=e.width))

        def _list_wheel(e):
            list_canvas.yview_scroll(int(-1*(e.delta/120)), "units")
        list_canvas.bind("<MouseWheel>", _list_wheel)
        self._ac_list_inner.bind("<MouseWheel>", _list_wheel)

        # Selected item index
        self._ac_sel_idx = [None]

        def _ac_rebuild_visual_list():
            for w in list(self._ac_list_inner.winfo_children()):
                try:
                    w.destroy()
                except Exception:
                    pass
            items = self._ac_media_items
            if not items:
                tk.Label(self._ac_list_inner,
                         text="⟳  Charge les vidéos du compte",
                         font=("Segoe UI", 9), bg=SB_BG, fg=MUTED_C,
                         pady=40).pack()
                return
            state_now = _load_state()
            key = self._ac_acc_var.get()
            ig = ""
            if key in self._ac_acc_map:
                _, d = self._ac_acc_map[key]
                ig = d.get("ig_username", "")
            for idx, (display, mid, code) in enumerate(items):
                replied_ids = state_now.get(f"{ig}:{mid}", {})
                has_replied = bool(replied_ids)
                # Filter
                flt = _pill_filter[0]
                if flt == "replied" and not has_replied:
                    continue
                if flt == "new" and has_replied:
                    continue

                is_sel = (self._ac_sel_idx[0] == idx)
                row_bg = ITEM_SEL if is_sel else ITEM_BG

                row = tk.Frame(self._ac_list_inner, bg=row_bg, cursor="hand2")
                row.pack(fill="x")

                # Avatar circle (Canvas)
                av_col = _AVATAR_COLS[idx % len(_AVATAR_COLS)]
                av_cv = tk.Canvas(row, bg=row_bg, width=44, height=44,
                                   highlightthickness=0)
                av_cv.pack(side="left", padx=(12, 8), pady=8)
                av_cv.create_oval(2, 2, 42, 42, fill=av_col, outline="")
                av_cv.create_text(22, 22, text="🎥" if "🎥" in display else "🖼",
                                   font=("Segoe UI", 13))
                # Status badge bottom-left of avatar
                badge_text = f"{len(replied_ids)}" if has_replied else "NEW"
                badge_col  = OK_C if has_replied else "#e0245e"
                av_cv.create_oval(28, 28, 44, 44, fill=badge_col, outline="")
                av_cv.create_text(36, 36, text=badge_text[:2],
                                   font=("Segoe UI", 7, "bold"), fill="#ffffff")

                # Text area
                txt_col = tk.Frame(row, bg=row_bg)
                txt_col.pack(side="left", fill="x", expand=True)

                # Parse display: "🎥 DD/MM HH:MM  caption..."
                parts = display.split("  ", 1)
                date_part = parts[0].strip()  # "🎥 12/05 03:12"
                cap_part  = (parts[1] if len(parts) > 1 else "").strip()

                tk.Label(txt_col, text=date_part,
                          font=("Segoe UI", 9, "bold"),
                          bg=row_bg, fg=TEXT_C, anchor="w").pack(fill="x")
                if cap_part:
                    cap_short = cap_part[:36] + "…" if len(cap_part) > 36 else cap_part
                    tk.Label(txt_col, text=cap_short,
                              font=("Segoe UI", 8), bg=row_bg,
                              fg=TEXT2_C, anchor="w").pack(fill="x")
                tk.Label(txt_col,
                          text=f"ID: {mid[:14]}…" if len(mid) > 14 else f"ID: {mid}",
                          font=("Consolas", 7), bg=row_bg,
                          fg=MUTED_C, anchor="w").pack(fill="x")

                # Count badge right
                if has_replied:
                    badge_lbl = tk.Label(row,
                                          text=str(len(replied_ids)),
                                          font=("Segoe UI", 8, "bold"),
                                          bg=OK_C, fg="#ffffff",
                                          width=2, padx=4)
                    badge_lbl.pack(side="right", padx=(0, 14))

                tk.Frame(self._ac_list_inner, bg=SEP_C, height=1).pack(fill="x")

                # Click handler
                def _row_click(_e=None, _idx=idx):
                    self._ac_sel_idx[0] = _idx
                    self._ac_vid_lb.selection_clear(0, "end")
                    self._ac_vid_lb.selection_set(_idx)
                    _ac_rebuild_visual_list()
                    _on_vid_select()

                for w in (row, av_cv, txt_col):
                    w.bind("<Button-1>", _row_click)
                    w.bind("<Enter>",
                           lambda e, r=row, bg=row_bg: r.config(bg=ITEM_HOV if not
                               (self._ac_sel_idx[0] == items.index(
                                    next((x for x in items
                                          if str(x[1]) in str(r)), items[0]))
                                if items else False) else ITEM_SEL))
                    w.bind("<Leave>", lambda e, r=row, bg=row_bg: r.config(bg=bg))

            list_canvas.configure(scrollregion=list_canvas.bbox("all"))

        self._ac_rebuild_visual_list = _ac_rebuild_visual_list

        # ── RIGHT PANEL ────────────────────────────────────────────────────────
        right_panel = tk.Frame(body, bg=BG)
        right_panel.pack(side="left", fill="both", expand=True)

        # Empty state (paper plane)
        self._ac_empty_frame = tk.Frame(right_panel, bg=BG)
        self._ac_empty_frame.place(relx=0, rely=0, relwidth=1, relheight=1)
        tk.Canvas(self._ac_empty_frame, bg=BG, highlightthickness=0,
                  width=80, height=80).pack(pady=(80, 0))
        # Draw a paper plane on canvas
        _pp_cv = tk.Canvas(self._ac_empty_frame, bg=BG, highlightthickness=0,
                           width=80, height=80)
        _pp_cv.pack(pady=(80, 0))
        _pp_cv.create_polygon(10,70, 75,10, 75,70, fill="#4f8ef7", outline="")
        _pp_cv.create_polygon(10,70, 75,10, 40,50, fill="#2563eb", outline="")
        _pp_cv.create_polygon(40,50, 75,70, 55,70, fill="#1d4ed8", outline="")
        tk.Label(self._ac_empty_frame,
                 text="Sélectionne une vidéo pour commencer",
                 font=("Segoe UI", 11), bg=BG, fg=TEXT2_C).pack(pady=16)

        # Content frame (shown when a video is selected)
        self._ac_content_frame = tk.Frame(right_panel, bg=BG)
        # (placed dynamically)

        # Comments area
        com_area = tk.Frame(self._ac_content_frame, bg=BG)
        com_area.pack(fill="both", expand=True, padx=0, pady=0)

        com_hdr = tk.Frame(com_area, bg="#070a10", height=40)
        com_hdr.pack(fill="x")
        com_hdr.pack_propagate(False)
        tk.Label(com_hdr, text="💬  Commentaires",
                 font=("Segoe UI", 10, "bold"),
                 bg="#070a10", fg=TEXT_C).pack(side="left", padx=14)
        self._ac_com_count_lbl = tk.Label(com_hdr, text="",
                                           font=("Segoe UI", 8),
                                           bg="#070a10", fg=TEXT2_C)
        self._ac_com_count_lbl.pack(side="left", padx=4)
        tk.Button(com_hdr, text="⟳", font=("Segoe UI", 10),
                  bg="#070a10", fg=TEXT2_C, relief="flat", bd=0, cursor="hand2",
                  command=lambda: _on_vid_select()).pack(side="right", padx=14)

        self._ac_com_box = scrolledtext.ScrolledText(
            com_area, bg="#0a0f1a", fg=TEXT_C,
            font=("Segoe UI", 9), relief="flat", state="disabled",
            wrap="word", padx=12, pady=8)
        self._ac_com_box.pack(fill="both", expand=True)
        self._ac_com_box.tag_config("author",
                                     foreground=ACCENT_C,
                                     font=("Segoe UI", 9, "bold"))
        self._ac_com_box.tag_config("replied", foreground=OK_C)
        self._ac_com_box.tag_config("text", foreground=TEXT_C)
        self._ac_com_box.tag_config("sep", foreground="#141c2e")

        # Config + log panel (bottom of right, collapsible feel)
        cfg_panel = tk.Frame(self._ac_content_frame, bg="#070a10")
        cfg_panel.pack(fill="x", side="bottom")

        tk.Frame(cfg_panel, bg=SEP_C, height=1).pack(fill="x")

        cfg_inner = tk.Frame(cfg_panel, bg="#070a10", padx=16, pady=12)
        cfg_inner.pack(fill="x")

        # Row 1: Groq key + persona label
        cfg_r1 = tk.Frame(cfg_inner, bg="#070a10")
        cfg_r1.pack(fill="x", pady=(0, 8))

        cfg_key_col = tk.Frame(cfg_r1, bg="#070a10")
        cfg_key_col.pack(side="left", fill="x", expand=True, padx=(0, 16))
        tk.Label(cfg_key_col, text="Clé Groq API",
                 font=("Segoe UI", 8, "bold"), bg="#070a10",
                 fg=TEXT2_C, anchor="w").pack(fill="x")
        groq_row = tk.Frame(cfg_key_col, bg="#070a10")
        groq_row.pack(fill="x", pady=(3, 0))
        groq_e = tk.Entry(groq_row, textvariable=self._ac_groq_var,
                           bg="#0e1424", fg=TEXT_C, relief="flat", show="•",
                           font=("Segoe UI", 9), insertbackground=TEXT_C,
                           highlightthickness=1, highlightbackground="#1e2a3a",
                           highlightcolor=ACCENT_C)
        groq_e.pack(side="left", fill="x", expand=True, ipady=4, padx=(0, 4))
        tk.Button(groq_row, text="👁", font=("Segoe UI", 9),
                  bg="#0e1424", fg=TEXT2_C, relief="flat", cursor="hand2",
                  command=lambda: groq_e.config(
                      show="" if groq_e.cget("show") == "•" else "•")
                  ).pack(side="right")

        cfg_intv_col = tk.Frame(cfg_r1, bg="#070a10")
        cfg_intv_col.pack(side="left")
        tk.Label(cfg_intv_col, text="Intervalle",
                 font=("Segoe UI", 8, "bold"), bg="#070a10",
                 fg=TEXT2_C, anchor="w").pack(fill="x")
        intv_row = tk.Frame(cfg_intv_col, bg="#070a10")
        intv_row.pack(pady=(3, 0))
        tk.Spinbox(intv_row, from_=1, to=120, textvariable=self._ac_intv_var,
                   font=("Segoe UI", 9), bg="#0e1424", fg=TEXT_C, width=4,
                   relief="flat", buttonbackground="#0e1424").pack(side="left")
        tk.Label(intv_row, text=" min", font=("Segoe UI", 8),
                 bg="#070a10", fg=TEXT2_C).pack(side="left")

        # Row 2: Persona + start/stop
        cfg_r2 = tk.Frame(cfg_inner, bg="#070a10")
        cfg_r2.pack(fill="x")
        tk.Label(cfg_r2, text="Persona IA",
                 font=("Segoe UI", 8, "bold"), bg="#070a10",
                 fg=TEXT2_C, anchor="w").pack(fill="x")
        self._ac_persona_box = tk.Text(
            cfg_r2, bg="#0e1424", fg=TEXT_C, font=("Segoe UI", 8),
            relief="flat", height=3, wrap="word",
            insertbackground=TEXT_C, padx=6, pady=4,
            highlightthickness=1, highlightbackground="#1e2a3a",
            highlightcolor=ACCENT_C)
        self._ac_persona_box.pack(fill="x", pady=(3, 8))
        self._ac_persona_box.insert("1.0", self.cfg.get("ac_persona",
            "Tu es un créateur de contenu Instagram sympathique. "
            "Réponds en français, de façon courte (1-2 phrases), chaleureuse et engageante."))

        btn_row = tk.Frame(cfg_r2, bg="#070a10")
        btn_row.pack(fill="x")
        self._ac_btn = tk.Button(btn_row, text="▶  Démarrer",
                                  font=("Segoe UI", 10, "bold"),
                                  bg=OK_C, fg="#06080f",
                                  relief="flat", cursor="hand2", pady=8, bd=0,
                                  activebackground="#00a882",
                                  activeforeground="#06080f")
        self._ac_btn.pack(side="left", fill="x", expand=True)

        # Log (compact, right side of btn row)
        tk.Button(btn_row, text="🗑", font=("Segoe UI", 9),
                  bg="#070a10", fg=TEXT2_C, relief="flat", bd=0, cursor="hand2",
                  command=lambda: (self._ac_log_box.config(state="normal"),
                                   self._ac_log_box.delete("1.0", "end"),
                                   self._ac_log_box.config(state="disabled"))
                  ).pack(side="right", padx=(8, 0))

        self._ac_log_box = scrolledtext.ScrolledText(
            cfg_panel, bg="#050810", fg=TEXT2_C,
            font=("Consolas", 8), relief="flat", state="disabled",
            wrap="word", height=5)
        self._ac_log_box.pack(fill="x", padx=0, pady=0)

        # ── ACCOUNT TABS BUILDER ───────────────────────────────────────────────
        def _rebuild_acct_tabs():
            for w in list(self._ac_tabs_inner.winfo_children()):
                try:
                    w.destroy()
                except Exception:
                    pass
            self._ac_acc_map.clear()
            accts = []
            for pid, d in sorted(self.data.items(),
                                   key=lambda x: int(x[1].get("serial_no") or 0)):
                ig = d.get("ig_username") or d.get("phone_name") or ""
                if not ig:
                    continue
                sid = d.get("ig_sessionid", "").strip()
                label = f"{'🟢' if sid else '🔴'} @{ig}".replace("@@", "@")
                self._ac_acc_map[label] = (pid, d)
                accts.append((label, pid, d, ig, bool(sid)))

            self._ac_acc_cb["values"] = list(self._ac_acc_map.keys())
            if self._ac_acc_map and not self._ac_acc_var.get():
                self._ac_acc_cb.current(0)

            cur_key = self._ac_acc_var.get()
            for i, (label, pid, d, ig, has_sid) in enumerate(accts):
                is_act = (label == cur_key)
                tab_col = _AVATAR_COLS[i % len(_AVATAR_COLS)]
                tab_bg  = TAB_ACT if is_act else TAB_BG
                tab = tk.Frame(self._ac_tabs_inner, bg=tab_bg,
                                cursor="hand2",
                                highlightthickness=1 if is_act else 0,
                                highlightbackground=ACCENT_C)
                tab.pack(side="left", padx=(0, 2), pady=4)

                # Avatar circle
                av = tk.Canvas(tab, bg=tab_bg, width=28, height=28,
                                highlightthickness=0)
                av.pack(side="left", padx=(8, 4), pady=8)
                av.create_oval(0, 0, 28, 28, fill=tab_col, outline="")
                av.create_text(14, 14, text=ig[:2].upper(),
                                font=("Segoe UI", 8, "bold"), fill="#ffffff")

                # Status dot + name
                name_col = tk.Frame(tab, bg=tab_bg)
                name_col.pack(side="left", pady=4, padx=(0, 8))
                tk.Label(name_col, text=f"@{ig}",
                          font=("Segoe UI", 8, "bold" if is_act else "normal"),
                          bg=tab_bg,
                          fg=TEXT_C if is_act else TEXT2_C).pack(anchor="w")
                dot_row = tk.Frame(name_col, bg=tab_bg)
                dot_row.pack(anchor="w")
                dot_cv = tk.Canvas(dot_row, bg=tab_bg, width=6, height=6,
                                    highlightthickness=0)
                dot_cv.pack(side="left")
                dot_cv.create_oval(0, 0, 6, 6,
                                    fill=OK_C if has_sid else "#ef4444",
                                    outline="")
                tk.Label(dot_row,
                          text="  session" if has_sid else "  no session",
                          font=("Segoe UI", 6), bg=tab_bg,
                          fg=OK_C if has_sid else "#ef4444").pack(side="left")

                # Bottom accent bar for active tab
                if is_act:
                    tk.Frame(tab, bg=ACCENT_C, height=2).pack(fill="x",
                                                                side="bottom")

                def _tab_click(_e=None, lbl=label, _ig=ig):
                    self._ac_acc_var.set(lbl)
                    self._ac_lhdr_lbl.config(text=f"@{_ig}")
                    self._ac_media_items.clear()
                    self._ac_sel_idx[0] = None
                    self._ac_vid_lb.delete(0, "end")
                    # Show empty state
                    self._ac_content_frame.place_forget()
                    self._ac_empty_frame.place(relx=0, rely=0,
                                                relwidth=1, relheight=1)
                    _rebuild_acct_tabs()
                    _ac_rebuild_visual_list()

                for w in (tab, av, name_col, dot_row, dot_cv):
                    w.bind("<Button-1>", _tab_click)

        _rebuild_acct_tabs()

        # Show content when video selected
        def _show_content():
            self._ac_empty_frame.place_forget()
            self._ac_content_frame.place(relx=0, rely=0,
                                          relwidth=1, relheight=1)

        # ── HELPERS (used by functional code below) ────────────────────────────
        def _refresh_accounts():
            _rebuild_acct_tabs()

        def _ac_log(msg, lv="info"):
            colors = {"info": TEXT2_C, "ok": OK_C, "warn": WARN,
                      "error": DANGER, "accent": ACCENT_C}
            self._ac_log_box.config(state="normal")
            ts = datetime.now().strftime("%H:%M:%S")
            self._ac_log_box.insert("end", f"[{ts}] {msg}\n", lv)
            self._ac_log_box.tag_config(lv, foreground=colors.get(lv, TEXT2_C))
            self._ac_log_box.see("end")
            self._ac_log_box.config(state="disabled")

        # ── helpers définis en premier pour que les closures les trouvent ─────
        def _ac_log(msg, lv="info"):
            colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
            self._ac_log_box.config(state="normal")
            ts = datetime.now().strftime("%H:%M:%S")
            self._ac_log_box.insert("end", f"[{ts}] {msg}\n", lv)
            self._ac_log_box.tag_config(lv, foreground=colors.get(lv, TEXT2))
            self._ac_log_box.see("end")
            self._ac_log_box.config(state="disabled")

        def _fetch_comments_api(sid, media_id, _log=None):
            clean_id = str(media_id).split("_")[0]
            if _log:
                self.root.after(0, lambda: _log(f"🔎 media_id: {clean_id}", "info"))

            # instagrapi handles Bearer token auth which is required for comments endpoint
            from instagrapi import Client as _IgClient
            cl = _IgClient()
            cl.delay_range = [1, 2]
            try:
                cl.login_by_sessionid(sid)
            except Exception as e:
                if _log:
                    self.root.after(0, lambda e=e: _log(f"⚠ login_by_sessionid: {e}", "warn"))

            try:
                raw_list = cl.media_comments(clean_id, amount=100)
                out = []
                for c in raw_list:
                    out.append({
                        "pk": str(getattr(c, "pk", "") or ""),
                        "user": {"username": getattr(getattr(c, "user", None), "username", "?")},
                        "text": getattr(c, "text", ""),
                    })
                return out
            except Exception as e:
                raise RuntimeError(f"Impossible de charger les commentaires: {e}")

        def _post_reply_api(sid, media_id, comment_text, replied_to_id, _cl=None):
            import uuid as _uuid
            import inspect as _inspect
            clean_id = str(media_id).split("_")[0]
            if _cl is None:
                from instagrapi import Client as _IgClient
                _cl = _IgClient()
                _cl.delay_range = [1, 2]
                _cl.login_by_sessionid(sid)

            # Try instagrapi media_comment with replied_to_comment_id param
            try:
                sig = _inspect.signature(_cl.media_comment)
                if "replied_to_comment_id" in sig.parameters:
                    return _cl.media_comment(clean_id, comment_text,
                                             replied_to_comment_id=int(replied_to_id))
            except Exception:
                pass

            # Full private API payload — same fields the IG app sends for a reply
            data = {
                "comment_text": comment_text,
                "replied_to_comment_id": str(replied_to_id),
                "delivery_class": "organic",
                "feed_position": "0",
                "container_module": "self_comments_v2_feed_contextual_self_profile",
                "user_breadcrumb": _cl.gen_user_breadcrumb(len(comment_text))
                    if hasattr(_cl, "gen_user_breadcrumb") else "",
                "idempotence_token": str(_uuid.uuid4()),
                "bootstrap_ufi_param": "",
            }
            return _cl.private_request(f"media/{clean_id}/comments/", data=data)

        def _show_comments_in_panel(comments, replied_ids):
            self._ac_com_box.config(state="normal")
            self._ac_com_box.delete("1.0", "end")
            if not comments:
                self._ac_com_box.insert("end", "Aucun commentaire sur cette vidéo.")
                self._ac_com_box.config(state="disabled")
                self._ac_com_count_lbl.config(text="0 commentaire(s)")
                return
            self._ac_com_count_lbl.config(text=f"{len(comments)} commentaire(s)")
            for c in comments:
                cid = str(c.get("pk") or c.get("id") or "")
                author = c.get("user", {}).get("username", "?")
                text = (c.get("text") or "").strip()
                already = cid in replied_ids
                self._ac_com_box.insert("end", f"@{author}  ", "author")
                tag = "replied" if already else "text"
                suffix = "  ✓" if already else ""
                self._ac_com_box.insert("end", f"{text}{suffix}\n", tag)
                self._ac_com_box.insert("end", "─" * 38 + "\n", "sep")
            self._ac_com_box.config(state="disabled")

        # ── charger vidéos ────────────────────────────────────────────────────
        def _load_videos():
            key = self._ac_acc_var.get()
            if not key or key not in self._ac_acc_map:
                _ac_log("⚠ Sélectionne un compte d'abord", "warn")
                return
            _, d = self._ac_acc_map[key]
            sid = d.get("ig_sessionid", "").strip()
            if not sid:
                _ac_log("❌ Pas de Session ID pour ce compte — ajoute-le dans Paramètres", "error")
                return
            uid = str(d.get("ig_user_id") or d.get("user_id") or "")
            ig = d.get("ig_username", "")

            self._ac_vid_lb.delete(0, "end")
            self._ac_media_items.clear()
            self._ac_vid_lb.insert("end", "⏳ Chargement...")
            load_vid_btn.config(state="disabled")
            _ac_log(f"📥 Chargement des vidéos de @{ig}…", "info")

            def _fetch():
                nonlocal uid
                try:
                    with _ig_session_client(sid) as cl:
                        if not uid:
                            r = cl.get("/api/v1/accounts/current_user/",
                                       params={"edit": "false"})
                            u = r.json().get("user", {})
                            uid = str(u.get("pk") or u.get("id") or "")
                        r = cl.get(f"/api/v1/feed/user/{uid}/", params={"count": "12"})
                        items = r.json().get("items", [])
                    media = []
                    for it in items:
                        # pk is the clean numeric ID, id may include _ownerid suffix
                        mid = str(it.get("pk") or it.get("id", "")).split("_")[0]
                        code = it.get("code") or it.get("shortcode", "")
                        taken = it.get("taken_at", 0)
                        from datetime import datetime as _dt
                        date_s = _dt.fromtimestamp(taken).strftime("%d/%m %H:%M") if taken else "?"
                        kind = "🎥" if it.get("media_type") in (2, "2") else "🖼"
                        cap = it.get("caption") or {}
                        cap_text = (cap.get("text") or "")[:28] if isinstance(cap, dict) else ""
                        display = f"{kind} {date_s}  {cap_text}"
                        media.append((display, mid, code))
                    self.root.after(0, lambda m=media: _show_videos(m))
                except Exception as e:
                    self.root.after(0, lambda e=e: [
                        self._ac_vid_lb.delete(0, "end"),
                        self._ac_vid_lb.insert("end", "❌ Erreur"),
                        load_vid_btn.config(state="normal"),
                        _ac_log(f"❌ Erreur chargement vidéos: {e}", "error")])

            def _show_videos(media):
                self._ac_vid_lb.delete(0, "end")
                self._ac_media_items.clear()
                for display, mid, code in media:
                    self._ac_vid_lb.insert("end", display)
                    self._ac_media_items.append((display, mid, code))
                load_vid_btn.config(state="normal")
                _ac_rebuild_visual_list()
                _ac_log(f"✅ {len(media)} vidéo(s) — clique sur une pour voir ses commentaires",
                        "ok")

            threading.Thread(target=_fetch, daemon=True).start()

        load_vid_btn.config(command=_load_videos)

        # ── clic sur une vidéo → charger commentaires ─────────────────────────
        def _on_vid_select(evt=None):
            idx = self._ac_vid_lb.curselection()
            if not idx or not self._ac_media_items:
                return
            _, media_id, shortcode = self._ac_media_items[idx[0]]
            key = self._ac_acc_var.get()
            if not key or key not in self._ac_acc_map:
                return
            _, d = self._ac_acc_map[key]
            sid = d.get("ig_sessionid", "").strip()
            ig = d.get("ig_username", "")
            if not sid:
                return

            _show_content()

            self._ac_com_box.config(state="normal")
            self._ac_com_box.delete("1.0", "end")
            self._ac_com_box.insert("end", "⏳ Chargement des commentaires…")
            self._ac_com_box.config(state="disabled")
            self._ac_com_count_lbl.config(text="…")
            _ac_log(f"📋 Chargement commentaires — {shortcode or media_id}", "info")

            state_now = _load_state()
            replied_ids = state_now.get(f"{ig}:{media_id}", {})

            def _fetch_com():
                try:
                    comments = _fetch_comments_api(sid, media_id, _log=_ac_log)
                    lv = "ok" if comments else "warn"
                    msg = (f"✅ {len(comments)} commentaire(s) chargé(s)"
                           if comments else
                           "⚠ 0 commentaire — la vidéo n'en a peut-être pas encore, "
                           "ou le compte qui a commenté est le même que le compte cible")
                    self.root.after(0, lambda c=comments, r=replied_ids, m=msg, lv=lv:
                        [_show_comments_in_panel(c, r), _ac_log(m, lv),
                         _ac_rebuild_visual_list()])
                except Exception as e:
                    self.root.after(0, lambda e=e: [
                        _ac_log(f"❌ Erreur commentaires: {e}", "error"),
                        _show_comments_in_panel([], {})])

            threading.Thread(target=_fetch_com, daemon=True).start()

        self._ac_vid_lb.bind("<<ListboxSelect>>", _on_vid_select)

        # ── boucle principale ──────────────────────────────────────────────────
        def _groq_reply(comment_text, persona, groq_key):
            from groq import Groq
            client = Groq(api_key=groq_key)
            resp = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": persona},
                    {"role": "user",
                     "content": f"Commentaire Instagram : \"{comment_text}\"\n\nRéponds à ce commentaire."}
                ],
                max_tokens=120,
                temperature=0.8,
            )
            return resp.choices[0].message.content.strip()

        def _loop_worker(ig, sid, media_id, shortcode, groq_key, persona, interval_sec):
            state = _load_state()
            replied = state.setdefault(f"{ig}:{media_id}", {})

            # Login once, reuse client for all replies (avoids re-auth per comment)
            from instagrapi import Client as _IgClient
            ig_cl = _IgClient()
            ig_cl.delay_range = [1, 2]
            try:
                ig_cl.login_by_sessionid(sid)
            except Exception as e:
                self.root.after(0, lambda e=e: _ac_log(f"⚠ Login: {e}", "warn"))

            self.root.after(0, lambda: _ac_log(
                f"▶ Démarré — @{ig} / {shortcode or media_id} — toutes les {interval_sec//60} min",
                "accent"))

            while not self._ac_stop_flag[0]:
                self.root.after(0, lambda: _ac_log("🔍 Récupération des commentaires…", "info"))
                try:
                    comments = _fetch_comments_api(sid, media_id, _log=_ac_log)
                    self.root.after(0, lambda n=len(comments):
                        _ac_log(f"📋 {n} commentaire(s) trouvé(s)", "info"))

                    new_count = 0
                    for c in comments:
                        if self._ac_stop_flag[0]:
                            break
                        cid = str(c.get("pk") or c.get("id") or "")
                        author = c.get("user", {}).get("username", "")
                        text = (c.get("text") or "").strip()
                        if not cid or not text or author == ig:
                            continue
                        if cid in replied:
                            continue

                        self.root.after(0, lambda a=author, t=text:
                            _ac_log(f"✍️ Génération réponse pour @{a}: \"{t[:40]}\"…", "info"))
                        try:
                            reply = _groq_reply(text, persona, groq_key)
                            self.root.after(0, lambda rp=reply:
                                _ac_log(f"📤 Envoi: \"{rp[:60]}\"", "info"))
                            _post_reply_api(sid, media_id, reply, replied_to_id=cid, _cl=ig_cl)
                            replied[cid] = reply
                            new_count += 1
                            state[f"{ig}:{media_id}"] = replied
                            _save_state(state)
                            self.root.after(0, lambda a=author, t=text, rp=reply:
                                _ac_log(f"✅ @{a} — \"{t[:35]}\" → \"{rp[:50]}\"", "ok"))
                            # refresh comment panel
                            sc = _load_state().get(f"{ig}:{media_id}", {})
                            self.root.after(0, lambda cm=list(comments), sc=sc:
                                _show_comments_in_panel(cm, sc))
                            _time.sleep(8)
                        except Exception as e:
                            self.root.after(0, lambda e=e:
                                _ac_log(f"❌ Erreur envoi réponse: {e}", "error"))

                    if new_count == 0:
                        self.root.after(0, lambda:
                            _ac_log("— Aucun nouveau commentaire à traiter", "info"))
                    else:
                        self.root.after(0, lambda n=new_count:
                            _ac_log(f"✅ {n} réponse(s) envoyée(s)", "ok"))

                except Exception as e:
                    self.root.after(0, lambda e=e:
                        _ac_log(f"❌ Erreur récupération commentaires: {e}", "error"))

                if self._ac_stop_flag[0]:
                    break

                self.root.after(0, lambda iv=interval_sec:
                    _ac_log(f"⏳ Pause {iv//60} min avant prochaine vérification…", "info"))
                for _ in range(interval_sec):
                    if self._ac_stop_flag[0]:
                        break
                    _time.sleep(1)

            self._ac_running = False
            self.root.after(0, lambda: self._ac_btn.config(
                text="▶  Démarrer", bg=OK, fg="#06080f", state="normal"))
            self.root.after(0, lambda: _ac_log("⏹ Arrêté", "warn"))

        def _toggle_ac():
            if self._ac_running:
                self._ac_stop_flag[0] = True
                self._ac_btn.config(state="disabled", text="⏳ Arrêt…")
                return

            key = self._ac_acc_var.get()
            if not key or key not in self._ac_acc_map:
                _ac_log("⚠ Sélectionne un compte", "warn")
                return

            idx = self._ac_vid_lb.curselection()
            if not idx or not self._ac_media_items:
                _ac_log("⚠ Charge les vidéos et sélectionne-en une", "warn")
                return

            _, media_id, shortcode = self._ac_media_items[idx[0]]
            if not media_id:
                _ac_log("❌ media_id manquant", "error")
                return

            groq_key = self._ac_groq_var.get().strip() or self.cfg.get("groq_api_key", "")
            if not groq_key:
                _ac_log("❌ Clé API Groq manquante (étape 3)", "error")
                return

            _, d = self._ac_acc_map[key]
            ig = d.get("ig_username", "")
            sid = d.get("ig_sessionid", "").strip()
            if not sid:
                _ac_log("❌ Pas de Session ID pour ce compte", "error")
                return

            persona = self._ac_persona_box.get("1.0", "end").strip()
            self.cfg.update({"groq_api_key": groq_key, "ac_persona": persona,
                             "ac_interval_min": self._ac_intv_var.get()})
            save_config(self.cfg)

            interval_sec = self._ac_intv_var.get() * 60
            self._ac_running = True
            self._ac_stop_flag[0] = False
            self._ac_btn.config(text="⏹  Arrêter", bg=DANGER, fg=TEXT)
            threading.Thread(
                target=_loop_worker,
                args=(ig, sid, media_id, shortcode, groq_key, persona, interval_sec),
                daemon=True).start()

        self._ac_btn.config(command=_toggle_ac)

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET OUTILS IA
    # ══════════════════════════════════════════════════════════════════════════
    def _build_tools_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["tools"] = f

        L = self.cfg.get("lang", "fr")
        self._tab_header(f, "🔧",
                         "Outils IA" if L == "fr" else "AI Tools",
                         ("Génération de contenu & stratégie Instagram via Groq"
                          if L == "fr"
                          else "Content generation & Instagram strategy via Groq"), WARN)

        canvas_tools = tk.Canvas(f, bg=BG, highlightthickness=0)
        sb_tools = ttk.Scrollbar(f, orient="vertical", command=canvas_tools.yview)
        sb_tools.pack(side="right", fill="y")
        canvas_tools.pack(side="left", fill="both", expand=True)
        canvas_tools.configure(yscrollcommand=sb_tools.set)
        inner_t = tk.Frame(canvas_tools, bg=BG)
        cw_id = canvas_tools.create_window((0, 0), window=inner_t, anchor="nw")

        inner_t.bind("<Configure>",
                     lambda e: canvas_tools.configure(scrollregion=canvas_tools.bbox("all")))
        canvas_tools.bind("<Configure>",
                          lambda e: canvas_tools.itemconfig(cw_id, width=e.width))
        canvas_tools.bind("<MouseWheel>",
                          lambda e: canvas_tools.yview_scroll(int(-1*(e.delta/120)), "units"))
        # Deferred recursive bind so all children exist
        self.root.after(300, lambda: self._bind_mousewheel(inner_t, canvas_tools))

        PAD = 20

        def card(title, subtitle="", accent=None):
            col = accent or WARN
            c = tk.Frame(inner_t, bg=CARD, padx=0, pady=0,
                         highlightthickness=1, highlightbackground=BORDER)
            c.pack(fill="x", padx=PAD, pady=6)
            tk.Frame(c, height=2, bg=col).pack(fill="x")
            inner_c = tk.Frame(c, bg=CARD, padx=18, pady=14)
            inner_c.pack(fill="both", expand=True)
            hdr = tk.Frame(inner_c, bg=CARD)
            hdr.pack(fill="x", pady=(0, 8))
            tk.Label(hdr, text=title, font=("Segoe UI", 12, "bold"),
                     bg=CARD, fg=TEXT).pack(side="left")
            if subtitle:
                tk.Label(hdr, text=subtitle, font=("Segoe UI", 9),
                         bg=CARD, fg=TEXT2).pack(side="left", padx=(10, 0))
            return inner_c

        def _groq_call(prompt, on_success, on_error, max_tokens=400):
            """Run a Groq API call in a background thread, call on_success(text) or on_error(msg)."""
            def run():
                try:
                    try:
                        from groq import Groq
                    except ImportError:
                        subprocess.run(
                            [sys.executable, "-m", "pip", "install", "groq", "--quiet"],
                            capture_output=True, timeout=60
                        )
                        from groq import Groq
                    key = self.cfg.get("groq_api_key", "")
                    if not key:
                        raise ValueError("Clé API Groq manquante → Paramètres > API Keys")
                    client = Groq(api_key=key)
                    resp = client.chat.completions.create(
                        model="llama-3.3-70b-versatile",
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens
                    )
                    result = resp.choices[0].message.content.strip()
                    self.root.after(0, lambda r=result: on_success(r))
                except Exception as ex:
                    msg = str(ex)
                    self.root.after(0, lambda m=msg: on_error(m))
            import threading
            threading.Thread(target=run, daemon=True).start()

        def _set_result(widget, text):
            widget.config(state="normal")
            widget.delete("1.0", "end")
            widget.insert("1.0", text)
            widget.config(state="disabled")

        def _copy_widget(widget):
            txt = widget.get("1.0", "end-1c").strip()
            if txt and not txt.startswith("❌"):
                self.root.clipboard_clear()
                self.root.clipboard_append(txt)

        # ── 1. Analyse concurrents ─────────────────────────────────────────────
        c3 = card("🔍  Stratégie Concurrente", "Recommandations basées sur une niche rivale")
        tk.Label(c3, text="Pseudo concurrent ou niche :",
                 font=("Segoe UI", 9), bg=CARD, fg=TEXT2).pack(anchor="w")
        comp_entry = tk.Entry(c3, bg=SURFACE2, fg=TEXT, insertbackground=TEXT, relief="flat",
                              font=("Segoe UI", 10), highlightthickness=1,
                              highlightbackground=BORDER, highlightcolor=ACCENT)
        comp_entry.pack(fill="x", ipady=5, pady=(4, 8))
        comp_result = tk.Text(c3, height=8, bg=SURFACE, fg=TEXT2, insertbackground=TEXT,
                              relief="flat", font=("Segoe UI", 9), wrap="word",
                              highlightthickness=1, highlightbackground=BORDER,
                              state="disabled")
        comp_result.pack(fill="x", pady=(0, 8))

        def analyze_competitor():
            handle = comp_entry.get().strip().lstrip("@")
            if not handle:
                return
            _set_result(comp_result, "⏳ Analyse en cours...")
            prompt = (f"Expert Instagram growth hacking. Analyse la stratégie pour la niche/compte : {handle}. "
                      f"Recommandations sur : 1) Type de contenu, 2) Fréquence, 3) Heures de publication, "
                      f"4) Stratégie hashtags, 5) Idées Reels viraux, 6) Engagement tactics. "
                      f"Liste structurée avec bullet points.")
            _groq_call(prompt,
                       on_success=lambda t: _set_result(comp_result, t),
                       on_error=lambda m: _set_result(comp_result, f"❌ {m}"),
                       max_tokens=600)

        self._mk_btn(c3, "🔍  Analyser", "primary", analyze_competitor,
                     pady=7).pack(anchor="w")

        # ── 4. Générateur de légendes / captions ──────────────────────────────
        c4 = card("💬  Légendes & Captions Virales", "Captions engageantes pour tes Reels")
        cap_fields = tk.Frame(c4, bg=CARD)
        cap_fields.pack(fill="x", pady=(0, 8))
        cap_subj_col = tk.Frame(cap_fields, bg=CARD)
        cap_subj_col.pack(side="left", fill="x", expand=True, padx=(0, 8))
        tk.Label(cap_subj_col, text="Sujet de la vidéo :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(anchor="w")
        self._cap_subject_var = tk.StringVar()
        tk.Entry(cap_subj_col, textvariable=self._cap_subject_var,
                 bg=SURFACE2, fg=TEXT, insertbackground=TEXT, relief="flat",
                 font=("Segoe UI", 10), highlightthickness=1,
                 highlightbackground=BORDER, highlightcolor=ACCENT).pack(fill="x", ipady=5)
        cap_tone_col = tk.Frame(cap_fields, bg=CARD)
        cap_tone_col.pack(side="left", fill="x", expand=True)
        tk.Label(cap_tone_col, text="Ton :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(anchor="w")
        self._cap_tone_var = tk.StringVar(value="Engageant")
        tone_cb = ttk.Combobox(cap_tone_col, textvariable=self._cap_tone_var,
                                state="readonly", font=("Segoe UI", 9))
        tone_cb["values"] = ["Engageant", "Humoristique", "Informatif",
                              "Mystérieux", "Inspirant", "Provocateur"]
        tone_cb.pack(fill="x", ipady=3)

        cap_result = tk.Text(c4, height=6, bg=SURFACE, fg=TEXT, insertbackground=TEXT,
                             relief="flat", font=("Segoe UI", 10), wrap="word",
                             highlightthickness=1, highlightbackground=BORDER,
                             state="disabled")
        cap_result.pack(fill="x", pady=(0, 8))

        def gen_caption():
            subj = self._cap_subject_var.get().strip()
            if not subj:
                return
            _set_result(cap_result, "⏳ Génération...")
            tone = self._cap_tone_var.get()
            prompt = (f"Légende Instagram virale pour un Reel sur : {subj}. Style : {tone}. "
                      f"Format : accroche forte (1 ligne), corps (2-3 lignes), CTA, "
                      f"puis 15 hashtags. Max 250 mots.")
            _groq_call(prompt,
                       on_success=lambda t: _set_result(cap_result, t),
                       on_error=lambda m: _set_result(cap_result, f"❌ {m}"),
                       max_tokens=400)

        bf4 = tk.Frame(c4, bg=CARD)
        bf4.pack(fill="x")
        self._mk_btn(bf4, "✨  Générer", "primary", gen_caption, pady=7).pack(side="left")
        self._mk_btn(bf4, "📋  Copier", "secondary",
                     lambda: _copy_widget(cap_result), pady=7).pack(side="left", padx=(8, 0))

        # ── 5. Planificateur de contenu ────────────────────────────────────────
        c5 = card("📅  Planificateur de Contenu", "Calendrier éditorial sur 7 jours")
        tk.Label(c5, text="Ta niche / thématique :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(anchor="w")
        plan_topic = tk.Entry(c5, bg=SURFACE2, fg=TEXT, insertbackground=TEXT, relief="flat",
                              font=("Segoe UI", 10), highlightthickness=1,
                              highlightbackground=BORDER, highlightcolor=ACCENT)
        plan_topic.pack(fill="x", ipady=5, pady=(4, 8))
        plan_result = tk.Text(c5, height=10, bg=SURFACE, fg=TEXT2, insertbackground=TEXT,
                              relief="flat", font=("Segoe UI", 9), wrap="word",
                              highlightthickness=1, highlightbackground=BORDER,
                              state="disabled")
        plan_result.pack(fill="x", pady=(0, 8))

        def gen_plan():
            topic = plan_topic.get().strip()
            if not topic:
                return
            _set_result(plan_result, "⏳ Création du planning...")
            prompt = (f"Calendrier éditorial Instagram 7 jours pour : {topic}. "
                      f"Chaque jour : heure optimale, type contenu (Reel/Story/Post), "
                      f"idée précise, titre accrocheur, 5 hashtags. Liste jour par jour.")
            _groq_call(prompt,
                       on_success=lambda t: _set_result(plan_result, t),
                       on_error=lambda m: _set_result(plan_result, f"❌ {m}"),
                       max_tokens=800)

        self._mk_btn(c5, "📅  Générer le planning", "primary", gen_plan, pady=7).pack(anchor="w")

        # Bottom padding
        tk.Frame(inner_t, bg=BG, height=40).pack()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET PARAMÈTRES
    # ══════════════════════════════════════════════════════════════════════════
    def _build_settings_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["settings"] = f

        L = self.cfg.get("lang", "fr")
        self._tab_header(f, "⚙",
                         "Paramètres" if L == "fr" else "Settings",
                         ("Configuration de l'application et des connexions"
                          if L == "fr"
                          else "Application and connection configuration"), TEXT2)

        # Sub-tab nav
        nav = tk.Frame(f, bg=SURFACE2, highlightthickness=1, highlightbackground=BORDER)
        nav.pack(fill="x", padx=20, pady=(0, 0))
        nav_inner = tk.Frame(nav, bg=SURFACE2)
        nav_inner.pack(fill="x", padx=8, pady=6)

        self._settings_panels = {}
        self._settings_nav_btns = {}

        canvas_s = tk.Canvas(f, bg=BG, highlightthickness=0)
        sb_s = ttk.Scrollbar(f, orient="vertical", command=canvas_s.yview)
        sb_s.pack(side="right", fill="y")
        canvas_s.pack(side="left", fill="both", expand=True)
        canvas_s.configure(yscrollcommand=sb_s.set)
        panel_host_wrap = tk.Frame(canvas_s, bg=BG)
        pw_id = canvas_s.create_window((0, 0), window=panel_host_wrap, anchor="nw")
        panel_host_wrap.bind("<Configure>",
            lambda e: canvas_s.configure(scrollregion=canvas_s.bbox("all")))
        canvas_s.bind("<Configure>",
            lambda e: canvas_s.itemconfig(pw_id, width=e.width))
        canvas_s.bind("<MouseWheel>",
            lambda e: canvas_s.yview_scroll(int(-1*(e.delta/120)), "units"))

        panel_host = tk.Frame(panel_host_wrap, bg=BG)
        panel_host.pack(fill="x", padx=20, pady=12)

        # _settings_panels stores (outer_frame, inner_content_frame)
        def show_settings_panel(name):
            for k, (outer, _) in self._settings_panels.items():
                outer.pack_forget()
            for k, b in self._settings_nav_btns.items():
                b.config(bg=SURFACE2, fg=TEXT2, font=("Segoe UI", 10))
            self._settings_panels[name][0].pack(fill="x", pady=(8, 0))
            self._settings_nav_btns[name].config(
                bg=ACCENT, fg="#06080f", font=("Segoe UI", 10, "bold"))

        # Localized labels for the 3 settings sections
        _settings_labels = {
            "Paramètres généraux": ("Paramètres généraux" if L == "fr" else "General settings"),
            "Profil":              ("Profil"              if L == "fr" else "Profile"),
            "Connexions":          ("Connexions"          if L == "fr" else "Connections"),
        }
        for tab_name in ("Paramètres généraux", "Profil", "Connexions"):
            b = tk.Button(nav_inner, text=_settings_labels[tab_name],
                          font=("Segoe UI", 10),
                          bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                          padx=16, pady=6,
                          command=lambda n=tab_name: show_settings_panel(n))
            b.pack(side="left", padx=(0, 4))
            self._settings_nav_btns[tab_name] = b
            outer = tk.Frame(panel_host, bg=CARD,
                             highlightthickness=1, highlightbackground=BORDER)
            tk.Frame(outer, height=2, bg=ACCENT).pack(fill="x")
            inner_p = tk.Frame(outer, bg=CARD, padx=24, pady=20)
            inner_p.pack(fill="both", expand=True)
            self._settings_panels[tab_name] = (outer, inner_p)

        # Virtual sub-panels: API Keys → section inside Connexions
        conn_outer, conn_inner_ref = self._settings_panels["Connexions"]
        tk.Frame(conn_inner_ref, bg=BORDER, height=1).pack(fill="x", pady=(20, 0))
        tk.Label(conn_inner_ref, text="🔑 Clés API",
                 font=("Segoe UI", 12, "bold"), bg=CARD, fg=TEXT).pack(
                     anchor="w", pady=(12, 0))
        api_section = tk.Frame(conn_inner_ref, bg=CARD)
        api_section.pack(fill="x")
        self._settings_panels["API Keys"] = (conn_outer, api_section)

        # Virtual sub-panels: Apparence + Notifications → inside Paramètres généraux
        gen_outer, gen_inner_ref = self._settings_panels["Paramètres généraux"]
        _gen_sub_panels = {}
        _gen_sub_btns = {}

        def _show_gen_sub(name, _sps=_gen_sub_panels, _sbs=_gen_sub_btns):
            for k, spf in _sps.items():
                spf.pack_forget()
            for k, sb in _sbs.items():
                sb.config(bg=SURFACE2, fg=TEXT2, font=("Segoe UI", 9))
            _sps[name].pack(fill="x")
            _sbs[name].config(bg=ACCENT, fg="#06080f", font=("Segoe UI", 9, "bold"))

        gen_sub_nav = tk.Frame(gen_inner_ref, bg=SURFACE2,
                               highlightthickness=1, highlightbackground=BORDER)
        gen_sub_nav.pack(fill="x", pady=(0, 14))
        gen_sub_nav_inner = tk.Frame(gen_sub_nav, bg=SURFACE2)
        gen_sub_nav_inner.pack(fill="x", padx=6, pady=4)

        for _sname in ("Apparence", "Notifications", "Langue"):
            _sb = tk.Button(gen_sub_nav_inner, text=_sname, font=("Segoe UI", 9),
                            bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                            padx=12, pady=4,
                            command=lambda n=_sname: _show_gen_sub(n))
            _sb.pack(side="left", padx=(0, 2))
            _gen_sub_btns[_sname] = _sb
            _spf = tk.Frame(gen_inner_ref, bg=CARD)
            _gen_sub_panels[_sname] = _spf
            self._settings_panels[_sname] = (gen_outer, _spf)

        _show_gen_sub("Apparence")

        # --- Profil panel ---
        prof = self._settings_panels["Profil"][1]
        tk.Label(prof, text="Mon Profil", font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 16))

        prof_fields = [
            ("Pseudo / Nom",        "profile_name",     ""),
            ("Email",               "profile_email",    ""),
            ("Niche principale",    "profile_niche",    "ex: Fitness, Crypto, Mode..."),
            ("Dossier export vidéo","export_dir",       "Chemin vers le dossier d'export"),
        ]
        self._prof_vars = {}
        for lbl, key, hint in prof_fields:
            tk.Label(prof, text=lbl, font=("Segoe UI", 10), bg=CARD, fg=TEXT2,
                     anchor="w").pack(fill="x", pady=(8, 2))
            if hint:
                tk.Label(prof, text=hint, font=("Segoe UI", 8), bg=CARD, fg=MUTED,
                         anchor="w").pack(fill="x")
            var = tk.StringVar(value=self.cfg.get(key, ""))
            self._prof_vars[key] = var
            row = tk.Frame(prof, bg=CARD)
            row.pack(fill="x", pady=(2, 0))
            tk.Entry(row, textvariable=var, font=("Segoe UI", 11),
                     bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                     relief="flat", bd=0, highlightthickness=1,
                     highlightcolor=ACCENT, highlightbackground=BORDER).pack(
                         side="left", fill="x", expand=True, ipady=7)
            if key == "export_dir":
                def _browse_dir(v=var):
                    d = filedialog.askdirectory(title="Dossier d'export")
                    if d:
                        v.set(d)
                tk.Button(row, text="📂", font=("Segoe UI", 11),
                          bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=10,
                          command=_browse_dir).pack(side="right", padx=(4, 0))

        tk.Label(prof, text="Mot de passe (laisser vide pour ne pas changer)",
                 font=("Segoe UI", 10), bg=CARD, fg=TEXT2, anchor="w").pack(fill="x", pady=(14, 2))
        self._prof_pwd_var = tk.StringVar()
        self._prof_pwd2_var = tk.StringVar()
        for pvar, hint_txt in [(self._prof_pwd_var, "Nouveau mot de passe"),
                                (self._prof_pwd2_var, "Confirmer le mot de passe")]:
            tk.Entry(prof, textvariable=pvar, show="•", font=("Segoe UI", 11),
                     bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                     relief="flat", bd=0, highlightthickness=1,
                     highlightcolor=ACCENT, highlightbackground=BORDER,
                     ).pack(fill="x", ipady=7, pady=(2, 0))
            tk.Label(prof, text=hint_txt, font=("Segoe UI", 8), bg=CARD, fg=MUTED,
                     anchor="w").pack(fill="x")

        prof_status = tk.Label(prof, text="", font=("Segoe UI", 9), bg=CARD, fg=OK)
        prof_status.pack(anchor="w", pady=(8, 0))

        def _save_profile():
            for key, var in self._prof_vars.items():
                self.cfg[key] = var.get().strip()
            pwd  = self._prof_pwd_var.get()
            pwd2 = self._prof_pwd2_var.get()
            if pwd or pwd2:
                if pwd != pwd2:
                    prof_status.config(text="❌ Les mots de passe ne correspondent pas", fg=DANGER)
                    return
                import hashlib
                self.cfg["profile_password_hash"] = hashlib.sha256(pwd.encode()).hexdigest()
                self._prof_pwd_var.set("")
                self._prof_pwd2_var.set("")
                prof_status.config(text="✅ Profil & mot de passe sauvegardés", fg=OK)
            else:
                prof_status.config(text="✅ Profil sauvegardé", fg=OK)
            save_config(self.cfg)

        self._mk_btn(prof, "💾  Sauvegarder le profil", "primary", _save_profile,
                     font=("Segoe UI", 11, "bold"), pady=10
                     ).pack(fill="x", pady=(16, 0))

        # --- Connexions panel ---
        conn = self._settings_panels["Connexions"][1]
        tk.Label(conn, text="Connexions GéeLark", font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 16))
        self.bearer_var = tk.StringVar(value=self.cfg.get("bearer_token", ""))
        self.proxy_var  = tk.StringVar(value=self.cfg.get("proxy", ""))
        for lbl, hint, var in [
            ("GéeLark Bearer Token", "Token API GéeLark (Settings → Open API)", self.bearer_var),
            ("Proxy SOCKS5", "Format : socks5://user:pass@host:port", self.proxy_var),
        ]:
            tk.Label(conn, text=lbl, font=("Segoe UI", 10), bg=CARD, fg=TEXT2, anchor="w").pack(fill="x", pady=(10, 2))
            tk.Label(conn, text=hint, font=("Segoe UI", 8), bg=CARD, fg=MUTED, anchor="w").pack(fill="x")
            tk.Entry(conn, textvariable=var, font=("Consolas", 11),
                     bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                     relief="flat", bd=0, highlightthickness=1,
                     highlightcolor=ACCENT, highlightbackground=BORDER).pack(fill="x", ipady=7, pady=(2, 0))
        self.proxy_status = tk.Label(conn, text="", font=("Segoe UI", 9), bg=CARD, fg=TEXT2)
        self.proxy_status.pack(anchor="w", pady=(4, 0))

        btn_row = tk.Frame(conn, bg=CARD)
        btn_row.pack(fill="x", pady=(12, 0))
        self._mk_btn(btn_row, "💾  Sauvegarder", "primary", self._save_settings,
                     font=("Segoe UI", 11, "bold"), pady=8
                     ).pack(side="left", fill="x", expand=True)
        self._mk_btn(btn_row, "🔌  Tester proxy + IG", "secondary", self._test_proxy,
                     pady=8).pack(side="left", fill="x", expand=True, padx=(8, 0))

        # ── Push Server ────────────────────────────────────────────────────
        tk.Frame(conn, bg=BORDER, height=1).pack(fill="x", pady=(20, 16))
        tk.Label(conn, text="📲 Serveur Push (GéeLark → App)",
                 font=("Segoe UI", 12, "bold"), bg=CARD, fg=TEXT).pack(anchor="w")
        tk.Label(conn,
                 text="Lance un serveur HTTP local. Appelle l'URL depuis le navigateur\n"
                      "du téléphone GéeLark pour mettre à jour les stats d'un compte.",
                 font=("Segoe UI", 8), bg=CARD, fg=MUTED, justify="left").pack(anchor="w", pady=(4, 10))

        # Port row
        port_row = tk.Frame(conn, bg=CARD)
        port_row.pack(fill="x", pady=(0, 8))
        tk.Label(port_row, text="Port :", font=("Segoe UI", 10), bg=CARD, fg=TEXT2).pack(side="left")
        self.push_port_var = tk.StringVar(value=str(self.cfg.get("push_port", 8765)))
        tk.Entry(port_row, textvariable=self.push_port_var, width=7,
                 font=("Consolas", 11), bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                 relief="flat", bd=0, highlightthickness=1,
                 highlightcolor=ACCENT, highlightbackground=BORDER).pack(side="left", padx=(6, 0), ipady=5)
        self._push_status_var = tk.StringVar(value="⏹ Serveur arrêté")
        tk.Label(port_row, textvariable=self._push_status_var,
                 font=("Segoe UI", 9), bg=CARD, fg=TEXT2).pack(side="left", padx=(12, 0))

        # Start button
        self._push_btn = tk.Button(conn, text="▶  Démarrer", font=("Segoe UI", 10, "bold"),
                                   bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                                   pady=8, bd=0, activebackground=ACCENT2,
                                   activeforeground="#06080f",
                                   command=self._start_push_server)
        self._push_btn.pack(fill="x", pady=(0, 8))
        self._bind_hover(self._push_btn, ACCENT, ACCENT2, "#06080f", "#06080f")

        # URL display + copy
        tk.Label(conn, text="URL à ouvrir sur GéeLark :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(anchor="w")
        url_row = tk.Frame(conn, bg=CARD)
        url_row.pack(fill="x", pady=(2, 0))
        self._push_url_var = tk.StringVar(value="(lance le serveur d'abord)")
        url_entry = tk.Entry(url_row, textvariable=self._push_url_var,
                             font=("Consolas", 8), state="readonly",
                             bg=SURFACE2, fg=MUTED, relief="flat", bd=0,
                             readonlybackground=SURFACE2)
        url_entry.pack(side="left", fill="x", expand=True, ipady=5)
        def _copy_url():
            self.root.clipboard_clear()
            self.root.clipboard_append(self._push_url_var.get())
        tk.Button(url_row, text="📋", font=("Segoe UI", 10),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=8,
                  command=_copy_url).pack(side="right", padx=(4, 0))
        tk.Label(conn,
                 text="Remplace USERNAME par le @username, FOLLOWERS par le nombre, etc.",
                 font=("Segoe UI", 7), bg=CARD, fg=MUTED, anchor="w").pack(fill="x", pady=(3, 0))

        # --- API Keys panel ---
        api = self._settings_panels["API Keys"][1]
        tk.Label(api, text="Clés API", font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 16))

        # Groq
        self.groq_key_var = tk.StringVar(value=self.cfg.get("groq_api_key", ""))
        tk.Label(api, text="Groq API Key", font=("Segoe UI", 10), bg=CARD, fg=TEXT2,
                 anchor="w").pack(fill="x", pady=(0, 2))
        tk.Label(api, text="Gratuit sur groq.com → API Keys → Create",
                 font=("Segoe UI", 8), bg=CARD, fg=MUTED, anchor="w").pack(fill="x")
        tk.Entry(api, textvariable=self.groq_key_var, font=("Consolas", 11),
                 bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                 relief="flat", bd=0, highlightthickness=1,
                 highlightcolor=ACCENT, highlightbackground=BORDER).pack(
                     fill="x", ipady=7, pady=(2, 0))

        # Instagram Session ID
        tk.Label(api, text="Instagram Session ID", font=("Segoe UI", 10), bg=CARD, fg=TEXT2,
                 anchor="w").pack(fill="x", pady=(16, 2))
        tk.Label(api,
                 text="Ouvre Instagram dans Chrome → F12 → Application → Cookies → sessionid",
                 font=("Segoe UI", 8), bg=CARD, fg=MUTED, anchor="w").pack(fill="x")
        self.ig_session_var = tk.StringVar(value=self.cfg.get("ig_sessionid", ""))
        ig_sess_row = tk.Frame(api, bg=CARD)
        ig_sess_row.pack(fill="x", pady=(2, 0))
        ig_sess_entry = tk.Entry(ig_sess_row, textvariable=self.ig_session_var,
                                  font=("Consolas", 10), show="•",
                                  bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                                  relief="flat", bd=0, highlightthickness=1,
                                  highlightcolor=ACCENT, highlightbackground=BORDER)
        ig_sess_entry.pack(side="left", fill="x", expand=True, ipady=7)
        def _toggle_sess_show():
            ig_sess_entry.config(show="" if ig_sess_entry.cget("show") == "•" else "•")
        tk.Button(ig_sess_row, text="👁", font=("Segoe UI", 10),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=8,
                  command=_toggle_sess_show).pack(side="right", padx=(4, 0))

        # Session ID status indicator
        sess_status = tk.Label(api, text="", font=("Segoe UI", 9), bg=CARD, fg=TEXT2)
        sess_status.pack(anchor="w", pady=(4, 0))
        if self.cfg.get("ig_sessionid"):
            sess_status.config(text="✅ Session ID configurée", fg=OK)

        self._mk_btn(api, "💾  Sauvegarder les clés API", "primary", self._save_settings,
                     font=("Segoe UI", 11, "bold"), pady=10
                     ).pack(fill="x", pady=(16, 0))

        # --- Apparence panel ---
        app_pan = self._settings_panels["Apparence"][1]
        tk.Label(app_pan, text="Thème de couleur", font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 6))
        tk.Label(app_pan, text="Choisissez l'accent couleur de l'interface",
                 font=("Segoe UI", 9), bg=CARD, fg=TEXT2).pack(anchor="w", pady=(0, 14))

        current_theme = self.cfg.get("theme", "Lime")
        self._theme_var = tk.StringVar(value=current_theme)

        swatches_outer = tk.Frame(app_pan, bg=CARD)
        swatches_outer.pack(fill="x")
        cols = 4
        for idx, (tname, tvals) in enumerate(THEMES.items()):
            row_f = idx // cols
            col_f = idx % cols
            if col_f == 0:
                row_frame = tk.Frame(swatches_outer, bg=CARD)
                row_frame.pack(fill="x", pady=4)
            cell = tk.Frame(row_frame, bg=CARD)
            cell.pack(side="left", padx=6, expand=True)
            accent_c = tvals["accent"]
            is_sel = (tname == current_theme)
            border_c = TEXT if is_sel else BORDER
            swatch_frame = tk.Frame(cell, bg=border_c, padx=2, pady=2)
            swatch_frame.pack()
            swatch_btn = tk.Button(
                swatch_frame, bg=accent_c, width=4, height=2,
                relief="flat", cursor="hand2",
                command=lambda n=tname: self._apply_theme(n)
            )
            swatch_btn.pack()
            tk.Label(cell, text=tname, font=("Segoe UI", 9),
                     bg=CARD, fg=TEXT2).pack(pady=(4, 0))

        tk.Label(app_pan, text="Thème actif :", font=("Segoe UI", 10),
                 bg=CARD, fg=TEXT2).pack(anchor="w", pady=(20, 4))
        self._theme_active_lbl = tk.Label(app_pan, text=current_theme,
                                           font=("Segoe UI", 11, "bold"),
                                           bg=CARD, fg=ACCENT)
        self._theme_active_lbl.pack(anchor="w")

        # ── Language switcher ────────────────────────────────────────────────
        lang_pan = self._settings_panels["Langue"][1]
        tk.Label(lang_pan, text="Langue · Language",
                 font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 6))
        tk.Label(lang_pan, text="Choisis la langue de l'interface (relance requise pour tout traduire)",
                 font=("Segoe UI", 9), bg=CARD, fg=TEXT2).pack(anchor="w", pady=(0, 12))

        self._lang_var = tk.StringVar(value=self.cfg.get("lang", "fr"))
        lang_row = tk.Frame(lang_pan, bg=CARD)
        lang_row.pack(fill="x")

        def _make_lang_btn(code, flag, label):
            outer, inner = self._round_card(lang_row, radius=12, bg=SURFACE2,
                                              border=BORDER, border_w=1,
                                              hover_border=ACCENT)
            outer.pack(side="left", padx=(0, 10))
            outer.configure(width=140, height=72)
            outer.pack_propagate(False)

            content = tk.Frame(inner, bg=SURFACE2, cursor="hand2")
            content.pack(fill="both", expand=True, padx=14, pady=10)
            flag_lbl = tk.Label(content, text=flag, font=("Segoe UI", 22),
                                 bg=SURFACE2, cursor="hand2")
            flag_lbl.pack(side="left", padx=(0, 10))
            txt_col = tk.Frame(content, bg=SURFACE2, cursor="hand2")
            txt_col.pack(side="left", fill="both", expand=True)
            tk.Label(txt_col, text=label, font=("Segoe UI", 11, "bold"),
                     bg=SURFACE2, fg=TEXT, cursor="hand2").pack(anchor="w")
            check = tk.Label(txt_col, text="", font=("Segoe UI", 9, "bold"),
                              bg=SURFACE2, fg=OK, cursor="hand2")
            check.pack(anchor="w")

            def _refresh():
                if self._lang_var.get() == code:
                    outer._set_border(ACCENT)
                    check.config(text="✓ Sélectionné" if code == "fr" else "✓ Selected")
                else:
                    outer._set_border(BORDER)
                    check.config(text="")

            def _select(_e=None):
                self._lang_var.get()
                self._lang_var.set(code)
                self.cfg["lang"] = code
                save_config(self.cfg)
                lang_status.config(
                    text=("✅ Langue enregistrée — relance l'app pour appliquer"
                          if code == "fr"
                          else "✅ Language saved — restart the app to apply"),
                    fg=OK)
                # Refresh all 3 buttons
                for r in _refresh_all:
                    r()

            for w in (outer._cv, content, flag_lbl, txt_col, check) + tuple(txt_col.winfo_children()):
                try: w.bind("<Button-1>", _select, add="+")
                except: pass
            return _refresh

        _refresh_all = []
        _refresh_all.append(_make_lang_btn("fr", "🇫🇷", "Français"))
        _refresh_all.append(_make_lang_btn("en", "🇬🇧", "English"))

        lang_status = tk.Label(lang_pan, text="", font=("Segoe UI", 9),
                                bg=CARD, fg=TEXT2)
        lang_status.pack(anchor="w", pady=(12, 0))

        # Initial render
        for r in _refresh_all:
            r()

        # --- Notifications panel ---
        notif = self._settings_panels["Notifications"][1]
        tk.Label(notif, text="Notifications", font=("Segoe UI", 13, "bold"),
                 bg=CARD, fg=TEXT).pack(anchor="w", pady=(0, 6))
        tk.Label(notif, text="Configure les alertes affichées et les sons",
                 font=("Segoe UI", 9), bg=CARD, fg=TEXT2).pack(anchor="w", pady=(0, 14))

        self._notify_popup_var = tk.BooleanVar(value=self.cfg.get("notify_popup", True))
        self._notify_sound_var = tk.BooleanVar(value=self.cfg.get("notify_sound", True))

        def _make_toggle(parent, label, hint, var, color):
            row_outer, row_in = self._round_card(parent, radius=10, bg=SURFACE2,
                                                  border=BORDER, border_w=1)
            row_outer.pack(fill="x", pady=(0, 8))
            row_outer.configure(height=66)
            row_outer.pack_propagate(False)
            inner = tk.Frame(row_in, bg=SURFACE2, padx=14, pady=10)
            inner.pack(fill="both", expand=True)
            txt_col = tk.Frame(inner, bg=SURFACE2)
            txt_col.pack(side="left", fill="x", expand=True)
            tk.Label(txt_col, text=label, font=("Segoe UI", 11, "bold"),
                     bg=SURFACE2, fg=TEXT).pack(anchor="w")
            tk.Label(txt_col, text=hint, font=("Segoe UI", 9),
                     bg=SURFACE2, fg=TEXT2).pack(anchor="w")
            # Toggle switch (Canvas pill)
            sw = tk.Canvas(inner, width=44, height=22, bg=SURFACE2,
                           highlightthickness=0, cursor="hand2")
            sw.pack(side="right", padx=(10, 0))
            def _draw():
                sw.delete("all")
                on = var.get()
                bg_c = color if on else MUTED
                # Pill bg
                sw.create_oval(0, 0, 22, 22, fill=bg_c, outline="")
                sw.create_oval(22, 0, 44, 22, fill=bg_c, outline="")
                sw.create_rectangle(11, 0, 33, 22, fill=bg_c, outline="")
                # Knob
                kx = 24 if on else 2
                sw.create_oval(kx, 2, kx + 18, 20, fill="#ffffff", outline="")
            def _toggle(e=None):
                var.set(not var.get())
                _draw()
            sw.bind("<Button-1>", _toggle)
            for w in (inner, txt_col, row_outer._cv) + tuple(txt_col.winfo_children()):
                try: w.bind("<Button-1>", _toggle, add="+")
                except: pass
            _draw()
            return sw

        _make_toggle(notif, "Popup à la fin du posting",
                      "Affiche un toast en haut à droite quand un post est terminé",
                      self._notify_popup_var, OK)
        _make_toggle(notif, "Son de notification",
                      "Joue un bip quand un posting se termine (Windows)",
                      self._notify_sound_var, ACCENT)

        notif_status = tk.Label(notif, text="", font=("Segoe UI", 9), bg=CARD, fg=OK)
        notif_status.pack(anchor="w", pady=(8, 6))

        def _save_notif():
            self.cfg["notify_popup"] = self._notify_popup_var.get()
            self.cfg["notify_sound"] = self._notify_sound_var.get()
            save_config(self.cfg)
            notif_status.config(text="✅ Préférences enregistrées", fg=OK)
            self.root.after(2500, lambda: notif_status.config(text=""))

        def _test_notif():
            if self._notify_popup_var.get():
                self._show_toast("🔔 Test", "Notifications activées", col=OK)
            if self._notify_sound_var.get():
                self._play_notify_sound()
            if not (self._notify_popup_var.get() or self._notify_sound_var.get()):
                notif_status.config(text="Active au moins une option pour tester",
                                     fg=WARN)
                self.root.after(2500, lambda: notif_status.config(text=""))

        btn_row = tk.Frame(notif, bg=CARD)
        btn_row.pack(fill="x", pady=(4, 0))
        self._mk_btn(btn_row, "💾  Enregistrer", "primary", _save_notif,
                     font=("Segoe UI", 10, "bold"), pady=8).pack(side="left")
        self._mk_btn(btn_row, "🔔  Tester", "secondary", _test_notif,
                     font=("Segoe UI", 10), pady=8).pack(side="left", padx=(8, 0))

        # Show first panel by default
        show_settings_panel("Paramètres généraux")

        # Logs always at bottom
        log_header = tk.Frame(panel_host_wrap, bg=BG)
        log_header.pack(fill="x", padx=20, pady=(8, 0))
        tk.Label(log_header, text="TERMINAL", font=("Consolas", 8, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        tk.Frame(log_header, height=1, bg=BORDER).pack(side="left", fill="x",
                                                        expand=True, padx=(10, 0))
        self.log_box = scrolledtext.ScrolledText(
            panel_host_wrap, bg=SURFACE, fg=TEXT2, font=("Consolas", 9),
            relief="flat", state="disabled", wrap="word", height=10,
            highlightthickness=1, highlightbackground=BORDER)
        self.log_box.pack(fill="x", padx=20, pady=(4, 16))

    def _save_settings(self):
        raw_proxy = self.proxy_var.get().strip()
        normalized = normalize_proxy(raw_proxy) if raw_proxy else ""
        if normalized != raw_proxy and normalized:
            self.proxy_var.set(normalized)
            self.proxy_status.config(
                text=f"✅ Proxy normalisé : {normalized}", fg=OK)
        elif raw_proxy and not normalized:
            self.proxy_status.config(text="⚠ Format proxy non reconnu", fg=WARN)
        else:
            self.proxy_status.config(text="", fg=TEXT2)
        self.cfg["bearer_token"]  = self.bearer_var.get().strip()
        self.cfg["proxy"]         = normalized or raw_proxy
        self.cfg["groq_api_key"]  = self.groq_key_var.get().strip()
        self.cfg["ig_sessionid"]  = getattr(self, 'ig_session_var',
                                             tk.StringVar()).get().strip()
        try:
            self.cfg["push_port"] = int(getattr(self, "push_port_var",
                                                  tk.StringVar(value="8765")).get())
        except ValueError:
            pass
        save_config(self.cfg)
        self.log("Config sauvegardée ✓", "ok")

    def _test_proxy(self):
        proxy_raw  = self.proxy_var.get().strip()
        sessionid  = getattr(self, 'ig_session_var', tk.StringVar()).get().strip()
        proxy_norm = normalize_proxy(proxy_raw) if proxy_raw else ""

        win = tk.Toplevel(self.root)
        win.title("🔌 Test proxy + Instagram")
        win.geometry("620x460")
        win.configure(bg=BG)
        tk.Label(win, text="🔌 Diagnostic proxy & Instagram",
                 font=("Segoe UI", 13, "bold"), bg=BG, fg=TEXT).pack(anchor="w", padx=20, pady=(16,4))

        log = scrolledtext.ScrolledText(win, bg=SURFACE, fg=TEXT2, font=("Consolas", 9),
                                         relief="flat", state="disabled", wrap="word")
        log.pack(fill="both", expand=True, padx=20, pady=(0,12))

        def tlog(msg, color=None):
            log.config(state="normal")
            tag = f"c{id(color)}"
            log.insert("end", msg + "\n", tag)
            log.tag_config(tag, foreground=color or TEXT2)
            log.see("end")
            log.config(state="disabled")
            win.update()

        def run():
            tlog(f"Proxy configuré : {proxy_norm or '(aucun)'}", TEXT2)
            tlog(f"Session ID      : {'✅ présente' if sessionid else '❌ absente'}", OK if sessionid else DANGER)
            tlog("")

            kw = {"timeout": 15, "follow_redirects": True}
            if proxy_norm:
                kw["proxy"] = proxy_norm

            # Step 1: connectivity via proxy
            tlog("── Test 1 : connexion via proxy → httpbin.org ──", ACCENT)
            try:
                r = httpx.get("https://httpbin.org/ip", **kw)
                ip = r.json().get("origin", "?")
                tlog(f"   ✅ IP sortante : {ip}", OK)
            except Exception as ex:
                tlog(f"   ❌ Échec : {ex}", DANGER)
                tlog("   → Proxy injoignable ou mauvais format", WARN)

            # Step 2: reach instagram.com
            tlog("── Test 2 : instagram.com (page principale) ──", ACCENT)
            csrf = ""
            try:
                r2 = httpx.get("https://www.instagram.com/", headers={"User-Agent": _BROWSER_UA},
                               **kw)
                csrf = r2.cookies.get("csrftoken", "")
                tlog(f"   HTTP {r2.status_code}  |  csrftoken : {'✅' if csrf else '❌ absent'}",
                     OK if r2.status_code == 200 else WARN)
            except Exception as ex:
                tlog(f"   ❌ {ex}", DANGER)

            # Step 3: search endpoint (Android, moins rate-limité)
            tlog("── Test 3a : search endpoint Android ──", ACCENT)
            srch_hdrs = {
                "User-Agent": ("Instagram 275.0.0.27.98 Android "
                               "(33/13; 420dpi; 1080x2274; samsung; SM-G991B; "
                               "o1s; exynos2100; en_US; 459673581)"),
                "X-IG-App-ID":          "567067343352427",
                "X-IG-Capabilities":    "3brTvwE=",
                "X-IG-Connection-Type": "WIFI",
                "Accept":               "application/json",
                "Accept-Language":      "fr-FR,fr;q=0.9",
            }
            if cookie_hdr:
                srch_hdrs["Cookie"] = cookie_hdr
            try:
                rs = httpx.get(
                    "https://i.instagram.com/api/v1/search/users/?q=instagram&count=3",
                    headers=srch_hdrs, **kw
                )
                tlog(f"   HTTP {rs.status_code}", OK if rs.status_code == 200 else WARN)
                if rs.status_code == 200:
                    users = rs.json().get("users", [])
                    tlog(f"   ✅ Résultats reçus : {len(users)} user(s)", OK)
                elif rs.status_code == 401:
                    tlog("   ❌ 401 — sessionid invalide", DANGER)
                elif rs.status_code == 429:
                    tlog("   ❌ 429 — rate limited", DANGER)
                else:
                    tlog(f"   Réponse : {rs.text[:150]}", TEXT2)
            except Exception as ex:
                tlog(f"   ❌ {ex}", DANGER)

            # Step 3b: web API endpoint
            tlog("── Test 3b : API web i.instagram.com ──", ACCENT)
            cookie_hdr = f"sessionid={sessionid}" if sessionid else ""
            if csrf:
                cookie_hdr += f"; csrftoken={csrf}" if cookie_hdr else f"csrftoken={csrf}"
            api_hdrs = {
                "User-Agent":     _BROWSER_UA,
                "X-IG-App-ID":    "936619743392459",
                "Accept":         "application/json",
                "Origin":         "https://www.instagram.com",
            }
            if cookie_hdr:
                api_hdrs["Cookie"] = cookie_hdr
            if csrf:
                api_hdrs["X-CSRFToken"] = csrf
            try:
                r3 = httpx.get("https://i.instagram.com/api/v1/users/web_profile_info/?username=instagram",
                               headers=api_hdrs, **kw)
                tlog(f"   HTTP {r3.status_code}", OK if r3.status_code == 200 else WARN)
                if r3.status_code == 200:
                    user = r3.json().get("data", {}).get("user", {})
                    tlog(f"   ✅ Données reçues — followers instagram: {user.get('edge_followed_by',{}).get('count','?')}", OK)
                elif r3.status_code == 401:
                    tlog("   ❌ 401 — sessionid invalide ou expiré", DANGER)
                elif r3.status_code == 403:
                    tlog("   ❌ 403 — IP/proxy bloqué par Instagram", DANGER)
                elif r3.status_code == 429:
                    tlog("   ❌ 429 — trop de requêtes / proxy banni", DANGER)
                else:
                    tlog(f"   Réponse : {r3.text[:200]}", TEXT2)
            except Exception as ex:
                tlog(f"   ❌ {ex}", DANGER)

            tlog("")
            tlog("── Résumé ──", ACCENT)
            if not proxy_norm:
                tlog("⚠ Aucun proxy configuré — Instagram bloque les IPs normales", WARN)
            if not sessionid:
                tlog("⚠ Pas de Session ID — Paramètres → API Keys → Instagram Session ID", WARN)

        import threading
        threading.Thread(target=run, daemon=True).start()

    def _apply_theme(self, theme_name):
        apply_theme_globals(theme_name)
        self.cfg["theme"] = theme_name
        save_config(self.cfg)
        if hasattr(self, '_theme_active_lbl'):
            self._theme_active_lbl.config(text=theme_name, fg=ACCENT)
        messagebox.showinfo("Thème", f"Thème « {theme_name} » appliqué.\nRedémarre l'app pour voir tous les changements.")

    def _browse_wallpaper(self):
        path = filedialog.askopenfilename(
            title="Choisir une image de fond",
            filetypes=[("Images", "*.jpg *.jpeg *.png *.bmp *.webp"), ("Tous", "*.*")])
        if path:
            self.wallpaper_var.set(path)

    def _clear_wallpaper(self):
        self.wallpaper_var.set("")
        self.cfg["wallpaper_path"] = ""
        save_config(self.cfg)
        self._setup_wallpaper()

    def _apply_wallpaper_settings(self):
        self.cfg["wallpaper_path"] = self.wallpaper_var.get().strip()
        self.cfg["wallpaper_blur"] = getattr(self, "wp_blur_var",
                                              tk.IntVar(value=8)).get()
        self.cfg["wallpaper_dim"]  = getattr(self, "wp_dim_var",
                                              tk.IntVar(value=55)).get()
        save_config(self.cfg)
        self._setup_wallpaper()

    def _setup_wallpaper(self):
        if not PIL_OK:
            return
        path = self.cfg.get("wallpaper_path", "")
        if not path or not Path(path).exists():
            self._wallpaper_src = None
            self.bg_canvas.delete("wp")
            self.bg_canvas.configure(bg=BG)
            return
        try:
            self._wallpaper_src = Image.open(path).convert("RGB")
            w = self.root.winfo_width() or 1400
            h = self.root.winfo_height() or 840
            self._redraw_wallpaper(w, h)
        except Exception as ex:
            print(f"Wallpaper: {ex}")

    def _redraw_wallpaper(self, w, h):
        if not PIL_OK or not getattr(self, '_wallpaper_src', None) or w < 10 or h < 10:
            return
        try:
            img = self._wallpaper_src.copy()
            blur_r  = int(self.cfg.get("wallpaper_blur", 8))
            dim_pct = int(self.cfg.get("wallpaper_dim", 55))
            if blur_r > 0:
                img = img.filter(ImageFilter.GaussianBlur(radius=blur_r))
            if dim_pct > 0:
                img = ImageEnhance.Brightness(img).enhance(1.0 - dim_pct / 100)
            img = img.resize((w, h), Image.LANCZOS)
            self._wallpaper_photo = ImageTk.PhotoImage(img)
            self.bg_canvas.delete("wp")
            self.bg_canvas.create_image(0, 0, anchor="nw",
                image=self._wallpaper_photo, tags="wp")
            self.bg_canvas.tag_lower("wp")
        except Exception as ex:
            print(f"Wallpaper redraw: {ex}")

    # ══════════════════════════════════════════════════════════════════════════
    # TABLE TÉLÉPHONES
    # ══════════════════════════════════════════════════════════════════════════
    def _refresh_table(self):
        prev = set(self.tree.selection())
        self.tree.delete(*self.tree.get_children())
        grp   = self.grp_var.get()
        srch  = self.search_var.get().lower().strip()
        filt  = getattr(self, "_phone_stat_filter", "all")
        total = active = banned = views = 0
        row_idx = 0
        for pid, d in sorted(self.data.items(),
                             key=lambda x: int(x[1].get("serial_no", 0) or 0)):
            if not d.get("phone_name"):
                continue
            if grp != "Tous" and d.get("group_name", "") != grp:
                continue
            nm = d.get("phone_name", "").lower()
            ig = (d.get("ig_username") or "").lower()
            if srch and srch not in nm and srch not in ig:
                continue
            st = d.get("ig_status", "")
            # Apply stat card filter
            if filt == "active" and st != "active":
                continue
            if filt == "banned" and st != "banned":
                continue
            total += 1
            if st == "active": active += 1
            if st == "banned": banned += 1
            v = sum(x.get("views", 0) for x in d.get("videos", []))
            views += v
            st_txt = {
                "active":  "✅ Actif",
                "banned":  "❌ Banni",
                "private": "🔒 Privé",
                "error":   "⚠ " + d.get("ig_error", "")[:20],
            }.get(st, "— Sans IG" if not d.get("ig_username") else "○ Non vérifié")
            chk = d.get("last_checked", "")
            if chk:
                try:
                    ago = int((datetime.now() - datetime.fromisoformat(chk)).total_seconds())
                    chk = (f"{ago//3600}h{(ago%3600)//60}m" if ago >= 3600
                           else f"{ago//60}m")
                except:
                    pass
            tag = st if st in ("active", "banned", "error") else "noig"
            stripe = "odd" if row_idx % 2 == 0 else "even"
            row_idx += 1
            self.tree.insert("", "end", iid=pid, tags=(tag, stripe), values=(
                d.get("serial_no", ""),
                d.get("phone_name", pid),
                d.get("group_name", "—"),
                "@" + d["ig_username"] if d.get("ig_username") else "—",
                st_txt,
                fmt(d.get("followers", 0)) if st == "active" else "—",
                fmt(v),
                len(d.get("videos", [])),
                chk or "—",
                "  ⋮",
            ))
            if pid in prev:
                self.tree.selection_add(pid)
        if self.sv:
            self.sv["phones"].config(text=str(total))
            self.sv["active"].config(text=str(active))
            self.sv["banned"].config(text=str(banned))
            self.sv["views"].config(text=fmt(views))

        # Redraw custom visual table
        try:
            self._phones_draw_table()
        except Exception:
            pass

        # Dashboard snapshot + redraw (live)
        try:
            self._views_history_snapshot()
        except Exception:
            pass

    # ══════════════════════════════════════════════════════════════════════════
    # LINK / SCRAPE
    # ══════════════════════════════════════════════════════════════════════════
    def _link(self):
        if not self.sel_ids:
            messagebox.showwarning("Sélection", "Clique sur un téléphone d'abord")
            return
        username = self.link_var.get().strip().lstrip("@")
        if not username:
            messagebox.showwarning("Username", "Entre un @username")
            return
        pid = self.sel_ids[0]
        if pid not in self.data:
            self.data[pid] = {}
        self.data[pid]["ig_username"] = username
        save_data(self.data)
        self.link_var.set("")
        self.log(f"@{username} lié à {self.data[pid].get('phone_name', pid)}", "ok")
        self._refresh_table()
        threading.Thread(target=self._scrape_one, args=(pid,), daemon=True).start()

    def _unlink(self):
        for pid in self.sel_ids:
            if pid in self.data:
                old = self.data[pid].pop("ig_username", None)
                for k in ["ig_status", "followers", "following", "posts_count",
                           "videos", "full_name", "bio", "ig_error", "last_checked"]:
                    self.data[pid].pop(k, None)
                if old:
                    self.log(f"@{old} délié", "warn")
        save_data(self.data)
        self._refresh_table()

    def _scrape_one(self, pid):
        d        = self.data.get(pid, {})
        username = d.get("ig_username", "")

        # Auto-detect username from session ID if not manually linked
        if not username:
            sessionid_acc = d.get("ig_sessionid", "").strip()
            if sessionid_acc:
                self.log("🔍 Détection auto du username depuis la session...", "info")
                detected = get_username_from_session(sessionid_acc)
                if detected:
                    self.data[pid]["ig_username"] = detected
                    username = detected
                    save_data(self.data)
                    self.log(f"✅ Username détecté : @{username}", "ok")
                    self.root.after(0, self._refresh_table)
                else:
                    self.log("⚠ Session invalide — impossible de détecter le username", "warn")
                    return
            else:
                return

        # Priority 1 — per-account sessionid (best: no new login, no challenge)
        sessionid_acc = d.get("ig_sessionid", "").strip()
        # Priority 2 — per-account password (direct login, may challenge on new IP)
        password = d.get("ig_password", "").strip()
        # Priority 3 — global sessionid from Settings
        sessionid_global = self.cfg.get("ig_sessionid", "").strip()
        proxy = self.cfg.get("proxy", "").strip() or None

        if sessionid_acc:
            self.log(f"🍪 Session @{username}...", "info")
            res = scrape_ig_by_session(username, sessionid_acc)
        elif password:
            # instagrapi uses i.instagram.com — bypass SOCKS proxy
            self.log(f"🔑 Login direct @{username}...", "info")
            res = scrape_ig_direct(username, password, proxy=None,
                                   challenge_callback=self._make_challenge_cb())
        else:
            mode = "proxy" if proxy else "sans proxy"
            self.log(f"Scraping @{username} ({mode})...", "info")
            res = scrape_ig(username, proxy, sessionid_global or None)

        self.data[pid].update(res)
        self.data[pid]["last_checked"] = datetime.now().isoformat()
        save_data(self.data)
        st = res.get("ig_status")
        if st == "active":
            self.log(f"✅ @{username} — {fmt(res.get('followers',0))} followers", "ok")
        elif st == "banned":
            self.log(f"❌ @{username} — banni !", "error")
        elif st == "private":
            self.log(f"🔒 @{username} — privé", "warn")
        else:
            self.log(f"⚠ @{username} — {res.get('ig_error','')}", "warn")
        self.root.after(0, self._refresh_table)

    def _scrape_sel(self):
        targets = (self.sel_ids if self.sel_ids
                   else [p for p, d in self.data.items()
                         if d.get("ig_username") and d.get("phone_name")])
        if not targets:
            return
        self.log(f"Scraping {len(targets)} compte(s)...", "accent")
        for pid in targets:
            self._scrape_one(pid)
            time.sleep(2)
        self.log("Terminé ✓", "ok")

    # ══════════════════════════════════════════════════════════════════════════
    # CHALLENGE RESOLUTION
    # ══════════════════════════════════════════════════════════════════════════
    def _make_challenge_cb(self):
        """Return a challenge_callback that blocks the scrape thread until
        the user enters the verification code in a popup dialog."""
        def callback(cl, username):
            code_holder = [None]
            done        = threading.Event()

            def show():
                self._show_challenge_dialog(cl, username, code_holder, done)

            self.root.after(0, show)
            done.wait(timeout=300)   # wait up to 5 minutes
            return code_holder[0]

        return callback

    def _show_challenge_dialog(self, cl, username, code_holder, done):
        win = tk.Toplevel(self.root)
        win.title(f"🔐 Vérification — @{username}")
        win.geometry("440x340")
        win.configure(bg=BG)
        win.grab_set()
        win.protocol("WM_DELETE_WINDOW", lambda: (_cancel()))

        tk.Label(win, text="🔐 Vérification Instagram",
                 font=("Segoe UI", 14, "bold"), bg=BG, fg=TEXT).pack(anchor="w", padx=20, pady=(18, 4))
        tk.Label(win,
                 text=f"Instagram a détecté une connexion depuis un nouvel appareil\n"
                      f"pour @{username}.\n\n"
                      f"Un code de vérification va être envoyé à l'adresse email\n"
                      f"ou au numéro de téléphone lié au compte.",
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2, justify="left").pack(
                     anchor="w", padx=20, pady=(0, 12))

        # Send code buttons
        send_row = tk.Frame(win, bg=BG)
        send_row.pack(fill="x", padx=20, pady=(0, 10))
        status_lbl = tk.Label(win, text="", font=("Segoe UI", 9), bg=BG, fg=OK)
        status_lbl.pack(anchor="w", padx=20)

        def _send(method):
            try:
                cl.challenge_send_security_code(method)
                status_lbl.config(
                    text="✅ Code envoyé — vérifie l'email / SMS du compte",
                    fg=OK)
            except Exception as ex:
                status_lbl.config(text=f"❌ {ex}", fg=DANGER)

        tk.Button(send_row, text="📧 Envoyer par email",
                  font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT,
                  relief="flat", cursor="hand2", padx=10, pady=6,
                  command=lambda: _send("0")).pack(side="left", fill="x", expand=True)
        tk.Button(send_row, text="📱 Envoyer par SMS",
                  font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT,
                  relief="flat", cursor="hand2", padx=10, pady=6,
                  command=lambda: _send("1")).pack(side="left", fill="x", expand=True, padx=(6, 0))

        # Code entry
        tk.Label(win, text="Code reçu :", font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(
            anchor="w", padx=20, pady=(8, 2))
        code_var = tk.StringVar()
        code_entry = tk.Entry(win, textvariable=code_var, font=("Consolas", 16),
                              bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                              relief="flat", bd=0, highlightthickness=1,
                              highlightcolor=ACCENT, highlightbackground=BORDER,
                              justify="center")
        code_entry.pack(fill="x", padx=20, ipady=10, pady=(0, 12))
        code_entry.focus_set()

        def _submit():
            code = code_var.get().strip().replace(" ", "")
            if not code:
                return
            code_holder[0] = code
            win.destroy()
            done.set()

        def _cancel():
            win.destroy()
            done.set()

        code_entry.bind("<Return>", lambda e: _submit())
        btn_row = tk.Frame(win, bg=BG)
        btn_row.pack(fill="x", padx=20)
        tk.Button(btn_row, text="✓ Valider le code",
                  font=("Segoe UI", 11, "bold"), bg=ACCENT, fg="#06080f",
                  relief="flat", cursor="hand2", pady=8,
                  command=_submit).pack(side="left", fill="x", expand=True)
        tk.Button(btn_row, text="Annuler",
                  font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", pady=8,
                  command=_cancel).pack(side="right", padx=(8, 0))

    # ══════════════════════════════════════════════════════════════════════════
    # CREDENTIALS DIALOG
    # ══════════════════════════════════════════════════════════════════════════
    def _show_credentials_dialog(self):
        """Session ID manager — simplified single-action interface."""
        win = tk.Toplevel(self.root)
        win.title("🍪 Session IDs")
        win.geometry("780x620")
        win.configure(bg=BG)
        win.grab_set()

        # ── Header ──────────────────────────────────────────────────────────
        tk.Label(win, text="🍪 Session IDs Instagram",
                 font=("Segoe UI", 14, "bold"), bg=BG, fg=TEXT).pack(anchor="w", padx=20, pady=(18, 4))

        # ── Guide box ───────────────────────────────────────────────────────
        guide = tk.Frame(win, bg=SURFACE, highlightthickness=1, highlightbackground=BORDER)
        guide.pack(fill="x", padx=20, pady=(0, 12))
        guide_text = (
            "📌  Comment récupérer ta Session ID (à faire une seule fois par compte) :\n"
            "\n"
            "  1. Sur le téléphone GéeLark, ouvre Chrome → va sur  www.instagram.com\n"
            "  2. Connecte-toi avec le compte Instagram du téléphone\n"
            "  3. Appuie sur F12 (ou ⋮ → Plus d'outils → Outils développeur)\n"
            "  4. Onglet Application → Cookies → https://www.instagram.com\n"
            "  5. Trouve la ligne  sessionid  → copie la valeur (longue chaîne de chiffres:lettres)\n"
            "\n"
            "  ✅  La session dure plusieurs mois — pas besoin de la renouveler sauf si tu changes le mdp."
        )
        tk.Label(guide, text=guide_text, font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2,
                 justify="left").pack(padx=14, pady=10, anchor="w")

        # ── Main pane: left = account list, right = session input ───────────
        pane = tk.Frame(win, bg=BG)
        pane.pack(fill="both", expand=True, padx=20, pady=(0, 8))

        # Left: phone list
        left = tk.Frame(pane, bg=BG, width=300)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        tk.Label(left, text="Téléphones", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w", pady=(0, 4))

        list_frame = tk.Frame(left, bg=SURFACE2, highlightthickness=1,
                              highlightbackground=BORDER)
        list_frame.pack(fill="both", expand=True)

        lb = tk.Listbox(list_frame, bg=SURFACE2, fg=TEXT, selectbackground=ACCENT,
                        selectforeground="#06080f", font=("Consolas", 10),
                        relief="flat", bd=0, activestyle="none")
        lbsb = ttk.Scrollbar(list_frame, orient="vertical", command=lb.yview)
        lb.configure(yscrollcommand=lbsb.set)
        lbsb.pack(side="right", fill="y")
        lb.pack(fill="both", expand=True, padx=2, pady=2)

        acc_map = {}  # listbox index → pid
        def _lb_label(d):
            if d.get("ig_sessionid"):
                icon = "🟢"
            elif d.get("ig_password"):
                icon = "🔑"
            else:
                icon = "⚪"
            ig  = f"@{d['ig_username']}" if d.get("ig_username") else "— pas lié"
            tel = d.get("phone_name", "")
            return f"{icon}  {ig:<22} {tel}"

        def _rebuild_list():
            lb.delete(0, "end")
            acc_map.clear()
            for pid, d in self.data.items():
                idx = lb.size()
                lb.insert("end", _lb_label(d))
                acc_map[idx] = pid

        _rebuild_list()

        # Right: session input panel
        right = tk.Frame(pane, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(16, 0))

        sel_lbl = tk.Label(right, text="← Sélectionne un téléphone",
                           font=("Segoe UI", 11), bg=BG, fg=MUTED)
        sel_lbl.pack(anchor="w", pady=(0, 12))

        field_frame = tk.Frame(right, bg=BG)
        field_frame.pack(fill="x")

        tk.Label(field_frame, text="🍪 Session ID", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=ACCENT).pack(anchor="w", pady=(0, 4))

        sess_row = tk.Frame(field_frame, bg=BG)
        sess_row.pack(fill="x")
        sess_var = tk.StringVar()
        sess_entry = tk.Entry(sess_row, textvariable=sess_var, show="•",
                              font=("Consolas", 10), bg=SURFACE2, fg=TEXT,
                              insertbackground=TEXT, relief="flat", bd=0,
                              highlightthickness=1, highlightcolor=ACCENT,
                              highlightbackground=BORDER)
        sess_entry.pack(side="left", fill="x", expand=True, ipady=8, padx=(0, 4))
        tk.Button(sess_row, text="👁", font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=8,
                  command=lambda: sess_entry.config(
                      show="" if sess_entry.cget("show") == "•" else "•")).pack(side="right")

        status_lbl = tk.Label(field_frame, text="", font=("Segoe UI", 9),
                              bg=BG, fg=OK)
        status_lbl.pack(anchor="w", pady=(4, 0))

        selected_pid = [None]
        selected_idx = [None]

        def _on_sel(e=None):
            sel = lb.curselection()
            if not sel:
                return
            pid = acc_map.get(sel[0])
            if not pid:
                return
            selected_pid[0] = pid
            selected_idx[0] = sel[0]
            d = self.data[pid]
            ig  = d.get("ig_username", "")
            tel = d.get("phone_name", pid)
            sel_lbl.config(text=f"{tel}  {'— @'+ig if ig else ''}", fg=TEXT)
            sess_var.set(d.get("ig_sessionid", ""))
            if d.get("ig_sessionid"):
                status_lbl.config(text="🟢 Session enregistrée", fg=OK)
            else:
                status_lbl.config(text="⚪ Aucune session", fg=MUTED)

        lb.bind("<<ListboxSelect>>", _on_sel)

        def _save():
            pid = selected_pid[0]
            if not pid:
                return
            d    = self.data[pid]
            sess = sess_var.get().strip()
            if sess:
                d["ig_sessionid"] = sess
                save_data(self.data)
                idx = selected_idx[0]
                lb.delete(idx)
                lb.insert(idx, _lb_label(d))
                lb.selection_set(idx)
                status_lbl.config(text="✅ Sauvegardé", fg=OK)
                self.log(f"Session ID sauvegardée pour {d.get('phone_name', pid)}", "ok")
            else:
                d.pop("ig_sessionid", None)
                save_data(self.data)
                idx = selected_idx[0]
                lb.delete(idx)
                lb.insert(idx, _lb_label(d))
                lb.selection_set(idx)
                status_lbl.config(text="⚪ Session supprimée", fg=MUTED)

        def _save_and_scrape():
            pid = selected_pid[0]
            if not pid:
                return
            _save()
            win.destroy()
            threading.Thread(target=self._scrape_one, args=(pid,), daemon=True).start()

        btn_row = tk.Frame(right, bg=BG)
        btn_row.pack(fill="x", pady=(12, 0))
        tk.Button(btn_row, text="💾 Sauvegarder", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2", pady=8,
                  command=_save).pack(side="left", fill="x", expand=True)
        tk.Button(btn_row, text="▶ Sauvegarder + Tester", font=("Segoe UI", 10),
                  bg=OK, fg="#06080f", relief="flat", cursor="hand2", pady=8,
                  command=_save_and_scrape).pack(side="left", fill="x", expand=True, padx=(6, 0))

        # ── Bulk import ──────────────────────────────────────────────────────
        sep = tk.Frame(win, bg=BORDER, height=1)
        sep.pack(fill="x", padx=20, pady=(0, 8))

        bulk_hdr = tk.Frame(win, bg=BG)
        bulk_hdr.pack(fill="x", padx=20)
        tk.Label(bulk_hdr, text="Import en masse  (format: username::sessionid — une par ligne)",
                 font=("Segoe UI", 9), bg=BG, fg=TEXT2).pack(side="left")

        bulk_txt = tk.Text(win, font=("Consolas", 9), bg=SURFACE2, fg=TEXT,
                           insertbackground=TEXT, relief="flat", bd=0,
                           highlightthickness=1, highlightcolor=ACCENT,
                           highlightbackground=BORDER, height=5)
        bulk_txt.pack(fill="x", padx=20, pady=(4, 0))

        bulk_status = tk.Label(win, text="", font=("Segoe UI", 9), bg=BG, fg=OK, anchor="w")
        bulk_status.pack(anchor="w", padx=20)

        def _import_bulk():
            lines = bulk_txt.get("1.0", "end").strip().splitlines()
            matched = 0
            new_pids = []
            for line in lines:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "::" in line:
                    user, sid = line.split("::", 1)
                    user = user.strip().lstrip("@").lower()
                    sid  = sid.strip()
                    if not user or not sid:
                        continue
                    for pid, d in self.data.items():
                        if d.get("ig_username", "").lower() == user:
                            d["ig_sessionid"] = sid
                            matched += 1
                            new_pids.append(pid)
                            break
            save_data(self.data)
            _rebuild_list()
            bulk_status.config(text=f"✅ {matched} compte(s) mis à jour")
            self.log(f"{matched} sessions importées", "ok")
            return new_pids

        def _import_and_scrape():
            pids = _import_bulk()
            win.destroy()
            def _run():
                for pid in pids:
                    self._scrape_one(pid)
                    time.sleep(2)
            threading.Thread(target=_run, daemon=True).start()

        bulk_btns = tk.Frame(win, bg=BG)
        bulk_btns.pack(fill="x", padx=20, pady=(4, 16))
        tk.Button(bulk_btns, text="💾 Importer", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2", pady=6,
                  command=_import_bulk).pack(side="left")
        tk.Button(bulk_btns, text="▶ Importer + Scraper", font=("Segoe UI", 10),
                  bg=OK, fg="#06080f", relief="flat", cursor="hand2", pady=6,
                  command=_import_and_scrape).pack(side="left", padx=(6, 0))

    # ══════════════════════════════════════════════════════════════════════════
    # PUSH SERVER
    # ══════════════════════════════════════════════════════════════════════════
    def _get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def _start_push_server(self):
        port = int(self.cfg.get("push_port", 8765))
        try:
            _PushHandler.app_ref = self
            srv = socketserver.TCPServer(("", port), _PushHandler)
            srv.allow_reuse_address = True
            self._push_server = srv
            threading.Thread(target=srv.serve_forever, daemon=True).start()
            ip = self._get_local_ip()
            url = f"http://{ip}:{port}/push?u=USERNAME&f=FOLLOWERS&fw=FOLLOWING&p=POSTS"
            self._push_url_var.set(url)
            self._push_status_var.set(f"✅ Serveur actif sur :{port}")
            self._push_btn.config(text="⏹ Arrêter", bg="#b83232",
                                  command=self._stop_push_server)
            self.log(f"Push serveur démarré — http://{ip}:{port}/push", "ok")
        except OSError as ex:
            self._push_status_var.set(f"❌ Erreur: {ex}")
            self.log(f"Push serveur: {ex}", "error")

    def _stop_push_server(self):
        srv = getattr(self, "_push_server", None)
        if srv:
            srv.shutdown()
            self._push_server = None
        self._push_url_var.set("")
        self._push_status_var.set("⏹ Serveur arrêté")
        self._push_btn.config(text="▶ Démarrer", bg=ACCENT,
                              command=self._start_push_server)
        self.log("Push serveur arrêté", "warn")

    def _on_push_update(self, username, stats):
        username = username.lstrip("@").lower()
        for pid, d in self.data.items():
            if d.get("ig_username", "").lower() == username:
                d["ig_status"]    = "active"
                d["last_checked"] = datetime.now().isoformat()
                for k, v in stats.items():
                    if v is not None and v != "":
                        d[k] = v
                save_data(self.data)
                self._refresh_table()
                self.log(
                    f"📲 Push reçu: @{username} — "
                    f"{fmt(d.get('followers', 0))} followers", "ok")
                return
        self.log(f"⚠ Push @{username} ignoré — compte non trouvé dans la liste", "warn")

    # ══════════════════════════════════════════════════════════════════════════
    # GÉELARK + SCHEDULER
    # ══════════════════════════════════════════════════════════════════════════
    def _load_phones(self):
        self.root.after(0, lambda: self.refresh_btn.config(
            state="disabled", text="Chargement..."))
        bearer = self.cfg.get("bearer_token", "")
        if not bearer:
            self.root.after(0, lambda: self.log(
                "Bearer Token manquant — va dans Paramètres", "warn"))
            self.root.after(0, lambda: self.refresh_btn.config(
                state="normal", text="↺  Refresh"))
            return
        phones = fetch_phones(bearer)
        if phones:
            groups = set()
            for p in phones:
                pid = str(p.get("id", ""))
                if pid not in self.data:
                    self.data[pid] = {}
                grp = (p.get("group", {}).get("name", "—") if p.get("group") else "—")
                groups.add(grp)
                self.data[pid].update({
                    "phone_id":   pid,
                    "phone_name": p.get("serialName", pid),
                    "serial_no":  p.get("serialNo", ""),
                    "group_name": grp,
                    "gl_status":  p.get("status", 0),
                })
            save_data(self.data)
            all_groups = ["Tous"] + sorted(groups)
            self.root.after(0, lambda: self.grp_combo.config(values=all_groups))
            self.root.after(0, self._refresh_table)
            self.root.after(0, lambda: self.log(
                f"{len(phones)} téléphones chargés ✓", "ok"))
        else:
            self.root.after(0, lambda: self.log(
                "Aucun téléphone — vérifie le Bearer Token dans Paramètres", "warn"))
        now = datetime.now().strftime("%H:%M:%S")
        self.root.after(0, lambda: self.status_lbl.config(text=f"Màj {now}"))
        self.root.after(0, lambda: self.refresh_btn.config(
            state="normal", text="↺  Refresh"))

    def _manual_refresh(self):
        def full():
            self._load_phones()
            self._scrape_sel()
        threading.Thread(target=full, daemon=True).start()

    def _scheduler(self):
        """Background thread: scrape all accounts at the configured interval."""
        while self.running:
            interval = self._auto_interval
            if interval <= 0:
                time.sleep(10)
                continue
            self._next_refresh = time.time() + interval
            # sleep in small chunks so we can react to interval changes
            while self.running and time.time() < self._next_refresh:
                time.sleep(1)
            if self.running and interval > 0:
                self._scrape_sel()

    def _tick_countdown(self):
        """Update the countdown label in the toolbar every second."""
        if not self.running:
            return
        interval = self._auto_interval
        if interval <= 0 or self._next_refresh == 0:
            self._countdown_var.set("↻ Auto: OFF")
        else:
            remaining = max(0, int(self._next_refresh - time.time()))
            m, s = divmod(remaining, 60)
            self._countdown_var.set(f"↻ {m:02d}:{s:02d}")
        self.root.after(1000, self._tick_countdown)

    def _set_auto_interval(self, minutes: int):
        self._auto_interval        = minutes * 60
        self.cfg["auto_refresh_min"] = minutes
        save_config(self.cfg)
        if minutes > 0:
            self._next_refresh = time.time() + self._auto_interval
            self.log(f"Rafraîchissement auto toutes les {minutes} min", "ok")
        else:
            self._next_refresh = 0
            self.log("Rafraîchissement auto désactivé", "warn")


if __name__ == "__main__":
    LoginWindow()
