import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';

function clientName(m) {
  const c = m.clients;
  const n = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '';
  return n || (m.clients && m.clients.phone) || m.from_phone || 'Unknown';
}
function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function MessagesScreen({ session, navigation }) {
  const [loading, setLoading] = useState(true);
  const [convos, setConvos] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => load(true));
    return unsub;
  }, [navigation]);

  async function load(silent) {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase
        .from('sms_messages')
        .select('id, client_id, direction, body, is_read, created_at, from_phone, clients:client_id(first_name, last_name, phone)')
        .eq('groomer_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      // Group into one row per client (latest message first since data is desc)
      const map = {};
      (data || []).forEach((m) => {
        const key = m.client_id || `phone:${m.from_phone}`;
        if (!map[key]) {
          map[key] = { key, clientId: m.client_id, name: clientName(m), phone: (m.clients && m.clients.phone) || m.from_phone, last: m, unread: 0 };
        }
        if (m.direction === 'inbound' && !m.is_read) map[key].unread += 1;
      });
      setConvos(Object.values(map));
    } catch (e) {
      setErr(e.message || 'Could not load messages.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function renderItem({ item }) {
    const last = item.last;
    const preview = (last.direction === 'outbound' ? 'You: ' : '') + (last.body || '');
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => navigation.navigate('Thread', { clientId: item.clientId, clientName: item.name, clientPhone: item.phone })}
        disabled={!item.clientId}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, item.unread > 0 && styles.unreadName]}>{item.name}</Text>
          <Text style={[styles.preview, item.unread > 0 && styles.unreadPreview]} numberOfLines={1}>{preview}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.time}>{timeAgo(last.created_at)}</Text>
          {item.unread > 0 ? <View style={styles.unreadDot}><Text style={styles.unreadDotText}>{item.unread}</Text></View> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}><Text style={styles.title}>💬 Messages</Text></View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#7c3aed" size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <FlatList
          data={convos}
          keyExtractor={(c) => c.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No conversations yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 64, paddingBottom: 20, paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  unreadName: { fontWeight: '800' },
  preview: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  unreadPreview: { color: '#1f2937', fontWeight: '600' },
  right: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 12, color: '#9ca3af' },
  unreadDot: { backgroundColor: '#7c3aed', borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadDotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, marginTop: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
