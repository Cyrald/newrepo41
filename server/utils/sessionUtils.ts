import { Request } from 'express';
import { logger } from './logger';

/**
 * Promisified version of session.save()
 * Guarantees that the session is ACTUALLY written to the database before resolving
 */
export function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        logger.error('Session save failed', { error: err.message });
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Promisified version of session.regenerate()
 * Creates a new session and guarantees it's ready before resolving
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        logger.error('Session regeneration failed', { error: err.message });
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Full session initialization flow:
 * 1. Regenerate session
 * 2. Set user data
 * 3. Save to database
 * 4. WAIT for actual completion before returning
 */
export async function initializeSessionWithUser(
  req: Request, 
  userId: string,
  userRoles: string[]
): Promise<void> {
  try {
    // Step 1: Regenerate (create new session)
    await regenerateSession(req);
    
    // Step 2: Set user data
    req.session.userId = userId;
    req.session.userRoles = userRoles;
    
    // Step 3: Save and WAIT for completion
    await saveSession(req);
    
    logger.info('Session initialized successfully', { userId, sessionId: req.sessionID });
  } catch (error) {
    logger.error('Session initialization failed', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw error;
  }
}

/**
 * Check if session is ready in the database
 * Returns true only if session actually exists in DB
 */
export async function isSessionReady(sessionId: string, storage: any): Promise<boolean> {
  try {
    // This will query the database directly to verify session exists
    const sessionData = await storage.db.query.session.findFirst({
      where: (session: any) => session.sid === sessionId,
    });
    return !!sessionData;
  } catch (error) {
    logger.warn('Session ready check failed', { sessionId, error });
    return false;
  }
}
