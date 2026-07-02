import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, useColorScheme, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { BorderRadius, Spacing } from '@/constants/design-tokens';

interface Tab {
  name: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size: number; color: string }>;
}

interface CustomTabBarProps {
  tabs: Tab[];
  bottomInset?: number;
}

export default function CustomTabBar({ tabs, bottomInset = 0 }: CustomTabBarProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<string>('');

  useEffect(() => {
    // Determine active tab based on current pathname
    let activeTabName = tabs[0].name; // default to first tab

    if (pathname === '/(tabs)' || pathname.endsWith('/index')) {
      activeTabName = 'index';
    } else if (pathname.includes('schedule')) {
      activeTabName = 'schedule';
    } else if (pathname.includes('charity-dashboard')) {
      activeTabName = 'charity-dashboard';
    }

    setActiveTab(activeTabName);
  }, [pathname, tabs]);

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(12, bottomInset),
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }
      ]}
    >
      <View style={styles.barWrapper}>
        {tabs.map((tab, index) => {
          const active = activeTab === tab.name;
          const Icon = tab.icon;

          return (
            <TouchableOpacity
              key={tab.name}
              style={[
                styles.tabButton,
                active && [styles.tabButtonActive, { backgroundColor: colors.primary }],
              ]}
              onPress={() => router.push(tab.href)}
              activeOpacity={0.8}
            >
              <Icon
                size={22}
                color={active ? '#FFFFFF' : colors.textTertiary}
                strokeWidth={1.5}
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: active ? '#FFFFFF' : colors.textTertiary,
                    fontWeight: active ? '600' : '500',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  barWrapper: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: BorderRadius.lg,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    shadowColor: '#0F6E56',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  label: {
    fontSize: 13,
    marginLeft: 6,
  },
});
