import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Button, Card, Col, EmptyNote, Grid, Icon, KV, Screen, SectionTitle, Split, StatusChip, Ticker, useNarrow } from '../../../components/ui';
import { Waveform } from '../../../components/Waveform';
import { isRetryable, outcomeOf } from '../../../data/normalize';
import { useData, useNow } from '../../../data/store';
import { firstName, fmtClock, fmtDay, fmtDur, maskPhone } from '../../../lib/format';
import { F, useTheme } from '../../../theme';

const show = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join('; ') : typeof v === 'object' ? JSON.stringify(v) : String(v));
const label = (k: string) => {
  const s = k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function CallDetail() {
  const t = useTheme();
  const narrow = useNarrow();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(1000);
  const { calls, feedback, registrants, pending, retry, ready } = useData();
  const c = calls.find((x) => x.id === id);

  const back = (
    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.push('/calls'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
      <Icon name="chevron-back" size={18} color={t.muted} />
      <Text style={{ fontFamily: F.semibold, fontSize: 14, color: t.muted }}>Calls</Text>
    </Pressable>
  );

  if (!c) {
    return <Screen>{back}<EmptyNote icon="call-outline" text={ready ? 'Call not found.' : 'Loading…'} /></Screen>;
  }

  const o = outcomeOf(c);
  const live = o === 'live';
  const answered = o === 'connected' || (live && c.status === 'in-progress');
  const duration = live ? Math.floor((now - c.startedAt) / 1000) : c.durationSec;
  const reg = registrants.find((r) => r.id === c.registrantId);
  const fb = feedback.filter((f) => f.executionId === c.id);
  const lines = c.transcript.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    const who = i > 0 ? l.slice(0, i).trim().toLowerCase() : '';
    return { ria: who === 'assistant' || who === 'agent' || who === 'ria', text: i > 0 ? l.slice(i + 1).trim() : l };
  });
  const captured = Object.entries(c.extractedData);

  const facts = [
    { k: 'Answered', v: answered ? 'Yes' : live ? '…' : 'No', color: answered ? t.green : live ? t.amber : t.red },
    { k: 'Duration', v: fmtDur(duration), color: t.text },
    { k: 'Prompt', v: c.promptVersion ?? '—', color: t.primary },
    { k: 'Started', v: fmtClock(c.startedAt), color: t.text },
  ];

  return (
    <Screen>
      {back}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Avatar name={c.name} size={56} />
          <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 22, color: t.text, letterSpacing: -0.4 }}>{c.name}</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted }}>
              {[reg?.teamName ?? 'Solo', reg && maskPhone(reg.phone), fmtDay(c.startedAt)].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <StatusChip kind={o} />
              {reg && <StatusChip kind={reg.status} />}
            </View>
          </View>
          {isRetryable(c) && (
            <Button icon="refresh" label="Retry call" onPress={() => retry(c)} busy={!!pending[`call:${c.registrantId}`]} style={narrow ? { flexGrow: 1 } : undefined} />
          )}
        </View>
      </Card>

      <Grid cols={narrow ? 2 : 4}>
        {facts.map((f) => (
          <Card key={f.k} pad={16}>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted }}>{f.k}</Text>
            <Ticker value={f.v} style={{ fontFamily: F.xbold, fontSize: 24, color: f.color, marginTop: 6, letterSpacing: -0.5 }} />
          </Card>
        ))}
      </Grid>

      {live && (
        <Card>
          <SectionTitle title="Live audio" />
          <Waveform color={t.primary} active={c.status === 'in-progress'} />
        </Card>
      )}

      <Split>
        <Col grow={1.5}>
          <Card>
            <SectionTitle title="Transcript" count={lines.length || undefined} />
            <View style={{ gap: 10 }}>
              {lines.map((l, i) => (
                <View key={i} style={{ alignItems: l.ria ? 'flex-start' : 'flex-end' }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 11, color: t.faint, marginBottom: 3, marginHorizontal: 6 }}>{l.ria ? 'Ria' : firstName(c.name)}</Text>
                  <View style={{
                    maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18,
                    backgroundColor: l.ria ? t.primarySoft : t.surface2,
                    borderTopLeftRadius: l.ria ? 6 : 18, borderTopRightRadius: l.ria ? 18 : 6,
                  }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: t.text }}>{l.text}</Text>
                  </View>
                </View>
              ))}
              {!lines.length && <EmptyNote icon="chatbubbles-outline" text={live ? 'Waiting for the first words…' : 'No transcript. The call was not answered.'} />}
            </View>
          </Card>
        </Col>
        <Col grow={1}>
          <Card>
            <SectionTitle title="Captured" />
            {captured.map(([k, v], i) => (
              <KV key={k} label={label(k)} last={i === captured.length - 1}>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: k === 'escalation' ? t.red : t.text }}>{show(v)}</Text>
              </KV>
            ))}
            {!captured.length && <EmptyNote icon="document-text-outline" text="Nothing captured." />}
            <View style={{ height: 8 }} />
            <KV label="Ended by" last>{c.terminationReason ?? (live ? 'Still on the line' : '—')}</KV>
          </Card>
          <Card>
            <SectionTitle title="Caller feedback" />
            {fb.map((f) => (
              <View key={f.id} style={{ gap: 6, paddingVertical: 6 }}>
                <StatusChip kind={f.rating === 'good' ? 'confirmed' : f.rating === 'issue' ? 'failed' : 'waitlist'} label={f.rating === 'not_wanted' ? "Didn't want the call" : f.rating === 'good' ? 'Good' : 'Issue'} />
                {f.comment && <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.text }}>{f.comment}</Text>}
              </View>
            ))}
            {!fb.length && <EmptyNote icon="star-outline" text="No feedback left." />}
          </Card>
        </Col>
      </Split>
    </Screen>
  );
}
