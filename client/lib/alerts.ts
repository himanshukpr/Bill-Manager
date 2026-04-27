export type AlertDays = {
  Monday: boolean;
  Tuesday: boolean;
  Wednesday: boolean;
  Thursday: boolean;
  Friday: boolean;
  Saturday: boolean;
  Sunday: boolean;
};

export type HouseAlert = {
  id: string;
  text: string;
  schedule: AlertDays;
};

let alertIdCounter = 0;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createAlertId(prefix = 'alert'): string {
  const cryptoLike = globalThis.crypto;

  if (cryptoLike && typeof cryptoLike.randomUUID === 'function') {
    return cryptoLike.randomUUID();
  }

  if (cryptoLike && typeof cryptoLike.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoLike.getRandomValues(bytes);

    // UUID v4 layout bits for broad compatibility with existing id format usage.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = bytesToHex(bytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  alertIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${alertIdCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ALL_DAYS_ALERT_SCHEDULE: AlertDays = {
  Monday: true,
  Tuesday: true,
  Wednesday: true,
  Thursday: true,
  Friday: true,
  Saturday: true,
  Sunday: true,
};

const DAY_ALIAS_TO_KEY: Record<string, keyof AlertDays> = {
  monday: 'Monday',
  mon: 'Monday',
  tuesday: 'Tuesday',
  tue: 'Tuesday',
  tues: 'Tuesday',
  wednesday: 'Wednesday',
  wed: 'Wednesday',
  thursday: 'Thursday',
  thu: 'Thursday',
  thur: 'Thursday',
  thurs: 'Thursday',
  friday: 'Friday',
  fri: 'Friday',
  saturday: 'Saturday',
  sat: 'Saturday',
  sunday: 'Sunday',
  sun: 'Sunday',
};

function defaultSchedule(): AlertDays {
  return { ...ALL_DAYS_ALERT_SCHEDULE };
}

function normalizeSchedule(value: unknown): AlertDays {
  if (!value || typeof value !== 'object') return defaultSchedule();

  const source = value as Record<string, unknown>;
  const schedule: AlertDays = {
    Monday: false,
    Tuesday: false,
    Wednesday: false,
    Thursday: false,
    Friday: false,
    Saturday: false,
    Sunday: false,
  };

  let foundAny = false;

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const dayKey = DAY_ALIAS_TO_KEY[rawKey.trim().toLowerCase()];
    if (!dayKey) continue;
    schedule[dayKey] = Boolean(rawValue);
    foundAny = true;
  }

  return foundAny ? schedule : defaultSchedule();
}

function tryParseNestedAlertEntries(text: string, seedIndex: number): HouseAlert[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('[')) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item, itemIndex) => normalizeAlertEntries(item, seedIndex * 100 + itemIndex));
  } catch {
    return [];
  }
}

function normalizeAlertEntries(entry: unknown, index: number): HouseAlert[] {
  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) return [];

    const nested = tryParseNestedAlertEntries(text, index);
    if (nested.length > 0) return nested;

    return [
      {
        id: `legacy-alert-${index}`,
        text,
        schedule: defaultSchedule(),
      },
    ];
  }

  if (!entry || typeof entry !== 'object') return [];

  const raw = entry as Record<string, unknown>;
  const text = String(raw.text ?? raw.message ?? raw.note ?? '').trim();
  if (!text) return [];

  const nested = tryParseNestedAlertEntries(text, index);
  if (nested.length > 0) return nested;

  const schedule = normalizeSchedule(raw.schedule ?? raw.days);
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createAlertId(`alert-${index}`);

  return [
    {
      id: rawId,
      text,
      schedule,
    },
  ];
}

export function parseDailyAlerts(rawValue: string | null | undefined): HouseAlert[] {
  if (!rawValue) return [];

  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry, index) => normalizeAlertEntries(entry, index));
  } catch {
    return [
      {
        id: 'legacy-alert',
        text: trimmed,
        schedule: defaultSchedule(),
      },
    ];
  }
}
