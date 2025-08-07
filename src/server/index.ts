export { JWTService, createJWTService } from './jwt';
export { AuthMiddleware, createAuthMiddleware, type AuthRequest } from './middleware';
export { createAuthRoutes, type AuthRoutesOptions } from './routes';
export { OAuthService, createOAuthService } from './oauth';

// Re-export types
export type { User, JWTPayload, HeimdallOptions, DatabaseConfig } from '../types';
