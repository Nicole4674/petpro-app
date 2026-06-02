import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadScreen({ session, route, navigation }) {
  const { clientId, clientName, clientPhone } = route.params;
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const scrollRef = useRef(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setErr('');
    try {
      const { data, error } = await supabase
        .from('sms_messages')
        .select('id, direction, body, created_at')
        .eq('groomer_id', session.user.id)
        .eq('client_id', clientId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setMessages(data || []);
      // Mark inbound as read (fire-and-forget)
      supabase.from('sms_messages')
        .update({ is_read: true })
        .eq('groomer_id', session.user.id)
        .eq('client_id', clientId)
        .eq('direction', 'inbound')
        .eq('is_read', false)
        .then(() => {});
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
    if (!clientPhone) { setErr('No phone number on file for this client.'); return; }
    setSending(true);
    setErr('');
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: { to: clientPhone, message: msg, groomer_id: session.user.id, sms_type: 'manual' },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Send failed');
      setText('');
      await load(); // send-sms logged the outbound; refetch to show it
      setTimeout(() => scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }), 150);
    } catch (e) {
      setErr(e.message || 'Could not send.');
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>‹ Messages</Text>
        </Pressable>
        <Text style={styles.title}>{clientName || 'Conversation'}</Text>
        {clientPhone ? <Text style={styles.sub}>{clientPhone}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll}>
          {messages.length === 0 ? (
            <Text style={styles.empty}>No messages yet. Say hi 👋</Text>
          ) : (
            messages.map((m) => {
              const out = m.direction === 'outbound';
              return (
                <View key={m.id} style={[styles.bubbleRow, out ? styles.rowOut : styles.rowIn]}>
                  <View style={[styles.bubble, out ? styles.bubbleOut : styles.bubbleIn]}>
                    <Text style={[styles.bubbleText, out && { color: '#fff' }]}>{m.body}</Text>
                    <Text style={[styles.bubbleTime, out && { color: '#ddd6fe' }]}>{fmtTime(m.created_at)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={clientPhone ? 'Message…' : 'No phone on file'}
          placeholderTextColor="#9ca3af"
          value={text}
          onChangeText={setText}
          editable={!!clientPhone && !sending}
          multiline
        />
        <Pressable style={[styles.sendBtn, (sending || !text.trim() || !clientPhone) && { opacity: 0.5 }]} onPress={send} disabled={sending || !text.trim() || !clientPhone}>
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 20 },
  bubbleRow: { marginBottom: 8, flexDirection: 'row' },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 },
  bubbleOut: { backgroundColor: '#7c3aed', borderBottomRightRadius: 4 },
  bubbleIn: { backgroundColor: '#fff', borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, color: '#1f2937', lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: '#9ca3af', marginTop: 3, alignSelf: 'flex-end' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  input: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 16, fontSize: 15, color: '#1f2937', maxHeight: 100 },
  sendBtn: { backgroundColor: '#7c3aed', borderRadius: 20, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
