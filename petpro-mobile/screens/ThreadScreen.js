import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadScreen({ session, route, navigation }) {
  const { channel = 'sms', threadId, clientId, clientName, clientPhone } = route.params;
  const isInApp = channel === 'inapp';

  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]); // normalized: {id, out, body, created_at}
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setErr('');
    try {
      if (isInApp) {
        const { data, error } = await supabase
          .from('messages')
          .select('id, text, attachment_url, sender_type, created_at')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setMessages((data || []).map((m) => ({
          id: m.id,
          out: m.sender_type === 'groomer',
          body: m.text || (m.attachment_url ? '📷 Photo' : ''),
          created_at: m.created_at,
        })));
        // Mark client messages read
        supabase.from('messages')
          .update({ read_by_groomer: true })
          .eq('thread_id', threadId).eq('sender_type', 'client').eq('read_by_groomer', false)
          .then(() => {});
      } else {
        const { data, error } = await supabase
          .from('sms_messages')
          .select('id, direction, body, created_at')
          .eq('groomer_id', session.user.id)
          .eq('client_id', clientId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        setMessages((data || []).map((m) => ({
          id: m.id,
          out: m.direction === 'outbound',
          body: m.body,
          created_at: m.created_at,
        })));
        supabase.from('sms_messages')
          .update({ is_read: true })
          .eq('groomer_id', session.user.id).eq('client_id', clientId)
          .eq('direction', 'inbound').eq('is_read', false)
          .then(() => {});
      }
    } catch (e) {
      setErr(e.message || 'Could not load this conversation.');
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: false }), 100);
    }
  }

  async function send() {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    setErr('');
    try {
      if (isInApp) {
        const { data, error } = await supabase.from('messages').insert({
          thread_id: threadId,
          groomer_id: session.user.id,
          client_id: clientId,
          sender_type: 'groomer',
          text: msg,
          read_by_groomer: true,
          read_by_client: false,
        }).select().single();
        if (error) throw error;
        await supabase.from('threads').update({ last_message_at: data.created_at }).eq('id', threadId);
      } else {
        if (!clientPhone) { setErr('No phone number on file for this client.'); setSending(false); return; }
        const { data, error } = await supabase.functions.invoke('send-sms', {
          body: { to: clientPhone, message: msg, groomer_id: session.user.id, sms_type: 'manual' },
        });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'Send failed');
      }
      setText('');
      await load();
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setErr(e.message || 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  const canSend = isInApp ? !!threadId : !!clientPhone;
  const placeholder = isInApp ? 'Message…' : (clientPhone ? 'Text message…' : 'No phone on file');

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Messages</Text>
        </Pressable>
        <Text style={styles.title}>{clientName || 'Conversation'}</Text>
        <Text style={styles.sub}>{isInApp ? 'In-App chat' : (clientPhone || 'SMS')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Say hi!</Text>
          ) : (
            messages.map((m) => (
              <View key={m.id} style={[styles.bubbleRow, m.out ? styles.rowOut : styles.rowIn]}>
                <View style={[styles.bubble, m.out ? styles.bubbleOut : styles.bubbleIn]}>
                  <Text style={[styles.bubbleText, m.out && { color: '#fff' }]}>{m.body}</Text>
                  <Text style={[styles.bubbleTime, m.out && { color: '#ddd6fe' }]}>{fmtTime(m.created_at)}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          value={text}
          onChangeText={setText}
          editable={canSend && !sending}
          multiline
        />
        <Pressable style={[styles.sendBtn, (sending || !text.trim() || !canSend) && { opacity: 0.5 }]} onPress={send} disabled={sending || !text.trim() || !canSend}>
          {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 20 },
  bubbleRow: { marginBottom: 8, flexDirection: 'row' },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 },
  bubbleOut: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleIn: { backgroundColor: colors.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.textFaint, marginTop: 3, alignSelf: 'flex-end' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, fontSize: 15, color: colors.text, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.primary, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
