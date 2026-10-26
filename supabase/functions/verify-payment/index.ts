import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { screenshotBase64, utrNumber, expectedAmount } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a payment verification AI for Averia AI. Analyze UPI payment screenshots to extract and verify payment details.

Your task:
1. Extract the transaction amount (look for ₹ symbol or "Rs." or numeric values)
2. Extract the UPI Transaction ID (UTR number - usually 12-digit number)
3. Extract the payment date/time
4. Verify if the payee UPI ID contains "ganeshrajak123451@okhdfcbank" or similar
5. Check if the payment status shows "Success" or "Completed"

Return a JSON object with these exact fields:
{
  "verified": boolean (true if all critical details match),
  "amount_detected": string (the amount found, e.g., "₹499"),
  "upi_id_detected": string (the UPI ID found),
  "utr_detected": string (the UTR/Transaction ID found),
  "date_detected": string (the date/time found),
  "status_detected": string (payment status found),
  "confidence": number (0-100 confidence score),
  "issues": string[] (any problems detected)
}

Be strict about verification. If the screenshot is blurry, fake, or details don't match, set verified to false.`;

    const userPrompt = `Analyze this payment screenshot and extract details.
Expected Amount: ₹${expectedAmount}
User-provided UTR: ${utrNumber}
Expected UPI ID: ganeshrajak123451@okhdfcbank

Verify if these match what's in the screenshot.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
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
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI verification failed");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse AI response");
    }

    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Verification failed",
        verified: false,
        confidence: 0,
        issues: ["Failed to process screenshot"]
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
