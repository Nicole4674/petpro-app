// ====================================================================
// PetPro: Generic SMS Sender (Supabase Edge Function)
// ====================================================================
// This function sends a text via Twilio. It's GENERIC — the caller
// supplies the phone number and the message body. Used for:
//   - Appointment reminders (24h before)
//   - Confirmation texts
//   - Rebook nudges
//   - Mass notifications ("closing early Friday, sorry!")
//   - Any future Claude-initiated text
//
// POST body format:
//   { to: "+12815551234", message: "Your appointment is tomorrow at 9 AM" }
//
// Returns:
//   { success: true,  sid: "SMxxx..." }   <- Twilio message SID
//   { success: false, error: "..." }
//
// Deploy to Supabase:
//   1. Supabase Dashboard -> Edge Functions -> "Deploy a new function"
//   2. Name: send-sms
//   3. Paste this file contents into the editor
//   4. Click Deploy
// ====================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Send SMS request received')

    // Validate inputs
    const toNumber = body.to
    const messageText = body.message

    if (!toNumber) {
      console.log('Missing "to" phone number')
      return new Response(
        JSON.stringify({ success: false, error: 'Missing to phone number' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!messageText) {
      console.log('Missing "message" body')
      return new Response(
        JSON.stringify({ success: false, error: 'Missing message body' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Twilio credentials from Supabase secrets
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!accountSid || !authToken || !fromNumber) {
      console.log('Missing Twilio credentials')
      return new Response(
        JSON.stringify({ success: false, error: 'SMS not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Sending SMS to:', toNumber)

    // Send via Twilio REST API
    const twilioUrl =
      'https://api.twilio.com/2010-04-01/Accounts/' + accountSid + '/Messages.json'

    // Twilio uses Basic Auth with Account SID and Auth Token
    const authString = accountSid + ':' + authToken
    const authBase64 = btoa(authString)

    // Twilio expects form-encoded body
    const formBody =
      'To=' + encodeURIComponent(toNumber) +
      '&From=' + encodeURIComponent(fromNumber) +
      '&Body=' + encodeURIComponent(messageText)

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + authBase64,
      },
      body: formBody,
    })

    const twilioData = await twilioResponse.json()
    console.log('Twilio response status:', twilioResponse.status)

    if (twilioResponse.status === 201 || twilioResponse.status === 200) {
      console.log('SMS sent successfully, SID:', twilioData.sid)
      return new Response(
        JSON.stringify({ success: true, sid: twilioData.sid }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      console.error('Twilio error:', JSON.stringify(twilioData))
      return new Response(
        JSON.stringify({ success: false, error: twilioData.message || 'SMS send failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (err) {
    console.error('Function error:', err.message)
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
