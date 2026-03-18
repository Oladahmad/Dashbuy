function normalize(message: string | undefined | null) {
  return (message ?? "").trim();
}

function lower(message: string | undefined | null) {
  return normalize(message).toLowerCase();
}

function readableFallback(prefix: string, message: string | undefined | null) {
  const clean = normalize(message).replace(/^authapierror:\s*/i, "");
  if (!clean) return prefix;
  return `${prefix} ${clean}`;
}

export function formatAuthError(message: string | undefined | null): string {
  const raw = normalize(message);
  const msg = lower(message);
  if (!msg) return "Something went wrong. Please try again.";

  if (msg.includes("database error saving new user")) {
    return "Your account could not be created because the authentication service could not save the new user. Please try again.";
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
    return "Account signup is currently disabled. Please contact support.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Check your internet connection and try again.";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Too many attempts were made. Wait a moment and try again.";
  }

  return readableFallback("Could not complete signup.", raw);
}

export function formatLoginError(message: string | undefined | null): string {
  const raw = normalize(message);
  const msg = lower(message);
  if (!msg) return "Could not sign in. Please try again.";

  if (msg.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }
  if (msg.includes("email not confirmed")) {
    return "Your email is not verified yet. Check your inbox and confirm your account first.";
  }
  if (msg.includes("user not found")) {
    return "No account was found with this email address.";
  }
  if (msg.includes("network") || msg.includes("fetch")) {
    return "Network error. Check your internet connection and try again.";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Too many sign-in attempts. Wait a moment and try again.";
  }

  return readableFallback("Could not sign in.", raw);
}

export function formatProfileSaveError(message: string | undefined | null): string {
  const raw = normalize(message);
  const msg = lower(message);
  if (!msg) return "Account created, but profile setup failed. Please sign in and complete your profile.";

  if (msg.includes("row-level security")) {
    return "Account was created, but profile permissions blocked setup. Please contact support.";
  }
  if (msg.includes("profiles_role_check")) {
    return "Account was created, but the selected account role was rejected.";
  }
  if (msg.includes("profiles_vendor_category_check")) {
    return "Account was created, but the vendor category value was rejected.";
  }
  if (msg.includes("null value") && msg.includes("store_name")) {
    return "Account was created, but store name was not saved. Please add a valid store name.";
  }
  if (msg.includes("null value") && msg.includes("phone")) {
    return "Account was created, but phone number was not saved. Please add a valid phone number.";
  }
  if (msg.includes("null value") && msg.includes("address")) {
    return "Account was created, but address was not saved. Please add a valid address.";
  }
  if (msg.includes("duplicate key")) {
    return "Account was created, but this profile already exists. Try signing in instead.";
  }
  if (msg.includes("violates")) {
    return "Account was created, but one or more profile fields were rejected. Please review your details and try again.";
  }

  return readableFallback("Account was created, but profile setup failed.", raw);
}
