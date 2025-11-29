import { db } from "./db";
import { promocodes, promocodeUsage } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface ValidatePromocodeResult {
  valid: boolean;
  promocode?: {
    id: string;
    code: string;
    discountPercentage: string;
  };
  error?: string;
  discountAmount?: number;
}

export async function validatePromocode(
  code: string,
  userId: string,
  orderAmount: number
): Promise<ValidatePromocodeResult> {
  const uppercaseCode = code.toUpperCase();
  const [promocode] = await db
    .select()
    .from(promocodes)
    .where(eq(promocodes.code, uppercaseCode))
    .limit(1);

  if (!promocode) {
    return { valid: false, error: "Промокод не найден" };
  }

  if (!promocode.isActive) {
    return { valid: false, error: "Промокод деактивирован" };
  }

  if (promocode.expiresAt && new Date(promocode.expiresAt) < new Date()) {
    return { valid: false, error: "Срок действия промокода истёк" };
  }

  const minAmount = parseFloat(promocode.minOrderAmount);
  if (orderAmount < minAmount) {
    return {
      valid: false,
      error: `Минимальная сумма заказа для этого промокода: ${minAmount} ₽`,
    };
  }

  if (promocode.type === "temporary") {
    const [usage] = await db
      .select()
      .from(promocodeUsage)
      .where(
        and(
          eq(promocodeUsage.promocodeId, promocode.id),
          eq(promocodeUsage.userId, userId)
        )
      )
      .limit(1);

    if (usage) {
      return { valid: false, error: "Вы уже использовали этот промокод" };
    }
  }

  const discountPercentage = parseFloat(promocode.discountPercentage);
  const calculatedDiscount = Math.floor(orderAmount * (discountPercentage / 100));
  
  const discountAmount = promocode.maxDiscountAmount 
    ? Math.min(calculatedDiscount, parseFloat(promocode.maxDiscountAmount))
    : calculatedDiscount;
  
  const finalDiscountAmount = Math.min(discountAmount, orderAmount);

  return {
    valid: true,
    promocode: {
      id: promocode.id,
      code: promocode.code,
      discountPercentage: promocode.discountPercentage,
    },
    discountAmount: finalDiscountAmount,
  };
}

export async function applyPromocode(
  promocodeId: string,
  userId: string,
  orderId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.execute(
      sql`SELECT * FROM ${promocodes} 
          WHERE ${promocodes.id} = ${promocodeId} 
          FOR UPDATE`
    );

    if (!result.rows || result.rows.length === 0) {
      throw new Error("Промокод не найден");
    }

    const promocode = result.rows[0] as any;

    if (promocode.type === "single_use") {
      const deleteResult = await tx
        .delete(promocodes)
        .where(eq(promocodes.id, promocodeId))
        .returning();

      if (deleteResult.length === 0) {
        throw new Error("Промокод уже использован");
      }
    } else if (promocode.type === "temporary") {
      await tx.insert(promocodeUsage).values({
        promocodeId,
        userId,
        orderId,
      });
    }
  });
}
