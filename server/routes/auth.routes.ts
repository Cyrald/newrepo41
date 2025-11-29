import { Router } from "express";
import { storage } from "../storage";
import { hashPassword, comparePassword, authenticateToken } from "../auth";
import { generateVerificationToken, sendVerificationEmail } from "../email";
import { registerSchema, loginSchema } from "@shared/schema";
import { z } from "zod";
import { authLimiter, registerLimiter } from "../middleware/rateLimiter";
import { logLoginAttempt, logRegistration } from "../utils/securityLogger";

const router = Router();

router.post("/register", registerLimiter, async (req, res) => {
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
});

router.post("/login", authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  
  const sanitizedEmail = data.email.toLowerCase().trim();
  const user = await storage.getUserByEmail(sanitizedEmail);

  if (!user) {
    logLoginAttempt({
      email: sanitizedEmail,
      success: false,
      failureReason: 'user_not_found',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(401).json({ message: "Неверный email или пароль" });
  }

  const isPasswordValid = await comparePassword(data.password, user.passwordHash);

  if (!isPasswordValid) {
    logLoginAttempt({
      email: sanitizedEmail,
      userId: user.id,
      success: false,
      failureReason: 'invalid_password',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    return res.status(401).json({ message: "Неверный email или пароль" });
  }

  const roles = await storage.getUserRoles(user.id);
  const roleNames = roles.map(r => r.role);
  
  req.session.regenerate((err) => {
    if (err) {
      console.error('Session regeneration error during login:', err);
      return res.status(500).json({ message: "Ошибка входа" });
    }
    
    req.session.userId = user.id;
    req.session.userRoles = roleNames;
    
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

  const users = await storage.getUsers();
  const user = users.find(u => u.verificationToken === token);

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
  const { firstName, lastName, patronymic, phone } = req.body;

  await storage.updateUser(req.userId!, {
    firstName: firstName?.trim(),
    lastName: lastName?.trim() || null,
    patronymic: patronymic?.trim() || null,
    phone: phone?.trim(),
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
});

router.put("/password", authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await storage.getUser(req.userId!);
  
  if (!user) {
    return res.status(404).json({ message: "Пользователь не найден" });
  }

  const isPasswordValid = await comparePassword(currentPassword, user.passwordHash);

  if (!isPasswordValid) {
    return res.status(401).json({ message: "Неверный текущий пароль" });
  }

  const newPasswordHash = await hashPassword(newPassword);

  await storage.updateUser(req.userId!, {
    passwordHash: newPasswordHash,
  });

  res.json({ message: "Пароль успешно изменён" });
});

export default router;
