import { Slot, router, usePathname } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, useNarrow, type IconName } from '../../components/ui';
import { EVENT_NAME } from '../../data/config';
import { inbox } from '../../data/selectors';
import { useData, useNow } from '../../data/store';
import { F, useTheme } from '../../theme';

const TABS: { href: string; label: string; short: string; icon: IconName; iconOn: IconName }[] = [
  { href: '/', label: 'Mission Control', short: 'Home', icon: 'grid-outline', iconOn: 'grid' },
  { href: '/waitlist', label: 'Waitlist', short: 'Waitlist', icon: 'people-outline', iconOn: 'people' },
  { href: '/calls', label: 'Calls', short: 'Calls', icon: 'call-outline', iconOn: 'call' },
  { href: '/inbox', label: 'Inbox', short: 'Inbox', icon: 'file-tray-outline', iconOn: 'file-tray' },
  { href: '/insights', label: 'Insights', short: 'Insights', icon: 'bar-chart-outline', iconOn: 'bar-chart' },
];

function Logo() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="call" size={17} color={t.onPrimary} />
      </View>
      <View>
        <Text style={{ fontFamily: F.xbold, fontSize: 18, color: t.text, letterSpacing: -0.4 }}>Ria Control</Text>
        <Text style={{ fontFamily: F.medium, fontSize: 11, color: t.muted }}>{EVENT_NAME} organizer</Text>
      </View>
    </View>
  );
}

function FeedPill() {
  const t = useTheme();
  const { source, error, ready } = useData();
  const color = error ? t.red : source === 'mock' ? t.amber : t.green;
  const bg = error ? t.redSoft : source === 'mock' ? t.amberSoft : t.greenSoft;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, height: 28 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontFamily: F.semibold, fontSize: 12, color }}>
        {error ? 'Feed error' : source === 'mock' ? 'Mock data' : ready ? 'Live' : 'Connecting'}
      </Text>
    </View>
  );
}

export default function Shell() {
  const t = useTheme();
  const path = usePathname();
  const narrow = useNarrow();
  const insets = useSafeAreaInsets();
  const now = useNow(15000);
  const { registrants, calls, notice, dismissNotice, error } = useData();
  const inboxCount = inbox(registrants, calls, now).total;
  const active = (href: string) =>
    href === '/' ? path === '/' : path.startsWith(href) || (href === '/calls' && path.startsWith('/call/'));

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top }}>
      {narrow ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 }}>
          <Logo />
          <FeedPill />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Logo />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {TABS.map((tab) => {
              const on = active(tab.href);
              return (
                <Pressable
                  key={tab.href}
                  onPress={() => router.navigate(tab.href as never)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  style={(st) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 14, borderRadius: 999,
                    backgroundColor: on ? t.primarySoft : (st as { hovered?: boolean }).hovered ? t.surface2 : 'transparent',
                  })}
                >
                  <Icon name={on ? tab.iconOn : tab.icon} size={16} color={on ? t.primary : t.muted} />
                  <Text style={{ fontFamily: F.semibold, fontSize: 13, color: on ? t.primary : t.muted }}>{tab.label}</Text>
                  {tab.href === '/inbox' && inboxCount > 0 && (
                    <View style={{ backgroundColor: t.red, borderRadius: 999, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 10, color: '#fff' }}>{inboxCount}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <FeedPill />
          </View>
        </View>
      )}

      {error && (
        <View style={{ marginHorizontal: narrow ? 16 : 32, marginTop: 12, backgroundColor: t.redSoft, borderRadius: 14, padding: 12 }}>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: t.red }}>
            Firestore refused the listener ({error}). The security rules need to allow organizer reads.
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Slot />
      </View>

      {narrow && (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 12), flexDirection: 'row', backgroundColor: t.surface, borderRadius: 26, padding: 6, borderWidth: 1, borderColor: t.border, ...t.shadow }}>
          {TABS.map((tab) => {
            const on = active(tab.href);
            return (
              <Pressable
                key={tab.href}
                onPress={() => router.navigate(tab.href as never)}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderRadius: 20, backgroundColor: on ? t.primarySoft : 'transparent' }}
              >
                <View>
                  <Icon name={on ? tab.iconOn : tab.icon} size={21} color={on ? t.primary : t.muted} />
                  {tab.href === '/inbox' && inboxCount > 0 && (
                    <View style={{ position: 'absolute', top: -4, right: -9, backgroundColor: t.red, borderRadius: 999, minWidth: 16, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 9, color: '#fff' }}>{inboxCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: F.semibold, fontSize: 11, color: on ? t.primary : t.muted }}>{tab.short}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {notice && (
        <Pressable
          onPress={dismissNotice}
          style={{
            position: 'absolute', left: 16, right: 16, alignSelf: 'center', maxWidth: 440,
            ...(narrow ? { top: insets.top + 8 } : { bottom: 24, right: 24, left: undefined }),
            flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.mode === 'dark' ? t.surface2 : '#17161D',
            borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, ...t.shadow,
          }}
        >
          <Icon name={notice.tone === 'error' ? 'alert-circle' : 'checkmark-circle'} size={20} color={notice.tone === 'error' ? t.red : t.green} />
          <Text style={{ fontFamily: F.medium, fontSize: 14, color: '#FFFFFF', flexShrink: 1 }}>{notice.text}</Text>
        </Pressable>
      )}
    </View>
  );
}
