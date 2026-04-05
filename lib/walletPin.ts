import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

function normalizePin(pin: string) {
  return String(pin ?? "").trim();
}

export function isValidWalletPin(pin: string) {
  return /^\d{4}$/.test(normalizePin(pin));
}

export function createWalletPinHash(pin: string) {
  const normalized = normalizePin(pin);
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(normalized, salt, 64).toString("hex");
  return { salt, hash };
}

export function verifyWalletPin(pin: string, hash: string, salt: string) {
  const normalized = normalizePin(pin);
  if (!normalized || !hash || !salt) return false;
  const derived = scryptSync(normalized, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(stored, derived);
}
