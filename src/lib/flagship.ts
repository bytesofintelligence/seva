import { supabase } from '@/lib/supabase';

/**
 * A charity may have only one Flagship event at a time — it's what drives
 * the coordinator's dashboard hero card and the volunteer app's pinned,
 * always-visible card. Call this before saving a row with featured=true so
 * the previous flagship (standalone opportunity or series template, plus any
 * occurrences already generated from it) is auto-demoted to Regular instead
 * of ending up with two.
 */
export async function clearOtherFlagships(
  charityId: string,
  exclude: { opportunityId?: string; seriesId?: string } = {}
): Promise<void> {
  let oppQuery = supabase
    .from('opportunities')
    .update({ featured: false })
    .eq('charity_id', charityId)
    .eq('featured', true);
  if (exclude.opportunityId) {
    oppQuery = oppQuery.neq('id', exclude.opportunityId);
  }
  const { error: oppError } = await oppQuery;
  if (oppError) throw oppError;

  const { data: seriesRows, error: seriesFetchError } = await supabase
    .from('opportunity_series')
    .select('id, template')
    .eq('charity_id', charityId);
  if (seriesFetchError) throw seriesFetchError;

  for (const series of seriesRows || []) {
    if (exclude.seriesId && series.id === exclude.seriesId) continue;
    if (!series.template?.featured) continue;

    const { error: seriesUpdateError } = await supabase
      .from('opportunity_series')
      .update({ template: { ...series.template, featured: false } })
      .eq('id', series.id);
    if (seriesUpdateError) throw seriesUpdateError;
  }
}
