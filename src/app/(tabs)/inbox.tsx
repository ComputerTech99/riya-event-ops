import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Button, Card, Col, EmptyNote, Icon, PageHeader, Screen, SectionTitle, Split, StatusChip } from '../../components/ui';
import { inbox } from '../../data/selectors';
import { useData, useNow } from '../../data/store';
import { fmtClock, fmtSpan } from '../../lib/format';
import { F, useTheme } from '../../theme';

export default function Inbox() {
  const t = useTheme();
  const now = useNow(15000);
  const { registrants, calls, pending, callNow } = useData();
  const { callbacks, escalations, questions, total } = inbox(registrants, calls, now);

  return (
    <Screen>
      <PageHeader title="Inbox" subtitle={total ? `${total} things need you` : 'All clear'} />
      <Split>
        <Col>
          <Card>
            <SectionTitle title="Callbacks due" count={callbacks.length} />
            {callbacks.map((r, i) => {
              const overdue = (r.callbackTime ?? 0) <= now;
              return (
                <View key={r.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: i === callbacks.length - 1 ? 0 : 1, borderBottomColor: t.border }}>
                  <Avatar name={r.name} size={40} />
                  <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }}>{r.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <StatusChip kind={overdue ? 'overdue' : 'due'} />
                      <Text style={{ fontFamily: F.medium, fontSize: 12, color: overdue ? t.red : t.muted }}>
                        {fmtClock(r.callbackTime!)} · {overdue ? `${fmtSpan(now - r.callbackTime!).toLowerCase()} late` : `in ${fmtSpan(r.callbackTime! - now).toLowerCase()}`}
                      </Text>
                    </View>
                    {r.notes && <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.muted }}>{r.notes}</Text>}
                  </View>
                  <Button size="sm" icon="call" onPress={() => callNow(r.id)} busy={!!pending[`call:${r.id}`]} />
                </View>
              );
            })}
            {!callbacks.length && <EmptyNote text="Nothing due in the next 3 hours." />}
          </Card>
        </Col>
        <Col>
          <Card>
            <SectionTitle title="Escalations" count={escalations.length} />
            {escalations.map((c, i) => (
              <Pressable key={c.id} onPress={() => router.push(`/call/${c.id}`)} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: i === escalations.length - 1 ? 0 : 1, borderBottomColor: t.border }}>
                <Avatar name={c.name} size={40} />
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.faint }}>{fmtClock(c.startedAt)}</Text>
                  </View>
                  <View style={{ backgroundColor: t.redSoft, borderRadius: 12, padding: 10 }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.text, lineHeight: 19 }}>{String(c.extractedData.escalation)}</Text>
                  </View>
                </View>
                <Icon name="chevron-forward" size={18} color={t.faint} style={{ alignSelf: 'center' }} />
              </Pressable>
            ))}
            {!escalations.length && <EmptyNote text="No escalations." />}
          </Card>
        </Col>
      </Split>

      <Card>
        <SectionTitle title="Unanswered questions" count={questions.length} action="Grouped by question" />
        {questions.map((q, i) => (
          <View key={q.question} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: i === questions.length - 1 ? 0 : 1, borderBottomColor: t.border }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: q.count > 1 ? t.primarySoft : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.xbold, fontSize: 16, color: q.count > 1 ? t.primary : t.muted }}>×{q.count}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 15, color: t.text }}>{q.question}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }} numberOfLines={2}>
                {q.names.slice(0, 3).join(', ')}{q.names.length > 3 ? ` +${q.names.length - 3}` : ''} · last {fmtClock(q.last)}
              </Text>
            </View>
          </View>
        ))}
        {!questions.length && <EmptyNote text="No open questions." />}
      </Card>
    </Screen>
  );
}
