const required = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "AUTH_TRUST_HOST",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
];

const errors = [];
const placeholderPattern = /(replace|example\.com|your-|browser-test|phase-20|ci-browser)/i;
const localHost = (hostname) => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || /^127\./.test(host) || host.startsWith("::ffff:127.");
};

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value) errors.push(`${key} is missing.`);
  else if (placeholderPattern.test(value)) errors.push(`${key} still contains a placeholder value.`);
}

function validateDatabaseUrl(key) {
  const value = process.env[key];
  if (!value) return;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) errors.push(`${key} must use PostgreSQL.`);
    if (localHost(url.hostname)) errors.push(`${key} must not target a local database for production.`);
    if (!url.hostname || !url.username || url.pathname.length < 2) errors.push(`${key} must specify a database host, user and database name.`);
    const sslModes = url.searchParams.getAll("sslmode");
    if (sslModes.length !== 1 || !["require", "verify-ca", "verify-full"].includes(sslModes[0])) errors.push(`${key} must require TLS with sslmode=require, verify-ca, or verify-full.`);
    if (url.searchParams.getAll("ssl").some((value) => ["false", "0", "disable"].includes(value.toLowerCase()))) errors.push(`${key} must not disable TLS.`);
  } catch {
    errors.push(`${key} is not a valid database URL.`);
  }
}

validateDatabaseUrl("DATABASE_URL");
validateDatabaseUrl("DIRECT_URL");

if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) errors.push("AUTH_SECRET must be at least 32 characters.");
if (process.env.AUTH_TRUST_HOST && process.env.AUTH_TRUST_HOST !== "true") errors.push("AUTH_TRUST_HOST must be true behind the production proxy.");
if (process.env.AUTH_URL) {
  try {
    const url = new URL(process.env.AUTH_URL);
    if (url.protocol !== "https:" || localHost(url.hostname)) errors.push("AUTH_URL must use HTTPS on a non-local host.");
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") errors.push("AUTH_URL must be a canonical origin without credentials, a path, query or fragment.");
  } catch {
    errors.push("AUTH_URL is not a valid URL.");
  }
}
if (["1", "true"].includes((process.env.INNGEST_DEV ?? "").toLowerCase())) errors.push("INNGEST_DEV must be unset in production.");

const resendKeys = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_WEBHOOK_SECRET"];
if (resendKeys.some((key) => process.env[key]?.trim())) {
  for (const key of resendKeys) if (!process.env[key]?.trim()) errors.push(`${key} is required when Resend delivery is configured.`);
  if (process.env.RESEND_FROM_EMAIL && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(process.env.RESEND_FROM_EMAIL.match(/<([^<>]+)>$/)?.[1] ?? process.env.RESEND_FROM_EMAIL)) errors.push("RESEND_FROM_EMAIL must contain a valid sender address.");
}

if (errors.length) {
  console.error("Production environment check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Production environment check passed (${required.length} required variables validated; secret values were not printed).`);
