// Shared by middleware (edge) and server code. No Node-only imports here.
const DEV_FALLBACK = "springer-finance-dev-only-secret-do-not-use-in-production";

let warned = false;

export function getJwtSecretString() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters. Set a long random JWT_SECRET in the environment."
    );
  }
  if (!warned) {
    warned = true;
    console.warn("[auth] JWT_SECRET is not set; using an insecure development-only secret.");
  }
  return DEV_FALLBACK;
}

export function getJwtSecretKey() {
  return new TextEncoder().encode(getJwtSecretString());
}
