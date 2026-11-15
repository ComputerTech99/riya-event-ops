import { Slot, router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Icon, useNarrow, type IconName } from '../../components/ui';
import { inbox } from '../../data/selectors';
import { useData, useNow } from '../../data/store';
import { F, useTheme } from '../../theme';

const TABS: { href: string; label: string; icon: IconName; iconOn: IconName }[] = [
  { href: '/', label: 'Home', icon: 'home-outline', iconOn: 'home' },
  { href: '/waitlist', label: 'Waitlist', icon: 'people-outline', iconOn: 'people' },
  { href: '/calls', label: 'Calls', icon: 'call-outline', iconOn: 'call' },
  { href: '/inbox', label: 'Inbox', icon: 'file-tray-outline', iconOn: 'file-tray' },
  { href: '/insights', label: 'Insights', icon: 'bar-chart-outline', iconOn: 'bar-chart' },
];

function Mark({ size = 40 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="call" size={size * 0.45} color={t.onPrimary} />
    </View>
  );
}

function useFeed() {
  const t = useTheme();
  const { source, error, ready } = useData();
  return {
    color: error ? t.red : source === 'mock' ? t.amber : t.green,
    label: error ? 'Feed error' : source === 'mock' ? 'Mock data' : ready ? 'Live' : 'Connecting',
  };
}

function OrganizerSignIn() {
  const t = useTheme();
  const narrow = useNarrow();
  const { signIn } = useData();
  const [email, setEmail] = useState('organizer@riya.ai');
  const [password, setPassword] = useState('riya-hack-2026');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await signIn(email, password);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: t.surface2,
    fontFamily: F.medium,
    fontSize: 15,
    color: t.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}),
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.canvas, padding: narrow ? 16 : 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 440, backgroundColor: t.bg, borderRadius: 24, padding: narrow ? 24 : 36, gap: 22, ...t.shadow }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Mark size={42} />
          <View>
            <Text style={{ fontFamily: F.semibold, fontSize: 20, color: t.text, letterSpacing: -0.4 }}>Ria Control</Text>
            <Text style={{ fontFamily: F.regular, fontSize: 13, color: t.muted }}>Live Firestore organiser console</Text>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 26, color: t.text, letterSpacing: -0.7 }}>Organiser sign-in</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 14, color: t.muted, lineHeight: 20 }}>
            Sign in with Firebase Auth to read live events, registrants, calls and the dialer queue.
          </Text>
        </View>

        <View style={{ gap: 14 }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.text }}>Organiser email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="organizer@riya.ai"
              placeholderTextColor={t.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={inputStyle}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.text }}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={t.faint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
              style={inputStyle}
            />
          </View>
        </View>

        {err && (
          <View style={{ backgroundColor: t.redSoft, borderRadius: 12, padding: 12 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.red }}>{err}</Text>
          </View>
        )}

        <Button icon="lock-open-outline" label="Sign in as organiser" onPress={submit} busy={busy} />
      </View>
    </View>
  );
}

