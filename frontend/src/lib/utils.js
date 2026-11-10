import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class names, resolving any conflicts.
 *
 * @param inputs - An array of class names to merge.
 * @returns A string of merged and optimized class names.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * The one date/time format used across the app, matching the backend and
 * pygeoapi: UTC to the second, e.g. 2026-07-28T04:06:50Z. A plain date
 * (yyyy-mm-dd) is midnight UTC, e.g. 2026-07-28T00:00:00Z.
 *
 * @param dateTime - The date/time string or Date object to format.
 * @returns The formatted string, 'N/A' when empty or 'Invalid Date'.
 */
export function formatDateTime(dateTime) {
  if (!dateTime) return 'N/A';
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Same as formatDateTime (kept for existing callers). */
export function formatDateTimeDetailed(dateTime) {
  return formatDateTime(dateTime);
}

/** Same as formatDateTime - dates are shown with their (midnight) UTC time. */
export function formatDate(date) {
  return formatDateTime(date);
}

/** Just the UTC time part, e.g. 04:06:50Z. */
export function formatTime(time) {
  const formatted = formatDateTime(time);
  return formatted.includes('T') ? formatted.split('T')[1] : formatted;
}
