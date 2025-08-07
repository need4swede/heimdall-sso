// Server exports
export {
    JWTService,
    createJWTService,
    AuthMiddleware,
    createAuthMiddleware,
    createAuthRoutes,
    OAuthService,
    createOAuthService,
    type AuthRequest,
    type AuthRoutesOptions,
} from './server';

// Database exports
export {
    PostgresAdapter,
    createPostgresAdapter,
} from './database';

// Client exports (React components)
export {
    HeimdallProvider,
    useAuth,
    ProtectedRoute,
} from './client';

// Type exports
export type {
    User,
    AuthUser,
    SSOConfig,
    SSOProvider,
    OAuthCallbackData,
    OAuthTokenResponse,
    OAuthUserInfo,
    JWTPayload,
    DatabaseConfig,
    HeimdallOptions,
} from './types';

// Main initialization function
import type { HeimdallOptions } from './types';
import { createAuthRoutes } from './server';
import { createPostgresAdapter } from './database';
import { createJWTService } from './server';
import { createAuthMiddleware } from './server';

export interface HeimdallSSO {
    routes: ReturnType<typeof createAuthRoutes>;
    middleware: ReturnType<typeof createAuthMiddleware>;
    database: ReturnType<typeof createPostgresAdapter>;
    jwt: ReturnType<typeof createJWTService>;
}

/**
 * Initialize Heimdall SSO with all services
 */
export function initializeHeimdallSSO(options: HeimdallOptions): HeimdallSSO {
    const database = createPostgresAdapter(options.database);
    const jwt = createJWTService(options.jwt.secret, options.jwt.expiresIn);
    const middleware = createAuthMiddleware(jwt, database);
    const routes = createAuthRoutes({
        ...options,
        basePath: '/auth',
        enableHealthCheck: true,
        enableUserManagement: true,
    });

    // Initialize database tables
    database.initialize().catch(console.error);

    return {
        routes,
        middleware,
        database,
        jwt,
    };
}
