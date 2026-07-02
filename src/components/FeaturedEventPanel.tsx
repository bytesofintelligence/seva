import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Tag } from '@/components/ui';
import { Card } from '@/components/ui';
import { Spacing, Colors, Typography, BorderRadius, Layout } from '@/constants/design-tokens';

interface FeaturedEventPanelProps {
  eventName: string;
  date: string;
  time: string;
  location: string;
  currentVolunteers: number;
  targetVolunteers: number;
  signupCount: number;
}

const CircularProgress = ({
  current,
  target,
  isTargetReached,
}: {
  current: number;
  target: number;
  isTargetReached: boolean;
}) => {
  const size = 160;
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(current / target, 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'relative', width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track (unfilled) */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.ringTrack}
            strokeWidth={strokeWidth}
            fill="none"
          />

          {/* Progress circle */}
          <G origin={`${size / 2},${size / 2}`} rotation={-90}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={Colors.primary}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={`${strokeDashoffset}`}
              strokeLinecap="round"
            />
          </G>
        </Svg>

        {/* Center Content */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: Spacing.lg,
          }}
        >
          {isTargetReached ? (
            <>
              <Text style={[Typography.ringNumber, { color: Colors.primary }]}>
                {current}
              </Text>
              <Text style={[Typography.ringCaption, { color: Colors.primary }]}>
                target reached · +{current - target}
              </Text>
            </>
          ) : (
            <>
              <Text style={[Typography.ringNumber, { color: Colors.textPrimary }]}>
                {current}
              </Text>
              <Text style={[Typography.ringCaption, { color: Colors.textSecondary }]}>
                of {target} target
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
};

export function FeaturedEventPanel({
  eventName,
  date,
  time,
  location,
  currentVolunteers,
  targetVolunteers,
  signupCount,
}: FeaturedEventPanelProps) {
  const isTargetReached = currentVolunteers >= targetVolunteers;
  const moreNeeded = Math.max(0, targetVolunteers - currentVolunteers);

  return (
    <Card padding="lg" style={{ marginBottom: Spacing.xl }}>
      {/* Top row: Flagship tag + date */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
        <Tag label="Flagship event" color="coral" />
        <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
          This Friday
        </Text>
      </View>

      {/* Event title */}
      <Text style={[Typography.heroTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
        {eventName}
      </Text>

      {/* Meta row: time + location */}
      <View style={{ gap: Spacing.sm, marginBottom: Spacing.lg }}>
        <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
          🕒 {time}
        </Text>
        <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
          📍 {location}
        </Text>
      </View>

      {/* Divider */}
      <View
        style={{
          height: 1,
          backgroundColor: Colors.border,
          marginBottom: Spacing.lg,
        }}
      />

      {/* Progress Ring - centered */}
      <View
        style={{
          alignItems: 'center',
          marginBottom: Spacing.xl,
        }}
      >
        <CircularProgress
          current={currentVolunteers}
          target={targetVolunteers}
          isTargetReached={isTargetReached}
        />
      </View>

      {/* Stat cells row: 3 equal cells with 8px gap */}
      <View
        style={{
          flexDirection: 'row',
          gap: Spacing.sm,
          marginBottom: Spacing.lg,
        }}
      >
        {/* Volunteers cell */}
        <View
          style={{
            flex: 1,
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.sm, // 10px
            padding: 10,
            alignItems: 'center',
          }}
        >
          <Text style={[Typography.statNumber, { color: Colors.textPrimary, marginBottom: Spacing.xs }]}>
            {currentVolunteers}
          </Text>
          <Text style={[Typography.statLabel, { color: Colors.textSecondary }]}>
            Volunteers
          </Text>
        </View>

        {/* Sign-ups cell */}
        <View
          style={{
            flex: 1,
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.sm,
            padding: 10,
            alignItems: 'center',
          }}
        >
          <Text style={[Typography.statNumber, { color: Colors.textPrimary, marginBottom: Spacing.xs }]}>
            {signupCount}
          </Text>
          <Text style={[Typography.statLabel, { color: Colors.textSecondary }]}>
            Sign-ups
          </Text>
        </View>

        {/* To Target cell */}
        <View
          style={{
            flex: 1,
            backgroundColor: Colors.surfaceMuted,
            borderRadius: BorderRadius.sm,
            padding: 10,
            alignItems: 'center',
          }}
        >
          <Text style={[Typography.statNumber, { color: Colors.primary, marginBottom: Spacing.xs }]}>
            {moreNeeded}
          </Text>
          <Text style={[Typography.statLabel, { color: Colors.textSecondary }]}>
            To target
          </Text>
        </View>
      </View>

      {/* Muted caption line */}
      <Text style={[Typography.meta, { color: Colors.textTertiary, textAlign: 'center' }]}>
        Sign-ups stay open past {targetVolunteers} to cover no-shows
      </Text>
    </Card>
  );
}
