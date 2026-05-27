// Stub for @ffmpeg/ffmpeg — used in the Electron build only.
// The real wasm FFmpeg only runs in a browser; in Electron we go through IPC.
export class FFmpeg {
  loaded = false
  on() {}
  off() {}
  load(): Promise<void> { return Promise.resolve() }
  exec(): Promise<number> { return Promise.resolve(0) }
  terminate() {}
  writeFile(): Promise<void> { return Promise.resolve() }
  readFile(): Promise<Uint8Array> { return Promise.resolve(new Uint8Array()) }
  deleteFile(): Promise<void> { return Promise.resolve() }
  listDir(): Promise<unknown[]> { return Promise.resolve([]) }
  createDir(): Promise<void> { return Promise.resolve() }
  rename(): Promise<void> { return Promise.resolve() }
  mount(): Promise<void> { return Promise.resolve() }
  unmount(): Promise<void> { return Promise.resolve() }
}
export default FFmpeg
