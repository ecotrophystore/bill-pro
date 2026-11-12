/**
 * Shared WhatsApp business number normalization, matching, and display formatting helpers.
 */

export function normalizeWhatsAppDigits(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

export function extractLast10Digits(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function doesWhatsAppNumberMatch(a?: string | null, b?: string | null): boolean {
  const a10 = extractLast10Digits(a);
  const b10 = extractLast10Digits(b);
  if (!a10 || !b10) return false;
  return a10 === b10;
}

export function formatWhatsAppNumberDisplay(raw?: string | null): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return `+${digits}`;
}

