import { Platform, Share, Text, View } from 'react-native';
import { Button, Card, Col, EmptyNote, PageHeader, Screen, SectionTitle, Split, Ticker, useNarrow } from '../../components/ui';
import { EVENT_NAME } from '../../data/config';
import { headcountCsv, ratingsByVersion, tally } from '../../data/selectors';
import { useData } from '../../data/store';
import { fmtDay } from '../../lib/format';
import { F, useTheme } from '../../theme';

const FOOD_ORDER = ['veg', 'non-veg', 'jain', 'vegan', 'unknown'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'unknown'];

async function downloadCsv(filename: string, csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    await Share.share({ title: filename, message: csv });
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Insights() {
  const t = useTheme();
  const narrow = useNarrow();
  const { registrants, feedback, promptVersions } = useData();
  const confirmed = registrants.filter((r) => r.status === 'confirmed');
  const food = tally(confirmed, 'foodPref', FOOD_ORDER);
  const shirts = tally(confirmed, 'tshirtSize', SIZE_ORDER);
  const versions = ratingsByVersion(feedback, promptVersions);
  const foodMax = Math.max(1, ...food.map((f) => f.count));
  const shirtMax = Math.max(1, ...shirts.map((f) => f.count));
  const stamp = new Date().toISOString().slice(0, 10);

  const exportTotals = () =>
    downloadCsv(
      `${EVENT_NAME.toLowerCase()}-food-tshirts-${stamp}.csv`,
      ['category,value,count', ...food.map((f) => `food,${f.key},${f.count}`), ...shirts.map((s) => `tshirt,${s.key},${s.count}`)].join('\n'),
    );
  const exportPeople = () => downloadCsv(`${EVENT_NAME.toLowerCase()}-confirmed-${stamp}.csv`, headcountCsv(confirmed));

  return (
    <Screen>
      <PageHeader
        title="Insights"
        subtitle={`${confirmed.length} confirmed people to feed and dress`}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button icon="download-outline" label={narrow ? 'Totals' : 'Export totals'} onPress={exportTotals} />
            <Button variant="soft" icon="people-outline" label={narrow ? 'People' : 'Export people'} onPress={exportPeople} />
          </View>
        }
      />

      <Split>
        <Col>
          <Card>
            <SectionTitle title="Food" count={confirmed.length} />
            <View style={{ gap: 14 }}>
              {food.map((f) => (
                <View key={f.key} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.text }}>{cap(f.key)}</Text>
                    <Text style={{ fontFamily: F.bold, fontSize: 14, color: t.text }}>{f.count}</Text>
                  </View>
                  <View style={{ height: 10, borderRadius: 5, backgroundColor: t.surface2 }}>
                    <View style={{ width: `${(f.count / foodMax) * 100}%`, height: 10, borderRadius: 5, backgroundColor: t.chart }} />
                  </View>
                </View>
              ))}
              {!food.length && <EmptyNote text="No confirmed registrants yet." />}
            </View>
          </Card>
        </Col>
        <Col>
          <Card>
            <SectionTitle title="T-shirts" count={confirmed.length} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 170 }}>
              {shirts.map((s) => (
                <View key={s.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: t.text }}>{s.count}</Text>
                  <View style={{ width: '100%', maxWidth: 34, height: Math.max(8, (s.count / shirtMax) * 110), borderRadius: 999, backgroundColor: t.chart }} />
                  <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }}>{s.key}</Text>
                </View>
              ))}
            </View>
          </Card>
        </Col>
      </Split>

      <Card>
        <SectionTitle title="Feedback by prompt version" action="good ÷ (good + issue)" />
        {versions.map((v, i) => {
          const pct = v.avg == null ? null : Math.round(v.avg * 100);
          const color = pct == null ? t.faint : pct >= 75 ? t.green : pct >= 60 ? t.amber : t.red;
          return (
            <View key={v.version} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: i === versions.length - 1 ? 0 : 1, borderBottomColor: t.border }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: i === 0 ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14, color: i === 0 ? t.onPrimary : t.muted }}>{v.version}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: 14, color: t.text }}>{v.changeNote || 'No change note'}</Text>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surface2 }}>
                  <View style={{ width: `${pct ?? 0}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
                </View>
                <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.muted }}>
                  {v.appliedAt ? `${fmtDay(v.appliedAt)} · ` : ''}{v.n} ratings · {v.good} good · {v.issue} issue · {v.notWanted} didn't want the call
                </Text>
              </View>
              <Ticker value={pct == null ? '—' : `${pct}%`} style={{ fontFamily: F.xbold, fontSize: 22, color, letterSpacing: -0.5 }} />
            </View>
          );
        })}
        {!versions.length && <EmptyNote text="No feedback yet." />}
      </Card>
    </Screen>
  );
}
