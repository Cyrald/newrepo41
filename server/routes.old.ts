import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { db } from "./db";
import {
  hashPassword,
  comparePassword,
  authenticateToken,
  requireRole,
} from "./auth";
import {
  generateVerificationToken,
  sendVerificationEmail,
} from "./email";
import {
  productImagesUpload,
  chatAttachmentsUpload,
  productFormDataUpload,
} from "./upload";
import { productImagePipeline, chatImagePipeline } from "./ImagePipeline";
import { calculateCashback, canUseBonuses } from "./bonuses";
import { validatePromocode } from "./promocodes";
import {
  registerSchema,
  loginSchema,
  createOrderSchema,
  products,
  users,
  orders,
  cartItems,
  promocodes,
  promocodeUsage,
} from "@shared/schema";
import { z } from "zod";
import {
  authLimiter,
  registerLimiter,
  promocodeValidationLimiter,
  uploadLimiter,
  searchLimiter,
  generalApiLimiter,
  orderLimiter,
} from "./middleware/rateLimiter";
import { sanitizeSearchQuery, sanitizeNumericParam, sanitizeId } from "./utils/sanitize";
import { eq, sql, and } from "drizzle-orm";
import * as cookieSignature from "cookie-signature";
import { env } from "./env";
import { logLoginAttempt, logRegistration } from "./utils/securityLogger";
import { logger } from "./utils/logger";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  const connectedUsers = new Map<string, { ws: any, roles: string[] }>();

  const SESSION_ID_REGEX = /^[a-zA-Z0-9_-]{20,128}$/;

  async function validateSessionFromCookie(cookieHeader: string | undefined): Promise<{ userId: string; userRoles: string[] } | null> {
    if (!cookieHeader) return null;
    
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    const sessionCookie = cookies['sessionId'];
    if (!sessionCookie) return null;
    
    const decodedCookie = decodeURIComponent(sessionCookie);
    
    if (!decodedCookie.startsWith('s:')) {
      return null;
    }
    
    const signedValue = decodedCookie.slice(2);
    const unsignedValue = cookieSignature.unsign(signedValue, env.SESSION_SECRET);
    
    if (unsignedValue === false) {
      return null;
    }
    
    const sid = unsignedValue;
    
    if (!SESSION_ID_REGEX.test(sid)) {
      logger.warn('Invalid session ID format detected');
      return null;
    }
    
    try {
      const result = await db.execute(sql`SELECT sess FROM session WHERE sid = ${sid}`);
      if (!result.rows || result.rows.length === 0) return null;
      
      const sessionData = result.rows[0].sess as any;
      if (!sessionData || !sessionData.userId) return null;
      
      return {
        userId: sessionData.userId,
        userRoles: sessionData.userRoles || []
      };
    } catch (error) {
      logger.error('Session validation error', { error });
      return null;
    }
  }

  const connectionRateLimits = new Map<string, { count: number; resetAt: number }>();
  const messageRateLimits = new Map<string, { count: number; resetAt: number }>();
  const CONNECTION_LIMIT = 10;
  const CONNECTION_WINDOW = 60 * 1000;
  const MESSAGE_LIMIT = 60;
  const MESSAGE_WINDOW = 60 * 1000;

  setInterval(() => {
    const now = Date.now();
    
    Array.from(connectionRateLimits.entries()).forEach(([key, value]) => {
      if (now > value.resetAt) {
        connectionRateLimits.delete(key);
      }
    });
    
    Array.from(messageRateLimits.entries()).forEach(([key, value]) => {
      if (now > value.resetAt) {
        messageRateLimits.delete(key);
      }
    });
    
    const cleanedConnections = connectionRateLimits.size;
    const cleanedMessages = messageRateLimits.size;
    if (cleanedConnections > 0 || cleanedMessages > 0) {
      logger.debug('Rate limit maps cleanup', { 
        connectionRateLimits: cleanedConnections,
        messageRateLimits: cleanedMessages 
      });
    }
  }, 60000);

  wss.on("connection", async (ws: any, req: any) => {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    
    const now = Date.now();
    const ipLimit = connectionRateLimits.get(clientIp) || { count: 0, resetAt: now + CONNECTION_WINDOW };
    
    if (now > ipLimit.resetAt) {
      ipLimit.count = 0;
      ipLimit.resetAt = now + CONNECTION_WINDOW;
    }
    
    if (ipLimit.count >= CONNECTION_LIMIT) {
      logger.warn('WebSocket connection rate limit exceeded', { clientIp });
      ws.close(1008, 'Too many connections');
      return;
    }
    
    ipLimit.count++;
    connectionRateLimits.set(clientIp, ipLimit);
    
    const sessionData = await validateSessionFromCookie(req.headers.cookie);
    
    if (!sessionData) {
      logger.warn('WebSocket connection rejected - invalid session', { clientIp });
      ws.close(1008, 'Unauthorized - invalid session');
      return;
    }
    
    const userId = sessionData.userId;
    const userRoleRecords = await storage.getUserRoles(userId);
    const userRoles = userRoleRecords.map(r => r.role);
    connectedUsers.set(userId, { ws, roles: userRoles });
    
    logger.info('WebSocket connection established', { userId, roles: userRoles });
    
    ws.send(JSON.stringify({
      type: "auth_success",
      message: "Подключение установлено",
    }));

    ws.on("message", async (data: any) => {
      try {
        const msgNow = Date.now();
        const userMsgLimit = messageRateLimits.get(userId) || { count: 0, resetAt: msgNow + MESSAGE_WINDOW };
        
        if (msgNow > userMsgLimit.resetAt) {
          userMsgLimit.count = 0;
          userMsgLimit.resetAt = msgNow + MESSAGE_WINDOW;
        }
        
        if (userMsgLimit.count >= MESSAGE_LIMIT) {
          logger.warn('WebSocket message rate limit exceeded', { userId });
          ws.send(JSON.stringify({
            type: "rate_limit",
            message: "Слишком много сообщений, подождите минуту",
          }));
          return;
        }
        
        userMsgLimit.count++;
        messageRateLimits.set(userId, userMsgLimit);
        
        const message = JSON.parse(data.toString());
        
      } catch (error) {
        logger.error("WebSocket message error", { error, userId });
      }
    });

    ws.on("close", () => {
      connectedUsers.delete(userId);
      messageRateLimits.delete(userId);
    });
  });

  app.get('/health', async (req, res) => {
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

  app.get('/health/ready', async (req, res) => {
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

  app.post("/api/auth/register", registerLimiter, async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      const sanitizedEmail = data.email.toLowerCase().trim();

      const existingUser = await storage.getUserByEmail(sanitizedEmail);
      if (existingUser) {
        return res.status(400).json({ message: "Email уже зарегистрирован" });
      }

      const passwordHash = await hashPassword(data.password);
      const verificationToken = generateVerificationToken();
      const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const user = await storage.createUser({
        email: sanitizedEmail,
        passwordHash,
        firstName: data.firstName.trim(),
        lastName: data.lastName?.trim() || null,
        patronymic: data.patronymic?.trim() || null,
        phone: data.phone.trim(),
      });

      await storage.updateUser(user.id, {
        verificationToken,
        verificationTokenExpires,
      });

      await storage.addUserRole({
        userId: user.id,
        role: "customer",
      });

      await sendVerificationEmail(user.email, verificationToken, user.firstName);

      const roles = await storage.getUserRoles(user.id);
      const roleNames = roles.map(r => r.role);
      
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error during registration:', err);
          return res.status(500).json({ message: "Ошибка регистрации" });
        }
        
        req.session.userId = user.id;
        req.session.userRoles = roleNames;
        
        logRegistration({
          email: user.email,
          userId: user.id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
        });

        res.json({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            isVerified: user.isVerified,
            bonusBalance: user.bonusBalance,
            roles: roleNames,
          },
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка регистрации" });
    }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      const sanitizedEmail = data.email.toLowerCase().trim();

      const user = await storage.getUserByEmail(sanitizedEmail);
      if (!user) {
        logLoginAttempt({
          email: sanitizedEmail,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          failureReason: 'USER_NOT_FOUND',
        });
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      const isValidPassword = await comparePassword(data.password, user.passwordHash);
      if (!isValidPassword) {
        logLoginAttempt({
          email: sanitizedEmail,
          userId: user.id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          success: false,
          failureReason: 'INVALID_PASSWORD',
        });
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      const roles = await storage.getUserRoles(user.id);
      const roleNames = roles.map(r => r.role);
      
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ message: "Ошибка входа" });
        }
        
        req.session.userId = user.id;
        req.session.userRoles = roleNames;
        
        logLoginAttempt({
          email: sanitizedEmail,
          userId: user.id,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          success: true,
        });

        res.json({
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            isVerified: user.isVerified,
            bonusBalance: user.bonusBalance,
            roles: roleNames,
          },
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка входа" });
    }
  });

  app.post("/api/auth/logout", authenticateToken, async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ message: "Ошибка выхода" });
        }
        res.clearCookie('sessionId');
        res.json({ message: "Выход выполнен успешно" });
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка выхода" });
    }
  });

  app.get("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Токен не указан" });
      }

      const { db } = await import("./db");
      const { users } = await import("@shared/schema");
      const { eq, and, gt } = await import("drizzle-orm");

      const [user] = await db
        .select()
        .from(users)
        .where(
          and(
            eq(users.verificationToken, token),
            gt(users.verificationTokenExpires, new Date())
          )
        )
        .limit(1);

      if (!user) {
        return res.status(400).json({ message: "Недействительный или истёкший токен" });
      }

      await storage.updateUser(user.id, {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      });

      res.json({ message: "Email успешно подтверждён" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка верификации email" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req, res) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const roles = await storage.getUserRoles(user.id);
      const roleNames = roles.map(r => r.role);

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        patronymic: user.patronymic,
        phone: user.phone,
        isVerified: user.isVerified,
        bonusBalance: user.bonusBalance,
        roles: roleNames,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения профиля" });
    }
  });

  app.put("/api/auth/profile", authenticateToken, async (req, res) => {
    try {
      const profileUpdateSchema = z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        patronymic: z.string().optional(),
        phone: z.string().optional(),
      });

      const data = profileUpdateSchema.parse(req.body);
      
      const updateData: any = {};
      if (data.firstName !== undefined && data.firstName !== "") updateData.firstName = data.firstName;
      if (data.lastName !== undefined && data.lastName !== "") updateData.lastName = data.lastName;
      if (data.patronymic !== undefined && data.patronymic !== "") updateData.patronymic = data.patronymic;
      if (data.phone !== undefined && data.phone !== "") updateData.phone = data.phone;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "Нет данных для обновления" });
      }

      const user = await storage.updateUser(req.userId!, updateData);

      res.json(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка обновления профиля" });
    }
  });

  app.put("/api/auth/password", authenticateToken, async (req, res) => {
    try {
      const passwordUpdateSchema = z.object({
        currentPassword: z.string().min(6),
        newPassword: z.string().min(6),
      });

      const data = passwordUpdateSchema.parse(req.body);

      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const isValid = await comparePassword(data.currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ message: "Неверный текущий пароль" });
      }

      const passwordHash = await hashPassword(data.newPassword);
      await storage.updateUser(user.id, { passwordHash });

      res.json({ message: "Пароль успешно изменён" });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка изменения пароля" });
    }
  });

  app.get("/api/addresses", authenticateToken, async (req, res) => {
    try {
      const addresses = await storage.getUserAddresses(req.userId!);
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения адресов" });
    }
  });

  app.post("/api/addresses", authenticateToken, async (req, res) => {
    try {
      const addressSchema = z.object({
        label: z.string().min(1),
        fullAddress: z.string().min(1),
        city: z.string().min(1),
        street: z.string().min(1),
        building: z.string().min(1),
        apartment: z.string().optional(),
        postalCode: z.string().min(1),
        isDefault: z.boolean().optional(),
      });

      const data = addressSchema.parse(req.body);

      const address = await storage.createUserAddress({
        userId: req.userId!,
        label: data.label,
        fullAddress: data.fullAddress,
        city: data.city,
        street: data.street,
        building: data.building,
        apartment: data.apartment || null,
        postalCode: data.postalCode,
        isDefault: data.isDefault,
      });
      res.json(address);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка создания адреса" });
    }
  });

  app.put("/api/addresses/:id", authenticateToken, async (req, res) => {
    try {
      const existingAddress = await storage.getUserAddress(req.params.id);
      if (!existingAddress || existingAddress.userId !== req.userId) {
        return res.status(404).json({ message: "Адрес не найден" });
      }
      
      const addressUpdateSchema = z.object({
        label: z.string().optional(),
        fullAddress: z.string().optional(),
        city: z.string().optional(),
        street: z.string().optional(),
        building: z.string().optional(),
        apartment: z.string().optional(),
        postalCode: z.string().optional(),
        isDefault: z.boolean().optional(),
      });

      const data = addressUpdateSchema.parse(req.body);

      const updateData: any = {};
      if (data.label !== undefined) updateData.label = data.label;
      if (data.fullAddress !== undefined) updateData.fullAddress = data.fullAddress;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.street !== undefined) updateData.street = data.street;
      if (data.building !== undefined) updateData.building = data.building;
      if (data.apartment !== undefined) updateData.apartment = data.apartment;
      if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
      if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "Нет данных для обновления" });
      }

      const address = await storage.updateUserAddress(req.params.id, updateData);
      res.json(address);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка обновления адреса" });
    }
  });

  app.delete("/api/addresses/:id", authenticateToken, async (req, res) => {
    try {
      const address = await storage.getUserAddress(req.params.id);
      if (!address || address.userId !== req.userId) {
        return res.status(404).json({ message: "Адрес не найден" });
      }
      await storage.deleteUserAddress(req.params.id);
      res.json({ message: "Адрес удалён" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления адреса" });
    }
  });

  app.put("/api/addresses/:id/set-default", authenticateToken, async (req, res) => {
    try {
      const address = await storage.getUserAddress(req.params.id);
      if (!address || address.userId !== req.userId) {
        return res.status(404).json({ message: "Адрес не найден" });
      }
      await storage.setDefaultAddress(req.userId!, req.params.id);
      res.json({ message: "Адрес установлен по умолчанию" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка установки адреса по умолчанию" });
    }
  });

  app.get("/api/payment-cards", authenticateToken, async (req, res) => {
    try {
      const cards = await storage.getUserPaymentCards(req.userId!);
      res.json(cards);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения карт" });
    }
  });

  app.post("/api/payment-cards", authenticateToken, async (req, res) => {
    try {
      const cardSchema = z.object({
        yukassaPaymentToken: z.string().min(1),
        cardLastFour: z.string().length(4),
        cardType: z.string().min(1),
        isDefault: z.boolean().optional(),
      });

      const data = cardSchema.parse(req.body);

      const card = await storage.createUserPaymentCard({
        userId: req.userId!,
        yukassaPaymentToken: data.yukassaPaymentToken,
        cardLastFour: data.cardLastFour,
        cardType: data.cardType,
        isDefault: data.isDefault ?? false,
      });
      res.json(card);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка добавления карты" });
    }
  });

  app.delete("/api/payment-cards/:id", authenticateToken, async (req, res) => {
    try {
      const card = await storage.getUserPaymentCard(req.params.id);
      if (!card || card.userId !== req.userId) {
        return res.status(404).json({ message: "Карта не найдена" });
      }
      await storage.deleteUserPaymentCard(req.params.id);
      res.json({ message: "Карта удалена" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления карты" });
    }
  });

  app.put("/api/payment-cards/:id/set-default", authenticateToken, async (req, res) => {
    try {
      const card = await storage.getUserPaymentCard(req.params.id);
      if (!card || card.userId !== req.userId) {
        return res.status(404).json({ message: "Карта не найдена" });
      }
      await storage.setDefaultPaymentCard(req.userId!, req.params.id);
      res.json({ message: "Карта установлена по умолчанию" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка установки карты по умолчанию" });
    }
  });

  app.get("/api/categories", async (req, res) => {
    try {
      const categories = await storage.getCategories();
      res.json(categories);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения категорий" });
    }
  });

  app.get("/api/categories/:id", async (req, res) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Категория не найдена" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения категории" });
    }
  });

  const categorySchema = z.object({
    name: z.string().min(1, "Название обязательно").max(200, "Название слишком длинное").trim(),
    slug: z.string().min(1, "Slug обязателен").max(200, "Slug слишком длинный").regex(/^[a-z0-9-]+$/, "Slug должен содержать только строчные буквы, цифры и дефисы"),
    description: z.string().max(5000, "Описание слишком длинное").optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  });

  app.post("/api/categories", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      const data = categorySchema.parse(req.body);
      const category = await storage.createCategory(data);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка создания категории" });
    }
  });

  app.put("/api/categories/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      const data = categorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(req.params.id, data);
      res.json(category);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      res.status(500).json({ message: "Ошибка обновления категории" });
    }
  });

  app.delete("/api/categories/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      await storage.deleteCategory(req.params.id);
      res.json({ message: "Категория удалена" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления категории" });
    }
  });

  app.get("/api/products", searchLimiter, async (req, res) => {
    try {
      const {
        categoryId,
        categoryIds,
        search,
        minPrice,
        maxPrice,
        isNew,
        includeArchived,
        sortBy,
        limit = "20",
        offset = "0",
      } = req.query;

      const limitNum = sanitizeNumericParam(limit as string, 1, 10000, 20);
      const offsetNum = sanitizeNumericParam(offset as string, 0, 100000, 0);
      const sanitizedSearch = sanitizeSearchQuery(search as string);

      let categoryIdsArray: string[] | undefined;
      if (categoryIds) {
        const rawIds = typeof categoryIds === 'string' 
          ? categoryIds.split(',')
          : categoryIds as string[];
        categoryIdsArray = rawIds
          .map(id => sanitizeId(id))
          .filter((id): id is string => id !== null);
      }

      const result = await storage.getProducts({
        categoryId: !categoryIdsArray ? sanitizeId(categoryId as string) || undefined : undefined,
        categoryIds: categoryIdsArray,
        search: sanitizedSearch,
        minPrice: minPrice ? Math.max(0, parseFloat(minPrice as string)) : undefined,
        maxPrice: maxPrice ? Math.max(0, parseFloat(maxPrice as string)) : undefined,
        isNew: isNew === "true" ? true : undefined,
        includeArchived: includeArchived === "true",
        sortBy: sortBy as "price_asc" | "price_desc" | "popularity" | "newest" | "rating" | undefined,
        limit: limitNum,
        offset: offsetNum,
      });

      const page = Math.floor(offsetNum / limitNum) + 1;
      const totalPages = Math.ceil(result.total / limitNum);

      res.json({
        products: result.products,
        total: result.total,
        page,
        totalPages,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения товаров" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const productId = sanitizeId(req.params.id);
      if (!productId) {
        return res.status(400).json({ message: "Неверный ID товара" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Товар не найден" });
      }

      const images = await storage.getProductImages(product.id);

      await storage.incrementProductView(product.id);

      res.json({ ...product, images });
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения товара" });
    }
  });

  app.post(
    "/api/products",
    authenticateToken,
    requireRole("admin", "marketer"),
    uploadLimiter,
    productFormDataUpload.none(),
    async (req, res) => {
      try {
        const productData = { ...req.body };
        
        const stockQty = (productData.stockQuantity || '0').trim();
        if (!/^\d+$/.test(stockQty)) {
          return res.status(400).json({ message: "Некорректное количество на складе" });
        }
        productData.stockQuantity = parseInt(stockQty, 10);
        
        if (productData.shelfLifeDays && productData.shelfLifeDays !== '') {
          const daysStr = productData.shelfLifeDays.trim();
          if (/^\d+$/.test(daysStr)) {
            productData.shelfLifeDays = parseInt(daysStr, 10);
          } else {
            productData.shelfLifeDays = null;
          }
        } else {
          productData.shelfLifeDays = null;
        }
        
        if (productData.isNew !== undefined) productData.isNew = productData.isNew === 'true';
        if (productData.isArchived !== undefined) productData.isArchived = productData.isArchived === 'true';
        
        if (productData.discountStartDate && productData.discountStartDate !== '') {
          productData.discountStartDate = new Date(productData.discountStartDate);
        } else {
          productData.discountStartDate = null;
        }
        if (productData.discountEndDate && productData.discountEndDate !== '') {
          productData.discountEndDate = new Date(productData.discountEndDate);
        } else {
          productData.discountEndDate = null;
        }
        
        const product = await storage.createProduct(productData);
        res.json(product);
      } catch (error) {
        res.status(500).json({ message: "Ошибка создания товара" });
      }
    }
  );

  app.put(
    "/api/products/:id",
    authenticateToken,
    requireRole("admin", "marketer"),
    async (req, res) => {
      try {
        const productData = { ...req.body };
        
        if (productData.discountStartDate && typeof productData.discountStartDate === 'string') {
          productData.discountStartDate = productData.discountStartDate ? new Date(productData.discountStartDate) : null;
        }
        if (productData.discountEndDate && typeof productData.discountEndDate === 'string') {
          productData.discountEndDate = productData.discountEndDate ? new Date(productData.discountEndDate) : null;
        }
        
        const product = await storage.updateProduct(req.params.id, productData);
        res.json(product);
      } catch (error: any) {
        console.error('Error updating product:', error);
        res.status(500).json({ message: "Ошибка обновления товара" });
      }
    }
  );

  app.delete(
    "/api/products/:id",
    authenticateToken,
    requireRole("admin", "marketer"),
    async (req, res) => {
      try {
        await storage.deleteProduct(req.params.id);
        res.json({ message: "Товар удалён" });
      } catch (error) {
        res.status(500).json({ message: "Ошибка удаления товара" });
      }
    }
  );

  app.delete(
    "/api/products/:id/permanent",
    authenticateToken,
    requireRole("admin"),
    async (req, res) => {
      try {
        await storage.permanentDeleteProduct(req.params.id);
        res.json({ message: "Товар удалён навсегда" });
      } catch (error) {
        res.status(500).json({ message: "Ошибка удаления товара" });
      }
    }
  );

  app.post(
    "/api/products/:id/images",
    authenticateToken,
    requireRole("admin", "marketer"),
    uploadLimiter,
    productImagesUpload.array("images", 10),
    async (req, res) => {
      try {
        const files = req.files as Express.Multer.File[];
        
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "Файлы не загружены" });
        }
        
        const existingImages = await storage.getProductImages(req.params.id);
        const placeholderImages = existingImages.filter(img => 
          img.url.includes('placeholder') || img.url.endsWith('.svg')
        );
        
        for (const placeholderImage of placeholderImages) {
          await storage.deleteProductImage(placeholderImage.id);
        }
        
        const processedImages = await productImagePipeline.processBatch(files);
        
        const dbImages = [];
        const createdImageIds: string[] = [];
        
        try {
          for (const processedImage of processedImages) {
            const image = await storage.addProductImage({
              productId: req.params.id,
              url: processedImage.url,
              sortOrder: 0,
            });
            dbImages.push(image);
            createdImageIds.push(image.id);
          }
          
          res.json(dbImages);
        } catch (dbError: any) {
          for (const imageId of createdImageIds) {
            try {
              await storage.deleteProductImage(imageId);
            } catch (deleteError) {
              console.warn(`Failed to rollback DB image ${imageId}:`, deleteError);
            }
          }
          
          for (const processedImage of processedImages) {
            try {
              await productImagePipeline.deleteImage(processedImage.filename);
            } catch (deleteError) {
              console.warn(`Failed to rollback file ${processedImage.filename}:`, deleteError);
            }
          }
          
          throw dbError;
        }
      } catch (error: any) {
        console.error('Error uploading images:', error);
        res.status(500).json({ message: error.message || "Ошибка загрузки изображений" });
      }
    }
  );

  app.patch(
    "/api/products/:productId/images/reorder",
    authenticateToken,
    requireRole("admin", "marketer"),
    async (req, res) => {
      try {
        const { imageOrders } = req.body;
        const productId = req.params.productId;
        
        if (!Array.isArray(imageOrders)) {
          return res.status(400).json({ message: "Неверный формат данных" });
        }
        
        const productImages = await storage.getProductImages(productId);
        const validImageIds = new Set(productImages.map(img => img.id));
        
        for (const { imageId, sortOrder } of imageOrders) {
          if (!validImageIds.has(imageId)) {
            return res.status(400).json({ 
              message: "Одно или несколько изображений не принадлежат этому товару" 
            });
          }
          
          if (typeof sortOrder !== 'number' || sortOrder < 0) {
            return res.status(400).json({ message: "Неверный порядок сортировки" });
          }
          
          await storage.updateProductImageOrder(imageId, sortOrder);
        }
        
        res.json({ message: "Порядок изображений обновлен" });
      } catch (error) {
        console.error('Error reordering images:', error);
        res.status(500).json({ message: "Ошибка обновления порядка изображений" });
      }
    }
  );

  app.delete(
    "/api/products/images/:id",
    authenticateToken,
    requireRole("admin", "marketer"),
    async (req, res) => {
      try {
        await storage.deleteProductImage(req.params.id);
        res.json({ message: "Изображение удалено" });
      } catch (error) {
        res.status(500).json({ message: "Ошибка удаления изображения" });
      }
    }
  );

  app.get("/api/cart", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getCartItems(req.userId!);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения корзины" });
    }
  });

  app.post("/api/cart", authenticateToken, async (req, res) => {
    try {
      const { productId, quantity } = req.body;

      if (!quantity || quantity < 1 || !Number.isInteger(quantity)) {
        return res.status(400).json({ message: "Неверное количество товара" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Товар не найден" });
      }

      const existingCartItem = await storage.getCartItem(req.userId!, productId);
      const currentQuantityInCart = existingCartItem?.quantity || 0;
      const totalQuantity = currentQuantityInCart + quantity;

      if (totalQuantity > product.stockQuantity) {
        return res.status(400).json({ 
          message: `Недостаточно товара на складе. Доступно: ${product.stockQuantity}, в корзине: ${currentQuantityInCart}` 
        });
      }

      const item = await storage.addCartItem({
        userId: req.userId!,
        productId,
        quantity,
      });
      res.json(item);
    } catch (error) {
      console.error("[Cart] Error adding item:", error);
      res.status(500).json({ message: "Ошибка добавления в корзину" });
    }
  });

  app.put("/api/cart/:productId", authenticateToken, async (req, res) => {
    try {
      const { quantity } = req.body;

      if (quantity < 0 || !Number.isInteger(quantity)) {
        return res.status(400).json({ message: "Неверное количество товара" });
      }

      if (quantity > 0) {
        const product = await storage.getProduct(req.params.productId);
        if (!product) {
          return res.status(404).json({ message: "Товар не найден" });
        }

        if (quantity > product.stockQuantity) {
          return res.status(400).json({ 
            message: `Недостаточно товара на складе. Доступно: ${product.stockQuantity}` 
          });
        }
      }

      const item = await storage.updateCartItem(req.userId!, req.params.productId, quantity);
      res.json(item);
    } catch (error) {
      console.error("[Cart] Error updating item:", error);
      res.status(500).json({ message: "Ошибка обновления корзины" });
    }
  });

  app.delete("/api/cart/:productId", authenticateToken, async (req, res) => {
    try {
      await storage.deleteCartItem(req.userId!, req.params.productId);
      res.json({ message: "Товар удалён из корзины" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления из корзины" });
    }
  });

  app.delete("/api/cart", authenticateToken, async (req, res) => {
    try {
      await storage.clearCart(req.userId!);
      res.json({ message: "Корзина очищена" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка очистки корзины" });
    }
  });

  app.get("/api/wishlist", authenticateToken, async (req, res) => {
    try {
      const items = await storage.getWishlistItems(req.userId!);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения избранного" });
    }
  });

  app.post("/api/wishlist", authenticateToken, async (req, res) => {
    try {
      const { productId } = req.body;
      const item = await storage.addWishlistItem({
        userId: req.userId!,
        productId,
      });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Ошибка добавления в избранное" });
    }
  });

  app.delete("/api/wishlist/:productId", authenticateToken, async (req, res) => {
    try {
      await storage.deleteWishlistItem(req.userId!, req.params.productId);
      res.json({ message: "Товар удалён из избранного" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления из избранного" });
    }
  });

  app.get("/api/promocodes", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      const promocodes = await storage.getPromocodes();
      res.json(promocodes);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения промокодов" });
    }
  });

  app.post("/api/promocodes/validate", authenticateToken, promocodeValidationLimiter, async (req, res) => {
    try {
      const { code, orderAmount } = req.body;
      const result = await validatePromocode(code, req.userId!, orderAmount);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Ошибка валидации промокода" });
    }
  });

  app.post("/api/promocodes", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      const promocode = await storage.createPromocode({
        ...req.body,
        createdByUserId: req.userId!,
      });
      res.json(promocode);
    } catch (error) {
      res.status(500).json({ message: "Ошибка создания промокода" });
    }
  });

  app.put("/api/promocodes/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      const promocode = await storage.updatePromocode(req.params.id, req.body);
      res.json(promocode);
    } catch (error) {
      res.status(500).json({ message: "Ошибка обновления промокода" });
    }
  });

  app.delete("/api/promocodes/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
    try {
      await storage.deletePromocode(req.params.id);
      res.json({ message: "Промокод удалён" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка удаления промокода" });
    }
  });

  app.get("/api/orders", authenticateToken, async (req, res) => {
    try {
      const roles = await storage.getUserRoles(req.userId!);
      const isAdmin = roles.some(r => r.role === "admin");

      const orders = await storage.getOrders(
        isAdmin ? {} : { userId: req.userId! }
      );
      res.json(orders);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения заказов" });
    }
  });

  app.get("/api/orders/:id", authenticateToken, async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения заказа" });
    }
  });

  app.post("/api/orders", authenticateToken, orderLimiter, async (req, res) => {
    try {
      const data = createOrderSchema.parse(req.body);
      const user = await storage.getUser(req.userId!);

      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const bonusesUsed = data.bonusesUsed || 0;

      if (data.promocodeId && bonusesUsed > 0) {
        return res.status(400).json({ 
          message: "Нельзя одновременно использовать промокод и бонусы. Выберите что-то одно." 
        });
      }

      let subtotal = 0;
      for (const item of data.items) {
        const price = parseFloat(item.price);
        subtotal += price * item.quantity;
      }

      let discountAmount = 0;
      let promocodeId = null;

      if (data.promocodeId) {
        const promocodeValidation = await validatePromocode(
          data.promocodeId,
          req.userId!,
          subtotal
        );
        if (promocodeValidation.valid && promocodeValidation.discountAmount) {
          discountAmount = promocodeValidation.discountAmount;
          promocodeId = promocodeValidation.promocode!.id;
        }
      }

      const subtotalAfterPromocode = subtotal - discountAmount;
      const { maxUsable } = canUseBonuses(user.bonusBalance, subtotalAfterPromocode);
      
      if (bonusesUsed > maxUsable) {
        return res.status(400).json({ message: `Можно использовать максимум ${maxUsable} бонусов` });
      }

      const subtotalAfterBonuses = subtotalAfterPromocode - bonusesUsed;
      const deliveryCost = 300;
      const total = subtotalAfterBonuses + deliveryCost;

      const bonusesEarned = calculateCashback(
        total,
        bonusesUsed > 0,
        discountAmount > 0
      );

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substring(7).toUpperCase()}`;

      const order = await db.transaction(async (tx) => {
        for (const item of data.items) {
          const updateResult = await tx.execute(
            sql`UPDATE products 
                SET stock_quantity = stock_quantity - ${item.quantity},
                    updated_at = NOW()
                WHERE id = ${item.productId}
                  AND stock_quantity >= ${item.quantity}
                RETURNING id, name, stock_quantity`
          );
          
          if (!updateResult.rows || updateResult.rows.length === 0) {
            const checkProduct = await tx.execute(
              sql`SELECT id, name, stock_quantity FROM products WHERE id = ${item.productId}`
            );
            if (!checkProduct.rows || checkProduct.rows.length === 0) {
              throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
            }
            const product = checkProduct.rows[0] as any;
            throw new Error(`INSUFFICIENT_STOCK:${product.name}:${product.stock_quantity}:${item.quantity}`);
          }
        }

        if (bonusesUsed > 0) {
          const bonusResult = await tx.execute(
            sql`UPDATE users 
                SET bonus_balance = bonus_balance - ${bonusesUsed},
                    updated_at = NOW()
                WHERE id = ${req.userId}
                  AND bonus_balance >= ${bonusesUsed}
                RETURNING id`
          );
          
          if (!bonusResult.rows || bonusResult.rows.length === 0) {
            throw new Error('INSUFFICIENT_BONUS');
          }
        }

        if (promocodeId) {
          const [promocode] = await tx
            .select()
            .from(promocodes)
            .where(eq(promocodes.id, promocodeId))
            .limit(1);

          if (promocode) {
            if (promocode.type === "single_use") {
              await tx.delete(promocodes).where(eq(promocodes.id, promocodeId));
            } else if (promocode.type === "temporary") {
              const existingUsage = await tx.execute(
                sql`SELECT id FROM promocode_usage 
                    WHERE promocode_id = ${promocodeId} AND user_id = ${req.userId}
                    LIMIT 1`
              );
              if (existingUsage.rows && existingUsage.rows.length > 0) {
                throw new Error('PROMOCODE_ALREADY_USED');
              }
            }
          }
        }

        const [createdOrder] = await tx
          .insert(orders)
          .values({
            userId: req.userId!,
            orderNumber,
            status: "pending",
            items: data.items as any,
            subtotal: subtotal.toString(),
            discountAmount: discountAmount.toString(),
            bonusesUsed: bonusesUsed.toString(),
            bonusesEarned: bonusesEarned.toString(),
            promocodeId,
            deliveryService: data.deliveryService,
            deliveryType: data.deliveryType,
            deliveryPointCode: data.deliveryPointCode || null,
            deliveryAddress: data.deliveryAddress as any,
            deliveryCost: deliveryCost.toString(),
            deliveryTrackingNumber: null,
            paymentMethod: data.paymentMethod,
            paymentStatus: "pending",
            yukassaPaymentId: null,
            total: total.toString(),
          })
          .returning();

        if (promocodeId) {
          const [promocode] = await tx
            .select()
            .from(promocodes)
            .where(eq(promocodes.id, promocodeId))
            .limit(1);

          if (promocode && promocode.type === "temporary") {
            await tx.insert(promocodeUsage).values({
              promocodeId,
              userId: req.userId!,
              orderId: createdOrder.id,
            });
          }
        }

        await tx.delete(cartItems).where(eq(cartItems.userId, req.userId!));

        return createdOrder;
      });

      res.json(order);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      
      if (error.message?.startsWith('PRODUCT_NOT_FOUND:')) {
        const productId = error.message.split(':')[1];
        return res.status(404).json({ message: `Товар ${productId} не найден` });
      }
      
      if (error.message?.startsWith('INSUFFICIENT_STOCK:')) {
        const [, productName, available, requested] = error.message.split(':');
        return res.status(400).json({ 
          message: `Недостаточно товара "${productName}". Доступно: ${available}, запрошено: ${requested}` 
        });
      }
      
      if (error.message === 'INSUFFICIENT_BONUS') {
        return res.status(400).json({ message: "Недостаточно бонусов на счёте" });
      }
      
      if (error.message === 'PROMOCODE_ALREADY_USED') {
        return res.status(400).json({ message: "Вы уже использовали этот промокод" });
      }
      
      console.error('Order creation error:', error);
      res.status(500).json({ message: "Ошибка создания заказа" });
    }
  });

  app.put("/api/orders/:id/status", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const { status } = req.body;
      const updateData: any = { status };

      if (status === "paid") {
        updateData.paidAt = new Date();
        updateData.paymentStatus = "paid";
      } else if (status === "shipped") {
        updateData.shippedAt = new Date();
      } else if (status === "delivered") {
        updateData.deliveredAt = new Date();
      } else if (status === "completed") {
        updateData.completedAt = new Date();

        const order = await storage.getOrder(req.params.id);
        if (order && order.userId) {
          const user = await storage.getUser(order.userId);
          if (user) {
            const bonusesEarned = parseFloat(order.bonusesEarned);
            await storage.updateUser(order.userId, {
              bonusBalance: user.bonusBalance + bonusesEarned,
            });
          }
        }
      }

      const order = await storage.updateOrder(req.params.id, updateData);
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Ошибка обновления статуса заказа" });
    }
  });

  app.get("/api/admin/stats", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

      const allOrders = await storage.getOrders();
      const allUsers = await storage.getUsers();
      const { products } = await storage.getProducts({ limit: 10000 });

      const currentMonthOrders = allOrders.filter(o => new Date(o.createdAt) >= currentMonth);
      const lastMonthOrders = allOrders.filter(o => 
        new Date(o.createdAt) >= lastMonth && new Date(o.createdAt) < currentMonth
      );
      const currentMonthUsers = allUsers.filter(u => new Date(u.createdAt) >= currentMonth);
      const lastMonthUsers = allUsers.filter(u => 
        new Date(u.createdAt) >= lastMonth && new Date(u.createdAt) < currentMonth
      );
      const currentMonthProducts = products.filter(p => new Date(p.createdAt) >= currentMonth);
      const lastMonthProducts = products.filter(p => 
        new Date(p.createdAt) >= lastMonth && new Date(p.createdAt) < currentMonth
      );

      const totalRevenue = allOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
      const currentMonthRevenue = currentMonthOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
      const lastMonthRevenue = lastMonthOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);

      const revenueChange = lastMonthRevenue > 0 
        ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
        : 0;
      const ordersChange = lastMonthOrders.length > 0 
        ? ((currentMonthOrders.length - lastMonthOrders.length) / lastMonthOrders.length) * 100 
        : 0;
      const customersChange = lastMonthUsers.length > 0 
        ? ((currentMonthUsers.length - lastMonthUsers.length) / lastMonthUsers.length) * 100 
        : 0;
      const productsChange = lastMonthProducts.length > 0 
        ? ((currentMonthProducts.length - lastMonthProducts.length) / lastMonthProducts.length) * 100 
        : 0;

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      
      res.json({
        totalRevenue: Math.round(totalRevenue),
        revenueChange: Math.round(revenueChange * 10) / 10,
        totalOrders: allOrders.length,
        ordersChange: Math.round(ordersChange * 10) / 10,
        totalCustomers: allUsers.length,
        customersChange: Math.round(customersChange * 10) / 10,
        totalProducts: products.length,
        productsChange: Math.round(productsChange * 10) / 10,
        recentOrders,
      });
    } catch (error) {
      console.error("[Admin Stats] Error:", error);
      res.status(500).json({ message: "Ошибка получения статистики" });
    }
  });

  app.get("/api/admin/users", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const users = await storage.getUsers();
      const usersWithRoles = await Promise.all(
        users.map(async (user) => {
          const roles = await storage.getUserRoles(user.id);
          return {
            ...user,
            roles: roles.map(r => r.role),
          };
        })
      );
      res.json(usersWithRoles);
    } catch (error) {
      console.error("[Admin Users] Error:", error);
      res.status(500).json({ message: "Ошибка получения пользователей" });
    }
  });

  app.get("/api/support/conversations", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      const status = req.query.status as 'open' | 'archived' | 'closed' | undefined;
      const conversations = await storage.getAllSupportConversations(status);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения диалогов" });
    }
  });

  app.get("/api/support/customer-info/:userId", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }

      const orders = await storage.getOrders({ userId: req.params.userId });
      
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        patronymic: user.patronymic,
        phone: user.phone,
        bonusBalance: user.bonusBalance,
        orders: orders.map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          total: order.total,
          status: order.status,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения информации о клиенте" });
    }
  });

  app.get("/api/support/messages", authenticateToken, async (req, res) => {
    try {
      let userId = req.userId!;
      
      // Only admin/consultant can fetch messages for other users
      if (req.query.userId) {
        if (!req.userRoles?.some(role => ['admin', 'consultant'].includes(role))) {
          return res.status(403).json({ message: "Нет прав для просмотра чужих сообщений" });
        }
        userId = req.query.userId as string;
      }
      
      const messages = await storage.getSupportMessages(userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения сообщений" });
    }
  });

  app.post("/api/support/messages", authenticateToken, async (req, res) => {
    try {
      let userId = req.userId!;
      
      // Only admin/consultant can send messages to other users
      if (req.body.userId && req.body.userId !== req.userId) {
        if (!req.userRoles?.some(role => ['admin', 'consultant'].includes(role))) {
          return res.status(403).json({ message: "Нет прав для отправки сообщений от имени других пользователей" });
        }
        userId = req.body.userId;
      }
      
      // Create or reopen conversation when user sends a message (auto-reopens from archived)
      await storage.getOrCreateConversation(userId);
      
      // Update last message time
      await storage.updateLastMessageTime(userId);
      
      const message = await storage.createSupportMessage({
        userId: userId,
        senderId: req.userId!,
        messageText: req.body.messageText,
      });
      
      // Broadcast to conversation participants and all staff
      const notification = {
        type: "new_message",
        message: message,
      };
      
      // Send to customer (conversation owner)
      const customerConnection = connectedUsers.get(userId);
      if (customerConnection?.ws && customerConnection.ws.readyState === WebSocket.OPEN) {
        customerConnection.ws.send(JSON.stringify(notification));
      }
      
      // Send to all connected admins and consultants
      for (const [connUserId, connection] of Array.from(connectedUsers.entries())) {
        // Skip if already sent to customer
        if (connUserId === userId) continue;
        
        // Send to staff members (admin, consultant)
        const isStaff = connection.roles.some((role: string) => ['admin', 'consultant'].includes(role));
        if (isStaff && connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(JSON.stringify(notification));
        }
      }
      
      res.json(message);
    } catch (error) {
      res.status(500).json({ message: "Ошибка отправки сообщения" });
    }
  });

  // Archive conversation
  app.put("/api/support/conversations/:userId/archive", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      await storage.archiveConversation(req.params.userId);
      
      // Notify user via WebSocket
      const userConnection = connectedUsers.get(req.params.userId);
      if (userConnection?.ws && userConnection.ws.readyState === WebSocket.OPEN) {
        userConnection.ws.send(JSON.stringify({
          type: "conversation_archived",
          userId: req.params.userId
        }));
      }
      
      res.json({ message: "Обращение архивировано" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка архивации обращения" });
    }
  });

  // Close conversation (final)
  app.put("/api/support/conversations/:userId/close", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      await storage.closeConversation(req.params.userId);
      
      // Notify user via WebSocket
      const userConnection = connectedUsers.get(req.params.userId);
      if (userConnection?.ws && userConnection.ws.readyState === WebSocket.OPEN) {
        userConnection.ws.send(JSON.stringify({
          type: "conversation_closed",
          userId: req.params.userId
        }));
      }
      
      res.json({ message: "Обращение закрыто" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка закрытия обращения" });
    }
  });

  // Reopen conversation
  app.put("/api/support/conversations/:userId/reopen", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      await storage.reopenConversation(req.params.userId);
      
      // Notify admins via WebSocket
      for (const [connUserId, connection] of Array.from(connectedUsers.entries())) {
        const isStaff = connection.roles.some((role: string) => ['admin', 'consultant'].includes(role));
        if (isStaff && connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.send(JSON.stringify({
            type: "conversation_reopened",
            userId: req.params.userId
          }));
        }
      }
      
      res.json({ message: "Обращение переоткрыто" });
    } catch (error) {
      res.status(500).json({ message: "Ошибка переоткрытия обращения" });
    }
  });

  // Get conversation status (for customer)
  app.get("/api/support/conversation-status", authenticateToken, async (req, res) => {
    try {
      const status = await storage.getConversationStatus(req.userId!);
      if (!status) {
        return res.json({ status: 'none' });
      }
      res.json(status);
    } catch (error) {
      res.status(500).json({ message: "Ошибка получения статуса обращения" });
    }
  });

  // Search closed conversations
  app.get("/api/support/closed-search", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    try {
      const filters: { email?: string; dateFrom?: Date; dateTo?: Date } = {};
      
      if (req.query.email) {
        filters.email = req.query.email as string;
      }
      
      if (req.query.dateFrom) {
        filters.dateFrom = new Date(req.query.dateFrom as string);
      }
      
      if (req.query.dateTo) {
        filters.dateTo = new Date(req.query.dateTo as string);
      }
      
      const conversations = await storage.searchClosedConversations(filters);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ message: "Ошибка поиска закрытых обращений" });
    }
  });

  app.post(
    "/api/support/messages/:id/attachments",
    authenticateToken,
    chatAttachmentsUpload.array("files", 5),
    async (req, res) => {
      try {
        const files = req.files as Express.Multer.File[];
        
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "Файлы не загружены" });
        }

        const totalSize = files.reduce((sum, file) => sum + file.buffer.length, 0);
        if (totalSize > 50 * 1024 * 1024) {
          return res.status(400).json({ message: "Общий размер файлов превышает 50 МБ" });
        }

        const processedImages = await chatImagePipeline.processBatch(files);
        
        const attachments = [];
        const createdAttachmentIds: string[] = [];
        
        try {
          for (const processedImage of processedImages) {
            const attachment = await storage.addSupportMessageAttachment({
              messageId: req.params.id,
              fileUrl: processedImage.url,
              fileSize: processedImage.size,
              fileType: processedImage.mimeType,
            });
            attachments.push(attachment);
            createdAttachmentIds.push(attachment.id);
          }
          
          res.json(attachments);
        } catch (dbError: any) {
          for (const attachmentId of createdAttachmentIds) {
            try {
              await storage.deleteSupportMessageAttachment(attachmentId);
            } catch (deleteError) {
              console.warn(`Failed to rollback DB attachment ${attachmentId}:`, deleteError);
            }
          }
          
          for (const processedImage of processedImages) {
            try {
              await chatImagePipeline.deleteImage(processedImage.filename);
            } catch (deleteError) {
              console.warn(`Failed to rollback file ${processedImage.filename}:`, deleteError);
            }
          }
          
          throw dbError;
        }
      } catch (error: any) {
        console.error('Error uploading attachments:', error);
        res.status(500).json({ message: error.message || "Ошибка загрузки вложений" });
      }
    }
  );

  return httpServer;
}
