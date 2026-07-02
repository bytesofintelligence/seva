# Design System

This document describes the SEVA app's design system, including design tokens, component library, and usage patterns.

## Design Tokens

All design tokens are centralized in `src/constants/design-tokens.ts` and are the single source of truth for colors, spacing, typography, and shadows.

### Colors

```typescript
import { Colors } from '@/constants/design-tokens';

// Primary brand color (deep teal)
Colors.primary.darkTeal    // #0F6E56
Colors.primary.teal        // #118B6B
Colors.primary.lightTeal   // #E8F4F1

// Accent color (warm coral) for tags and highlights
Colors.accent.coral        // #D85A30
Colors.accent.lightCoral   // #FFE8DD

// Semantic colors
Colors.semantic.success    // #10B981
Colors.semantic.warning    // #F59E0B
Colors.semantic.error      // #EF4444
Colors.semantic.info       // #3B82F6

// Neutral grays for text and backgrounds
Colors.neutral.black       // #000000
Colors.neutral.darkGray    // #1F2937
Colors.neutral.gray        // #6B7280
Colors.neutral.lightGray   // #D1D5DB
Colors.neutral.lightestGray // #F3F4F6
Colors.neutral.white       // #FFFFFF
```

### Spacing Scale

Use these spacing values for consistent padding, margins, and gaps:

```typescript
import { Spacing } from '@/constants/design-tokens';

Spacing.xs   // 4px
Spacing.sm   // 8px
Spacing.md   // 12px
Spacing.lg   // 16px
Spacing.xl   // 24px
Spacing.xxl  // 32px
```

### Border Radius

```typescript
import { BorderRadius } from '@/constants/design-tokens';

BorderRadius.none   // 0
BorderRadius.sm     // 4px
BorderRadius.md     // 8px
BorderRadius.lg     // 12px
BorderRadius.xl     // 16px
BorderRadius.full   // 9999px (pill-shaped)
```

### Typography

```typescript
import { Typography } from '@/constants/design-tokens';

// Headings
Typography.h1      // 32px, 600 weight
Typography.h2      // 24px, 600 weight
Typography.h3      // 20px, 600 weight

// Body text
Typography.body    // 16px, 400 weight
Typography.bodyBold // 16px, 600 weight

// Labels and small text
Typography.label   // 14px, 500 weight
Typography.small   // 12px, 400 weight
Typography.smallBold // 12px, 600 weight
```

### Shadows

```typescript
import { Shadows } from '@/constants/design-tokens';

Shadows.sm   // Subtle elevation
Shadows.md   // Medium elevation
Shadows.lg   // Strong elevation
```

---

## Base Components

All base components are in `src/components/ui/` and exported from `src/components/ui/index.ts`.

### Screen

A safe-area wrapper for full-screen views with consistent padding.

**Props:**
- `children` (required): Content to render
- `scrollable` (optional): Enable vertical scrolling (default: false)
- `backgroundColor` (optional): Background color (default: white)
- `padding` (optional): Padding size - 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' (default: 'lg')
- `testID` (optional): Test identifier

**Usage:**

```typescript
import { Screen, Card, Button } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';

export function HomeScreen() {
  return (
    <Screen>
      <ThemedText type="title" style={{ marginBottom: 16 }}>Welcome</ThemedText>
      <Card>
        <ThemedText>Your content here</ThemedText>
      </Card>
    </Screen>
  );
}
```

For scrollable content:

```typescript
<Screen scrollable>
  {/* Long list of content */}
</Screen>
```

---

### Button

Interactive button with multiple variants and built-in press animation using React Native Reanimated.

**Props:**
- `label` (required): Button text
- `onPress` (required): Callback function
- `variant` (optional): 'primary' | 'secondary' | 'ghost' (default: 'primary')
- `size` (optional): 'sm' | 'md' | 'lg' (default: 'md')
- `disabled` (optional): Disable button (default: false)
- `testID` (optional): Test identifier

**Variants:**
- **primary**: Deep teal background, white text (main actions)
- **secondary**: Light coral background, coral text (secondary actions)
- **ghost**: Transparent, teal text (subtle actions)

**Usage:**

```typescript
import { Button } from '@/components/ui';

export function SignupFlow() {
  return (
    <>
      {/* Primary button */}
      <Button
        label="Sign Up"
        onPress={() => handleSignup()}
        variant="primary"
        size="lg"
      />

      {/* Secondary button */}
      <Button
        label="Learn More"
        onPress={() => openInfo()}
        variant="secondary"
        size="md"
      />

      {/* Ghost button */}
      <Button
        label="Skip for now"
        onPress={() => goHome()}
        variant="ghost"
        size="sm"
      />
    </>
  );
}
```

The button automatically animates on press with a smooth spring effect (scales to 0.95).

---

### Card

Container for grouping content with rounded corners, subtle border, and optional shadow.

