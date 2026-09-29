export function redact(input: string) {
  return input
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/g, "[proxy]")
    .replace(/password[=:]\s*\S+/gi, "password=[redacted]")
    .replace(/secret_ref[=:]\s*\S+/gi, "secret_ref=[redacted]");
}

export function logInfo(message: string) {
  console.log(redact(message));
}

const forbiddenKeys = new Set([
  "secretRef",
  "secret_ref",
  "password",
  "passwordHash",
  "password_hash",
  "host",
  "port",
  "proxyLogin",
  "proxyPassword",
  "refreshToken",
  "refresh_token",
  "accessToken",
  "access_token",
]);

export function assertNoSecrets(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) {
        throw new Error(`Secret field ${path}.${key}`);
      }
      assertNoSecrets(nested, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && /\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/.test(value)) {
    throw new Error(`Proxy endpoint in client payload at ${path}`);
  }
}
