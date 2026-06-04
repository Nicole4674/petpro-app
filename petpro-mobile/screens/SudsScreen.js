import { useState, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, Image,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

const SUGGESTIONS = [
  'Who do I have tomorrow?',
  'Book Bella for a full groom Friday at 2pm',
  'Which clients are overdue for a groom?',
  "What's my revenue this week?",
];

export default function SudsScreen({ session, navigation }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey! I'm Suds 🦦 Ask me to book appointments, check your day, find clients — or attach a photo of a groom. Anything about your shop." },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [pendingImage, setPendingImage] = useState(null); // { uri, data, media_type }
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef(null);
  const soundRef = useRef(null);
  const recordingRef = useRef(null);

  async function toggleMic() {
    if (isRecording) { stopMic(); return; }
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
    } catch (e) { /* mic perm denied */ }
  }

  async function stopMic() {
    setIsRecording(false);
    const rec = recordingRef.current;
    if (!rec) return;
    setTranscribing(true);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      recordingRef.current = null;
      const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const { data, error } = await supabase.functions.invoke('transcribe', { body: { audio: b64, mime: 'audio/m4a' } });
      if (error) throw new Error(error.message || 'transcribe failed');
      const txt = ((data && data.text) || '').trim();
      if (txt) send(txt);
      else setMessages((prev) => [...prev, { role: 'assistant', text: "I didn't catch that — try again a little closer to the mic." }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Voice error: ${e.message || 'could not transcribe'}` }]);
    } finally { setTranscribing(false); }
  }

  async function attachPhoto(fromCamera) {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const opts = { mediaTypes: ['images'], quality: 0.5, base64: true };
      const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled) return;
      const a = res.assets[0];
      setPendingImage({ uri: a.uri, data: a.base64, media_type: a.mimeType || 'image/jpeg' });
    } catch (e) { /* user cancelled / no perm */ }
  }

  async function speakSuds(reply) {
    if (!voiceOn || !reply) return;
    try {
      const { data: { session: s } } = await supabase.auth.getSession();
      const res = await fetch(`${supabase.supabaseUrl}/functions/v1/petpro-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(s && s.access_token) || supabase.supabaseKey}`,
          apikey: supabase.supabaseKey,
        },
        body: JSON.stringify({ text: reply }),
      });
      if (!res.ok) return;
      const ab = await res.arrayBuffer();
      const b64 = base64FromArrayBuffer(ab);
      const fileUri = `${FileSystem.cacheDirectory}suds.mp3`;
      await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: FileSystem.EncodingType.Base64 });
      if (soundRef.current) { try { await soundRef.current.unloadAsync(); } catch (e) { /* noop */ } }
      const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
      soundRef.current = sound;
    } catch (e) { /* voice is best-effort */ }
  }

  async function send(preset) {
    const msg = (preset || text).trim();
    if ((!msg && !pendingImage) || sending) return;
    setText('');
    const img = pendingImage;
    setPendingImage(null);
    const next = [...messages, { role: 'user', text: msg || '📷 Photo', image: img && img.uri }];
    setMessages(next);
    setSending(true);
    setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 80);
    try {
      const history = [];
      for (let i = 1; i < next.length - 1; i += 2) {
        if (next[i].role === 'user' && next[i + 1] && next[i + 1].role === 'assistant') {
          history.push({ user: next[i].text, assistant: next[i + 1].text });
        }
      }
      const body = { message: msg, groomer_id: session.user.id, history: history.slice(-10) };
      if (img) body.images = [{ media_type: img.media_type, data: img.data }];
      const { data, error } = await supabase.functions.invoke('chat-command', { body });
      if (error) throw error;
      const reply = (data && data.text) || 'Done!';
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
      speakSuds(reply);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Sorry, I had trouble with that. Try again!' }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 120);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientHeader style={styles.header}>
        <View style={styles.topRow}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
          </Pressable>
          <Pressable onPress={() => setVoiceOn((v) => !v)} style={styles.voiceToggle}>
            <Ionicons name={voiceOn ? 'volume-high' : 'volume-mute'} size={18} color="#fff" />
            <Text style={styles.voiceText}>{voiceOn ? 'Voice on' : 'Voice off'}</Text>
          </Pressable>
        </View>
        <View style={styles.titleWrap}>
          <Ionicons name="sparkles" size={20} color="#fff" /><Text style={styles.title}>Ask Suds</Text>
        </View>
      </GradientHeader>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
        {messages.map((m, i) => {
          const out = m.role === 'user';
          return (
            <View key={i} style={[styles.bubbleRow, out ? styles.rowOut : styles.rowIn]}>
              {!out ? <View style={styles.sudsDot}><Ionicons name="sparkles" size={13} color="#fff" /></View> : null}
              <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
                {m.image ? <Image source={{ uri: m.image }} style={styles.bubbleImg} /> : null}
                {m.text ? <Text style={[styles.bubbleText, out && { color: '#fff' }]}>{m.text}</Text> : null}
              </View>
            </View>
          );
        })}
        {sending ? (
          <View style={[styles.bubbleRow, styles.rowIn]}>
            <View style={styles.sudsDot}><Ionicons name="sparkles" size={13} color="#fff" /></View>
            <View style={[styles.bubble, styles.bubbleIn]}><ActivityIndicator color={colors.primary} /></View>
          </View>
        ) : null}

        {messages.length <= 1 ? (
          <View style={styles.suggestWrap}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} style={styles.suggest} onPress={() => send(s)}><Text style={styles.suggestText}>{s}</Text></Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {pendingImage ? (
        <View style={styles.preview}>
          <Image source={{ uri: pendingImage.uri }} style={styles.previewImg} />
          <Text style={styles.previewText}>Photo attached</Text>
          <Pressable onPress={() => setPendingImage(null)} hitSlop={8}><Ionicons name="close-circle" size={22} color={colors.textMute} /></Pressable>
        </View>
      ) : null}

      <View style={styles.inputBar}>
        <Pressable style={styles.iconBtn} onPress={() => attachPhoto(false)} disabled={sending}><Ionicons name="attach" size={22} color={colors.primary} /></Pressable>
        <Pressable style={styles.iconBtn} onPress={() => attachPhoto(true)} disabled={sending}><Ionicons name="camera-outline" size={22} color={colors.primary} /></Pressable>
        <Pressable style={[styles.iconBtn, isRecording && styles.micRecording]} onPress={toggleMic} disabled={sending || transcribing}>
          {transcribing ? <ActivityIndicator color={colors.primary} /> : <Ionicons name={isRecording ? 'stop' : 'mic-outline'} size={22} color={isRecording ? '#fff' : colors.primary} />}
        </Pressable>
        <TextInput
          style={styles.input}
          placeholder={isRecording ? 'Listening…' : 'Talk to Suds…'}
          placeholderTextColor={colors.textFaint}
          value={text}
          onChangeText={setText}
          editable={!sending}
          multiline
        />
        <Pressable style={[styles.sendBtn, (sending || (!text.trim() && !pendingImage)) && { opacity: 0.5 }]} onPress={() => send()} disabled={sending || (!text.trim() && !pendingImage)}>
          <Ionicons name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Convert an ArrayBuffer (the TTS mp3) to base64 so we can write it to a file
function base64FromArrayBuffer(buffer) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = new Uint8Array(buffer);
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    result += chars[b0 >> 2];
    result += chars[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < bytes.length ? chars[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[b2 & 63] : '=';
  }
  return result;
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  back: { flexDirection: 'row', alignItems: 'center' },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  voiceToggle: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12 },
  voiceText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  scroll: { padding: 16, paddingBottom: 20 },
  bubbleRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end', gap: 8 },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  sudsDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleOut: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleIn: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  bubbleImg: { width: 180, height: 180, borderRadius: 10, marginBottom: 6 },
  suggestWrap: { gap: 8, marginTop: 8 },
  suggest: { backgroundColor: colors.primaryLight, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14, alignSelf: 'flex-start' },
  suggestText: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.primaryLight },
  previewImg: { width: 40, height: 40, borderRadius: 8 },
  previewText: { flex: 1, fontSize: 13, color: colors.primaryDark, fontWeight: '700' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 10, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  iconBtn: { width: 38, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  micRecording: { backgroundColor: '#ef4444' },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, fontSize: 15, color: colors.text, maxHeight: 120 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