export default function Shell() {
  const t = useTheme();
  const path = usePathname();
  const narrow = useNarrow();
  const insets = useSafeAreaInsets();
  const now = useNow(15000);
  const feed = useFeed();
  const { registrants, calls, notice, dismissNotice, error, setupLoaded, setupSeen, user, authReady, signOut } = useData();

  // First launch in mock mode: walk the organizer through setting up their event.
  useEffect(() => {
    if (setupLoaded && !setupSeen) router.replace('/setup');
  }, [setupLoaded, setupSeen]);

  if (!authReady) {
    return (
      <View style={{ flex: 1, backgroundColor: t.canvas, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={t.text} />
      </View>
    );
  }

  if (!user) {
    return <OrganizerSignIn />;
  }

  const plus = (size: number) => (
    <Pressable
      onPress={() => router.push('/setup')}
      accessibilityRole="button"
      accessibilityLabel="Set up a new event"
      style={(st) => ({
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: t.border, borderStyle: 'dashed',
        backgroundColor: (st as { hovered?: boolean }).hovered || st.pressed ? t.surface2 : 'transparent',
      })}
    >
      <Icon name="add" size={size * 0.48} color={t.text} />
    </Pressable>
  );
  const inboxCount = inbox(registrants, calls, now).total;
  const active = (href: string) =>
    href === '/' ? path === '/' : path.startsWith(href) || (href === '/calls' && path.startsWith('/call/'));
  const go = (href: string) => router.navigate(href as never);

  const errorBar = error ? (
    <View style={{ marginHorizontal: narrow ? 18 : 44, marginTop: 12, backgroundColor: t.redSoft, borderRadius: 14, padding: 12 }}>
      <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.red }}>
        Firestore refused the listener ({error}). The security rules need to allow organizer reads.
      </Text>
    </View>
  ) : null;

  const toast = notice ? (
    <Pressable
      onPress={dismissNotice}
      style={{
        position: 'absolute', alignSelf: 'center', maxWidth: 440,
        ...(narrow ? { top: insets.top + 8, left: 16, right: 16 } : { bottom: 32, right: 32 }),
        flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.primary,
        borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12, ...t.shadow,
      }}
    >
      <Icon name={notice.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color={notice.tone === 'error' ? t.red : t.green} />
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: t.onPrimary, flexShrink: 1 }}>{notice.text}</Text>
    </Pressable>
  ) : null;

  if (!narrow) {
    return (
      <View style={{ flex: 1, backgroundColor: t.canvas, padding: 20 }}>
        <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg, borderRadius: 24, overflow: 'hidden', ...t.shadow }}>
          <View style={{ width: 84, alignItems: 'center', paddingVertical: 28, borderRightWidth: 1, borderRightColor: t.border }}>
            <Mark />
            <View style={{ marginTop: 22 }}>{plus(40)}</View>
            <View style={{ gap: 10, marginTop: 36 }}>
              {TABS.map((tab) => {
                const on = active(tab.href);
                return (
                  <Pressable
                    key={tab.href}
                    onPress={() => go(tab.href)}
                    accessibilityRole="tab"
                    accessibilityLabel={tab.label}
                    accessibilityState={{ selected: on }}
                    style={(st) => ({
                      width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on || (st as { hovered?: boolean }).hovered ? t.surface2 : 'transparent',
                    })}
                  >
                    <Icon name={on ? tab.iconOn : tab.icon} size={21} color={on ? t.text : t.faint} />
                    {tab.href === '/inbox' && inboxCount > 0 && (
                      <View style={{ position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, backgroundColor: t.red, borderWidth: 2, borderColor: t.bg }} />
                    )}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => signOut()}
              accessibilityRole="button"
              accessibilityLabel={`Sign out ${user.email ?? 'organiser'}`}
              style={(st) => ({
                width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                backgroundColor: (st as { hovered?: boolean }).hovered || st.pressed ? t.surface2 : 'transparent',
              })}
            >
              <Icon name="log-out-outline" size={19} color={t.muted} />
            </Pressable>
            <View style={{ alignItems: 'center', gap: 6 }} accessibilityLabel={feed.label}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: feed.color }} />
              <Text style={{ fontFamily: F.medium, fontSize: 10, color: t.muted, textAlign: 'center' }}>{feed.label.replace(' ', '\n')}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            {errorBar}
            <Slot />
          </View>
        </View>
        {toast}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Mark size={34} />
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: t.text, letterSpacing: -0.3 }}>Ria Control</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surface2, borderRadius: 999, paddingHorizontal: 12, height: 32 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: feed.color }} />
            <Text style={{ fontFamily: F.medium, fontSize: 12, color: t.text }}>{feed.label}</Text>
          </View>
          <Pressable
            onPress={() => signOut()}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="log-out-outline" size={17} color={t.text} />
          </Pressable>
          {plus(34)}
        </View>
      </View>
      {errorBar}
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <View style={{
        position: 'absolute', left: 14, right: 14, bottom: Math.max(insets.bottom, 12), flexDirection: 'row',
        backgroundColor: t.primary, borderRadius: 999, padding: 6, ...t.shadow,
      }}>
        {TABS.map((tab) => {
          const on = active(tab.href);
          return (
            <Pressable
              key={tab.href}
              onPress={() => go(tab.href)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: on ? t.onPrimary : 'transparent' }}
            >
              <View>
                <Icon name={on ? tab.iconOn : tab.icon} size={21} color={on ? t.primary : t.mode === 'dark' ? '#55555E' : '#8A8A93'} />
                {tab.href === '/inbox' && inboxCount > 0 && (
                  <View style={{ position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: t.red }} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      {toast}
    </View>
  );
}
