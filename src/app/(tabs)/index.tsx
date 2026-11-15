import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SeatTimeline } from '../../components/Activity';
import { CallRow } from '../../components/CallRow';
import { SeatRing, useSeatColors } from '../../components/SeatRing';
import {
  Avatar, Bar, Button, Card, Col, Grid, Icon, PageHeader, Screen, SectionTitle, Split, Ticker, useNarrow,
} from '../../components/ui';
import { Waveform } from '../../components/Waveform';
import { EVENT_NAME, SEAT_CAPACITY } from '../../data/config';
import { callStats, seatSplit, waitlistQueue } from '../../data/selectors';
import { useData, useNow } from '../../data/store';
import type { Call, Registrant } from '../../data/types';
import { firstName, fmtDur, maskPhone } from '../../lib/format';
import { F, useTheme } from '../../theme';

function Kpi({ color, label, value, foot }: { color: string; label: string; value: number; foot: string }) {
  const t = useTheme();
  const narrow = useNarrow();
  return (
    <Card pad={narrow ? 14 : 18}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted }}>{label}</Text>
      </View>
      <Ticker value={value} style={{ fontFamily: F.bold, fontSize: narrow ? 28 : 32, color: t.text, letterSpacing: -1, marginTop: 10 }} />
      <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted, marginTop: 2 }} numberOfLines={1}>{foot}</Text>
    </Card>
  );
}

