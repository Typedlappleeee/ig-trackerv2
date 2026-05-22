"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  // Proxy HTTP (bypass renderer CORS) — GéeLark + Instagram
  geelarkRequest: (opts) => electron.ipcRenderer.invoke("geelark-request", opts),
  // Open native video file picker → returns file path or null
  pickVideoFile: () => electron.ipcRenderer.invoke("pick-video-file"),
  // Upload a local video file to GéeLark and return its token
  uploadVideoGeelark: (opts) => electron.ipcRenderer.invoke("upload-video-geelark", opts),
  // Fetch an image as base64 data URL (proxy to bypass CORS/hotlink protection)
  fetchImage: (opts) => electron.ipcRenderer.invoke("fetch-image", opts),
  // Run FFmpeg to export montage
  runFfmpeg: (opts) => electron.ipcRenderer.invoke("run-ffmpeg", opts),
  // Open native save-file dialog
  pickOutputFile: (opts) => electron.ipcRenderer.invoke("pick-output-file", opts),
  // Open native file picker (any file type)
  pickAnyFile: (opts) => electron.ipcRenderer.invoke("pick-any-file", opts ?? {}),
  // Open native folder picker
  pickOutputFolder: () => electron.ipcRenderer.invoke("pick-output-folder"),
  // Fetch Instagram profile page via hidden browser (most reliable, bypasses API blocks)
  fetchInstagramHtml: (username) => electron.ipcRenderer.invoke("fetch-instagram-html", username),
  // Fetch Instagram data using a session ID (private API — no rate limit)
  fetchInstagramBySession: (opts) => electron.ipcRenderer.invoke("fetch-instagram-by-session", opts),
  // Read a local video file as a data URL (fallback when localvideo:// fails)
  readLocalVideo: (filePath) => electron.ipcRenderer.invoke("read-local-video", filePath),
  // Read full file bytes (used to upload to Supabase Storage)
  readFileBytes: (filePath) => electron.ipcRenderer.invoke("read-file-bytes", filePath),
  // Download an Instagram video CDN URL to temp dir with proper Referer headers
  fetchIgVideo: (opts) => electron.ipcRenderer.invoke("fetch-ig-video", opts),
  // Materialise bytes (e.g. a downloaded cloud video) to a temp file, return its path
  writeTempFile: (opts) => electron.ipcRenderer.invoke("write-temp-file", opts),
  // Fetch Instagram comments for a media post
  fetchIgComments: (opts) => electron.ipcRenderer.invoke("fetch-ig-comments", opts),
  // Post a comment reply on an Instagram media
  postIgComment: (opts) => electron.ipcRenderer.invoke("post-ig-comment", opts),
  // Groq AI API call (returns chat completion)
  groqRequest: (opts) => electron.ipcRenderer.invoke("groq-request", opts),
  // Run FFmpeg remix — split original at splitTime, swap phase 1 with new video,
  // optionally blend original text overlay, keep phase 2 intact.
  runFfmpegRemix: (opts) => electron.ipcRenderer.invoke("run-ffmpeg-remix", opts),
  // Detect the scene-change timestamp(s) in a video (for auto-split point).
  detectSceneChange: (opts) => electron.ipcRenderer.invoke("detect-scene-change", opts),
  // Extract video frames as base64 JPEGs (for AI text analysis)
  extractFrames: (opts) => electron.ipcRenderer.invoke("extract-frames", opts),
  // Anthropic Claude API with vision support (bypasses CORS)
  anthropicVisionRequest: (opts) => electron.ipcRenderer.invoke("anthropic-vision-request", opts),
  // FFmpeg remix with AI-detected drawtext overlays
  runFfmpegRemixAI: (opts) => electron.ipcRenderer.invoke("run-ffmpeg-remix-ai", opts),
  // Read video metadata (title, encoder, creation_time, etc.)
  readVideoMetadata: (opts) => electron.ipcRenderer.invoke("read-video-metadata", opts),
  // Rewrite video metadata (strip all, optionally set new values)
  runFfmpegMetadata: (opts) => electron.ipcRenderer.invoke("run-ffmpeg-metadata", opts)
});
