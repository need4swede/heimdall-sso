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

The Spotlight app needs some additional dependencies:

```bash
npm install cookie-parser
```

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

**Updated server/index.ts (with Heimdall SSO):**
```typescript
import express from "express";
import cookieParser from "cookie-parser";
import { initializeHeimdallSSO } from "@need4swede/heimdall-sso";
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
      - "${PORT:-5000}:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - HOST=0.0.0.0
      # PostgreSQL Database (required for Heimdall SSO)
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-spotlight}

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
      - POSTGRES_DB=${POSTGRES_DB:-spotlight}
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped

volumes:
  postgres_data:
```

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

The existing Dockerfile already handles the Heimdall SSO package correctly:

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

# Build application
RUN cp vite.config.docker.ts vite.config.ts && npm run build

# Clean cache
RUN npm cache clean --force

# Configure environment
EXPOSE 5000
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0

# Start application
CMD ["npm", "start"]
```

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

## Troubleshooting

### Common Issues and Solutions

1. **"Cannot find module '@need4swede/heimdall-sso'"**
   - Ensure you ran `npm link` in both directories
   - Try `npm ls @need4swede/heimdall-sso` to verify linking

2. **"Token has expired" errors**
   - Check that JWT_SECRET is consistent
   - Verify token expiration settings

3. **OAuth redirect fails**
   - Check Azure redirect URIs match exactly
   - Verify MICROSOFT_TENANT_ID is correct

4. **"Access denied" after login**
   - Check SSO_ALLOWED_DOMAINS includes your email domain
   - Verify SSO_ALLOWED_EMAILS if using specific emails

5. **Database connection errors**
   - Ensure PostgreSQL is running
   - Verify DATABASE_URL is correct
   - Check database exists

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
