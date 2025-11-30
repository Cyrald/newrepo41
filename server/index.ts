import "express-async-errors";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./env";
import { sessionMiddleware } from "./session";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { generalApiLimiter } from "./middleware/rateLimiter";
import { csrfMiddleware, csrfTokenEndpoint } from "./middleware/csrf";
import { sessionRefreshMiddleware } from "./middleware/sessionRefresh";
import { logger } from "./utils/logger";
import { pool } from "./db";
import { startDataRetentionScheduler } from "./scheduler";
import { authenticateToken } from "./auth";

const app = express();

app.set('trust proxy', 1);

if (env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      logger.warn('HTTP request redirected to HTTPS', { 
        ip: req.ip, 
        url: req.url,
        method: req.method
      });
      return res.redirect(307, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(corsMiddleware);

app.use(helmet({
  contentSecurityPolicy: env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  hsts: env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
}));

app.use(requestLogger);
app.use(cookieParser());
app.use(sessionMiddleware);
app.use(sessionRefreshMiddleware); // Level 3: Refresh session TTL on every request

if (env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
}

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// JSON parser - только для application/json запросов
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/api/webhooks/')) {
      req.rawBody = buf;
    }
  },
  type: (req) => {
    const contentType = req.headers['content-type'] || '';
    return contentType.includes('application/json');
  }
}));

// URL-encoded parser - только для application/x-www-form-urlencoded
app.use(express.urlencoded({ 
  limit: '10mb', 
  extended: false,
  type: 'application/x-www-form-urlencoded'
}));


(async () => {
  if (env.NODE_ENV === 'production' && !env.FRONTEND_URL) {
    throw new Error(
      'FRONTEND_URL environment variable must be set in production mode for CORS configuration'
    );
  }

  app.use('/uploads', express.static('uploads'));
  
  app.use('/api', generalApiLimiter);
  
  // Webhooks without CSRF protection (they use signature verification)
  const webhooksRoutes = await import('./routes/webhooks.routes');
  app.use('/api/webhooks', webhooksRoutes.default);
  
  // CSRF token endpoint (requires authentication but NO CSRF token)
  // This is used to get initial token after login/register
  app.get('/api/csrf-token-init', authenticateToken, csrfTokenEndpoint);
  
  // Apply CSRF protection to ALL /api routes (registered AFTER this middleware)
  app.use('/api', csrfMiddleware);
  
  // Register all API routes AFTER CSRF middleware (so they are protected)
  const server = await registerRoutes(app);

  app.use(errorHandler);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(env.PORT, 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    logger.info(`Server started`, { 
      port, 
      environment: env.NODE_ENV,
      nodeVersion: process.version 
    });
    log(`serving on port ${port}`);

    startDataRetentionScheduler();
  });

  let isShuttingDown = false;
  
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress', { signal });
      return;
    }
    
    isShuttingDown = true;
    logger.info('Graceful shutdown initiated', { signal });
    
    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', { error: err.message });
      } else {
        logger.info('HTTP server closed');
      }
      
      try {
        const { productImagePipeline, chatImagePipeline } = await import('./ImagePipeline');
        await Promise.all([
          productImagePipeline.cleanup(),
          chatImagePipeline.cleanup(),
        ]);
        logger.info('Image pipelines cleaned up');
        
        productImagePipeline.destroy();
        chatImagePipeline.destroy();
        logger.info('Image pipelines destroyed');
        
        await pool.end();
        logger.info('Database pool closed');
        
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (cleanupError: any) {
        logger.error('Error during cleanup', { error: cleanupError.message });
        process.exit(1);
      }
    });
    
    setTimeout(() => {
      logger.error('Forceful shutdown after timeout');
      process.exit(1);
    }, 30000);
  };
  
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error: error.message, stack: error.stack });
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason, promise });
    gracefulShutdown('unhandledRejection');
  });
})();
