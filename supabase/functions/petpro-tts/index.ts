// =============================================================================
// petpro-tts — Text-to-Speech for Suds the Otter
// =============================================================================
// Converts Claude's text reply to spoken audio so Suds actually talks back.
// Uses ElevenLabs' Charlie voice — warm, playful, younger British male.
// (Previously used OpenAI fable. Swapped for stronger British accent + more
// expressive emotion. Nicole already has an ElevenLabs sub for Mortal Ties.)
//
// Voice: very British male — voice_id giAoKpl5weRTCJK7uB9b (Nicole's pick May 2026)
// Model: eleven_turbo_v2_5 — fastest low-latency voice, great quality
//
// Falls back to OpenAI tts-1 with fable if ElevenLabs key is missing or fails,
// so Suds never goes silent.
//
// Request body (POST):
//   { text: string }   // the assistant text to speak
//
// Response:
//   audio/mpeg binary stream — frontend wraps it in a Blob + plays via Audio()
//
// Required env: ELEVENLABS_API (primary), OPENAI_API_KEY (fallback)
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Charlie — ElevenLabs default voice library. Younger, friendly British male.
// To swap voices later: change this voice_id to any other ElevenLabs voice
// (e.g. George, Daniel, Adam, or your own cloned voice).
const ELEVENLABS_VOICE_ID = "giAoKpl5weRTCJK7uB9b"   // British male — Nicole's pick

// Model choice — turbo is fast + great quality. Use eleven_multilingual_v2
// if you want max quality at the cost of slightly higher latency.
const ELEVENLABS_MODEL = "eleven_turbo_v2_5"

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const text = (body.text || "").toString().trim()

    if (!text) {
      return jsonError("text is required", 400)
    }

    // Cap input length to keep cost predictable + voice clip short.
    // ElevenLabs charges per character, so this limit also caps spend.
    const cappedText = text.length > 2000 ? text.slice(0, 2000) : text

    const elevenKey = Deno.env.get("ELEVENLABS_API")
    const openaiKey = Deno.env.get("OPENAI_API_KEY")

    // ─── PRIMARY: ElevenLabs ───
    if (elevenKey) {
      const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`
      const elevenRes = await fetch(elevenUrl, {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: cappedText,
          model_id: ELEVENLABS_MODEL,
          // Voice settings — tweak these to dial in the personality:
          //   stability: 0–1 (lower = more expressive/emotional, higher = more consistent)
          //   similarity_boost: 0–1 (how closely to match the original voice)
          //   style: 0–1 (style exaggeration; 0 = neutral, higher = more dramatic)
          //   use_speaker_boost: clarity boost
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,           // a touch of style for personality
            use_speaker_boost: true,
          },
        }),
      })

      if (elevenRes.ok) {
        const audioBuffer = await elevenRes.arrayBuffer()
        return new Response(audioBuffer, {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "audio/mpeg",
            "Content-Length": audioBuffer.byteLength.toString(),
            "Cache-Control": "public, max-age=300",
            "X-TTS-Provider": "elevenlabs",
          },
        })
      }

      // ElevenLabs failed — log and fall through to OpenAI
      const errText = await elevenRes.text().catch(() => "")
      console.error("[petpro-tts] ElevenLabs error:", elevenRes.status, errText)
    }

    // ─── FALLBACK: OpenAI TTS (if ElevenLabs missing or errored) ───
    if (!openaiKey) {
      console.error("[petpro-tts] No TTS provider configured (no ELEVENLABS_API or OPENAI_API_KEY)")
      return jsonError("Voice is not configured yet — please contact support.", 500)
    }

    const ttsResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "fable",          // British-ish fallback voice
        input: cappedText,
        response_format: "mp3",
        speed: 1.0,
      }),
    })

    if (!ttsResponse.ok) {
      const errText = await ttsResponse.text()
      console.error("[petpro-tts] OpenAI fallback error:", ttsResponse.status, errText)
      return jsonError("Could not generate Suds's voice — please try again.", 500)
    }

    const audioBuffer = await ttsResponse.arrayBuffer()

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=300",
        "X-TTS-Provider": "openai-fallback",
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
