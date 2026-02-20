const DAY_MS = 24 * 60 * 60 * 1000;

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseRangeToStart(range: string | undefined): string {
  const now = Date.now();
  switch (range) {
    case "90d":
      return new Date(now - 90 * DAY_MS).toISOString();
    case "all":
      return new Date(0).toISOString();
    case "12m":
    default:
      return new Date(now - 365 * DAY_MS).toISOString();
  }
}

export function appleTimeToIso(value: number | null | undefined): string {
  if (!value) {
    return nowIso();
  }

  const appleEpochMs = 978307200000;

  if (value > 1e15) {
    return new Date(appleEpochMs + Math.floor(value / 1_000_000)).toISOString();
  }
  if (value > 1e12) {
    return new Date(appleEpochMs + Math.floor(value / 1_000)).toISOString();
  }
  if (value > 1e9) {
    return new Date(appleEpochMs + value).toISOString();
  }

  return new Date(appleEpochMs + value * 1000).toISOString();
}
