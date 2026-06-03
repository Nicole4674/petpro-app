import { useState } from 'react';
import {
  StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';

export default function MergeClientScreen({ session, route, navigation }) {
  const { clientId, clientName } = route.params;
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [merging, setMerging] = useState(false);
  const [err, setErr] = useState('');

  async function search(text) {
    setQ(text);
    if (!text || text.trim().length < 2) { setCandidates([]); return; }
    setSearching(true);
    const term = text.trim();
    const digits = term.replace(/[^0-9]/g, '');
    let query = supabase.from('clients').select('id, first_name, last_name, phone, email')
      .eq('groomer_id', session.user.id).neq('id', clientId).limit(20);
    if (digits.length >= 3) query = query.ilike('phone', `%${digits}%`);
    else query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
    const { data } = await query;
    setCandidates(data || []);
    setSearching(false);
  }

  function confirmMerge(target) {
    const targetName = `${target.first_name || ''} ${target.last_name || ''}`.trim();
    Alert.alert(
      'Merge clients?',
      `All pets, appointments, payments, notes & contacts from "${clientName}" will move into "${targetName}". "${clientName}" will be removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            setMerging(true); setErr('');
            const { error } = await supabase.rpc('merge_clients', { p_source_id: clientId, p_target_id: target.id });
            setMerging(false);
            if (error) { setErr(error.message); return; }
            navigation.navigate('ClientDetail', { clientId: target.id, name: targetName });
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={18} color="#ddd6fe" />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Merge Client</Text>
        <Text style={styles.sub}>Move "{clientName}" into another client</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput style={styles.search} value={q} onChangeText={search} placeholder="Search the client to keep…" placeholderTextColor={colors.textFaint} autoCapitalize="words" autoFocus />
      </View>

      {err ? <Text style={styles.err}>{err}</Text> : null}
      {merging ? <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.merging}>Merging…</Text></View> : (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {searching ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : null}
          {!searching && q.length >= 2 && candidates.length === 0 ? <Text style={styles.muted}>No matches.</Text> : null}
          {candidates.map((c) => (
            <Pressable key={c.id} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]} onPress={() => confirmMerge(c)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client'}</Text>
                {c.phone ? <Text style={styles.meta}>{c.phone}</Text> : null}
              </View>
              <Ionicons name="git-merge-outline" size={20} color={colors.primary} />
            </Pressable>
          ))}
          {q.length < 2 ? <Text style={styles.hint}>Search for the client you want to keep. The current client's data will merge into them.</Text> : null}
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
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  sub: { color: '#ddd6fe', fontSize: 13, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, margin: 16, marginBottom: 4, borderWidth: 1, borderColor: colors.border },
  search: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  merging: { color: colors.textMute, marginTop: 10, fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  muted: { color: colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 20 },
  hint: { color: colors.textMute, fontSize: 13, marginTop: 16, textAlign: 'center', lineHeight: 19 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 10 },
});
