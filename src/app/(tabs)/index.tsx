import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, ScrollView, TouchableOpacity, View, Text } from "react-native";
import { Clock, MapPin, Repeat2 } from "lucide-react-native";

import { AvatarDisplay } from "@/components/AvatarDisplay";
import { Button, Card, Input, Screen, Tag } from "@/components/ui";
import { DateSelectionSheet } from "@/components/DateSelectionSheet";
import { Colors, Spacing, Typography, BorderRadius, Layout } from "@/constants/design-tokens";
import { useAuth } from "@/context/auth-context";
import { supabase } from "@/lib/supabase";

interface Opportunity {
  id: string;
  title: string;
  location: string;
  type: string | null;
  description: string;
  featured: boolean;
  target_volunteers: number | null;
  max_volunteers: number | null;
  starts_at: string | null;
  series_id: string | null;
  charities: {
    name: string;
  } | null;
  opportunity_volunteer_counts?: {
    volunteers_count: number;
  } | null;
}

type FilterType = "all" | "delivery" | "on-site" | "remote";

const FILTER_OPTIONS: { label: string; value: FilterType }[] = [
  { label: "All", value: "all" },
  { label: "Delivery", value: "delivery" },
  { label: "On-site", value: "on-site" },
  { label: "Remote", value: "remote" },
];

const typeToCategory: Record<string, "coral" | "blue" | "purple" | "teal"> = {
  delivery: "coral",
  "on-site": "blue",
  remote: "purple",
  flagship: "coral",
};

const formatTagLabel = (type: string | null): string => {
  if (!type) return '';
  return type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('-');
};

