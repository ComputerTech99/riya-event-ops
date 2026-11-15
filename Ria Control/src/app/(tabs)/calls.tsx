import { useState } from 'react';
import { CallRow } from '../../components/CallRow';
import { Card, EmptyNote, PageHeader, Screen, Segmented } from '../../components/ui';
import { outcomeOf, type Outcome } from '../../data/normalize';
import { useData } from '../../data/store';

const FILTERS: { key: Outcome | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'connected', label: 'Connected' },
  { key: 'no_answer', label: 'No answer' },
  { key: 'busy', label: 'Busy' },
  { key: 'failed', label: 'Failed' },
  { key: 'live', label: 'Live' },
];

export default function Calls() {
  const { calls, pending, retry } = useData();
  const [filter, setFilter] = useState<Outcome | 'all'>('all');
  const rows = filter === 'all' ? calls : calls.filter((c) => outcomeOf(c) === filter);
  const count = (k: Outcome | 'all') => (k === 'all' ? calls.length : calls.filter((c) => outcomeOf(c) === k).length);

  return (
    <Screen>
      <PageHeader title="Calls" subtitle="Every call Ria has placed. Tap one for the transcript." />
      <Segmented options={FILTERS.map((f) => ({ ...f, count: count(f.key) }))} value={filter} onChange={setFilter} />
      <Card pad={14}>
        {rows.map((c, i) => (
          <CallRow key={c.id} call={c} last={i === rows.length - 1} onRetry={() => retry(c)} retrying={!!pending[`call:${c.registrantId}`]} />
        ))}
        {!rows.length && <EmptyNote icon="call-outline" text="No calls match this filter." />}
      </Card>
    </Screen>
  );
}
