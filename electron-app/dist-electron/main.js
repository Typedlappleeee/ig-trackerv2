"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const node_url = require("node:url");
const node_fs = require("node:fs");
const os = require("node:os");
const node_child_process = require("node:child_process");
const https = require("node:https");
const path = require("node:path");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const __dirname$1 = path.dirname(node_url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
process.env.APP_ROOT = path.join(__dirname$1, "..");
function getFfmpegBin() {
  const ext = process.platform === "win32" ? ".exe" : "";
  const bin = `ffmpeg${ext}`;
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, bin);
  }
  const appRoot = process.env.APP_ROOT ?? path.join(__dirname$1, "..");
  const candidates = [
    path.join(appRoot, "node_modules", "ffmpeg-static", bin),
    path.join(appRoot, "..", "node_modules", "ffmpeg-static", bin),
    path.join(__dirname$1, "..", "node_modules", "ffmpeg-static", bin)
  ];
  for (const p of candidates) {
    if (node_fs.existsSync(p)) {
      console.log("[ffmpeg] using:", p);
      return p;
    }
  }
  console.warn("[ffmpeg] binary not found in node_modules, falling back to PATH");
  return bin;
}
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
let win = null;
electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "localvideo",
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);
let _igBrowser = null;
function getIgBrowser() {
  if (!_igBrowser || _igBrowser.isDestroyed()) {
    _igBrowser = new electron.BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { nodeIntegration: false, contextIsolation: false, webSecurity: true, sandbox: false }
    });
    _igBrowser.webContents.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    _igBrowser.on("closed", () => {
      _igBrowser = null;
    });
  }
  return _igBrowser;
}
electron.ipcMain.handle("fetch-instagram-html", async (_event, username) => {
  const IG_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const IG_APP_ID = "936619743392459";
  const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`;
  async function getCsrf() {
    var _a, _b;
    const cookies = await electron.session.defaultSession.cookies.get({ domain: ".instagram.com" });
    return ((_a = cookies.find((c) => c.name === "csrftoken")) == null ? void 0 : _a.value) ?? ((_b = cookies.find((c) => c.name === "csrftoken")) == null ? void 0 : _b.value);
  }
  async function callApi(csrftoken) {
    try {
      const res = await electron.session.defaultSession.fetch(apiUrl, {
        headers: {
          "User-Agent": IG_UA,
          "X-IG-App-ID": IG_APP_ID,
          "X-CSRFToken": csrftoken,
          "Referer": profileUrl,
          "Origin": "https://www.instagram.com",
          "Accept": "*/*",
          "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
        }
      });
      console.log(`[IG] API ${username}: ${res.status}`);
      if (res.ok) return await res.json();
      if (res.status === 401 || res.status === 403) {
        const all = await electron.session.defaultSession.cookies.get({ domain: ".instagram.com" });
        await Promise.all(all.flatMap((c) => [
          electron.session.defaultSession.cookies.remove("https://www.instagram.com", c.name),
          electron.session.defaultSession.cookies.remove("https://instagram.com", c.name)
        ]));
      }
    } catch (e) {
      console.log("[IG] callApi error:", String(e));
    }
    return null;
  }
  let csrf = await getCsrf();
  if (csrf) {
    const json = await callApi(csrf);
    if (json) return { ok: true, apiJson: json };
  }
  console.log("[IG] No cookies — seeding via profile page fetch...");
  try {
    await electron.session.defaultSession.fetch(profileUrl, {
      headers: {
        "User-Agent": IG_UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br"
      },
      redirect: "follow"
    });
  } catch (e) {
    console.log("[IG] Seed fetch error:", String(e));
  }
  csrf = await getCsrf();
  if (csrf) {
    const json = await callApi(csrf);
    if (json) return { ok: true, apiJson: json };
  }
  console.log("[IG] Trying homepage seed...");
  try {
    await electron.session.defaultSession.fetch("https://www.instagram.com/", {
      headers: {
        "User-Agent": IG_UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"
      },
      redirect: "follow"
    });
  } catch (e) {
    console.log("[IG] Homepage seed error:", String(e));
  }
  csrf = await getCsrf();
  if (csrf) {
    const json = await callApi(csrf);
    if (json) return { ok: true, apiJson: json };
  }
  console.log("[IG] All fetch attempts failed — falling back to hidden browser");
  const browser = getIgBrowser();
  return new Promise((resolve) => {
    let settled = false;
    let loadCount = 0;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      browser.webContents.removeListener("did-stop-loading", onLoad);
      clearTimeout(globalTimer);
      resolve(result);
    };
    const globalTimer = setTimeout(() => finish({ ok: false, error: "timeout" }), 4e4);
    const tryApiThenHtml = async () => {
      if (settled || browser.isDestroyed()) return;
      const c = await getCsrf();
      if (c) {
        const json = await callApi(c);
        if (json) {
          finish({ ok: true, apiJson: json });
          return;
        }
      }
      try {
        const data = await browser.webContents.executeJavaScript(
          `({ url: location.href, html: document.documentElement.innerHTML.slice(0, 200000) })`
        );
        finish({ ok: true, ...data });
      } catch (e) {
        finish({ ok: false, error: String(e) });
      }
    };
    const onLoad = async () => {
      if (settled || browser.isDestroyed()) return;
      loadCount++;
      if (loadCount > 8) {
        finish({ ok: false, error: "too many navigations" });
        return;
      }
      await new Promise((r) => setTimeout(r, 2e3));
      if (settled || browser.isDestroyed()) return;
      const currentUrl = browser.webContents.getURL();
      if (currentUrl.includes("/accounts/login") || currentUrl.includes("/challenge/")) {
        finish({ ok: false, error: "login required" });
        return;
      }
      const accepted = await browser.webContents.executeJavaScript(`
        (() => {
          const byAttr = document.querySelector('[data-cookiebanner="accept_button"]')
            || document.querySelector('[data-testid="cookie-policy-manage-dialog-accept-button"]')
          if (byAttr) { byAttr.click(); return true }
          const btn = [...document.querySelectorAll('button')].find(b => {
            const t = (b.textContent || '').trim().toLowerCase()
            return ['allow all cookies','allow all','accept all','autoriser tout',
                    'tout accepter','autoriser tous les cookies',
                    'allow essential and optional cookies'].includes(t)
          })
          if (btn) { btn.click(); return true }
          return false
        })()
      `).catch(() => false);
      if (accepted) {
        await new Promise((r) => setTimeout(r, 4e3));
        if (settled) return;
        const afterUrl = browser.webContents.getURL();
        if (!afterUrl.includes(`/${username}`)) {
          browser.loadURL(profileUrl);
          return;
        }
      } else if (!currentUrl.includes(`/${username}`)) {
        browser.loadURL(profileUrl);
        return;
      }
      await tryApiThenHtml();
    };
    browser.webContents.on("did-stop-loading", onLoad);
    browser.loadURL(profileUrl, {
      extraHeaders: "Accept: text/html,application/xhtml+xml,*/*;q=0.8\r\nAccept-Language: fr-FR,fr;q=0.9\r\n"
    }).catch((err) => finish({ ok: false, error: String(err) }));
  });
});
const _csrfCache = /* @__PURE__ */ new Map();
function igSessionFetch(url, sessionid, method = "GET", body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const csrf = _csrfCache.get(sessionid);
    const cookie = csrf ? `sessionid=${sessionid}; csrftoken=${csrf}` : `sessionid=${sessionid}`;
    const reqOpts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "User-Agent": "Instagram 269.0.0.18.75 Android (28/9; 240dpi; 1080x1920; samsung; SM-G960F; starlte; qcom; en_US; 314665256)",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "198387",
        "Accept-Language": "fr-FR,fr;q=0.9",
        "Cookie": cookie,
        ...csrf ? { "X-CSRFToken": csrf } : {},
        ...extraHeaders ?? {},
        ...body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": String(Buffer.byteLength(body)) } : {}
      }
    };
    const req = https.request(reqOpts, (res) => {
      const chunks = [];
      const setCookieHeader = res.headers["set-cookie"] ?? [];
      for (const c of setCookieHeader) {
        const m = c.match(/csrftoken=([^;]+)/);
        if (m && m[1] && m[1] !== "missing") _csrfCache.set(sessionid, m[1]);
      }
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const raw = Buffer.concat(chunks).toString("utf-8");
          const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"');
          resolve({ status: res.statusCode ?? 0, data: JSON.parse(safe) });
        } catch {
          resolve({ status: res.statusCode ?? 0, data: null });
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(15e3, () => {
      req.destroy(new Error("timeout"));
    });
    if (body) req.write(body);
    req.end();
  });
}
function isSessionDead(status, data) {
  if (status === 401) return true;
  const d = data;
  if (!d) return false;
  const msg = String(d["message"] ?? "").toLowerCase();
  if (msg === "login_required") return true;
  if (msg === "checkpoint_required") return true;
  if (d["logout_reason"]) return true;
  return false;
}
electron.ipcMain.handle("fetch-instagram-by-session", async (_event, opts) => {
  var _a, _b, _c, _d, _e;
  try {
    let userId = null;
    const curR = await igSessionFetch("https://i.instagram.com/api/v1/accounts/current_user/", opts.sessionid);
    if (isSessionDead(curR.status, curR.data)) return { ok: false, error: "session_expired" };
    if (curR.status === 200 && curR.data) {
      userId = ((_a = curR.data["user"]) == null ? void 0 : _a["pk"]) ?? null;
    }
    if (!userId) {
      const profR = await igSessionFetch(
        `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(opts.username)}`,
        opts.sessionid
      );
      if (profR.status === 200 && profR.data) {
        const pUser = (_b = profR.data["data"]) == null ? void 0 : _b["user"];
        userId = (pUser == null ? void 0 : pUser["id"]) ?? null;
      }
    }
    if (!userId) return { ok: false, error: "could_not_get_user_id" };
    const infoR = await igSessionFetch(`https://i.instagram.com/api/v1/users/${userId}/info/`, opts.sessionid);
    let followers = 0, following = 0, posts = 0, bio = "";
    if (infoR.status === 200 && infoR.data) {
      const u = infoR.data["user"];
      if (u) {
        followers = u["follower_count"] ?? 0;
        following = u["following_count"] ?? 0;
        posts = u["media_count"] ?? 0;
        bio = u["biography"] ?? "";
      }
    }
    const clipsR = await igSessionFetch(
      "https://i.instagram.com/api/v1/clips/user/",
      opts.sessionid,
      "POST",
      `target_user_id=${userId}&page_size=20&include_feed_video=true`
    );
    const videos = [];
    if (clipsR.status === 200 && clipsR.data) {
      const items = clipsR.data["items"] ?? [];
      for (const item of items) {
        const media = item["media"];
        if (!media) continue;
        const candidates = ((_c = media["image_versions2"]) == null ? void 0 : _c["candidates"]) ?? [];
        const vVersions = media["video_versions"] ?? [];
        videos.push({
          id: String(media["pk"] ?? ""),
          shortcode: media["code"] ?? "",
          views: media["play_count"] ?? media["view_count"] ?? 0,
          likes: media["like_count"] ?? 0,
          comments: media["comment_count"] ?? 0,
          thumbnail: ((_d = candidates[0]) == null ? void 0 : _d["url"]) ?? "",
          video_url: ((_e = vVersions[0]) == null ? void 0 : _e["url"]) ?? "",
          timestamp: media["taken_at"] ? new Date(media["taken_at"] * 1e3).toISOString() : ""
        });
      }
    }
    let thumbOk = 0, thumbFail = 0;
    await Promise.all(videos.map(async (v) => {
      if (!v.thumbnail) {
        thumbFail++;
        return;
      }
      const url = v.thumbnail;
      const headerSets = [
        // 1. Browser-like, with Referer = instagram.com
        {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://www.instagram.com/",
          "sec-fetch-dest": "image",
          "sec-fetch-mode": "no-cors",
          "sec-fetch-site": "cross-site"
        },
        // 2. No Referer (CDN sometimes wants none)
        {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "image/*,*/*;q=0.8"
        },
        // 3. Mobile IG app UA
        {
          "User-Agent": "Instagram 312.0.0.32.116 Android (33/13; 420dpi; 1080x2206; samsung; SM-S911B; dm3q; qcom; en_US; 558678421)",
          "Accept": "image/*"
        }
      ];
      for (const headers of headerSets) {
        try {
          const res = await electron.net.fetch(url, { method: "GET", headers, redirect: "follow" });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 0) {
              const ct = res.headers.get("content-type") ?? "image/jpeg";
              v.thumbnail = `data:${ct};base64,${buf.toString("base64")}`;
              thumbOk++;
              return;
            }
          }
        } catch (e) {
        }
      }
      console.log("[thumb] all retries failed:", url.slice(0, 100));
      thumbFail++;
    }));
    console.log(`[fetch-instagram-by-session] thumbnails: ${thumbOk} ok, ${thumbFail} failed of ${videos.length}`);
    return {
      ok: true,
      username: opts.username,
      followers,
      following,
      posts,
      bio,
      total_views: videos.reduce((s, v) => s + v.views, 0),
      videos
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("geelark-request", async (_event, opts) => {
  try {
    const reqBody = opts.body ? JSON.stringify(opts.body) : void 0;
    let response;
    if (opts.url.includes("instagram.com")) {
      const igHeaders = { ...opts.headers };
      if (opts.body) igHeaders["Content-Type"] = "application/json";
      response = await electron.session.defaultSession.fetch(opts.url, {
        method: opts.method,
        headers: igHeaders,
        body: reqBody
      });
    } else {
      const { Referer: _r, referer: _r2, Origin: _o, origin: _o2, ...safeHeaders } = opts.headers ?? {};
      const reqHeaders = { "Content-Type": "application/json", ...safeHeaders };
      response = await electron.net.fetch(opts.url, {
        method: opts.method,
        headers: reqHeaders,
        body: reqBody,
        referrerPolicy: "no-referrer"
      });
    }
    let data;
    if (opts.isText) {
      data = await response.text();
    } else {
      const raw = await response.text();
      try {
        const safe = raw.replace(/:(\s*)(\d{16,})/g, ':$1"$2"');
        data = JSON.parse(safe);
      } catch {
        data = null;
      }
    }
    return { ok: true, status: response.status, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("pick-video-file", async () => {
  if (!win) return null;
  const result = await electron.dialog.showOpenDialog(win, {
    title: "Sélectionner une vidéo",
    filters: [{ name: "Vidéos", extensions: ["mp4", "mov", "avi", "mkv", "webm"] }],
    properties: ["openFile"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});
electron.ipcMain.handle("upload-video-geelark", async (_event, opts) => {
  try {
    const urlRes = await electron.net.fetch("https://openapi.geelark.com/open/v1/upload/getUrl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.bearer}`
      },
      body: JSON.stringify({ fileType: "mp4" })
    });
    const urlData = await urlRes.json();
    if (urlData["code"] !== 0) {
      const msg = urlData["msg"] ?? urlData["message"] ?? `code ${urlData["code"]}`;
      return { ok: false, error: `GéeLark upload URL: ${msg}` };
    }
    const data = urlData["data"] ?? {};
    const uploadUrl = data["uploadUrl"];
    const resourceUrl = data["resourceUrl"];
    if (!uploadUrl || !resourceUrl) return { ok: false, error: "Réponse upload GéeLark invalide" };
    const fileBytes = node_fs.readFileSync(opts.filePath);
    const uploadRes = await electron.net.fetch(uploadUrl, {
      method: "PUT",
      body: fileBytes
    });
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      return { ok: false, error: `Upload échoué (HTTP ${uploadRes.status})` };
    }
    return { ok: true, token: resourceUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
const FFMPEG_TIMEOUT = 50 * 1e3;
const FFMPEG_REMIX_TIMEOUT = 340 * 1e3;
electron.ipcMain.handle("run-ffmpeg", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const scale = opts.preset === "9:16" ? "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black" : opts.preset === "1:1" ? "scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:-1:-1:color=black" : "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1:color=black";
  const inputs = [];
  const filterParts = [];
  const n = opts.clips.length;
  opts.clips.forEach((c, i) => {
    const end = c.trimEnd > 0 ? c.trimEnd : 999999;
    inputs.push("-ss", String(c.trimStart), "-to", String(end), "-i", c.filePath);
    filterParts.push(`[${i}:v]${scale},setsar=1[v${i}];[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`);
  });
  const concatIn = opts.clips.map((_, i) => `[v${i}][a${i}]`).join("");
  filterParts.push(`${concatIn}concat=n=${n}:v=1:a=1[vout][aout]`);
  const args = [
    "-nostdin",
    ...inputs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    opts.outputPath
  ];
  const command = `ffmpeg ${args.map((a) => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  return new Promise((resolve) => {
    node_child_process.execFile(ffmpegBin, args, { maxBuffer: 100 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL" }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command });
      else resolve({ ok: true, outputPath: opts.outputPath, command });
    });
  });
});
electron.ipcMain.handle("detect-scene-change", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const FPS = 2, W = 32, H = 32;
  const frameSize = W * H * 3;
  const tmpDir = path.join(os.tmpdir(), `sf-det-${Date.now()}`);
  const rawFile = path.join(tmpDir, "frames.rgb");
  try {
    node_fs.mkdirSync(tmpDir, { recursive: true });
  } catch {
  }
  return new Promise((resolve) => {
    node_child_process.execFile(ffmpegBin, [
      "-nostdin",
      "-hide_banner",
      "-i",
      opts.filePath,
      "-vf",
      `fps=${FPS},scale=${W}:${H}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-y",
      rawFile
    ], { maxBuffer: 5 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL" }, (err, _stdout, stderr) => {
      if (err) console.log("[scene-detect] ffmpeg error:", err.message.split("\n")[0]);
      const durM = (stderr ?? "").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      const duration = durM ? parseInt(durM[1]) * 3600 + parseInt(durM[2]) * 60 + parseFloat(durM[3]) : null;
      let rawBuf = null;
      try {
        rawBuf = node_fs.readFileSync(rawFile);
      } catch {
      }
      try {
        node_fs.rmSync(tmpDir, { recursive: true });
      } catch {
      }
      if (!rawBuf || rawBuf.length < frameSize * 2) {
        const msg = err ? err.message.split("\n")[0] : "fichier vide";
        return resolve({ ok: false, times: [], duration, error: `FFmpeg n'a pas pu lire la vidéo : ${msg}` });
      }
      const totalFrames = Math.floor(rawBuf.length / frameSize);
      console.log("[scene-detect] frames read:", totalFrames, "duration:", duration);
      const avgs = [];
      for (let i = 0; i < totalFrames; i++) {
        const off = i * frameSize;
        let r = 0, g = 0, b = 0;
        for (let p = 0; p < W * H; p++) {
          r += rawBuf[off + p * 3];
          g += rawBuf[off + p * 3 + 1];
          b += rawBuf[off + p * 3 + 2];
        }
        avgs.push([r / (W * H), g / (W * H), b / (W * H)]);
      }
      const diffs = avgs.slice(1).map(([r2, g2, b2], i) => {
        const [r1, g1, b1] = avgs[i];
        return {
          time: Math.round((i + 1) / FPS * 10) / 10,
          dist: Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2)
        };
      });
      console.log("[scene-detect] diffs:", diffs.map((d) => `t=${d.time}s Δ=${d.dist.toFixed(1)}`).join(" | "));
      const valid = diffs.filter((d) => d.time > 0.4);
      if (!valid.length) {
        return resolve({ ok: false, times: [], duration, error: "Vidéo trop courte — positionne le curseur manuellement." });
      }
      const sorted = [...valid].sort((a, b) => b.dist - a.dist);
      const maxDist = sorted[0].dist;
      const cutoff = Math.max(3, maxDist * 0.35);
      const picked = sorted.filter((d) => d.dist >= cutoff).length > 0 ? sorted.filter((d) => d.dist >= cutoff) : [sorted[0]];
      const times = picked.map((d) => d.time);
      const best = Math.max(...times);
      console.log("[scene-detect] best=", best, "times=", times, "maxDist=", maxDist.toFixed(1));
      resolve({ ok: true, times, splitTime: best, duration });
    });
  });
});
electron.ipcMain.handle("run-ffmpeg-remix", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const W = opts.preset === "16:9" ? 1920 : 1080;
  const H = opts.preset === "9:16" ? 1920 : 1080;
  const scl = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`;
  const afmt = "aformat=sample_rates=44100:channel_layouts=stereo";
  let filterComplex;
  if (opts.textBlend > 0) {
    const lkTol = Math.min(0.5, Math.max(0.1, opts.textBlend));
    filterComplex = [
      `[1:v]split=2[ov_a][ov_b]`,
      `[1:a]asplit=2[ao1][ao2]`,
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_new]`,
      `[ov_a]trim=end=${opts.splitTime},setpts=PTS-STARTPTS,${scl},lumakey=threshold=0:tolerance=${lkTol}:softness=0.05[text_key]`,
      `[v_new][text_key]overlay=format=auto[v_blended]`,
      `[ov_b]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_blended][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`
    ].join(";");
  } else {
    filterComplex = [
      `[0:v]trim=duration=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p1]`,
      `[1:v]trim=start=${opts.splitTime},setpts=PTS-STARTPTS,${scl}[v_p2]`,
      `[1:a]asplit=2[ao1][ao2]`,
      `[ao1]atrim=end=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
      `[ao2]atrim=start=${opts.splitTime},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
      `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`
    ].join(";");
  }
  const args = [
    "-nostdin",
    "-i",
    opts.newPhase1Path,
    "-i",
    opts.originalPath,
    "-filter_complex",
    filterComplex,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-y",
    opts.outputPath
  ];
  const command = `ffmpeg ${args.map((a) => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  return new Promise((resolve) => {
    node_child_process.execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL" }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command });
      else resolve({ ok: true, outputPath: opts.outputPath, command });
    });
  });
});
electron.ipcMain.handle("extract-frames", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const tmpDir = path.join(os.tmpdir(), `sf-frames-${Date.now()}`);
  const startTime = Math.max(0, opts.startTime ?? 0);
  const duration = Math.max(0.1, opts.endTime - startTime);
  try {
    node_fs.mkdirSync(tmpDir, { recursive: true });
    const targetCount = Math.min(8, Math.max(1, Math.ceil(duration)));
    const fps = targetCount / duration;
    const framePattern = path.join(tmpDir, "frame_%04d.jpg");
    await new Promise((resolve, reject) => {
      node_child_process.execFile(ffmpegBin, [
        "-nostdin",
        "-ss",
        String(startTime),
        // fast seek BEFORE -i → jump directly to keyframe
        "-i",
        opts.filePath,
        "-t",
        String(duration),
        // duration from startTime, not absolute endTime
        "-vf",
        `fps=${fps.toFixed(4)},scale=640:-2`,
        "-q:v",
        "5",
        "-y",
        framePattern
      ], { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL" }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const files = node_fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jpg")).sort();
    const interval = duration / (files.length || 1);
    const frames = files.map((f, i) => ({
      index: i,
      timestamp: Math.round((startTime + i * interval) * 10) / 10,
      data: node_fs.readFileSync(path.join(tmpDir, f)).toString("base64")
    }));
    try {
      node_fs.rmSync(tmpDir, { recursive: true });
    } catch {
    }
    return { ok: true, frames, count: frames.length };
  } catch (err) {
    try {
      node_fs.rmSync(tmpDir, { recursive: true });
    } catch {
    }
    return { ok: false, frames: [], error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("anthropic-vision-request", async (_event, opts) => {
  try {
    const response = await electron.net.fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: opts.model ?? "claude-haiku-4-5-20251001",
        max_tokens: opts.maxTokens ?? 2e3,
        messages: opts.messages
      })
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, error: JSON.stringify(data) };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
function hasAudioStream(ffmpegBin, filePath) {
  return new Promise((resolve) => {
    node_child_process.execFile(
      ffmpegBin,
      ["-nostdin", "-hide_banner", "-i", filePath],
      { timeout: 8e3, killSignal: "SIGKILL" },
      (_err, _stdout, stderr) => resolve(/Audio:/.test(stderr ?? ""))
    );
  });
}
function getVideoDuration(ffmpegBin, filePath) {
  return new Promise((resolve) => {
    node_child_process.execFile(
      ffmpegBin,
      ["-nostdin", "-hide_banner", "-i", filePath],
      { timeout: 8e3, killSignal: "SIGKILL" },
      (_err, _stdout, stderr) => {
        const m = (stderr ?? "").match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
        resolve(m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]) : null);
      }
    );
  });
}
electron.ipcMain.handle("run-ffmpeg-remix-ai", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const W = opts.preset === "16:9" ? 1920 : 1080;
  const H = opts.preset === "9:16" ? 1920 : 1080;
  const scl = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:-1:-1:color=black,setsar=1`;
  const afmt = "aformat=sample_rates=44100:channel_layouts=stereo";
  function findFont(bold = false) {
    const candidates = process.platform === "win32" ? bold ? ["C:\\Windows\\Fonts\\arialbd.ttf", "C:\\Windows\\Fonts\\Arial Bold.ttf", "C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"] : ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"] : process.platform === "darwin" ? bold ? ["/Library/Fonts/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"] : ["/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"] : bold ? ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"] : ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"];
    return candidates.find((f) => node_fs.existsSync(f)) ?? null;
  }
  function escText(t) {
    return t.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/%/g, "%%");
  }
  function hasEmoji(t) {
    return /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{1F300}-\u{1F9FF}]|\u{FE0F}/u.test(t);
  }
  const EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf";
  const drawtextChain = opts.textOverlays.map((ov) => {
    const useEmoji = hasEmoji(ov.text) && node_fs.existsSync(EMOJI_FONT);
    const fontFile = useEmoji ? EMOJI_FONT : findFont(ov.bold);
    const borderPx = Math.max(3, Math.round(ov.fontSize * 0.07));
    const parts = [`text='${escText(ov.text)}'`];
    if (fontFile) parts.push(`fontfile='${fontFile}'`);
    const ySafe = `'max(4,min(h-text_h-8,${ov.y}))'`;
    parts.push(
      `x=${ov.x}`,
      `y=${ySafe}`,
      `fontsize=${ov.fontSize}`,
      `fontcolor=${ov.fontColor}`,
      `borderw=${borderPx}`,
      `bordercolor=black@1.0`,
      `enable='between(t,${ov.startTime},${ov.endTime})'`
    );
    if (ov.shadow !== false) parts.push(`shadowx=4:shadowy=4:shadowcolor=black@0.7`);
    return `drawtext=${parts.join(":")}`;
  }).join(",");
  const vfPhase1 = opts.textOverlays.length > 0 ? `${scl},${drawtextChain}` : scl;
  const splitTime = opts.splitTime != null && !isNaN(opts.splitTime) && opts.splitTime > 0 ? opts.splitTime : null;
  const commonOutputFlags = [
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-crf",
    "20",
    "-r",
    "30",
    "-fps_mode",
    "cfr",
    // force constant 30 fps output
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-avoid_negative_ts",
    "make_zero",
    "-max_muxing_queue_size",
    "9999"
  ];
  let args;
  if (!splitTime) {
    const origHasAudio = await hasAudioStream(ffmpegBin, opts.originalPath);
    const durArgs = opts.targetDuration != null && opts.targetDuration > 0 ? ["-t", String(opts.targetDuration)] : [];
    if (origHasAudio) {
      args = [
        "-nostdin",
        "-i",
        opts.newPhase1Path,
        // [0] secondary (video)
        "-i",
        opts.originalPath,
        // [1] original (audio only)
        "-filter_complex",
        `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[vout];[1:a]${afmt}[aout]`,
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        ...commonOutputFlags,
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        ...durArgs,
        "-y",
        opts.outputPath
      ];
    } else {
      args = [
        "-nostdin",
        "-i",
        opts.newPhase1Path,
        "-vf",
        `setpts=PTS-STARTPTS,${vfPhase1}`,
        ...commonOutputFlags,
        "-an",
        ...durArgs,
        "-y",
        opts.outputPath
      ];
    }
  } else {
    const secDuration = await getVideoDuration(ffmpegBin, opts.newPhase1Path);
    const effectiveSplit = secDuration != null && secDuration > 0 && secDuration < splitTime + 0.2 ? Math.max(0.5, secDuration - 0.2) : splitTime;
    const origHasAudio = await hasAudioStream(ffmpegBin, opts.originalPath);
    let filterComplex;
    let mapArgs;
    let audioEncArgs;
    if (origHasAudio) {
      filterComplex = [
        `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[2:v]setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[1:a]asplit=2[ao1][ao2]`,
        `[ao1]atrim=end=${effectiveSplit},asetpts=PTS-STARTPTS,${afmt}[a_p1]`,
        `[ao2]atrim=start=${effectiveSplit},asetpts=PTS-STARTPTS,${afmt}[a_p2]`,
        `[v_p1][a_p1][v_p2][a_p2]concat=n=2:v=1:a=1[vout][aout]`
      ].join(";");
      mapArgs = ["-map", "[vout]", "-map", "[aout]"];
      audioEncArgs = ["-c:a", "aac", "-b:a", "128k"];
    } else {
      filterComplex = [
        `[0:v]setpts=PTS-STARTPTS,${vfPhase1}[v_p1]`,
        `[2:v]setpts=PTS-STARTPTS,${scl}[v_p2]`,
        `[v_p1][v_p2]concat=n=2:v=1:a=0[vout]`
      ].join(";");
      mapArgs = ["-map", "[vout]"];
      audioEncArgs = ["-an"];
    }
    args = [
      "-nostdin",
      "-t",
      String(effectiveSplit),
      "-i",
      opts.newPhase1Path,
      // [0] secondary up to effectiveSplit
      "-i",
      opts.originalPath,
      // [1] full original (audio)
      "-ss",
      String(effectiveSplit),
      "-i",
      opts.originalPath,
      // [2] original fast-seeked (video phase 2)
      "-filter_complex",
      filterComplex,
      ...mapArgs,
      ...commonOutputFlags,
      ...audioEncArgs,
      "-y",
      opts.outputPath
    ];
  }
  const command = `ffmpeg ${args.map((a) => a.includes(" ") ? `"${a}"` : a).join(" ")}`;
  return new Promise((resolve) => {
    node_child_process.execFile(ffmpegBin, args, { maxBuffer: 200 * 1024 * 1024, timeout: FFMPEG_REMIX_TIMEOUT, killSignal: "SIGKILL" }, (err) => {
      if (err) resolve({ ok: false, error: err.message, command });
      else resolve({ ok: true, outputPath: opts.outputPath, command });
    });
  });
});
electron.ipcMain.handle("pick-output-file", async (_event, opts) => {
  if (!win) return null;
  const result = await electron.dialog.showSaveDialog(win, {
    title: "Enregistrer le montage",
    defaultPath: opts.defaultName,
    filters: [{ name: "Vidéo MP4", extensions: ["mp4"] }]
  });
  return result.canceled ? null : result.filePath;
});
electron.ipcMain.handle("pick-any-file", async (_event, opts) => {
  if (!win) return null;
  const result = await electron.dialog.showOpenDialog(win, {
    title: "Choisir un fichier",
    properties: ["openFile"],
    filters: (opts == null ? void 0 : opts.filters) ?? [{ name: "Tous les fichiers", extensions: ["*"] }]
  });
  return result.canceled ? null : result.filePaths[0];
});
electron.ipcMain.handle("pick-output-folder", async () => {
  if (!win) return null;
  const result = await electron.dialog.showOpenDialog(win, {
    title: "Choisir le dossier de sortie",
    properties: ["openDirectory", "createDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});
electron.ipcMain.handle("read-video-metadata", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  return new Promise((resolve) => {
    node_child_process.execFile(ffmpegBin, ["-hide_banner", "-i", opts.filePath], { encoding: "utf8" }, (_err, _stdout, stderr) => {
      const combined = stderr || "";
      const meta = {};
      const metaBlock = combined.match(/Metadata:\s*([\s\S]*?)(?=\n\s*(Duration|Stream|Input|$))/m);
      if (metaBlock) {
        for (const line of metaBlock[1].split("\n")) {
          const m = line.match(/^\s+(\w[\w\s]*?)\s*:\s*(.+)$/);
          if (m) meta[m[1].trim()] = m[2].trim();
        }
      }
      const durMatch = combined.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const duration = durMatch ? parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]) : void 0;
      resolve({ ok: true, metadata: meta, duration });
    });
  });
});
electron.ipcMain.handle("run-ffmpeg-metadata", async (_event, opts) => {
  const ffmpegBin = getFfmpegBin();
  const args = ["-nostdin", "-hide_banner", "-i", opts.inputPath, "-map_metadata", "-1"];
  for (const [k, v] of Object.entries(opts.metadata)) {
    if (v) {
      args.push("-metadata", `${k}=${v}`);
    }
  }
  args.push("-c", "copy", "-movflags", "+faststart", "-y", opts.outputPath);
  return new Promise((resolve) => {
    const command = [ffmpegBin, ...args].join(" ");
    node_child_process.execFile(ffmpegBin, args, { encoding: "utf8", timeout: FFMPEG_TIMEOUT, killSignal: "SIGKILL" }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, command, error: stderr.split("\n").filter(Boolean).pop() ?? err.message });
      else resolve({ ok: true, outputPath: opts.outputPath, command });
    });
  });
});
electron.ipcMain.handle("fetch-image", async (_event, opts) => {
  const headerSets = [
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.instagram.com/",
      "sec-fetch-dest": "image",
      "sec-fetch-mode": "no-cors",
      "sec-fetch-site": "cross-site"
    },
    {
      "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept": "image/*,*/*;q=0.8"
    },
    {
      "User-Agent": "Instagram 312.0.0.32.116 Android (33/13; 420dpi; 1080x2206; samsung; SM-S911B; dm3q; qcom; en_US; 558678421)",
      "Accept": "image/*"
    }
  ];
  for (const headers of headerSets) {
    try {
      const merged = { ...headers, ...opts.headers ?? {} };
      const res = await electron.net.fetch(opts.url, { method: "GET", headers: merged, redirect: "follow" });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 0) {
          const ct = res.headers.get("content-type") ?? "image/jpeg";
          return { ok: true, dataUrl: `data:${ct};base64,${buf.toString("base64")}` };
        }
      }
    } catch {
    }
  }
  return { ok: false, error: "all_strategies_failed" };
});
electron.ipcMain.handle("groq-request", async (_event, opts) => {
  var _a;
  try {
    const response = await electron.net.fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.apiKey}`
      },
      body: JSON.stringify({
        model: opts.model ?? "llama-3.1-8b-instant",
        messages: opts.messages,
        max_tokens: opts.maxTokens ?? 400
      })
    });
    if (!response.ok) {
      let errMsg = `Erreur HTTP ${response.status}`;
      try {
        const errData = await response.json();
        if ((_a = errData == null ? void 0 : errData.error) == null ? void 0 : _a.message) errMsg = errData.error.message;
      } catch {
      }
      return { ok: false, error: errMsg };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("fetch-ig-comments", async (_event, opts) => {
  const extractComments = (data) => {
    const candidates = [data["comments"], data["preview_comments"]];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        return c.map((item) => {
          const obj = item;
          if (obj["node"] && typeof obj["node"] === "object") return obj["node"];
          return obj;
        });
      }
    }
    return [];
  };
  const mapComments = (raw) => raw.map((c) => {
    var _a, _b;
    return {
      pk: String(c["pk"] ?? c["id"] ?? ""),
      text: String(c["text"] ?? ""),
      username: String(((_a = c["user"]) == null ? void 0 : _a["username"]) ?? ((_b = c["owner"]) == null ? void 0 : _b["username"]) ?? ""),
      timestamp: c["created_at"] ? new Date(c["created_at"] * 1e3).toISOString() : "",
      likeCount: c["comment_like_count"] ?? 0
    };
  });
  try {
    let url = `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/?can_support_threading=true&permalink_enabled=false`;
    if (opts.maxId) url += `&max_id=${opts.maxId}`;
    let res = await igSessionFetch(url, opts.sessionid);
    console.log("[fetch-ig-comments] A i.instagram threading status=", res.status, "mediaId=", opts.mediaId);
    let raw = res.status === 200 && res.data ? extractComments(res.data) : [];
    if (raw.length === 0) {
      const url2 = `https://i.instagram.com/api/v1/media/${opts.mediaId}/comments/${opts.maxId ? `?max_id=${opts.maxId}` : ""}`;
      const res2 = await igSessionFetch(url2, opts.sessionid);
      console.log("[fetch-ig-comments] B i.instagram simple status=", res2.status, "keys=", res2.data ? Object.keys(res2.data).slice(0, 12) : null);
      if (res2.status === 200 && res2.data) raw = extractComments(res2.data);
      if (res2.status === 200) res = res2;
    }
    if (raw.length === 0) {
      const url3 = `https://www.instagram.com/api/v1/media/${opts.mediaId}/comments/${opts.maxId ? `?max_id=${opts.maxId}` : ""}`;
      const res3 = await igSessionFetch(url3, opts.sessionid);
      console.log("[fetch-ig-comments] C www.instagram status=", res3.status, "keys=", res3.data ? Object.keys(res3.data).slice(0, 12) : null);
      if (res3.status === 200 && res3.data) raw = extractComments(res3.data);
      if (res3.status === 200) res = res3;
    }
    if (raw.length === 0 && res.status === 200) {
      const preview = JSON.stringify(res.data).slice(0, 400);
      console.log("[fetch-ig-comments] no comments extracted. preview=", preview);
    }
    return { ok: true, comments: mapComments(raw), hasMore: !!(res.data ?? {})["next_max_id"] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("post-ig-comment", async (_event, opts) => {
  try {
    if (!_csrfCache.get(opts.sessionid)) {
      await igSessionFetch("https://i.instagram.com/api/v1/accounts/current_user/", opts.sessionid);
    }
    const decoded = decodeURIComponent(opts.sessionid);
    const uidMatch = decoded.match(/^(\d+)/);
    const uid = uidMatch ? uidMatch[1] : "";
    const body = [
      `comment_text=${encodeURIComponent(opts.text)}`,
      `containermodule=self_comments_v2_feed_contextual_self_profile`,
      uid ? `_uid=${uid}` : "",
      uid ? `_uuid=${uid}` : ""
    ].filter(Boolean).join("&");
    const tryPost = () => igSessionFetch(
      `https://i.instagram.com/api/v1/media/${opts.mediaId}/comment/`,
      opts.sessionid,
      "POST",
      body
    );
    let res = await tryPost();
    console.log("[post-ig-comment] status=", res.status, "mediaId=", opts.mediaId);
    if (res.status === 403) {
      _csrfCache.delete(opts.sessionid);
      await igSessionFetch("https://i.instagram.com/api/v1/accounts/current_user/", opts.sessionid);
      const res2 = await igSessionFetch(
        `https://www.instagram.com/api/v1/web/comments/${opts.mediaId}/add/`,
        opts.sessionid,
        "POST",
        `comment_text=${encodeURIComponent(opts.text)}`,
        { "X-Requested-With": "XMLHttpRequest", "Referer": "https://www.instagram.com/" }
      );
      console.log("[post-ig-comment] retry www. status=", res2.status);
      if (res2.status === 200) return { ok: true };
      res = await tryPost();
      console.log("[post-ig-comment] retry i. status=", res.status);
    }
    if (res.status !== 200) {
      const dead = isSessionDead(res.status, res.data);
      const detail = res.data ? JSON.stringify(res.data).slice(0, 200) : "";
      return { ok: false, sessionExpired: dead, error: `HTTP ${res.status}${detail ? " — " + detail : ""}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
function createWindow() {
  win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#080b14",
    show: false,
    webPreferences: {
      preload: (() => {
        const p = path.join(__dirname$1, "preload.mjs");
        if (node_fs.existsSync(p)) return p;
        const p2 = path.join(__dirname$1, "preload.js");
        return node_fs.existsSync(p2) ? p2 : void 0;
      })(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow file:// URLs in <video>/<img> regardless of renderer origin (dev = localhost).
      // Safe for a local desktop app — the renderer never loads untrusted external content.
      webSecurity: false
    },
    titleBarStyle: "default",
    frame: true
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
  win.once("ready-to-show", () => {
    win == null ? void 0 : win.show();
    win == null ? void 0 : win.maximize();
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
electron.ipcMain.handle("read-local-video", async (_event, filePath) => {
  try {
    if (!node_fs.existsSync(filePath)) return { ok: false, error: "not found" };
    const stat = node_fs.statSync(filePath);
    const MAX = 25 * 1024 * 1024;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".mp4" ? "video/mp4" : ext === ".mov" ? "video/quicktime" : ext === ".webm" ? "video/webm" : ext === ".mkv" ? "video/x-matroska" : ext === ".avi" ? "video/x-msvideo" : "video/mp4";
    if (stat.size > MAX) {
      return new Promise((resolve) => {
        const chunks = [];
        const stream = node_fs.createReadStream(filePath, { start: 0, end: MAX - 1 });
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", () => {
          const b64 = Buffer.concat(chunks).toString("base64");
          resolve({ ok: true, dataUrl: `data:${mime};base64,${b64}` });
        });
        stream.on("error", (e) => resolve({ ok: false, error: e.message }));
      });
    }
    const buf = node_fs.readFileSync(filePath);
    return { ok: true, dataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("fetch-ig-video", async (_event, opts) => {
  if (!opts.url) return { ok: false, error: "no url" };
  const headerSets = [
    {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.instagram.com/"
    },
    { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "Accept": "video/*" },
    { "User-Agent": "Instagram 312.0.0.32.116 Android", "Accept": "video/*" }
  ];
  for (const headers of headerSets) {
    try {
      const res = await electron.net.fetch(opts.url, { method: "GET", headers, redirect: "follow" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) continue;
      const dir = path.join(os.tmpdir(), "ig-tracker-cache");
      node_fs.mkdirSync(dir, { recursive: true });
      const out = path.join(dir, `ig-${Date.now()}.mp4`);
      node_fs.writeFileSync(out, buf);
      return { ok: true, path: out, size: buf.length };
    } catch {
    }
  }
  return { ok: false, error: "all retries failed" };
});
electron.ipcMain.handle("read-file-bytes", async (_event, filePath) => {
  try {
    if (!node_fs.existsSync(filePath)) return { ok: false, error: "not found" };
    const buf = node_fs.readFileSync(filePath);
    return { ok: true, bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), size: buf.byteLength };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.ipcMain.handle("write-temp-file", async (_event, opts) => {
  try {
    const dir = path.join(os.tmpdir(), "ig-tracker-cache");
    node_fs.mkdirSync(dir, { recursive: true });
    const safeName = opts.name.replace(/[\\/]/g, "_").slice(-200);
    const out = path.join(dir, `${Date.now()}-${safeName}`);
    node_fs.writeFileSync(out, Buffer.from(opts.bytes));
    return { ok: true, path: out };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
    win = null;
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
});
electron.app.whenReady().then(() => {
  electron.protocol.handle("localvideo", async (request) => {
    try {
      const u = new URL(request.url);
      let filePath = decodeURIComponent(u.pathname);
      if (process.platform === "win32" && /^\/[A-Za-z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }
      if (!node_fs.existsSync(filePath)) {
        return new Response("Not found", { status: 404 });
      }
      const fileUrl = node_url.pathToFileURL(filePath).toString();
      const fwdHeaders = new Headers();
      const range = request.headers.get("range");
      if (range) fwdHeaders.set("range", range);
      return await electron.net.fetch(fileUrl, { headers: fwdHeaders, bypassCustomProtocolHandlers: true });
    } catch (err) {
      console.error("[localvideo]", err);
      return new Response(`Error: ${err}`, { status: 500 });
    }
  });
  createWindow();
});
exports.RENDERER_DIST = RENDERER_DIST;
exports.VITE_DEV_SERVER_URL = VITE_DEV_SERVER_URL;
