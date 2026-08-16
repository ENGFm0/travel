import { useEffect } from 'react';
import { I18nManager, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { create } from 'zustand';
import i18n from './src/i18n';
import { useTranslation, I18nextProvider } from 'react-i18next';

/**
 * US-014-FE-002 — Mobile app shell.
 * Mirrors the web 5-item navigation, i18n (AR/EN), theming, and RTL. The shared
 * pieces (i18n bundles, design tokens, formatters, error contract, api client,
 * state models) are intended to move into `packages/*` and be imported by both
 * `apps/web` and `apps/mobile` (architecture §3).
 *
 * NOTE: authored as a scaffold; not built/run in the spec environment
 * (no Android/iOS emulator). Run with `expo start` on a dev machine.
 */

type Locale = 'ar' | 'en';
interface UI {
  locale: Locale;
  toggleLocale: () => void;
}
const useUI = create<UI>((set, get) => ({
  locale: 'ar',
  toggleLocale: () => set({ locale: get().locale === 'ar' ? 'en' : 'ar' }),
}));

const Tab = createBottomTabNavigator();

function Placeholder({ tkey }: { tkey: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 22, fontWeight: '700', textAlign: 'center' }}>
        {t(`pages.${tkey}.title`)}
      </Text>
      <Text style={{ marginTop: 8, opacity: 0.7, textAlign: 'center' }}>{t('shellNote')}</Text>
    </View>
  );
}

function Shell() {
  const scheme = useColorScheme();
  const locale = useUI((s) => s.locale);
  const { t } = useTranslation();

  useEffect(() => {
    void i18n.changeLanguage(locale);
    const rtl = locale === 'ar';
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      // a real app reloads via expo-updates so RTL applies app-wide
    }
  }, [locale]);

  return (
    <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Tab.Navigator screenOptions={{ headerTitle: t('app.name') }}>
        <Tab.Screen name="home" options={{ title: t('nav.home') }}>
          {() => <Placeholder tkey="home" />}
        </Tab.Screen>
        <Tab.Screen name="explore" options={{ title: t('nav.explore') }}>
          {() => <Placeholder tkey="explore" />}
        </Tab.Screen>
        <Tab.Screen name="new" options={{ title: t('nav.newTrip') }}>
          {() => <Placeholder tkey="planner" />}
        </Tab.Screen>
        <Tab.Screen name="buddies" options={{ title: t('nav.buddies') }}>
          {() => <Placeholder tkey="buddies" />}
        </Tab.Screen>
        <Tab.Screen name="mytrips" options={{ title: t('nav.mytrips') }}>
          {() => <Placeholder tkey="mytrips" />}
        </Tab.Screen>
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nextProvider i18n={i18n}>
        <Shell />
      </I18nextProvider>
    </SafeAreaProvider>
  );
}
