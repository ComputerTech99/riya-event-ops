import { Ionicons } from '@expo/vector-icons';
import { Children, memo, useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, ScrollView, Text, View, useWindowDimensions,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { F, ND, useTheme, type Theme } from '../theme';

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
        paddingHorizontal: narrow ? 18 : 44,
        paddingTop: narrow ? 6 : 34,
        paddingBottom: narrow ? 110 + insets.bottom : 48,
      }}
    >
      <View style={{ width: '100%', maxWidth: 1180, gap: narrow ? 18 : 24 }}>{children}</View>
    </ScrollView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  const narrow = useNarrow();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <View style={{ gap: 4, flexShrink: 1 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: narrow ? 26 : 34, color: t.text, letterSpacing: -0.9 }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: F.regular, fontSize: 15, color: t.muted }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A section: no box, just a hairline on top. */
export function Card({ children, style, pad = 20 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  const t = useTheme();
  return <View style={[{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: pad, paddingBottom: Math.round(pad / 2) }, style]}>{children}</View>;
}

export function SectionTitle({ title, count, note, action, onAction, right }: {
  title: string; count?: number; note?: string; action?: string; onAction?: () => void; right?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 20, color: t.text, letterSpacing: -0.4 }}>{title}</Text>
        {(count != null || note) && (
          <>
            <View style={{ width: 1, height: 16, backgroundColor: t.border }} />
            <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, flexShrink: 1 }} numberOfLines={1}>
              {count != null && <Text style={{ fontFamily: F.semibold, color: t.text }}>{count}</Text>}
              {count != null && note ? ' ' : ''}{note}
            </Text>
          </>
        )}
      </View>
      {right}
      {action && (
        <Text onPress={onAction} style={{ fontFamily: F.medium, fontSize: 14, color: t.muted }}>{action}</Text>
      )}
    </View>
  );
}

/** Side by side with a hairline between columns when wide, stacked on phones. */
export function Split({ children, gap }: { children: ReactNode; gap?: number }) {
  const t = useTheme();
  const narrow = useNarrow();
  const kids = Children.toArray(children);
  if (narrow) return <View style={{ gap: gap ?? 18 }}>{kids}</View>;
  return (
    <View style={{ flexDirection: 'row', gap: gap ?? 32, alignItems: 'stretch' }}>
      {kids.flatMap((k, i) => (i === 0 ? [k] : [<View key={`d${i}`} style={{ width: 1, backgroundColor: t.border }} />, k]))}
    </View>
  );
}

/** A column inside <Split>; `grow` sets its share of the row on wide screens. */
export function Col({ children, grow = 1, style }: { children: ReactNode; grow?: number; style?: StyleProp<ViewStyle> }) {
  const narrow = useNarrow();
  return <View style={[{ gap: narrow ? 18 : 24 }, !narrow && { flexGrow: grow, flexBasis: 0, minWidth: 0 }, style]}>{children}</View>;
}

export function Grid({ children, cols }: { children: ReactNode[]; cols: number }) {
  const narrow = useNarrow();
  const gap = narrow ? 14 : 24;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {children.map((c, i) => (
        <View key={i} style={{ flexBasis: `${100 / cols - 4}%`, flexGrow: 1, minWidth: 0 }}>{c}</View>
      ))}
    </View>
  );
}

type Tone = 'primary' | 'green' | 'amber' | 'red' | 'muted';

export function toneColors(t: Theme, tone: Tone) {
  switch (tone) {
    case 'primary': return { fg: t.primary, bg: t.primarySoft };
    case 'green': return { fg: t.green, bg: t.greenSoft };
    case 'amber': return { fg: t.amber, bg: t.amberSoft };
    case 'red': return { fg: t.red, bg: t.redSoft };
    default: return { fg: t.muted, bg: t.surface2 };
  }
}

