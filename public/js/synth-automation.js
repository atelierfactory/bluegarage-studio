// Shared, pure timing for audible automation, the robot and Node checks.
export function knobStateAt(defaults, events, beat, beatToSec, seconds = beatToSec(beat)) {
  const values = { ...defaults };
  const now = seconds;
  for (const k of events) {
    if (k.s > beat || beatToSec(k.s) > now) break;
    const from = values[k.param] ?? 0.5;
    const start = beatToSec(k.s), end = beatToSec(k.s + k.d);
    const u = Math.max(0, Math.min(1, (now - start) / Math.max(1e-9, end - start)));
    values[k.param] = from + (k.to - from) * u;
  }
  return values;
}

export function knobTimeline(defaults, events, beatToSec) {
  const values = { ...defaults };
  return events.slice().sort((a, b) => a.s - b.s).map((k) => {
    const event = { ...k, from: values[k.param], seconds: beatToSec(k.s + k.d) - beatToSec(k.s) };
    values[k.param] = k.to;
    return event;
  });
}
