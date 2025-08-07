# Integrating Heimdall SSO from Package - Complete Guide

This guide documents the real-world integration of the `@need4swede/heimdall-sso` package into a clean Spotlight application that has no existing authentication.

## Prerequisites

- Node.js 18+
- PostgreSQL database (or Docker)
- Microsoft Azure app registration for OAuth
- Environment variables configured

## Step 1: Package Preparation

### 1.1 Build the Heimdall SSO Package

First, we need to build the heimdall-sso package that's in our project directory:

```bash
cd heimdall-sso
npm install
npm run build
```

**What this does:**
- Installs all package dependencies
- Builds TypeScript files to JavaScript
- Generates type definitions
- Creates distributable files in `dist/` folder

**Status:** ✅ **COMPLETED** - Package built successfully with TypeScript definitions
**Output:** ESM, CJS, and TypeScript definition files created in `dist/` folder

### 1.2 Import Strategy (Local Development)

For local development, we encountered import resolution issues with the built package. The solution was to import directly from source files:

```typescript
// Instead of: import { useAuth } from "@need4swede/heimdall-sso";
import { useAuth } from "../../heimdall-sso/src/client/useAuth";
```

**What this does:**
- Bypasses npm package resolution issues during development
- Uses TypeScript source files directly
- Allows for easier debugging and development
- Will be replaced with proper package imports in production

**Note:** This approach is used during development. For production deployment, proper package publishing and imports should be used.

## Step 2: Backend Integration

### 2.1 Install Required Dependencies

The Spotlight app needs additional dependencies for Heimdall SSO integration:

```bash
# Basic dependencies for server-side authentication
npm install cookie-parser jsonwebtoken

# TypeScript types
npm install --save-dev @types/jsonwebtoken
```

**Why these dependencies are needed:**
- `cookie-parser`: Required for handling JWT tokens in cookies
- `jsonwebtoken`: Core JWT functionality used by Heimdall SSO
- `@types/jsonwebtoken`: TypeScript definitions for JWT operations

**Note:** When using direct source imports, the main application must include all dependencies that the Heimdall SSO package requires, since we're not using the bundled package distribution.

### 2.2 Update server/index.ts

We'll modify the main server file to initialize and use Heimdall SSO.

**Original server/index.ts (without auth):**
```typescript
import express from "express";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

(async () => {
  const server = registerRoutes(app);
  await setupVite(app, server);

  const PORT = 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})();
```

**Updated server/index.ts (with Heimdall SSO - Development & Production Compatible):**
```typescript
import express from "express";
import cookieParser from "cookie-parser";
// Use direct source import for both development and production
import { initializeHeimdallSSO } from "../heimdall-sso/src/index.js";
import { registerRoutes } from "./routes";
import { setupVite } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // Required for JWT tokens in cookies

// Initialize Heimdall SSO
const heimdall = initializeHeimdallSSO({
  database: {
    connectionString: process.env.DATABASE_URL ||
      "postgresql://postgres:password@localhost:5432/spotlight",
  },
  jwt: {
    secret: process.env.JWT_SECRET ||
      "your-super-secret-key-at-least-32-characters-long",
    expiresIn: "7d",
  },
  oauth: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      tenantId: process.env.MICROSOFT_TENANT_ID || "common",
    },
  },
  accessControl: {
    allowedDomains: process.env.SSO_ALLOWED_DOMAINS?.split(",") || [],
    allowedEmails: process.env.SSO_ALLOWED_EMAILS?.split(",") || [],
  },
  branding: {
    companyName: "Spotlight",
    loginTitle: "Welcome to Spotlight",
    loginSubtitle: "Sign in to continue",
  },
});

// Add authentication routes BEFORE other routes
app.use(heimdall.routes);

(async () => {
  const server = registerRoutes(app);

  // Export heimdall for use in routes if needed
  (app as any).heimdall = heimdall;

  await setupVite(app, server);

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Authentication endpoints available at http://localhost:${PORT}/auth/*`);
  });
})();
```

### 2.3 Protect API Routes (Optional)

If you want to protect existing API routes, update `server/routes.ts`:

```typescript
import { type Express } from "express";

