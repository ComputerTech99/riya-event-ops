import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { isRetryable, outcomeOf } from '../data/normalize';
import type { Call } from '../data/types';
import { fmtClock, fmtDur } from '../lib/format';
import { F, useTheme } from '../theme';
import { Avatar, Button, StatusChip } from './ui';

export function CallRow({ call, onRetry, retrying, last }: { call: Call; onRetry?: () => void; retrying?: boolean; last?: boolean }) {
  const t = useTheme();
  const o = outcomeOf(call);
  return (
    <Pressable
      onPress={() => router.push(`/call/${call.id}`)}
      style={(st) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: t.border,
        opacity: st.pressed ? 0.7 : 1,
      })}
    >
      <Avatar name={call.name} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }} numberOfLines={1}>{call.name}</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }} numberOfLines={1}>
          {fmtClock(call.startedAt)} · {fmtDur(call.durationSec)} · {call.promptVersion ?? '—'}
        </Text>
      </View>
      <StatusChip kind={o} />
      {onRetry && isRetryable(call) && (
        <Button size="sm" variant="danger" icon="refresh" onPress={onRetry} busy={retrying} />
      )}
    </Pressable>
  );
}
