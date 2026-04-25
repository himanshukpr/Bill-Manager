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

function normalizeAlertEntry(entry: unknown, index: number): HouseAlert | null {
  if (typeof entry === 'string') {
    const text = entry.trim();
    if (!text) return null;
    return {
      id: `legacy-alert-${index}`,
      text,
      schedule: defaultSchedule(),
    };
  }

  if (!entry || typeof entry !== 'object') return null;

  const raw = entry as Record<string, unknown>;
  const text = String(raw.text ?? raw.message ?? raw.note ?? '').trim();
  if (!text) return null;

  const schedule = normalizeSchedule(raw.schedule ?? raw.days);
  const rawId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `alert-${index}`;

  return {
    id: rawId,
    text,
    schedule,
  };
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

    return parsed
      .map((entry, index) => normalizeAlertEntry(entry, index))
      .filter((entry): entry is HouseAlert => entry !== null);
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
