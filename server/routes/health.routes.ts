import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { env } from "../env";
import { logger } from "../utils/logger";

const router = Router();

router.get('/', async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      environment: env.NODE_ENV,
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/ready', async (req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    
    res.json({ 
      ready: true,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed', { error });
    res.status(503).json({ 
      ready: false,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
