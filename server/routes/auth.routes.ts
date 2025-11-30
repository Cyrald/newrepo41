import { Router } from "express";
import { storage } from "../storage";
import { hashPassword, comparePassword, safePasswordCompare, authenticateToken } from "../auth";
import { generateVerificationToken, sendVerificationEmail } from "../email";
import { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema } from "@shared/schema";
import { z } from "zod";
import { authLimiter, registerLimiter, passwordChangeLimiter } from "../middleware/rateLimiter";
import { logLoginAttempt, logRegistration } from "../utils/securityLogger";
import { logger } from "../utils/logger";
import { invalidateAllUserSessions } from "../utils/sessionManager";
import { validatePassword } from "../utils/sanitize";
import { generateCsrfToken } from "../middleware/csrf";

const router = Router();

router.post("/register", registerLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  
  const sanitizedEmail = data.email.toLowerCase().trim();

  const existingUser = await storage.getUserByEmail(sanitizedEmail);
  if (existingUser) {
    return res.status(400).json({ message: "Email уже зарегистрирован" });
  }

  validatePassword(data.password);
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
      logger.error('Session regeneration error during registration', { error: err.message });
      return res.status(500).json({ message: "Ошибка регистрации" });
    }
    
    req.session.userId = user.id;
    req.session.userRoles = roleNames;
    
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Session save error during registration', { error: saveErr.message });
        return res.status(500).json({ message: "Ошибка регистрации" });
      }
      
      generateCsrfToken(req, res);
      
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
  });
});

router.post("/login", authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  
  const sanitizedEmail = data.email.toLowerCase().trim();
  const user = await storage.getUserByEmail(sanitizedEmail);

  const isPasswordValid = await safePasswordCompare(
    data.password, 
    user?.passwordHash || null
  );

  if (!user || !isPasswordValid) {
    logLoginAttempt({
      email: sanitizedEmail,
      userId: user?.id,
      success: false,
      failureReason: !user ? 'user_not_found' : 'invalid_password',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(401).json({ message: "Неверный email или пароль" });
  }

  const roles = await storage.getUserRoles(user.id);
  const roleNames = roles.map(r => r.role);
  
  req.session.regenerate((err) => {
    if (err) {
      logger.error('Session regeneration error during login', { error: err.message });
      return res.status(500).json({ message: "Ошибка входа" });
    }
    
    req.session.userId = user.id;
    req.session.userRoles = roleNames;
    
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Session save error during login', { error: saveErr.message });
        return res.status(500).json({ message: "Ошибка входа" });
      }
      
      generateCsrfToken(req, res);
      
      logLoginAttempt({
        email: user.email,
        userId: user.id,
        success: true,
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
  });
});

router.post("/logout", authenticateToken, async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Ошибка выхода" });
    }
    res.clearCookie('sessionId');
    res.json({ message: "Выход выполнен" });
  });
});

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).json({ message: "Токен не предоставлен" });
  }

  const user = await storage.getUserByVerificationToken(token);

  if (!user) {
    return res.status(400).json({ message: "Недействительный токен" });
  }

  if (user.verificationTokenExpires && new Date(user.verificationTokenExpires) < new Date()) {
    return res.status(400).json({ message: "Срок действия токена истёк" });
  }

  await storage.updateUser(user.id, {
    isVerified: true,
    verificationToken: null,
    verificationTokenExpires: null,
  });

  res.json({ message: "Email успешно подтверждён" });
});

router.post("/resend-verification", authenticateToken, authLimiter, async (req, res) => {
  const user = await storage.getUser(req.userId!);

  if (!user) {
    return res.status(404).json({ message: "Пользователь не найден" });
  }

  if (user.isVerified) {
    return res.status(400).json({ message: "Email уже подтверждён" });
  }

  const verificationToken = generateVerificationToken();
  const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await storage.updateUser(user.id, {
    verificationToken,
    verificationTokenExpires,
  });

  await sendVerificationEmail(user.email, verificationToken, user.firstName);

  res.json({ message: "Письмо для подтверждения отправлено повторно" });
});

router.get("/me", authenticateToken, async (req, res) => {
  const user = await storage.getUser(req.userId!);
  
  if (!user) {
    return res.status(404).json({ message: "Пользователь не найден" });
  }

  const roles = await storage.getUserRoles(user.id);
  const roleNames = roles.map(r => r.role);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      phone: user.phone,
      isVerified: user.isVerified,
      bonusBalance: user.bonusBalance,
      roles: roleNames,
    },
  });
});

router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    await storage.updateUser(req.userId!, {
      firstName: data.firstName.trim(),
      lastName: data.lastName,
      patronymic: data.patronymic,
      phone: data.phone.trim(),
    });

    const updatedUser = await storage.getUser(req.userId!);
    const roles = await storage.getUserRoles(req.userId!);
    const roleNames = roles.map(r => r.role);

    res.json({
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        firstName: updatedUser!.firstName,
        lastName: updatedUser!.lastName,
        patronymic: updatedUser!.patronymic,
        phone: updatedUser!.phone,
        isVerified: updatedUser!.isVerified,
        bonusBalance: updatedUser!.bonusBalance,
        roles: roleNames,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    throw error;
  }
});

router.put("/password", authenticateToken, passwordChangeLimiter, async (req, res) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    const user = await storage.getUser(req.userId!);
    
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const isPasswordValid = await comparePassword(data.currentPassword, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Неверный текущий пароль" });
    }

    validatePassword(data.newPassword);
    const newPasswordHash = await hashPassword(data.newPassword);

    await storage.updateUser(req.userId!, {
      passwordHash: newPasswordHash,
    });

    await invalidateAllUserSessions(req.userId!);

    req.session.destroy((err) => {
      if (err) {
        logger.error('Failed to destroy current session after password change', { 
          userId: req.userId, 
          error: err.message 
        });
      }
    });

    res.clearCookie('sessionId');
    res.json({ 
      message: "Пароль успешно изменён. Все активные сессии завершены. Пожалуйста, войдите снова." 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.errors[0].message });
    }
    throw error;
  }
});

router.delete("/account", authenticateToken, passwordChangeLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ message: "Пароль обязателен для удаления аккаунта" });
    }

    const user = await storage.getUser(req.userId!);
    
    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Неверный пароль" });
    }

    await storage.deleteUserAccount(req.userId!);

    await invalidateAllUserSessions(req.userId!);

    req.session.destroy((err) => {
      if (err) {
        logger.error('Failed to destroy session after account deletion', { 
          userId: req.userId, 
          error: err.message 
        });
      }
    });

    res.clearCookie('sessionId');
    
    logger.info('User account deleted', { 
      userId: req.userId,
      email: user.email,
      ip: req.ip,
    });

    res.json({ 
      message: "Аккаунт успешно удалён" 
    });
  } catch (error) {
    logger.error('Account deletion failed', { 
      userId: req.userId, 
      error 
    });
    throw error;
  }
});

export default router;
