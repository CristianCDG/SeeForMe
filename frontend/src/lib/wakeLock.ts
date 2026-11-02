let wanted = false;
let sentinel: WakeLockSentinel | null = null;

async function acquire() {
  if (!wanted || sentinel || document.visibilityState !== "visible" || !("wakeLock" in navigator)) {
    return;
  }
  try {
    const lock = await navigator.wakeLock.request("screen");
    sentinel = lock;
    lock.addEventListener("release", () => {
      if (sentinel === lock) sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

export function keepAwake() {
  if (!wanted) {
    wanted = true;
    document.addEventListener("visibilitychange", () => void acquire());
  }
  void acquire();
}
