import json
import time
import hashlib
import uuid
import threading
import httpx
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

app = FastAPI(title="IG Tracker")

DATA_FILE = Path("data.json")

# ── GéeLark API credentials ─────────────────────────────────────────────────
GL_APP_ID  = "UPFA89AEZC4TYA7RKTBHTTWBSG"
GL_API_KEY = "5L9L1XDDAWVHBP78SI8LUKTMDVCD6X"
GL_BASE    = "https://open.geelark.com"

# ── Proxy SOCKS5 ─────────────────────────────────────────────────────────────
PROXY_URL = "socks5://mhqkcjgp:h0acxrpawty4@46.203.53.9:7509"

# ── GéeLark auth helper ──────────────────────────────────────────────────────

def gl_headers() -> dict:
    ts    = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex[:6]
    raw   = f"{GL_APP_ID}{ts}{nonce}{GL_API_KEY}"
    sign  = hashlib.sha256(raw.encode()).hexdigest().upper()
    return {
        "Content-Type": "application/json",
        "appId":   GL_APP_ID,
        "traceId": uuid.uuid4().hex,
        "ts":      ts,
        "nonce":   nonce,
        "sign":    sign,
    }

def gl_post(path: str, body: dict = {}) -> dict:
    r = httpx.post(f"{GL_BASE}{path}", json=body, headers=gl_headers(), timeout=20)
    return r.json()

# ── Données persistantes ─────────────────────────────────────────────────────

def load_data() -> dict:
    if DATA_FILE.exists():
        return json.loads(DATA_FILE.read_text())
    return {}

def save_data(data: dict):
    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))

# ── Fetch liste des téléphones GéeLark ──────────────────────────────────────

def fetch_phones() -> list:
    try:
        res = gl_post("/open/v1/phone/list", {"pageIndex": 1, "pageSize": 50})
        phones = res.get("data", {}).get("list") or res.get("data", [])
        return phones if isinstance(phones, list) else []
    except Exception as e:
        print(f"[GéeLark] Erreur fetch phones: {e}")
        return []

# ── Scraper Instagram via proxy ──────────────────────────────────────────────

IG_HEADERS = {
    "User-Agent": "Instagram 269.0.0.18.75 Android",
    "Accept-Language": "fr-FR,fr;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "X-IG-App-ID": "936619743392459",
}

def scrape_ig(username: str) -> dict:
    url = f"https://i.instagram.com/api/v1/users/web_profile_info/?username={username}"
    try:
        transport = httpx.HTTPTransport(proxy=PROXY_URL)
        with httpx.Client(transport=transport, headers=IG_HEADERS, timeout=20, follow_redirects=True) as client:
            r = client.get(url)
        if r.status_code == 404:
            return {"ig_status": "banned_or_deleted"}
        if r.status_code == 401:
            return {"ig_status": "private_or_restricted"}
        if r.status_code != 200:
            return {"ig_status": "error", "ig_error": f"HTTP {r.status_code}"}

        user = r.json().get("data", {}).get("user")
        if not user:
            return {"ig_status": "banned_or_deleted"}

        posts_raw = user.get("edge_owner_to_timeline_media", {})
        videos = []
        for edge in posts_raw.get("edges", []):
            node = edge.get("node", {})
            if node.get("is_video"):
                caption_edges = node.get("edge_media_to_caption", {}).get("edges", [])
                videos.append({
                    "id":       node.get("shortcode"),
                    "url":      f"https://www.instagram.com/reel/{node.get('shortcode')}/",
                    "thumbnail": node.get("thumbnail_src"),
                    "views":    node.get("video_view_count", 0),
                    "likes":    node.get("edge_liked_by", {}).get("count", 0),
                    "comments": node.get("edge_media_to_comment", {}).get("count", 0),
                    "timestamp": node.get("taken_at_timestamp"),
                    "caption":  caption_edges[0]["node"]["text"][:120] if caption_edges else "",
                })

        return {
            "ig_status":    "active",
            "ig_username":  user.get("username"),
            "full_name":    user.get("full_name"),
            "followers":    user.get("edge_followed_by", {}).get("count", 0),
            "following":    user.get("edge_follow", {}).get("count", 0),
            "posts_count":  posts_raw.get("count", 0),
            "is_private":   user.get("is_private", False),
            "is_verified":  user.get("is_verified", False),
            "profile_pic":  user.get("profile_pic_url_hd") or user.get("profile_pic_url"),
            "bio":          user.get("biography", ""),
            "videos":       videos[:20],
        }
    except httpx.TimeoutException:
        return {"ig_status": "error", "ig_error": "timeout"}
    except Exception as e:
        return {"ig_status": "error", "ig_error": str(e)}

# ── Refresh principal ────────────────────────────────────────────────────────

def refresh_all():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Démarrage refresh...")
    phones = fetch_phones()
    data   = load_data()

    if not phones:
        print("  Aucun téléphone GéeLark trouvé — vérifier les credentials API")
        save_data(data)
        return data

    print(f"  {len(phones)} téléphones GéeLark trouvés")

    for phone in phones:
        phone_id   = phone.get("id") or phone.get("phoneId") or phone.get("serialNo", "unknown")
        phone_name = phone.get("name") or phone.get("remark") or phone_id
        gl_status  = phone.get("status", "unknown")  # running / stopped / etc.

        # Tente de récupérer le username Instagram associé
        ig_username = (
            phone.get("remark") or
            phone.get("name") or
            data.get(phone_id, {}).get("ig_username") or
            ""
        ).strip().lstrip("@")

        entry = {
            "phone_id":   phone_id,
            "phone_name": phone_name,
            "gl_status":  gl_status,
            "ig_username": ig_username,
            "last_checked": datetime.now().isoformat(),
        }

        # Scrape Instagram si on a un username
        if ig_username:
            ig_data = scrape_ig(ig_username)
            entry.update(ig_data)
            prev_ig = data.get(phone_id, {}).get("ig_status")
            if ig_data.get("ig_status") in ("banned_or_deleted",) and prev_ig == "active":
                entry["alert"] = True
                entry.setdefault("alerts_history", []).append({
                    "type": "ban_detected",
                    "at": datetime.now().isoformat(),
                })
            time.sleep(2)

        data[phone_id] = entry
        print(f"  → {phone_name} ({phone_id}): GL={gl_status} | IG={entry.get('ig_status','no_username')}")

    save_data(data)
    return data

# ── Scheduler ─────────────────────────────────────────────────────────────────

def scheduler():
    while True:
        refresh_all()
        time.sleep(3600)

# ── Routes API ────────────────────────────────────────────────────────────────

@app.get("/api/accounts")
def get_accounts():
    return JSONResponse(load_data())

@app.get("/api/refresh")
def manual_refresh():
    data = refresh_all()
    return JSONResponse({"ok": True, "count": len(data), "data": data})

@app.post("/api/accounts/set-username")
async def set_username(body: dict):
    """Associe un username Instagram à un phone_id GéeLark."""
    phone_id = body.get("phone_id", "").strip()
    username = body.get("username", "").strip().lstrip("@")
    if not phone_id or not username:
        return JSONResponse({"error": "phone_id et username requis"}, status_code=400)
    data = load_data()
    if phone_id not in data:
        data[phone_id] = {}
    data[phone_id]["ig_username"] = username
    save_data(data)
    return JSONResponse({"ok": True})

@app.get("/", response_class=HTMLResponse)
def dashboard():
    return Path("templates/index.html").read_text()

# ── Démarrage ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    t = threading.Thread(target=scheduler, daemon=True)
    t.start()
    uvicorn.run(app, host="0.0.0.0", port=8000)
