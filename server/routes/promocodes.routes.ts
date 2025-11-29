import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../auth";
import { validatePromocode } from "../promocodes";
import { promocodeValidationLimiter } from "../middleware/rateLimiter";

const router = Router();

router.get("/", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  const promocodes = await storage.getPromocodes();
  res.json(promocodes);
});

router.post("/validate", authenticateToken, promocodeValidationLimiter, async (req, res) => {
  const { code, orderAmount } = req.body;
  const result = await validatePromocode(code, req.userId!, orderAmount);
  res.json(result);
});

router.post("/", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  const promocode = await storage.createPromocode(req.body);
  res.json(promocode);
});

router.put("/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  const promocode = await storage.updatePromocode(req.params.id, req.body);
  res.json(promocode);
});

router.delete("/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  await storage.deletePromocode(req.params.id);
  res.json({ message: "Промокод удалён" });
});

export default router;
