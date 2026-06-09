import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors, shadow } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function fmtWhen(s) {
  if (!s) return '—';
  return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AgreementsScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState([]);
  const [edit, setEdit] = useState({});           // id -> { title, content, saving, savedAt }
  const [enabled, setEnabled] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const gid = session.user.id;
      const [{ data: shop }, { data, error }] = await Promise.all([
        supabase.from('shop_settings').select('agreements_enabled').eq('groomer_id', gid).maybeSingle(),
        supabase.from('agreements').select('*').eq('groomer_id', gid).order('type', { ascending: true }),
      ]);
      if (error) throw error;
      setEnabled(!!(shop && shop.agreements_enabled));
      setAgreements(data || []);
      const init = {};
      (data || []).forEach((a) => { init[a.id] = { title: a.title, content: a.content, saving: false, savedAt: null }; });
      setEdit(init);
    } catch (e) { setErr(e.message || 'Could not load agreements.'); } finally { setLoading(false); }
  }

  function setField(id, field, value) {
    setEdit((p) => ({ ...p, [id]: { ...p[id], [field]: value, savedAt: null } }));
  }

  async function save(a) {
    const s = edit[a.id];
    if (!s) return;
    if (!s.title.trim() || !s.content.trim()) { setErr('Title and waiver text cannot be empty.'); return; }
    setErr('');
    setEdit((p) => ({ ...p, [a.id]: { ...p[a.id], saving: true } }));
    try {
      const { error } = await supabase.from('agreements')
        .update({ title: s.title.trim(), content: s.content.trim(), updated_at: new Date().toISOString() })
        .eq('id', a.id);
      if (error) throw error;
      // reflect new "original" so dirty resets
      setAgreements((prev) => prev.map((x) => x.id === a.id ? { ...x, title: s.title.trim(), content: s.content.trim(), updated_at: new Date().toISOString() } : x));
      setEdit((p) => ({ ...p, [a.id]: { ...p[a.id], saving: false, savedAt: new Date().toISOString() } }));
    } catch (e) {
      setErr('Could not save: ' + (e.message || e));
      setEdit((p) => ({ ...p, [a.id]: { ...p[a.id], saving: false } }));
    }
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" /><Text style={styles.backText}>More</Text>
        </Pressable>
        <View style={styles.titleWrap}><Ionicons name="document-text" size={20} color="#fff" /><Text style={styles.title}>Agreements</Text></View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Status badge */}
            <View style={[styles.statusBadge, enabled ? styles.statusOn : styles.statusOff]}>
              <Ionicons name={enabled ? 'checkmark-circle' : 'pause-circle'} size={16} color={enabled ? '#166534' : '#6b7280'} />
              <Text style={[styles.statusText, { color: enabled ? '#166534' : '#6b7280' }]}>
                {enabled ? 'Required at portal login' : 'OFF — clients are not prompted'}
              </Text>
            </View>
            <Text style={styles.intro}>
              New clients sign these at their first portal login (when on). Edit the text to match your shop's language.
              Already-signed waivers keep their original wording — only future signers see your edits.
            </Text>
            {!enabled ? (
              <Text style={styles.warn}>Turn signing on in Shop Settings on the web (📜 Require clients to sign agreements).</Text>
            ) : null}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            {agreements.length === 0 ? (
              <Text style={styles.empty}>No waivers yet. They get seeded for your account in Supabase.</Text>
            ) : agreements.map((a) => {
              const s = edit[a.id] || { title: a.title, content: a.content };
              const dirty = s.title !== a.title || s.content !== a.content;
              return (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.typeChip}>{a.type === 'grooming' ? '✂️ Grooming Waiver' : '🏠 Boarding Waiver'}</Text>
                  </View>
                  <Text style={styles.updated}>Last updated {fmtWhen(a.updated_at)}</Text>

                  <Text style={styles.label}>Title</Text>
                  <TextInput style={styles.input} value={s.title} onChangeText={(t) => setField(a.id, 'title', t)} placeholder="Agreement title" placeholderTextColor={colors.textFaint} />

                  <Text style={styles.label}>Waiver text (what clients read & sign)</Text>
                  <TextInput
                    style={[styles.input, styles.multi]}
                    value={s.content}
                    onChangeText={(t) => setField(a.id, 'content', t)}
                    placeholder="Waiver text…"
                    placeholderTextColor={colors.textFaint}
                    multiline
                    textAlignVertical="top"
                  />

                  <View style={styles.footer}>
                    <Text style={[styles.dirty, { color: s.savedAt ? colors.green : dirty ? '#b45309' : colors.textFaint }]}>
                      {s.savedAt ? `✓ Saved ${new Date(s.savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : dirty ? '● Unsaved changes' : 'No changes'}
                    </Text>
                    <Pressable
                      style={[styles.saveBtn, (!dirty || s.saving) && styles.saveBtnOff]}
                      onPress={() => save(a)}
                      disabled={!dirty || s.saving}
                    >
                      {s.saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save changes</Text>}
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 60 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, marginBottom: 12 },
  statusOn: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  statusOff: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  statusText: { fontSize: 12, fontWeight: '800' },
  intro: { fontSize: 13, color: colors.textMute, lineHeight: 19, marginBottom: 10 },
  warn: { fontSize: 13, color: '#854d0e', backgroundColor: '#fef9c3', borderColor: '#fde047', borderWidth: 1, borderRadius: 8, padding: 10, lineHeight: 18, marginBottom: 12 },
  err: { color: '#b91c1c', fontSize: 14, marginBottom: 12 },
  empty: { textAlign: 'center', color: colors.textFaint, fontSize: 15, marginTop: 20 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16, ...shadow },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  typeChip: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, textTransform: 'uppercase' },
  updated: { fontSize: 11, color: colors.textFaint, marginTop: 4, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multi: { minHeight: 200, lineHeight: 21 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12 },
  dirty: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 20 },
  saveBtnOff: { backgroundColor: '#d1d5db' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
