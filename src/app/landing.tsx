import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeartHandshake, Zap, Users, Rocket } from 'lucide-react-native';

import { Button } from '@/components/ui';
import { Colors, Typography, BorderRadius, Layout, Spacing } from '@/constants/design-tokens';

const pillars = [
  {
    word: 'Support',
    description: 'Help causes you believe in',
    icon: HeartHandshake,
    color: Colors.category.teal.text,
    bgColor: Colors.category.teal.bg,
  },
  {
    word: 'Empower',
    description: 'Make real impact',
    icon: Zap,
    color: Colors.category.amber.text,
    bgColor: Colors.category.amber.bg,
  },
  {
    word: 'Volunteer',
    description: 'Find opportunities',
    icon: Users,
    color: Colors.category.coral.icon,
    bgColor: Colors.category.coral.bg,
  },
  {
    word: 'Act',
    description: 'Start helping today',
    icon: Rocket,
    color: Colors.category.purple.text,
    bgColor: Colors.category.purple.bg,
  },
];

export default function LandingScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.pageBg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16 }}>
        {/* Top section: Logo and branding - moved down to 1/4 of page */}
        <View style={{ alignItems: 'center', gap: 4, paddingTop: 80 }}>
          {/* Logo mark: 70px teal badge with white HeartHandshake */}
          <View>
            <View
              style={{
                width: 70,
                height: 70,
                borderRadius: BorderRadius.xl,
                backgroundColor: Colors.primary,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <HeartHandshake size={38} color="white" strokeWidth={1.5} />
            </View>
          </View>

          {/* SEVA wordmark and Sanskrit */}
          <View style={{ alignItems: 'center', gap: 0 }}>
            <Text style={{ fontSize: 44, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -1 }}>
              SEVA
            </Text>

            {/* Devanagari: Much larger */}
            <Text style={{ fontSize: 42, fontWeight: '600', color: Colors.primary, lineHeight: 45 }}>
              सेवा
            </Text>

            {/* Tagline */}
            <Text
              style={{
                fontSize: 13,
                fontWeight: '400',
                color: Colors.textTertiary,
                marginTop: 1,
              }}
            >
              selfless service
            </Text>
          </View>
        </View>

        {/* Middle section: Pillars with emphasized first letters */}
        <View style={{ gap: 6, marginTop: 16 }}>
          {pillars.map((pillar, idx) => {
            const IconComponent = pillar.icon;
            const firstLetter = pillar.word[0];
            const restOfWord = pillar.word.slice(1);

            return (
              <View key={idx} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 2 }}>
                {/* Icon badge: 44px */}
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: BorderRadius.md,
                    backgroundColor: pillar.bgColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  <IconComponent size={22} color={pillar.color} strokeWidth={1.5} />
                </View>

                {/* Text block */}
                <View style={{ flex: 1, paddingTop: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <Text style={{ fontSize: 28, fontWeight: '700', color: Colors.primary, lineHeight: 32 }}>
                      {firstLetter}
                    </Text>
                    <Text style={{ fontSize: 26, fontWeight: '600', color: Colors.textPrimary, lineHeight: 30 }}>
                      {restOfWord}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '400',
                      color: Colors.textSecondary,
                      marginTop: 1,
                      lineHeight: 16,
                    }}
                  >
                    {pillar.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Bottom section: Buttons */}
        <View style={{ gap: 8, marginTop: 24 }}>
          <Button
            label="Get started"
            onPress={() => router.push('/signup')}
            variant="primary"
            size="xl"
          />

          {/* Text link: "Already have an account? Sign in" */}
          <TouchableOpacity onPress={() => router.push('/login')}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 16,
                fontWeight: '400',
                color: Colors.textSecondary,
              }}
            >
              Already have an account?{' '}
              <Text style={{ color: Colors.primary, fontWeight: '600' }}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
