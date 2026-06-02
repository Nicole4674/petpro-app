import { StyleSheet, Text, View, Pressable } from 'react-native';

export default function MoreScreen({ session, onSignOut, navigation }) {
  // Menu rows — add more here as we build out screens
  const items = [
    { label: '🛏️  Boarding', screen: 'Boarding', live: true },
    { label: '🛒  Retail', screen: 'Retail', live: true },
    { label: '👥  Staff', screen: 'Staff', live: true },
    { label: '⚙️  Settings', screen: 'Settings', live: true },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>☰ More</Text>
      </View>

      <View style={styles.body}>
        {items.map((it) => (
          <Pressable
            key={it.label}
            style={({ pressed }) => [styles.item, pressed && it.live && { opacity: 0.6 }, !it.live && styles.itemDim]}
            onPress={() => it.live && navigation.navigate(it.screen)}
            disabled={!it.live}
          >
            <Text style={[styles.itemText, !it.live && styles.itemTextDim]}>{it.label}</Text>
            {it.live ? <Text style={styles.chevron}>›</Text> : <Text style={styles.soon}>soon</Text>}
          </Pressable>
        ))}

        <View style={styles.account}>
          <Text style={styles.accountLabel}>Signed in as</Text>
          <Text style={styles.accountEmail}>{session?.user?.email}</Text>
          <Pressable style={styles.signout} onPress={onSignOut}>
            <Text style={styles.signoutText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#f5f3ff' },
  header: { backgroundColor: '#5b21b6', paddingTop: 64, paddingBottom: 20, paddingHorizontal: 24 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  body: { padding: 20 },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 16, marginBottom: 10 },
  itemDim: { opacity: 0.6 },
  itemText: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  itemTextDim: { color: '#6b7280' },
  chevron: { fontSize: 22, color: '#c4b5fd', fontWeight: '700' },
  soon: { fontSize: 12, color: '#9ca3af', fontWeight: '700' },
  account: { marginTop: 24 },
  accountLabel: { fontSize: 13, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  accountEmail: { fontSize: 16, color: '#1f2937', fontWeight: '700', marginTop: 4 },
  signout: { marginTop: 20, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  signoutText: { color: '#dc2626', fontWeight: '700', fontSize: 15 },
});
