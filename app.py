import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog, colorchooser
import threading, hashlib, time, json, httpx, sys, os, subprocess, shutil, random, re
import textwrap, concurrent.futures
from datetime import datetime
from pathlib import Path

BASE_DIR     = Path(sys.argv[0]).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
DATA_FILE    = BASE_DIR / "data.json"
CONFIG_FILE  = BASE_DIR / "config.json"
BANK_FILE    = BASE_DIR / "bank.json"
PRESETS_FILE = BASE_DIR / "presets.json"

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
    "Lime":    {"accent": "#d4f53c", "accent2": "#a8c22a", "ok": "#23d18b"},
    "Bleu":    {"accent": "#3b9eff", "accent2": "#2076cc", "ok": "#23d18b"},
    "Violet":  {"accent": "#b06cf0", "accent2": "#8a3ed4", "ok": "#23d18b"},
    "Ambre":   {"accent": "#f59e0b", "accent2": "#d97706", "ok": "#23d18b"},
    "Rouge":   {"accent": "#ff5c6e", "accent2": "#cc2d3e", "ok": "#23d18b"},
    "Cyan":    {"accent": "#06d4f0", "accent2": "#0599b0", "ok": "#23d18b"},
    "Rose":    {"accent": "#f472b6", "accent2": "#be185d", "ok": "#23d18b"},
    "Vert":    {"accent": "#34d56a", "accent2": "#16a34a", "ok": "#23d18b"},
}

# ── Couleurs (modifiées par le thème au démarrage) ────────────────────────────
BG       = "#06080f"
SURFACE  = "#0d1017"
SURFACE2 = "#131720"
BORDER   = "#1a2035"
CARD     = "#0f1420"
HL       = "#1c2238"
ACCENT   = "#d4f53c"
ACCENT2  = "#a8c22a"
DANGER   = "#ff3d51"
OK       = "#23d18b"
WARN     = "#ff9500"
TEXT     = "#e8edf7"
TEXT2    = "#6b778f"
MUTED    = "#323a52"

