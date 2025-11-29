import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../auth";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  const wishlistItems = await storage.getWishlistItems(req.userId!);
  res.json(wishlistItems);
});

router.post("/", authenticateToken, async (req, res) => {
  const { productId } = req.body;

  const wishlistItem = await storage.addWishlistItem({
    userId: req.userId!,
    productId,
  });

  res.json(wishlistItem);
});

router.delete("/:productId", authenticateToken, async (req, res) => {
  await storage.deleteWishlistItem(req.userId!, req.params.productId);
  res.json({ message: "Товар удалён из избранного" });
});

export default router;
