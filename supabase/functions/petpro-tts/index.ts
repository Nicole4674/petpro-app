// =============================================================================
// petpro-tts — Text-to-Speech for Suds the Otter
// =============================================================================
// Converts Claude's text reply to spoken audio so Suds actually talks back.
// Uses OpenAI's TTS API (cheaper than ElevenLabs for high-volume use):
//   • Voice: fable (warm, friendly male, slight British charm — Suds energy)
//   • Model: tts-1 (fast, $15/1M chars, ~$0.005-0.015 per typical reply)
//
// Request body (POST):
//   { text: string }   // the assistant text to speak
//
// Response:
//   audio/mpeg binary stream — frontend wraps it in a Blob + plays via Audio()
//
// Required env: OPENAI_API_KEY
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiKey) {
      console.error("[petpro-tts] OPENAI_API_KEY not configured")
      return jsonError("Voice is not configured yet — please contact support.", 500)
    }

    const body = await req.json()
    const text = (body.text || "").toString().trim()

    if (!text) {
      return jsonError("text is required", 400)
    }

    // Cap input length to keep cost predictable + voice clip short.
    // 4096 chars ≈ ~3-4 minutes of audio at normal pace.
    const cappedText = text.length > 4096 ? text.slice(0, 4096) : text

    // Call OpenAI TTS
    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",          // fast + cheap; tts-1-hd is 2x cost for marginal quality bump
        voice: "fable",          // soft, warm, British charm — Suds the Otter's voice
        input: cappedText,
        response_format: "mp3",  // smallest file size, widest browser support
        speed: 1.0,              // can slow down later if needed for clarity
      }),
    })

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text()
      console.error("[petpro-tts] OpenAI error:", ttsResponse.status, errText)
      return jsonError("Could not generate Suds's voice — please try again.", 500)
    }

    // Stream the mp3 audio back to the browser
    const audioBuffer = await ttsResponse.arrayBuffer()

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        // Cache for 5 min — same text = same audio = no need to regenerate
        "Cache-Control": "public, max-age=300",
      },
    })
  } catch (err: any) {
    console.error("[petpro-tts] uncaught error:", err)
    return jsonError(err.message || "Internal error", 500)
  }
})

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
