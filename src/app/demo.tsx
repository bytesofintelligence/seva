import { useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, Button, Input, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing, Colors } from '@/constants/design-tokens';
import { useRouter } from 'expo-router';

export default function DemoScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState('');

  const handleValidateName = () => {
    if (name.length < 2) {
      setNameError('Name must be at least 2 characters');
    } else {
      setNameError('');
    }
  };

  return (
    <Screen scrollable padding="lg">
      {/* Header */}
      <View style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.md }}>
          Design System Demo
        </ThemedText>
        <ThemedText style={{ color: Colors.textSecondary }}>
          See all base components in action
        </ThemedText>
      </View>

      {/* Typography Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Typography
        </ThemedText>
        <ThemedText type="h1" style={{ marginBottom: Spacing.md }}>
          H1 Heading
        </ThemedText>
        <ThemedText type="h2" style={{ marginBottom: Spacing.md }}>
          H2 Heading
        </ThemedText>
        <ThemedText type="h3" style={{ marginBottom: Spacing.md }}>
          H3 Heading
        </ThemedText>
        <ThemedText style={{ marginBottom: Spacing.md }}>
          Body text at 16px
        </ThemedText>
        <ThemedText type="small">Small text at 12px</ThemedText>
      </Card>

      {/* Buttons Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Buttons
        </ThemedText>

        <View style={{ gap: Spacing.md }}>
          {/* Primary buttons */}
          <View>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Primary
            </ThemedText>
            <Button label="Primary Large" onPress={() => {}} size="lg" />
          </View>

          <Button label="Primary Medium" onPress={() => {}} size="md" />
          <Button label="Primary Small" onPress={() => {}} size="sm" />

          {/* Secondary buttons */}
          <View style={{ marginTop: Spacing.md }}>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Secondary
            </ThemedText>
            <Button
              label="Secondary Large"
              onPress={() => {}}
              variant="ghost"
              size="lg"
            />
          </View>

          <Button
            label="Secondary Medium"
            onPress={() => {}}
            variant="ghost"
            size="md"
          />
          <Button
            label="Secondary Small"
            onPress={() => {}}
            variant="ghost"
            size="sm"
          />

          {/* Ghost buttons */}
          <View style={{ marginTop: Spacing.md }}>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Ghost
            </ThemedText>
            <Button label="Ghost Large" onPress={() => {}} variant="ghost" size="lg" />
          </View>

          <Button
            label="Ghost Medium"
            onPress={() => {}}
            variant="ghost"
            size="md"
          />
          <Button
            label="Ghost Small"
            onPress={() => {}}
            variant="ghost"
            size="sm"
          />

          {/* Disabled button */}
          <View style={{ marginTop: Spacing.md }}>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Disabled
            </ThemedText>
            <Button label="Disabled Button" onPress={() => {}} disabled />
          </View>
        </View>
      </Card>

      {/* Tags Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Tags
        </ThemedText>
        <View style={{ gap: Spacing.md }}>
          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Primary</ThemedText>
            <Tag label="Primary Tag" color="teal" />
          </View>

          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Accent</ThemedText>
            <Tag label="Accent Tag" color="coral" />
          </View>

          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Success</ThemedText>
            <Tag label="Success Tag" color="teal" />
          </View>

          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Warning</ThemedText>
            <Tag label="Warning Tag" color="amber" />
          </View>

          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Error</ThemedText>
            <Tag label="Error Tag" color="coral" />
          </View>

          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Info</ThemedText>
            <Tag label="Info Tag" color="blue" />
          </View>

          <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
            <ThemedText style={{ color: Colors.textSecondary }}>Multiple Tags</ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
              <Tag label="Environment" color="teal" />
              <Tag label="Event" color="coral" />
              <Tag label="Verified" color="teal" />
            </View>
          </View>
        </View>
      </Card>

      {/* Inputs Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Inputs
        </ThemedText>

        <Input
          label="Full Name"
          placeholder="Jane Doe"
          value={name}
          onChangeText={setName}
          error={nameError}
          onBlur={handleValidateName}
        />

        <Input
          label="Email Address"
          placeholder="jane@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Input
          label="Password"
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <View style={{ marginTop: Spacing.md }}>
          <ThemedText style={{ marginBottom: Spacing.md, color: Colors.textSecondary }}>
            Different Sizes
          </ThemedText>
          <Input placeholder="Small input" size="sm" />
          <Input placeholder="Medium input" size="md" />
          <Input placeholder="Large input" size="lg" />
        </View>
      </Card>

      {/* Cards Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Cards
        </ThemedText>

        <Card shadow="sm" style={{ marginBottom: Spacing.md }}>
          <ThemedText style={{ marginBottom: Spacing.sm, fontWeight: '600' }}>
            Shadow: Small
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary }}>
            Subtle elevation for secondary content
          </ThemedText>
        </Card>

        <Card shadow="md" style={{ marginBottom: Spacing.md }}>
          <ThemedText style={{ marginBottom: Spacing.sm, fontWeight: '600' }}>
            Shadow: Medium
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary }}>
            Standard elevation for main content
          </ThemedText>
        </Card>

        <Card shadow="lg">
          <ThemedText style={{ marginBottom: Spacing.sm, fontWeight: '600' }}>
            Shadow: Large
          </ThemedText>
          <ThemedText style={{ color: Colors.textSecondary }}>
            Strong elevation for featured content
          </ThemedText>
        </Card>
      </Card>

      {/* Colors Section */}
      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <ThemedText type="title" style={{ marginBottom: Spacing.lg }}>
          Color Palette
        </ThemedText>

        <View style={{ gap: Spacing.md }}>
          <View>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Primary
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.primary,
                  borderRadius: 8,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.primary.teal,
                  borderRadius: 8,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.primaryTintBg,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              />
            </View>
          </View>

          <View>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Accent
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.accent.coral,
                  borderRadius: 8,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.accent.lightCoral,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              />
            </View>
          </View>

          <View>
            <ThemedText style={{ marginBottom: Spacing.sm, color: Colors.textSecondary }}>
              Semantic
            </ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.primary,
                  borderRadius: 8,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.category.amber.text,
                  borderRadius: 8,
                }}
              />
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: Colors.category.coral.text,
                  borderRadius: 8,
                }}
              />
            </View>
          </View>
        </View>
      </Card>

      {/* Navigation */}
      <View style={{ gap: Spacing.md, marginBottom: Spacing.xxl }}>
        <Button
          label="← Back to App"
          onPress={() => router.replace('/(tabs)')}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}
