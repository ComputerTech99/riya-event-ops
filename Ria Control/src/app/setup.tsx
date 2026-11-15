import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, Icon, Segmented, useNarrow, type IconName } from '../components/ui';
import { useData } from '../data/store';
import type { EventConfig, EventType, GuestInput, RiaJobs } from '../data/types';
import { FIELDS, assignSeats, autoMap, detectSource, parseCsv, toGuests, type Field, type Mapping } from '../lib/csv';
import { fetchLuma, lumaSlug } from '../lib/luma';
import { sampleLumaCsv } from '../lib/sampleCsv';
import { F, useTheme } from '../theme';

const TYPES: { key: EventType; label: string; note: string; icon: IconName }[] = [
  { key: 'hackathon', label: 'Hackathon', note: 'Teams, food, swag, overnight', icon: 'code-slash-outline' },
  { key: 'meetup', label: 'Meetup', note: 'An evening of talks', icon: 'people-outline' },
  { key: 'workshop', label: 'Workshop', note: 'Hands-on, limited seats', icon: 'construct-outline' },
  { key: 'conference', label: 'Conference', note: 'Big room, many sessions', icon: 'mic-outline' },
  { key: 'other', label: 'Something else', note: 'Ria adapts the script', icon: 'ellipsis-horizontal' },
];

const JOBS: { key: keyof RiaJobs; label: string; note: string }[] = [
  { key: 'confirmByCall', label: 'Confirm RSVPs by call', note: 'Ria calls every registered guest to confirm they are coming.' },
  { key: 'fillFromWaitlist', label: 'Fill seats from the waitlist', note: 'When someone drops out, Ria calls the next person in line.' },
  { key: 'collectFoodTshirt', label: 'Collect food and T-shirt size', note: 'Asked on the confirmation call, totals land in Insights.' },
  { key: 'feedbackEmail', label: 'Send a feedback email', note: 'After the event, guests get a one-question feedback email.' },
];

const STEPS = ['Event type', 'Details', 'Guests', "Ria's jobs"];

type GuestSource = 'luma' | 'csv' | 'manual';

function Field({ label, value, onChange, placeholder, keyboard, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: 'numeric' | 'url' | 'email-address' | 'phone-pad'; hint?: ReactNode;
}) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.text }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        keyboardType={keyboard}
        autoCapitalize={keyboard === 'url' || keyboard === 'email-address' ? 'none' : 'sentences'}
        autoCorrect={false}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          height: 50, borderRadius: 14, paddingHorizontal: 16, backgroundColor: t.surface2,
          borderWidth: 1.5, borderColor: focus ? t.text : 'transparent',
          fontFamily: F.medium, fontSize: 16, color: t.text,
          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}),
        }}
      />
      {hint}
    </View>
  );
}

function Check({ children, on = true }: { children: ReactNode; on?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', opacity: on ? 1 : 0.45 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: on ? t.green : t.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Icon name={on ? 'checkmark' : 'remove'} size={14} color={on ? '#FFFFFF' : t.muted} />
      </View>
      <Text style={{ flex: 1, fontFamily: F.regular, fontSize: 16, lineHeight: 23, color: t.text }}>{children}</Text>
    </View>
  );
}

