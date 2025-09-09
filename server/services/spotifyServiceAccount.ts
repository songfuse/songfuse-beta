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
    if (this.tokenExpiresAt && this.tokenExpiresAt <= new Date()) {
      console.log('🔄 Spotify service account token expired, refreshing...');
      await this.refreshAccessToken();
    }

    // Only refresh if token is actually expired
    // Removed forced refresh as it might be causing issues

    return this.accessToken;
  }

  /**
   * Refresh the access token using the refresh token
   */
  private static async refreshAccessToken(): Promise<void> {
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
  } {
    return {
      configured: this.isConfigured(),
      hasAccessToken: !!this.accessToken,
      hasRefreshToken: !!this.refreshToken,
      tokenExpiresAt: this.tokenExpiresAt,
      isExpired: this.tokenExpiresAt ? this.tokenExpiresAt <= new Date() : true,
    };
  }
}

// Initialize the service account when the module is loaded
SpotifyServiceAccount.initialize();
