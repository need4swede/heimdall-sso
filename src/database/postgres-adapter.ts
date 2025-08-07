import { Pool, PoolConfig } from 'pg';
import type { User, DatabaseConfig } from '../types';

export class PostgresAdapter {
    private pool: Pool;

    constructor(config: DatabaseConfig) {
        const poolConfig: PoolConfig = config.connectionString
            ? { connectionString: config.connectionString, ssl: config.ssl }
            : {
                host: config.host || 'localhost',
                port: config.port || 5432,
                database: config.database || 'heimdall',
                user: config.user || 'postgres',
                password: config.password,
                ssl: config.ssl,
            };

        this.pool = new Pool(poolConfig);
    }

    /**
     * Initialize database tables
     */
    async initialize(): Promise<void> {
        const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
        avatar TEXT,
        provider VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      );
    `;

        const createSessionsTable = `
      CREATE TABLE IF NOT EXISTS user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

        const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `;

        try {
            await this.pool.query(createUsersTable);
            await this.pool.query(createSessionsTable);
            await this.pool.query(createIndexes);
            console.log('✅ Database tables initialized');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            throw error;
        }
    }

    /**
     * Create or update a user
     */
    async createOrUpdateUser(email: string, name: string, provider?: string): Promise<User | null> {
        try {
            // Check if user exists
            const existingUser = await this.getUserByEmail(email);

            if (existingUser) {
                // Update existing user
                const updateQuery = `
          UPDATE users
          SET name = $1, last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE email = $2
          RETURNING *
        `;
                const result = await this.pool.query(updateQuery, [name, email]);
                return result.rows[0];
            } else {
                // Check if this is the first user (make them super_admin)
                const countResult = await this.pool.query('SELECT COUNT(*) FROM users');
                const userCount = parseInt(countResult.rows[0].count);
                const role = userCount === 0 ? 'super_admin' : 'user';

                // Create new user
                const insertQuery = `
          INSERT INTO users (email, name, role, provider, last_login)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
          RETURNING *
        `;
                const result = await this.pool.query(insertQuery, [email, name, role, provider || 'microsoft']);
                return result.rows[0];
            }
        } catch (error) {
            console.error('Failed to create/update user:', error);
            return null;
        }
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<User | null> {
        try {
            const query = 'SELECT * FROM users WHERE email = $1';
            const result = await this.pool.query(query, [email]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Failed to get user by email:', error);
            return null;
        }
    }

    /**
     * Get user by ID
     */
    async getUserById(id: number | string): Promise<User | null> {
        try {
            const query = 'SELECT * FROM users WHERE id = $1';
            const result = await this.pool.query(query, [id]);
            return result.rows[0] || null;
        } catch (error) {
            console.error('Failed to get user by ID:', error);
            return null;
        }
    }

    /**
     * Get all users
     */
    async getAllUsers(): Promise<User[]> {
        try {
            const query = 'SELECT * FROM users ORDER BY created_at DESC';
            const result = await this.pool.query(query);
            return result.rows;
        } catch (error) {
            console.error('Failed to get all users:', error);
            return [];
        }
    }

    /**
     * Update user role
     */
    async updateUserRole(userId: number | string, role: 'user' | 'admin' | 'super_admin'): Promise<boolean> {
        try {
            const query = `
        UPDATE users
        SET role = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `;
            const result = await this.pool.query(query, [role, userId]);
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Failed to update user role:', error);
            return false;
        }
    }

    /**
     * Delete user
     */
    async deleteUser(userId: number | string): Promise<boolean> {
        try {
            const query = 'DELETE FROM users WHERE id = $1';
            const result = await this.pool.query(query, [userId]);
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Failed to delete user:', error);
            return false;
        }
    }

    /**
     * Deactivate user
     */
    async deactivateUser(userId: number | string): Promise<boolean> {
        try {
            const query = `
        UPDATE users
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
            const result = await this.pool.query(query, [userId]);
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Failed to deactivate user:', error);
            return false;
        }
    }

    /**
     * Reactivate user
     */
    async reactivateUser(userId: number | string): Promise<boolean> {
        try {
            const query = `
        UPDATE users
        SET is_active = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
            const result = await this.pool.query(query, [userId]);
            return (result.rowCount ?? 0) > 0;
        } catch (error) {
            console.error('Failed to reactivate user:', error);
            return false;
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions(): Promise<void> {
        try {
            const query = 'DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP';
            await this.pool.query(query);
        } catch (error) {
            console.error('Failed to cleanup expired sessions:', error);
        }
    }

    /**
     * Close database connection
     */
    async close(): Promise<void> {
        await this.pool.end();
    }
}

// Factory function
export function createPostgresAdapter(config: DatabaseConfig): PostgresAdapter {
    return new PostgresAdapter(config);
}
