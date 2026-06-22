# Opportunities Data Flow

## Overview

The home screen fetches opportunities from the Supabase `opportunities` table and displays them in a scrollable list with loading and empty states.

## The Query

```typescript
const { data, error } = await supabase
  .from('opportunities')
  .select('id, title, location, description')
  .order('created_at', { ascending: false });
```

### What it does:

1. **`.from('opportunities')`** — Targets the `opportunities` table in your Supabase database
2. **`.select('id, title, location, description')`** — Fetches only these 4 columns (not the entire row)
3. **`.order('created_at', { ascending: false })`** — Sorts by creation date, newest first

### Response:

```typescript
{
  data: [
    {
      id: "123",
      title: "Volunteer Coordinator",
      location: "New York, NY",
      description: "Help organize community events..."
    },
    // ... more opportunities
  ],
  error: null // or an error object if something failed
}
```

## Data Flow

```
User opens home screen
           ↓
useEffect hook runs (on mount)
           ↓
fetchOpportunities() called
           ↓
setLoading(true) — shows spinner
           ↓
supabase.from('opportunities').select(...) executes
           ↓
Request sent to Supabase servers
           ↓
Supabase queries the opportunities table
           ↓
Rows returned as JSON
           ↓
Response arrives at app
           ↓
setOpportunities(data) — stores results in state
           ↓
setLoading(false) — hides spinner
           ↓
FlatList re-renders with opportunities
           ↓
User sees list of opportunities
```

## State Management

The component uses three state variables:

```typescript
const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
```

- **`opportunities`** — Stores the fetched rows from Supabase
- **`loading`** — `true` while fetching, `false` when done (shows/hides spinner)
- **`error`** — Null if successful, or an error message if the query failed

## Rendering Logic

### Loading State
While `loading === true`:
```typescript
<ActivityIndicator size="large" color="#007AFF" />
<ThemedText>Loading opportunities...</ThemedText>
```

### Success State
When data loads, `FlatList` renders each opportunity:
```typescript
<FlatList
  data={opportunities}  // Array of opportunities
  renderItem={({ item }) => (
    <ThemedView style={styles.opportunityCard}>
      <ThemedText>{item.title}</ThemedText>
      <ThemedText>📍 {item.location}</ThemedText>
      <ThemedText>{item.description}</ThemedText>
    </ThemedView>
  )}
  keyExtractor={(item) => item.id}  // Uses id as unique key
/>
```

### Empty State
If `opportunities.length === 0` and not loading:
```typescript
<ThemedText>No Opportunities Yet</ThemedText>
<ThemedText>Check back later...</ThemedText>
```

### Error State
If the query fails:
```typescript
<View style={styles.errorContainer}>
  <ThemedText>{error}</ThemedText>
  <TouchableOpacity onPress={fetchOpportunities}>
    <ThemedText>Retry</ThemedText>
  </TouchableOpacity>
</View>
```

## What You Need in Supabase

Your `opportunities` table should have these columns:

```sql
CREATE TABLE opportunities (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## How to Add Opportunities

In the Supabase dashboard, go to **Table Editor** and insert rows manually, or use the API:

```typescript
await supabase.from('opportunities').insert([
  {
    title: 'Volunteer Coordinator',
    location: 'New York, NY',
    description: 'Help organize community events and manage volunteers.',
  },
]);
```

## Performance Notes

- **Minimal columns** — We only select what's needed (id, title, location, description), not entire rows
- **Sorted by date** — Newest opportunities appear first
- **One query** — Single `select()` call instead of multiple queries
- **Lazy loading** — Could add `.limit(10)` to fetch pages instead of all rows for large datasets

## Next Steps

1. Create the `opportunities` table in Supabase
2. Add a few test rows
3. Open the app and see them appear on the home screen
4. Add pagination: `.range(0, 9)` for first 10, then `.range(10, 19)` for next 10
5. Add filtering: `.eq('location', 'New York, NY')` to filter by location
6. Add search: `.ilike('title', '%keyword%')` to search titles
