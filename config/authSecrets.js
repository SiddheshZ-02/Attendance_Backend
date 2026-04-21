/**
 * Central JWT secrets — validated once at process startup.
 * Set JWT_SECRET and REFRESH_TOKEN_SECRET in .env (each ≥ 32 chars).
 */
const MIN_LENGTH = 32;

function readSecret(name) {
  const v = process.env[name];
  if (!v || typeof v !== 'string' || v.trim().length < MIN_LENGTH) {
    console.error(
      `[FATAL] ${name} is missing or shorter than ${MIN_LENGTH} characters. Add it to Backend/.env — see .env.example.`,
    );
    process.exit(1);
  }
  return v.trim();
}

const JWT_SECRET = readSecret('JWT_SECRET');
const REFRESH_TOKEN_SECRET = readSecret('REFRESH_TOKEN_SECRET');

module.exports = {
  JWT_SECRET,
  REFRESH_TOKEN_SECRET,
};
