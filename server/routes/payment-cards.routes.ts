import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../auth";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  const cards = await storage.getUserPaymentCards(req.userId!);
  res.json(cards);
});

router.post("/", authenticateToken, async (req, res) => {
  const card = await storage.createUserPaymentCard({
    userId: req.userId!,
    yukassaPaymentToken: req.body.yukassaPaymentToken,
    cardLastFour: req.body.cardLastFour,
    cardType: req.body.cardType,
    isDefault: req.body.isDefault || false,
  });

  if (req.body.isDefault) {
    await storage.setDefaultPaymentCard(req.userId!, card.id);
  }

  res.json(card);
});

router.delete("/:id", authenticateToken, async (req, res) => {
  const card = await storage.getUserPaymentCard(req.params.id);
  
  if (!card || card.userId !== req.userId) {
    return res.status(403).json({ message: "Нет доступа к этой карте" });
  }

  await storage.deleteUserPaymentCard(req.params.id);
  res.json({ message: "Карта удалена" });
});

router.put("/:id/set-default", authenticateToken, async (req, res) => {
  const card = await storage.getUserPaymentCard(req.params.id);
  
  if (!card || card.userId !== req.userId) {
    return res.status(403).json({ message: "Нет доступа к этой карте" });
  }

  await storage.setDefaultPaymentCard(req.userId!, req.params.id);
  res.json({ message: "Карта установлена по умолчанию" });
});

export default router;
