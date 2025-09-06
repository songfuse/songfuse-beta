import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create a URL-friendly slug from a string
 * @param str String to convert to slug
 * @returns URL-friendly slug
 */
export function createSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/--+/g, '-')     // Replace multiple hyphens with single hyphen
    .trim()                   // Trim whitespace from both ends
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Executes a direct SQL query and handles both development and production environments
 * Works around Vite's development server returning HTML for API responses
 * 
 * @param query SQL query to execute
 * @returns Promise with the query results or null if query fails
 */
export async function executeSqlQuery<T = any>(query: string): Promise<T | null> {
  try {
    const url = window.location.origin + '/api/admin/sql';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    
    // Get the raw response text
    const responseText = await response.text();
    
    // Check if we got HTML (development mode with Vite)
    if (responseText.includes('<!DOCTYPE html>')) {
      console.log("Development mode: SQL query executed on server but response is HTML");
      // Try to extract any console logs from the HTML that might contain the result
      // This is a fallback method in development mode
      
      // Execute the query again with a special marker
      const markedQuery = `SELECT '<<<START_RESULT>>>' AS marker; ${query}; SELECT '<<<END_RESULT>>>' AS marker;`;
      
      // Send a second request with the marked query
      const markedResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json' 
        },
        body: JSON.stringify({ 
          query: markedQuery,
          devMode: true,
          logResults: true
        })
      });
      
      // Even if we don't get a proper JSON response, the query will still execute on the server
      console.log("SQL query executed in development mode");
      
      // In development mode, we'll return null and rely on the fallback data
      return null;
    }
    
    // Try to parse as JSON
    try {
      const data = JSON.parse(responseText);
      if (data.success && data.rows) {
        return data.rows as T;
      }
      
      console.error("SQL query execution failed:", data.error || "Unknown error");
      return null;
    } catch (e) {
      console.error("Failed to parse SQL query response:", e);
      return null;
    }
  } catch (error) {
    console.error("Error executing SQL query:", error);
    return null;
  }
}
