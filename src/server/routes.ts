import { Router, Request, Response } from 'express';
import type { HeimdallOptions } from '../types';
import { JWTService } from './jwt';
import { PostgresAdapter } from '../database/postgres-adapter';
import { AuthMiddleware } from './middleware';
import { OAuthService } from './oauth';

export interface AuthRoutesOptions extends HeimdallOptions {
    basePath?: string;
    enableHealthCheck?: boolean;
    enableUserManagement?: boolean;
}

export function createAuthRoutes(options: AuthRoutesOptions): Router {
    const router = Router();
    const { basePath = '/auth' } = options;

    // Initialize services
    const jwtService = new JWTService(options.jwt.secret, options.jwt.expiresIn);
    const database = new PostgresAdapter(options.database);
    const authMiddleware = new AuthMiddleware(jwtService, database);
    const oauthService = new OAuthService(options);

    // Initialize database tables
    database.initialize().catch(console.error);

    /**
     * Health check endpoint
     */
    if (options.enableHealthCheck !== false) {
        router.get(`${basePath}/health`, (_req: Request, res: Response) => {
            res.json({
                status: 'ok',
                service: 'heimdall-sso',
                timestamp: new Date().toISOString(),
                features: {
                    oauth: oauthService.getAllProviders(),
                    userManagement: options.enableUserManagement !== false,
                },
            });
        });
    }

    /**
     * Configuration endpoint - returns client-safe config
     */
    router.get(`${basePath}/config`, (_req: Request, res: Response) => {
        const providers: any = {};

        // Add Microsoft config if available
        if (options.oauth?.microsoft?.clientId) {
            providers.microsoft = {
                enabled: true,
                clientId: options.oauth.microsoft.clientId,
                tenantId: options.oauth.microsoft.tenantId || 'common',
                displayName: 'Microsoft',
            };
        }

        res.json({
            providers,
            branding: options.branding || {
                companyName: 'Your Company',
                loginTitle: 'Welcome',
                loginSubtitle: 'Sign in to continue',
            },
            features: options.features || {},
        });
    });

    /**
     * SSO login endpoint - creates/updates user and returns JWT
     */
    router.post(`${basePath}/sso-login`, async (req: Request, res: Response) => {
        try {
            const { email, name, provider = 'microsoft', avatar } = req.body;

            if (!email || !name) {
                res.status(400).json({ error: 'Email and name are required' });
                return;
            }

            // Check access control
            if (!oauthService.checkAccessControl(email)) {
                res.status(403).json({
                    error: 'Access denied',
                    message: 'Your email is not authorized to access this application',
                });
                return;
            }

            // Create or update user
            const user = await database.createOrUpdateUser(email, name, provider);

            if (!user) {
                res.status(500).json({ error: 'Failed to create or update user' });
                return;
            }

            // Generate JWT token
            const token = await jwtService.generateToken(user);

            res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    avatar: avatar || user.avatar,
                    provider,
                },
            });
        } catch (error) {
            console.error('SSO login error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    /**
     * Get current user
     */
    router.get(
        `${basePath}/me`,
        authMiddleware.authenticate as any,
        (req: Request, res: Response) => {
            const user = (req as any).user;
            res.json({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt,
                },
            });
        }
    );

    /**
     * Logout endpoint
     */
    router.post(`${basePath}/logout`, (_req: Request, res: Response) => {
        // Clear any server-side sessions if needed
        res.json({
            message: 'Logged out successfully',
            timestamp: new Date().toISOString(),
        });
    });

    /**
     * User management endpoints (if enabled)
     */
    if (options.enableUserManagement !== false) {
        // Get all users (super admin only)
        router.get(
            `${basePath}/users`,
            authMiddleware.authenticate as any,
            authMiddleware.requireSuperAdmin as any,
            async (_req: Request, res: Response) => {
                try {
                    const users = await database.getAllUsers();
                    res.json({ users });
                } catch (error) {
                    console.error('Failed to get users:', error);
                    res.status(500).json({ error: 'Failed to retrieve users' });
                }
            }
        );

        // Update user role (super admin only)
        router.put(
            `${basePath}/users/:userId/role`,
            authMiddleware.authenticate as any,
            authMiddleware.requireSuperAdmin as any,
            async (req: Request, res: Response) => {
                try {
                    const { userId } = req.params;
                    const { role } = req.body;

                    if (!['user', 'admin', 'super_admin'].includes(role)) {
                        res.status(400).json({ error: 'Invalid role' });
                        return;
                    }

                    // Prevent removing the last super admin
                    if (role !== 'super_admin') {
                        const allUsers = await database.getAllUsers();
                        const superAdmins = allUsers.filter(u => u.role === 'super_admin');

                        if (superAdmins.length === 1 && superAdmins[0].id.toString() === userId) {
                            res.status(400).json({
                                error: 'Cannot remove the last super admin',
                                message: 'At least one super admin must exist',
                            });
                            return;
                        }
                    }

                    const success = await database.updateUserRole(userId, role);

                    if (success) {
                        const updatedUser = await database.getUserById(userId);
                        res.json({ user: updatedUser });
                    } else {
                        res.status(404).json({ error: 'User not found' });
                    }
                } catch (error) {
                    console.error('Failed to update user role:', error);
                    res.status(500).json({ error: 'Failed to update user role' });
                }
            }
        );

        // Deactivate user (admin only)
        router.post(
            `${basePath}/users/:userId/deactivate`,
            authMiddleware.authenticate as any,
            authMiddleware.requireAdmin as any,
            async (req: Request, res: Response) => {
                try {
                    const { userId } = req.params;
                    const success = await database.deactivateUser(userId);

                    if (success) {
                        res.json({ message: 'User deactivated successfully' });
                    } else {
                        res.status(404).json({ error: 'User not found' });
                    }
                } catch (error) {
                    console.error('Failed to deactivate user:', error);
                    res.status(500).json({ error: 'Failed to deactivate user' });
                }
            }
        );

        // Reactivate user (admin only)
        router.post(
            `${basePath}/users/:userId/reactivate`,
            authMiddleware.authenticate as any,
            authMiddleware.requireAdmin as any,
            async (req: Request, res: Response) => {
                try {
                    const { userId } = req.params;
                    const success = await database.reactivateUser(userId);

                    if (success) {
                        res.json({ message: 'User reactivated successfully' });
                    } else {
                        res.status(404).json({ error: 'User not found' });
                    }
                } catch (error) {
                    console.error('Failed to reactivate user:', error);
                    res.status(500).json({ error: 'Failed to reactivate user' });
                }
            }
        );
    }

    // Apply rate limiting to auth endpoints
    router.use(`${basePath}/*`, authMiddleware.rateLimit(20, 60000)); // 20 requests per minute

    return router;
}
