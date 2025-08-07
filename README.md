# @need4swede/heimdall-sso

A portable, production-ready Single Sign-On (SSO) authentication package for React/Node applications. Drop it into any web application for enterprise-grade authentication in minutes.

## Features

- 🔐 **Microsoft OAuth 2.0** with PKCE flow
- 🎯 **JWT-based authentication** with secure token management
- 👥 **Role-based access control** (user, admin, super_admin)
- 🏢 **Domain/email access control** for enterprise security
- 🎨 **Customizable branding** via configuration
- 🐳 **Docker-ready** with PostgreSQL support
- ⚡ **TypeScript-first** with full type safety
- 🔄 **Framework agnostic** backend (Express compatible)
- ⚛️ **React hooks** for easy frontend integration

## Installation

```bash
npm install @need4swede/heimdall-sso
# or
yarn add @need4swede/heimdall-sso
```

## Quick Start

### 1. Backend Setup (Express)

```typescript
import express from 'express';
import { initializeHeimdallSSO } from '@need4swede/heimdall-sso';

const app = express();

// Initialize Heimdall SSO
const heimdall = initializeHeimdallSSO({
  database: {
    connectionString: process.env.DATABASE_URL,
    // or use individual settings:
    // host: 'localhost',
    // port: 5432,
    // database: 'myapp',
    // user: 'postgres',
    // password: 'password',
  },
  jwt: {
    secret: process.env.JWT_SECRET, // Min 32 characters
    expiresIn: '7d',
  },
  oauth: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET, // Optional for PKCE
      tenantId: process.env.MICROSOFT_TENANT_ID,
    },
  },
  accessControl: {
    allowedDomains: ['yourdomain.com'],
    allowedEmails: ['admin@external.com'],
  },
  branding: {
    companyName: 'Your Company',
    loginTitle: 'Welcome Back',
    loginSubtitle: 'Sign in to continue',
  },
});

// Add authentication routes
app.use(heimdall.routes);

// Protect your API routes
app.get('/api/protected',
  heimdall.middleware.authenticate,
  (req, res) => {
    res.json({ user: req.user });
  }
);

// Admin-only routes
app.get('/api/admin',
  heimdall.middleware.authenticate,
  heimdall.middleware.requireAdmin,
  (req, res) => {
    res.json({ message: 'Admin access granted' });
  }
);

app.listen(3000);
```

### 2. Frontend Setup (React)

```tsx
import React from 'react';
import { HeimdallProvider, useAuth, ProtectedRoute } from '@need4swede/heimdall-sso';

// Wrap your app with the provider
function App() {
  return (
    <HeimdallProvider
      apiUrl="/auth"
      tokenStorage="localStorage"
      onAuthStateChange={(user) => console.log('Auth state changed:', user)}
    >
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute requiredRole="user">
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute requiredRole="admin">
              <AdminPanel />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </HeimdallProvider>
  );
}

// Use the auth hook in your components
function LoginPage() {
  const { login, isLoading, loginError } = useAuth();

  return (
    <div>
      <button onClick={() => login('microsoft')} disabled={isLoading}>
        Sign in with Microsoft
      </button>
      {loginError && <p>Error: {loginError}</p>}
    </div>
  );
}

function Dashboard() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <div>
      <h1>Welcome, {user?.name}!</h1>
      <p>Role: {user?.role}</p>
      {isAdmin && <a href="/admin">Admin Panel</a>}
      <button onClick={logout}>Sign Out</button>
    </div>
  );
}
```

### 3. Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp

# JWT
JWT_SECRET=your-super-secret-key-at-least-32-characters-long

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret  # Optional for PKCE
MICROSOFT_TENANT_ID=your-tenant-id  # or 'common' for multi-tenant