def apply_theme_globals(theme_name):
    global ACCENT, ACCENT2, OK
    t = THEMES.get(theme_name, THEMES["Lime"])
    ACCENT  = t["accent"]
    ACCENT2 = t["accent2"]

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
                "id":       n.get("shortcode"),
                "url":      f"https://www.instagram.com/reel/{n.get('shortcode')}/",
                "views":    n.get("video_view_count", 0),
                "likes":    n.get("edge_liked_by", {}).get("count", 0),
                "comments": n.get("edge_media_to_comment", {}).get("count", 0),
                "caption":  (caps[0]["node"]["text"][:120] if caps else ""),
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
                "Accept-Encoding": "gzip, deflate, br",
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

            # ── Strategy A2: GraphQL query (très fiable avec sessionid) ───────
            try:
                import urllib.parse
                variables = json.dumps({"username": username, "include_reel": True})
                gql_url = ("https://www.instagram.com/graphql/query/"
                           "?query_hash=c9100bf9110dd6361671f113dd02e7d"
                           f"&variables={urllib.parse.quote(variables)}")
                rg = client.get(gql_url, headers={**api_headers,
                    "X-Requested-With": "XMLHttpRequest"})
                if rg.status_code in (200, 201):
                    try:
                        user = rg.json().get("data", {}).get("user")
                        if user:
                            return _parse_ig_graphql(user, username)
                        errors.append("A2:graphql→200 user=null")
                    except Exception:
                        errors.append("A2:graphql→JSON parse error")
                else:
                    errors.append(f"A2:graphql→HTTP{rg.status_code}")
            except Exception as ex:
                errors.append(f"A2:graphql→{ex}")

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

            # ── Strategy B: ?__a=1  (accepte 200 ET 201) ─────────────────────
            try:
                r2 = client.get(
                    f"https://www.instagram.com/{username}/?__a=1&__d=dis",
                    headers={**base_headers, "Accept": "application/json",
                             "X-Requested-With": "XMLHttpRequest"}
                )
                if r2.status_code in (200, 201):
                    try:
                        data = r2.json()
                        user = (data.get("graphql", {}).get("user")
                                or data.get("data", {}).get("user"))
                        if user:
                            return _parse_ig_graphql(user, username)
                        errors.append("B:2xx mais pas de user dans JSON")
                    except Exception:
                        errors.append("B:2xx mais réponse non-JSON")
                else:
                    errors.append(f"B:HTTP{r2.status_code}")
            except Exception as ex:
                errors.append(f"B:{ex}")

            # ── Strategy C: scrape HTML page ──────────────────────────────────
            try:
                r3 = client.get(
                    f"https://www.instagram.com/{username}/",
                    headers={**base_headers,
                             "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}
                )
                if r3.status_code == 200:
                    html = r3.text

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

                    # C3: raw HTML regex
                    fol_m  = re.search(r'"edge_followed_by":\{"count":(\d+)\}', html)
                    if fol_m:
                        fwg_m  = re.search(r'"edge_follow":\{"count":(\d+)\}', html)
                        name_m = re.search(r'"full_name":"((?:[^"\\]|\\.)*)"', html)
                        post_m = re.search(r'"edge_owner_to_timeline_media":\{"count":(\d+)', html)
                        bio_m  = re.search(r'"biography":"((?:[^"\\]|\\.)*)"', html)
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

                    if r3.status_code in (404, 410):
                        return {"ig_status": "banned", "ig_error": "Compte introuvable"}
                    if "Log in" in html or "login" in str(r3.url):
                        return {"ig_status": "private",
                                "ig_error": "Connexion requise — sessionid invalide ?"}
                    errors.append(f"C:200 mais aucune donnée trouvée dans le HTML")
                else:
                    errors.append(f"C:HTTP{r3.status_code}")
            except Exception as ex:
                errors.append(f"C:{ex}")

            err_detail = " | ".join(errors[:4]) if errors else "toutes stratégies échouées"
            return {"ig_status": "error", "ig_error": f"Échec ({err_detail})"}

    except httpx.TimeoutException:
        return {"ig_status": "error", "ig_error": "Timeout (>25s)"}
    except Exception as ex:
        return {"ig_status": "error", "ig_error": str(ex)}

# ══════════════════════════════════════════════════════════════════════════════
# LOGIN
# ══════════════════════════════════════════════════════════════════════════════
class LoginWindow:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("IG Tracker")
        self.root.geometry("400x440")
        self.root.configure(bg=BG)
        self.root.resizable(False, False)
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

        self._setup_styles()
        self._build_layout()
        self._show_tab("phones")

        threading.Thread(target=self._load_phones, daemon=True).start()
        threading.Thread(target=self._scheduler, daemon=True).start()
        self.root.mainloop()

    def _on_close(self):
        self.running = False
        self.root.destroy()

    def _setup_styles(self):
        style = ttk.Style()
        style.theme_use("clam")
        for name in ["T", "Bank", "Vid"]:
            style.configure(f"{name}.Treeview",
                background=SURFACE, fieldbackground=SURFACE, foreground=TEXT,
                rowheight=32, font=("Segoe UI", 10), borderwidth=0)
            style.configure(f"{name}.Treeview.Heading",
                background=SURFACE2, foreground=TEXT2,
                font=("Segoe UI", 9, "bold"), relief="flat")
            style.map(f"{name}.Treeview", background=[("selected", HL)])

    def log(self, msg, level="info"):
        colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_box.config(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n", level)
        self.log_box.tag_config(level, foreground=colors.get(level, TEXT2))
        self.log_box.see("end")
        self.log_box.config(state="disabled")

    # ── LAYOUT ───────────────────────────────────────────────────────────────
    def _build_layout(self):
        self.bg_canvas = tk.Canvas(self.root, bg=BG, highlightthickness=0)
        self.bg_canvas.pack(fill="both", expand=True)

        PAD = 8
        self.sidebar = tk.Frame(self.bg_canvas, bg=SURFACE, width=180)
        self.sidebar.pack_propagate(False)
        self._sidebar_win = self.bg_canvas.create_window(
            PAD, PAD, anchor="nw", window=self.sidebar, width=180)

        self.main_frame = tk.Frame(self.bg_canvas, bg=BG)
        self._main_win = self.bg_canvas.create_window(
            PAD + 180 + PAD, PAD, anchor="nw", window=self.main_frame)

        def _on_canvas_resize(e):
            w, h = e.width, e.height
            sidebar_h = max(0, h - PAD * 2)
            main_w    = max(0, w - 180 - PAD * 3)
            main_h    = sidebar_h
            self.bg_canvas.itemconfig(self._sidebar_win, height=sidebar_h)
            self.bg_canvas.itemconfig(self._main_win,    width=main_w, height=main_h)

        self.bg_canvas.bind("<Configure>", _on_canvas_resize)

        # Sidebar content
        tk.Label(self.sidebar, text="IG Tracker", font=("Segoe UI", 14, "bold"),
                 bg=SURFACE, fg=ACCENT).pack(pady=(20, 2), padx=16, anchor="w")
        tk.Label(self.sidebar, text=self.email, font=("Segoe UI", 8),
                 bg=SURFACE, fg=TEXT2, wraplength=160).pack(padx=16, anchor="w")
        tk.Frame(self.sidebar, height=1, bg=BORDER).pack(fill="x", pady=14, padx=12)

        self.tab_btns = {}
        for k, lbl in [("phones",     "📱  Téléphones"),
                        ("stats",      "📊  Stats Instagram"),
                        ("automation", "🎬  Automatisation"),
                        ("bank",       "🗂  Banque vidéos"),
                        ("tools",      "🔧  Outils IA"),
                        ("settings",   "⚙  Paramètres")]:
            b = self._make_sidebar_btn(self.sidebar, lbl, k)
            b.pack(fill="x", pady=1)
            self.tab_btns[k] = b

        tk.Frame(self.sidebar, bg=SURFACE).pack(fill="both", expand=True)
        self.refresh_btn = tk.Button(self.sidebar, text="↺  Refresh",
            font=("Segoe UI", 10, "bold"), bg=ACCENT, fg="#06080f",
            relief="flat", cursor="hand2", activebackground=ACCENT2,
            pady=10, command=self._manual_refresh)
        self.refresh_btn.pack(fill="x", padx=12, pady=(0, 6))
        self.status_lbl = tk.Label(self.sidebar, text="—",
            font=("Consolas", 8), bg=SURFACE, fg=MUTED)
        self.status_lbl.pack(padx=12, pady=(0, 12))

        # Main frame content
        sf = tk.Frame(self.main_frame, bg=BG)
        sf.pack(fill="x", padx=14, pady=(14, 8))
        self.sv = {}
        for k, lbl, col in [("phones", "TÉLÉPHONES", ACCENT),
                             ("active", "IG ACTIFS",  OK),
                             ("banned", "BANNIS",      DANGER),
                             ("views",  "VUES TOTALES", WARN)]:
            f = tk.Frame(sf, bg=CARD, padx=14, pady=12)
            f.pack(side="left", fill="x", expand=True, padx=(0, 8))
            tk.Frame(f, height=2, bg=col).pack(fill="x", pady=(0, 8))
            tk.Label(f, text=lbl, font=("Consolas", 8), bg=CARD, fg=MUTED).pack(anchor="w")
            v = tk.Label(f, text="—", font=("Segoe UI", 22, "bold"), bg=CARD, fg=col)
            v.pack(anchor="w")
            self.sv[k] = v

        self.tab_container = tk.Frame(self.main_frame, bg=BG)
        self.tab_container.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        self.tabs = {}
        self._build_phones_tab()
        self._build_stats_tab()
        self._build_automation_tab()
        self._build_bank_tab()
        self._build_tools_tab()
        self._build_settings_tab()

    def _bind_mousewheel(self, widget, canvas):
        """Recursively bind mousewheel on widget and all descendants to scroll canvas."""
        widget.bind("<MouseWheel>",
                    lambda e: canvas.yview_scroll(int(-1*(e.delta/120)), "units"),
                    add="+")
        for child in widget.winfo_children():
            self._bind_mousewheel(child, canvas)

    def _make_sidebar_btn(self, parent, text, key):
        base_bg  = SURFACE
        hover_bg = HL
        base_fg  = TEXT2
        hover_fg = TEXT

        btn = tk.Button(parent, text=text, font=("Segoe UI", 10),
                        bg=base_bg, fg=base_fg, relief="flat", anchor="w",
                        padx=16, pady=10, cursor="hand2",
                        activebackground=HL,
                        command=lambda x=key: self._show_tab(x))

        def _lerp_color(c1, c2, t):
            r1, g1, b1 = parent.winfo_rgb(c1)
            r2, g2, b2 = parent.winfo_rgb(c2)
            r = int(r1 + (r2 - r1) * t) >> 8
            g = int(g1 + (g2 - g1) * t) >> 8
            b = int(b1 + (b2 - b1) * t) >> 8
            return f"#{r:02x}{g:02x}{b:02x}"

        _anim = [0]

        def _animate_in():
            _anim[0] = min(_anim[0] + 1, 5)
            t = _anim[0] / 5
            if btn.winfo_exists():
                btn.config(bg=_lerp_color(base_bg, hover_bg, t),
                           fg=_lerp_color(base_fg, hover_fg, t))
            if _anim[0] < 5:
                btn.after(20, _animate_in)

        def _animate_out():
            key_active = getattr(self, '_active_tab', '')
            if self.tab_btns.get(key) is btn and key == key_active:
                return
            _anim[0] = max(_anim[0] - 1, 0)
            t = _anim[0] / 5
            if btn.winfo_exists():
                btn.config(bg=_lerp_color(base_bg, hover_bg, t),
                           fg=_lerp_color(base_fg, hover_fg, t))
            if _anim[0] > 0:
                btn.after(20, _animate_out)

        btn.bind("<Enter>", lambda e: (_anim.__setitem__(0, _anim[0]), _animate_in()))
        btn.bind("<Leave>", lambda e: _animate_out())
        return btn

    def _show_tab(self, key):
        self._active_tab = key
        for k, b in self.tab_btns.items():
            active = k == key
            b.config(bg=HL if active else SURFACE,
                     fg=ACCENT if active else TEXT2,
                     font=("Segoe UI", 10, "bold") if active else ("Segoe UI", 10))
        for k, frame in self.tabs.items():
            if k == key:
                frame.place(x=0, y=0, relwidth=1, relheight=1)
                frame.lift()
                frame.attributes = getattr(frame, 'attributes', {})
            else:
                frame.place_forget()
        if key == "stats":
            self._refresh_ig_list()
        if key == "bank":
            self._refresh_bank()
        if key == "automation":
            self._refresh_auto_phones()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET TÉLÉPHONES
    # ══════════════════════════════════════════════════════════════════════════
    def _build_phones_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["phones"] = f

        tb1 = tk.Frame(f, bg=BG)
        tb1.pack(fill="x", pady=(0, 4))
        tk.Label(tb1, text="Groupe :", font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(side="left")
        self.grp_var = tk.StringVar(value="Tous")
        self.grp_combo = ttk.Combobox(tb1, textvariable=self.grp_var,
                                       state="readonly", width=22, font=("Segoe UI", 10))
        self.grp_combo["values"] = ["Tous"]
        self.grp_combo.pack(side="left", padx=(4, 12))
        self.grp_combo.bind("<<ComboboxSelected>>", lambda e: self._refresh_table())
        tk.Label(tb1, text="Recherche :", font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace("w", lambda *a: self._refresh_table())
        tk.Entry(tb1, textvariable=self.search_var, font=("Consolas", 10),
                 bg=SURFACE2, fg=TEXT, insertbackground=TEXT, relief="flat", bd=0,
                 highlightthickness=1, highlightcolor=ACCENT, highlightbackground=BORDER,
                 width=20).pack(side="left", padx=(4, 0), ipady=4)
        self.sel_lbl = tk.Label(tb1, text="", font=("Segoe UI", 9), bg=BG, fg=MUTED)
        self.sel_lbl.pack(side="right")

        tb2 = tk.Frame(f, bg=BG)
        tb2.pack(fill="x", pady=(0, 8))
        tk.Label(tb2, text="@Username IG :", font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(side="left")
        self.link_var = tk.StringVar()
        tk.Entry(tb2, textvariable=self.link_var, font=("Consolas", 10),
                 bg=SURFACE2, fg=TEXT, insertbackground=TEXT, relief="flat", bd=0,
                 highlightthickness=1, highlightcolor=ACCENT, highlightbackground=BORDER,
                 width=24).pack(side="left", padx=(4, 6), ipady=4)
        tk.Button(tb2, text="✓ Lier", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  padx=10, pady=4, command=self._link).pack(side="left", padx=2)
        tk.Button(tb2, text="✗ Délier", font=("Segoe UI", 10),
                  bg=SURFACE2, fg=DANGER, relief="flat", cursor="hand2",
                  padx=8, pady=4, command=self._unlink).pack(side="left", padx=2)
        tk.Button(tb2, text="📊 Scraper sélectionnés", font=("Segoe UI", 10),
                  bg=SURFACE2, fg=OK, relief="flat", cursor="hand2", padx=8, pady=4,
                  command=lambda: threading.Thread(
                      target=self._scrape_sel, daemon=True).start()).pack(side="left", padx=6)

        cols = ("no", "name", "group", "ig", "status", "followers", "views", "vids", "checked")
        self.tree = ttk.Treeview(f, columns=cols, show="headings",
                                  style="T.Treeview", selectmode="extended")
        for col, head, w in [
            ("no",       "#",          45),
            ("name",     "Téléphone",  170),
            ("group",    "Groupe",     150),
            ("ig",       "@Instagram", 150),
            ("status",   "Statut",     120),
            ("followers","Followers",  100),
            ("views",    "Vues",       90),
            ("vids",     "Vidéos",     70),
            ("checked",  "Vérifié",    110),
        ]:
            self.tree.heading(col, text=head)
            self.tree.column(col, width=w, anchor="center")
        self.tree.tag_configure("active", foreground=OK)
        self.tree.tag_configure("banned", foreground=DANGER)
        self.tree.tag_configure("error",  foreground=WARN)
        self.tree.tag_configure("noig",   foreground=MUTED)
        self.tree.bind("<<TreeviewSelect>>", self._on_sel)
        self.tree.bind("<Double-1>", self._on_dbl)
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

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET STATS
    # ══════════════════════════════════════════════════════════════════════════
    def _build_stats_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["stats"] = f

        left = tk.Frame(f, bg=SURFACE, width=220)
        left.pack(side="left", fill="y", padx=(0, 12))
        left.pack_propagate(False)
        tk.Label(left, text="COMPTES LIÉS", font=("Consolas", 8, "bold"),
                 bg=SURFACE, fg=MUTED).pack(anchor="w", padx=12, pady=(12, 6))
        self.ig_list = tk.Listbox(left, bg=SURFACE, fg=TEXT, selectbackground=HL,
                                   selectforeground=ACCENT, relief="flat", bd=0,
                                   font=("Segoe UI", 10), activestyle="none", cursor="hand2")
        self.ig_list.pack(fill="both", expand=True, padx=4, pady=(0, 4))
        self.ig_list.bind("<<ListboxSelect>>", lambda e: self._on_ig_list_sel())

        right = tk.Frame(f, bg=BG)
        right.pack(side="left", fill="both", expand=True)
        hdr = tk.Frame(right, bg=CARD)
        hdr.pack(fill="x", pady=(0, 10))
        self.det_name = tk.Label(hdr, text="Sélectionne un compte",
                                  font=("Segoe UI", 14, "bold"), bg=CARD, fg=TEXT)
        self.det_name.pack(side="left", padx=16, pady=14)
        self.det_status = tk.Label(hdr, text="", font=("Segoe UI", 10), bg=CARD, fg=TEXT2)
        self.det_status.pack(side="left")

        kf = tk.Frame(right, bg=BG)
        kf.pack(fill="x", pady=(0, 10))
        self.kpis = {}
        for k, lbl, col in [("followers", "FOLLOWERS", ACCENT),
                             ("following", "FOLLOWING", TEXT2),
                             ("posts",     "POSTS",     TEXT2),
                             ("views",     "VUES",      WARN)]:
            kcard = tk.Frame(kf, bg=CARD, padx=12, pady=10)
            kcard.pack(side="left", fill="x", expand=True, padx=(0, 8))
            tk.Label(kcard, text=lbl, font=("Consolas", 8), bg=CARD, fg=MUTED).pack(anchor="w")
            v = tk.Label(kcard, text="—", font=("Segoe UI", 18, "bold"), bg=CARD, fg=col)
            v.pack(anchor="w")
            self.kpis[k] = v

        tk.Label(right, text="VIDÉOS", font=("Consolas", 8, "bold"),
                 bg=BG, fg=MUTED).pack(anchor="w", pady=(0, 6))
        vcols = ("id", "views", "likes", "comments", "caption")
        self.vid_tree = ttk.Treeview(right, columns=vcols, show="headings",
                                      style="Vid.Treeview", height=14)
        for col, head, w, anch in [
            ("id",       "Shortcode",  120, "center"),
            ("views",    "Vues",       90,  "center"),
            ("likes",    "Likes",      80,  "center"),
            ("comments", "Comments",   100, "center"),
            ("caption",  "Caption",    600, "w"),
        ]:
            self.vid_tree.heading(col, text=head)
            self.vid_tree.column(col, width=w, anchor=anch)
        vsb2 = ttk.Scrollbar(right, orient="vertical", command=self.vid_tree.yview)
        self.vid_tree.configure(yscrollcommand=vsb2.set)
        self.vid_tree.pack(side="left", fill="both", expand=True)
        vsb2.pack(side="right", fill="y")

    def _on_ig_list_sel(self):
        sel = self.ig_list.curselection()
        if not sel:
            return
        raw = self.ig_list.get(sel[0])
        username = raw.split("@")[-1].strip()
        for pid, d in self.data.items():
            if d.get("ig_username") == username:
                self._show_ig_detail(pid)
                break

    def _show_ig_detail(self, pid):
        d = self.data.get(pid, {})
        st = d.get("ig_status", "")
        fn = d.get("full_name", "")
        ig = d.get("ig_username", "")
        self.det_name.config(text=f"@{ig}" + (f"  ·  {fn}" if fn else ""))
        st_map = {"active": "✅ Actif", "banned": "❌ Banni",
                  "private": "🔒 Privé", "error": "⚠ Erreur"}
        col_map = {"active": OK, "banned": DANGER, "private": WARN, "error": WARN}
        self.det_status.config(text=st_map.get(st, "—"), fg=col_map.get(st, MUTED))
        self.kpis["followers"].config(text=fmt(d.get("followers", 0)))
        self.kpis["following"].config(text=fmt(d.get("following", 0)))
        self.kpis["posts"].config(text=str(d.get("posts_count", 0)))
        self.kpis["views"].config(
            text=fmt(sum(v.get("views", 0) for v in d.get("videos", []))))
        self.vid_tree.delete(*self.vid_tree.get_children())
        for v in d.get("videos", []):
            self.vid_tree.insert("", "end", values=(
                v.get("id", ""),
                fmt(v.get("views", 0)),
                fmt(v.get("likes", 0)),
                fmt(v.get("comments", 0)),
                v.get("caption", ""),
            ))

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

        tk.Label(left, text="🎬 Montage vidéo", font=("Segoe UI", 12, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w", padx=2, pady=(8, 6))

        # ── Section 1 : Vidéos source ────────────────────────────────────────
        vs = self._collapsible(left, "VIDÉOS SOURCE", open_by_default=True)
        vtop = tk.Frame(vs, bg=CARD)
        vtop.pack(fill="x", pady=(0, 8))
        tk.Button(vtop, text="+ Ajouter vidéos",
                  font=("Segoe UI", 9, "bold"), bg=ACCENT, fg="#06080f",
                  relief="flat", cursor="hand2", padx=8, pady=4,
                  command=self._add_videos).pack(side="left")
        tk.Button(vtop, text="Vider",
                  font=("Segoe UI", 9), bg=SURFACE2, fg=DANGER,
                  relief="flat", cursor="hand2", padx=6, pady=4,
                  command=self._clear_videos).pack(side="left", padx=(6, 0))

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

        self.process_btn = tk.Button(
            btn_area, text="✂  Traiter & Exporter la vidéo sélectionnée",
            font=("Segoe UI", 11, "bold"), bg=ACCENT, fg="#06080f",
            relief="flat", cursor="hand2", pady=12,
            command=lambda: threading.Thread(
                target=self._process_video, daemon=True).start())
        self.process_btn.pack(fill="x", pady=(0, 5))

        tk.Button(
            btn_area, text="⚡  Exporter toutes les vidéos en parallèle",
            font=("Segoe UI", 10, "bold"), bg=HL, fg=TEXT,
            relief="flat", cursor="hand2", pady=10,
            command=lambda: threading.Thread(
                target=self._batch_export, daemon=True).start()).pack(fill="x", pady=(0, 5))

        self.process_status = tk.Label(btn_area, text="", font=("Segoe UI", 9),
                                        bg=BG, fg=TEXT2, wraplength=380)
        self.process_status.pack(fill="x")

        tk.Button(
            btn_area, text="🚀  Poster sur les téléphones",
            font=("Segoe UI", 10, "bold"), bg=SURFACE2, fg=ACCENT,
            relief="flat", cursor="hand2", pady=9,
            command=self._open_post_window).pack(fill="x", pady=(5, 0))

        # Compatible caption_text (banque)
        self.caption_text = tk.Text(btn_area, height=1)
        self.caption_text.pack_forget()

        # ── Panneau droit : aperçu ───────────────────────────────────────────
        right = tk.Frame(f, bg=CARD)
        right.pack(side="left", fill="both", expand=True, padx=(10, 0))
        tk.Label(right, text="APERÇU EN DIRECT", font=("Consolas", 8, "bold"),
                 bg=CARD, fg=MUTED).pack(anchor="w", padx=14, pady=(12, 6))
        self.preview_canvas = tk.Canvas(right, bg="#000", highlightthickness=0)
        self.preview_canvas.pack(fill="both", expand=True, padx=14, pady=(0, 4))
        self.preview_canvas.bind("<Button-1>",        self._preview_click)
        self.preview_canvas.bind("<B1-Motion>",       self._preview_drag)
        self.preview_canvas.bind("<ButtonRelease-1>", self._preview_release)
        self.preview_img_ref = None
        tk.Label(right, text="✦ Glisse le texte · Snap magnétique au centre (±3%)",
                 font=("Segoe UI", 8), bg=CARD, fg=MUTED).pack(pady=(0, 4))
        self.auto_log = scrolledtext.ScrolledText(right, bg=SURFACE, fg=TEXT2,
                                                   font=("Consolas", 9), relief="flat",
                                                   state="disabled", wrap="word", height=5)
        self.auto_log.pack(fill="x", padx=14, pady=(0, 10))

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
        self._schedule_preview()

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
        try:
            subprocess.run([ffmpeg, "-y", "-ss", "00:00:02", "-i", src,
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

        if overlay_png:
            # complex filtergraph
            vf_chain = ",".join(f for f in filters[1:]) if len(filters) > 1 else ""
            if vf_chain:
                fg = f"{filters[0]},{vf_chain}"
            else:
                fg = filters[0]
            if abs(speed - 1.0) > 0.001:
                af = f"atempo={speed}"
                cmd = [ffmpeg, "-y", "-i", src, "-i", overlay_png,
                       "-filter_complex", fg,
                       "-af", af, "-c:v", "libx264", "-preset", "fast", str(out_path)]
            else:
                cmd = [ffmpeg, "-y", "-i", src, "-i", overlay_png,
                       "-filter_complex", fg,
                       "-c:a", "copy", "-c:v", "libx264", "-preset", "fast", str(out_path)]
        else:
            vf = filters[0]
            if abs(speed - 1.0) > 0.001:
                af = f"atempo={speed}"
                cmd = [ffmpeg, "-y", "-i", src, "-vf", vf, "-af", af,
                       "-c:v", "libx264", "-preset", "fast", str(out_path)]
            else:
                cmd = [ffmpeg, "-y", "-i", src, "-vf", vf,
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
        win = tk.Toplevel(self.root)
        win.title("🚀 Poster")
        win.geometry("680x680")
        win.configure(bg=BG)
        tk.Label(win, text="🚀 Poster sur les téléphones",
                 font=("Segoe UI", 13, "bold"), bg=BG, fg=ACCENT).pack(
                     anchor="w", padx=20, pady=(20, 4))
        tk.Label(win, text=f"Vidéo : {Path(video_path).name}",
                 font=("Segoe UI", 9), bg=BG, fg=TEXT2).pack(anchor="w", padx=20)

        ff = tk.Frame(win, bg=BG)
        ff.pack(fill="x", padx=20, pady=(10, 6))
        tk.Label(ff, text="Groupe :", font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(side="left")
        grp2 = tk.StringVar(value="Tous")
        groups = set(d.get("group_name", "") for d in self.data.values()
                     if d.get("group_name"))
        gc2 = ttk.Combobox(ff, textvariable=grp2, state="readonly",
                            width=20, font=("Segoe UI", 10))
        gc2["values"] = ["Tous"] + sorted(groups)
        gc2.pack(side="left", padx=(4, 12))

        pv2 = {}
        lf  = tk.Frame(win, bg=SURFACE)
        lf.pack(fill="both", expand=True, padx=20, pady=(0, 8))
        cv2 = tk.Canvas(lf, bg=SURFACE, highlightthickness=0)
        cv2.pack(side="left", fill="both", expand=True)
        sv2 = ttk.Scrollbar(lf, orient="vertical", command=cv2.yview)
        sv2.pack(side="right", fill="y")
        cv2.configure(yscrollcommand=sv2.set)
        inner2 = tk.Frame(cv2, bg=SURFACE)
        cv2.create_window((0, 0), window=inner2, anchor="nw")
        inner2.bind("<Configure>", lambda e: cv2.configure(scrollregion=cv2.bbox("all")))

        def populate(g="Tous"):
            for w in inner2.winfo_children():
                w.destroy()
            pv2.clear()
            for pid, d in sorted(self.data.items(),
                                  key=lambda x: int(x[1].get("serial_no", 0) or 0)):
                if not d.get("phone_name"):
                    continue
                if g != "Tous" and d.get("group_name", "") != g:
                    continue
                var = tk.BooleanVar()
                pv2[pid] = var
                row = tk.Frame(inner2, bg=SURFACE)
                row.pack(fill="x", padx=8, pady=2)
                tk.Checkbutton(row, variable=var, bg=SURFACE,
                               activebackground=SURFACE, selectcolor=SURFACE2).pack(side="left")
                ig  = d.get("ig_username", "")
                lbl = (f"#{d.get('serial_no','')}  {d.get('phone_name', pid)}"
                       f"  [{d.get('group_name','')}]")
                if ig:
                    lbl += f"  →  @{ig}"
                tk.Label(row, text=lbl, font=("Segoe UI", 10), bg=SURFACE,
                         fg=OK if ig else MUTED, anchor="w").pack(side="left", padx=4)
        populate()
        gc2.bind("<<ComboboxSelected>>", lambda e: populate(grp2.get()))

        bf = tk.Frame(win, bg=BG)
        bf.pack(fill="x", padx=20, pady=(0, 8))
        tk.Button(bf, text="Tout sélectionner", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=8, pady=4,
                  command=lambda: [v.set(True) for v in pv2.values()]).pack(side="left")
        tk.Button(bf, text="Tout désélectionner", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=8, pady=4,
                  command=lambda: [v.set(False) for v in pv2.values()]).pack(
                      side="left", padx=6)

        plog_box = scrolledtext.ScrolledText(win, bg=SURFACE, fg=TEXT2,
                                              font=("Consolas", 9), relief="flat",
                                              state="disabled", wrap="word", height=6)
        plog_box.pack(fill="x", padx=20, pady=(0, 8))

        def plog(msg, lv="info"):
            colors = {"info": TEXT2, "ok": OK, "warn": WARN, "error": DANGER, "accent": ACCENT}
            plog_box.config(state="normal")
            plog_box.insert("end", f"{msg}\n", lv)
            plog_box.tag_config(lv, foreground=colors.get(lv, TEXT2))
            plog_box.see("end")
            plog_box.config(state="disabled")

        def do_post():
            sel = [pid for pid, v in pv2.items() if v.get()]
            if not sel:
                plog("⚠ Sélectionne au moins un téléphone", "warn")
                return
            bearer = self.cfg.get("bearer_token", "")
            threading.Thread(
                target=self._upload_and_post,
                args=(sel, bearer, caption, video_path, plog),
                daemon=True).start()

        tk.Button(win, text="🚀  Lancer le posting",
                  font=("Segoe UI", 12, "bold"), bg=ACCENT, fg="#06080f",
                  relief="flat", cursor="hand2", pady=10,
                  command=do_post).pack(fill="x", padx=20, pady=(0, 16))

    def _upload_and_post(self, selected, bearer, caption, video_path, log_fn):
        hdrs = {"Content-Type": "application/json",
                "Authorization": f"Bearer {bearer}"}
        log_fn("📤 Upload vidéo...", "accent")
        try:
            r = httpx.post(
                "https://openapi.geelark.com/open/v1/file/getUploadUrl",
                json={"fileName": Path(video_path).name, "fileType": "video"},
                headers=hdrs, timeout=20)
            rj = r.json()
            if rj.get("code") != 0:
                log_fn(f"❌ {rj.get('msg')}", "error")
                return
            with open(video_path, "rb") as fl:
                up = httpx.put(rj["data"]["uploadUrl"], content=fl.read(), timeout=180)
            if up.status_code not in (200, 204):
                log_fn(f"❌ Upload HTTP {up.status_code}", "error")
                return
            log_fn("✅ Uploadé", "ok")
            file_key = rj["data"]["fileKey"]
        except Exception as e:
            log_fn(f"❌ {e}", "error")
            return
        for pid in selected:
            name = self.data.get(pid, {}).get("phone_name", pid)
            try:
                r = httpx.post(
                    "https://openapi.geelark.com/open/v1/file/uploadToPhone",
                    json={"id": pid, "fileKey": file_key},
                    headers=hdrs, timeout=30)
                rj = r.json()
                log_fn(f"{'✅' if rj.get('code')==0 else '⚠'} {name}",
                       "ok" if rj.get("code") == 0 else "warn")
            except Exception as e:
                log_fn(f"❌ {name}: {e}", "error")
            time.sleep(1)
        log_fn("Terminé ✓", "ok")

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET BANQUE
    # ══════════════════════════════════════════════════════════════════════════
    def _build_bank_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["bank"] = f

        tb = tk.Frame(f, bg=BG)
        tb.pack(fill="x", pady=(0, 8))
        tk.Label(tb, text="🗂  Banque de vidéos", font=("Segoe UI", 13, "bold"),
                 bg=BG, fg=TEXT).pack(side="left")
        tk.Button(tb, text="📂 Dossier export", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2", padx=8, pady=4,
                  command=self._choose_export_dir).pack(side="right")
        tk.Button(tb, text="↺", font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", padx=8, pady=4,
                  command=self._refresh_bank).pack(side="right", padx=(0, 4))
        self.export_dir_lbl = tk.Label(
            tb, text=f"Export : {self.cfg.get('export_dir','Même dossier')}",
            font=("Segoe UI", 9), bg=BG, fg=MUTED)
        self.export_dir_lbl.pack(side="left", padx=(12, 0))

        split = tk.Frame(f, bg=BG)
        split.pack(fill="both", expand=True)

        # Gauche : liste
        lw = tk.Frame(split, bg=BG, width=420)
        lw.pack(side="left", fill="y")
        lw.pack_propagate(False)

        cols = ("filename", "overlay", "size", "created")
        self.bank_tree = ttk.Treeview(lw, columns=cols, show="headings",
                                       style="Bank.Treeview", selectmode="extended")
        for col, head, w in [("filename", "Fichier", 160), ("overlay", "Texte", 140),
                              ("size", "Taille", 60),       ("created", "Date", 80)]:
            self.bank_tree.heading(col, text=head)
            self.bank_tree.column(col, width=w,
                                  anchor="w" if col in ("filename", "overlay") else "center")
        self.bank_tree.tag_configure("exists",  foreground=TEXT)
        self.bank_tree.tag_configure("missing", foreground=MUTED)
        vsb = ttk.Scrollbar(lw, orient="vertical", command=self.bank_tree.yview)
        self.bank_tree.configure(yscrollcommand=vsb.set)
        self.bank_tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")
        self.bank_tree.bind("<<TreeviewSelect>>", self._on_bank_sel)

        acts = tk.Frame(f, bg=BG)
        acts.pack(fill="x", pady=(6, 0))
        for txt, col, cmd in [
            ("📥 Ouvrir",        TEXT2, self._bank_open),
            ("⬇ Télécharger",   TEXT2, self._bank_download),
            ("🔀 Randomiser méta", WARN, lambda: threading.Thread(
                target=self._randomize_meta, daemon=True).start()),
            ("🚀 Poster",        ACCENT, self._post_from_bank),
            ("🗑 Supprimer",     DANGER, self._bank_delete),
        ]:
            tk.Button(acts, text=txt,
                      font=("Segoe UI", 9, "bold" if "Poster" in txt else "normal"),
                      bg=ACCENT if "Poster" in txt else SURFACE2,
                      fg="#06080f" if "Poster" in txt else col,
                      relief="flat", cursor="hand2", padx=8, pady=5,
                      command=cmd).pack(side="left", padx=(0, 4))
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
        self.gen_btn = tk.Button(dh, text="✨ Générer (Groq — gratuit)",
                                  font=("Segoe UI", 9, "bold"), bg=ACCENT, fg="#06080f",
                                  relief="flat", cursor="hand2", padx=10, pady=3,
                                  command=lambda: threading.Thread(
                                      target=self._generate_desc, daemon=True).start())
        self.gen_btn.pack(side="right")

        self.desc_box = tk.Text(right, font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT,
                                 insertbackground=TEXT, relief="flat", bd=0, height=9,
                                 highlightthickness=1, highlightcolor=ACCENT,
                                 highlightbackground=BORDER, wrap="word", padx=8, pady=8)
        self.desc_box.pack(fill="x", padx=14, pady=(0, 6))

        br = tk.Frame(right, bg=CARD)
        br.pack(fill="x", padx=14, pady=(0, 10))
        tk.Button(br, text="💾 Sauvegarder", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                  padx=8, pady=4, command=self._save_desc).pack(side="left")
        tk.Button(br, text="📋 Copier", font=("Segoe UI", 9),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                  padx=8, pady=4, command=self._copy_desc).pack(side="left", padx=(6, 0))
        self.desc_status = tk.Label(br, text="", font=("Segoe UI", 9), bg=CARD, fg=TEXT2)
        self.desc_status.pack(side="left", padx=10)

    def _on_bank_sel(self, e):
        sel = self.bank_tree.selection()
        if not sel:
            return
        self._bank_selected = sel[0]
        bank = load_bank()
        entry = next((b for b in bank if b["id"] == self._bank_selected), None)
        if not entry:
            return
        self.desc_box.delete("1.0", "end")
        if entry.get("description"):
            self.desc_box.insert("1.0", entry["description"])
        self.desc_status.config(text="")
        threading.Thread(target=self._load_bank_preview, args=(entry,), daemon=True).start()

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
        self.bank_tree.delete(*self.bank_tree.get_children())
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
        for e in bank:
            exists = Path(e.get("path", "")).exists()
            ts = e.get("created", "")
            try:
                ts = datetime.fromisoformat(ts).strftime("%d/%m %H:%M")
            except:
                pass
            self.bank_tree.insert("", "end", iid=e["id"],
                tags=("exists" if exists else "missing",),
                values=(e.get("filename", ""), e.get("overlay", "—"),
                        f"{e.get('size_mb',0)}Mo", ts))
        self.bank_status.config(text=f"{len(bank)} vidéo(s)", fg=TEXT2)

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
        caption = entry.get("description") or entry.get("caption") or ""
        self._post_window(entry["path"], caption)

    def _bank_delete(self):
        sels = self.bank_tree.selection()
        if not sels:
            return
        if not messagebox.askyesno(
                "Supprimer",
                f"Supprimer {len(sels)} vidéo(s) de la banque ?\n(fichiers conservés sur disque)"):
            return
        bank = [b for b in load_bank() if b["id"] not in sels]
        save_bank(bank)
        self._bank_selected = None
        self._refresh_bank()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET OUTILS IA
    # ══════════════════════════════════════════════════════════════════════════
    def _build_tools_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["tools"] = f

        tk.Label(f, text="🔧  Outils IA", font=("Segoe UI", 16, "bold"),
                 bg=BG, fg=TEXT).pack(anchor="w", padx=60, pady=(28, 4))
        tk.Label(f, text="Outils alimentés par l'IA pour gérer vos comptes Instagram",
                 font=("Segoe UI", 10), bg=BG, fg=TEXT2).pack(anchor="w", padx=60, pady=(0, 20))

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

        PAD = 60

        def card(title, subtitle=""):
            c = tk.Frame(inner_t, bg=CARD, padx=20, pady=16)
            c.pack(fill="x", padx=PAD, pady=8)
            hdr = tk.Frame(c, bg=CARD)
            hdr.pack(fill="x", pady=(0, 6))
            tk.Label(hdr, text=title, font=("Segoe UI", 12, "bold"),
                     bg=CARD, fg=TEXT).pack(side="left")
            if subtitle:
                tk.Label(hdr, text=subtitle, font=("Segoe UI", 9),
                         bg=CARD, fg=TEXT2).pack(side="left", padx=(10, 0))
            return c

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

        tk.Button(c3, text="🔍 Analyser", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  padx=16, pady=6, command=analyze_competitor).pack(anchor="w")

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
        tk.Button(bf4, text="✨ Générer", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  padx=16, pady=6, command=gen_caption).pack(side="left")
        tk.Button(bf4, text="📋 Copier", font=("Segoe UI", 10),
                  bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                  padx=12, pady=6, command=lambda: _copy_widget(cap_result)).pack(
                      side="left", padx=(8, 0))

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

        tk.Button(c5, text="📅 Générer le planning", font=("Segoe UI", 10, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  padx=16, pady=6, command=gen_plan).pack(anchor="w")

        # Bottom padding
        tk.Frame(inner_t, bg=BG, height=40).pack()

    # ══════════════════════════════════════════════════════════════════════════
    # ONGLET PARAMÈTRES
    # ══════════════════════════════════════════════════════════════════════════
    def _build_settings_tab(self):
        f = tk.Frame(self.tab_container, bg=BG)
        self.tabs["settings"] = f

        # Sub-tab nav
        nav = tk.Frame(f, bg=BG)
        nav.pack(fill="x", padx=60, pady=(20, 0))

        self._settings_panels = {}
        self._settings_nav_btns = {}

        panel_host = tk.Frame(f, bg=BG)
        panel_host.pack(fill="x", padx=60, pady=(0, 12))

        def show_settings_panel(name):
            for k, p in self._settings_panels.items():
                p.pack_forget()
            for k, b in self._settings_nav_btns.items():
                b.config(bg=SURFACE2, fg=TEXT2)
            self._settings_panels[name].pack(fill="x")
            self._settings_nav_btns[name].config(bg=ACCENT, fg="#06080f")

        for tab_name in ("Profil", "Connexions", "API Keys", "Apparence"):
            b = tk.Button(nav, text=tab_name, font=("Segoe UI", 10, "bold"),
                          bg=SURFACE2, fg=TEXT2, relief="flat", cursor="hand2",
                          padx=16, pady=7,
                          command=lambda n=tab_name: show_settings_panel(n))
            b.pack(side="left", padx=(0, 4))
            self._settings_nav_btns[tab_name] = b
            panel = tk.Frame(panel_host, bg=CARD, padx=24, pady=24)
            self._settings_panels[tab_name] = panel

        # --- Profil panel ---
        prof = self._settings_panels["Profil"]
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

        tk.Button(prof, text="💾 Sauvegarder le profil", font=("Segoe UI", 11, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  pady=8, command=_save_profile).pack(fill="x", pady=(16, 0))

        # --- Connexions panel ---
        conn = self._settings_panels["Connexions"]
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
        tk.Button(btn_row, text="💾 Sauvegarder", font=("Segoe UI", 11, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  pady=8, command=self._save_settings).pack(side="left", fill="x", expand=True)
        tk.Button(btn_row, text="🔌 Tester proxy + IG",
                  font=("Segoe UI", 10), bg=SURFACE2, fg=TEXT2,
                  relief="flat", cursor="hand2", pady=8,
                  command=self._test_proxy).pack(side="left", fill="x", expand=True, padx=(8, 0))

        # --- API Keys panel ---
        api = self._settings_panels["API Keys"]
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

        tk.Button(api, text="Sauvegarder", font=("Segoe UI", 11, "bold"),
                  bg=ACCENT, fg="#06080f", relief="flat", cursor="hand2",
                  pady=8, command=self._save_settings).pack(fill="x", pady=(16, 0))

        # --- Apparence panel ---
        app_pan = self._settings_panels["Apparence"]
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

        # Show first panel by default
        show_settings_panel("Profil")

        # Logs always at bottom
        tk.Label(f, text="LOGS", font=("Consolas", 9, "bold"),
                 bg=BG, fg=MUTED).pack(anchor="w", padx=60, pady=(8, 4))
        self.log_box = scrolledtext.ScrolledText(
            f, bg=SURFACE, fg=TEXT2, font=("Consolas", 9),
            relief="flat", state="disabled", wrap="word", height=14)
        self.log_box.pack(fill="both", expand=True, padx=60, pady=(0, 14))

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
        grp  = self.grp_var.get()
        srch = self.search_var.get().lower().strip()
        total = active = banned = views = 0
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
            total += 1
            st = d.get("ig_status", "")
            if st == "active":
                active += 1
            if st == "banned":
                banned += 1
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
            self.tree.insert("", "end", iid=pid, tags=(tag,), values=(
                d.get("serial_no", ""),
                d.get("phone_name", pid),
                d.get("group_name", "—"),
                "@" + d["ig_username"] if d.get("ig_username") else "—",
                st_txt,
                fmt(d.get("followers", 0)) if st == "active" else "—",
                fmt(v),
                len(d.get("videos", [])),
                chk or "—",
            ))
            if pid in prev:
                self.tree.selection_add(pid)
        self.sv["phones"].config(text=str(total))
        self.sv["active"].config(text=str(active))
        self.sv["banned"].config(text=str(banned))
        self.sv["views"].config(text=fmt(views))

    def _refresh_ig_list(self):
        self.ig_list.delete(0, "end")
        for pid, d in self.data.items():
            if d.get("ig_username") and d.get("phone_name"):
                st = d.get("ig_status", "")
                p  = "✅ " if st == "active" else "❌ " if st == "banned" else "○ "
                self.ig_list.insert("end", p + "@" + d["ig_username"])

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
        d = self.data.get(pid, {})
        username = d.get("ig_username", "")
        if not username:
            return
        proxy     = self.cfg.get("proxy", "").strip() or None
        sessionid = self.cfg.get("ig_sessionid", "").strip() or None
        proxy_str = f" via proxy" if proxy else " (sans proxy)"
        sess_str  = " + sessionid" if sessionid else " (sans sessionid)"
        self.log(f"Scraping @{username}{proxy_str}{sess_str}...", "info")
        res = scrape_ig(username, proxy, sessionid)
        self.data[pid].update(res)
        self.data[pid]["last_checked"] = datetime.now().isoformat()
        save_data(self.data)
        st = res.get("ig_status")
        if st == "active":
            self.log(f"✅ @{username} — {fmt(res.get('followers',0))} followers", "ok")
        elif st == "banned":
            self.log(f"❌ @{username} — banni !", "error")
        elif st == "private":
            self.log(f"🔒 @{username} — privé ou sessionid invalide", "warn")
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
        while self.running:
            time.sleep(3600)
            if self.running:
                self._manual_refresh()


if __name__ == "__main__":
    LoginWindow()
