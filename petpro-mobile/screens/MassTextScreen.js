import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

export default function MassTextScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState({}); // id -> bool
  const [mode, setMode] = useState('inapp'); // 'inapp' | 'sms'
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, first_name, last_name, phone, sms_consent')
        .eq('groomer_id', session.user.id)
        .or('is_active.is.null,is_active.eq.true')
        .not('phone', 'is', null)
        .order('first_name');
      if (error) throw error;
      setClients(data || []);
      const sel = {};
      (data || []).forEach((c) => { sel[c.id] = true; });
      setSelected(sel);
    } catch (e) { setErr(e.message || 'Could not load clients.'); } finally { setLoading(false); }
  }

  function name(c) { return `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'; }
  function toggle(id) { setSelected((s) => ({ ...s, [id]: !s[id] })); }
  function setAll(v) { const s = {}; clients.forEach((c) => { s[c.id] = v; }); setSelected(s); }

  const recipients = clients.filter((c) => selected[c.id]);

  async function send() {
    const msg = message.trim();
    if (!msg) { setErr('Type a message first.'); return; }
    if (recipients.length === 0) { setErr('Select at least one recipient.'); return; }
    Alert.alert(
      `Send to ${recipients.length} client${recipients.length === 1 ? '' : 's'}?`,
      mode === 'sms' ? 'Sends a real text via Twilio (counts against your quota).' : 'Sends a free in-app message to their portal.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: doSend },
      ],
    );
  }

  async function doSend() {
    setSending(true); setErr(''); setResults(null);
    const msg = message.trim();
    const res = { sent: 0, failed: 0, errors: [] };
    for (const c of recipients) {
      try {
        if (mode === 'sms') {
          const { data, error } = await supabase.functions.invoke('send-sms', {
            body: { to: c.phone, message: msg, groomer_id: session.user.id, sms_type: 'manual' },
          });
          if (error || (data && data.success === false)) throw new Error((data && data.error) || (error && error.message) || 'SMS failed');
        } else {
          // In-app: find or create thread, insert message, bump thread
          let { data: thread } = await supabase.from('threads').select('id')
            .eq('groomer_id', session.user.id).eq('client_id', c.id)
            .order('last_message_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
          let threadId = thread && thread.id;
          if (!threadId) {
            const { data: nt, error: tErr } = await supabase.from('threads')
              .insert({ groomer_id: session.user.id, client_id: c.id, subject: null }).select('id').single();
            if (tErr) throw tErr;
            threadId = nt.id;
          }
          const { data: ins, error: mErr } = await supabase.from('messages').insert({
            thread_id: threadId, groomer_id: session.user.id, client_id: c.id,
            sender_type: 'groomer', text: msg, read_by_groomer: true, read_by_client: false,
          }).select().single();
          if (mErr) throw mErr;
          await supabase.from('threads').update({ last_message_at: ins.created_at }).eq('id', threadId);
        }
        res.sent++;
      } catch (e) {
        res.failed++;
        res.errors.push(`${name(c)}: ${e.message}`);
      }
    }
    setResults(res);
    setSending(false);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Clients</Text>
        </Pressable>
        <View style={styles.titleWrap}>
          <Ionicons name="megaphone" size={20} color="#fff" />
          <Text style={styles.title}>Mass Message</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : results ? (
        <View style={styles.scroll}>
          <View style={styles.resultCard}>
            <Ionicons name="checkmark-circle" size={40} color={colors.green} />
            <Text style={styles.resultBig}>Sent {results.sent}</Text>
            {results.failed > 0 ? <Text style={styles.resultFail}>{results.failed} failed</Text> : null}
            {results.errors.length > 0 ? (
              <ScrollView style={{ maxHeight: 200, marginTop: 10 }}>
                {results.errors.map((e, i) => <Text key={i} style={styles.errLine}>{e}</Text>)}
              </ScrollView>
            ) : null}
          </View>
          <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {/* Mode */}
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeBtn, mode === 'inapp' && styles.modeBtnSel]} onPress={() => setMode('inapp')}>
              <Text style={mode === 'inapp' ? styles.modeTextSel : styles.modeText}>In-App (free)</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === 'sms' && styles.modeBtnSel]} onPress={() => setMode('sms')}>
              <Text style={mode === 'sms' ? styles.modeTextSel : styles.modeText}>SMS (Text)</Text>
            </Pressable>
          </View>
          <Text style={styles.hint}>{mode === 'sms' ? 'Real text via Twilio — counts against your monthly quota.' : 'Free message to each client’s in-app portal inbox.'}</Text>

          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Type your message…"
            placeholderTextColor={colors.textFaint}
            multiline
          />

          <View style={styles.recHead}>
            <Text style={styles.recCount}>{recipients.length} of {clients.length} selected</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setAll(true)}><Text style={styles.selLink}>All</Text></Pressable>
              <Pressable onPress={() => setAll(false)}><Text style={styles.selLink}>None</Text></Pressable>
            </View>
          </View>

          {clients.map((c) => (
            <Pressable key={c.id} style={styles.recRow} onPress={() => toggle(c.id)}>
              <Ionicons name={selected[c.id] ? 'checkbox' : 'square-outline'} size={22} color={selected[c.id] ? colors.primary : colors.textFaint} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recName}>{name(c)}</Text>
                <Text style={styles.recPhone}>{c.phone}{mode === 'sms' && c.sms_consent !== true ? '  · not opted in' : ''}</Text>
              </View>
            </Pressable>
          ))}

          <Pressable style={[styles.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send to {recipients.length}</Text>}
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 18, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  modeRow: { flexDirection: 'row', backgroundColor: '#ede9fe', borderRadius: 12, padding: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  modeBtnSel: { backgroundColor: colors.primary },
  modeText: { color: colors.primaryDark, fontWeight: '700', fontSize: 14 },
  modeTextSel: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 12, color: colors.textMute, marginTop: 8, marginBottom: 12 },
  input: { backgroundColor: colors.card, borderRadius: 12, padding: 14, fontSize: 16, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 90, textAlignVertical: 'top' },
  recHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 },
  recCount: { fontSize: 13, fontWeight: '800', color: colors.textMute },
  selLink: { fontSize: 14, fontWeight: '800', color: colors.primary },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: colors.border },
  recName: { fontSize: 15, fontWeight: '700', color: colors.text },
  recPhone: { fontSize: 12, color: colors.textMute, marginTop: 1 },
  sendBtn: { backgroundColor: colors.green, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  resultCard: { backgroundColor: colors.card, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  resultBig: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 8 },
  resultFail: { fontSize: 15, color: '#b91c1c', fontWeight: '700', marginTop: 4 },
  errLine: { fontSize: 12, color: '#b91c1c', marginTop: 4 },
  doneBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});
