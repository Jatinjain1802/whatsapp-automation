import { parsePhoneNumberFromString } from 'libphonenumber-js';

// Normalize to E.164 (+919876543210). Default region IN because the primary
// market is India; pass another ISO country code per-business if needed.
export function normalizePhone(raw, defaultCountry = 'IN') {
  if (!raw) return null;
  const cleaned = String(raw).trim();
  if (!cleaned) return null;
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // E.164
}
