import { createHash, randomInt } from "crypto";

export const HIGH_VALUE_WALLET_OTP_THRESHOLD = 50000;

export function generateWalletOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashWalletOtp(code: string) {
  return createHash("sha256").update(String(code).trim()).digest("hex");
}

export function isValidWalletOtp(code: string) {
  return /^\d{6}$/.test(String(code ?? "").trim());
}
