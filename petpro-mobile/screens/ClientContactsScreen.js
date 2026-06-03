import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Switch, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

const EMPTY = { first_name: '', last_name: '', phone: '', email: '', relationship: '', is_emergency: false, can_pickup: true, notes: '' };

export default function ClientContactsScreen({ route, navigation }) {
  const { clientId, clientName } = route.params;
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr('');
    try {
      const { data, error } = await supabase.from('client_contacts').select('*')
        .eq('client_id', clientId).order('is_emergency', { ascending: false }).order('can_pickup', { ascending: false });
      if (error) throw error;
      setContacts(data || []);
    } catch (e) { setErr(e.message || 'Could not load contacts.'); } finally { setLoading(false); }
  }

  function startAdd() { setForm(EMPTY); setEditingId(null); setShowForm(true); }
  function startEdit(c) {
    setForm({
      first_name: c.first_name || '', last_name: c.last_name || '', phone: c.phone || '', email: c.email || '',
      relationship: c.relationship || '', is_emergency: !!c.is_emergency, can_pickup: c.can_pickup !== false, notes: c.notes || '',
    });
    setEditingId(c.id); setShowForm(true);
  }

  async function save() {
    if (!form.first_name.trim()) { setErr('First name is required.'); return; }
    if (!form.phone.trim()) { setErr('Phone is required.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        client_id: clientId,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        relationship: form.relationship.trim() || null,
        is_emergency: !!form.is_emergency,
        can_pickup: form.can_pickup !== false,
        notes: form.notes.trim() || null,
      };
      let error;
      if (editingId) ({ error } = await supabase.from('client_contacts').update(payload).eq('id', editingId));
      else ({ error } = await supabase.from('client_contacts').insert(payload));
      if (error) throw error;
      setShowForm(false); setForm(EMPTY); setEditingId(null);
      await load();
    } catch (e) { setErr(e.message || 'Could not save contact.'); } finally { setSaving(false); }
  }

  function confirmDelete(c) {
    Alert.alert(`Delete ${c.first_name}?`, 'This removes the contact.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('client_contacts').delete().eq('id', c.id);
        if (error) setErr(error.message); else load();
      } },
    ]);
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Contacts</Text>
        {clientName ? <Text style={styles.sub}>{clientName}</Text> : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {err ? <Text style={styles.err}>{err}</Text> : null}

          {!showForm ? (
            <Pressable style={styles.addBtn} onPress={startAdd}>
              <Ionicons name="add" size={18} color="#fff" /><Text style={styles.addText}>Add Contact</Text>
            </Pressable>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{editingId ? 'Edit Contact' : 'New Contact'}</Text>
              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>First name *</Text>
                  <TextInput style={styles.input} value={form.first_name} onChangeText={(v) => set('first_name', v)} autoCapitalize="words" placeholderTextColor={colors.textFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput style={styles.input} value={form.last_name} onChangeText={(v) => set('last_name', v)} autoCapitalize="words" placeholderTextColor={colors.textFaint} />
                </View>
              </View>
              <Text style={styles.label}>Phone *</Text>
              <TextInput style={styles.input} value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholderTextColor={colors.textFaint} />
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={form.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.textFaint} />
              <Text style={styles.label}>Relationship</Text>
              <TextInput style={styles.input} value={form.relationship} onChangeText={(v) => set('relationship', v)} placeholder="e.g. spouse, sitter, neighbor" placeholderTextColor={colors.textFaint} />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Emergency contact</Text>
                <Switch value={form.is_emergency} onValueChange={(v) => set('is_emergency', v)} trackColor={{ true: colors.primary }} thumbColor="#fff" />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Allowed to pick up</Text>
                <Switch value={form.can_pickup} onValueChange={(v) => set('can_pickup', v)} trackColor={{ true: colors.primary }} thumbColor="#fff" />
              </View>
              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, styles.multiline]} value={form.notes} onChangeText={(v) => set('notes', v)} multiline placeholderTextColor={colors.textFaint} />
              <View style={styles.formBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { setShowForm(false); setErr(''); }}><Text style={styles.cancelText}>Cancel</Text></Pressable>
                <Pressable style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
                </Pressable>
              </View>
            </View>
          )}

          {contacts.length === 0 && !showForm ? <Text style={styles.muted}>No contacts yet.</Text> : null}
          {contacts.map((c) => (
            <View key={c.id} style={styles.contactCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cName}>{`${c.first_name || ''} ${c.last_name || ''}`.trim()}{c.relationship ? <Text style={styles.cRel}>  · {c.relationship}</Text> : null}</Text>
                {c.phone ? <Text style={styles.cPhone} onPress={() => Linking.openURL(`tel:${c.phone.replace(/[^0-9+]/g, '')}`)}>{c.phone}</Text> : null}
                {c.email ? <Text style={styles.cEmail}>{c.email}</Text> : null}
                <View style={styles.tags}>
                  {c.is_emergency ? <View style={[styles.tag, { backgroundColor: '#fee2e2' }]}><Text style={[styles.tagText, { color: '#b91c1c' }]}>Emergency</Text></View> : null}
                  {c.can_pickup ? <View style={[styles.tag, { backgroundColor: '#dcfce7' }]}><Text style={[styles.tagText, { color: '#166534' }]}>Can pick up</Text></View> : null}
                </View>
                {c.notes ? <Text style={styles.cNotes}>{c.notes}</Text> : null}
              </View>
              <View style={styles.cActions}>
                <Pressable onPress={() => startEdit(c)} hitSlop={8}><Ionicons name="create-outline" size={20} color={colors.primary} /></Pressable>
                <Pressable onPress={() => confirmDelete(c)} hitSlop={8}><Ionicons name="trash-outline" size={20} color="#b91c1c" /></Pressable>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 20 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  backText: { color: '#ddd6fe', fontSize: 15, fontWeight: '600' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 14, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 16 },
  addText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '800', color: colors.textMute, marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#f9fafb', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 13, fontSize: 15, color: colors.text, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 56, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  switchLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  formBtns: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.textMute, fontWeight: '800', fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: colors.green, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  muted: { color: colors.textFaint, fontSize: 14, marginLeft: 4 },
  contactCard: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cName: { fontSize: 16, fontWeight: '800', color: colors.text },
  cRel: { fontSize: 13, fontWeight: '600', color: colors.textMute },
  cPhone: { fontSize: 14, color: colors.primary, fontWeight: '700', marginTop: 2 },
  cEmail: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '800' },
  cNotes: { fontSize: 13, color: colors.textMute, marginTop: 6, fontStyle: 'italic' },
  cActions: { gap: 14, paddingLeft: 10, alignItems: 'center', justifyContent: 'center' },
  err: { color: '#b91c1c', textAlign: 'center', marginBottom: 12 },
});
