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
 * Formats a date/time string to a readable format.
 *
 * @param dateTime - The date/time string or Date object to format.
 * @param options - Formatting options (optional).
 * @returns A formatted date/time string.
 */
export function formatDateTime(dateTime, options = {}) {
  if (!dateTime) return 'N/A';
  
  try {
    const date = new Date(dateTime);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options
    };
    
    return date.toLocaleDateString('en-US', defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid Date';
  }
}

/**
 * Formats a date/time string to a detailed readable format.
 *
 * @param dateTime - The date/time string or Date object to format.
 * @returns A detailed formatted date/time string.
 */
export function formatDateTimeDetailed(dateTime) {
  if (!dateTime) return 'N/A';
  
  try {
    const date = new Date(dateTime);
    
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    };
    
    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    console.error('Error formatting detailed date:', error);
    return 'Invalid Date';
  }
}

/**
 * Formats a date to a readable format (date only).
 *
 * @param date - The date string or Date object to format.
 * @returns A formatted date string.
 */
export function formatDate(date) {
  return formatDateTime(date, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Formats a time to a readable format (time only).
 *
 * @param time - The time string or Date object to format.
 * @returns A formatted time string.
 */
export function formatTime(time) {
  return formatDateTime(time, {
    hour: '2-digit',
    minute: '2-digit'
  });
}
