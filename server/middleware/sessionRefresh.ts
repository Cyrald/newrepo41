import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Level 3: Session refresh middleware
 * Explicitly updates session TTL on every request for authenticated users
 * Works in conjunction with rolling: true and resave: true in session config
 */
export function sessionRefreshMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // Only process authenticated sessions
    if (req.session && req.session.userId) {
      // Explicit touch() updates the TTL in PostgreSQL
      // This ensures the session's expires timestamp is refreshed
      req.session.touch?.();
      
      logger.debug('Session refreshed', {
        userId: req.session.userId,
        sessionId: req.sessionID,
        path: req.path,
      });
    }
  } catch (error) {
    logger.error('Session refresh error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sessionId: req.sessionID,
    });
    // Don't block request on refresh error
  }
  
  next();
}
