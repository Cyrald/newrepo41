import { Request, Response, NextFunction } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { env } from '../env';
import { logger } from '../utils/logger';

const {
  invalidCsrfTokenError,
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => env.SESSION_SECRET,
  getSessionIdentifier: (req: Request) => req.session?.id || req.sessionID || 'anonymous',
  cookieName: 'csrf-token',
  cookieOptions: {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req: Request) => req.headers['x-csrf-token'] as string,
});

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.path.startsWith('/api/webhooks/')) {
    return next();
  }
  
  // Skip CSRF for auth endpoints (login/register handle session changes)
  if (req.path === '/api/auth/login' || req.path === '/api/auth/register') {
    return next();
  }
  
  doubleCsrfProtection(req, res, (err) => {
    if (err) {
      if (err === invalidCsrfTokenError) {
        logger.warn('CSRF validation failed', {
          path: req.path,
          method: req.method,
          ip: req.ip,
        });
        return res.status(403).json({ 
          message: 'Ошибка безопасности. Пожалуйста, обновите страницу и попробуйте снова.' 
        });
      }
      return next(err);
    }
    next();
  });
}

export function csrfTokenEndpoint(req: Request, res: Response): void {
  const csrfToken = generateCsrfToken(req, res);
  res.json({ csrfToken });
}

export { generateCsrfToken };
