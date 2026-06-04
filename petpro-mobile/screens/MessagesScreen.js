import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import GradientHeader from '../components/GradientHeader';

function clientNameFromSms(m) {
  const c = m.clients;
  const n = c ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : '';
  return n || (m.clients && m.clients.phone) || m.from_phone || 'Unknown';
}
function initials(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] || '').charAt(0) + (parts[1] || '').charAt(0)).toUpperCase() || '?';
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
  const [tab, setTab] = useState('inapp'); // 'inapp' | 'sms'
  const [loading, setLoading] = useState(true);
  const [inapp, setInapp] = useState([]);
  const [sms, setSms] = useState([]);
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
      const gid = session.user.id;

      // ---- In-app threads (free client-portal chat) ----
      const { data: threadRows } = await supabase
        .from('threads')
        .select('id, client_id, last_message_at, clients(first_name, last_name)')
        .eq('groomer_id', gid)
        .order('last_message_at', { ascending: false });
      const { data: allMsgs } = await supabase
        .from('messages')
        .select('thread_id, text, attachment_url, created_at, sender_type, read_by_groomer')
        .eq('groomer_id', gid)
        .order('created_at', { ascending: false });
      const lastMap = {}, unreadMap = {};
      (allMsgs || []).forEach((m) => {
        if (!lastMap[m.thread_id]) lastMap[m.thread_id] = m;
        if (m.sender_type === 'client' && !m.read_by_groomer) unreadMap[m.thread_id] = (unreadMap[m.thread_id] || 0) + 1;
      });
      setInapp((threadRows || []).map((t) => {
        const c = t.clients || {};
        const lm = lastMap[t.id];
        const preview = lm ? (lm.text || (lm.attachment_url ? '📷 Photo' : '')) : '';
        return {
          key: t.id,
          threadId: t.id,
          clientId: t.client_id,
          name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Client',
          preview: (lm && lm.sender_type === 'groomer' ? 'You: ' : '') + preview,
          time: t.last_message_at,
          unread: unreadMap[t.id] || 0,
        };
      }));

      // ---- SMS (Twilio) ----
      const { data: smsRows } = await supabase
        .from('sms_messages')
        .select('id, client_id, direction, body, is_read, created_at, from_phone, clients:client_id(first_name, last_name, phone)')
        .eq('groomer_id', gid)
        .order('created_at', { ascending: false })
        .limit(300);
      const map = {};
      (smsRows || []).forEach((m) => {
        const key = m.client_id || `phone:${m.from_phone}`;
        if (!map[key]) {
          const nm = clientNameFromSms(m);
          map[key] = { key, clientId: m.client_id, name: nm, phone: (m.clients && m.clients.phone) || m.from_phone, last: m, unread: 0 };
        }
        if (m.direction === 'inbound' && !m.is_read) map[key].unread += 1;
      });
      setSms(Object.values(map).map((c) => ({
        key: c.key,
        clientId: c.clientId,
        name: c.name,
        phone: c.phone,
        preview: (c.last.direction === 'outbound' ? 'You: ' : '') + (c.last.body || ''),
        time: c.last.created_at,
        unread: c.unread,
      })));
    } catch (e) {
      setErr(e.message || 'Could not load messages.');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  const data = tab === 'inapp' ? inapp : sms;

  function renderItem({ item }) {
    const unread = item.unread > 0;
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => navigation.navigate('Thread', {
          channel: tab,
          threadId: item.threadId,
          clientId: item.clientId,
          clientName: item.name,
          clientPhone: item.phone,
        })}
        disabled={tab === 'sms' && !item.clientId}
      >
        <View style={[styles.avatar, unread && styles.avatarUnread]}>
          <Text style={[styles.avatarText, unread && { color: '#fff' }]}>{initials(item.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, unread && styles.unreadName]}>{item.name}</Text>
          <Text style={[styles.preview, unread && styles.unreadPreview]} numberOfLines={1}>{item.preview}</Text>
        </View>
        <View style={styles.right}>
          <Text style={styles.time}>{timeAgo(item.time)}</Text>
          {unread ? <View style={styles.unreadDot}><Text style={styles.unreadDotText}>{item.unread}</Text></View> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <GradientHeader style={styles.header}>
        <View style={styles.titleWrap}>
          <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
          <Text style={styles.title}>Messages</Text>
        </View>
        {/* In-App / SMS tabs */}
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, tab === 'inapp' && styles.tabActive]} onPress={() => setTab('inapp')}>
            <Text style={tab === 'inapp' ? styles.tabActiveText : styles.tabText}>In-App</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'sms' && styles.tabActive]} onPress={() => setTab('sms')}>
            <Text style={tab === 'sms' ? styles.tabActiveText : styles.tabText}>SMS (Text)</Text>
          </Pressable>
        </View>
      </GradientHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /></View>
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(c) => c.key}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'inapp' ? 'No in-app chats yet. Clients can start one from the portal.' : 'No texts yet.'}
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primaryDark, paddingTop: 64, paddingBottom: 16, paddingHorizontal: 20 },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  tabActive: { backgroundColor: '#fff' },
  tabText: { color: '#ede9fe', fontWeight: '700', fontSize: 14 },
  tabActiveText: { color: colors.primaryDark, fontWeight: '800', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarUnread: { backgroundColor: colors.primary },
  avatarText: { color: colors.primary, fontWeight: '800', fontSize: 15 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  unreadName: { fontWeight: '800' },
  preview: { fontSize: 13, color: colors.textMute, marginTop: 2 },
  unreadPreview: { color: colors.text, fontWeight: '600' },
  right: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 12, color: colors.textFaint },
  unreadDot: { backgroundColor: colors.primary, borderRadius: 11, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadDotText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  empty: { textAlign: 'center', color: colors.textMute, fontSize: 15, marginTop: 24, paddingHorizontal: 24 },
  err: { color: '#b91c1c', textAlign: 'center', marginTop: 24 },
});
