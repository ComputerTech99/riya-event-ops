import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SeatTimeline } from '../../components/Activity';
import {
  Avatar, Button, Col, Delta, DeltaBadge, Divider, EmptyNote, Icon, PageHeader, ProgressRing, Screen,
  SectionTitle, Segmented, Split, StatusChip, Ticker, useNarrow,
} from '../../components/ui';
import { Waveform } from '../../components/Waveform';
import { outcomeOf } from '../../data/normalize';
import { callStats, seatSplit, waitlistQueue } from '../../data/selectors';
import { useData, useEvent, useNow } from '../../data/store';
import type { Call, Registrant } from '../../data/types';
import { firstName, fmtClock, fmtDur, maskPhone, startOfDay } from '../../lib/format';
import { F, useTheme } from '../../theme';

/** Percent change, or null when there's nothing to compare against. */
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : null);

/** How many of team, food and T-shirt Ria has captured for this person (0–100). */
const capturedPct = (r?: Registrant) =>
  r ? Math.round(([r.teamName || r.teamSize, r.foodPref, r.tshirtSize].filter(Boolean).length / 3) * 100) : 0;

function Stat({ label, value, delta, upIsGood, note }: {
  label: string; value: string | number; delta?: number | null; upIsGood?: boolean; note?: string;
}) {
  const t = useTheme();
  const narrow = useNarrow();
  return (
    <View style={{ flex: 1, minWidth: narrow ? '45%' : 0, gap: 12, paddingVertical: narrow ? 14 : 22 }}>
      <Text style={{ fontFamily: F.medium, fontSize: 15, color: t.text }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {delta !== undefined && <DeltaBadge pct={delta} upIsGood={upIsGood} />}
        <Ticker value={value} style={{ fontFamily: F.medium, fontSize: narrow ? 28 : 36, color: t.text, letterSpacing: -1 }} />
      </View>
      {delta !== undefined ? <Delta pct={delta} upIsGood={upIsGood} /> : <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.amber }}>{note}</Text>}
    </View>
  );
}