export default function Setup() {
  const t = useTheme();
  const narrow = useNarrow();
  const insets = useSafeAreaInsets();
  const { setupSeen, skipSetup, launch } = useData();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<EventType | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [capacity, setCapacity] = useState('');
  const [luma, setLuma] = useState('');
  const [lumaState, setLumaState] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });

  const [source, setSource] = useState<GuestSource>('luma');
  const [csv, setCsv] = useState<{ file: string; headers: string[]; rows: string[][]; from: string } | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [openField, setOpenField] = useState<Field | null>(null);
  const [manual, setManual] = useState<GuestInput[]>([]);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '' });
  const [fileError, setFileError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<RiaJobs>({ confirmByCall: true, fillFromWaitlist: true, collectFoodTshirt: true, feedbackEmail: false });
  const [launching, setLaunching] = useState(false);

  // Paste a Luma link: fill the details in straight away.
  const lumaReq = useRef(0);
  useEffect(() => {
    if (!lumaSlug(luma)) { setLumaState({ kind: 'idle' }); return; }
    const id = ++lumaReq.current;
    setLumaState({ kind: 'loading' });
    const timer = setTimeout(() => {
      fetchLuma(luma)
        .then((ev) => {
          if (id !== lumaReq.current) return;
          if (ev.name) setName(ev.name);
          if (ev.date) setDate(ev.date);
          if (ev.venue) setVenue(ev.venue);
          if (ev.capacity) setCapacity(String(ev.capacity));
          setLumaState({ kind: 'ok', msg: 'Filled in from Luma. Check anything that looks off.' });
        })
        .catch((e) => {
          if (id !== lumaReq.current) return;
          setLumaState({ kind: 'error', msg: `${e instanceof Error ? e.message : 'Could not read that link.'} Fill the fields in by hand.` });
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [luma]);

  const cap = Math.max(0, parseInt(capacity, 10) || 0);
  const guests = useMemo(() => {
    const fromCsv = csv && mapping ? toGuests(csv.headers, csv.rows, mapping, Number.POSITIVE_INFINITY) : [];
    return assignSeats([...fromCsv, ...manual], cap || Number.POSITIVE_INFINITY);
  }, [csv, mapping, manual, cap]);
  const seated = guests.filter((g) => g.status === 'registered').length;
  const waiting = guests.length - seated;
  const noPhone = guests.filter((g) => !g.phone).length;

  const loadCsvText = (file: string, text: string) => {
    const { headers, rows } = parseCsv(text);
    if (!headers.length || !rows.length) { setFileError('That file has no rows we can read.'); return; }
    setFileError(null);
    setCsv({ file, headers, rows, from: detectSource(headers) });
    setMapping(autoMap(headers));
    setOpenField(null);
  };

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === 'web' ? '.csv,text/csv' : ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const a = res.assets[0];
      const text = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
      loadCsvText(a.name, text);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const canNext = [
    !!type,
    !!name.trim() && cap > 0,
    guests.length > 0,
    true,
  ][step];

  const close = () => {
    if (!setupSeen) skipSetup();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const go = async () => {
    if (step < 3) { setStep(step + 1); return; }
    const event: EventConfig = { type: type!, name: name.trim(), date: date.trim(), venue: venue.trim(), capacity: cap, lumaUrl: lumaSlug(luma) ? luma.trim() : null, ria: jobs };
    setLaunching(true);
    try {
      await launch(event, guests);
      router.replace('/');
    } finally {
      setLaunching(false);
    }
  };

  const title = [
    'What are you organizing?',
    'Tell Ria about the event',
    'Bring your guests',
    'What should Ria do?',
  ][step];
  const sub = [
    'This shapes how Ria talks to your guests.',
    'Paste a Luma link to fill this in, or type it.',
    'Upload an export or add people by hand. You can fix the column mapping.',
    'Switch on the jobs Ria should handle. You can change these later.',
  ][step];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.canvas }}>
      <View style={{ flex: 1, padding: narrow ? 0 : 20 }}>
        <View style={{ flex: 1, backgroundColor: t.bg, borderRadius: narrow ? 0 : 24, overflow: 'hidden', paddingTop: narrow ? insets.top : 0, ...t.shadow }}>
          {/* top bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: narrow ? 18 : 40, paddingVertical: 16 }}>
            <Pressable onPress={step === 0 ? close : () => setStep(step - 1)} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={step === 0 ? 'close' : 'chevron-back'} size={20} color={t.text} />
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: t.text }}>{step === 0 ? (setupSeen ? 'Close' : '') : 'Back'}</Text>
            </Pressable>
            <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.muted }}>Step {step + 1} of 4 · {STEPS[step]}</Text>
            {!setupSeen ? (
              <Text onPress={close} style={{ fontFamily: F.medium, fontSize: 14, color: t.muted }}>Skip, show demo</Text>
            ) : <View style={{ width: 60 }} />}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: narrow ? 18 : 40 }}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? t.text : t.surface2 }} />
            ))}
          </View>

          <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: narrow ? 18 : 40, paddingTop: narrow ? 24 : 44, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={{ width: '100%', maxWidth: 680, gap: 26 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: F.semibold, fontSize: narrow ? 28 : 38, letterSpacing: -1, color: t.text }}>{title}</Text>
                <Text style={{ fontFamily: F.regular, fontSize: 16, color: t.muted }}>{sub}</Text>
              </View>

              {step === 0 && (
                <View style={{ gap: 10 }}>
                  {TYPES.map((o) => {
                    const on = type === o.key;
                    return (
                      <Pressable
                        key={o.key}
                        onPress={() => setType(o.key)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: on ? t.text : t.border, backgroundColor: on ? t.surface2 : t.bg }}
                      >
                        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: on ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={o.icon} size={22} color={on ? t.onPrimary : t.text} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.semibold, fontSize: 17, color: t.text }}>{o.label}</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted }}>{o.note}</Text>
                        </View>
                        <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? t.text : t.faint} />
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {step === 1 && (
                <View style={{ gap: 20 }}>
                  <Field
                    label="Luma link (optional)"
                    value={luma}
                    onChange={setLuma}
                    placeholder="https://lu.ma/your-event"
                    keyboard="url"
                    hint={lumaState.kind !== 'idle' && (
                      <Text style={{ fontFamily: F.regular, fontSize: 13, color: lumaState.kind === 'error' ? t.red : lumaState.kind === 'ok' ? t.green : t.muted }}>
                        {lumaState.kind === 'loading' ? 'Reading the event from Luma…' : lumaState.msg}
                      </Text>
                    )}
                  />
                  <View style={{ height: 1, backgroundColor: t.border }} />
                  <Field label="Event name" value={name} onChange={setName} placeholder="HACK2026" />
                  <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 20 }}>
                    <View style={{ flex: 1 }}><Field label="Date" value={date} onChange={setDate} placeholder="Sat 6 Dec, 10:00" /></View>
                    <View style={{ flex: narrow ? undefined : 0.6 }}><Field label="Capacity" value={capacity} onChange={(v) => setCapacity(v.replace(/[^0-9]/g, ''))} placeholder="40" keyboard="numeric" /></View>
                  </View>
                  <Field label="Venue" value={venue} onChange={setVenue} placeholder="Venue name, city" />
                </View>
              )}

              {step === 2 && (
                <View style={{ gap: 22 }}>
                  <Segmented
                    options={[{ key: 'luma', label: 'Luma CSV' }, { key: 'csv', label: 'Other CSV' }, { key: 'manual', label: 'Add manually' }]}
                    value={source}
                    onChange={(k) => setSource(k as GuestSource)}
                  />

                  {source !== 'manual' && (
                    <View style={{ gap: 16 }}>
                      <Pressable
                        onPress={pickFile}
                        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.border, borderRadius: 18, padding: 26, alignItems: 'center', gap: 8 }}
                      >
                        <Icon name="cloud-upload-outline" size={28} color={t.text} />
                        <Text style={{ fontFamily: F.semibold, fontSize: 16, color: t.text }}>{csv ? `Replace ${csv.file}` : 'Upload a CSV'}</Text>
                        <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, textAlign: 'center' }}>
                          {source === 'luma' ? 'Luma: Event → Guests → Export guests' : 'Google Forms, Devfolio, Eventbrite, Typeform or any spreadsheet'}
                        </Text>
                      </Pressable>
                      {!csv && (
                        <Text onPress={() => loadCsvText('sample-luma-guests.csv', sampleLumaCsv())} style={{ fontFamily: F.medium, fontSize: 14, color: t.muted, textAlign: 'center', textDecorationLine: 'underline' }}>
                          No file handy? Use a sample Luma export
                        </Text>
                      )}
                      {fileError && <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.red }}>{fileError}</Text>}

                      {csv && mapping && (
                        <View style={{ gap: 4 }}>
                          <Text style={{ fontFamily: F.semibold, fontSize: 17, color: t.text }}>
                            {csv.rows.length} rows from {csv.from} <Text style={{ fontFamily: F.regular, color: t.muted }}>· columns matched automatically</Text>
                          </Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, marginBottom: 8 }}>Tap a field to change which column it reads from.</Text>
                          {FIELDS.filter((f) => !(mapping.name && (f.key === 'firstName' || f.key === 'lastName'))).map((f) => {
                            const open = openField === f.key;
                            const col = mapping[f.key];
                            return (
                              <View key={f.key} style={{ borderTopWidth: 1, borderTopColor: t.border }}>
                                <Pressable onPress={() => setOpenField(open ? null : f.key)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
                                  <Text style={{ width: 96, fontFamily: F.medium, fontSize: 15, color: t.text }}>{f.label}</Text>
                                  <Icon name="arrow-back" size={14} color={t.faint} />
                                  <View style={{ flex: 1, flexDirection: 'row' }}>
                                    <View style={{ backgroundColor: col ? t.surface2 : f.required ? t.redSoft : 'transparent', borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: 'center', borderWidth: col ? 0 : 1, borderColor: t.border }}>
                                      <Text style={{ fontFamily: F.medium, fontSize: 13, color: col ? t.text : f.required ? t.red : t.muted }} numberOfLines={1}>{col ?? 'Not mapped'}</Text>
                                    </View>
                                  </View>
                                  <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.muted} />
                                </Pressable>
                                {open && (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 14 }}>
                                    {[null, ...csv.headers].map((h) => {
                                      const sel = col === h;
                                      return (
                                        <Pressable
                                          key={h ?? '__none'}
                                          onPress={() => { setMapping({ ...mapping, [f.key]: h }); setOpenField(null); }}
                                          style={{ borderRadius: 999, paddingHorizontal: 12, height: 32, justifyContent: 'center', backgroundColor: sel ? t.primary : t.surface2 }}
                                        >
                                          <Text style={{ fontFamily: F.medium, fontSize: 13, color: sel ? t.onPrimary : t.text }}>{h ?? 'Skip'}</Text>
                                        </Pressable>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  )}

                  {source === 'manual' && (
                    <View style={{ gap: 14 }}>
                      <Field label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} placeholder="Full name" />
                      <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 14 }}>
                        <View style={{ flex: 1 }}><Field label="Phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} placeholder="+91 98…" keyboard="phone-pad" /></View>
                        <View style={{ flex: 1 }}><Field label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} placeholder="name@email.com" keyboard="email-address" /></View>
                      </View>
                      <Button
                        variant="soft"
                        icon="add"
                        label="Add guest"
                        disabled={!draft.name.trim()}
                        onPress={() => {
                          setManual([...manual, { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), teamName: null, foodPref: null, tshirtSize: null, status: 'registered' }]);
                          setDraft({ name: '', phone: '', email: '' });
                        }}
                        style={{ alignSelf: 'flex-start' }}
                      />
                      {manual.map((g, i) => (
                        <View key={`${g.name}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                          <Avatar name={g.name} size={36} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontFamily: F.medium, fontSize: 15, color: t.text }}>{g.name}</Text>
                            <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.muted }}>{g.phone || 'No phone'}{g.email ? ` · ${g.email}` : ''}</Text>
                          </View>
                          <Pressable onPress={() => setManual(manual.filter((_, j) => j !== i))} hitSlop={10}>
                            <Icon name="close" size={18} color={t.muted} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}

                  {guests.length > 0 && (
                    <View style={{ backgroundColor: t.surface2, borderRadius: 18, padding: 18, gap: 12 }}>
                      <Text style={{ fontFamily: F.semibold, fontSize: 17, color: t.text }}>
                        {guests.length} guests · {seated} seated · {waiting} on the waitlist
                      </Text>
                      {noPhone > 0 && (
                        <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.amber }}>{noPhone} have no phone number, so Ria can't call them.</Text>
                      )}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {guests.slice(0, 6).map((g, i) => (
                          <View key={`${g.name}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg, borderRadius: 999, paddingLeft: 4, paddingRight: 10, height: 30 }}>
                            <Avatar name={g.name} size={22} round />
                            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.text }}>{g.name}</Text>
                          </View>
                        ))}
                        {guests.length > 6 && <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.muted, alignSelf: 'center' }}>+{guests.length - 6} more</Text>}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {step === 3 && (
                <View style={{ gap: 26 }}>
                  <View>
                    {JOBS.map((j, i) => (
                      <View key={j.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ fontFamily: F.semibold, fontSize: 16, color: t.text }}>{j.label}</Text>
                          <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted }}>{j.note}</Text>
                        </View>
                        <Switch
                          value={jobs[j.key]}
                          onValueChange={(v) => setJobs({ ...jobs, [j.key]: v })}
                          trackColor={{ true: t.green, false: t.surface2 }}
                          thumbColor="#FFFFFF"
                          {...(Platform.OS === 'web' ? { activeThumbColor: '#FFFFFF' } as object : {})}
                        />
                      </View>
                    ))}
                  </View>

                  <View style={{ backgroundColor: t.surface2, borderRadius: 22, padding: 22, gap: 14 }}>
                    <Text style={{ fontFamily: F.semibold, fontSize: 20, color: t.text, letterSpacing: -0.3 }}>Summary</Text>
                    <Check>{TYPES.find((x) => x.key === type)?.label} <Text style={{ fontFamily: F.semibold }}>{name}</Text>{date ? ` on ${date}` : ''}{venue ? ` at ${venue}` : ''}, {cap} seats</Check>
                    <Check on={jobs.confirmByCall}>Ria will call <Text style={{ fontFamily: F.semibold }}>{seated - noPhoneSeated(guests)} guests</Text> to confirm their seat</Check>
                    <Check on={jobs.fillFromWaitlist}>Ria will manage <Text style={{ fontFamily: F.semibold }}>{waiting} on the waitlist</Text>, calling the next person when a seat frees up</Check>
                    <Check on={jobs.collectFoodTshirt}>Food preference and T-shirt size are collected on each call</Check>
                    <Check on={jobs.feedbackEmail}>A feedback email goes out after the event</Check>
                    {noPhone > 0 && <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.amber }}>{noPhone} guests have no phone number and will be skipped.</Text>}
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingHorizontal: narrow ? 18 : 40, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 14), alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 680, flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
              {step > 0 && <Button variant="soft" label="Back" onPress={() => setStep(step - 1)} style={narrow ? { flex: 1 } : undefined} />}
              <Button
                icon={step === 3 ? 'rocket-outline' : undefined}
                label={step === 3 ? 'Launch Ria' : 'Continue'}
                onPress={go}
                disabled={!canNext}
                busy={launching}
                style={narrow ? { flex: 2 } : { minWidth: 160 }}
              />
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const noPhoneSeated = (gs: GuestInput[]) => gs.filter((g) => g.status === 'registered' && !g.phone).length;
