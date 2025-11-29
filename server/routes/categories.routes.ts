import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken, requireRole } from "../auth";

const router = Router();

router.get("/", async (req, res) => {
  const categories = await storage.getCategories();
  res.json(categories);
});

router.get("/:id", async (req, res) => {
  const category = await storage.getCategory(req.params.id);

  if (!category) {
    return res.status(404).json({ message: "Категория не найдена" });
  }

  res.json(category);
});

router.post("/", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  const category = await storage.createCategory({
    name: req.body.name,
    slug: req.body.slug,
    description: req.body.description || null,
    sortOrder: req.body.sortOrder || 0,
  });

  res.json(category);
});

router.put("/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  const category = await storage.updateCategory(req.params.id, {
    name: req.body.name,
    slug: req.body.slug,
    description: req.body.description || null,
    sortOrder: req.body.sortOrder,
  });

  res.json(category);
});

router.delete("/:id", authenticateToken, requireRole("admin", "marketer"), async (req, res) => {
  await storage.deleteCategory(req.params.id);
  res.json({ message: "Категория удалена" });
});

export default router;
