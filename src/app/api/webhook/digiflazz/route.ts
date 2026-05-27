// src/app/api/webhook/digiflazz/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { updateTransactionInDB, getTransactionByIdFromDB } from '@/lib/transaction-utils';
import type { TransactionStatus } from '@/components/transactions/TransactionItem';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';
import { z } from 'zod';

const DigiflazzWebhookDataSchema = z.object({
  ref_id: z.string(),
  status: z.string(),
  buyer_sku_code: z.string(),
  customer_no: z.string(),
  message: z.string(),
  sn: z.string().optional(),
  price: z.number().optional(),
  balance_cut: z.number().optional(),
  rc: z.string().optional(),
  buyer_last_saldo: z.number().optional(),
});

const DigiflazzWebhookPayloadSchema = z.object({
  data: DigiflazzWebhookDataSchema,
});


export async function POST(request: NextRequest) {
  let rawBody = '';
  try {
    rawBody = await request.text();

    if (!rawBody.trim()) {
      console.warn('Received empty body in Digiflazz webhook. Ignoring.');
      return NextResponse.json({ data: { status: 'success', message: 'Webhook with empty body received and ignored.' } }, { status: 200 });
    }

    const jsonPayload = JSON.parse(rawBody);
    const parseResult = DigiflazzWebhookPayloadSchema.safeParse(jsonPayload);
    
    if (!parseResult.success) {
        console.error('Invalid Digiflazz webhook payload structure:', parseResult.error.flatten());
        return NextResponse.json({ error: 'Invalid payload structure.', details: parseResult.error.flatten() }, { status: 400 });
    }
    
    const payload = parseResult.data;
    console.log('Received and validated Digiflazz webhook (validation skipped):', JSON.stringify(payload, null, 2));

    const { data } = payload;
    
    const existingTransaction = await getTransactionByIdFromDB(data.ref_id);
    if (!existingTransaction) {
        console.warn(`Webhook received for unknown ref_id: ${data.ref_id}. Ignoring.`);
        return NextResponse.json({ data: { status: 'success', message: 'Webhook for unknown ref_id ignored.' } }, { status: 200 });
    }

    let internalStatus: TransactionStatus;
    const digiStatusUpper = data.status.toUpperCase();

    if (digiStatusUpper === 'SUKSES' || data.rc === '00') {
      internalStatus = 'Sukses';
    } else if (digiStatusUpper === 'PENDING' || data.rc === '04' || data.rc === '13') {
      internalStatus = 'Pending';
    } else {
      internalStatus = 'Gagal';
    }

    const updateResult = await updateTransactionInDB(
      {
        id: data.ref_id,
        status: internalStatus,
        serialNumber: data.sn || undefined,
        failureReason: internalStatus === 'Gagal' ? data.message : undefined,
        ...(typeof data.price === 'number' && { costPrice: data.price }),
      },
      {
        actorType: 'webhook',
        source: 'webhook_digiflazz',
      }
    );

    if (updateResult.success) {
      console.log(`Transaction ${data.ref_id} updated via webhook to status: ${internalStatus}`);
      
      const originalTransaction = await getTransactionByIdFromDB(data.ref_id);
      if (originalTransaction) {
        const notificationDetails: TelegramNotificationDetails = {
          refId: data.ref_id,
          productName: originalTransaction.productName,
          customerNoDisplay: originalTransaction.details,
          status: internalStatus,
          provider: 'Digiflazz',
          costPrice: data.price ?? data.balance_cut ?? originalTransaction.costPrice,
          sellingPrice: originalTransaction.sellingPrice,
          profit: internalStatus === 'Sukses' ? originalTransaction.sellingPrice - (data.price ?? data.balance_cut ?? originalTransaction.costPrice) : undefined,
          sn: data.sn || null,
          failureReason: internalStatus === 'Gagal' ? data.message : null,
          timestamp: new Date(),
          additionalInfo: 'Webhook Update',
          transactedBy: originalTransaction.transactedBy,
        };
        trySendTelegramNotification(notificationDetails);
      } else {
        console.warn(`Could not send Telegram notification: Transaction ${data.ref_id} not found after update.`);
      }
      
      return NextResponse.json({ data: { status: 'success', message: 'Webhook processed' } }, { status: 200 });
    } else {
      console.error(`Failed to update transaction ${data.ref_id}: ${updateResult.message}`);
      return NextResponse.json({ data: { status: 'failed_internal', message: 'Webhook received, internal processing error.' } }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
        console.error('Error processing Digiflazz webhook: Failed to parse JSON.', { rawBody: rawBody, error: error.message });
        return NextResponse.json({ error: 'Webhook processing error: Invalid JSON body.' }, { status: 400 });
    }
    console.error('Error processing Digiflazz webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Webhook processing error', details: message }, { status: 500 });
  }
}
