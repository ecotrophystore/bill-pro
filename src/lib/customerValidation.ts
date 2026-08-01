/**
 * Pure validation functions for customer fields.
 * These mirror the validation behaviour used by the existing Add Customer form.
 * No React dependencies — safe to use anywhere.
 */

// ─── Email ────────────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns null if valid, or an error message string if invalid.
 * Empty / undefined values are considered valid (field is optional).
 */
export function validateEmail(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') return null; // optional field
  if (!EMAIL_REGEX.test(value.trim())) {
    return 'Invalid email address format';
  }
  return null;
}

// ─── Phone ────────────────────────────────────────────────────────────────────

/**
 * Normalize a phone number to digits-only string.
 * Strips spaces, dashes, dots, parentheses, and leading '+'.
 */
export function normalizePhone(value: string): string {
  return value.replace(/[\s\-.()+]/g, '');
}

/**
 * Returns null if valid, or an error message string if invalid.
 * Empty / undefined values are considered valid (field is optional).
 * Accepts 10–13 digit numbers after normalization.
 */
export function validatePhone(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') return null; // optional field
  const digits = normalizePhone(value.trim());
  if (!/^\d{10,13}$/.test(digits)) {
    return 'Phone must be 10–13 digits';
  }
  return null;
}

// ─── GST Number ───────────────────────────────────────────────────────────────

/**
 * Standard Indian GSTIN regex: 15 characters.
 * Format: 2-digit state code + 10-char PAN + 1-digit entity + 'Z' + 1 checksum
 */
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Returns null if valid, or an error message string if invalid.
 * Empty / undefined values are considered valid (field is optional).
 */
export function validateGSTNumber(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') return null; // optional field
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 15) {
    return 'GST number must be exactly 15 characters';
  }
  if (!GST_REGEX.test(normalized)) {
    return 'Invalid GST number format (expected: 22AAAAA0000A1Z5)';
  }
  return null;
}

// ─── Customer Name ────────────────────────────────────────────────────────────

/**
 * Returns null if valid, or an error message string if invalid.
 * Customer name is the only required field.
 */
export function validateCustomerName(value: string | undefined | null): string | null {
  if (!value || value.trim() === '') {
    return 'Customer name is required';
  }
  if (value.trim().length < 2) {
    return 'Customer name must be at least 2 characters';
  }
  return null;
}

// ─── Composite Row Validation ─────────────────────────────────────────────────

export interface RowValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
}

/**
 * Validates all fields for a single customer row.
 * Returns a list of field-level errors (empty array = valid).
 */
export function validateCustomerRow(
  data: Partial<Record<string, string>>
): RowValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  const nameError = validateCustomerName(data['name']);
  if (nameError) errors.push({ field: 'name', message: nameError });

  const emailError = validateEmail(data['email']);
  if (emailError) errors.push({ field: 'email', message: emailError });

  const phoneError = validatePhone(data['phone']);
  if (phoneError) errors.push({ field: 'phone', message: phoneError });

  const gstError = validateGSTNumber(data['gst_number']);
  if (gstError) errors.push({ field: 'gst_number', message: gstError });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
