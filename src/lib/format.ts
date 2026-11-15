const pad = (n: number) => String(n).padStart(2, '0');

export const fmtClock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDur = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

/** "2H 14M", "38M", "<1M". */
export const fmtSpan = (ms: number) => {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return '<1M';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}D ${h}H`;
  return h ? `${h}H ${pad(m % 60)}M` : `${m}M`;
};

export const fmtDay = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

export const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const maskPhone = (p: string) => (p.length > 4 ? `${p.slice(0, 3)} ••••• ${p.slice(-4)}` : p);

export const firstName = (n: string) => n.split(' ')[0];