function LiveCard({ call, reg, now, more, next, onCallNext, calling }: {
  call?: Call; reg?: Registrant; now: number; more: number; next?: Registrant; onCallNext: () => void; calling: boolean;
}) {
  const t = useTheme();
  if (!call) {
    return (
      <Card>
        <SectionTitle title="Live call" action="Idle" />
        {next ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={next.name} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }}>Up next · waitlist #{next.waitlistRank}</Text>
              <Text style={{ fontFamily: F.semibold, fontSize: 16, color: t.text }} numberOfLines={1}>{next.name}</Text>
            </View>
            <Button size="sm" icon="call" label="Call" onPress={onCallNext} busy={calling} />
          </View>
        ) : (
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.muted }}>Nobody on the line and nobody waiting.</Text>
        )}
      </Card>
    );
  }
  const elapsed = Math.floor((now - call.startedAt) / 1000);
  const ringing = call.status === 'ringing' || call.status === 'queued' || call.status === 'initiated';
  const last = call.transcript.trim().split('\n').filter(Boolean).pop() ?? '';
  const i = last.indexOf(':');
  const who = i > 0 ? last.slice(0, i).trim() : '';
  const said = i > 0 ? last.slice(i + 1).trim() : last;

  return (
    <Pressable
      onPress={() => router.push(`/call/${call.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open live call with ${call.name}`}
      style={(st) => ({ backgroundColor: t.hero, borderRadius: 20, padding: 20, gap: 16, opacity: st.pressed ? 0.92 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.heroInset, borderRadius: 999, paddingHorizontal: 10, height: 28 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.onHero }} />
          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: t.onHero }}>{ringing ? 'Ringing' : 'On the line'}{more ? ` · +${more} more` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 12, color: t.heroMuted }}>Open</Text>
          <Icon name="arrow-forward" size={14} color={t.heroMuted} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ borderRadius: 30, borderWidth: 2, borderColor: t.heroInset }}>
          <Avatar name={call.name} size={52} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 22, color: t.onHero, letterSpacing: -0.4 }} numberOfLines={1}>{call.name}</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.heroMuted }} numberOfLines={1}>
            {[reg?.teamName ?? 'Solo', reg && maskPhone(reg.phone), reg?.status === 'waitlist' ? `Waitlist #${reg.waitlistRank}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ticker value={fmtDur(elapsed)} style={{ fontFamily: F.xbold, fontSize: 28, color: t.onHero, letterSpacing: -0.5 }} />
      </View>

      <Waveform color={t.onHero} active={!ringing} height={36} />

      <View style={{ backgroundColor: t.heroInset, borderRadius: 16, padding: 14, minHeight: 64 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 12, color: t.heroMuted, marginBottom: 4 }}>
          {who === 'assistant' ? 'Ria' : who ? firstName(call.name) : 'Dialling'}
        </Text>
        <Text style={{ fontFamily: F.medium, fontSize: 15, color: t.onHero, lineHeight: 21 }} numberOfLines={2}>{said || 'Waiting for an answer…'}</Text>
      </View>
    </Pressable>
  );
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function MissionControl() {
  const t = useTheme();
  const now = useNow(1000);
  const narrow = useNarrow();
  const { calls, registrants, seatEvents, callNow, pending } = useData();
  const st = callStats(calls, now);
  const split = seatSplit(registrants, SEAT_CAPACITY);
  const col = useSeatColors();
  const regs = new Map(registrants.map((r) => [r.id, r]));
  const next = waitlistQueue(registrants).find((r) => !st.live.some((c) => c.registrantId === r.id));
  const [live, ...others] = st.live;

  const legend = [
    { label: 'Confirmed', n: split.confirmed, c: col.confirmed },
    { label: 'Maybe', n: split.maybe, c: col.maybe },
    { label: 'Cancelled', n: split.cancelled, c: col.cancelled },
    { label: 'Empty', n: split.empty, c: t.faint },
  ];

  return (
    <Screen>
      <PageHeader
        title={greeting(now)}
        subtitle={`${EVENT_NAME} · ${split.confirmed} of ${SEAT_CAPACITY} seats confirmed`}
      />

      <Grid cols={narrow ? 2 : 4}>
        {[
          <Kpi key="a" color={t.primary} label="Calls today" value={st.today} foot={`${st.connectRate}% connect rate`} />,
          <Kpi key="b" color={t.green} label="Connected" value={st.connected} foot="Answered" />,
          <Kpi key="c" color={t.red} label="Failed" value={st.failed} foot="No answer or busy" />,
          <Kpi key="d" color={t.amber} label="In progress" value={st.live.length} foot="On the line" />,
        ]}
      </Grid>

      <Split>
        <Col grow={1.25}>
          <LiveCard call={live} reg={live && regs.get(live.registrantId)} now={now} more={others.length} next={next} onCallNext={() => next && callNow(next.id)} calling={!!(next && pending[`call:${next.id}`])} />
        </Col>
        <Col grow={1}>
          <Card>
            <SectionTitle title="Seats" action={`${SEAT_CAPACITY} total`} />
            <View style={{ flexDirection: narrow ? 'column' : 'row', alignItems: 'center', gap: 20 }}>
              <SeatRing split={split} rate={st.connectRate} size={narrow ? 190 : 170} />
              <View style={{ flex: narrow ? undefined : 1, alignSelf: 'stretch', gap: 14, justifyContent: 'center' }}>
                {legend.map((l) => (
                  <View key={l.label} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted }}>{l.label}</Text>
                      <Text style={{ fontFamily: F.bold, fontSize: 13, color: t.text }}>{l.n}</Text>
                    </View>
                    <Bar value={l.n} max={SEAT_CAPACITY} color={l.c} />
                  </View>
                ))}
              </View>
            </View>
          </Card>
        </Col>
      </Split>

      <Split>
        <Col grow={1.25}>
          <Card>
            <SectionTitle title="Recent calls" action="See all" onAction={() => router.push('/calls')} />
            {calls.slice(0, 6).map((c, i, a) => <CallRow key={c.id} call={c} last={i === a.length - 1} />)}
          </Card>
        </Col>
        <Col grow={1}>
          <Card>
            <SectionTitle title="Seat activity" action="Waitlist" onAction={() => router.push('/waitlist')} />
            <SeatTimeline events={seatEvents} registrants={registrants} limit={6} />
          </Card>
        </Col>
      </Split>
    </Screen>
  );
}
