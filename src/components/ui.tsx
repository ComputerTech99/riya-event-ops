import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, ScrollView, Text, View, useWindowDimensions,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, ND, useTheme } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = Ionicons;

export const useNarrow = () => useWindowDimensions().width < 760;

/** Scrollable page with a centred, max-width column. */
export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  const narrow = useNarrow();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{
        alignItems: 'center',
        paddingHorizontal: narrow ? 16 : 32,
        paddingTop: narrow ? 8 : 28,
        paddingBottom: narrow ? 110 + insets.bottom : 48,
      }}
    >
      <View style={{ width: '100%', maxWidth: 1120, gap: narrow ? 14 : 20 }}>{children}</View>
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  const narrow = useNarrow();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 2 }}>
      <View style={{ gap: 4, flexShrink: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: narrow ? 24 : 28, color: t.text, letterSpacing: -0.6 }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.muted }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, pad = 18 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderRadius: 18, borderWidth: t.mode === 'light' ? 1 : 0, borderColor: t.border, padding: pad }, t.shadow, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, count, action, onAction }: { title: string; count?: number; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }}>{title}</Text>
        {count != null && (
          <View style={{ backgroundColor: t.surface2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 12, color: t.muted }}>{count}</Text>
          </View>
        )}
      </View>
      {action && (
        <Text onPress={onAction} style={{ fontFamily: F.medium, fontSize: 13, color: t.muted }}>{action}</Text>
      )}
    </View>
  );
}

/** Side by side when wide, stacked on phones. */
export function Split({ children, gap }: { children: ReactNode; gap?: number }) {
  const narrow = useNarrow();
  return <View style={{ flexDirection: narrow ? 'column' : 'row', gap: gap ?? (narrow ? 14 : 20), alignItems: narrow ? 'stretch' : 'flex-start' }}>{children}</View>;
}

/** A column inside <Split>; `grow` sets its share of the row on wide screens. */
export function Col({ children, grow = 1, style }: { children: ReactNode; grow?: number; style?: StyleProp<ViewStyle> }) {
  const narrow = useNarrow();
  return <View style={[{ gap: narrow ? 14 : 20 }, !narrow && { flexGrow: grow, flexBasis: 0, minWidth: 0 }, style]}>{children}</View>;
}

export function Grid({ children, cols }: { children: ReactNode[]; cols: number }) {
  const narrow = useNarrow();
  const gap = narrow ? 12 : 20;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {children.map((c, i) => (
        <View key={i} style={{ flexBasis: `${100 / cols - 4}%`, flexGrow: 1, minWidth: 0 }}>{c}</View>
      ))}
    </View>
  );
}

type Tone = 'primary' | 'green' | 'amber' | 'red' | 'muted';

export function toneColors(t: ReturnType<typeof useTheme>, tone: Tone) {
  switch (tone) {
    case 'primary': return { fg: t.mode === 'dark' ? t.primary : t.primary, bg: t.primarySoft };
    case 'green': return { fg: t.green, bg: t.greenSoft };
    case 'amber': return { fg: t.amber, bg: t.amberSoft };
    case 'red': return { fg: t.red, bg: t.redSoft };
    default: return { fg: t.muted, bg: t.surface2 };
  }
}

