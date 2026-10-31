const attempts = new Map<string, number[]>();

export function consumeAiBurst(key: string, now = Date.now(), limit = 5, windowMs = 60_000) {
  const active = (attempts.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (active.length >= limit) {
    attempts.set(key, active);
    return false;
  }
  active.push(now);
  attempts.set(key, active);
  return true;
}

export function resetAiBurstLimits() {
  attempts.clear();
}
