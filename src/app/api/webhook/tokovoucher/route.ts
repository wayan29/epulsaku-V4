// src/app/api/webhook/tokovoucher/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { getAdminSettingsFromDB } from '@/lib/admin-settings-utils';
import { updateTransactionInDB, getTransactionByIdFromDB } from '@/lib/transaction-utils';
import type { TransactionStatus, Transaction } from '@/components/transactions/TransactionItem';
import { trySendTelegramNotification, type TelegramNotificationDetails } from '@/lib/notification-utils';
import crypto from 'crypto'; // For MD5

interface TokoVoucherWebhookPayload {
  ref_id: string; 
  trx_id?: string; 
  code?: string; 
  target?: string; 
  price?: number; 
  status: string; // "sukses", "pending", "gagal"
  sn?: string; 
  message?: string;
  balance?: number; 
  secret?: string; 
}

function getSenderIP(request: NextRequest): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp.trim();
  }
  return request.headers.get('remote_addr') || 'Unknown IP';
}


export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    const payload: TokoVoucherWebhookPayload = JSON.parse(rawBody);
    console.log('Received TokoVoucher webhook payload:', JSON.stringify(payload, null, 2));

    const adminSettings = await getAdminSettingsFromDB();
    if (!adminSettings.tokovoucherMemberCode || !adminSettings.tokovoucherKey) {
      console.error('TokoVoucher Member Code or Key (Secret) not configured in admin settings.');
      return NextResponse.json({ error: 'TokoVoucher integration not configured' }, { status: 500 });
    }

    const senderIP = getSenderIP(request);
    const allowedIPsString = adminSettings.allowedTokoVoucherIPs || "";
    const allowedIPs = allowedIPsString.split(',').map(ip => ip.trim()).filter(ip => ip);

    if (allowedIPs.length > 0 && !allowedIPs.includes(senderIP)) {
      console.warn(`TokoVoucher webhook: Denied IP ${senderIP}. Allowed: ${allowedIPs.join(', ')}`);
      return NextResponse.json({ error: 'IP not allowed' }, { status: 403 });
    }
    console.log(`TokoVoucher webhook: Accepted IP ${senderIP}`);

    const receivedAuth = request.headers.get('x-tokovoucher-authorization');
    if (!payload.ref_id) {
        console.error('TokoVoucher webhook: Missing ref_id in payload.');
        return NextResponse.json({ error: 'Invalid payload, missing ref_id' }, { status: 400 });
    }

    const expectedAuth = crypto
      .createHash('md5')
      .update(`${adminSettings.tokovoucherMemberCode}:${adminSettings.tokovoucherKey}:${payload.ref_id}`)
      .digest('hex');

    if (receivedAuth !== expectedAuth) {
      console.warn(`TokoVoucher webhook auth mismatch for ref_id ${payload.ref_id}. Expected: ${expectedAuth}, Received: ${receivedAuth}`);
      return NextResponse.json({ error: 'Invalid authorization header' }, { status: 403 });
    }
    console.log(`TokoVoucher X-TokoVoucher-Authorization verified for ref_id ${payload.ref_id}`);

    if (!payload.status) {
      console.error('Invalid TokoVoucher webhook payload (missing status):', payload);
      return NextResponse.json({ error: 'Invalid payload, missing status' }, { status: 400 });
    }

    let internalStatus: TransactionStatus;
    const tokoStatusLower = payload.status.toLowerCase();

    if (tokoStatusLower === "sukses") {
      internalStatus = "Sukses";
    } else if (tokoStatusLower === "pending") {
      internalStatus = "Pending";
    } else { 
      internalStatus = "Gagal";
    }

    const updateResult = await updateTransactionInDB({
      id: payload.ref_id,
      status: internalStatus,
      serialNumber: payload.sn || undefined, 
      failureReason: internalStatus === "Gagal" ? (payload.sn || payload.message) : undefined,
      providerTransactionId: payload.trx_id || undefined,
      ...(payload.price && { costPrice: payload.price }),
    });

    if (updateResult.success) {
      console.log(`Transaction ${payload.ref_id} updated successfully via TokoVoucher webhook to status: ${internalStatus}`);
      
      const originalTransaction = await getTransactionByIdFromDB(payload.ref_id);
      if (originalTransaction) {
        const notificationDetails: TelegramNotificationDetails = {
          refId: payload.ref_id,
          productName: originalTransaction.productName,
          customerNoDisplay: originalTransaction.details,
          status: internalStatus,
          provider: 'TokoVoucher',
          costPrice: payload.price ?? originalTransaction.costPrice,
          sellingPrice: originalTransaction.sellingPrice,
          profit: internalStatus === "Sukses" ? originalTransaction.sellingPrice - (payload.price ?? originalTransaction.costPrice) : undefined,
          sn: payload.sn || null,
          failureReason: internalStatus === "Gagal" ? (payload.sn || payload.message) : null,
          timestamp: new Date(),
          additionalInfo: "Webhook Update",
          trxId: payload.trx_id || originalTransaction.providerTransactionId,
          transactedBy: originalTransaction.transactedBy,
        };
        trySendTelegramNotification(notificationDetails);
      } else {
         console.warn(`Could not send Telegram notification for TokoVoucher webhook: Transaction ${payload.ref_id} not found in DB after update.`);
      }

      return NextResponse.json({ message: "Webhook processed" }, { status: 200 }); 
    } else {
      console.error(`Failed to update transaction ${payload.ref_id} from TokoVoucher webhook: ${updateResult.message}`);
      return NextResponse.json({ message: "Webhook received, internal processing error." }, { status: 200 });
    }

  } catch (error) {
    console.error('Error processing TokoVoucher webhook. Raw body:', rawBody, 'Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Webhook processing error', details: message }, { status: 500 });
  }
}
