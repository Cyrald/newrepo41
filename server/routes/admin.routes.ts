import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { authenticateToken, requireRole } from "../auth";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/stats", authenticateToken, requireRole("admin"), async (req, res) => {
  const [
    totalUsersResult,
    totalProductsResult,
    totalOrdersResult,
    totalRevenueResult,
    pendingOrdersResult,
  ] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int as count FROM users`),
    db.execute(sql`SELECT COUNT(*)::int as count FROM products WHERE is_archived = false`),
    db.execute(sql`SELECT COUNT(*)::int as count FROM orders`),
    db.execute(sql`SELECT COALESCE(SUM(CAST(total AS DECIMAL)), 0) as total FROM orders WHERE payment_status = 'paid'`),
    db.execute(sql`SELECT COUNT(*)::int as count FROM orders WHERE status = 'pending'`),
  ]);

  const totalUsers = totalUsersResult.rows?.[0]?.count || 0;
  const totalProducts = totalProductsResult.rows?.[0]?.count || 0;
  const totalOrders = totalOrdersResult.rows?.[0]?.count || 0;
  const totalRevenue = totalRevenueResult.rows?.[0]?.total || 0;
  const pendingOrders = pendingOrdersResult.rows?.[0]?.count || 0;

  res.json({
    totalUsers,
    totalProducts,
    totalOrders,
    totalRevenue: parseFloat(totalRevenue as string),
    pendingOrders,
  });
});

router.get("/users", authenticateToken, requireRole("admin"), async (req, res) => {
  const users = await storage.getUsers();

  const usersWithRoles = await Promise.all(
    users.map(async (user) => {
      const roles = await storage.getUserRoles(user.id);
      return {
        ...user,
        roles: roles.map(r => r.role),
      };
    })
  );

  res.json(usersWithRoles);
});

export default router;
