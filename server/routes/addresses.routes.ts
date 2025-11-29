import { Router } from "express";
import { storage } from "../storage";
import { authenticateToken } from "../auth";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  const addresses = await storage.getUserAddresses(req.userId!);
  res.json(addresses);
});

router.post("/", authenticateToken, async (req, res) => {
  const address = await storage.createUserAddress({
    userId: req.userId!,
    label: req.body.label || "Дом",
    fullAddress: req.body.fullAddress,
    city: req.body.city,
    street: req.body.street,
    building: req.body.building,
    apartment: req.body.apartment || null,
    postalCode: req.body.postalCode,
    isDefault: req.body.isDefault || false,
  });

  if (req.body.isDefault) {
    await storage.setDefaultAddress(req.userId!, address.id);
  }

  res.json(address);
});

router.put("/:id", authenticateToken, async (req, res) => {
  const existingAddress = await storage.getUserAddress(req.params.id);
  
  if (!existingAddress) {
    return res.status(404).json({ message: "Адрес не найден" });
  }
  
  if (existingAddress.userId !== req.userId) {
    return res.status(403).json({ message: "Нет доступа к этому адресу" });
  }

  const updated = await storage.updateUserAddress(req.params.id, {
    label: req.body.label,
    fullAddress: req.body.fullAddress,
    city: req.body.city,
    street: req.body.street,
    building: req.body.building,
    apartment: req.body.apartment || null,
    postalCode: req.body.postalCode,
  });

  res.json(updated);
});

router.delete("/:id", authenticateToken, async (req, res) => {
  const address = await storage.getUserAddress(req.params.id);
  
  if (!address || address.userId !== req.userId) {
    return res.status(403).json({ message: "Нет доступа к этому адресу" });
  }

  await storage.deleteUserAddress(req.params.id);
  res.json({ message: "Адрес удалён" });
});

router.put("/:id/set-default", authenticateToken, async (req, res) => {
  const address = await storage.getUserAddress(req.params.id);
  
  if (!address || address.userId !== req.userId) {
    return res.status(403).json({ message: "Нет доступа к этому адресу" });
  }

  await storage.setDefaultAddress(req.userId!, req.params.id);
  res.json({ message: "Адрес установлен по умолчанию" });
});

export default router;
