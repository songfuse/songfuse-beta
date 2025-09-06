/**
 * Duration Utilities
 * 
 * This module provides utilities to normalize duration values across the application.
 * It ensures that all durations are properly converted to milliseconds for consistent display.
 */

/**
 * Normalize a duration value to milliseconds
 * 
 * This function handles various duration formats and converts them to milliseconds:
 * - If duration < 30000, it's likely in seconds and gets converted to milliseconds
 * - If duration >= 30000, it's already in milliseconds
 * 
 * @param duration The duration value from the database
 * @returns Duration in milliseconds
 */
export function normalizeDuration(duration: number | null | undefined): number {
  if (!duration || duration <= 0) {
    return 0;
  }
  
  // If the duration is less than 30 seconds (30000ms), it's likely stored in seconds
  // Convert it to milliseconds by multiplying by 1000
  if (duration < 30000) {
    return duration * 1000;
  }
  
  // If it's already a reasonable millisecond value, return as-is
  return duration;
}

/**
 * Format duration for track objects
 * 
 * This function creates a standardized duration object with multiple format fields
 * to ensure compatibility with all frontend components.
 * 
 * @param rawDuration The raw duration value from the database
 * @returns Object with duration in multiple formats
 */
export function formatTrackDuration(rawDuration: number | null | undefined) {
  const durationMs = normalizeDuration(rawDuration);
  
  return {
    duration_ms: durationMs,
    duration: durationMs,
    durationMs: durationMs
  };
}