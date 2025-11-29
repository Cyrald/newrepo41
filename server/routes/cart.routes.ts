import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../auth";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  const cartItems = await storage.getCartItems(req.userId!);
  res.json(cartItems);
});

router.post("/", authenticateToken, async (req, res) => {
  const { productId, quantity } = req.body;

  const product = await storage.getProduct(productId);
  
  if (!product) {
    return res.status(404).json({ message: "Товар не найден" });
  }

  const existingCartItem = await storage.getCartItem(req.userId!, productId);
  
  if (existingCartItem) {
    const currentQuantityInCart = existingCartItem.quantity;
    const totalQuantity = currentQuantityInCart + quantity;
    
    if (totalQuantity > product.stockQuantity) {
      return res.status(400).json({ 
        message: `Недостаточно товара на складе. Доступно: ${product.stockQuantity}, в корзине: ${currentQuantityInCart}` 
      });
    }
    
    const updatedCartItem = await storage.updateCartItem(req.userId!, productId, totalQuantity);
    return res.json(updatedCartItem);
  }

  if (quantity > product.stockQuantity) {
    return res.status(400).json({ 
      message: `Недостаточно товара на складе. Доступно: ${product.stockQuantity}` 
    });
  }

  const cartItem = await storage.addCartItem({
    userId: req.userId!,
    productId,
    quantity,
  });

  res.json(cartItem);
});

router.put("/:productId", authenticateToken, async (req, res) => {
  const { quantity } = req.body;

  const product = await storage.getProduct(req.params.productId);
  
  if (!product) {
    return res.status(404).json({ message: "Товар не найден" });
  }

  if (quantity > product.stockQuantity) {
    return res.status(400).json({ 
      message: `Недостаточно товара на складе. Доступно: ${product.stockQuantity}` 
    });
  }

  const updatedCartItem = await storage.updateCartItem(req.userId!, req.params.productId, quantity);
  res.json(updatedCartItem);
});

router.delete("/:productId", authenticateToken, async (req, res) => {
  await storage.deleteCartItem(req.userId!, req.params.productId);
  res.json({ message: "Товар удалён из корзины" });
});

router.delete("/", authenticateToken, async (req, res) => {
  await storage.clearCart(req.userId!);
  res.json({ message: "Корзина очищена" });
});

export default router;
