/**
 * Spotify Service Account Manager
 * 
 * This service manages a dedicated Spotify account for transparent playlist imports.
 * Users don't need to connect their own Spotify accounts - we use our service account.
 */

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export class SpotifyServiceAccount {
  private static accessToken: string | null = null;
  private static refreshToken: string | null = null;
  private static tokenExpiresAt: Date | null = null;
  private static refreshTimer: NodeJS.Timeout | null = null;
  private static isRefreshing: boolean = false;

  /**
   * Initialize the service account with tokens from environment variables
   */
  static initialize(): void {
    this.accessToken = process.env.SPOTIFY_SERVICE_ACCESS_TOKEN || null;
    this.refreshToken = process.env.SPOTIFY_SERVICE_REFRESH_TOKEN || null;
    
    if (this.accessToken) {
      // Set expiration to 1 hour from now (Spotify tokens typically last 1 hour)
      this.tokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      console.log('✅ Spotify service account initialized with access token');
      
      // Start proactive token refresh
      this.startProactiveRefresh();
    } else {
      console.log('⚠️ Spotify service account not configured - playlist imports will require user authentication');
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   */
  static async getAccessToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Spotify service account not configured. Please set SPOTIFY_SERVICE_ACCESS_TOKEN and SPOTIFY_SERVICE_REFRESH_TOKEN in your environment variables.');
    }

    // Check if token is expired or will expire in the next 5 minutes
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    
    if (this.tokenExpiresAt && this.tokenExpiresAt <= fiveMinutesFromNow) {
      console.log('🔄 Spotify service account token expires soon, refreshing proactively...');
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  /**
   * Refresh the access token using the refresh token
   */
  private static async refreshAccessToken(): Promise<void> {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      console.log('🔄 Token refresh already in progress, waiting...');
      // Wait for the current refresh to complete
      while (this.isRefreshing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isRefreshing = true;

    try {
      if (!this.refreshToken) {
        throw new Error('No refresh token available for Spotify service account');
      }

      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Spotify client credentials not configured');
      }

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      });

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to refresh Spotify service account token: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: SpotifyTokenResponse = await response.json();
      
      this.accessToken = data.access_token;
      this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
      
      // Update refresh token if provided
      if (data.refresh_token) {
        this.refreshToken = data.refresh_token;
      }

      console.log('✅ Spotify service account token refreshed successfully');
      
      // Restart the proactive refresh timer with the new expiration time
      this.startProactiveRefresh();
      
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Start proactive token refresh timer
   * Refreshes the token 10 minutes before expiration
   */
  private static startProactiveRefresh(): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiresAt) {
      return;
    }

    // Calculate time until 10 minutes before expiration
    const now = new Date();
    const tenMinutesBeforeExpiry = new Date(this.tokenExpiresAt.getTime() - 10 * 60 * 1000);
    const timeUntilRefresh = tenMinutesBeforeExpiry.getTime() - now.getTime();

    if (timeUntilRefresh > 0) {
      console.log(`🕐 Scheduled token refresh in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);
      
      this.refreshTimer = setTimeout(async () => {
        try {
          console.log('🔄 Proactive token refresh triggered');
          await this.refreshAccessToken();
        } catch (error) {
          console.error('❌ Proactive token refresh failed:', error);
          // Retry in 5 minutes if refresh fails
          setTimeout(() => this.startProactiveRefresh(), 5 * 60 * 1000);
        }
      }, timeUntilRefresh);
    } else {
      // Token expires very soon, refresh immediately
      console.log('🔄 Token expires very soon, refreshing immediately');
      this.refreshAccessToken().catch(error => {
        console.error('❌ Immediate token refresh failed:', error);
      });
    }
  }

  /**
   * Stop the proactive refresh timer
   */
  static stopProactiveRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
      console.log('🛑 Proactive token refresh stopped');
    }
  }

  /**
   * Check if the service account is properly configured
   */
  static isConfigured(): boolean {
    return !!(this.accessToken && this.refreshToken);
  }

  /**
   * Get service account status for debugging
   */
  static getStatus(): {
    configured: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    tokenExpiresAt: Date | null;
    isExpired: boolean;
    isRefreshing: boolean;
    hasRefreshTimer: boolean;
    minutesUntilExpiry: number | null;
  } {
    const now = new Date();
    const minutesUntilExpiry = this.tokenExpiresAt 
      ? Math.round((this.tokenExpiresAt.getTime() - now.getTime()) / 1000 / 60)
      : null;

    return {
      configured: this.isConfigured(),
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      tokenExpiresAt: this.tokenExpiresAt,
      isExpired: this.tokenExpiresAt ? this.tokenExpiresAt <= new Date() : true,
      isRefreshing: this.isRefreshing,
      hasRefreshTimer: !!this.refreshTimer,
      minutesUntilExpiry,
    };
  }
}

// Initialize the service account when the module is loaded
// Note: This is now handled in server/index.ts to ensure environment variables are loaded first
// SpotifyServiceAccount.initialize();
