import jwt from 'jsonwebtoken';
import type { User, JWTPayload } from '../types';

export class JWTService {
    private secret: string;
    private expiresIn: string | number;

    constructor(secret: string, expiresIn: string | number = '7d') {
        if (!secret || secret.length < 32) {
            throw new Error('JWT secret must be at least 32 characters long');
        }
        this.secret = secret;
        this.expiresIn = expiresIn;
    }

    /**
     * Generate a JWT token for a user
     */
    async generateToken(user: User): Promise<string> {
        const payload: JWTPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };

        return jwt.sign(payload, this.secret, {
            expiresIn: this.expiresIn,
        } as jwt.SignOptions);
    }

    /**
     * Verify and decode a JWT token
     */
    async verifyToken(token: string): Promise<JWTPayload> {
        try {
            const decoded = jwt.verify(token, this.secret) as JWTPayload;
            return decoded;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Token has expired');
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    /**
     * Decode a token without verification (useful for debugging)
     */
    decodeToken(token: string): JWTPayload | null {
        try {
            return jwt.decode(token) as JWTPayload;
        } catch {
            return null;
        }
    }

    /**
     * Generate a refresh token with longer expiration
     */
    async generateRefreshToken(user: User): Promise<string> {
        const payload: JWTPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };

        return jwt.sign(payload, this.secret, {
            expiresIn: '30d', // Refresh tokens last longer
        });
    }

    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader?: string): string | null {
        if (!authHeader) return null;

        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }

    /**
     * Get token expiration time in seconds
     */
    getTokenExpiration(token: string): number | null {
        const decoded = this.decodeToken(token);
        return decoded?.exp || null;
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(token: string): boolean {
        const exp = this.getTokenExpiration(token);
        if (!exp) return true;

        return Date.now() >= exp * 1000;
    }
}

// Factory function for easier instantiation
export function createJWTService(secret: string, expiresIn?: string | number): JWTService {
    return new JWTService(secret, expiresIn);
}