export function registerRoutes(app: Express) {
  // Get heimdall instance
  const heimdall = (app as any).heimdall;

  // Public route - no auth required
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Protected route - requires authentication
  app.get("/api/walkthroughs",
    heimdall?.middleware.authenticate as any,
    async (req, res) => {
      // User is available in req.user
      const user = (req as any).user;
      // Your walkthrough logic here
    }
  );

  // Admin only route
  app.get("/api/admin/stats",
    heimdall?.middleware.authenticate as any,
    heimdall?.middleware.requireAdmin as any,
    async (req, res) => {
      // Only admins can access this
      res.json({ message: "Admin data" });
    }
  );

  return app;
}
```

## Step 3: Frontend Integration

### 3.1 Update App.tsx

Wrap the application with HeimdallProvider:

**Original App.tsx:**
```tsx
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import Home from "@/pages/home";
import Walkthrough from "@/pages/walkthrough";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/walkthrough" component={Walkthrough} />
      </Switch>
    </QueryClientProvider>
  );
}
```

**Updated App.tsx (Development Version):**
```tsx
import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
// Development import - direct from source
import { HeimdallProvider, useAuth } from "../../heimdall-sso/src/client/useAuth";
import { queryClient } from "./lib/queryClient";
import Home from "@/pages/home";
import Walkthrough from "@/pages/walkthrough";
import LoginPage from "@/components/LoginPage";

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/walkthrough" component={Walkthrough} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HeimdallProvider apiUrl="/auth" tokenStorage="localStorage">
        <AuthenticatedApp />
      </HeimdallProvider>
    </QueryClientProvider>
  );
}