/** Stacked bar to capacity, with a marker where confirmed seats end. */
function SeatBar({ split }: { split: ReturnType<typeof seatSplit> }) {
  const t = useTheme();
  const narrow = useNarrow();
  const w = (n: number) => `${(n / Math.max(split.capacity, 1)) * 100}%` as const;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: narrow ? 44 : 64, borderRadius: 14, backgroundColor: t.surface2, flexDirection: 'row', overflow: 'hidden' }}>
        {split.confirmed > 0 && (
          <>
            <View style={{ width: w(split.confirmed), backgroundColor: t.green, justifyContent: 'flex-end', padding: 10 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: '#FFFFFF' }} numberOfLines={1}>{split.confirmed}</Text>
            </View>
            <View style={{ width: 3, backgroundColor: t.text }} />
          </>
        )}
        <View style={{ width: w(split.maybe), backgroundColor: t.amber, opacity: 0.85 }} />
        <View style={{ width: w(split.cancelled), backgroundColor: t.red, opacity: 0.75 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 }}>
        {([
          ['Confirmed', split.confirmed, t.green],
          ['Maybe or invited', split.maybe, t.amber],
          ['Cancelled', split.cancelled, t.red],
          ['Open', split.empty, t.faint],
        ] as const).map(([label, n, c]) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.muted }}>
              {label} <Text style={{ fontFamily: F.semibold, color: t.text }}>{n}</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CallLine({ call, reg }: { call: Call; reg?: Registrant }) {
  const t = useTheme();
  const narrow = useNarrow();
  const pct = capturedPct(reg);
  return (
    <Pressable
      onPress={() => router.push(`/call/${call.id}`)}
      style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: narrow ? 12 : 18, paddingVertical: 14, opacity: st.pressed ? 0.6 : 1 })}
    >
      <Avatar name={call.name} size={narrow ? 42 : 48} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ fontFamily: F.medium, fontSize: 16, color: t.text }} numberOfLines={1}>{call.name}</Text>
        <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.muted }} numberOfLines={1}>
          {narrow ? `${fmtClock(call.startedAt)} · ${fmtDur(call.durationSec)}` : `${reg?.teamName ?? 'Solo'} · ${fmtDur(call.durationSec)} on the line`}
        </Text>
      </View>
      <View style={{ width: narrow ? undefined : 140 }}><StatusChip kind={outcomeOf(call)} /></View>
      {!narrow && (
        <View style={{ width: 84, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="time-outline" size={15} color={t.faint} />
          <Text style={{ fontFamily: F.regular, fontSize: 15, color: t.text }}>{fmtClock(call.startedAt)}</Text>
        </View>
      )}
      {!narrow && (
        <View style={{ width: 82, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ProgressRing pct={pct} />
          <Text style={{ fontFamily: F.regular, fontSize: 15, color: t.text }}>{pct}%</Text>
        </View>
      )}
      {!narrow && <Icon name="chevron-forward" size={16} color={t.faint} />}
    </Pressable>
  );
}

function LiveCall({ call, reg, now, next, onCallNext, calling }: {
  call?: Call; reg?: Registrant; now: number; next?: Registrant; onCallNext: () => void; calling: boolean;
}) {
  const t = useTheme();
  const box = { backgroundColor: t.hero, borderRadius: 22, padding: 20, gap: 16 } as const;
  if (!call) {
    return (
      <View style={box}>
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.heroMuted }}>Nobody on the line</Text>
        {next ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={next.name} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 17, color: t.onHero }} numberOfLines={1}>{next.name}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.heroMuted }}>Next up · waitlist #{next.waitlistRank}</Text>
              </View>
            </View>
            <Button variant="inverse" icon="call" label={`Call ${firstName(next.name)}`} onPress={onCallNext} busy={calling} />
          </>
        ) : (
          <Text style={{ fontFamily: F.regular, fontSize: 15, color: t.onHero }}>The waitlist is empty.</Text>
        )}
      </View>
    );
  }
  const elapsed = Math.floor((now - call.startedAt) / 1000);
  const ringing = call.status === 'ringing' || call.status === 'queued' || call.status === 'initiated';
  const last = call.transcript.trim().split('\n').filter(Boolean).pop() ?? '';
  const i = last.indexOf(':');
  const who = i > 0 ? last.slice(0, i).trim() : '';
  const said = i > 0 ? last.slice(i + 1).trim() : last;
  return (
    <Pressable onPress={() => router.push(`/call/${call.id}`)} accessibilityRole="button" accessibilityLabel={`Open live call with ${call.name}`} style={box}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.green }} />
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.heroMuted }}>{ringing ? 'Ringing' : 'On the line'}</Text>
        </View>
        <Ticker value={fmtDur(elapsed)} style={{ fontFamily: F.semibold, fontSize: 20, color: t.onHero }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={call.name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 18, color: t.onHero }} numberOfLines={1}>{call.name}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.heroMuted }} numberOfLines={1}>
            {[reg?.teamName ?? 'Solo', reg && maskPhone(reg.phone)].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <Waveform color={t.onHero} active={!ringing} height={34} bars={32} />
      <Text style={{ fontFamily: F.regular, fontSize: 14, lineHeight: 20, color: t.onHero }} numberOfLines={2}>
        <Text style={{ color: t.heroMuted }}>{who === 'assistant' ? 'Ria: ' : who ? `${firstName(call.name)}: ` : ''}</Text>
        {said || 'Dialling…'}
      </Text>
    </Pressable>
  );
}

