import { Router } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { logger } from '../utils/logger';
import { sql, eq } from 'drizzle-orm';
import { orders, promocodeUsage, promocodes } from '@shared/schema';

const router = Router();

router.post('/yookassa', async (req, res) => {
  try {
    const event = req.body;
    
    if (event.type !== 'payment.succeeded') {
      return res.status(200).json({ message: 'Event type not processed' });
    }

    const paymentId = event.object?.id;
    const yukassaPaymentId = event.object?.metadata?.order_id;

    if (!paymentId || !yukassaPaymentId) {
      logger.warn('YooKassa webhook: missing payment data', { event });
      return res.status(400).json({ message: 'Invalid payment data' });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.yukassaPaymentId, yukassaPaymentId))
      .limit(1);

    if (!order) {
      logger.warn('YooKassa webhook: order not found', { yukassaPaymentId });
      return res.status(404).json({ message: 'Order not found' });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          paymentStatus: 'paid',
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      if (order.promocodeId) {
        const [promo] = await tx
          .select()
          .from(promocodes)
          .where(eq(promocodes.id, order.promocodeId))
          .limit(1);

        if (promo && promo.type === 'temporary') {
          const existingUsage = await tx
            .select()
            .from(promocodeUsage)
            .where(
              sql`promocode_id = ${order.promocodeId} AND user_id = ${order.userId}`
            )
            .limit(1);

          if (!existingUsage.length) {
            await tx.insert(promocodeUsage).values({
              promocodeId: order.promocodeId,
              userId: order.userId,
              orderId: order.id,
            });
          }
        }
      }
    });

    logger.info('Payment confirmed', { yukassaPaymentId, orderId: order.id });
    res.json({ message: 'Payment processed successfully' });
  } catch (error: any) {
    logger.error('YooKassa webhook error', { error: error.message });
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

export default router;