# Access Control (optional)
SSO_ALLOWED_DOMAINS=yourdomain.com,partner.com
SSO_ALLOWED_EMAILS=external.admin@gmail.com
```

## API Reference

### Backend

#### `initializeHeimdallSSO(options)`

Creates and configures all authentication services.

**Options:**
- `database`: Database configuration (PostgreSQL)
- `jwt`: JWT configuration (secret, expiresIn)
- `oauth`: OAuth provider settings
- `accessControl`: Domain and email restrictions
- `branding`: UI customization options

**Returns:**
- `routes`: Express router with auth endpoints
- `middleware`: Authentication middleware functions
- `database`: Database adapter instance
- `jwt`: JWT service instance

#### Authentication Endpoints

- `GET /auth/config` - Get client configuration
- `POST /auth/sso-login` - SSO login endpoint
- `GET /auth/me` - Get current user
- `POST /auth/logout` - Logout
- `GET /auth/health` - Health check

#### User Management Endpoints (Super Admin only)

- `GET /auth/users` - List all users
- `PUT /auth/users/:id/role` - Update user role
- `POST /auth/users/:id/deactivate` - Deactivate user
- `POST /auth/users/:id/reactivate` - Reactivate user

### Frontend

#### `<HeimdallProvider>`

React context provider for authentication.

**Props:**
- `apiUrl`: Base URL for auth API (default: `/auth`)
- `tokenStorage`: Where to store tokens (`localStorage`, `sessionStorage`, `memory`)
- `onAuthStateChange`: Callback when auth state changes

#### `useAuth()`

React hook for authentication.

**Returns:**
- `user`: Current user object
- `isLoading`: Loading state
- `isAuthenticated`: Authentication status
- `login(provider)`: Login function
- `logout()`: Logout function
- `token`: Current JWT token
- `isAdmin`: Admin status
- `isSuperAdmin`: Super admin status
- `role`: User role
- `loginError`: Login error message
- `clearLoginError()`: Clear error
- `config`: SSO configuration

#### `<ProtectedRoute>`

Component for protecting routes.

**Props:**
- `requiredRole`: Minimum required role (`user`, `admin`, `super_admin`)
- `fallback`: Component to show when access denied

## Database Schema

The package automatically creates the following tables:

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  avatar TEXT,
  provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Sessions table
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Advanced Usage

### Custom Middleware

```typescript
// Create custom middleware using the auth services
const customMiddleware = async (req, res, next) => {
  const user = req.user; // Set by authenticate middleware

  // Custom logic here
  if (user.email.endsWith('@special.com')) {
    req.isSpecialUser = true;
  }

  next();
};

app.use(
  heimdall.middleware.authenticate,
  customMiddleware,
  yourRouteHandler
);
```

### Direct Service Access

```typescript
// Access services directly
const { database, jwt } = heimdall;

// Custom database query
const users = await database.getAllUsers();

// Generate custom token
const token = await jwt.generateToken(user);

// Verify token manually
const payload = await jwt.verifyToken(token);
```

### Rate Limiting

```typescript
// Apply rate limiting to routes
app.use('/api', heimdall.middleware.rateLimit(100, 60000)); // 100 requests per minute
```

## Security Best Practices

1. **JWT Secret**: Use a strong, random secret at least 32 characters long
2. **HTTPS**: Always use HTTPS in production
3. **Access Control**: Configure domain/email restrictions for enterprise security
4. **Token Storage**: Use `httpOnly` cookies for maximum security
5. **Rate Limiting**: Apply rate limiting to prevent abuse
6. **Regular Updates**: Keep the package and dependencies updated

## Migration from Existing Auth

1. Export existing users to match the schema
2. Set up the database tables
3. Import users with proper role assignments
4. Update your frontend to use Heimdall components
5. Replace backend auth logic with Heimdall middleware

## Troubleshooting

### Common Issues

**"Token has expired"**
- Tokens expire after the configured duration
- Implement token refresh or re-authentication

**"Access denied" errors**
- Check `SSO_ALLOWED_DOMAINS` and `SSO_ALLOWED_EMAILS`
- Verify the user's email domain is allowed

**Database connection issues**
- Verify PostgreSQL is running
- Check connection string format
- Ensure database exists

## Contributing

Contributions are welcome! Please submit pull requests or issues on GitHub.

## License

MIT © @need4swede

## Support

For issues and questions, please use the GitHub issue tracker.
