import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Helper function to handle API response errors
 * This function handles both JSON and HTML responses to provide better error messages
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    // Extract response text safely, considering it could be HTML
    let text: string;
    let errorObj: { error?: string, message?: string } | null = null;
    
    try {
      text = await res.text();
      
      // Try to parse as JSON first
      if (text && !text.startsWith('<!DOCTYPE') && !text.startsWith('<html')) {
        try {
          errorObj = JSON.parse(text);
        } catch (error) {
          const jsonError = error as Error;
          console.warn('Response not valid JSON:', text.substring(0, 150) + '...', jsonError.message);
        }
      }
      
      // Handle HTML responses
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        console.warn('Received HTML response instead of JSON:', text.substring(0, 150) + '...');
        // For debugging, log the URL that returned HTML
        console.warn(`URL returning HTML: ${res.url}`);
        text = 'Server returned HTML page instead of JSON. This is likely a server error.';
      }
    } catch (error) {
      text = 'Could not parse error response';
      console.error('Error parsing response text:', error);
    }
    
    // Extract error message from JSON if available
    const errorMessage = errorObj?.error || errorObj?.message || text || res.statusText;
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Always include Accept header to ensure we get JSON responses
  // Add Content-Type header only when sending data
  const headers: Record<string, string> = {
    "Accept": "application/json"
  };
  
  // Don't send body or Content-Type for GET/HEAD requests
  const shouldSendBody = method !== 'GET' && method !== 'HEAD' && data;
  
  if (shouldSendBody) {
    headers["Content-Type"] = "application/json";
  }
  
  console.log(`Making ${method} request to ${url} with headers:`, headers);
  
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: shouldSendBody ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
    
    // For debugging, check if the response might be HTML
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.warn(`Warning: Received HTML response from ${url} (status: ${res.status})`);
    }

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`Error in apiRequest to ${url}:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    console.log(`Query function making GET request to ${url}`);
    
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: {
          "Accept": "application/json"
        }
      });
  
      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }
  
      await throwIfResNotOk(res);
      
      try {
        return await res.json();
      } catch (error) {
        console.error(`Error parsing JSON from ${url}:`, error);
        throw new Error(`Failed to parse JSON response: ${(error as Error).message}`);
      }
    } catch (error) {
      console.error(`Query failed for ${url}:`, error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
