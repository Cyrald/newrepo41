import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { Pool } from '@neondatabase/serverless';
import { env } from './env';
import { logger } from './utils/logger';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  try {
    logger.info('Starting database migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('✅ Migrations completed successfully!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed!', { error });
    await pool.end();
    process.exit(1);
  }
}

main();