const STATUS: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  live: { label: 'Calling', tone: 'amber', pulse: true },
  calling: { label: 'Calling', tone: 'amber', pulse: true },
  connected: { label: 'Connected', tone: 'green' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  no_answer: { label: 'No answer', tone: 'red' },
  busy: { label: 'Busy', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' },
  maybe: { label: 'Maybe', tone: 'amber' },
  invited: { label: 'Invited', tone: 'primary' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  waitlist: { label: 'Waiting', tone: 'muted' },
  registered: { label: 'Registered', tone: 'muted' },
  overdue: { label: 'Overdue', tone: 'red', pulse: true },
  due: { label: 'Due soon', tone: 'amber' },
  escalation: { label: 'Escalation', tone: 'red' },
};

export function StatusChip({ kind, label }: { kind: string; label?: string }) {
  const t = useTheme();
  const spec = STATUS[kind] ?? { label: kind, tone: 'muted' as Tone };
  const c = toneColors(t, spec.tone);
  const o = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!spec.pulse) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 0.25, duration: 600, useNativeDriver: ND }),
      Animated.timing(o, { toValue: 1, duration: 600, useNativeDriver: ND }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [spec.pulse, o]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg, opacity: o }} />
      <Text style={{ fontFamily: F.semibold, fontSize: 12, color: c.fg }} numberOfLines={1}>{label ?? spec.label}</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', icon, busy, disabled, size = 'md', style }: {
  label?: string; onPress: () => void; variant?: 'primary' | 'soft' | 'outline' | 'danger';
  icon?: IconName; busy?: boolean; disabled?: boolean; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.primary : variant === 'soft' ? t.primarySoft : variant === 'danger' ? t.redSoft : 'transparent';
  const fg = variant === 'primary' ? t.onPrimary : variant === 'danger' ? t.red : variant === 'soft' ? (t.mode === 'dark' ? t.primary : t.primary) : t.text;
  const off = disabled || busy;
  const h = size === 'sm' ? 34 : 42;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={(st) => [
        {
          height: h, minWidth: label ? undefined : h, paddingHorizontal: label ? (size === 'sm' ? 14 : 18) : 0,
          borderRadius: 999, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          borderWidth: variant === 'outline' ? 1 : 0, borderColor: t.border,
        },
        ((st as { hovered?: boolean }).hovered || st.pressed) && { opacity: 0.86 },
        st.pressed && { transform: [{ scale: 0.98 }] },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 15 : 17} color={fg} />}
          {label && <Text style={{ fontFamily: F.semibold, fontSize: size === 'sm' ? 13 : 14, color: fg }}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

const AVATAR_TONES = ['#E9E4FB', '#E2F1E7', '#FCEADB', '#E0EEF8', '#F8E3EC', '#EFF0D9'];
const AVATAR_INK = ['#5A54C8', '#1F8F55', '#C2621A', '#2B6CA3', '#B23A6B', '#6F7A2C'];

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_TONES.length;
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const dark = t.mode === 'dark';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? t.surface2 : AVATAR_TONES[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.36, color: dark ? t.text : AVATAR_INK[i] }}>{initials}</Text>
    </View>
  );
}

export function IconTile({ icon, tone = 'primary', size = 38 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = useTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.48} color={c.fg} />
    </View>
  );
}

/** Pill tabs. Scrolls sideways on phones. */
export function Segmented<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: 4, backgroundColor: t.surface, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: t.border }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 999, backgroundColor: on ? t.primary : 'transparent' }}
            >
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: on ? t.onPrimary : t.muted }}>{o.label}</Text>
              {o.count != null && (
                <Text style={{ fontFamily: F.semibold, fontSize: 12, color: on ? t.onPrimary : t.faint, opacity: on ? 0.8 : 1 }}>{o.count}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

/** Thin rounded progress bar. */
export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** Dotted progress, one tick per unit. */
export function TickBar({ value, max, color, ticks = 30 }: { value: number; max: number; color: string; ticks?: number }) {
  const t = useTheme();
  const on = max ? Math.round((value / max) * ticks) : 0;
  return (
    <View style={{ flexDirection: 'row', gap: 3, height: 12, alignItems: 'center' }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 12, borderRadius: 2, backgroundColor: i < on ? color : t.surface2 }} />
      ))}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

export function EmptyNote({ icon = 'checkmark-circle-outline', text }: { icon?: IconName; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 22, gap: 8 }}>
      <Ionicons name={icon} size={24} color={t.faint} />
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.muted, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}

const TickChar = memo(function TickChar({ ch, style }: { ch: string; style: StyleProp<TextStyle> }) {
  const [shown, setShown] = useState(ch);
  const y = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setShown(ch);
    y.setValue(1);
    Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: ND }).start();
  }, [ch, y]);
  return (
    <Animated.View style={{ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) }], opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
      <Text style={style}>{shown}</Text>
    </Animated.View>
  );
});

/** Number readout whose changed digits roll in. */
export function Ticker({ value, style }: { value: string | number; style?: StyleProp<TextStyle> }) {
  const chars = String(value).split('');
  const s: StyleProp<TextStyle> = [{ fontVariant: ['tabular-nums'] }, style];
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden' }} accessible accessibilityLabel={String(value)}>
      {chars.map((c, i) => <TickChar key={chars.length - i} ch={c} style={s} />)}
    </View>
  );
}

export function KV({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border }}>
      <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted, width: 120 }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{typeof children === 'string' ? <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.text }}>{children}</Text> : children}</View>
    </View>
  );
}
