import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { ND } from '../theme';

/** Rounded bars that pulse while a call is live; centre bars run taller like a voice envelope. */
export function Waveform({ bars = 40, height = 48, color, active = true }: {
  bars?: number; height?: number; color: string; active?: boolean;
}) {
  const vals = useRef(Array.from({ length: bars }, () => new Animated.Value(0.15))).current;

  useEffect(() => {
    if (!active) {
      vals.forEach((v) => { v.stopAnimation(); v.setValue(0.1); });
      return;
    }
    let stopped = false;
    vals.forEach((v, i) => {
      const env = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / bars);
      const loop = () => {
        if (stopped) return;
        Animated.timing(v, {
          toValue: 0.12 + Math.random() * 0.88 * env,
          duration: 140 + Math.random() * 260,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: ND,
        }).start(({ finished }) => finished && loop());
      };
      loop();
    });
    return () => { stopped = true; vals.forEach((v) => v.stopAnimation()); };
  }, [active, bars, vals]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height }} accessibilityLabel="Live audio">
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 4, height, borderRadius: 3, backgroundColor: color, opacity: active ? 1 : 0.35, transform: [{ scaleY: v }] }} />
      ))}
    </View>
  );
}
