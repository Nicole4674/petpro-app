// transcribe — speech-to-text for the mobile Suds mic.
// Receives { audio: base64, mime } from the app, sends it to OpenAI Whisper,
// returns { text }. Used so groomers can talk to Suds while driving.
// Required env: OPENAI_API_KEY (already set — petpro-tts uses it as a fallback).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json()
    const audioB64 = (body.audio || "").toString()
    const mime = (body.mime || "audio/m4a").toString()
    if (!audioB64) return jsonError("audio is required", 400)

    const openaiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiKey) return jsonError("No OPENAI_API_KEY configured on the server", 500)

    // Decode base64 → bytes
    const binary = atob(audioB64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    // Pick a filename extension Whisper accepts based on the mime
    const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a"
      : mime.includes("wav") ? "wav"
      : mime.includes("webm") ? "webm"
      : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : "m4a"

    const form = new FormData()
    form.append("file", new Blob([bytes], { type: mime }), `audio.${ext}`)
    form.append("model", "whisper-1")

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      return jsonError("Whisper error: " + errText.slice(0, 200), 502)
    }
    const data = await res.json()
    return new Response(JSON.stringify({ text: data.text || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return jsonError(e.message || "Transcription failed", 500)
  }
})
