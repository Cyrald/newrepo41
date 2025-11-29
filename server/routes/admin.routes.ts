import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { authenticateToken, requireRole } from "../auth";
import { sql } from "drizzle-orm";
import { userRoles } from "@shared/schema";

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
  
  const allRoles = await db.select().from(userRoles);
  const rolesMap = new Map<string, string[]>();
  
  for (const roleRecord of allRoles) {
    if (!rolesMap.has(roleRecord.userId)) {
      rolesMap.set(roleRecord.userId, []);
    }
    rolesMap.get(roleRecord.userId)!.push(roleRecord.role);
  }

  const usersWithRoles = users.map((user: any) => ({
    ...user,
    roles: rolesMap.get(user.id) || [],
  }));

  res.json(usersWithRoles);
});

export default router;
