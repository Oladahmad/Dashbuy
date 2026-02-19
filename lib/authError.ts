export function formatAuthError(message: string | undefined | null): string {
  const msg = (message ?? "").toLowerCase();
  if (!msg) return "Something went wrong. Please try again.";

  if (msg.includes("database error saving new user")) {
    return "We could not create your account right now. Please try again in a moment.";
  }
  if (msg.includes("user already registered") || msg.includes("already been registered")) {
    return "This email is already registered. Please sign in instead.";
  }
  if (msg.includes("password") && msg.includes("6")) {
    return "Password must be at least 6 characters.";
  }
  if (msg.includes("invalid email") || msg.includes("email address is invalid")) {
    return "Please enter a valid email address.";
  }
  if (msg.includes("signup is disabled")) {
    return "Signup is currently disabled. Please contact support.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Check your connection and try again.";
  }

  return "Could not complete signup. Please check your details and try again.";
}

export function formatProfileSaveError(message: string | undefined | null): string {
  const msg = (message ?? "").toLowerCase();
  if (!msg) return "Account created, but profile setup failed. Please sign in and complete your profile.";

  if (msg.includes("row-level security")) {
    return "Account created, but profile permissions blocked setup. Please contact support.";
  }
  if (msg.includes("violates")) {
    return "Account created, but some profile fields were rejected. Please sign in and update your profile.";
  }

  return "Account created, but profile setup failed. Please sign in and complete your profile.";
}