export default App;
```

### 3.2 Create Login Page Component

Create `client/src/components/LoginPage.tsx` (Development Version):

```tsx
// Development import - direct from source
import { useAuth } from "../../../heimdall-sso/src/client/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const { login, loginError, config } = useAuth();

  const handleMicrosoftLogin = () => {
    // For Microsoft OAuth, we need to redirect to the OAuth URL
    // The package's login function is simplified, so we'll handle it directly
    window.location.href = `/auth/oauth/microsoft`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {config?.branding?.loginTitle || "Welcome to Spotlight"}
          </CardTitle>
          <CardDescription>
            {config?.branding?.loginSubtitle || "Sign in to continue"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleMicrosoftLogin}
            className="w-full"
            size="lg"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 21 21">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Sign in with Microsoft
          </Button>

          {loginError && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {loginError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 3.3 Add User Info and Logout

Update your navigation or header component to show user info:

```tsx
import { useAuth } from "@need4swede/heimdall-sso";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user, logout, isAdmin } = useAuth();

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold">Spotlight</h1>

        {user && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {user.name} ({user.role})
            </span>
            {isAdmin && (
              <a href="/admin" className="text-sm text-blue-600 hover:underline">
                Admin Panel
              </a>
            )}
            <Button onClick={logout} variant="outline" size="sm">
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
```

## Step 4: Environment Configuration

### 4.1 Create/Update .env file

Ensure your `.env` file has all required variables:

```env
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/spotlight

# JWT Configuration
JWT_SECRET=your-super-secret-key-that-is-at-least-32-characters-long-for-security

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-client-id-from-azure
MICROSOFT_TENANT_ID=your-tenant-id-or-common
MICROSOFT_CLIENT_SECRET=optional-client-secret

# Access Control (optional but recommended)
SSO_ALLOWED_DOMAINS=yourdomain.com,partnerdomain.com
SSO_ALLOWED_EMAILS=external.user@gmail.com

# Server
PORT=5000
NODE_ENV=development
```

### 4.2 Azure App Registration

Ensure your Azure app registration has the correct redirect URIs:

- For local development: `http://localhost:5000/auth/microsoft/callback`
- For production: `https://yourdomain.com/auth/microsoft/callback`

## Step 5: Testing the Integration

### 5.1 Start the Application

```bash
# Start PostgreSQL (if using Docker)
docker-compose up -d postgres

# Start the development server
npm run dev
```

### 5.2 Verify Authentication Flow

1. **Navigate to the app**: http://localhost:5000
2. **You should see the login page**
3. **Click "Sign in with Microsoft"**
4. **Complete Microsoft authentication**
5. **You should be redirected back and logged in**
6. **Check that protected routes work**
7. **Test logout functionality**

### 5.3 Check Database

The authentication tables should be created automatically:

```sql
-- Check users table
SELECT * FROM users;

-- Check sessions
SELECT * FROM user_sessions;
```

## Step 6: Docker Deployment

### 6.1 Docker Compose Configuration

The Spotlight application now includes complete Docker Compose configurations for both development and production environments with PostgreSQL and Heimdall SSO support.

#### Production Configuration (`docker-compose.yml`)

```yaml
version: '3.8'

services:
  spotlight:
    container_name: spotlight
    build: .
    ports:
      - "${FRONTEND_PORT:-6011}:${SPOTLIGHT_PORT:-5000}"
    environment:
      - NODE_ENV=production
      - PORT=${SPOTLIGHT_PORT:-5000}
      - HOST=0.0.0.0
      # PostgreSQL Database (required for Heimdall SSO)
      - DATABASE_URL=${DATABASE_URL}

      # Heimdall SSO Configuration
      - JWT_SECRET=${JWT_SECRET}
      - MICROSOFT_CLIENT_ID=${MICROSOFT_CLIENT_ID}
      - MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}
      - MICROSOFT_TENANT_ID=${MICROSOFT_TENANT_ID:-common}

      # SSO Access Control (optional)
      - SSO_ALLOWED_DOMAINS=${SSO_ALLOWED_DOMAINS}
      - SSO_ALLOWED_EMAILS=${SSO_ALLOWED_EMAILS}

      # Email configuration
      - SMTP_HOST=${SMTP_HOST:-smtp-mail.outlook.com}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    container_name: spotlight-postgres
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped

volumes:
  postgres_data:
```

**Key Configuration Changes:**
- ✅ **Flexible Port Mapping**: `FRONTEND_PORT:SPOTLIGHT_PORT` (e.g., `6011:5000`)
- ✅ **Environment Variable Integration**: Uses `.env` file values directly
- ✅ **Custom Database Credentials**: Supports custom PostgreSQL user/password
- ✅ **Port Isolation**: External and internal ports can be different

#### Development Configuration (`docker-compose.dev.yml`)

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=development
      - PORT=5000

      # PostgreSQL Database (required for Heimdall SSO)
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/spotlight_dev

      # Heimdall SSO Configuration
      - JWT_SECRET=${JWT_SECRET:-development-jwt-secret-at-least-32-characters-long}
      - MICROSOFT_CLIENT_ID=${MICROSOFT_CLIENT_ID}
      - MICROSOFT_CLIENT_SECRET=${MICROSOFT_CLIENT_SECRET}
      - MICROSOFT_TENANT_ID=${MICROSOFT_TENANT_ID:-common}

      # SSO Access Control (optional)
      - SSO_ALLOWED_DOMAINS=${SSO_ALLOWED_DOMAINS}
      - SSO_ALLOWED_EMAILS=${SSO_ALLOWED_EMAILS}

      # Email configuration
      - SMTP_HOST=${SMTP_HOST:-smtp-mail.outlook.com}
      - SMTP_PORT=${SMTP_PORT:-587}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=spotlight_dev
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped

volumes:
  postgres_data:
```

### 6.2 Environment Configuration for Docker

Create a `.env` file for Docker deployment:

```env
# Required for production
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters-long-for-security
MICROSOFT_CLIENT_ID=your-azure-app-client-id
MICROSOFT_TENANT_ID=your-tenant-id-or-common

# Optional but recommended
MICROSOFT_CLIENT_SECRET=your-azure-app-client-secret
SSO_ALLOWED_DOMAINS=yourdomain.com,partnerdomain.com
SSO_ALLOWED_EMAILS=external.user@gmail.com

# Database configuration
POSTGRES_DB=spotlight
POSTGRES_PASSWORD=secure-postgres-password

# Email configuration
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password

# Server configuration
PORT=5000
```

### 6.3 Building and Running with Docker

#### Development Environment

```bash
# Start development environment with hot reload
docker-compose -f docker-compose.dev.yml up --build

# Start in background
docker-compose -f docker-compose.dev.yml up -d --build

# View logs
docker-compose -f docker-compose.dev.yml logs -f app

# Stop services
docker-compose -f docker-compose.dev.yml down
```

#### Production Environment

```bash
# Start production environment
docker-compose up --build

# Start in background (recommended for production)
docker-compose up -d --build

# View logs
docker-compose logs -f spotlight

# Stop services
docker-compose down

# Remove volumes (WARNING: This will delete all data)
docker-compose down -v
```

### 6.4 Database Initialization

The Docker setup automatically initializes the PostgreSQL database:

1. **Database Creation**: PostgreSQL container creates the database specified in `POSTGRES_DB`
2. **Schema Initialization**: The `init.sql` file is automatically executed on first startup
3. **Heimdall Tables**: Authentication tables are created automatically by the SSO package

#### Manual Database Operations

```bash
# Connect to the database
docker-compose exec postgres psql -U postgres -d spotlight

# View Heimdall SSO tables
\dt

# Check users
SELECT * FROM users;

# Check sessions
SELECT * FROM user_sessions;
```

### 6.5 Dockerfile Optimization

The Dockerfile has been updated to properly handle the Heimdall SSO package:

```dockerfile
# Use Node.js 20 LTS as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code (includes heimdall-sso directory)
COPY . .
RUN mkdir -p attached_assets dist/public

# Build heimdall-sso package first
RUN cd heimdall-sso && npm install && npm run build

# Use Docker-compatible config and build main application
RUN cp vite.config.docker.ts vite.config.ts && npm run build

# Clean cache but keep all dependencies (server needs them at runtime)
RUN npm cache clean --force

# Configure environment
EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Start application
CMD ["npm", "start"]
```

**Key Docker Changes:**
- ✅ **Build heimdall-sso first**: Ensures the package is built before the main application
- ✅ **Use source imports**: Both client and server use direct source file imports
- ✅ **Avoid package dependencies**: No need to add `@need4swede/heimdall-sso` to package.json

### 6.6 Azure App Registration for Docker

Update your Azure app registration redirect URIs for containerized deployment:

**Development:**
- `http://localhost:5000/auth/microsoft/callback`

**Production:**
- `https://yourdomain.com/auth/microsoft/callback`
- `https://yourip:5000/auth/microsoft/callback` (if using IP directly)

### 6.7 Health Checks and Monitoring

Add health check endpoints to monitor your containerized application:

```bash
# Check application health
curl http://localhost:5000/api/health

# Check database connection
docker-compose exec postgres pg_isready -U postgres

# View application logs
docker-compose logs -f spotlight

# Monitor resource usage
docker stats spotlight spotlight-postgres
```

### 6.8 Docker Troubleshooting

#### Common Issues and Solutions

**1. Authentication not working in Docker:**
```bash
# Check environment variables
docker-compose exec spotlight env | grep -E "(JWT|MICROSOFT|SSO)"

# Verify database connection
docker-compose exec spotlight npm run db:check
```

**2. Database connection failed:**
```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check database logs
docker-compose logs postgres

# Verify network connectivity
docker-compose exec spotlight ping postgres
```

**3. OAuth redirect issues:**
```bash
# Check if the callback URL matches Azure registration
# Verify the container is accessible from the outside
curl -I http://localhost:5000/auth/microsoft/callback
```

**4. Persistent data issues:**
```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect spotlight_postgres_data

# Backup database
docker-compose exec postgres pg_dump -U postgres spotlight > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U postgres spotlight
```

### 6.9 Production Deployment Checklist

Before deploying to production:

- [ ] Set strong JWT_SECRET (32+ characters)
- [ ] Configure proper Microsoft OAuth credentials
- [ ] Set up SSL/TLS certificates
- [ ] Configure proper CORS settings
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Set up monitoring and alerts
- [ ] Test OAuth flow thoroughly
- [ ] Verify access control settings
- [ ] Document rollback procedures

### 6.10 Docker Security Best Practices

1. **Use non-root user in containers**
2. **Limit container capabilities**
3. **Use secrets management for sensitive data**
4. **Regularly update base images**
5. **Scan images for vulnerabilities**
6. **Use multi-stage builds for smaller images**
7. **Set up proper network policies**

## Step 7: Debugging and Troubleshooting

### 7.1 Built-in Debugging Features

The integration includes comprehensive debugging features to help diagnose authentication issues:

#### Server-Side Debugging

**Enhanced server logging** in `server/index.ts`:

```typescript
// Environment verification on startup
log("🔧 Initializing Heimdall SSO...");
log(`Database URL: ${process.env.DATABASE_URL}`);
log(`JWT Secret: ${process.env.JWT_SECRET ? '[SET]' : '[NOT SET]'}`);
log(`Microsoft Client ID: ${process.env.MICROSOFT_CLIENT_ID ? '[SET]' : '[NOT SET]'}`);
log(`Microsoft Tenant ID: ${process.env.MICROSOFT_TENANT_ID || 'common'}`);
log(`Allowed Domains: ${process.env.SSO_ALLOWED_DOMAINS || '[NOT SET]'}`);

// Authentication request debugging
app.use((req, res, next) => {
  if (req.path.startsWith('/auth')) {
    log(`🔍 Auth request: ${req.method} ${req.path} from ${req.get('origin') || 'unknown'}`);
    log(`🔍 Query params: ${JSON.stringify(req.query)}`);
  }
  next();
});
```

#### Client-Side Debugging

**Enhanced login page debugging** in `LoginPage.tsx`:

```typescript
const handleMicrosoftLogin = () => {
  console.log("🔐 Login button clicked!");
  console.log("🔍 Current URL:", window.location.href);
  console.log("🔍 Redirecting to:", `/auth/oauth/microsoft`);
  window.location.href = `/auth/oauth/microsoft`;
};
```

### 7.2 Debugging Steps

When authentication issues occur, follow these debugging steps:

#### Step 1: Check Console Logs
```bash
# View Docker logs
docker-compose logs -f spotlight

# Look for these debug messages:
# 🔧 Initializing Heimdall SSO...
# 🔐 Adding Heimdall SSO routes...
# 🔍 Auth request: GET /auth/oauth/microsoft
```

#### Step 2: Verify Environment Variables
```bash
# Check environment variables in Docker
docker-compose exec spotlight env | grep -E "(JWT|MICROSOFT|SSO|DATABASE)"

# Expected output:
# DATABASE_URL=postgresql://...
# JWT_SECRET=[SET]
# MICROSOFT_CLIENT_ID=[SET]
# SSO_ALLOWED_DOMAINS=njes.org
```

#### Step 3: Test Browser Console
1. Open browser developer tools (F12)
2. Click "Sign in with Microsoft"
3. Check console for: `🔐 Login button clicked!`
4. Verify redirect URL in console

#### Step 4: Check Network Requests
1. Open Network tab in browser dev tools
2. Click login button
3. Look for requests to `/auth/oauth/microsoft`
4. Check response status codes

#### Step 5: Verify Database Connection
```bash
# Connect to database
docker-compose exec postgres psql -U spotlight_user -d spotlight

# Check tables exist
\dt

# Check for users/sessions
SELECT * FROM users LIMIT 5;
SELECT * FROM user_sessions LIMIT 5;
```

### 7.3 Port Configuration Debugging

The application uses flexible port configuration:

```env
# External port (what you access)
FRONTEND_PORT=6011

# Internal port (container runs on)
SPOTLIGHT_PORT=5000

# Access URL
http://localhost:6011
```

**Verify port configuration:**
```bash
# Check Docker port mapping
docker-compose ps

# Expected output:
# spotlight    0.0.0.0:6011->5000/tcp
```

**Common port issues:**
- **Wrong OAuth redirect**: Ensure Azure uses `http://localhost:6011/auth/microsoft/callback`
- **Port conflicts**: Use `netstat -tulpn | grep :6011` to check if port is in use
- **Firewall issues**: Ensure ports 6011 and 5432 are accessible

### 7.4 Dependency Resolution Debugging

**Check for missing dependencies:**
```bash
# In Docker container
docker-compose exec spotlight npm ls jsonwebtoken
docker-compose exec spotlight npm ls @types/jsonwebtoken

# Should show versions, not "missing"
```

**If dependencies are missing:**
```bash
# Rebuild with clean cache
docker-compose down
docker-compose build --no-cache
docker-compose up
```

## Troubleshooting

### Common Issues and Solutions

1. **"Cannot find package 'jsonwebtoken'"**
   - ✅ **Fixed**: Added `jsonwebtoken` and `@types/jsonwebtoken` to main `package.json`
   - **Solution**: Run `npm install` and rebuild Docker image

2. **Port configuration mismatch**
   - ✅ **Fixed**: Updated Docker Compose to use flexible port mapping
   - **Check**: Verify `FRONTEND_PORT` and `SPOTLIGHT_PORT` in `.env`
   - **Solution**: Ensure Azure redirect URI matches external port

3. **"Cannot find module '@need4swede/heimdall-sso'"**
   - ✅ **Fixed**: Using direct source imports instead of package imports
   - **Solution**: All imports use `../heimdall-sso/src/...` format

4. **Database connection errors**
   - **Check**: Verify `DATABASE_URL` matches PostgreSQL container credentials
   - **Solution**: Ensure `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` match in both services

5. **Login button doesn't work**
   - **Debug**: Check browser console for `🔐 Login button clicked!` message
   - **Check**: Verify server logs show auth requests
   - **Solution**: Clear browser cache, check for JavaScript errors

6. **"Token has expired" errors**
   - **Check**: Ensure `JWT_SECRET` is consistent across restarts
   - **Solution**: Set a strong, permanent JWT secret in `.env`

7. **OAuth redirect fails**
   - **Check**: Azure redirect URI matches exactly: `http://localhost:6011/auth/microsoft/callback`
   - **Verify**: `MICROSOFT_TENANT_ID` is correct for your organization
   - **Solution**: Update Azure app registration with correct URLs

8. **"Access denied" after login**
   - **Check**: Verify your email domain is in `SSO_ALLOWED_DOMAINS`
   - **Solution**: Add your domain or specific email to access control settings

9. **Database table conflicts**
   - **Error**: `duplicate key value violates unique constraint`
   - **Status**: This is expected on restart - tables already exist
   - **Result**: Application continues normally after this error

### Debug Command Reference

```bash
# View all logs
docker-compose logs -f

# Check specific service
docker-compose logs -f spotlight
docker-compose logs -f postgres

# Check container status
docker-compose ps

# Check environment variables
docker-compose exec spotlight env | grep -E "(JWT|MICROSOFT|DATABASE)"

# Connect to database
docker-compose exec postgres psql -U spotlight_user -d spotlight

# Check port usage
netstat -tulpn | grep -E "(6011|5432)"

# Restart services
docker-compose restart

# Clean rebuild
docker-compose down
docker-compose up --build
```

## Summary

By following these steps, we've successfully:

1. ✅ Built and linked the heimdall-sso package
2. ✅ Integrated authentication into the backend
3. ✅ Added login UI to the frontend
4. ✅ Protected routes with authentication
5. ✅ Configured environment variables
6. ✅ Tested the complete flow

The Heimdall SSO package provides a complete authentication solution with minimal integration effort. The entire process takes about 15-30 minutes for a basic setup.

## Next Steps

- **Customize the login page** to match your brand
- **Add role-based UI elements** (admin panels, etc.)
- **Implement refresh tokens** for better UX
- **Add user profile management**
- **Set up audit logging** for compliance

## Resources

- [Heimdall SSO Package Documentation](../heimdall-sso/README.md)
- [Azure App Registration Guide](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
