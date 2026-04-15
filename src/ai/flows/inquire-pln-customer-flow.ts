
'use server';
/**
 * @fileOverview A Genkit flow for inquiring PLN customer data from Digiflazz.
 *
 * - inquirePlnCustomer - A function that calls the Digiflazz PLN customer inquiry flow.
 * - InquirePlnCustomerInput - The input type for the inquirePlnCustomer function.
 * - InquirePlnCustomerOutput - The return type for the inquirePlnCustomer function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import crypto from 'crypto';
import { getAdminSettingsFromDB } from '@/lib/admin-settings-utils'; // Import new settings utility
import {
  getSavedPlnCustomerByLookupValue,
  saveSuccessfulPlnValidation,
  type SuccessfulPlnValidationData,
} from '@/lib/savepln-utils';

function normalizePlnLookupValue(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value.replace(/\D/g, '').trim();
}

const InquirePlnCustomerInputSchema = z.object({
  customerNo: z.string().min(10, "Customer number must be at least 10 characters").describe('The PLN customer number (IDPEL or Nomor Meter).'),
});
export type InquirePlnCustomerInput = z.infer<typeof InquirePlnCustomerInputSchema>;

const InquirePlnCustomerOutputSchema = z.object({
  isSuccess: z.boolean().describe('Whether the inquiry was successful.'),
  customerName: z.string().optional().describe('The name of the PLN customer if found.'),
  meterNo: z.string().optional().describe('The meter number of the PLN customer.'),
  subscriberId: z.string().optional().describe('The subscriber ID of the PLN customer.'),
  segmentPower: z.string().optional().describe('The segment power of the PLN customer (e.g., R1/900VA).'),
  message: z.string().optional().describe('An optional message, e.g., error message or status message.'),
  rawResponse: z.any().optional().describe('The raw response data from Digiflazz for debugging.'),
  source: z.enum(['cache', 'digiflazz']).optional().describe('Whether the inquiry came from the local savepln cache or Digiflazz directly.'),
});
export type InquirePlnCustomerOutput = z.infer<typeof InquirePlnCustomerOutputSchema>;

// This is the function you'll call from your client-side code.
export async function inquirePlnCustomer(input: InquirePlnCustomerInput): Promise<InquirePlnCustomerOutput> {
  return inquirePlnCustomerFlow(input);
}

const inquirePlnCustomerFlow = ai.defineFlow(
  {
    name: 'inquirePlnCustomerFlow',
    inputSchema: InquirePlnCustomerInputSchema,
    outputSchema: InquirePlnCustomerOutputSchema,
  },
  async (input): Promise<InquirePlnCustomerOutput> => {
    const normalizedCustomerNo = normalizePlnLookupValue(input.customerNo);
    if (!normalizedCustomerNo) {
      return {
        isSuccess: false,
        message: 'Customer number is required.',
      };
    }

    const savedCustomer = await getSavedPlnCustomerByLookupValue(normalizedCustomerNo);
    if (savedCustomer) {
      return {
        isSuccess: true,
        customerName: savedCustomer.customerName,
        meterNo: savedCustomer.meterNo,
        subscriberId: savedCustomer.subscriberId,
        segmentPower: savedCustomer.segmentPower,
        message:
          savedCustomer.message ||
          'Data pelanggan PLN diambil dari riwayat pelanggan tersimpan.',
        rawResponse: savedCustomer.rawResponse,
        source: 'cache',
      };
    }

    const adminSettings = await getAdminSettingsFromDB();
    const username = adminSettings.digiflazzUsername;
    const apiKey = adminSettings.digiflazzApiKey;
    const digiflazzApiUrl = 'https://api.digiflazz.com/v1/inquiry-pln'; 

    if (!username || !apiKey) {
      return { 
          isSuccess: false, 
          message: 'Error: Digiflazz username or API key is not configured in Admin Settings.',
      };
    }

    // Signature for /v1/inquiry-pln is md5(username + apiKey + customer_no)
    const signaturePayload = `${username}${apiKey}${input.customerNo}`; 
    const sign = crypto.createHash('md5').update(signaturePayload).digest('hex');

    const requestBody = {
      username: username,
      customer_no: input.customerNo,
      sign: sign,
      // testing: true, // Uncomment if you are using Digiflazz development/sandbox key
    };

    try {
      const response = await fetch(digiflazzApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        // This handles HTTP errors (e.g., 4xx, 5xx)
        console.error('Digiflazz API HTTP error response (PLN Inquiry):', responseData);
        const errorMessage = responseData?.data?.message || responseData?.message || `Digiflazz API request failed: ${response.status} ${response.statusText}`;
        return { 
            isSuccess: false, 
            message: `Error: ${errorMessage}`,
            rawResponse: responseData 
        };
      }
      
      // Check for application-level errors within responseData.data (e.g., rc != "00")
      if (responseData.data && responseData.data.rc && String(responseData.data.rc) !== '00') {
        console.error('Digiflazz API returned an error (PLN Inquiry):', responseData.data);
        return { 
            isSuccess: false, 
            message: `Inquiry failed: ${responseData.data.message || 'Unknown Digiflazz error'} (RC: ${responseData.data.rc})`,
            rawResponse: responseData 
        };
      }

      // Expected success structure for PLN inquiry (rc: "00" and customer name exists)
      // Using responseData.data.name as per the documentation provided
      if (responseData.data && String(responseData.data.rc) === '00' && responseData.data.name) {
        const successfulResult: SuccessfulPlnValidationData & InquirePlnCustomerOutput = {
          isSuccess: true,
          customerName: responseData.data.name.trim(),
          meterNo: responseData.data.meter_no,
          subscriberId: responseData.data.subscriber_id,
          segmentPower: responseData.data.segment_power,
          message: responseData.data.message || 'Inquiry successful.',
          rawResponse: responseData,
          source: 'digiflazz',
        };

        await saveSuccessfulPlnValidation(normalizedCustomerNo, successfulResult);

        return successfulResult;
      } else {
        // If rc is "00" but data.name is missing, or other unexpected structure
        console.error('Unexpected Digiflazz API success response structure (PLN Inquiry):', responseData);
        return { 
            isSuccess: false, 
            message: responseData?.data?.message || 'Unexpected response structure from Digiflazz API after successful RC.',
            rawResponse: responseData 
        };
      }
    } catch (error) {
      console.error('Error during PLN inquiry:', error);
      let errorMessage = 'An unknown error occurred during PLN inquiry.';
      if (error instanceof Error) {
        if (error.message === 'Digiflazz username or API key is not configured in Admin Settings.') {
            return { isSuccess: false, message: error.message };
        }
        errorMessage = error.message;
      }
      return { 
          isSuccess: false, 
          message: `Client-side error: ${errorMessage}`,
      };
    }
  }
);
