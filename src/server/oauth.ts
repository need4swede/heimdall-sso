import type { OAuthUserInfo, HeimdallOptions } from '../types';

export interface OAuthProvider {
    name: string;
    getAuthUrl(state: string, codeChallenge?: string): string;
    exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<any>;
    getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

export class MicrosoftOAuthProvider implements OAuthProvider {
    name = 'microsoft';
    private clientId: string;
    private clientSecret?: string;
    private tenantId: string;
    private redirectUri: string;

    constructor(config: {
        clientId: string;
        clientSecret?: string;
        tenantId?: string;
        redirectUri: string;
    }) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.tenantId = config.tenantId || 'common';
        this.redirectUri = config.redirectUri;
    }

    getAuthUrl(state: string, codeChallenge?: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            response_mode: 'query',
            scope: 'openid profile email User.Read',
            state,
        });

        if (codeChallenge) {
            params.append('code_challenge', codeChallenge);
            params.append('code_challenge_method', 'S256');
        }

        return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params}`;
    }

    async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<any> {
        const params: any = {
            client_id: this.clientId,
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
            scope: 'openid profile email User.Read',
        };

        if (this.clientSecret) {
            params.client_secret = this.clientSecret;
        }

        if (codeVerifier) {
            params.code_verifier = codeVerifier;
        }

        const response = await fetch(
            `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams(params),
            }
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }

        return response.json();
    }

    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user info from Microsoft Graph');
        }

        const data = await response.json();

        return {
            id: data.id,
            email: data.mail || data.userPrincipalName,
            name: data.displayName,
            avatar: undefined, // Microsoft Graph doesn't return avatar in basic profile
            provider: 'microsoft',
        };
    }
}

export class OAuthService {
    private providers: Map<string, OAuthProvider> = new Map();

    constructor(private options: HeimdallOptions) {
        // Initialize Microsoft provider if configured
        if (options.oauth?.microsoft?.clientId) {
            this.registerProvider(
                new MicrosoftOAuthProvider({
                    clientId: options.oauth.microsoft.clientId,
                    clientSecret: options.oauth.microsoft.clientSecret,
                    tenantId: options.oauth.microsoft.tenantId,
                    redirectUri: '', // Will be set dynamically
                })
            );
        }
    }

    registerProvider(provider: OAuthProvider): void {
        this.providers.set(provider.name, provider);
    }

    getProvider(name: string): OAuthProvider | undefined {
        return this.providers.get(name);
    }

    getAllProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if user email is allowed based on access control rules
     */
    checkAccessControl(email: string): boolean {
        const { allowedDomains = [], allowedEmails = [] } = this.options.accessControl || {};

        // If no restrictions, allow all
        if (allowedDomains.length === 0 && allowedEmails.length === 0) {
            return true;
        }

        const emailLower = email.toLowerCase();
        const domain = emailLower.split('@')[1];

        // Check specific email allowlist
        if (allowedEmails.length > 0 && allowedEmails.includes(emailLower)) {
            return true;
        }

        // Check domain allowlist
        if (allowedDomains.length > 0 && allowedDomains.includes(domain)) {
            return true;
        }

        return false;
    }

    /**
     * Generate a random state for OAuth
     */
    generateState(): string {
        const array = new Uint8Array(32);
        if (typeof window !== 'undefined' && window.crypto) {
            window.crypto.getRandomValues(array);
        } else {
            // Node.js environment
            const crypto = require('crypto');
            crypto.randomFillSync(array);
        }
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generate PKCE code verifier
     */
    generateCodeVerifier(): string {
        const array = new Uint8Array(32);
        if (typeof window !== 'undefined' && window.crypto) {
            window.crypto.getRandomValues(array);
        } else {
            const crypto = require('crypto');
            crypto.randomFillSync(array);
        }
        return this.base64UrlEncode(array);
    }

    /**
     * Generate PKCE code challenge from verifier
     */
    async generateCodeChallenge(verifier: string): Promise<string> {
        if (typeof window !== 'undefined' && window.crypto) {
            const encoder = new TextEncoder();
            const data = encoder.encode(verifier);
            const hash = await window.crypto.subtle.digest('SHA-256', data);
            return this.base64UrlEncode(new Uint8Array(hash));
        } else {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(verifier).digest();
            return this.base64UrlEncode(hash);
        }
    }

    private base64UrlEncode(buffer: Uint8Array): string {
        const base64 = btoa(String.fromCharCode(...buffer));
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }
}

// Factory function
export function createOAuthService(options: HeimdallOptions): OAuthService {
    return new OAuthService(options);
}
