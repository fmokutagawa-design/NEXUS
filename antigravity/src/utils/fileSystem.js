/**
 * fileSystem.js
 * Unified file system adapter that selects the appropriate backend
 * based on the runtime environment: Electron, Tauri, or Browser.
 */

import { electronFileSystem } from './fileSystem.electron.js';
import { browserFileSystem } from './fileSystem.browser.js';

// --- Environment detection ---
export const isElectron = typeof window !== 'undefined' && !!(window.api && window.api.isElectron);
export const isTauri = typeof window !== 'undefined' && !!(window.__TAURI_INTERNALS__);
export const isNative = isElectron || isTauri;

// --- Backend selection ---
// Tauri backend is loaded lazily only when Tauri is detected,
// to avoid import errors when @tauri-apps/api is not installed.
let backend;
if (isElectron) {
  backend = electronFileSystem;
} else if (isTauri) {
  // Tauri detected — dynamic import at init time.
  // Until loaded, proxy calls to a pending queue or throw.
  // For simplicity, we use a synchronous placeholder that will be replaced.
  const placeholder = {};
  const methodNames = Object.keys(browserFileSystem);
  for (const m of methodNames) {
    placeholder[m] = async () => { throw new Error(`Tauri backend not yet loaded. Method: ${m}`); };
  }
  backend = placeholder;

  // Load asynchronously and replace
  import('./fileSystem.tauri.js').then(mod => {
    Object.assign(backend, mod.tauriFileSystem);
  }).catch(err => {
    console.error('Failed to load Tauri file system backend:', err);
  });
} else {
  backend = browserFileSystem;
}

export const fileSystem = backend;
