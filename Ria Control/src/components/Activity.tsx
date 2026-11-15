import { Text, View } from 'react-native';
import type { Registrant, SeatEvent } from '../data/types';
import { fmtClock } from '../lib/format';
import { F, useTheme } from '../theme';
import { EmptyNote, toneColors, type IconName } from './ui';

const META: Record<SeatEvent['type'], { icon: IconName; tone: 'green' | 'amber' | 'red' }> = {
  seat_freed: { icon: 'exit-outline', tone: 'red' },
  waitlist_called: { icon: 'call-outline', tone: 'amber' },
  confirmed: { icon: 'checkmark', tone: 'green' },
};

/** Seat movements as a vertical timeline. */
export function SeatTimeline({ events, registrants, limit = 8 }: { events: SeatEvent[]; registrants: Registrant[]; limit?: number }) {
  const t = useTheme();
  const names = new Map(registrants.map((r) => [r.id, r.name]));
  const rows = events.slice(0, limit);
  if (!rows.length) return <EmptyNote icon="swap-horizontal-outline" text="No seat movement yet." />;
  return (
    <View>
      {rows.map((e, i) => {
        const from = e.fromRegistrantId ? names.get(e.fromRegistrantId) ?? 'Someone' : null;
        const to = e.toRegistrantId ? names.get(e.toRegistrantId) ?? 'Someone' : null;
        const m = META[e.type];
        const B = ({ children }: { children: string }) => <Text style={{ fontFamily: F.bold, color: t.text }}>{children}</Text>;
        return (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: toneColors(t, m.tone).fg }} />
              {i < rows.length - 1 && <View style={{ width: 1, flex: 1, backgroundColor: t.border, marginVertical: 4 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 14, gap: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.muted, lineHeight: 20 }}>
                {e.type === 'seat_freed' && <><B>{from ?? 'A registrant'}</B> released a seat</>}
                {e.type === 'waitlist_called' && <>Ria called <B>{to ?? 'the next in line'}</B>{from ? ` for ${from}'s seat` : ''}</>}
                {e.type === 'confirmed' && <><B>{to ?? 'A registrant'}</B> confirmed{from ? `, taking ${from}'s seat` : ''}</>}
              </Text>
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.faint }}>{fmtClock(e.at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