export default function HomeScreen() {
  const router = useRouter();
  const { session, profileRefreshToken } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<FilterType>("all");
  const [userProfile, setUserProfile] = useState<{
    avatar_url: string | null;
    full_name: string | null;
  } | null>(null);
  const [userApplications, setUserApplications] = useState<
    Map<string, { status: string }>
  >(new Map());
  const [seriesRecurrence, setSeriesRecurrence] = useState<Map<string, 'weekly' | 'daily'>>(new Map());
  const [dateSheetSeries, setDateSheetSeries] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) {
        return;
      }

      fetchOpportunities();
      fetchUserProfile();
    }, [session?.user.id]),
  );

  useEffect(() => {
    if (!session?.user.id) {
      return;
    }

    fetchUserProfile();
  }, [session?.user.id, profileRefreshToken]);

  const fetchUserProfile = async () => {
    if (!session?.user.id) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setUserProfile(data);
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
  };

  const fetchOpportunities = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supabaseError } = await supabase
        .from("opportunities")
        .select(
          `
          id,
          title,
          location,
          type,
          description,
          featured,
          target_volunteers,
          max_volunteers,
          starts_at,
          series_id,
          charities(name)
        `,
        )
        .eq("status", "active")
        .order("featured", { ascending: false })
        .order("created_at", { ascending: false });

      if (supabaseError) {
        throw supabaseError;
      }

      // Fetch volunteer counts and user's applications
      if (data && data.length > 0) {
        const allIds = data.map((opp) => opp.id);

        // Get volunteer counts
        const { data: countData } = await supabase
          .from("opportunity_volunteer_counts")
          .select("id, volunteers_count")
          .in("id", allIds);

        // Get user's applications for these opportunities
        const { data: appData } = await supabase
          .from("applications")
          .select("opportunity_id, status")
          .eq("volunteer_id", session?.user.id)
          .in("opportunity_id", allIds);

        // Build maps
        const countMap = new Map(countData?.map((c) => [c.id, c]) || []);
        const applicationsMap = new Map(
          appData?.map((a) => [a.opportunity_id, a]) || []
        );

        // Filter opportunities: show if no application OR if cancelled (withdrawn - they can re-apply)
        // Hide if: rejected, confirmed, approved, in_progress, or completed
        // Also hide opportunities that are at max capacity (except featured events which always show)
        // Also exclude opportunities with past dates (starts_at is in the past)
        const now = new Date();
        const enrichedData = data
          .filter((opp) => {
            // Exclude opportunities with past start dates
            if (opp.starts_at && new Date(opp.starts_at) <= now) {
              return false;
            }

            const app = applicationsMap.get(opp.id);
            const volunteerCount = countMap.get(opp.id)?.volunteers_count || 0;

            // Only allow re-apply if status is 'cancelled' (withdrawn)
            // All other statuses (rejected, confirmed, approved, in_progress, completed) prevent re-apply
            if (app && app.status !== 'cancelled') {
              return false;
            }

            // Determine effective cap: use max_volunteers if set, otherwise use target_volunteers (no overbooking by default)
            const effectiveCap = opp.max_volunteers !== null ? opp.max_volunteers : opp.target_volunteers;

            // Hide if opportunity is at capacity (but keep featured events visible so they show "Full & Overbooked")
            if (effectiveCap !== null && volunteerCount >= effectiveCap && !opp.featured) {
              return false;
            }

            return true;
          })
          .map((opp) => ({
            ...opp,
            opportunity_volunteer_counts: countMap.get(opp.id),
          }));

        // Deduplicate by series (client-side): a series can have a dozen
        // generated occurrence rows, all `status = 'active'` and all in the
        // future, so without this step the same recurring event would
        // render one card per week. We keep every standalone opportunity
        // (series_id null) as-is, and for each series keep only the single
        // occurrence with the smallest starts_at — the next upcoming one.
        // This is the client-side equivalent of `DISTINCT ON (series_id)
        // ORDER BY series_id, starts_at ASC`; we do it in JS rather than SQL
        // because Supabase's PostgREST query builder has no DISTINCT ON
        // support, and the rest of this function's filtering (application
        // status, capacity) is already client-side, so adding one more
        // reduce step here avoids introducing a bespoke SQL view or RPC
        // just for this. Since the featured Jalaram row is a normal
        // opportunities row within this same result set, this single dedup
        // step also fixes the featured hero card showing multiple times —
        // there's no separate query for it to duplicate the fix in.
        const standalone = enrichedData.filter((o) => !o.series_id);
        const seriesRepresentatives = new Map<string, (typeof enrichedData)[number]>();
        for (const opp of enrichedData) {
          if (!opp.series_id) continue;
          const existing = seriesRepresentatives.get(opp.series_id);
          const oppTime = opp.starts_at ? new Date(opp.starts_at).getTime() : Infinity;
          const existingTime = existing?.starts_at ? new Date(existing.starts_at).getTime() : Infinity;
          if (!existing || oppTime < existingTime) {
            seriesRepresentatives.set(opp.series_id, opp);
          }
        }

        const deduped = [...standalone, ...Array.from(seriesRepresentatives.values())].sort(
          (a, b) => {
            const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
            const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
            return aTime - bTime;
          }
        );

        setUserApplications(applicationsMap);
        // Supabase infers to-one joins (charities) as arrays without generated
        // DB types; at runtime these are single objects (see access sites below).
        setOpportunities(deduped as unknown as Opportunity[]);

        // Fetch recurrence type for any series these opportunities belong to,
        // so the "Weekly"/"Daily" badge can be rendered without an extra
        // round trip per card.
        const seriesIds = Array.from(
          new Set(deduped.map((o) => o.series_id).filter((sid): sid is string => !!sid))
        );
        if (seriesIds.length > 0) {
          const { data: seriesData } = await supabase
            .from("opportunity_series")
            .select("id, recurrence_type")
            .in("id", seriesIds);

          setSeriesRecurrence(
            new Map((seriesData || []).map((s) => [s.id, s.recurrence_type]))
          );
        }
      } else {
        setOpportunities((data as unknown as Opportunity[]) || []);
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Failed to fetch opportunities";
      if (
        errorMsg.includes("relation") ||
        errorMsg.includes("does not exist")
      ) {
        setError("Opportunities table not yet set up in Supabase");
      } else {
        setError(errorMsg);
      }
      console.error("Error fetching opportunities:", err);
    } finally {
      setLoading(false);
    }
  };

  // Filter and search logic
  const { featuredOpportunities, regularOpportunities } = useMemo(() => {
    const filtered = opportunities.filter((opp) => {
      // Type filter
      if (selectedFilter !== "all" && opp.type !== selectedFilter) {
        return false;
      }

      // Search filter (title or charity name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = opp.title.toLowerCase().includes(query);
        const matchesCharity = opp.charities?.name
          .toLowerCase()
          .includes(query);
        return matchesTitle || matchesCharity;
      }

      return true;
    });

    return {
      featuredOpportunities: filtered.filter((opp) => opp.featured),
      regularOpportunities: filtered.filter((opp) => !opp.featured),
    };
  }, [opportunities, selectedFilter, searchQuery]);

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return { date: "", time: "" };
    const date = new Date(isoString);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return { date: dateStr, time: timeStr };
  };

  const formatNextOccurrenceLabel = (isoString: string) =>
    new Date(isoString).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/London",
    });

  const getSpotStatusColor = (
    filled: number,
    total: number,
  ): "teal" | "amber" => {
    const remaining = total - filled;
    // Nearly full: 2 or fewer spots remaining, or under 25% of total remaining
    const nearlyFull = remaining <= 2 || remaining / total < 0.25;
    return nearlyFull ? "amber" : "teal";
  };

  const getUrgencyMessage = (volunteersCount: number, target: number) => {
    if (target === 0) return null;
    const ratio = Math.min(1, volunteersCount / target);
    if (volunteersCount === 0) return "Be the first to sign up!";
    if (ratio < 0.34) return "We need your help — spots are wide open";
    if (ratio < 0.7) return "Halfway there! Help us reach full capacity";
    if (ratio < 1) return "Almost full — grab a spot before they run out";
    return null;
  };

  const renderFeaturedCard = (item: Opportunity) => {
    const { date, time } = formatDateTime(item.starts_at);
    const volunteersCount =
      item.opportunity_volunteer_counts?.volunteers_count || 0;

    // Determine effective cap
    const effectiveCap = item.max_volunteers !== null ? item.max_volunteers : item.target_volunteers;
    const isFull = effectiveCap !== null && volunteersCount >= effectiveCap;
    const target = item.target_volunteers || 0;
    const fillRatio = target > 0 ? Math.min(1, volunteersCount / target) : 0;
    const urgencyMessage = getUrgencyMessage(volunteersCount, target);

    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => handleCardPress(item)}
        style={{ marginBottom: Spacing.lg }}
      >
        <Card padding="lg" backgroundColor={Colors.cardBg}>
          {/* Top row: Flagship tag + Full indicator */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
            <Tag label="Flagship event" color="coral" />
            {isFull && (
              <Text style={{ ...Typography.badge, color: Colors.category.amber.text }}>
                FULL & OVERBOOKED
              </Text>
            )}
          </View>

          {/* Title: 18px / 500 */}
          <Text style={[Typography.heroTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
            {item.title}
          </Text>

          {/* Meta row: date, time, location */}
          <View style={{ gap: Spacing.sm, marginBottom: Spacing.md }}>
            {item.starts_at && (
              <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
                <Clock size={16} color={Colors.textTertiary} strokeWidth={1.5} />
                <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                  {date} at {time}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
              <MapPin size={16} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                {item.location}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: Spacing.md }} />

          {/* Volunteers signed up */}
          <View style={{ marginBottom: Spacing.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: Spacing.sm,
              }}
            >
              <Text style={[Typography.body, { color: Colors.textSecondary }]}>
                {volunteersCount} {volunteersCount === 1 ? "volunteer" : "volunteers"} signed up
                {target > 0 ? ` of ${target}` : ""}
              </Text>
              {target > 0 && !isFull && (
                <Text
                  style={[
                    Typography.badge,
                    { color: fillRatio < 0.34 ? Colors.category.amber.text : Colors.category.teal.text },
                  ]}
                >
                  {Math.round(fillRatio * 100)}%
                </Text>
              )}
            </View>

            {target > 0 && (
              <View
                style={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: Colors.category.teal.bg,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    width: `${fillRatio * 100}%`,
                    borderRadius: 4,
                    backgroundColor: isFull
                      ? Colors.category.amber.text
                      : fillRatio < 0.34
                      ? Colors.category.amber.text
                      : Colors.primary,
                  }}
                />
              </View>
            )}

            {urgencyMessage && (
              <Text
                style={[
                  Typography.meta,
                  { color: fillRatio < 0.34 ? Colors.category.amber.text : Colors.textSecondary, marginTop: Spacing.sm },
                ]}
              >
                {urgencyMessage}
              </Text>
            )}
          </View>

          {/* Full-width button */}
          <Button
            label={isFull ? "Event is full" : item.series_id ? "Choose a date" : "Count me in"}
            onPress={() => handleCardPress(item)}
            variant={isFull ? "ghost" : "primary"}
            disabled={isFull}
          />
        </Card>
      </TouchableOpacity>
    );
  };

  const handleCardPress = (item: Opportunity) => {
    if (item.series_id) {
      setDateSheetSeries({ id: item.series_id, title: item.title });
    } else {
      router.push(`/opportunity/${item.id}`);
    }
  };

  const renderOpportunityCard = ({ item }: { item: Opportunity }) => {
    const volunteersCount =
      item.opportunity_volunteer_counts?.volunteers_count || 0;
    const target = item.target_volunteers || 0;
    const spotsLeft = Math.max(0, target - volunteersCount);
    const spotStatusColor = getSpotStatusColor(volunteersCount, target);

    const categoryColor = item.type
      ? typeToCategory[item.type.toLowerCase()] || "teal"
      : "teal";

    const { date, time } = formatDateTime(item.starts_at);
    const recurrenceType = item.series_id ? seriesRecurrence.get(item.series_id) : undefined;

    return (
      <TouchableOpacity onPress={() => handleCardPress(item)}>
        <Card padding="md">
          {/* Category tag + repeating badge */}
          {(item.type || recurrenceType) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.md }}>
              {item.type && (
                <Tag
                  label={formatTagLabel(item.type)}
                  color={categoryColor}
                />
              )}
              {recurrenceType && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: Spacing.xs,
                    backgroundColor: Colors.category.teal.bg,
                    paddingHorizontal: Spacing.sm,
                    paddingVertical: 4,
                    borderRadius: BorderRadius.pill,
                  }}
                >
                  <Repeat2 size={12} color={Colors.category.teal.text} strokeWidth={2} />
                  <Text style={[Typography.badge, { color: Colors.category.teal.text }]}>
                    {recurrenceType === "weekly" ? "Weekly" : "Daily"}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Title: 16px / 500 */}
          <Text style={[Typography.cardTitle, { color: Colors.textPrimary, marginBottom: Spacing.sm }]}>
            {item.title}
          </Text>

          {/* Org name: 13px / 400 */}
          <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
            {item.charities?.name || "Unknown Charity"}
          </Text>

          {/* Date and Time (series cards show "Next: <date>" since this
              row represents the next upcoming occurrence, not a one-off) */}
          {item.starts_at && (
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center", marginBottom: Spacing.md }}>
              <Clock size={14} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                {item.series_id ? `Next: ${formatNextOccurrenceLabel(item.starts_at)}` : `${date} at ${time}`}
              </Text>
            </View>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: Colors.border, marginBottom: Spacing.md }} />

          {/* Footer row: location + spots */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", gap: Spacing.sm, alignItems: "center" }}>
              <MapPin size={14} color={Colors.textTertiary} strokeWidth={1.5} />
              <Text style={[Typography.meta, { color: Colors.textSecondary }]}>
                {item.location}
              </Text>
            </View>

            <Text
              style={[
                Typography.badge,
                {
                  color:
                    spotStatusColor === "amber"
                      ? Colors.category.amber.text
                      : Colors.primary,
                },
              ]}
            >
              {item.featured && volunteersCount >= target
                ? `+${volunteersCount - target} extra`
                : `${spotsLeft} of ${target} left`}
            </Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  const renderLoadingSkeleton = () => (
    <View style={{ gap: Layout.cardGap }}>
      {[1, 2, 3].map((i) => (
        <Card key={i} padding="md">
          <View
            style={{
              height: 16,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.sm,
              marginBottom: Spacing.md,
            }}
          />
          <View
            style={{
              height: 20,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.sm,
              marginBottom: Spacing.md,
            }}
          />
          <View
            style={{
              height: 12,
              backgroundColor: Colors.surfaceMuted,
              borderRadius: BorderRadius.sm,
              width: "60%",
            }}
          />
        </Card>
      ))}
    </View>
  );

  const renderEmptyState = () => (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: Spacing.xl,
      }}
    >
      <Text style={[Typography.screenTitle, { color: Colors.textPrimary, marginBottom: Spacing.md }]}>
        No opportunities found
      </Text>
      <Text
        style={{
          textAlign: "center",
          ...Typography.body,
          color: Colors.textSecondary,
          marginBottom: Spacing.xl,
        }}
      >
        {searchQuery || selectedFilter !== "all"
          ? "Try adjusting your search or filters"
          : "Check back soon for new volunteer opportunities"}
      </Text>
      {(searchQuery || selectedFilter !== "all") && (
        <Button
          label="Clear Filters"
          onPress={() => {
            setSearchQuery("");
            setSelectedFilter("all");
          }}
          variant="ghost"
        />
      )}
    </View>
  );

  return (
    <Screen scrollable>
      {/* Header: SEVA + Welcome + Avatar */}
      <View style={{ marginBottom: Spacing.lg, marginTop: Spacing.md }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: Spacing.md,
          }}
        >
          <View>
            <Text style={{ fontSize: 28, fontWeight: '600', color: Colors.primary }}>
              SEVA
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '400', color: Colors.textSecondary }}>
              Welcome, {userProfile?.full_name || 'there'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push("/edit-profile-volunteer")}>
            <AvatarDisplay
              avatarUrl={userProfile?.avatar_url}
              fullName={userProfile?.full_name}
              size="sm"
            />
          </TouchableOpacity>
        </View>

        {/* Screen title */}
        <Text style={{ fontSize: 28, fontWeight: '600', color: Colors.textPrimary }}>
          Discover ways to help
        </Text>
      </View>

      {error && (
        <Card padding="md" style={{ marginBottom: Spacing.lg }}>
          <Text style={{ color: Colors.category.coral.text, marginBottom: Spacing.md }}>
            {error}
          </Text>
          <Button label="Retry" onPress={fetchOpportunities} variant="primary" />
        </Card>
      )}

      {!loading && (
        <>
          {/* Search Bar */}
          <View style={{ marginBottom: Layout.sectionGap }}>
            <Input
              placeholder="Search opportunities"
              value={searchQuery}
              onChangeText={setSearchQuery}
              isSearchBar={true}
              icon={true}
            />
          </View>

          {/* Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: Layout.sectionGap }}
            contentContainerStyle={{ gap: Layout.chipGap }}
          >
            {FILTER_OPTIONS.map((filter) => (
              <TouchableOpacity
                key={filter.value}
                onPress={() => setSelectedFilter(filter.value)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: BorderRadius.pill,
                  backgroundColor:
                    selectedFilter === filter.value
                      ? Colors.primary
                      : Colors.surfaceMuted,
                }}
              >
                <Text
                  style={[
                    Typography.chip,
                    {
                      color:
                        selectedFilter === filter.value
                          ? Colors.cardBg
                          : Colors.textSecondary,
                      fontWeight: selectedFilter === filter.value ? "500" : "400",
                    },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Opportunities List */}
      {loading ? (
        renderLoadingSkeleton()
      ) : featuredOpportunities.length > 0 ||
        regularOpportunities.length > 0 ? (
        <View>
          {/* Featured Opportunities */}
          {featuredOpportunities.length > 0 && (
            <View style={{ marginBottom: Spacing.xl }}>
              <Text style={[Typography.body, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
                This week's big one
              </Text>
              {featuredOpportunities.map((opp) => renderFeaturedCard(opp))}
            </View>
          )}

          {/* Regular Opportunities */}
          {regularOpportunities.length > 0 && (
            <View>
              <FlatList
                data={regularOpportunities}
                renderItem={renderOpportunityCard}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={{
                  gap: Layout.cardGap,
                  paddingBottom: Spacing.xl,
                }}
              />
            </View>
          )}
        </View>
      ) : (
        renderEmptyState()
      )}

      {dateSheetSeries && (
        <DateSelectionSheet
          visible={!!dateSheetSeries}
          seriesId={dateSheetSeries.id}
          seriesTitle={dateSheetSeries.title}
          onClose={() => setDateSheetSeries(null)}
          onSelectOccurrence={(occurrenceId) => {
            setDateSheetSeries(null);
            router.push(`/opportunity/${occurrenceId}`);
          }}
        />
      )}
    </Screen>
  );
}
