export type StoreDayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type StoreDaySchedule = {
  enabled: boolean;
  open: string;
  close: string;
};

export type StoreHours = Record<StoreDayKey, StoreDaySchedule>;

export type StoreAvailabilityInput = {
  isStoreOpen?: boolean | null;
  storeHours?: unknown;
  closedNote?: string | null;
};

export type StoreAvailability = {
  isOpen: boolean;
  statusLabel: string;
  detail: string;
};

const DAY_KEYS: StoreDayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DEFAULT_OPEN_TIME = "07:00";
export const DEFAULT_CLOSE_TIME = "22:00";

export function emptyStoreHours(): StoreHours {
  return {
    mon: { enabled: false, open: "", close: "" },
    tue: { enabled: false, open: "", close: "" },
    wed: { enabled: false, open: "", close: "" },
    thu: { enabled: false, open: "", close: "" },
    fri: { enabled: false, open: "", close: "" },
    sat: { enabled: false, open: "", close: "" },
    sun: { enabled: false, open: "", close: "" },
  };
}

export function normalizeStoreHours(input: unknown): StoreHours {
  const base = emptyStoreHours();
  if (!input || typeof input !== "object") return base;
  const raw = input as Record<string, unknown>;
  for (const key of DAY_KEYS) {
    const day = raw[key];
    if (!day || typeof day !== "object") continue;
    const row = day as Record<string, unknown>;
    base[key] = {
      enabled: !!row.enabled,
      open: String(row.open ?? "").trim(),
      close: String(row.close ?? "").trim(),
    };
  }
  return base;
}

function parseMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatStoreTime(value: string) {
  const minutes = parseMinutes(value);
  if (minutes == null) return value;
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function lagosNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const keyMap: Record<string, StoreDayKey> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };

  return {
    dayKey: keyMap[weekday.slice(0, 3)] ?? "mon",
    minutes: hour * 60 + minute,
  };
}

function previousDayKey(day: StoreDayKey): StoreDayKey {
  const idx = DAY_KEYS.indexOf(day);
  return DAY_KEYS[(idx + DAY_KEYS.length - 1) % DAY_KEYS.length];
}

function hasEnabledSchedule(hours: StoreHours) {
  return DAY_KEYS.some((day) => hours[day].enabled && parseMinutes(hours[day].open) != null && parseMinutes(hours[day].close) != null);
}

function isDayOpen(day: StoreDaySchedule, minutes: number) {
  const open = parseMinutes(day.open);
  const close = parseMinutes(day.close);
  if (!day.enabled || open == null || close == null) return false;
  if (open === close) return true;
  if (open < close) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close;
}

export function evaluateStoreAvailability(input: StoreAvailabilityInput): StoreAvailability {
  const isStoreOpen = input.isStoreOpen !== false;
  const closedNote = String(input.closedNote ?? "").trim();
  const hours = normalizeStoreHours(input.storeHours);
  const openMinutes = parseMinutes(DEFAULT_OPEN_TIME) ?? 7 * 60;
  const closeMinutes = parseMinutes(DEFAULT_CLOSE_TIME) ?? 22 * 60;

  if (!isStoreOpen) {
    return {
      isOpen: false,
      statusLabel: "Temporarily closed",
      detail: closedNote || "This restaurant is not accepting orders right now.",
    };
  }

  const now = lagosNow();

  if (hasEnabledSchedule(hours)) {
    const today = hours[now.dayKey];
    const yesterday = hours[previousDayKey(now.dayKey)];

    if (isDayOpen(today, now.minutes)) {
      return {
        isOpen: true,
        statusLabel: "Open now",
        detail: `${dayLabel(now.dayKey)}: ${formatStoreTime(today.open)} - ${formatStoreTime(today.close)}`,
      };
    }

    const yesterdayOpen = parseMinutes(yesterday.open);
    const yesterdayClose = parseMinutes(yesterday.close);
    if (
      yesterday.enabled &&
      yesterdayOpen != null &&
      yesterdayClose != null &&
      yesterdayOpen > yesterdayClose &&
      now.minutes < yesterdayClose
    ) {
      return {
        isOpen: true,
        statusLabel: "Open now",
        detail: `${dayLabel(previousDayKey(now.dayKey))}: ${formatStoreTime(yesterday.open)} - ${formatStoreTime(yesterday.close)}`,
      };
    }

    const todayOpen = parseMinutes(today.open);
    if (today.enabled && todayOpen != null && now.minutes < todayOpen) {
      return {
        isOpen: false,
        statusLabel: `Opens ${formatStoreTime(today.open)}`,
        detail: `${dayLabel(now.dayKey)}: ${formatStoreTime(today.open)} - ${formatStoreTime(today.close)}`,
      };
    }

    return {
      isOpen: false,
      statusLabel: "Closed now",
      detail: closedNote || "Your custom daily schedule is currently closed.",
    };
  }

  const withinDefaultWindow = now.minutes >= openMinutes && now.minutes < closeMinutes;

  if (withinDefaultWindow) {
    return {
      isOpen: true,
      statusLabel: "Open now",
      detail: `Open daily from ${formatStoreTime(DEFAULT_OPEN_TIME)} to ${formatStoreTime(DEFAULT_CLOSE_TIME)}.`,
    };
  }

  if (now.minutes < openMinutes) {
    return {
      isOpen: false,
      statusLabel: `Opens ${formatStoreTime(DEFAULT_OPEN_TIME)}`,
      detail: `Restaurants accept orders daily from ${formatStoreTime(DEFAULT_OPEN_TIME)} to ${formatStoreTime(DEFAULT_CLOSE_TIME)}.`,
    };
  }

  return {
    isOpen: false,
    statusLabel: "Closed now",
    detail: closedNote || `Restaurants stop accepting orders after ${formatStoreTime(DEFAULT_CLOSE_TIME)}.`,
  };
}

export function dayLabel(day: StoreDayKey) {
  const labels: Record<StoreDayKey, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return labels[day];
}

export const STORE_DAY_KEYS = DAY_KEYS;
