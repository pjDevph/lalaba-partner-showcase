// CLIENT-001..005 — logging that cannot reach a production build.
//
// Metro does NOT strip console calls in release, so every `console.log` in the
// app ships. authStore alone was writing the signed-in email, uid, resolved
// role, Google client id and the whole sign-in state machine to the device
// log, where `adb logcat` — or any app holding the READ_LOGS permission —
// picks it up.
//
// `__DEV__` is a compile-time constant, so these bodies are dead-code
// eliminated from a release bundle rather than merely skipped at runtime. That
// is stronger than babel-plugin-transform-remove-console (which has to be
// wired into the production env and silently does nothing if it isn't) and it
// is already the idiom used elsewhere in this file's neighbours.
//
// devError is deliberately NOT gated: real errors should keep reaching crash
// reporting once OPS-002/003 land. Keep identity out of those messages — an
// error is the one thing that DOES ship.

const enabled = typeof __DEV__ !== 'undefined' && __DEV__;

export function devLog(...args: unknown[]): void {
  if (enabled) console.log(...args);
}

export function devWarn(...args: unknown[]): void {
  if (enabled) console.warn(...args);
}

/** Ships. No emails, uids, tokens or roles in the message. */
export function devError(...args: unknown[]): void {
  console.error(...args);
}
