// Core types for Heimdall SSO

export interface User {
    id: number | string;
    email: string;
    name: string;
    role: 'user' | 'admin' | 'super_admin';
    avatar?: string;
    provider?: string;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    lastLogin?: Date | string;
    isActive?: boolean;
}

export interface AuthUser extends User {
    isAdmin: boolean;
    isSuperAdmin: boolean;
}

export interface SSOProvider {
    enabled: boolean;
    clientId: string;
    tenantId?: string;
    displayName: string;
    buttonText?: string;
}

export interface SSOConfig {
    providers: {
        microsoft?: SSOProvider;
        google?: SSOProvider;
        github?: SSOProvider;
        [key: string]: SSOProvider | undefined;
    };
    branding?: {
        companyName?: string;
        logoUrl?: string;
        primaryColor?: string;
        loginTitle?: string;
        loginSubtitle?: string;
        customCss?: string;
        footer?: string;
    };
    features?: {
        enableEmailLogin?: boolean;
        enableRegistration?: boolean;
        requireEmailVerification?: boolean;
    };
    accessControl?: {
        allowedDomains?: string[];
        allowedEmails?: string[];
    };
}

export interface OAuthCallbackData {
    code: string;
    state: string;
    codeVerifier?: string;
    redirectUri?: string;
}

export interface OAuthTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
    id_token?: string;
}

export interface OAuthUserInfo {
    id: string;
    email: string;
    name: string;
    avatar?: string;
    provider: string;
}

export interface JWTPayload {
    userId: number | string;
    email: string;
    role: string;
    iat?: number;
    exp?: number;
}

export interface DatabaseConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface HeimdallOptions {
    database: DatabaseConfig;
    jwt: {
        secret: string;
        expiresIn?: string | number;
    };
    oauth?: {
        microsoft?: {
            clientId: string;
            clientSecret?: string;
            tenantId?: string;
        };
        google?: {
            clientId: string;
            clientSecret: string;
        };
        github?: {
            clientId: string;
            clientSecret: string;
        };
    };
    accessControl?: {
        allowedDomains?: string[];
        allowedEmails?: string[];
    };
    branding?: SSOConfig['branding'];
    features?: SSOConfig['features'];
}

// Express extension
declare global {
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}
