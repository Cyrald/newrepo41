import { Router } from "express";
import { authenticateToken } from "../auth";
import { logger } from "../utils/logger";
import { 
  registerUser, 
  loginUser, 
  refreshAccessToken, 
  logoutUser, 
  changePassword,
  getUserSessions,
  deleteSession
} from "../services/auth.service";
import { db } from "../db";
import { users, userRoles } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, patronymic, phone } = req.body;
    
    if (!email || !password || !firstName || !phone) {
      return res.status(400).json({ 
        message: "Отсутствуют обязательные поля",
        code: "MISSING_FIELDS"
      });
    }

    const user = await registerUser({
      email,
      password,
      firstName,
      lastName,
      patronymic,
      phone,
    });

    const loginResult = await loginUser(email, password, req);

    res.cookie('refreshToken', loginResult.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    res.status(201).json({
      message: "Регистрация успешна",
      user: loginResult.user,
      accessToken: loginResult.accessToken,
    });
  } catch (error: any) {
    if (error.message === 'EMAIL_ALREADY_EXISTS') {
      return res.status(409).json({ 
        message: "Email уже используется",
        code: "EMAIL_EXISTS"
      });
    }
    
    logger.error('Registration error', { error });
    res.status(500).json({ 
      message: "Ошибка регистрации",
      code: "REGISTRATION_ERROR"
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        message: "Email и пароль обязательны",
        code: "MISSING_CREDENTIALS"
      });
    }

    const result = await loginUser(email, password, req);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    res.json({
      message: "Вход выполнен успешно",
      user: result.user,
      accessToken: result.accessToken,
    });
  } catch (error: any) {
    if (error.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ 
        message: "Неверный email или пароль",
        code: "INVALID_CREDENTIALS"
      });
    }
    
    if (error.message === 'USER_BANNED') {
      return res.status(403).json({ 
        message: "Пользователь заблокирован",
        code: "USER_BANNED"
      });
    }
    
    if (error.message === 'USER_DELETED') {
      return res.status(403).json({ 
        message: "Пользователь удалён",
        code: "USER_DELETED"
      });
    }
    
    logger.error('Login error', { error });
    res.status(500).json({ 
      message: "Ошибка входа",
      code: "LOGIN_ERROR"
    });
  }
});

router.post("/logout", authenticateToken, async (req, res) => {
  try {
    if (!req.tfid || !req.userId) {
      return res.status(401).json({ 
        message: "Требуется авторизация",
        code: "UNAUTHORIZED"
      });
    }

    await logoutUser(req.tfid, req.userId);

    res.clearCookie('refreshToken', { 
      path: '/api/auth/refresh' 
    });

    res.json({ message: "Выход выполнен успешно" });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({ 
      message: "Ошибка выхода",
      code: "LOGOUT_ERROR"
    });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        message: "Refresh token отсутствует",
        code: "MISSING_REFRESH_TOKEN"
      });
    }

    const result = await refreshAccessToken(refreshToken);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/api/auth/refresh',
    });

    res.json({
      accessToken: result.accessToken,
    });
  } catch (error: any) {
    if (error.message === 'INVALID_REFRESH_TOKEN') {
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      return res.status(401).json({ 
        message: "Неверный refresh token",
        code: "INVALID_REFRESH_TOKEN"
      });
    }
    
    if (error.message === 'TOKEN_REVOKED' || error.message === 'SESSION_REVOKED') {
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      return res.status(401).json({ 
        message: "Сессия отозвана",
        code: "SESSION_REVOKED"
      });
    }
    
    if (error.message === 'TOKEN_REUSE_DETECTED') {
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      return res.status(401).json({ 
        message: "Обнаружено повторное использование токена",
        code: "TOKEN_REUSE_DETECTED"
      });
    }
    
    if (error.message === 'MAX_ROTATION_EXCEEDED') {
      res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
      return res.status(401).json({ 
        message: "Превышен лимит обновлений токена",
        code: "MAX_ROTATION_EXCEEDED"
      });
    }
    
    logger.error('Refresh error', { error });
    res.status(500).json({ 
      message: "Ошибка обновления токена",
      code: "REFRESH_ERROR"
    });
  }
});

router.get("/me", authenticateToken, async (req, res) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    
    if (!user || user.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, req.userId!));
    const roleNames = roles.map(r => r.role);

    res.json({
      user: {
        id: user[0].id,
        email: user[0].email,
        firstName: user[0].firstName,
        lastName: user[0].lastName,
        patronymic: user[0].patronymic,
        phone: user[0].phone,
        isVerified: user[0].isVerified,
        bonusBalance: user[0].bonusBalance,
        roles: roleNames,
      },
    });
  } catch (error) {
    logger.error('Get user error', { error });
    res.status(500).json({ message: "Ошибка получения данных пользователя" });
  }
});

router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, patronymic, phone } = req.body;
    
    const updates: any = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (patronymic !== undefined) updates.patronymic = patronymic;
    if (phone !== undefined) updates.phone = phone;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ 
        message: "Нет данных для обновления",
        code: "NO_UPDATES"
      });
    }
    
    const [updatedUser] = await db.update(users)
      .set(updates)
      .where(eq(users.id, req.userId!))
      .returning();
    
    if (!updatedUser) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }
    
    const roles = await db.select().from(userRoles).where(eq(userRoles.userId, req.userId!));
    const roleNames = roles.map(r => r.role);
    
    res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        patronymic: updatedUser.patronymic,
        phone: updatedUser.phone,
        isVerified: updatedUser.isVerified,
        bonusBalance: updatedUser.bonusBalance,
        roles: roleNames,
      },
    });
  } catch (error) {
    logger.error('Update profile error', { error });
    res.status(500).json({ 
      message: "Ошибка обновления профиля",
      code: "UPDATE_PROFILE_ERROR"
    });
  }
});

router.put("/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: "Текущий и новый пароли обязательны",
        code: "MISSING_FIELDS"
      });
    }

    await changePassword(req.userId!, currentPassword, newPassword);

    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });

    res.json({ 
      message: "Пароль успешно изменён. Все сессии завершены." 
    });
  } catch (error: any) {
    if (error.message === 'INVALID_PASSWORD') {
      return res.status(401).json({ 
        message: "Неверный текущий пароль",
        code: "INVALID_PASSWORD"
      });
    }
    
    logger.error('Password change error', { error });
    res.status(500).json({ 
      message: "Ошибка изменения пароля",
      code: "PASSWORD_CHANGE_ERROR"
    });
  }
});

router.get("/sessions", authenticateToken, async (req, res) => {
  try {
    const sessions = await getUserSessions(req.userId!);
    res.json({ sessions });
  } catch (error) {
    logger.error('Get sessions error', { error });
    res.status(500).json({ message: "Ошибка получения сессий" });
  }
});

router.delete("/sessions/:sessionId", authenticateToken, async (req, res) => {
  try {
    await deleteSession(req.userId!, req.params.sessionId);
    res.json({ message: "Сессия удалена" });
  } catch (error: any) {
    if (error.message === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ message: "Сессия не найдена" });
    }
    
    logger.error('Delete session error', { error });
    res.status(500).json({ message: "Ошибка удаления сессии" });
  }
});

export default router;
