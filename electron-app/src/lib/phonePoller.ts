/**
 * Global phone-status polling singleton.
 * Lives for the entire renderer process lifetime — survives page navigation.
 */
import { fetchPhoneStatuses } from './geelark'

type StatusCallback = (map: Map<string, string>) => void

let _bearer       = ''
let _intervalSec  = parseInt(localStorage.getItem('phones-interval') ?? '60') || 60
let _enabled      = localStorage.getItem('phones-autorefresh') !== 'false'
let _timer: ReturnType<typeof setInterval> | null = null
let _lastPoll     = 0
const _subs       = new Set<StatusCallback>()

// ── Internal poll ────────────────────────────────────────────────────────────
async function poll() {
  if (!_bearer) return
  _lastPoll = Date.now()
  try {
    const map = await fetchPhoneStatuses(_bearer)
    _subs.forEach(cb => cb(map))
  } catch { /* network hiccup — next tick will retry */ }
}

function restart() {
  if (_timer) clearInterval(_timer)
  _timer = null
  if (!_enabled || !_bearer) return
  _timer = setInterval(poll, _intervalSec * 1000)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once when the bearer token is known (from app_config). */
export function initPoller(bearer: string) {
  _bearer = bearer
  restart()
  // Poll immediately if we haven't polled recently (or ever)
  if (Date.now() - _lastPoll >= _intervalSec * 1000) poll()
}

/** Subscribe to status-map updates. Returns an unsubscribe function. */
export function subscribe(cb: StatusCallback): () => void {
  _subs.add(cb)
  return () => _subs.delete(cb)
}

/** Change the poll interval; persists to localStorage. */
export function setIntervalSec(sec: number) {
  _intervalSec = sec
  localStorage.setItem('phones-interval', String(sec))
  restart()
}

/** Enable or disable polling; persists to localStorage. */
export function setEnabled(val: boolean) {
  _enabled = val
  localStorage.setItem('phones-autorefresh', String(val))
  restart()
  if (val && _bearer) poll()  // immediate poll when re-enabling
}

/** Force an immediate poll right now. */
export function pollNow() { poll() }

/** Read-only getters for UI */
export const getIntervalSec = () => _intervalSec
export const getEnabled     = () => _enabled
