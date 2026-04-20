import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function VoiceMode() {
    const [status, setStatus] = useState('idle') // idle, listening, processing, speaking
    const [transcript, setTranscript] = useState('')
    const [response, setResponse] = useState('')
    const [history, setHistory] = useState([])
    const [error, setError] = useState(null)
    const [handsFree, setHandsFree] = useState(false)
    const [wakeWordActive, setWakeWordActive] = useState(false)
    const [partialTranscript, setPartialTranscript] = useState('')
    const [voice, setVoice] = useState('female') // male or female
    const [wakeFlash, setWakeFlash] = useState(false)
    const [commandTimeLeft, setCommandTimeLeft] = useState(0)
    const recognitionRef = useRef(null)
    const audioRef = useRef(null)
    const handsFreeRef = useRef(false)
    const voiceRef = useRef('female')
    const statusRef = useRef('idle')
    const historyRef = useRef([])
    const wakeWordRef = useRef(false)
    const commandTimerRef = useRef(null)
    const commandIntervalRef = useRef(null)
    const restartAttemptsRef = useRef(0)
    const audioCtxRef = useRef(null)
    // --- Double-AI / cut-off fix ---
    // commandBufferRef: accumulates what the user is saying after the wake word
    // silenceTimerRef:  3-sec quiet timer — fires the AI once user really stops
    // processingRef:    guard that blocks a second AI call until the first finishes
    const commandBufferRef = useRef('')
    const silenceTimerRef = useRef(null)
    const processingRef = useRef(false)
    // Mirror of partialTranscript so closures (like handleMicClick) can read
    // the live interim text without stale React state.
    const partialTranscriptRef = useRef('')
    // Tracks the TOTAL final text we've already processed from the current
    // recognition session. Android Chrome keeps expanding the same result
    // (hey → hey Pepper → hey Pepper do…) and we must only process the NEW
    // portion each time, not re-append the whole thing.
    const prevFinalsTextRef = useRef('')

    // Keep refs in sync with state
    useEffect(() => {
        handsFreeRef.current = handsFree
    }, [handsFree])

    useEffect(() => {
        statusRef.current = status
    }, [status])

    useEffect(() => {
        historyRef.current = history
    }, [history])

    useEffect(() => {
        wakeWordRef.current = wakeWordActive
    }, [wakeWordActive])

    useEffect(() => {
        voiceRef.current = voice
    }, [voice])

    // Initialize Web Speech API
    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setError('Voice mode requires Chrome browser. Please open PetPro in Chrome.')
            return
        }

        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        var recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'
        recognition.maxAlternatives = 3 // get more guesses for fuzzy wake word matching

        recognition.onresult = function (event) {
            // ----------------------------------------------------------------
            // Android Chrome quirk: in continuous+interim mode, each new final
            // result at a higher index often CONTAINS the previous finals as a
            // prefix (cumulative growth of the same utterance). Concatenating
            // all final results therefore produces "heyhey pethey pet Pro..."
            //
            // Strategy: only look at the LATEST (highest-index) final result.
            // That's the most complete view of the current utterance. We then
            // take the delta vs. what we already committed, so we only
            // process the brand-new words.
            // ----------------------------------------------------------------
            var latestFinal = ''
            var interimTranscript = ''
            var alternates = []

            for (var i = 0; i < event.results.length; i++) {
                var primary = event.results[i][0].transcript
                if (event.results[i].isFinal) {
                    // Latest final wins — we reset alternates so we only
                    // collect alts for the freshest utterance (wake-word match).
                    latestFinal = primary
                    alternates = []
                    for (var a = 0; a < event.results[i].length; a++) {
                        alternates.push(event.results[i][a].transcript)
                    }
                } else {
                    interimTranscript += primary
                }
            }

            // Compute the delta: new words since we last committed.
            var prev = prevFinalsTextRef.current || ''
            var deltaFinalText = ''
            if (latestFinal) {
                if (prev.length > 0 && latestFinal.indexOf(prev) === 0) {
                    // Growth of same utterance (Android cumulative) — take tail
                    deltaFinalText = latestFinal.substring(prev.length)
                    prevFinalsTextRef.current = latestFinal
                } else if (prev.length > 0 && prev.indexOf(latestFinal) === 0) {
                    // Latest is SHORTER than prev (out-of-order event) — skip
                    deltaFinalText = ''
                } else {
                    // Brand new utterance (first word, or after a pause)
                    deltaFinalText = latestFinal
                    prevFinalsTextRef.current = latestFinal
                }
            }

            if (interimTranscript) {
                setPartialTranscript(interimTranscript)
                partialTranscriptRef.current = interimTranscript
                if (handsFreeRef.current && !wakeWordRef.current && statusRef.current === 'listening') {
                    if (detectWakeWord(interimTranscript)) {
                        // Will be handled when final arrives
                    }
                }
                // Keep silence timer alive while mic is still picking up speech
                if (
                    (wakeWordRef.current && commandTimerRef.current) ||
                    (!handsFreeRef.current && statusRef.current === 'listening')
                ) {
                    armSilenceTimer()
                }
            }

            if (deltaFinalText.trim()) {
                setPartialTranscript('')
                partialTranscriptRef.current = ''
                restartAttemptsRef.current = 0
                handleFinalTranscript(deltaFinalText.trim(), alternates)
            }
        }

        recognition.onerror = function (event) {
            console.log('Speech recognition error:', event.error)
            if (event.error === 'no-speech') {
                if (handsFreeRef.current) {
                    restartListening()
                } else {
                    setStatus('idle')
                }
                return
            }
            if (event.error === 'aborted') return
            if (event.error === 'audio-capture') {
                setError('Microphone not found. Check your mic and refresh.')
                setHandsFree(false)
                setStatus('idle')
                return
            }
            if (event.error === 'not-allowed') {
                setError('Microphone permission denied. Click the lock icon in your browser bar to allow it.')
                setHandsFree(false)
                setStatus('idle')
                return
            }
            // Network or other errors — try to recover in hands-free
            if (handsFreeRef.current) {
                restartListening()
            } else {
                setError('Voice error: ' + event.error + '. Try again.')
                setStatus('idle')
            }
        }

        recognition.onend = function () {
            if (handsFreeRef.current && statusRef.current !== 'processing' && statusRef.current !== 'speaking') {
                restartListening()
            } else if (!handsFreeRef.current) {
                if (statusRef.current === 'listening') {
                    setStatus('idle')
                }
            }
        }

        recognitionRef.current = recognition

        // Pause/resume on tab visibility change
        function handleVisibilityChange() {
            if (document.hidden) {
                // Tab hidden — stop listening to save mic and battery
                if (recognitionRef.current) {
                    try { recognitionRef.current.stop() } catch (e) { }
                }
            } else {
                // Tab visible again — resume hands-free if it was on
                if (handsFreeRef.current && statusRef.current === 'idle') {
                    restartListening()
                }
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return function () {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            if (recognitionRef.current) {
                try { recognitionRef.current.stop() } catch (e) { }
            }
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current = null
            }
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel()
            }
            clearCommandWindow()
        }
    }, [])

    // Bulletproof restart with retry logic
    function restartListening() {
        var attempts = restartAttemptsRef.current
        if (attempts >= 5) {
            console.error('Too many restart attempts, giving up')
            setError('Microphone keeps disconnecting. Toggle hands-free off and on to reset.')
            setStatus('idle')
            restartAttemptsRef.current = 0
            return
        }
        var delay = 300 + (attempts * 200) // 300, 500, 700, 900, 1100
        setTimeout(function () {
            if (handsFreeRef.current && recognitionRef.current && !document.hidden) {
                try {
                    prevFinalsTextRef.current = '' // fresh recognition session
                    recognitionRef.current.start()
                    setStatus('listening')
                    restartAttemptsRef.current = 0 // reset on success
                } catch (e) {
                    // Already started or failed — retry
                    restartAttemptsRef.current = attempts + 1
                    if (e.message && e.message.indexOf('already started') === -1) {
                        restartListening()
                    }
                }
            }
        }, delay)
    }

    // Wake word detection — checks main transcript AND alternative recognitions
    function detectWakeWord(text, alternates) {
        var lower = text.toLowerCase().trim()
        var wakeWords = [
            'hey petpro', 'hey pet pro', 'hey pedro', 'hey pet bro', 'hey presto',
            'hey pepro', 'a pet pro', 'okay petpro', 'okay pet pro',
            'hi petpro', 'hi pet pro', 'yo petpro', 'yo pet pro',
            'hey petro', 'hey peppo', 'hey peeper', 'hey peppa',
            'petpro', 'pet pro' // bare name as last resort
        ]

        // Check primary transcript
        for (var w of wakeWords) {
            if (lower.indexOf(w) !== -1) {
                var idx = lower.indexOf(w)
                return {
                    matched: true,
                    command: text.substring(idx + w.length).trim(),
                }
            }
        }

        // Check alternative recognitions (Web Speech often misses on first guess)
        if (alternates) {
            for (var alt of alternates) {
                var altLower = alt.toLowerCase().trim()
                for (var w2 of wakeWords) {
                    if (altLower.indexOf(w2) !== -1) {
                        var idx2 = altLower.indexOf(w2)
                        return {
                            matched: true,
                            command: alt.substring(idx2 + w2.length).trim(),
                        }
                    }
                }
            }
        }

        return { matched: false, command: '' }
    }

    // Exit phrase detection — close hands-free hands-free
    function detectExitPhrase(text) {
        var lower = text.toLowerCase().trim()
        var exitPhrases = [
            'goodbye petpro', 'goodbye pet pro', 'bye petpro', 'bye pet pro',
            'stop listening', 'turn off voice', 'exit voice mode',
            'goodbye pedro', 'bye pedro',
        ]
        for (var p of exitPhrases) {
            if (lower.indexOf(p) !== -1) return true
        }
        return false
    }

    // Quick beep — walkie-talkie style chirp using Web Audio API (no file needed)
    function playBeep() {
        try {
            if (!audioCtxRef.current) {
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
            }
            var ctx = audioCtxRef.current
            var osc = ctx.createOscillator()
            var gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.setValueAtTime(880, ctx.currentTime) // A5 note
            osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08) // ramps up to E6
            gain.gain.setValueAtTime(0.0001, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.16)
        } catch (e) {
            console.log('Beep failed:', e.message)
        }
    }

    // Visual flash when wake word fires
    function flashWake() {
        setWakeFlash(true)
        setTimeout(function () { setWakeFlash(false) }, 600)
    }

    // 15-second command window after wake word (hard cap)
    // Silence auto-fire fires sooner when the user actually stops talking.
    function startCommandWindow() {
        clearCommandWindow()
        setCommandTimeLeft(15)
        var elapsed = 0
        commandIntervalRef.current = setInterval(function () {
            elapsed += 1
            var left = 15 - elapsed
            setCommandTimeLeft(left)
            if (left <= 0) {
                clearCommandWindow()
            }
        }, 1000)
        commandTimerRef.current = setTimeout(function () {
            // Hard time's up — fire whatever's buffered so we don't drop it
            fireAccumulatedCommand()
        }, 15000)
    }

    function clearCommandWindow() {
        if (commandTimerRef.current) {
            clearTimeout(commandTimerRef.current)
            commandTimerRef.current = null
        }
        if (commandIntervalRef.current) {
            clearInterval(commandIntervalRef.current)
            commandIntervalRef.current = null
        }
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
        }
        setCommandTimeLeft(0)
    }

    // Arm/reset the silence timer. Called every time the user speaks
    // another chunk OR while the mic is still picking up audio (interim).
    // Fires the command to the AI only when the user is truly silent for
    // 6 seconds — enough room for natural thinking pauses mid-sentence.
    function armSilenceTimer() {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
        }
        silenceTimerRef.current = setTimeout(function () {
            fireAccumulatedCommand()
        }, 6000)
    }

    // Fire whatever the user has said since the wake word, then reset.
    // Safe to call multiple times — guards handle duplicates.
    function fireAccumulatedCommand() {
        var buffered = (commandBufferRef.current || '').trim()
        commandBufferRef.current = ''
        clearCommandWindow()
        setWakeWordActive(false)
        wakeWordRef.current = false
        if (buffered.length > 0) {
            processCommand(buffered)
        }
    }

    function handleFinalTranscript(text, alternates) {
        var lowerText = text.toLowerCase().trim()

        // Wake word detection in hands-free mode
        if (handsFreeRef.current) {
            // Exit phrase always works (even without wake word active)
            if (detectExitPhrase(lowerText)) {
                playBeep()
                setHandsFree(false)
                setWakeWordActive(false)
                clearCommandWindow()
                try { recognitionRef.current.stop() } catch (e) { }
                setStatus('idle')
                return
            }

            var wakeResult = detectWakeWord(text, alternates)

            if (wakeResult.matched) {
                playBeep()
                flashWake()
                setWakeWordActive(true)
                wakeWordRef.current = true // force-sync so next transcript sees it

                // Seed the buffer with anything said AFTER the wake word in the
                // same breath (e.g. "Hey PetPro book Bella tomorrow at 2")
                commandBufferRef.current = (wakeResult.command || '').trim()

                // 15-sec hard cap + 3-sec silence auto-fire
                startCommandWindow()
                armSilenceTimer()
                setStatus('listening')
                return
            }

            // If the wake word is active and we're still inside the command
            // window, ACCUMULATE this chunk rather than firing immediately.
            // The silence timer (3 sec quiet) decides when we actually send.
            if (wakeWordRef.current && commandTimerRef.current) {
                if (commandBufferRef.current) {
                    commandBufferRef.current += ' ' + text
                } else {
                    commandBufferRef.current = text
                }
                armSilenceTimer() // user spoke — reset the 3-sec quiet countdown
                return
            }

            // No wake word in hands-free mode = ignore
            return
        }

        // Push-to-talk mode: accumulate chunks into buffer instead of firing
        // each one. Fires when the user taps stop OR goes silent for 6 sec.
        // This prevents the mic cutting you off after just "hey" when you
        // were about to say "hey what's my schedule".
        if (commandBufferRef.current) {
            commandBufferRef.current += ' ' + text
        } else {
            commandBufferRef.current = text
        }
        armSilenceTimer()
    }

    async function processCommand(text) {
        // Double-fire guard: if another transcript arrives while the AI is
        // still thinking/speaking, drop it on the floor. Prevents the
        // "two Claudes talking at once" bug.
        if (processingRef.current) {
            console.log('[voice] already processing — skipping duplicate:', text)
            return
        }
        processingRef.current = true

        setTranscript(text)
        setStatus('processing')
        setResponse('')
        setError(null)
        setWakeWordActive(false)
        clearCommandWindow()

        // Stop listening while processing
        try { recognitionRef.current.stop() } catch (e) { }

        try {
            var { data: { user } } = await supabase.auth.getUser()

            // Build conversation history (last 5 exchanges for voice)
            var recentHistory = []
            var h = historyRef.current
            for (var i = 0; i < Math.min(h.length, 5); i++) {
                recentHistory.push({
                    user: h[i].question,
                    assistant: h[i].answer,
                })
            }
            recentHistory.reverse()

            // Send to the SAME chat-command Edge Function (full Claude brain with all tools)
            var { data, error: fnError } = await supabase.functions.invoke('chat-command', {
                body: {
                    message: text,
                    groomer_id: user.id,
                    history: recentHistory,
                },
            })

            if (fnError) {
                console.error('Voice command error:', fnError)
                setError('Could not process command. Try again.')
                setStatus('idle')
                processingRef.current = false
                if (handsFreeRef.current) restartListening()
                return
            }

            var aiResponse = data.text || 'Done!'
            setResponse(aiResponse)

            // Add to history
            setHistory(function (prev) {
                return [{
                    question: text,
                    answer: aiResponse,
                    time: new Date().toLocaleTimeString(),
                }].concat(prev).slice(0, 20)
            })

            // Speak the response
            setStatus('speaking')
            speakText(aiResponse, function () {
                setStatus('idle')
                processingRef.current = false // done — next command allowed
                if (handsFreeRef.current) {
                    restartListening()
                }
            })

        } catch (err) {
            console.error('Voice processing failed:', err)
            setError('Something went wrong. Try again.')
            setStatus('idle')
            processingRef.current = false
            if (handsFreeRef.current) restartListening()
        }
    }

    async function speakText(text, onDone) {
        // Stop anything currently speaking so two replies can't overlap.
        if (audioRef.current) {
            try { audioRef.current.pause() } catch (e) { }
            audioRef.current = null
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
        }
        // Short responses like "Yes?" use browser speech to save ElevenLabs credits
        if (text.length < 10) {
            if ('speechSynthesis' in window) {
                var utterance = new SpeechSynthesisUtterance(text)
                utterance.rate = 1.0
                utterance.onend = function () { if (onDone) onDone() }
                utterance.onerror = function () { if (onDone) onDone() }
                window.speechSynthesis.speak(utterance)
            } else {
                if (onDone) onDone()
            }
            return
        }

        // Use ElevenLabs for real responses
        var voiceIds = {
            male: 'q6K6eJHlET6X3ASlVWD9',
            female: 'nG0TIZdPAnI8j9HaR9NZ',
        }
        var voiceId = voiceIds[voiceRef.current] || voiceIds.female

        try {
            var { data, error: fnError } = await supabase.functions.invoke('text-to-speech', {
                body: {
                    text: text,
                    voice_id: voiceId,
                },
            })

            if (fnError || !data || !data.audio) {
                console.error('ElevenLabs TTS failed, falling back to browser speech')
                // Fallback to browser speech
                if ('speechSynthesis' in window) {
                    var fallbackUtterance = new SpeechSynthesisUtterance(text)
                    fallbackUtterance.rate = 1.0
                    fallbackUtterance.onend = function () { if (onDone) onDone() }
                    fallbackUtterance.onerror = function () { if (onDone) onDone() }
                    window.speechSynthesis.speak(fallbackUtterance)
                } else {
                    if (onDone) onDone()
                }
                return
            }

            // Play the ElevenLabs audio
            var audioData = atob(data.audio)
            var audioArray = new Uint8Array(audioData.length)
            for (var i = 0; i < audioData.length; i++) {
                audioArray[i] = audioData.charCodeAt(i)
            }
            var audioBlob = new Blob([audioArray], { type: 'audio/mpeg' })
            var audioUrl = URL.createObjectURL(audioBlob)
            var audio = new Audio(audioUrl)
            audioRef.current = audio

            audio.onended = function () {
                URL.revokeObjectURL(audioUrl)
                audioRef.current = null
                if (onDone) onDone()
            }

            audio.onerror = function () {
                URL.revokeObjectURL(audioUrl)
                audioRef.current = null
                if (onDone) onDone()
            }

            audio.play()

        } catch (err) {
            console.error('TTS error:', err)
            if (onDone) onDone()
        }
    }

    function handleMicClick() {
        if (status === 'listening') {
            // User tapped stop. Give the mic a tiny moment to flush any
            // pending final transcripts, then fire whatever we've got.
            // Fallback to interim text if mobile Chrome never finalized
            // (common on Android — happens to be why "hey" never went
            // through before).
            try { recognitionRef.current.stop() } catch (e) { }
            setStatus('processing')
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
                silenceTimerRef.current = null
            }
            setTimeout(function () {
                var buffered = (commandBufferRef.current || '').trim()
                if (!buffered) {
                    buffered = (partialTranscriptRef.current || '').trim()
                }
                commandBufferRef.current = ''
                partialTranscriptRef.current = ''
                setPartialTranscript('')
                if (buffered.length > 0) {
                    processCommand(buffered)
                } else {
                    setStatus('idle')
                }
            }, 300)
        } else if (status === 'idle') {
            setError(null)
            setPartialTranscript('')
            partialTranscriptRef.current = ''
            commandBufferRef.current = '' // clear any stale text
            prevFinalsTextRef.current = '' // fresh session — nothing processed yet
            processingRef.current = false
            // Kill any lingering browser speech so we don't dump queued
            // replies when mic turns on.
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel()
            }
            if (audioRef.current) {
                try { audioRef.current.pause() } catch (e) { }
                audioRef.current = null
            }
            try {
                recognitionRef.current.start()
                setStatus('listening')
            } catch (e) {
                setError('Could not start microphone. Try again.')
            }
        }
    }

    function toggleHandsFree() {
        if (handsFree) {
            setHandsFree(false)
            setWakeWordActive(false)
            clearCommandWindow()
            commandBufferRef.current = ''
            processingRef.current = false
            try { recognitionRef.current.stop() } catch (e) { }
            setStatus('idle')
        } else {
            setHandsFree(true)
            setError(null)
            restartAttemptsRef.current = 0
            // Kill any queued speech — Android Chrome loves to dump every
            // pending SpeechSynthesis utterance at once the moment the audio
            // context wakes up. Cancel BEFORE we resume the context.
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel()
            }
            if (audioRef.current) {
                try { audioRef.current.pause() } catch (e) { }
                audioRef.current = null
            }
            commandBufferRef.current = ''
            processingRef.current = false
            setPartialTranscript('')
            partialTranscriptRef.current = ''
            prevFinalsTextRef.current = '' // fresh recognition session
            // Prime AudioContext for beep (browsers require user gesture)
            try {
                if (!audioCtxRef.current) {
                    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
                }
                if (audioCtxRef.current.state === 'suspended') {
                    audioCtxRef.current.resume()
                }
            } catch (e) { }
            try {
                recognitionRef.current.start()
                setStatus('listening')
            } catch (e) {
                setError('Could not start microphone. Try again.')
            }
        }
    }

    function stopSpeaking() {
        // Stop ElevenLabs audio
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current = null
        }
        // Stop browser speech fallback
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel()
        }
        setStatus('idle')
        processingRef.current = false // user interrupted — next command allowed
        if (handsFreeRef.current) {
            restartListening()
        }
    }

    function getStatusText() {
        if (handsFree) {
            switch (status) {
                case 'idle': return 'Hands-free mode active'
                case 'listening':
                    if (wakeWordActive && commandTimeLeft > 0) {
                        return 'Listening for your command... ' + commandTimeLeft + 's'
                    }
                    return 'Listening for "Hey PetPro"...'
                case 'processing': return 'PetPro AI is thinking...'
                case 'speaking': return 'PetPro AI is responding...'
                default: return ''
            }
        }
        switch (status) {
            case 'idle': return 'Tap the mic and ask PetPro anything'
            case 'listening': return 'Listening... tap again when done'
            case 'processing': return 'PetPro AI is thinking...'
            case 'speaking': return 'PetPro AI is responding...'
            default: return ''
        }
    }

    function getStatusClass() {
        var base = ''
        switch (status) {
            case 'listening': base = 'voice-status-listening'; break
            case 'processing': base = 'voice-status-processing'; break
            case 'speaking': base = 'voice-status-speaking'; break
            default: base = ''
        }
        if (wakeFlash) base += ' voice-wake-flash'
        if (wakeWordActive) base += ' voice-wake-active'
        return base
    }

    return (
        <div className="page voice-page">
            <div className="voice-header-bar">
                <h1>PetPro AI Voice Mode</h1>
                <div className="voice-mode-toggle">
                    <button
                        className={'voice-toggle-btn' + (handsFree ? ' voice-toggle-active' : '')}
                        onClick={toggleHandsFree}
                    >
                        {handsFree ? '🎙 Hands-Free ON' : '👆 Push-to-Talk'}
                    </button>
                </div>
            </div>

            {/* Voice Picker */}
            <div className="voice-picker">
                <span className="voice-picker-label">Voice:</span>
                <button
                    className={'voice-pick-btn' + (voice === 'male' ? ' active' : '')}
                    onClick={function () { setVoice('male') }}
                >
                    Male
                </button>
                <button
                    className={'voice-pick-btn' + (voice === 'female' ? ' active' : '')}
                    onClick={function () { setVoice('female') }}
                >
                    Female
                </button>
            </div>

            {handsFree && (
                <div className="voice-hands-free-banner">
                    Say <strong>"Hey PetPro"</strong> followed by your command. Say <strong>"goodbye"</strong> to turn off.
                </div>
            )}

            {/* Main Voice Interface */}
            <div className="voice-interface">
                {/* Push-to-talk mic button */}
                {!handsFree && (
                    <button
                        className={'voice-mic-btn ' + getStatusClass()}
                        onClick={handleMicClick}
                        disabled={status === 'processing'}
                    >
                        {status === 'listening' ? (
                            <span className="mic-icon">⏹</span>
                        ) : status === 'processing' ? (
                            <span className="mic-icon mic-spin">⟳</span>
                        ) : (
                            <span className="mic-icon">🎙</span>
                        )}
                    </button>
                )}

                {/* Hands-free visual indicator */}
                {handsFree && (
                    <div className={'voice-hands-free-indicator ' + getStatusClass()}>
                        <div className="voice-pulse-ring"></div>
                        <span className="voice-hf-icon">
                            {status === 'processing' ? '⟳' : status === 'speaking' ? '🔊' : '🎙'}
                        </span>
                        {/* Countdown ring when wake word active */}
                        {wakeWordActive && commandTimeLeft > 0 && (
                            <div className="voice-countdown">{commandTimeLeft}</div>
                        )}
                    </div>
                )}

                <p className="voice-status-text">{getStatusText()}</p>

                {/* Show what's being heard in real-time */}
                {partialTranscript && status === 'listening' && (
                    <p className="voice-partial">Hearing: "{partialTranscript}"</p>
                )}

                {status === 'speaking' && (
                    <button className="voice-stop-btn" onClick={stopSpeaking}>
                        Stop Speaking
                    </button>
                )}

                {error && <p className="voice-error">{error}</p>}

                {/* Current Response */}
                {transcript && (
                    <div className="voice-current">
                        <div className="voice-you">
                            <span className="voice-label">You said:</span>
                            <p>{transcript}</p>
                        </div>
                        {response && (
                            <div className="voice-ai">
                                <span className="voice-label">PetPro AI:</span>
                                <p>{response}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Quick Commands */}
            <div className="voice-quick-commands">
                <h3>Try saying:</h3>
                <div className="quick-command-list">
                    <span className="quick-cmd">"Hey PetPro, who's my next appointment?"</span>
                    <span className="quick-cmd">"Hey PetPro, book Bella for a groom Thursday at 10"</span>
                    <span className="quick-cmd">"Hey PetPro, Fefe is a 5 all over"</span>
                    <span className="quick-cmd">"Hey PetPro, cancel Mrs. Johnson's appointment"</span>
                    <span className="quick-cmd">"Hey PetPro, what are Coco's grooming notes?"</span>
                    <span className="quick-cmd">"Goodbye PetPro" (turns off hands-free)</span>
                </div>
            </div>

            {/* Conversation History */}
            {history.length > 0 && (
                <div className="voice-history">
                    <h3>Conversation History</h3>
                    {history.map(function (item, i) {
                        return (
                            <div key={i} className="voice-history-item">
                                <div className="voice-history-time">{item.time}</div>
                                <div className="voice-history-q">You: {item.question}</div>
                                <div className="voice-history-a">PetPro AI: {item.answer}</div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