**Props:**
- `children` (required): Content to render
- `padding` (optional): Padding size (default: 'lg')
- `shadow` (optional): Shadow level - 'sm' | 'md' | 'lg' (default: 'sm')
- `backgroundColor` (optional): Background color (default: white)
- `testID` (optional): Test identifier

**Usage:**

```typescript
import { Card, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';

export function OpportunityCard({ title, location, category }) {
  return (
    <Card shadow="md" padding="lg">
      <ThemedText type="title">{title}</ThemedText>
      <ThemedText style={{ marginTop: 8 }}>{location}</ThemedText>
      <Tag label={category} color="accent" style={{ marginTop: 12 }} />
    </Card>
  );
}
```

Use `shadow="lg"` for more prominent cards, `shadow="sm"` for subtle separation.

---

### Tag

Small colored pill badges for categorizing content.

**Props:**
- `label` (required): Tag text
- `color` (optional): Color variant (default: 'primary')
- `testID` (optional): Test identifier

**Colors:**
- `primary`: Teal (default)
- `accent`: Coral
- `success`: Green
- `warning`: Amber
- `error`: Red
- `info`: Blue

**Usage:**

```typescript
import { Tag } from '@/components/ui';

export function OpportunityTags() {
  return (
    <>
      <Tag label="Environment" color="primary" />
      <Tag label="Event" color="accent" />
      <Tag label="Verified" color="success" />
      <Tag label="Urgent" color="warning" />
    </>
  );
}
```

Tags automatically have padding and are pill-shaped. Stack them in a flexbox row:

```typescript
<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
  <Tag label="Category 1" />
  <Tag label="Category 2" />
</View>
```

---

### Input

Styled text input field with optional label, error state, and icon support.

**Props:**
- `label` (optional): Label text above input
- `placeholder` (optional): Placeholder text
- `error` (optional): Error message (shows error state if provided)
- `icon` (optional): React element to display inside input
- `size` (optional): 'sm' | 'md' | 'lg' (default: 'md')
- `testID` (optional): Test identifier
- ...all standard `TextInputProps` (value, onChangeText, secureTextEntry, etc.)

**Usage:**

```typescript
import { Input } from '@/components/ui';
import { useState } from 'react';

export function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');

  return (
    <>
      <Input
        label="Email Address"
        placeholder="you@example.com"
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

      <Input
        label="Confirm Password"
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        error={emailError && 'Passwords do not match'}
      />
    </>
  );
}
```

Error state automatically shows red border and error message:

```typescript
<Input
  label="Username"
  value={username}
  onChangeText={setUsername}
  error={username.length < 3 ? 'At least 3 characters' : ''}
/>
```

---

## Complete Example

Here's a complete page using all design system components:

```typescript
import { useState } from 'react';
import { View } from 'react-native';
import { Screen, Card, Button, Input, Tag } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/design-tokens';

export function ExampleScreen() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [nameError, setNameError] = useState('');

  const handleSignup = () => {
    if (fullName.length < 2) {
      setNameError('Name too short');
      return;
    }
    // Handle signup
  };

  return (
    <Screen scrollable padding="lg">
      <ThemedText type="title" style={{ marginBottom: Spacing.md }}>
        Create Account
      </ThemedText>

      <Card shadow="md" style={{ marginBottom: Spacing.xl }}>
        <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
          <Tag label="Volunteer" color="primary" />
          <Tag label="Verified" color="success" />
        </View>

        <Input
          label="Full Name"
          placeholder="Jane Doe"
          value={fullName}
          onChangeText={setFullName}
          error={nameError}
        />

        <Input
          label="Email"
          placeholder="jane@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
        />
      </Card>

      <Button
        label="Create Account"
        onPress={handleSignup}
        variant="primary"
        size="lg"
      />

      <Button
        label="Already have an account?"
        onPress={() => {}}
        variant="ghost"
        size="md"
      />
    </Screen>
  );
}
```

---

## When to Use Each Component

| Task | Component |
|------|-----------|
| Wrap a full screen page | `<Screen>` |
| Group related content | `<Card>` |
| Primary/secondary action | `<Button>` |
| Category/label badge | `<Tag>` |
| User input (text, email, password) | `<Input>` |

---

## Customization

All components use design tokens from `design-tokens.ts`. To change a color, spacing, or radius globally, update that file.

Example: Change primary color from teal to blue:

```typescript
// In design-tokens.ts
primary: {
  darkTeal: '#1E3A8A',  // Changed
  teal: '#2563EB',      // Changed
  lightTeal: '#EFF6FF', // Changed
}

// All components using Colors.primary automatically update
```

---

## Font System

All text uses Inter font (regular, medium, semibold) loaded at app startup. The `ThemedText` component handles font family selection based on weight automatically.

See `src/lib/fonts.ts` and `src/components/themed-text.tsx` for details.
