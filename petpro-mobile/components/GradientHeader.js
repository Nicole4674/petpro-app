// Reusable purple gradient header. Drop-in replacement for a header <View>:
//   <GradientHeader style={styles.header}>…</GradientHeader>
// Uses the same style the screen already had (padding etc.); the gradient
// just replaces the flat background color.
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../lib/theme';

export default function GradientHeader({ style, children }) {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryDark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
