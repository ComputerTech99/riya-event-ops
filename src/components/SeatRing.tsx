import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { F, useTheme } from '../theme';

interface Split { confirmed: number; maybe: number; cancelled: number; empty: number; capacity: number }

const polar = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};
function arc(c: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(c, r, a0);
  const [x1, y1] = polar(c, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function useSeatColors() {
  const t = useTheme();
  return { confirmed: t.green, maybe: t.amber, cancelled: t.red, empty: t.surface2 };
}

/** One rounded segment per seat, clockwise from the top: confirmed, maybe, cancelled, empty. */
export function SeatRing({ split, rate, size = 220 }: { split: Split; rate: number; size?: number }) {
  const t = useTheme();
  const col = useSeatColors();
  const seats = [
    ...Array(split.confirmed).fill(col.confirmed),
    ...Array(split.maybe).fill(col.maybe),
    ...Array(split.cancelled).fill(col.cancelled),
    ...Array(split.empty).fill(col.empty),
  ] as string[];
  const n = Math.max(seats.length, 1);
  const step = 360 / n;
  const stroke = 14;
  const r = size / 2 - stroke;
  const c = size / 2;
  const gap = Math.min(4.5, step * 0.45);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {seats.map((color, i) => (
          <Path key={i} d={arc(c, r, -90 + i * step + gap / 2, -90 + (i + 1) * step - gap / 2)} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        ))}
      </Svg>
      <View style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
        <Text style={{ fontFamily: F.xbold, fontSize: size * 0.17, color: t.text, letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{rate}%</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }}>connect rate today</Text>
      </View>
    </View>
  );
}
