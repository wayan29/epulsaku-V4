// src/app/api/webhook/digiflazz/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAdminSettingsFromDB } from '@/lib/admin-settings-utils';
import { updateTransactionInDB, getTransactionByIdFromDB } from '@/lib/transaction-utils';
import type { TransactionStatus, Transaction } from '@/components/transactions/TransactionItem';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';

// Digiflazz sends status as strings: "Sukses", "Pending", "Gagal"
// Their response codes (rc) also indicate status, e.g., "00" for success.
// We'll primarily rely on the string status if available.

interface DigiflazzWebhookData {
  ref_id: string;
  status: string; // "Sukses", "Pending", "Gagal"
  buyer_sku_code: string;
  customer_no: string;
  message: string;
  sn?: string; // Serial number / token
  price?: number; // Price charged by Digiflazz
  balance_cut?: number; // Amount deducted from balance
  rc?: string; // Response Code
  buyer_last_saldo?: number; // Saldo setelah transaksi
  // ... other fields Digiflazz might send
}

interface DigiflazzWebhookPayload {
  data: DigiflazzWebhookData;
  sign?: string; // Optional because we will validate it
}

export async function POST(request: NextRequest) {
  try {
    const payload: DigiflazzWebhookPayload = await request.json();
    console.log('Received Digiflazz webhook:', JSON.stringify(payload, null, 2));

    const adminSettings = await getAdminSettingsFromDB();
    if (!adminSettings.digiflazzUsername || !adminSettings.digiflazzApiKey) {
      console.error('Digiflazz credentials not configured in admin settings.');
      return NextResponse.json({ error: 'Digiflazz integration not configured' }, { status: 500 });
    }

    const { data, sign: receivedSign } = payload;

    if (!data || !data.ref_id || !data.status) {
      console.error('Invalid Digiflazz webhook payload:', data);
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Verify signature
    // Signature is md5(username + apiKey + ref_id)
    const expectedSignature = crypto
      .createHash('md5')
      .update(adminSettings.digiflazzUsername + adminSettings.digiflazzApiKey + data.ref_id)
      .digest('hex');

    if (receivedSign !== expectedSignature) {
      console.warn(`Digiflazz webhook signature mismatch for ref_id ${data.ref_id}. Expected: ${expectedSignature}, Received: ${receivedSign}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    console.log(`Digiflazz signature verified for ref_id ${data.ref_id}`);

    // Map Digiflazz status to our internal status
    let internalStatus: TransactionStatus;
    const digiStatusUpper = data.status.toUpperCase();

    if (digiStatusUpper === "SUKSES" || data.rc === "00") {
      internalStatus = "Sukses";
    } else if (digiStatusUpper === "PENDING" || data.rc === "04" || data.rc === "13") { // Assuming some RCs might also mean pending
      internalStatus = "Pending";
    } else {
      internalStatus = "Gagal";
    }

    const updateResult = await updateTransactionInDB(
      {
        id: data.ref_id,
        status: internalStatus,
        serialNumber: data.sn || undefined,
        failureReason: internalStatus === "Gagal" ? data.message : undefined,
        // Pass costPrice if provided by webhook to potentially update it
        ...(typeof data.price === 'number' && { costPrice: data.price }),
      },
      {
        actorType: 'webhook',
        source: 'webhook_digiflazz',
      }
    );

    if (updateResult.success) {
      console.log(`Transaction ${data.ref_id} updated successfully via Digiflazz webhook to status: ${internalStatus}`);
      
      // Send Telegram notification
      const originalTransaction = await getTransactionByIdFromDB(data.ref_id);
      if (originalTransaction) {
        const notificationDetails: TelegramNotificationDetails = {
          refId: data.ref_id,
          productName: originalTransaction.productName, // Use name from DB for consistency
          customerNoDisplay: originalTransaction.details, // Use details from DB
          status: internalStatus,
          provider: 'Digiflazz',
          costPrice: data.price ?? data.balance_cut ?? originalTransaction.costPrice, // Prefer webhook price, fallback to DB
          sellingPrice: originalTransaction.sellingPrice, // Crucial: use our selling price
          profit: internalStatus === "Sukses" ? originalTransaction.sellingPrice - (data.price ?? data.balance_cut ?? originalTransaction.costPrice) : undefined,
          sn: data.sn || null,
          failureReason: internalStatus === "Gagal" ? data.message : null,
          timestamp: new Date(), // Use current time for webhook update notification
          additionalInfo: "Webhook Update",
          transactedBy: originalTransaction.transactedBy, // Pass the user who made the transaction
        };
        trySendTelegramNotification(notificationDetails);
      } else {
        console.warn(`Could not send Telegram notification for Digiflazz webhook: Transaction ${data.ref_id} not found in DB after update.`);
      }

      return NextResponse.json({
        data: {
          status: "success", 
          message: "Webhook processed"
        }
      }, { status: 200 });
    } else {
      console.error(`Failed to update transaction ${data.ref_id} from Digiflazz webhook: ${updateResult.message}`);
      return NextResponse.json({
        data: {
            status: "failed_internal",
            message: "Webhook received, internal processing error."
        }
      }, { status: 200 }); 
    }

  } catch (error) {
    console.error('Error processing Digiflazz webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Webhook processing error', details: message }, { status: 500 });
  }
}
