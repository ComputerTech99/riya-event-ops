import { Text, View } from 'react-native';
import { SeatTimeline } from '../../components/Activity';
import { Avatar, Button, Card, Col, EmptyNote, PageHeader, Screen, SectionTitle, Split, StatusChip, useNarrow } from '../../components/ui';
import { outcomeOf } from '../../data/normalize';
import { latestCallBy, waitlistQueue } from '../../data/selectors';
import { useData, useNow } from '../../data/store';
import { fmtSpan } from '../../lib/format';
import { F, useTheme } from '../../theme';

export default function Waitlist() {
  const t = useTheme();
  const now = useNow(15000);
  const narrow = useNarrow();
  const { registrants, calls, seatEvents, pending, callNow, promote } = useData();
  const queue = waitlistQueue(registrants);
  const last = latestCallBy(calls);

  return (
    <Screen>
      <PageHeader title="Waitlist" subtitle={queue.length ? `${queue.length} waiting · ${queue[0].name} is next` : 'Nobody is waiting'} />
      <Split>
        <Col grow={1.6}>
          <Card pad={narrow ? 14 : 18}>
            <SectionTitle title="Queue by rank" count={queue.length} />
            {queue.map((r, i) => {
              const lc = last.get(r.id);
              const o = lc ? outcomeOf(lc) : null;
              const kind = o === 'live' ? 'calling' : o === 'no_answer' || o === 'busy' || o === 'failed' ? o : 'waitlist';
              const actions = (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button size="sm" icon="call" label="Call now" onPress={() => callNow(r.id)} busy={!!pending[`call:${r.id}`]} disabled={o === 'live'} style={narrow ? { flex: 1 } : undefined} />
                  <Button size="sm" variant="soft" icon="arrow-up" label="Promote" onPress={() => promote(r.id)} busy={!!pending[`promote:${r.id}`]} style={narrow ? { flex: 1 } : undefined} />
                </View>
              );
              return (
                <View key={r.id} style={{ paddingVertical: 14, gap: 12, borderBottomWidth: i === queue.length - 1 ? 0 : 1, borderBottomColor: t.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: i === 0 ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 13, color: i === 0 ? t.onPrimary : t.muted }}>{r.waitlistRank}</Text>
                    </View>
                    <Avatar name={r.name} size={40} />
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }} numberOfLines={1}>{r.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }}>{r.teamName ?? 'Solo'} · waiting {fmtSpan(now - r.updatedAt).toLowerCase()}</Text>
                      </View>
                    </View>
                    <StatusChip kind={kind} />
                    {!narrow && actions}
                  </View>
                  {narrow && actions}
                </View>
              );
            })}
            {!queue.length && <EmptyNote text="The waitlist is empty." />}
          </Card>
        </Col>
        <Col grow={1}>
          <Card>
            <SectionTitle title="Live seat feed" />
            <SeatTimeline events={seatEvents} registrants={registrants} limit={14} />
          </Card>
        </Col>
      </Split>
    </Screen>
  );
}