export default function MissionControl() {
  const t = useTheme();
  const now = useNow(1000);
  const narrow = useNarrow();
  const ev = useEvent();
  const { calls, registrants, seatEvents, callNow, pending } = useData();
  const [range, setRange] = useState<'today' | 'all'>('today');

  const st = callStats(calls, now);
  const sod = startOfDay(now);
  const prev = callStats(calls.filter((c) => c.startedAt < sod), sod - 1);
  const split = seatSplit(registrants, ev.capacity);
  const regs = new Map(registrants.map((r) => [r.id, r]));
  const next = waitlistQueue(registrants).find((r) => !st.live.some((c) => c.registrantId === r.id));
  const full = Math.round((split.confirmed / Math.max(ev.capacity, 1)) * 100);
  const rows = (range === 'today' ? calls.filter((c) => c.startedAt >= sod) : calls).slice(0, 6);

  return (
    <Screen>
      <PageHeader
        title="Mission Control"
        subtitle={[ev.name, ev.date, ev.venue].filter(Boolean).join(' · ')}
        right={next && (
          <Button icon="call" label={narrow ? 'Call next' : `Call ${firstName(next.name)}`} onPress={() => callNow(next.id)} busy={!!pending[`call:${next.id}`]} />
        )}
      />

      <View style={{ flexDirection: narrow ? 'column' : 'row', gap: narrow ? 18 : 56, alignItems: narrow ? 'stretch' : 'center', paddingVertical: narrow ? 4 : 14 }}>
        <View>
          <Ticker value={split.confirmed} style={{ fontFamily: F.bold, fontSize: narrow ? 84 : 128, lineHeight: narrow ? 92 : 136, color: t.text, letterSpacing: narrow ? -4 : -7 }} />
          <Text style={{ fontFamily: F.regular, fontSize: 17, color: t.muted }}>seats confirmed</Text>
        </View>
        <View style={{ flex: narrow ? undefined : 1, gap: 14 }}>
          <Text style={{ fontFamily: F.regular, fontSize: 17, color: t.muted }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 26, color: t.green }}>{full}% </Text>
            of {ev.capacity} seats filled
          </Text>
          <SeatBar split={split} />
        </View>
      </View>

      <Divider />
      <View style={{ flexDirection: 'row', flexWrap: narrow ? 'wrap' : 'nowrap', columnGap: narrow ? 16 : 40, marginTop: -24, marginBottom: -24 }}>
        <Stat label="Calls today" value={st.today} delta={change(st.today, prev.today)} />
        {!narrow && <View style={{ width: 1, backgroundColor: t.border, marginVertical: 22 }} />}
        <Stat label="Connect rate" value={`${st.connectRate}%`} delta={change(st.connectRate, prev.connectRate)} />
        {!narrow && <View style={{ width: 1, backgroundColor: t.border, marginVertical: 22 }} />}
        <Stat label="Failed" value={st.failed} delta={change(st.failed, prev.failed)} upIsGood={false} />
        {!narrow && <View style={{ width: 1, backgroundColor: t.border, marginVertical: 22 }} />}
        <Stat label="In progress" value={st.live.length} note={st.live.length ? 'On the line now' : 'Idle'} />
      </View>
      <Divider />

      <Split gap={40}>
        <Col grow={1.75}>
          <View>
            <SectionTitle
              title="Recent calls"
              count={st.today}
              note={narrow ? 'today' : 'today, tap one to review'}
              right={<Segmented options={[{ key: 'today', label: 'Today' }, { key: 'all', label: 'All' }]} value={range} onChange={setRange} />}
            />
            {!narrow && (
              <View style={{ flexDirection: 'row', gap: 18, paddingTop: 6 }}>
                <Text style={{ flex: 1, marginLeft: 66, fontFamily: F.regular, fontSize: 12, color: t.faint }}>Caller</Text>
                <Text style={{ width: 140, fontFamily: F.regular, fontSize: 12, color: t.faint }}>Outcome</Text>
                <Text style={{ width: 84, fontFamily: F.regular, fontSize: 12, color: t.faint }}>Time</Text>
                <Text style={{ width: 82, fontFamily: F.regular, fontSize: 12, color: t.faint }}>Details</Text>
                <View style={{ width: 16 }} />
              </View>
            )}
            {rows.map((c) => <CallLine key={c.id} call={c} reg={regs.get(c.registrantId)} />)}
            {!rows.length && <EmptyNote icon="call-outline" text="No calls yet today." />}
          </View>
        </Col>
        <Col grow={1}>
          <View style={{ gap: 14 }}>
            <SectionTitle title="Live call" action={st.live.length > 1 ? `+${st.live.length - 1} more` : undefined} onAction={() => router.push('/calls')} />
            <LiveCall
              call={st.live[0]}
              reg={st.live[0] && regs.get(st.live[0].registrantId)}
              now={now}
              next={next}
              onCallNext={() => next && callNow(next.id)}
              calling={!!(next && pending[`call:${next.id}`])}
            />
          </View>
          <View>
            <SectionTitle title="Seat activity" action="Waitlist" onAction={() => router.push('/waitlist')} />
            <SeatTimeline events={seatEvents} registrants={registrants} limit={5} />
          </View>
        </Col>
      </Split>
    </Screen>
  );
}
