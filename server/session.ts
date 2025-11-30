import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { env } from "./env";

const PgSession = connectPg(session);

// 14 дня в миллисекундах
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
    disableTouch: false, // Level 3: Разрешить явный touch()
  }),
  secret: env.SESSION_SECRET,
  resave: true, // Level 2: Переписывать сессию каждый раз
  saveUninitialized: true, // Level 1: Сохранять сессию сразу
  rolling: true, // Level 1: Продливать TTL на каждый запрос
  cookie: {
    maxAge: FOURTEEN_DAYS_MS, // 14 дней
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
  },
  name: 'sessionId',
});

declare module 'express-session' {
  interface SessionData {
    userId: string;
    userRoles: string[];
  }
}
