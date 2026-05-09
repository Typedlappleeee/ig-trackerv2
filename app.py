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
    "Lime":    {"accent": "#c8f135", "accent2": "#9bbf1a", "ok": "#00d4aa"},
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
ACCENT   = "#c8f135"
ACCENT2  = "#9bbf1a"
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
        apply_theme_globals(self.cfg.get("theme", "Lime"))

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
        tk.Label(title_row, text=icon, font=("Segoe UI", 20),
                 bg=BG, fg=col).pack(side="left", padx=(0, 10))
        text_col = tk.Frame(title_row, bg=BG)
        text_col.pack(side="left", fill="x", expand=True)
        tk.Label(text_col, text=title, font=("Segoe UI", 15, "bold"),
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

        SIDEBAR_W = 210
        PAD = 0

        self.sidebar = tk.Frame(self.bg_canvas, bg=SURFACE, width=SIDEBAR_W)
        self.sidebar.pack_propagate(False)
        self._sidebar_win = self.bg_canvas.create_window(
            0, 0, anchor="nw", window=self.sidebar, width=SIDEBAR_W)

        # Thin separator line between sidebar and content
        self._sep_win = self.bg_canvas.create_line(
            SIDEBAR_W, 0, SIDEBAR_W, 800, fill=BORDER, width=1)

        self.main_frame = tk.Frame(self.bg_canvas, bg=BG)
        self._main_win = self.bg_canvas.create_window(
            SIDEBAR_W + 1, 0, anchor="nw", window=self.main_frame)

        def _on_canvas_resize(e):
            w, h = e.width, e.height
            self.bg_canvas.itemconfig(self._sidebar_win, height=h)
            self.bg_canvas.coords(self._sep_win, SIDEBAR_W, 0, SIDEBAR_W, h)
            self.bg_canvas.itemconfig(self._main_win, width=max(0, w - SIDEBAR_W - 1), height=h)

        self.bg_canvas.bind("<Configure>", _on_canvas_resize)

        # ── Sidebar: logo ──────────────────────────────────────────────────────
        logo_frame = tk.Frame(self.sidebar, bg=SURFACE)
        logo_frame.pack(fill="x", padx=0, pady=(0, 0))

        # Accent bar at top of sidebar
        tk.Frame(logo_frame, height=3, bg=ACCENT).pack(fill="x")

        inner_logo = tk.Frame(logo_frame, bg=SURFACE)
        inner_logo.pack(fill="x", padx=14, pady=(12, 10))

        # Logo image
        _logo_img_ref = [None]
        if PIL_OK:
            try:
                _logo_path = BASE_DIR / "logo.png"
                if _logo_path.exists():
                    _pil = Image.open(str(_logo_path)).resize((36, 36), Image.LANCZOS)
                    _logo_img_ref[0] = ImageTk.PhotoImage(_pil)
            except Exception:
                pass

        title_row = tk.Frame(inner_logo, bg=SURFACE)
        title_row.pack(anchor="w")
        if _logo_img_ref[0]:
            lbl_img = tk.Label(title_row, image=_logo_img_ref[0], bg=SURFACE)
            lbl_img.image = _logo_img_ref[0]
            lbl_img.pack(side="left", padx=(0, 8))
        tk.Label(title_row, text="IG Tracker",
                 font=("Segoe UI", 13, "bold"), bg=SURFACE, fg=TEXT).pack(side="left")
        email_short = (self.email[:22] + "…") if len(self.email) > 24 else self.email
        tk.Label(inner_logo, text=email_short, font=("Segoe UI", 8),
                 bg=SURFACE, fg=TEXT2).pack(anchor="w", pady=(3, 0))

        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=(0, 4))

        # ── Sidebar: nav ───────────────────────────────────────────────────────
        self.tab_btns = {}
        self._sidebar_indicators = {}

        def _reg(key, icon, label, parent=self.sidebar, indent=False, badge=None, badge_col=None):
            row, btn, ind = self._make_sidebar_item(parent, icon, label, key,
                                                     indent=indent, badge=badge,
                                                     badge_col=badge_col)
            row.pack(fill="x")
            self.tab_btns[key] = btn
            self._sidebar_indicators[key] = ind

        def _coming_soon(parent, icon, label):
            """Prominent 'coming soon' row."""
            outer = tk.Frame(parent, bg=SURFACE2,
                             highlightthickness=1, highlightbackground=BORDER)
            outer.pack(fill="x", padx=0, pady=1)
            tk.Frame(outer, width=3, bg=MUTED).pack(side="left", fill="y")
            inner = tk.Frame(outer, bg=SURFACE2)
            inner.pack(side="left", fill="x", expand=True, padx=10, pady=8)
            tk.Label(inner, text=f"{icon}  {label}", font=("Segoe UI", 10, "bold"),
                     bg=SURFACE2, fg=TEXT2).pack(side="left")
            badge = tk.Frame(inner, bg=SURFACE2)
            badge.pack(side="right")
            tk.Label(badge, text=t("soon.label", self.cfg.get("lang","fr")),
                     font=("Segoe UI", 8, "bold"),
                     bg=WARN, fg="#07080d", padx=7, pady=2).pack()

        # Use translation function
        L = self.cfg.get("lang", "fr")
        _ = lambda k: t(k, L)

        # Standalone
        _reg("dashboard", "📈", _("tab.dashboard"))
        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=2)
        _reg("phones", "📱", _("tab.phones"))
        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=2)

        # INSTA BETA group
        grp_outer, grp_children = self._make_sidebar_group(
            self.sidebar, "✦", _("tab.insta"), badge="BETA", col=OK)
        grp_outer.pack(fill="x")
        self._insta_group_children = grp_children

        _reg("stats",       "📊", _("tab.stats"),       grp_children, indent=True)
        _reg("posting",     "🚀", _("tab.posting"),     grp_children, indent=True)
        _reg("masspost",    "⚡", _("tab.masspost"),    grp_children, indent=True,
             badge="BETA", badge_col=WARN)
        _reg("bank",        "🗂", _("tab.bank"),        grp_children, indent=True)
        _reg("autocomment", "🤖", _("tab.autocomment"), grp_children, indent=True)
        _reg("tools",       "🔧", _("tab.tools"),       grp_children, indent=True)

        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=2)

        # Montage group
        mont_outer, mont_children = self._make_sidebar_group(
            self.sidebar, "🎬", _("tab.montage"), col=WARN)
        mont_outer.pack(fill="x")
        _reg("automation", "✂", _("tab.automation"), mont_children, indent=True)

        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=2)
        _reg("settings", "⚙", _("tab.settings"))

        # ── Sidebar: bottom (spacer + coming soon + refresh) ───────────────────
        tk.Frame(self.sidebar, bg=SURFACE).pack(fill="both", expand=True)

        # Coming soon platforms pinned to bottom
        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x")
        _coming_soon(self.sidebar, "𝕏", "Twitter")
        _coming_soon(self.sidebar, "🧵", "Threads")
        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x")

        # Refresh button
        ref_frame = tk.Frame(self.sidebar, bg=SURFACE, padx=14, pady=6)
        ref_frame.pack(fill="x")
        self.refresh_btn = tk.Button(ref_frame, text=_("common.refresh"),
            font=("Segoe UI", 10, "bold"), bg=ACCENT, fg="#07080d",
            relief="flat", cursor="hand2", activebackground=ACCENT2,
            pady=9, bd=0, command=self._manual_refresh)
        self.refresh_btn.pack(fill="x")
        self._bind_hover(self.refresh_btn, ACCENT, ACCENT2, "#07080d", "#07080d")

        self.status_lbl = tk.Label(self.sidebar, text="—",
            font=("Consolas", 8), bg=SURFACE, fg=MUTED)
        self.status_lbl.pack(padx=16, pady=(2, 14))

        # ── Main: stat cards ───────────────────────────────────────────────────
        sf = tk.Frame(self.main_frame, bg=BG)
        sf.pack(fill="x", padx=18, pady=(18, 10))
        self._top_stat_cards = sf

        self.sv = {}
        card_data = [
            ("phones", "📱", _("card.phones"), ACCENT, "all"),
            ("active", "✅", _("card.active"), OK,     "active"),
            ("banned", "🚫", _("card.banned"), DANGER, "banned"),
            ("views",  "👁", _("card.views"),  WARN,   "views"),
        ]
        for k, ico, lbl, col, filt in card_data:
            card_outer, card = self._round_card(sf, radius=14, bg=CARD,
                                                 border=BORDER, border_w=1,
                                                 hover_border=col)
            card_outer.pack(side="left", fill="both", expand=True, padx=(0, 10), ipady=0)
            card_outer.configure(height=110)
            # Force min height for consistent display
            card_outer.pack_propagate(False)

            top_bar = tk.Frame(card, height=3, bg=col)
            top_bar.pack(fill="x")

            inner = tk.Frame(card, bg=CARD, padx=16, pady=12, cursor="hand2")
            inner.pack(fill="both", expand=True)

            row_top = tk.Frame(inner, bg=CARD, cursor="hand2")
            row_top.pack(fill="x")
            tk.Label(row_top, text=ico, font=("Segoe UI", 14), bg=CARD, fg=col,
                     cursor="hand2").pack(side="left")
            tk.Label(row_top, text=lbl, font=("Segoe UI", 8, "bold"),
                     bg=CARD, fg=TEXT2, cursor="hand2").pack(side="left", padx=(6, 0), pady=2)

            v = tk.Label(inner, text="—", font=("Segoe UI", 26, "bold"), bg=CARD, fg=col,
                         cursor="hand2")
            v.pack(anchor="w", pady=(4, 0))
            hint = tk.Label(inner, text=_("card.click_filter"), font=("Segoe UI", 7),
                            bg=CARD, fg=MUTED, cursor="hand2")
            hint.pack(anchor="w")
            self.sv[k] = v

            def _card_click(e, f2=filt):
                self._phone_stat_filter = f2
                self._show_tab("phones")
                self._refresh_table()

            for w in [card, inner, row_top, v, hint, top_bar, card_outer._cv]:
                try:
                    w.bind("<Button-1>", _card_click, add="+")
                except Exception:
                    pass

        # Global mousewheel routing
        self.root.bind_all("<MouseWheel>", self._on_global_scroll, add="+")

        self.tab_container = tk.Frame(self.main_frame, bg=BG)
        self.tab_container.pack(fill="both", expand=True, padx=18, pady=(0, 18))

        self.tabs = {}
        self._build_dashboard_tab()
        self._build_phones_tab()
        self._build_stats_tab()
        self._build_automation_tab()
        self._build_posting_tab()
        self._build_masspost_tab()
        self._build_bank_tab()
        self._build_autocomment_tab()
        self._build_tools_tab()
        self._build_settings_tab()

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

    def _make_sidebar_item(self, parent, icon, label, key, indent=False, badge=None, badge_col=None):
        """Returns (outer_row, button, indicator_frame). Optional badge ('BETA', 'NEW'...)."""
        outer = tk.Frame(parent, bg=SURFACE)
        indicator = tk.Frame(outer, width=3, bg=SURFACE)
        indicator.pack(side="left", fill="y")
        pad = 22 if indent else 12

        # Badge packed BEFORE the expanding button so it claims its space first
        if badge:
            bcol = badge_col or WARN
            blbl = tk.Label(outer, text=f" {badge} ", font=("Segoe UI", 7, "bold"),
                            bg=bcol, fg="#07080d", padx=2, pady=1,
                            cursor="hand2")
            blbl.pack(side="right", padx=(0, 10))
            blbl.bind("<Button-1>", lambda e, x=key: self._show_tab(x))

        btn = tk.Button(outer,
                        text=f"  {icon}  {label}",
                        font=("Segoe UI", 10), bg=SURFACE, fg=TEXT2,
                        relief="flat", anchor="w", padx=pad, pady=9,
                        cursor="hand2", activebackground=SURFACE3,
                        bd=0, command=lambda x=key: self._show_tab(x))
        btn.pack(side="left", fill="x", expand=True)

        def _in(e):
            if getattr(self, "_active_tab", "") != key:
                btn.config(bg=SURFACE3, fg=TEXT)
        def _out(e):
            if getattr(self, "_active_tab", "") != key:
                btn.config(bg=SURFACE, fg=TEXT2)

        btn.bind("<Enter>", _in); btn.bind("<Leave>", _out)
        outer.bind("<Enter>", _in); outer.bind("<Leave>", _out)
        return outer, btn, indicator

    def _make_sidebar_group(self, parent, icon, label, badge=None, col=None):
        """Collapsible group header. Returns (outer, children_frame)."""
        accent = col or ACCENT
        outer = tk.Frame(parent, bg=SURFACE)
        _open = [True]

        hdr = tk.Frame(outer, bg=SURFACE3, cursor="hand2")
        hdr.pack(fill="x")
        tk.Frame(hdr, width=3, bg=accent).pack(side="left", fill="y")

        inner_h = tk.Frame(hdr, bg=SURFACE3)
        inner_h.pack(side="left", fill="x", expand=True, padx=10, pady=8)
        tk.Label(inner_h, text=f"{icon}  {label}", font=("Segoe UI", 9, "bold"),
                 bg=SURFACE3, fg=TEXT).pack(side="left")
        if badge:
            badge_lbl = tk.Label(inner_h, text=badge, font=("Segoe UI", 7, "bold"),
                                 bg=accent, fg="#07080d", padx=5, pady=1)
            badge_lbl.pack(side="left", padx=(7, 0))

        arrow = tk.Label(hdr, text="▾", font=("Segoe UI", 11),
                         bg=SURFACE3, fg=TEXT2)
        arrow.pack(side="right", padx=10)

        children = tk.Frame(outer, bg=SURFACE)
        children.pack(fill="x")

        def _toggle(e=None):
            _open[0] = not _open[0]
            if _open[0]:
                children.pack(fill="x")
                arrow.config(text="▾")
            else:
                children.pack_forget()
                arrow.config(text="▸")

        for w in [hdr, inner_h, arrow] + inner_h.winfo_children():
            w.bind("<Button-1>", _toggle)

        return outer, children

    def _show_tab(self, key):
        self._active_tab = key
        # Auto-expand INSTA group if needed
        _insta_keys = {"stats", "posting", "masspost", "bank", "autocomment", "tools"}
        if key in _insta_keys and hasattr(self, "_insta_group_children"):
            children = self._insta_group_children
            if not children.winfo_ismapped():
                children.pack(fill="x")

        # Show top stat cards only on data-heavy tabs (hide via children, not pack/forget)
        if hasattr(self, "_top_stat_cards"):
            keep = {"dashboard", "phones", "stats", "posting"}
            visible = key in keep
            for child in self._top_stat_cards.winfo_children():
                if visible:
                    if not child.winfo_ismapped():
                        try:
                            child.pack(side="left", fill="both", expand=True,
                                        padx=(0, 10))
                        except Exception:
                            pass
                else:
                    child.pack_forget()

        for k, ind in self._sidebar_indicators.items():
            active = k == key
            btn = self.tab_btns[k]
            if active:
                ind.config(bg=ACCENT)
                btn.config(bg=SURFACE3, fg=TEXT, font=("Segoe UI", 10, "bold"))
            else:
                ind.config(bg=SURFACE)
                btn.config(bg=SURFACE, fg=TEXT2, font=("Segoe UI", 10))

        for k, frame in self.tabs.items():
            if k == key:
                frame.place(x=0, y=0, relwidth=1, relheight=1)
                frame.lift()
            else:
                frame.place_forget()

        if key == "stats":    self._refresh_ig_list()
        if key == "bank":     self._refresh_bank()
        if key == "automation": self._refresh_auto_phones()
        if key == "masspost": self._mp_refresh_phones()
        if key == "dashboard": self._dash_redraw_chart()

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
        """Snapshot total views (sum across all phones / all videos) for today."""
        try:
            total = 0
            for d in self.data.values():
                for v in d.get("videos", []) or []:
                    total += int(v.get("views") or 0)
            today = datetime.now().strftime("%Y-%m-%d")
            hist = self._views_history_load()
            hist[today] = total
            # Keep last 365 days
            keys = sorted(hist.keys())[-365:]
            hist = {k: hist[k] for k in keys}
            self._views_history_path().write_text(
                json.dumps(hist, indent=2), encoding="utf-8")
            self._dash_redraw_chart()
        except Exception:
            pass

    def _build_dashboard_tab(self):
        L = self.cfg.get("lang", "fr")
        _ = lambda k: t(k, L)

        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["dashboard"] = f

        self._tab_header(f, "📈", _("dash.title"), _("dash.subtitle"), ACCENT)

        # Range selector
        ctrl = tk.Frame(f, bg=BG)
        ctrl.pack(fill="x", padx=20, pady=(4, 8))

        self._dash_range = tk.StringVar(value="7d")
        self._dash_range_btns = {}
        for code, lbl in [("24h", _("dash.range.24h")),
                          ("7d",  _("dash.range.7d")),
                          ("30d", _("dash.range.30d")),
                          ("all", _("dash.range.all"))]:
            b = tk.Button(ctrl, text=lbl, font=("Segoe UI", 9),
                          bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                          padx=14, pady=6, bd=0,
                          command=lambda c=code: self._dash_set_range(c))
            b.pack(side="left", padx=(0, 6))
            self._dash_range_btns[code] = b

        # KPI row
        kpi_row = tk.Frame(f, bg=BG)
        kpi_row.pack(fill="x", padx=20, pady=(0, 10))
        self._dash_kpis = {}
        for k, lbl, col in [
            ("today", _("dash.kpi.today"), ACCENT),
            ("delta", _("dash.kpi.delta"), OK),
            ("peak",  _("dash.kpi.peak"),  WARN),
            ("avg",   _("dash.kpi.avg"),   TEXT2),
        ]:
            kc_outer, ki = self._round_card(kpi_row, radius=12, bg=CARD,
                                             border=BORDER, border_w=1)
            kc_outer.pack(side="left", fill="both", expand=True, padx=(0, 8))
            kc_outer.configure(height=82)
            kc_outer.pack_propagate(False)
            tk.Frame(ki, height=2, bg=col).pack(fill="x")
            kp = tk.Frame(ki, bg=CARD, padx=14, pady=10)
            kp.pack(fill="both", expand=True)
            tk.Label(kp, text=lbl, font=("Segoe UI", 7, "bold"),
                     bg=CARD, fg=TEXT2).pack(anchor="w")
            v = tk.Label(kp, text="—", font=("Segoe UI", 22, "bold"),
                         bg=CARD, fg=col)
            v.pack(anchor="w", pady=(2, 0))
            self._dash_kpis[k] = v

        # Chart card
        chart_outer, chart_inner = self._round_card(f, radius=14, bg=CARD,
                                                     border=BORDER, border_w=1)
        chart_outer.pack(fill="both", expand=True, padx=20, pady=(0, 18))
        tk.Frame(chart_inner, height=2, bg=ACCENT).pack(fill="x")

        chart_top = tk.Frame(chart_inner, bg=CARD, padx=18, pady=(12, 6))
        chart_top.pack(fill="x")
        tk.Label(chart_top, text=("📊  COURBE DES VUES"
                                  if L == "fr" else "📊  VIEWS CURVE"),
                 font=("Consolas", 9, "bold"), bg=CARD, fg=TEXT2).pack(side="left")
        self._dash_status = tk.Label(chart_top, text="", font=("Segoe UI", 8),
                                       bg=CARD, fg=MUTED)
        self._dash_status.pack(side="right")

        self._dash_chart = tk.Canvas(chart_inner, bg=CARD,
                                      highlightthickness=0)
        self._dash_chart.pack(fill="both", expand=True, padx=18, pady=(0, 18))
        self._dash_chart.bind("<Configure>", lambda e: self._dash_redraw_chart())

        self._dash_set_range("7d")

    def _dash_set_range(self, code):
        self._dash_range.set(code)
        for c, b in self._dash_range_btns.items():
            if c == code:
                b.config(bg=ACCENT, fg="#06080f", font=("Segoe UI", 9, "bold"))
            else:
                b.config(bg=SURFACE2, fg=TEXT2, font=("Segoe UI", 9))
        self._dash_redraw_chart()

    def _dash_redraw_chart(self):
        cv = getattr(self, "_dash_chart", None)
        if not cv or not cv.winfo_exists():
            return
        L = self.cfg.get("lang", "fr")
        hist = self._views_history_load()

        # Always include today (live)
        try:
            today_total = sum(
                int(v.get("views") or 0)
                for d in self.data.values()
                for v in (d.get("videos") or []))
            today = datetime.now().strftime("%Y-%m-%d")
            hist = dict(hist)
            hist[today] = today_total
        except Exception:
            pass

        if not hist:
            cv.delete("all")
            w = cv.winfo_width() or 600
            h = cv.winfo_height() or 240
            cv.create_text(w//2, h//2, text=t("dash.empty", L),
                           fill=MUTED, font=("Segoe UI", 11))
            for k, lbl in self._dash_kpis.items():
                lbl.config(text="—")
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

        # KPIs
        today_v = values[-1] if values else 0
        prev_v  = values[-2] if len(values) > 1 else today_v
        delta   = today_v - prev_v
        peak    = max(values) if values else 0
        avg     = sum(values) // max(1, len(values))
        self._dash_kpis["today"].config(text=fmt(today_v))
        sign = "+" if delta >= 0 else ""
        self._dash_kpis["delta"].config(
            text=f"{sign}{fmt(delta)}",
            fg=OK if delta >= 0 else DANGER)
        self._dash_kpis["peak"].config(text=fmt(peak))
        self._dash_kpis["avg"].config(text=fmt(avg))

        # Status
        if self._dash_status:
            self._dash_status.config(
                text=f"{len(keys)} jour(s) · maj " + datetime.now().strftime("%H:%M:%S")
                if L == "fr" else
                f"{len(keys)} day(s) · updated " + datetime.now().strftime("%H:%M:%S"))

        # Draw chart
        cv.delete("all")
        w = cv.winfo_width() or 600
        h = cv.winfo_height() or 260
        margin_l, margin_r = 56, 24
        margin_t, margin_b = 18, 36

        plot_w = w - margin_l - margin_r
        plot_h = h - margin_t - margin_b
        if plot_w < 10 or plot_h < 10:
            return

        max_v = max(values) if values else 1
        min_v = 0
        rng_v = max(1, max_v - min_v)

        # Y-axis grid + labels
        for i in range(5):
            y = margin_t + i * plot_h / 4
            cv.create_line(margin_l, y, w - margin_r, y,
                            fill=BORDER, dash=(2, 4))
            v_at = max_v - (i * rng_v / 4)
            cv.create_text(margin_l - 6, y, anchor="e",
                            text=fmt(int(v_at)),
                            fill=TEXT2, font=("Consolas", 8))

        # X labels
        n = len(keys)
        if n == 1:
            xs = [margin_l + plot_w / 2]
        else:
            xs = [margin_l + i * plot_w / (n - 1) for i in range(n)]
        # Show only ~6 evenly-spaced date labels
        step = max(1, n // 6)
        for i, k in enumerate(keys):
            if i % step != 0 and i != n - 1:
                continue
            try:
                d = datetime.strptime(k, "%Y-%m-%d")
                lbl = d.strftime("%d/%m")
            except Exception:
                lbl = k
            cv.create_text(xs[i], h - margin_b + 14, anchor="n",
                            text=lbl, fill=TEXT2, font=("Consolas", 8))

        # Build line points
        pts = []
        for i, v in enumerate(values):
            x = xs[i]
            y = margin_t + plot_h - (v - min_v) / rng_v * plot_h
            pts.append((x, y))

        # Filled area below line
        if len(pts) >= 2:
            poly = []
            poly.append(pts[0][0])
            poly.append(margin_t + plot_h)
            for px, py in pts:
                poly.append(px)
                poly.append(py)
            poly.append(pts[-1][0])
            poly.append(margin_t + plot_h)
            cv.create_polygon(*poly, fill="#c8f13522", outline="")

        # Line
        if len(pts) >= 2:
            flat = []
            for px, py in pts:
                flat += [px, py]
            cv.create_line(*flat, fill=ACCENT, width=2, smooth=True)

        # Dots
        for i, (px, py) in enumerate(pts):
            r = 4 if i == len(pts) - 1 else 3
            col = ACCENT if i < len(pts) - 1 else "#ffffff"
            cv.create_oval(px - r, py - r, px + r, py + r,
                            fill=col, outline=ACCENT, width=2)
            # Value label on last point
            if i == len(pts) - 1:
                cv.create_text(px, py - 14, text=fmt(values[i]),
                                fill=TEXT, font=("Segoe UI", 9, "bold"))

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

        # ── Treeview with ⋮ actions column ────────────────────────────────────
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

        self.tree.bind("<<TreeviewSelect>>", self._on_sel)
        self.tree.bind("<Double-1>",         self._on_dbl)
        self.tree.bind("<Button-3>",         self._phone_context_menu)
        self.tree.bind("<ButtonRelease-1>",  self._phone_dot_click)

        vsb = ttk.Scrollbar(f, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

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
        self._mk_btn(vtop, "+ Ajouter vidéos", "primary", self._add_videos,
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
    # ONGLET POSTING PERMANENT
    # ══════════════════════════════════════════════════════════════════════════
    def _build_posting_tab(self):
        import random as _random
        L = self.cfg.get("lang", "fr")
        _ = lambda k: t(k, L)
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["posting"] = f

        self._tab_header(f, "🚀", _("post.title"), _("post.subtitle"), ACCENT)

        main = tk.Frame(f, bg=BG)
        main.pack(fill="both", expand=True, padx=20, pady=0)

        # ── LEFT: video picker + phone selector ──────────────────────────────
        left = tk.Frame(main, bg=BG, width=320)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # Video selection from bank
        vid_hdr = tk.Frame(left, bg=BG)
        vid_hdr.pack(fill="x")
        tk.Label(vid_hdr, text=_("post.video"), font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        tk.Button(vid_hdr, text="↺", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: self._post_refresh_bank()).pack(side="right")

        self.post_vid_path = [None]
        self._post_bank_entries = []

        # Thumbnail banner (shows preview of selected video)
        self._post_preview_canvas = tk.Canvas(left, bg="#000",
                                               highlightthickness=1,
                                               highlightbackground=BORDER,
                                               height=130)
        self._post_preview_canvas.pack(fill="x", pady=(4, 0))
        self._post_preview_img_ref = None

        def _draw_post_preview(text="Aucune vidéo sélectionnée"):
            cv = self._post_preview_canvas
            cv.delete("all")
            w = cv.winfo_width() or 280
            h = 130
            # Gradient background
            for k in range(20):
                tt = k / 19
                rr = int(0x0c*(1-tt) + 0x18*tt)
                gg = int(0x0e*(1-tt) + 0x1b*tt)
                bb = int(0x17*(1-tt) + 0x28*tt)
                cv.create_rectangle(0, k*h/20, w, (k+1)*h/20,
                                     fill=f"#{rr:02x}{gg:02x}{bb:02x}", outline="")
            cv.create_text(w//2, h//2, text=text, fill=MUTED,
                            font=("Segoe UI", 9))
        self._post_preview_canvas.bind("<Configure>",
            lambda e: _draw_post_preview() if not self.post_vid_path[0]
                      else self._post_load_preview(self.post_vid_path[0]))
        self._post_draw_preview = _draw_post_preview

        _bank_outer, bank_frame = self._round_card(left, radius=10, bg=SURFACE,
                                                    border=BORDER)
        _bank_outer.pack(fill="x", pady=(6, 0))
        _bank_outer.configure(height=140)
        _bank_outer.pack_propagate(False)

        self.post_bank_lb = tk.Listbox(bank_frame, bg=SURFACE, fg=TEXT,
                                       font=("Segoe UI", 9), relief="flat",
                                       selectbackground=ACCENT, selectforeground="#06080f",
                                       activestyle="none", cursor="hand2")
        sb_bk = ttk.Scrollbar(bank_frame, orient="vertical",
                               command=self.post_bank_lb.yview)
        self.post_bank_lb.configure(yscrollcommand=sb_bk.set)
        sb_bk.pack(side="right", fill="y")
        self.post_bank_lb.pack(side="left", fill="both", expand=True)

        self.post_vid_lbl = tk.Label(left, text="Aucune vidéo sélectionnée",
                                     font=("Segoe UI", 8), bg=BG, fg=MUTED,
                                     anchor="w", wraplength=300)
        self.post_vid_lbl.pack(fill="x", pady=(2, 0))

        def _on_bank_lb_sel(evt=None):
            idx = self.post_bank_lb.curselection()
            if not idx:
                return
            entry = self._post_bank_entries[idx[0]]
            self.post_vid_path[0] = entry["path"]
            self.post_vid_lbl.config(text=Path(entry["path"]).name, fg=TEXT)
            cap = entry.get("description") or entry.get("caption") or ""
            self.post_caption_box.delete("1.0", "end")
            self.post_caption_box.insert("1.0", cap)
            n = len(cap)
            self.post_char_lbl.config(text=f"{n} / 2200",
                                       fg=DANGER if n > 2200 else MUTED)
            self._post_load_preview(entry["path"])

        self.post_bank_lb.bind("<<ListboxSelect>>", _on_bank_lb_sel)

        def _post_refresh_bank():
            self._post_bank_entries = load_bank()
            self.post_bank_lb.delete(0, "end")
            for e in self._post_bank_entries:
                name = e.get("display_name") or e.get("filename") or Path(e["path"]).name
                exists = "✓" if Path(e["path"]).exists() else "✗"
                self.post_bank_lb.insert("end", f"{exists}  {name}")
            if not self._post_bank_entries:
                self.post_bank_lb.insert("end", "  Banque vide — ajoute des vidéos")

        self._post_refresh_bank = _post_refresh_bank
        _post_refresh_bank()

        # Phone list
        tk.Label(left, text=_("post.targets"), font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w", pady=(12, 0))
        grp_row = tk.Frame(left, bg=BG)
        grp_row.pack(fill="x", pady=(4, 0))
        tk.Label(grp_row, text=_("post.group"), font=("Segoe UI", 9),
                 bg=BG, fg=TEXT2).pack(side="left")
        self._post_grp_var = tk.StringVar(value="Tous")
        self._post_grp_cb  = ttk.Combobox(grp_row, textvariable=self._post_grp_var,
                                           state="readonly", width=14, font=("Segoe UI", 9))
        self._post_grp_cb.pack(side="left", padx=(4, 0))

        _phone_outer, phone_frame = self._round_card(left, radius=10, bg=SURFACE,
                                                      border=BORDER)
        _phone_outer.pack(fill="both", expand=True, pady=(6, 0))
        cv_p    = tk.Canvas(phone_frame, bg=SURFACE, highlightthickness=0)
        sv_p    = ttk.Scrollbar(phone_frame, orient="vertical", command=cv_p.yview)
        inn_p   = tk.Frame(cv_p, bg=SURFACE)
        wid_p   = cv_p.create_window((0, 0), window=inn_p, anchor="nw")
        inn_p.bind("<Configure>", lambda e: cv_p.configure(scrollregion=cv_p.bbox("all")))
        cv_p.bind("<Configure>",  lambda e: cv_p.itemconfig(wid_p, width=e.width))
        cv_p.configure(yscrollcommand=sv_p.set)
        sv_p.pack(side="right", fill="y")
        cv_p.pack(side="left", fill="both", expand=True)

        self._post_pvars = {}

        def _populate_phones(g="Tous"):
            for w in inn_p.winfo_children():
                w.destroy()
            self._post_pvars.clear()
            groups = set(d.get("group_name", "") for d in self.data.values() if d.get("group_name"))
            self._post_grp_cb["values"] = ["Tous"] + sorted(groups)
            for pid, d in sorted(self.data.items(),
                                  key=lambda x: int(x[1].get("serial_no") or 0)):
                name = d.get("phone_name") or d.get("ig_username") or ""
                if not name:
                    continue
                if g != "Tous" and d.get("group_name", "") != g:
                    continue
                var = tk.BooleanVar()
                self._post_pvars[pid] = var
                row = tk.Frame(inn_p, bg=SURFACE)
                row.pack(fill="x", padx=6, pady=2)
                tk.Checkbutton(row, variable=var, bg=SURFACE,
                               activebackground=SURFACE, selectcolor=SURFACE3,
                               fg=TEXT, activeforeground=TEXT,
                               cursor="hand2").pack(side="left")
                ig  = d.get("ig_username", "")
                lbl = f"{d.get('phone_name', pid)}"
                if ig:
                    lbl += f"  @{ig}"
                tk.Label(row, text=lbl, font=("Segoe UI", 9), bg=SURFACE,
                         fg=TEXT if ig else TEXT2, anchor="w",
                         cursor="hand2").pack(side="left", padx=4)
                row.bind("<Button-1>", lambda e, v=var: v.set(not v.get()))
            if not self._post_pvars:
                tk.Label(inn_p, text="Aucun téléphone.\nAjoute un Bearer Token\ndans Paramètres.",
                         font=("Segoe UI", 9), bg=SURFACE, fg=MUTED, justify="center").pack(pady=20)

        self._post_populate_phones = _populate_phones
        _populate_phones()
        self._post_grp_cb.bind("<<ComboboxSelected>>",
                               lambda e: _populate_phones(self._post_grp_var.get()))

        sel_row2 = tk.Frame(left, bg=BG)
        sel_row2.pack(fill="x", pady=(4, 0))
        tk.Button(sel_row2, text="Tout", font=("Segoe UI", 8), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: [v.set(True) for v in self._post_pvars.values()]).pack(side="left")
        tk.Button(sel_row2, text="Aucun", font=("Segoe UI", 8), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: [v.set(False) for v in self._post_pvars.values()]).pack(side="left", padx=4)

        # ── RIGHT: caption + options + log ──────────────────────────────────
        right = tk.Frame(main, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(16, 0))

        tk.Label(right, text="Caption", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w")
        tk.Label(right, text="Ctrl+A pour tout sélectionner · Ctrl+V pour coller",
                 font=("Segoe UI", 8), bg=BG, fg=MUTED).pack(anchor="w")
        self.post_caption_box = tk.Text(right, bg=SURFACE, fg=TEXT, font=("Segoe UI", 11),
                                        relief="flat", height=8, wrap="word",
                                        insertbackground=TEXT, padx=10, pady=8,
                                        highlightthickness=1, highlightbackground=BORDER,
                                        highlightcolor=ACCENT)
        self.post_caption_box.pack(fill="x", pady=(4, 0))

        # Char counter
        self.post_char_lbl = tk.Label(right, text="0 / 2200",
                                      font=("Segoe UI", 8), bg=BG, fg=MUTED, anchor="e")
        self.post_char_lbl.pack(fill="x")

        def _update_char(*_):
            n = len(self.post_caption_box.get("1.0", "end").strip())
            self.post_char_lbl.config(text=f"{n} / 2200",
                                       fg=DANGER if n > 2200 else MUTED)
        self.post_caption_box.bind("<KeyRelease>", _update_char)

        # Schedule row
        _sched_outer, sched_f = self._round_card(right, radius=10, bg=SURFACE,
                                                  border=BORDER)
        _sched_outer.pack(fill="x", pady=(10, 0))
        sched_inner = tk.Frame(sched_f, bg=SURFACE)
        sched_inner.pack(fill="x", padx=12, pady=8)
        tk.Label(sched_inner, text="Délai entre comptes :",
                 font=("Segoe UI", 9), bg=SURFACE, fg=TEXT2).pack(side="left")
        self.post_stagger_var = tk.IntVar(value=5)
        tk.Spinbox(sched_inner, from_=0, to=120, textvariable=self.post_stagger_var,
                   font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT, width=4,
                   relief="flat", buttonbackground=SURFACE2).pack(side="left", padx=6)
        tk.Label(sched_inner, text="min entre chaque compte",
                 font=("Segoe UI", 9), bg=SURFACE, fg=MUTED).pack(side="left")

        # ── Progress card (replaces log) ─────────────────────────────────────
        _prog_outer, prog_card = self._round_card(right, radius=12, bg=CARD,
                                                   border=BORDER)
        _prog_outer.pack(fill="x", pady=(10, 0))
        tk.Frame(prog_card, height=2, bg=ACCENT).pack(fill="x")
        prog_inner = tk.Frame(prog_card, bg=CARD, padx=14, pady=10)
        prog_inner.pack(fill="both", expand=True)

        # Step + detail labels
        prog_top = tk.Frame(prog_inner, bg=CARD)
        prog_top.pack(fill="x")
        self._post_step_lbl = tk.Label(prog_top, text="En attente",
                                        font=("Segoe UI", 10, "bold"), bg=CARD, fg=TEXT)
        self._post_step_lbl.pack(side="left")
        self._post_pct_lbl = tk.Label(prog_top, text="",
                                       font=("Consolas", 10, "bold"), bg=CARD, fg=ACCENT)
        self._post_pct_lbl.pack(side="right")
        self._post_detail_lbl = tk.Label(prog_inner, text="Sélectionne une vidéo et des comptes",
                                          font=("Segoe UI", 9), bg=CARD, fg=TEXT2)
        self._post_detail_lbl.pack(anchor="w", pady=(2, 6))

        # Animated progress bar (Canvas)
        bar_bg = tk.Frame(prog_inner, bg=SURFACE3, height=8,
                          highlightthickness=1, highlightbackground=BORDER)
        bar_bg.pack(fill="x", pady=(0, 4))
        bar_bg.pack_propagate(False)
        self._post_prog_bar = tk.Canvas(bar_bg, bg=SURFACE3, height=8,
                                         highlightthickness=0)
        self._post_prog_bar.pack(fill="both", expand=True)
        self._post_prog_pct = [0]
        self._post_prog_target = [0]

        def _animate_bar():
            """Smoothly animate bar toward target."""
            cur = self._post_prog_pct[0]
            tgt = self._post_prog_target[0]
            if cur < tgt:
                cur = min(tgt, cur + max(1, (tgt - cur) // 6))
                self._post_prog_pct[0] = cur
            w = self._post_prog_bar.winfo_width() or 300
            self._post_prog_bar.delete("all")
            if cur > 0:
                fill_w = max(8, int(w * cur / 100))
                col = OK if cur >= 100 else ACCENT
                self._post_prog_bar.create_rectangle(
                    0, 0, fill_w, 8, fill=col, outline="")
                # shimmer highlight
                self._post_prog_bar.create_rectangle(
                    0, 0, fill_w, 3, fill="#ffffff22", outline="")
            self.root.after(30, _animate_bar)
        self.root.after(100, _animate_bar)

        # Hidden log (toggle)
        log_toggle_row = tk.Frame(prog_inner, bg=CARD)
        log_toggle_row.pack(fill="x", pady=(4, 0))
        self._log_visible = [False]
        log_toggle_btn = tk.Label(log_toggle_row, text="▶  Journal détaillé",
                                   font=("Segoe UI", 8), bg=CARD, fg=TEXT2,
                                   cursor="hand2")
        log_toggle_btn.pack(side="left")

        self.post_log_box = tk.Text(prog_card, bg=SURFACE, fg=TEXT2,
                                     font=("Consolas", 8), relief="flat",
                                     state="disabled", wrap="word", height=6,
                                     padx=8, pady=6)

        def _toggle_log(e=None):
            if self._log_visible[0]:
                self.post_log_box.pack_forget()
                log_toggle_btn.config(text="▶  Journal détaillé")
                self._log_visible[0] = False
            else:
                self.post_log_box.pack(fill="both", expand=True, padx=8, pady=(0, 8))
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
            self._post_step_lbl.config(text=step, fg=TEXT)
            self._post_pct_lbl.config(text=f"{pct}%", fg=col)
            if detail:
                self._post_detail_lbl.config(text=detail, fg=TEXT2)
        self._post_set_progress = _post_set_progress

        self.post_launch_btn = tk.Button(
            right, text="🚀  Lancer le posting",
            font=("Segoe UI", 12, "bold"), bg=ACCENT, fg="#06080f",
            relief="flat", cursor="hand2", pady=12, bd=0,
            activebackground=ACCENT2, activeforeground="#06080f")
        self.post_launch_btn.pack(fill="x", pady=(8, 0))
        self._bind_hover(self.post_launch_btn, ACCENT, ACCENT2, "#06080f", "#06080f")

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

        # ── Header ───────────────────────────────────────────────────────────
        hdr_row = tk.Frame(f, bg=BG)
        hdr_row.pack(fill="x")
        L = self.cfg.get("lang", "fr")
        self._tab_header(hdr_row, "⚡", t("mp.title", L),
                         ("Pool de vidéos × captions → jusqu'à 20 téléphones simultanés"
                          if L == "fr"
                          else "Pool of videos × captions → up to 20 phones in parallel"),
                         ACCENT)
        # BETA badge
        beta_lbl = tk.Label(hdr_row, text=" BETA ", font=("Segoe UI", 8, "bold"),
                            bg=WARN, fg="#07080d", padx=6, pady=2)
        beta_lbl.place(relx=1.0, x=-16, y=14, anchor="ne")

        body = tk.Frame(f, bg=BG)
        body.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        # ── Left panel: video + caption pools ────────────────────────────────
        _left_outer, left = self._round_card(body, radius=12, bg=SURFACE,
                                              border=BORDER)
        _left_outer.pack(side="left", fill="y", padx=(0, 10))
        _left_outer.configure(width=300)
        _left_outer.pack_propagate(False)
        tk.Frame(left, height=2, bg=ACCENT).pack(fill="x")

        linner = tk.Frame(left, bg=SURFACE)
        linner.pack(fill="both", expand=True, padx=10, pady=10)

        # -- Video pool --
        tk.Label(linner, text="📹  POOL DE VIDÉOS", font=("Segoe UI", 9, "bold"),
                 bg=SURFACE, fg=ACCENT).pack(anchor="w", pady=(0, 4))

        # Thumbnail preview canvas
        self._mp_preview_canvas = tk.Canvas(linner, bg="#000",
                                             highlightthickness=1,
                                             highlightbackground=BORDER, height=110)
        self._mp_preview_canvas.pack(fill="x", pady=(0, 6))
        self._mp_preview_img_ref = None

        self._mp_vid_paths = []
        vlist_frame = tk.Frame(linner, bg=SURFACE2, highlightthickness=1,
                               highlightbackground=BORDER)
        vlist_frame.pack(fill="x")
        self._mp_vid_lb = tk.Listbox(vlist_frame, bg=SURFACE2, fg=TEXT,
                                      selectbackground=HL, selectforeground=ACCENT,
                                      relief="flat", bd=0, height=6,
                                      font=("Segoe UI", 9), activestyle="none",
                                      cursor="hand2", exportselection=False)
        self._mp_vid_lb.pack(fill="both", expand=True, padx=4, pady=4)

        def _on_mp_lb_sel(_e=None):
            sel = self._mp_vid_lb.curselection()
            if not sel:
                return
            path = self._mp_vid_paths[sel[0]]
            self._post_load_preview_into(self._mp_preview_canvas, path,
                                          ref_attr="_mp_preview_img_ref")
        self._mp_vid_lb.bind("<<ListboxSelect>>", _on_mp_lb_sel)

        vbtn_row = tk.Frame(linner, bg=SURFACE)
        vbtn_row.pack(fill="x", pady=(4, 10))
        def _add_videos():
            paths = filedialog.askopenfilenames(
                title="Ajouter des vidéos",
                filetypes=[("Vidéos", "*.mp4 *.mov *.avi *.mkv"), ("Tous", "*.*")])
            for p in paths:
                if p not in self._mp_vid_paths:
                    self._mp_vid_paths.append(p)
                    self._mp_vid_lb.insert("end", Path(p).name)
        def _rem_videos():
            sel = list(self._mp_vid_lb.curselection())
            for i in reversed(sel):
                self._mp_vid_lb.delete(i)
                self._mp_vid_paths.pop(i)
        self._mk_btn(vbtn_row, "+ Ajouter", "ok", _add_videos,
                     font=("Segoe UI", 9)).pack(side="left", padx=(0, 4))
        self._mk_btn(vbtn_row, "✕ Retirer", "danger", _rem_videos,
                     font=("Segoe UI", 9)).pack(side="left")

        tk.Frame(linner, height=1, bg=BORDER).pack(fill="x", pady=6)

        # -- Caption pool --
        tk.Label(linner, text="💬  POOL DE CAPTIONS", font=("Segoe UI", 9, "bold"),
                 bg=SURFACE, fg=ACCENT).pack(anchor="w", pady=(0, 4))

        centry_frame = tk.Frame(linner, bg=SURFACE)
        centry_frame.pack(fill="x", pady=(0, 4))
        self._mp_cap_entry = tk.Text(centry_frame, bg=SURFACE2, fg=TEXT, insertbackground=TEXT,
                                      relief="flat", height=3, font=("Segoe UI", 9),
                                      wrap="word", bd=1, highlightthickness=1,
                                      highlightbackground=BORDER, highlightcolor=ACCENT)
        self._mp_cap_entry.pack(fill="x")

        self._mp_captions = []
        clist_frame = tk.Frame(linner, bg=SURFACE2, highlightthickness=1,
                               highlightbackground=BORDER)
        clist_frame.pack(fill="x")
        self._mp_cap_lb = tk.Listbox(clist_frame, bg=SURFACE2, fg=TEXT,
                                      selectbackground=HL, selectforeground=ACCENT,
                                      relief="flat", bd=0, height=6,
                                      font=("Segoe UI", 9), activestyle="none",
                                      cursor="hand2", exportselection=False)
        self._mp_cap_lb.pack(fill="both", expand=True, padx=4, pady=4)

        cbtn_row = tk.Frame(linner, bg=SURFACE)
        cbtn_row.pack(fill="x", pady=(4, 4))
        def _add_caption():
            txt = self._mp_cap_entry.get("1.0", "end").strip()
            if not txt:
                return
            self._mp_captions.append(txt)
            preview = txt[:60].replace("\n", " ") + ("…" if len(txt) > 60 else "")
            self._mp_cap_lb.insert("end", preview)
            self._mp_cap_entry.delete("1.0", "end")
        def _rem_caption():
            sel = list(self._mp_cap_lb.curselection())
            for i in reversed(sel):
                self._mp_cap_lb.delete(i)
                self._mp_captions.pop(i)
        self._mk_btn(cbtn_row, "+ Ajouter", "ok", _add_caption,
                     font=("Segoe UI", 9)).pack(side="left", padx=(0, 4))
        self._mk_btn(cbtn_row, "✕ Retirer", "danger", _rem_caption,
                     font=("Segoe UI", 9)).pack(side="left")

        # ── Right panel ───────────────────────────────────────────────────────
        right = tk.Frame(body, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        # Config row
        _cfg_outer, cfg_card = self._round_card(right, radius=12, bg=CARD,
                                                 border=BORDER)
        _cfg_outer.pack(fill="x", pady=(0, 8))
        tk.Frame(cfg_card, height=2, bg=ACCENT).pack(fill="x")
        cfg_inner = tk.Frame(cfg_card, bg=CARD)
        cfg_inner.pack(fill="x", padx=12, pady=8)

        tk.Label(cfg_inner, text="Max simultanés :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(side="left", padx=(0, 4))
        self._mp_max_var = tk.IntVar(value=20)
        tk.Spinbox(cfg_inner, from_=1, to=20, textvariable=self._mp_max_var,
                   width=4, bg=SURFACE2, fg=TEXT, relief="flat",
                   font=("Segoe UI", 10), bd=0, buttonbackground=SURFACE3,
                   highlightthickness=1, highlightbackground=BORDER,
                   insertbackground=TEXT).pack(side="left", padx=(0, 16))

        tk.Label(cfg_inner, text="Mode :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(side="left", padx=(0, 4))
        self._mp_mode_var = tk.StringVar(value="Aléatoire")
        mode_cb = ttk.Combobox(cfg_inner, textvariable=self._mp_mode_var,
                               state="readonly", width=12, font=("Segoe UI", 9))
        mode_cb["values"] = ["Aléatoire", "Séquentiel"]
        mode_cb.pack(side="left", padx=(0, 16))

        tk.Label(cfg_inner, text="Écart (min) :", font=("Segoe UI", 9),
                 bg=CARD, fg=TEXT2).pack(side="left", padx=(0, 4))
        self._mp_stagger_var = tk.IntVar(value=5)
        tk.Spinbox(cfg_inner, from_=0, to=60, textvariable=self._mp_stagger_var,
                   width=4, bg=SURFACE2, fg=TEXT, relief="flat",
                   font=("Segoe UI", 10), bd=0, buttonbackground=SURFACE3,
                   highlightthickness=1, highlightbackground=BORDER,
                   insertbackground=TEXT).pack(side="left")

        # Phone selection
        _phone_card_outer, phone_card = self._round_card(right, radius=12, bg=CARD,
                                                          border=BORDER)
        _phone_card_outer.pack(fill="x", pady=(0, 8))
        tk.Frame(phone_card, height=2, bg=OK).pack(fill="x")
        ph_hdr = tk.Frame(phone_card, bg=CARD)
        ph_hdr.pack(fill="x", padx=12, pady=(6, 4))
        tk.Label(ph_hdr, text="📱  TÉLÉPHONES", font=("Segoe UI", 9, "bold"),
                 bg=CARD, fg=OK).pack(side="left")
        self._mp_sel_all_var = tk.BooleanVar(value=True)
        def _toggle_all():
            val = self._mp_sel_all_var.get()
            for v in self._mp_phone_vars.values():
                v.set(val)
        tk.Checkbutton(ph_hdr, text="Tout", variable=self._mp_sel_all_var,
                       command=_toggle_all, bg=CARD, fg=TEXT2, activebackground=CARD,
                       selectcolor=SURFACE2, font=("Segoe UI", 9),
                       relief="flat", cursor="hand2").pack(side="right")

        # Scrollable checkbox grid
        ph_canvas = tk.Canvas(phone_card, bg=CARD, highlightthickness=0, height=110)
        ph_sb = ttk.Scrollbar(phone_card, orient="vertical", command=ph_canvas.yview)
        ph_canvas.configure(yscrollcommand=ph_sb.set)
        ph_canvas.pack(side="left", fill="both", expand=True, padx=(12, 0), pady=(0, 8))
        ph_sb.pack(side="right", fill="y", pady=(0, 8))

        self._mp_phone_inner = tk.Frame(ph_canvas, bg=CARD)
        ph_canvas.create_window((0, 0), window=self._mp_phone_inner, anchor="nw")
        def _ph_conf(e=None):
            ph_canvas.configure(scrollregion=ph_canvas.bbox("all"))
        self._mp_phone_inner.bind("<Configure>", _ph_conf)
        self._mp_phone_vars = {}
        self._mp_phone_canvas = ph_canvas

        # Launch / Stop buttons
        launch_row = tk.Frame(right, bg=BG)
        launch_row.pack(fill="x", pady=(0, 8))
        self._mp_running = [False]
        self._mp_stop_flag = [False]

        def _launch():
            if self._mp_running[0]:
                return
            vids = list(self._mp_vid_paths)
            caps = list(self._mp_captions)
            phones = [pid for pid, v in self._mp_phone_vars.items() if v.get()]
            if not vids:
                messagebox.showwarning("Mass Posting", "Ajoute au moins une vidéo.")
                return
            if not caps:
                messagebox.showwarning("Mass Posting", "Ajoute au moins une caption.")
                return
            if not phones:
                messagebox.showwarning("Mass Posting", "Sélectionne au moins un téléphone.")
                return
            bearer = self.cfg.get("bearer_token", "") or self.cfg.get("geelark_token", "")
            if not bearer:
                messagebox.showwarning("Mass Posting",
                    "Bearer Token GéeLark manquant — configure-le dans Paramètres → API Keys.")
                return
            self._mp_running[0] = True
            self._mp_stop_flag[0] = False
            self._mp_launch_btn.config(state="disabled")
            self._mp_stop_btn.config(state="normal")
            self._mp_log_clear()
            self._mp_progress_clear(phones)
            threading.Thread(target=self._run_mass_post,
                             args=(phones, vids, caps, bearer),
                             daemon=True).start()

        def _stop():
            self._mp_stop_flag[0] = True
            self._mp_log("⏹ Arrêt demandé...", "warn")
            self._mp_stop_btn.config(state="disabled")

        self._mp_launch_btn = self._mk_btn(launch_row, "⚡  LANCER MASS POST",
                                            "primary", _launch,
                                            font=("Segoe UI", 11, "bold"), pady=10)
        self._mp_launch_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self._mp_stop_btn = self._mk_btn(launch_row, "⏹  Arrêter", "danger", _stop,
                                          font=("Segoe UI", 11, "bold"), pady=10)
        self._mp_stop_btn.config(state="disabled")
        self._mp_stop_btn.pack(side="left", fill="x", expand=True)

        # Progress area (per-phone status)
        _mp_prog_outer, prog_card = self._round_card(right, radius=12, bg=CARD,
                                                      border=BORDER)
        _mp_prog_outer.pack(fill="x", pady=(0, 8))
        tk.Frame(prog_card, height=2, bg=WARN).pack(fill="x")
        tk.Label(prog_card, text="PROGRESSION", font=("Segoe UI", 8, "bold"),
                 bg=CARD, fg=TEXT2).pack(anchor="w", padx=12, pady=(4, 2))
        prog_canvas = tk.Canvas(prog_card, bg=CARD, highlightthickness=0, height=100)
        prog_sb = ttk.Scrollbar(prog_card, orient="vertical", command=prog_canvas.yview)
        prog_canvas.configure(yscrollcommand=prog_sb.set)
        prog_canvas.pack(side="left", fill="both", expand=True, padx=12, pady=(0, 8))
        prog_sb.pack(side="right", fill="y", pady=(0, 8))
        self._mp_prog_inner = tk.Frame(prog_canvas, bg=CARD)
        prog_canvas.create_window((0, 0), window=self._mp_prog_inner, anchor="nw")
        def _prog_conf(e=None):
            prog_canvas.configure(scrollregion=prog_canvas.bbox("all"))
        self._mp_prog_inner.bind("<Configure>", _prog_conf)
        self._mp_prog_labels = {}

        # Log area
        _log_outer, log_card = self._round_card(right, radius=12, bg=CARD,
                                                 border=BORDER)
        _log_outer.pack(fill="both", expand=True)
        tk.Frame(log_card, height=2, bg=MUTED).pack(fill="x")
        log_hdr = tk.Frame(log_card, bg=CARD)
        log_hdr.pack(fill="x", padx=12, pady=(4, 2))
        tk.Label(log_hdr, text="LOG", font=("Segoe UI", 8, "bold"),
                 bg=CARD, fg=TEXT2).pack(side="left")
        self._mk_btn(log_hdr, "Effacer", "ghost", self._mp_log_clear,
                     font=("Segoe UI", 8), pady=2).pack(side="right")
        self._mp_log_box = tk.Text(log_card, bg=SURFACE, fg=TEXT2,
                                   relief="flat", state="disabled",
                                   font=("Consolas", 9), wrap="word",
                                   insertbackground=TEXT)
        mp_log_sb = ttk.Scrollbar(log_card, orient="vertical",
                                   command=self._mp_log_box.yview)
        self._mp_log_box.configure(yscrollcommand=mp_log_sb.set)
        self._mp_log_box.pack(side="left", fill="both", expand=True, padx=(12, 0), pady=(0, 8))
        mp_log_sb.pack(side="right", fill="y", pady=(0, 8))
        for tag, col in [("ok", OK), ("warn", WARN), ("error", DANGER),
                         ("accent", ACCENT), ("info", TEXT2)]:
            self._mp_log_box.tag_config(tag, foreground=col)

        # Populate phone checkboxes when tab is shown
        self._mp_needs_phone_refresh = True

    def _mp_refresh_phones(self):
        for w in self._mp_phone_inner.winfo_children():
            w.destroy()
        self._mp_phone_vars.clear()
        phones = [(pid, d.get("phone_name", pid))
                  for pid, d in self.data.items() if d.get("phone_name")]
        phones.sort(key=lambda x: x[1])
        col, row = 0, 0
        for pid, name in phones:
            v = tk.BooleanVar(value=True)
            self._mp_phone_vars[pid] = v
            short = name[:22] + "…" if len(name) > 22 else name
            cb = tk.Checkbutton(self._mp_phone_inner, text=short, variable=v,
                                bg=CARD, fg=TEXT, activebackground=CARD,
                                selectcolor=SURFACE2, font=("Segoe UI", 9),
                                relief="flat", cursor="hand2", anchor="w")
            cb.grid(row=row, column=col, sticky="w", padx=(0, 16), pady=1)
            col += 1
            if col >= 3:
                col = 0
                row += 1
        self._mp_phone_canvas.configure(scrollregion=self._mp_phone_canvas.bbox("all"))

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
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["bank"] = f

        hdr_row = tk.Frame(f, bg=BG)
        hdr_row.pack(fill="x", pady=(0, 4))
        L = self.cfg.get("lang", "fr")
        self._tab_header(hdr_row, "🗂", t("bank.title", L),
                         ("Stockez et gérez vos vidéos prêtes à poster"
                          if L == "fr"
                          else "Store and manage your videos ready to post"), WARN)
        tb = tk.Frame(f, bg=BG)
        tb.pack(fill="x", pady=(0, 8))
        self._mk_btn(tb, "↺  Rafraîchir", "ghost", self._refresh_bank,
                     pady=5).pack(side="right", padx=(4, 0))
        self._mk_btn(tb, "📂  Dossier export", "secondary", self._choose_export_dir,
                     pady=5).pack(side="right")
        self.export_dir_lbl = tk.Label(
            tb, text=f"Export : {self.cfg.get('export_dir','Même dossier')}",
            font=("Segoe UI", 9), bg=BG, fg=MUTED)
        self.export_dir_lbl.pack(side="left", padx=(12, 0))

        split = tk.Frame(f, bg=BG)
        split.pack(fill="both", expand=True)

        # Gauche : grille de cartes scrollable
        lw = tk.Frame(split, bg=BG, width=620)
        lw.pack(side="left", fill="both")
        lw.pack_propagate(False)

        # Canvas scrollable pour les cartes
        self.bank_grid_canvas = tk.Canvas(lw, bg=BG, highlightthickness=0, bd=0)
        bank_vsb = ttk.Scrollbar(lw, orient="vertical",
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

        # Stockage des références pour les cartes
        self._bank_card_widgets = {}      # entry_id → outer frame
        self._bank_card_thumbs = {}       # entry_id → thumb label
        self._bank_thumb_refs = []        # liste pour empêcher GC des PhotoImage
        self._bank_thumb_jobs = set()     # entry_ids en cours de chargement async
        self._bank_grid_cols = 3
        self.bank_tree = None             # rétro-compat (anciennes refs Tree)

        acts = tk.Frame(f, bg=BG)
        acts.pack(fill="x", pady=(6, 0))
        self._mk_btn(acts, "📥  Ouvrir",          "ghost",   self._bank_open,       pady=5).pack(side="left", padx=(0, 3))
        self._mk_btn(acts, "⬇  Télécharger",      "secondary", self._bank_download, pady=5).pack(side="left", padx=(0, 3))
        self._mk_btn(acts, "🔀  Randomiser méta",  "warn",
                     cmd=lambda: threading.Thread(target=self._randomize_meta, daemon=True).start(),
                     pady=5).pack(side="left", padx=(0, 3))
        self._mk_btn(acts, "🚀  Poster",           "primary", self._post_from_bank, pady=5,
                     font=("Segoe UI", 9, "bold")).pack(side="left", padx=(0, 3))
        self._mk_btn(acts, "🗑  Supprimer",        "danger",  self._bank_delete,    pady=5).pack(side="left", padx=(0, 3))
        self.bank_status = tk.Label(acts, text="", font=("Segoe UI", 9), bg=BG, fg=TEXT2)
        self.bank_status.pack(side="left", padx=8)

        # Droite : aperçu + description
        right = tk.Frame(split, bg=CARD)
        right.pack(side="left", fill="both", expand=True, padx=(10, 0))

        tk.Label(right, text="APERÇU", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(anchor="w", padx=14, pady=(12, 6))
        self.bank_preview = tk.Canvas(right, bg="#000", highlightthickness=0, height=220)
        self.bank_preview.pack(fill="x", padx=14, pady=(0, 8))
        self.bank_preview_ref = None
        self.bank_preview.create_text(200, 110, text="Clique sur une vidéo",
                                       fill=MUTED, font=("Segoe UI", 10))

        tk.Frame(right, height=1, bg=BORDER).pack(fill="x", padx=14, pady=(0, 8))

        dh = tk.Frame(right, bg=CARD)
        dh.pack(fill="x", padx=14, pady=(0, 6))
        tk.Label(dh, text="DESCRIPTION INSTAGRAM",
                 font=("Consolas", 8, "bold"), bg=CARD, fg=MUTED).pack(side="left")
        self.gen_btn = self._mk_btn(dh, "✨  Générer (Groq)", "primary", pady=4,
                                    cmd=lambda: threading.Thread(
                                        target=self._generate_desc, daemon=True).start())
        self.gen_btn.pack(side="right")

        self.desc_box = tk.Text(right, font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT,
                                 insertbackground=TEXT, relief="flat", bd=0, height=9,
                                 highlightthickness=1, highlightcolor=ACCENT,
                                 highlightbackground=BORDER, wrap="word", padx=8, pady=8)
        self.desc_box.pack(fill="x", padx=14, pady=(0, 6))

        br = tk.Frame(right, bg=CARD)
        br.pack(fill="x", padx=14, pady=(0, 10))
        self._mk_btn(br, "💾  Sauvegarder", "ok", self._save_desc, pady=5).pack(side="left")
        self._mk_btn(br, "📋  Copier", "secondary", self._copy_desc,
                     pady=5).pack(side="left", padx=(6, 0))
        self.desc_status = tk.Label(br, text="", font=("Segoe UI", 9), bg=CARD, fg=TEXT2)
        self.desc_status.pack(side="left", padx=10)

    def _on_bank_sel(self, e=None):
        # Conservé pour rétro-compatibilité ; la sélection se fait désormais via cartes.
        if self._bank_selected:
            self._on_bank_sel_card(self._bank_selected)

    def _on_bank_sel_card(self, entry_id):
        """Click handler pour les cartes de la grille bank."""
        if not entry_id:
            return
        self._bank_selected = entry_id
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == entry_id), None)
        if not entry:
            return
        # Mise à jour visuelle des bordures de carte
        for eid, outer in list(self._bank_card_widgets.items()):
            try:
                col = ACCENT if eid == entry_id else BORDER
                if hasattr(outer, "_set_border") and outer._set_border:
                    outer._set_border(col)
                outer._sel_border = col
            except Exception:
                pass
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
                    })

        cols = max(1, getattr(self, "_bank_grid_cols", 3))
        for c in range(cols):
            try:
                self.bank_grid_inner.grid_columnconfigure(c, weight=1, uniform="bankcol")
            except Exception:
                pass

        if not bank:
            empty = tk.Label(self.bank_grid_inner,
                              text="Aucune vidéo en banque\nLance un export pour la peupler.",
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
            outer = self._bank_card_widgets[self._bank_selected]
            try:
                outer._set_border(ACCENT)
            except Exception:
                pass

    def _build_bank_card(self, parent, entry, row, col):
        """Construit une carte vidéo dans la grille."""
        eid = entry["id"]
        exists = Path(entry.get("path", "")).exists()
        name = (entry.get("display_name")
                or entry.get("filename")
                or Path(entry.get("path", "")).name or "—")
        overlay = entry.get("overlay") or "—"
        size_mb = entry.get("size_mb", 0)
        ts = entry.get("created", "")
        try:
            ts = datetime.fromisoformat(ts).strftime("%d/%m %H:%M")
        except Exception:
            pass

        outer, content = self._round_card(parent, radius=12, bg=CARD,
                                            border=BORDER, hover_border=ACCENT)
        outer.grid(row=row, column=col, sticky="nsew", padx=6, pady=6)
        outer._sel_border = BORDER

        # Thumbnail (placeholder gris foncé)
        thumb_h = 108
        thumb_lbl = tk.Label(content, bg=SURFACE2, text="🎬",
                             font=("Segoe UI", 18), fg=MUTED,
                             height=5, anchor="center")
        thumb_lbl.pack(fill="x", padx=8, pady=(8, 4))
        try:
            thumb_lbl.configure(height=int(thumb_h / 18))
        except Exception:
            pass
        self._bank_card_thumbs[eid] = thumb_lbl

        # Bandeau titre + badge
        title_row = tk.Frame(content, bg=CARD)
        title_row.pack(fill="x", padx=10, pady=(0, 2))
        max_chars = 24
        disp = name if len(name) <= max_chars else name[:max_chars - 1] + "…"
        title_lbl = tk.Label(title_row, text=disp,
                              font=("Segoe UI", 10, "bold"),
                              bg=CARD, fg=TEXT if exists else TEXT2,
                              anchor="w")
        title_lbl.pack(side="left", fill="x", expand=True)
        badge = tk.Label(title_row,
                          text="✓" if exists else "✗",
                          font=("Segoe UI", 10, "bold"),
                          bg=CARD, fg=OK if exists else DANGER)
        badge.pack(side="right", padx=(4, 0))

        # Sous-titre overlay
        ov_disp = overlay if len(overlay) <= 28 else overlay[:27] + "…"
        ov_lbl = tk.Label(content, text=ov_disp,
                           font=("Segoe UI", 9), bg=CARD, fg=TEXT2,
                           anchor="w", justify="left")
        ov_lbl.pack(fill="x", padx=10, pady=(0, 2))

        # Pied : taille + date
        meta = tk.Frame(content, bg=CARD)
        meta.pack(fill="x", padx=10, pady=(0, 6))
        size_lbl = tk.Label(meta, text=f"{size_mb} Mo",
                             font=("Consolas", 8), bg=CARD, fg=MUTED)
        size_lbl.pack(side="left")
        date_lbl = tk.Label(meta, text=ts or "",
                             font=("Consolas", 8), bg=CARD, fg=MUTED)
        date_lbl.pack(side="right")

        # Bindings clic / clic-droit / molette sur tous les widgets de la carte
        def _click(_e=None, _id=eid):
            self._on_bank_sel_card(_id)
        def _rclick(e, _id=eid):
            self._bank_card_context(e, _id)

        widgets = [outer, content, thumb_lbl, title_row, title_lbl, badge,
                    ov_lbl, meta, size_lbl, date_lbl]
        try:
            widgets.append(outer._cv)
        except Exception:
            pass
        for w in widgets:
            try:
                w.bind("<Button-1>", _click, add="+")
                w.bind("<Button-3>", _rclick, add="+")
                w.bind("<MouseWheel>", self._bank_grid_wheel, add="+")
                w.configure(cursor="hand2")
            except Exception:
                pass

        self._bank_card_widgets[eid] = outer

        # Lance le chargement async du thumbnail
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
            lbl = self._bank_card_thumbs.get(eid)
            if not lbl:
                return
            try:
                lbl.configure(image=photo, text="", height=0)
                lbl.image = photo
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

        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["autocomment"] = f

        L = self.cfg.get("lang", "fr")
        self._tab_header(f, "🤖",
                         "Automatisation" if L == "fr" else "Automation",
                         ("Réponses automatiques aux commentaires via Groq AI"
                          if L == "fr"
                          else "Automatic comment replies via Groq AI"), OK)

        main = tk.Frame(f, bg=BG)
        main.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        # ═══ COLONNE GAUCHE : sélections + config ════════════════════════════
        left = tk.Frame(main, bg=BG, width=290)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # 1. Compte
        tk.Label(left, text="1. Compte", font=("Segoe UI", 9, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w")
        self._ac_acc_var = tk.StringVar()
        self._ac_acc_map = {}
        self._ac_acc_cb = ttk.Combobox(left, textvariable=self._ac_acc_var,
                                        state="readonly", font=("Segoe UI", 9))
        self._ac_acc_cb.pack(fill="x", pady=(3, 6))

        def _refresh_accounts():
            self._ac_acc_map.clear()
            for pid, d in sorted(self.data.items(),
                                  key=lambda x: int(x[1].get("serial_no") or 0)):
                ig = d.get("ig_username") or d.get("phone_name") or ""
                if not ig:
                    continue
                sid = d.get("ig_sessionid", "").strip()
                icon = "🟢" if sid else "🔴"
                label = f"{icon} @{ig}".replace("@@", "@")
                self._ac_acc_map[label] = (pid, d)
            self._ac_acc_cb["values"] = list(self._ac_acc_map.keys())
            if self._ac_acc_map and not self._ac_acc_var.get():
                self._ac_acc_cb.current(0)

        _refresh_accounts()

        # 2. Vidéos
        hdr2 = tk.Frame(left, bg=BG)
        hdr2.pack(fill="x")
        tk.Label(hdr2, text="2. Vidéo cible", font=("Segoe UI", 9, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        load_vid_btn = tk.Button(hdr2, text="⟳ Charger", font=("Segoe UI", 8),
                                  bg=SURFACE2, fg=TEXT2, relief="flat",
                                  cursor="hand2", padx=6, pady=2)
        load_vid_btn.pack(side="right")

        vid_frame = tk.Frame(left, bg=SURFACE, highlightthickness=1,
                             highlightbackground=BORDER, height=120)
        vid_frame.pack(fill="x", pady=(3, 6))
        vid_frame.pack_propagate(False)
        self._ac_vid_lb = tk.Listbox(vid_frame, bg=SURFACE, fg=TEXT,
                                     font=("Segoe UI", 8), relief="flat",
                                     selectbackground=ACCENT, selectforeground="#06080f",
                                     activestyle="none", cursor="hand2",
                                     exportselection=False)
        vsb_v = ttk.Scrollbar(vid_frame, orient="vertical", command=self._ac_vid_lb.yview)
        self._ac_vid_lb.configure(yscrollcommand=vsb_v.set)
        vsb_v.pack(side="right", fill="y")
        self._ac_vid_lb.pack(side="left", fill="both", expand=True)
        self._ac_media_items = []

        # 3. Clé Groq
        tk.Label(left, text="3. Clé API Groq", font=("Segoe UI", 9, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w")
        groq_row = tk.Frame(left, bg=BG)
        groq_row.pack(fill="x", pady=(3, 6))
        self._ac_groq_var = tk.StringVar(value=self.cfg.get("groq_api_key", ""))
        groq_e = tk.Entry(groq_row, textvariable=self._ac_groq_var, bg=SURFACE, fg=TEXT,
                          font=("Segoe UI", 9), relief="flat", show="•",
                          insertbackground=TEXT)
        groq_e.pack(side="left", fill="x", expand=True, ipady=5, padx=(0, 4))
        tk.Button(groq_row, text="👁", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=3,
                  command=lambda: groq_e.config(
                      show="" if groq_e.cget("show") == "•" else "•")).pack(side="right")

        # 4. Persona
        tk.Label(left, text="4. Persona Groq", font=("Segoe UI", 9, "bold"),
                 bg=BG, fg=TEXT2).pack(anchor="w")
        self._ac_persona_box = tk.Text(left, bg=SURFACE, fg=TEXT, font=("Segoe UI", 8),
                                       relief="flat", height=4, wrap="word",
                                       insertbackground=TEXT, padx=6, pady=5,
                                       highlightthickness=1, highlightbackground=BORDER)
        self._ac_persona_box.pack(fill="x", pady=(3, 6))
        self._ac_persona_box.insert("1.0", self.cfg.get("ac_persona",
            "Tu es un créateur de contenu Instagram sympathique. "
            "Réponds en français, de façon courte (1-2 phrases), chaleureuse et engageante."))

        # 5. Intervalle
        intv_row = tk.Frame(left, bg=BG)
        intv_row.pack(fill="x", pady=(0, 8))
        tk.Label(intv_row, text="Vérifier toutes les", font=("Segoe UI", 9),
                 bg=BG, fg=TEXT2).pack(side="left")
        self._ac_intv_var = tk.IntVar(value=int(self.cfg.get("ac_interval_min", 5)))
        tk.Spinbox(intv_row, from_=1, to=120, textvariable=self._ac_intv_var,
                   font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT, width=4,
                   relief="flat", buttonbackground=SURFACE2).pack(side="left", padx=6)
        tk.Label(intv_row, text="min", font=("Segoe UI", 9),
                 bg=BG, fg=MUTED).pack(side="left")

        self._ac_running = False
        self._ac_stop_flag = [False]
        self._ac_btn = tk.Button(left, text="▶  Démarrer",
                                 font=("Segoe UI", 11, "bold"), bg=OK, fg="#06080f",
                                 relief="flat", cursor="hand2", pady=10, bd=0,
                                 activebackground="#00a882", activeforeground="#06080f")
        self._ac_btn.pack(fill="x", pady=(8, 0))
        self._bind_hover(self._ac_btn, OK, "#00a882", "#06080f", "#06080f")

        # ═══ COLONNE MILIEU : commentaires ═══════════════════════════════════
        mid = tk.Frame(main, bg=BG, width=260)
        mid.pack(side="left", fill="y", padx=(12, 0))
        mid.pack_propagate(False)

        hdr_m = tk.Frame(mid, bg=BG)
        hdr_m.pack(fill="x")
        tk.Label(hdr_m, text="Commentaires", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        self._ac_com_count_lbl = tk.Label(hdr_m, text="", font=("Segoe UI", 8),
                                           bg=BG, fg=MUTED)
        self._ac_com_count_lbl.pack(side="right")
        tk.Button(hdr_m, text="⟳", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: _on_vid_select()).pack(side="right", padx=(0, 4))

        com_frame = tk.Frame(mid, bg=SURFACE, highlightthickness=1,
                             highlightbackground=BORDER)
        com_frame.pack(fill="both", expand=True, pady=(4, 0))
        self._ac_com_box = scrolledtext.ScrolledText(
            com_frame, bg=SURFACE, fg=TEXT, font=("Segoe UI", 9),
            relief="flat", state="disabled", wrap="word", padx=8, pady=6)
        self._ac_com_box.pack(fill="both", expand=True)
        self._ac_com_box.tag_config("author", foreground=ACCENT, font=("Segoe UI", 9, "bold"))
        self._ac_com_box.tag_config("replied", foreground=OK)
        self._ac_com_box.tag_config("text", foreground=TEXT)
        self._ac_com_box.tag_config("sep", foreground=BORDER)

        # ═══ COLONNE DROITE : log ════════════════════════════════════════════
        right = tk.Frame(main, bg=BG)
        right.pack(side="left", fill="both", expand=True, padx=(12, 0))

        hdr_r = tk.Frame(right, bg=BG)
        hdr_r.pack(fill="x")
        tk.Label(hdr_r, text="Journal", font=("Segoe UI", 10, "bold"),
                 bg=BG, fg=TEXT2).pack(side="left")
        tk.Button(hdr_r, text="🗑", font=("Segoe UI", 9), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=6, pady=2,
                  command=lambda: (self._ac_log_box.config(state="normal"),
                                   self._ac_log_box.delete("1.0", "end"),
                                   self._ac_log_box.config(state="disabled"))).pack(side="right")

        self._ac_log_box = scrolledtext.ScrolledText(
            right, bg=SURFACE, fg=TEXT2, font=("Consolas", 9),
            relief="flat", state="disabled", wrap="word")
        self._ac_log_box.pack(fill="both", expand=True, pady=(4, 0))

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
                        [_show_comments_in_panel(c, r), _ac_log(m, lv)])
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
        self.sv["phones"].config(text=str(total))
        self.sv["active"].config(text=str(active))
        self.sv["banned"].config(text=str(banned))
        self.sv["views"].config(text=fmt(views))

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
