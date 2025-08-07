import { Request, Response, NextFunction } from 'express';
import type { User } from '../types';
import type { JWTService } from './jwt';
import type { PostgresAdapter } from '../database/postgres-adapter';

export interface AuthRequest extends Request {
    user?: User;
}

export class AuthMiddleware {
    constructor(
        private jwtService: JWTService,
        private database: PostgresAdapter
    ) { }

    /**
     * Main authentication middleware
     */
    authenticate = async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            // Try to get token from multiple sources
            let token = this.extractToken(req);

            if (!token) {
                res.status(401).json({ error: 'No authentication token provided' });
                return;
            }

            // Verify the token
            const payload = await this.jwtService.verifyToken(token);

            // Get user from database
            const user = await this.database.getUserById(payload.userId);

            if (!user) {
                res.status(401).json({ error: 'User not found' });
                return;
            }

            if (!user.isActive) {
                res.status(403).json({ error: 'User account is deactivated' });
                return;
            }

            // Attach user to request
            req.user = user;
            next();
        } catch (error) {
            if (error instanceof Error) {
                if (error.message === 'Token has expired') {
                    res.status(401).json({ error: 'Token has expired' });
                    return;
                }
                if (error.message === 'Invalid token') {
                    res.status(401).json({ error: 'Invalid token' });
                    return;
                }
            }
            res.status(500).json({ error: 'Authentication failed' });
        }
    };

    /**
     * Middleware to require admin role
     */
    requireAdmin = async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        next();
    };

    /**
     * Middleware to require super admin role
     */
    requireSuperAdmin = async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (req.user.role !== 'super_admin') {
            res.status(403).json({ error: 'Super admin access required' });
            return;
        }

        next();
    };

    /**
     * Optional authentication - doesn't fail if no token
     */
    optionalAuth = async (
        req: AuthRequest,
        _res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            const token = this.extractToken(req);

            if (token) {
                const payload = await this.jwtService.verifyToken(token);
                const user = await this.database.getUserById(payload.userId);

                if (user && user.isActive) {
                    req.user = user;
                }
            }
        } catch {
            // Ignore errors for optional auth
        }

        next();
    };

    /**
     * Extract token from request
     */
    private extractToken(req: Request): string | null {
        // 1. Check Authorization header
        const authHeader = req.headers.authorization;
        const headerToken = this.jwtService.extractTokenFromHeader(authHeader);
        if (headerToken) return headerToken;

        // 2. Check cookies
        if (req.cookies?.auth_token) {
            return req.cookies.auth_token;
        }

        // 3. Check query parameter (for special cases like downloads)
        if (req.query.token && typeof req.query.token === 'string') {
            return req.query.token;
        }

        // 4. Check custom header
        const customHeader = req.headers['x-auth-token'];
        if (customHeader && typeof customHeader === 'string') {
            return customHeader;
        }

        return null;
    }

    /**
     * Rate limiting middleware
     */
    rateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
        const requests = new Map<string, { count: number; resetTime: number }>();

        return (req: Request, res: Response, next: NextFunction) => {
            const identifier = req.ip || 'unknown';
            const now = Date.now();

            const userRequests = requests.get(identifier);

            if (!userRequests || now > userRequests.resetTime) {
                requests.set(identifier, {
                    count: 1,
                    resetTime: now + windowMs,
                });
                next();
                return;
            }

            if (userRequests.count >= maxRequests) {
                res.status(429).json({
                    error: 'Too many requests',
                    retryAfter: Math.ceil((userRequests.resetTime - now) / 1000),
                });
                return;
            }

            userRequests.count++;
            next();
        };
    }
}

// Factory function
export function createAuthMiddleware(
    jwtService: JWTService,
    database: PostgresAdapter
): AuthMiddleware {
    return new AuthMiddleware(jwtService, database);
}
