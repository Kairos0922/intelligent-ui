/**
 * Connectivity override for the demo.
 *
 * Playwright can also use `context.setOffline(true)`. The manual toggle lets a
 * human reproduce the offline path without devtools. `navigator.onLine` alone
 * is not enough because the experiment must be runnable offline on a localhost
 * preview.
 */
const KEY = "iui.pass-spike.forced-offline";

let forced = false;
try {
  forced = sessionStorage.getItem(KEY) === "1";
} catch {
  forced = false;
}

export function isOnline(): boolean {
  return navigator.onLine && !forced;
}

export function setForcedOffline(next: boolean): void {
  forced = next;
  try {
    sessionStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // sessionStorage can be unavailable under a strict sandbox
  }
  window.dispatchEvent(new Event(next ? "offline" : "online"));
}

export function isForcedOffline(): boolean {
  return forced;
}
