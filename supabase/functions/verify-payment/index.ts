import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  AVERIA_SYSTEM_PERSONA,
  getAdminSupabase,
  executeWithGeminiRotation,
} from "../_shared/keyManager.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { screenshotBase64, utrNumber, expectedAmount } = await req.json().catch(() => ({}));

    if (!screenshotBase64) {
      return new Response(
        JSON.stringify({ error: "Screenshot data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getAdminSupabase();

    const systemPrompt = `${AVERIA_SYSTEM_PERSONA}
You are Averia Payment Verification Engine. Analyze UPI payment screenshots to extract and verify payment details with strict forensic accuracy.

Your task:
1. Extract the transaction amount (look for ₹ symbol or "Rs." or numeric values).
2. Extract the UPI Transaction ID (UTR number - usually 12-digit number).
3. Extract the payment date/time.
4. Verify if the payee UPI ID contains "ganeshrajak123451@okhdfcbank" or matches.
5. Check if the payment status shows "Success" or "Completed".

Return a STRICT JSON object with these exact fields:
{
  "verified": boolean,
  "amount_detected": "<detected amount string, e.g. '₹499'>",
  "upi_id_detected": "<detected UPI ID>",
  "utr_detected": "<detected UTR>",
  "date_detected": "<detected timestamp>",
  "status_detected": "<detected status>",
  "confidence": <number 0-100>,
  "issues": ["<list of any mismatches or visual anomalies>"]
}

Be strict. If the screenshot is manipulated, blurred, fake, or details do not match, set verified to false.`;

    const userPrompt = `Analyze this payment screenshot and extract details:
Expected Amount: ₹${expectedAmount || 499}
User-provided UTR: ${utrNumber || "N/A"}
Expected Payee: ganeshrajak123451@okhdfcbank`;

    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${screenshotBase64}`,
            },
          },
        ],
      },
    ];

    const aiRes = await executeWithGeminiRotation(supabase, {
      messages,
      systemPrompt,
      model: "gemini-2.5-pro",
      forensicMode: true,
      jsonMode: true,
      stream: false,
    });

    if (!aiRes.ok) {
      return aiRes;
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawContent);
    } catch {
      result = {
        verified: false,
        amount_detected: "Unknown",
        upi_id_detected: "Unknown",
        utr_detected: utrNumber || "Unknown",
        date_detected: "Unknown",
        status_detected: "Uncertain",
        confidence: 40,
        issues: ["Could not parse structured verification result from screenshot"],
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[verify-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Payment verification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
