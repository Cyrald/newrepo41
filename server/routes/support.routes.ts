import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../auth";
import { chatAttachmentsUpload } from "../upload";
import { chatImagePipeline } from "../ImagePipeline";
import { uploadLimiter } from "../middleware/rateLimiter";
import type { WebSocket } from "ws";

interface ConnectedUser {
  ws: WebSocket;
  roles: string[];
}

export function createSupportRoutes(connectedUsers: Map<string, ConnectedUser>) {
  const router = Router();

  router.get("/conversations", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    const status = req.query.status as 'open' | 'archived' | 'closed' | undefined;
    const conversations = await storage.getAllSupportConversations(status);
    res.json(conversations);
  });

  router.get("/customer-info/:userId", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
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
  });

  router.get("/messages", authenticateToken, async (req, res) => {
    let userId = req.userId!;
    
    if (req.query.userId) {
      if (!req.userRoles?.some(role => ['admin', 'consultant'].includes(role))) {
        return res.status(403).json({ message: "Нет прав для просмотра чужих сообщений" });
      }
      userId = req.query.userId as string;
    }
    
    const messages = await storage.getSupportMessages(userId);
    res.json(messages);
  });

  router.post("/messages", authenticateToken, async (req, res) => {
    let userId = req.userId!;
    
    if (req.body.userId && req.body.userId !== req.userId) {
      if (!req.userRoles?.some(role => ['admin', 'consultant'].includes(role))) {
        return res.status(403).json({ message: "Нет прав для отправки сообщений от имени других пользователей" });
      }
      userId = req.body.userId;
    }
    
    await storage.getOrCreateConversation(userId);
    await storage.updateLastMessageTime(userId);
    
    const message = await storage.createSupportMessage({
      userId: userId,
      senderId: req.userId!,
      messageText: req.body.messageText,
    });
    
    const notification = {
      type: "new_message",
      message: message,
    };
    
    const customerConnection = connectedUsers.get(userId);
    if (customerConnection?.ws && customerConnection.ws.readyState === 1) {
      customerConnection.ws.send(JSON.stringify(notification));
    }
    
    for (const [connUserId, connection] of Array.from(connectedUsers.entries())) {
      if (connUserId === userId) continue;
      
      const isStaff = connection.roles.some((role: string) => ['admin', 'consultant'].includes(role));
      if (isStaff && connection.ws.readyState === 1) {
        connection.ws.send(JSON.stringify(notification));
      }
    }
    
    res.json(message);
  });

  router.put("/conversations/:userId/archive", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    await storage.archiveConversation(req.params.userId);
    
    const userConnection = connectedUsers.get(req.params.userId);
    if (userConnection?.ws && userConnection.ws.readyState === 1) {
      userConnection.ws.send(JSON.stringify({
        type: "conversation_archived",
        userId: req.params.userId
      }));
    }
    
    res.json({ message: "Обращение архивировано" });
  });

  router.put("/conversations/:userId/close", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    await storage.closeConversation(req.params.userId);
    
    const userConnection = connectedUsers.get(req.params.userId);
    if (userConnection?.ws && userConnection.ws.readyState === 1) {
      userConnection.ws.send(JSON.stringify({
        type: "conversation_closed",
        userId: req.params.userId
      }));
    }
    
    res.json({ message: "Обращение закрыто" });
  });

  router.put("/conversations/:userId/reopen", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    await storage.reopenConversation(req.params.userId);
    
    for (const [connUserId, connection] of Array.from(connectedUsers.entries())) {
      const isStaff = connection.roles.some((role: string) => ['admin', 'consultant'].includes(role));
      if (isStaff && connection.ws.readyState === 1) {
        connection.ws.send(JSON.stringify({
          type: "conversation_reopened",
          userId: req.params.userId
        }));
      }
    }
    
    res.json({ message: "Обращение переоткрыто" });
  });

  router.get("/conversation-status", authenticateToken, async (req, res) => {
    const conversation = await storage.getSupportConversation(req.userId!);
    res.json({ status: conversation?.status || 'not_started' });
  });

  router.get("/closed-search", authenticateToken, requireRole("admin", "consultant"), async (req, res) => {
    const query = req.query.q as string;
    const closedConversations = await storage.searchClosedConversations(query);
    res.json(closedConversations);
  });

  router.post(
    "/messages/:id/attachments",
    authenticateToken,
    uploadLimiter,
    chatAttachmentsUpload.array("attachments", 5),
    async (req, res) => {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Файлы не загружены" });
      }
      
      const processedImages = await chatImagePipeline.processBatch(files);
      
      const dbAttachments = [];
      
      for (const processedImage of processedImages) {
        const attachment = await storage.createSupportMessageAttachment({
          messageId: req.params.id,
          url: processedImage.url,
          fileType: processedImage.mimeType,
          fileSize: processedImage.size,
        });
        
        dbAttachments.push(attachment);
      }
      
      res.json(dbAttachments);
    }
  );

  return router;
}

export default createSupportRoutes;