const STATUS: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  live: { label: 'Calling', tone: 'amber', pulse: true },
  calling: { label: 'Calling', tone: 'amber', pulse: true },
  dialing: { label: 'Dialling', tone: 'amber', pulse: true },
  active: { label: 'On line', tone: 'green', pulse: true },
  pending: { label: 'Queued', tone: 'amber' },
  done: { label: 'Done', tone: 'green' },
  skipped: { label: 'Skipped', tone: 'muted' },
  timeout: { label: 'Timed out', tone: 'red' },
  connected: { label: 'Connected', tone: 'green' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  no_answer: { label: 'No answer', tone: 'red' },
  busy: { label: 'Busy', tone: 'red' },
  failed: { label: 'Failed', tone: 'red' },
  maybe: { label: 'Maybe', tone: 'amber' },
  invited: { label: 'Invited', tone: 'primary' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  declined: { label: 'Declined', tone: 'red' },
  waitlist: { label: 'Waiting', tone: 'muted' },
  registered: { label: 'Registered', tone: 'muted' },
  overdue: { label: 'Overdue', tone: 'red', pulse: true },
  due: { label: 'Due soon', tone: 'amber' },
  escalation: { label: 'Escalation', tone: 'red' },
};

/** Neutral grey pill; colour lives only in the dot. */
export function StatusChip({ kind, label }: { kind: string; label?: string }) {
  const t = useTheme();
  const spec = STATUS[kind] ?? { label: kind, tone: 'muted' as Tone };
  const dot = toneColors(t, spec.tone).fg;
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface2, borderRadius: 999, paddingHorizontal: 12, height: 30, alignSelf: 'flex-start' }}>
      <Animated.View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot, opacity: o }} />
      <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.text }} numberOfLines={1}>{label ?? spec.label}</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', icon, busy, disabled, size = 'md', style }: {
  label?: string; onPress: () => void; variant?: 'primary' | 'soft' | 'outline' | 'danger' | 'inverse';
  icon?: IconName; busy?: boolean; disabled?: boolean; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.primary, soft: t.surface2, danger: t.redSoft, outline: 'transparent', inverse: t.onHero }[variant];
  const fg = { primary: t.onPrimary, soft: t.text, danger: t.red, outline: t.text, inverse: t.hero }[variant];
  const off = disabled || busy;
  const h = size === 'sm' ? 34 : 44;
  return (
    <Pressable
      onPress={off ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={(st) => [
        {
          height: h, minWidth: label ? undefined : h, paddingHorizontal: label ? (size === 'sm' ? 14 : 22) : 0,
          borderRadius: 999, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          borderWidth: variant === 'outline' ? 1 : 0, borderColor: t.border,
        },
        ((st as { hovered?: boolean }).hovered || st.pressed) && { opacity: 0.85 },
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
          {label && <Text style={{ fontFamily: F.semibold, fontSize: size === 'sm' ? 13 : 15, color: fg }}>{label}</Text>}
        </>
      )}
    </Pressable>
  );
}

const AVATAR_TONES = ['#ECE6FB', '#E3F3E8', '#FCEBDD', '#E1EDF8', '#F8E4EC', '#EEF0DC'];
const AVATAR_INK = ['#5B4BC4', '#1E8A4F', '#C2621A', '#2B6CA3', '#B23A6B', '#6F7A2C'];

/** Initials on a soft tone; rounded square by default, like the photo tiles in the reference. */
export function Avatar({ name, size = 44, round }: { name: string; size?: number; round?: boolean }) {
  const t = useTheme();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = h % AVATAR_TONES.length;
  const initials = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const dark = t.mode === 'dark';
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : size * 0.28, backgroundColor: dark ? t.surface2 : AVATAR_TONES[i], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.semibold, fontSize: size * 0.34, color: dark ? t.text : AVATAR_INK[i] }}>{initials}</Text>
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

/** Up/down badge plus "x% from yesterday". */
export function Delta({ pct, upIsGood = true }: { pct: number | null; upIsGood?: boolean }) {
  const t = useTheme();
  // Nothing to compare on day one; keep the line height so the row doesn't jump.
  if (pct == null) return <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.faint }}>{'\u00a0'}</Text>;
  const up = pct >= 0;
  const color = up === upIsGood ? t.green : t.red;
  return <Text style={{ fontFamily: F.regular, fontSize: 13, color }}>{Math.abs(pct)}% from yesterday</Text>;
}

export function DeltaBadge({ pct, upIsGood = true }: { pct: number | null; upIsGood?: boolean }) {
  const t = useTheme();
  if (pct == null) return null;
  const up = pct >= 0;
  const color = up === upIsGood ? t.green : t.red;
  return (
    <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={up ? 'arrow-up' : 'arrow-down'} size={14} color="#FFFFFF" />
    </View>
  );
}

/** Thin ring showing a 0–100 value. */
export function ProgressRing({ pct, size = 26, stroke = 3.5 }: { pct: number; size?: number; stroke?: number }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface2} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.ring} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(c * Math.max(0, Math.min(100, pct))) / 100} ${c}`} />
    </Svg>
  );
}

/** Pill tabs: black pill for the active one. Scrolls sideways on phones. */
export function Segmented<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={{ flexDirection: 'row', gap: 2, borderRadius: 999, padding: 4, borderWidth: 1, borderColor: t.border }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => onChange(o.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 36, borderRadius: 999, backgroundColor: on ? t.primary : 'transparent' }}
            >
              <Text style={{ fontFamily: F.medium, fontSize: 14, color: on ? t.onPrimary : t.muted }}>{o.label}</Text>
              {o.count != null && (
                <Text style={{ fontFamily: F.medium, fontSize: 12, color: on ? t.onPrimary : t.faint, opacity: on ? 0.7 : 1 }}>{o.count}</Text>
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

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border }} />;
}

export function EmptyNote({ icon = 'checkmark-circle-outline', text }: { icon?: IconName; text: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 22, gap: 8 }}>
      <Ionicons name={icon} size={24} color={t.faint} />
      <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, textAlign: 'center' }}>{text}</Text>
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
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border }}>
      <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, width: 120 }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{typeof children === 'string' ? <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.text }}>{children}</Text> : children}</View>
    </View>
  );
}
