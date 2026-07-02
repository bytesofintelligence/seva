# Schedule Tab: Join Queries & Data Grouping

## The Join Query

The Schedule tab fetches applications with their related opportunity details using a **nested select** (join):

```typescript
const { data } = await supabase
  .from('applications')
  .select(`
    id,
    status,
    applied_at,
    opportunities(
      id,
      title,
      starts_at,
      charities(name)
    )
  `)
  .eq('volunteer_id', session.user.id)
  .order('applied_at', { ascending: false });
```

### What This Query Does

**Step by step:**

1. **FROM applications**: Start with the applications table
   - This is data the volunteer submitted

2. **SELECT with nested joins**: Get specific fields
   - `id`: Application ID
   - `status`: Whether it's "pending", "approved", etc.
   - `applied_at`: When they applied
   - `opportunities(...)`: Join to the opportunities table
     - `id`: Opportunity ID
     - `title`: Opportunity name
     - `starts_at`: When the opportunity happens
     - `charities(name)`: Further join to charities table to get the charity name

3. **eq('volunteer_id', session.user.id)**: Filter to only this volunteer's applications
   - This also respects RLS—the database won't return applications for other volunteers

4. **order('applied_at', { ascending: false })**: Most recent first

### Example Result

If you fetched the data, you'd get:

```json
[
  {
    "id": "app-123",
    "status": "approved",
    "applied_at": "2026-06-15T10:30:00Z",
    "opportunities": {
      "id": "opp-456",
      "title": "Paint the Park",
      "starts_at": "2026-07-15T09:00:00Z",
      "charities": {
        "name": "Green City Foundation"
      }
    }
  },
  {
    "id": "app-789",
    "status": "pending",
    "applied_at": "2026-07-01T14:20:00Z",
    "opportunities": {
      "id": "opp-101",
      "title": "Build a Garden",
      "starts_at": "2026-07-20T10:00:00Z",
      "charities": {
        "name": "Urban Roots"
      }
    }
  }
]
```

Notice:
- **Nested structure**: `applications` → `opportunities` → `charities` (shows the join hierarchy)
- **Only this volunteer's apps**: Filter ensures `volunteer_id` matches `auth.uid()`
- **All needed data**: Title, charity name, date—all in one query

## Database Relationships

```
applications table
├── id (unique)
├── volunteer_id → profiles.id
├── opportunity_id → opportunities.id
├── status
└── applied_at

opportunities table
├── id (unique)
├── charity_id → charities.id
├── title
├── starts_at
└── ...

charities table
├── id (unique)
├── name
└── ...
```

The query traverses: **applications → opportunities → charities**

## Client-Side Grouping

Once the data arrives in the app, we group it into **Upcoming** and **Past**:

```typescript
const UPCOMING_STATUSES = ['pending', 'approved', 'in_progress'];
const PAST_STATUSES = ['completed', 'rejected', 'cancelled'];

const groupedApplications = useMemo(() => {
  const upcoming = allApplications.filter((app) =>
    UPCOMING_STATUSES.includes(app.status)
  );
  const past = allApplications.filter((app) =>
    PAST_STATUSES.includes(app.status)
  );

  return [
    { title: 'Upcoming', data: upcoming },
    { title: 'Past', data: past }
  ];
}, [allApplications]);
```

**Why client-side grouping?**
- Simpler than complex SQL GROUP BY
- Easy to toggle between tabs
- RLS already filtered to this volunteer
- Data is already in memory

### Status Categories

| Category | Statuses | Meaning |
|----------|----------|---------|
| **Upcoming** | pending | Waiting for charity to review |
| | approved | Charity accepted you |
| | in_progress | You're currently volunteering |
| **Past** | completed | Volunteer work is done |
| | rejected | Charity declined you |
| | cancelled | Opportunity or application cancelled |

### Tab Switching

```typescript
const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

const filteredGroups = useMemo(() => {
  if (activeTab === 'upcoming') {
    return groupedApplications.filter((g) => g.title === 'Upcoming');
  }
  return groupedApplications.filter((g) => g.title === 'Past');
}, [groupedApplications, activeTab]);
```

When you tap the "Past" tab, it re-filters the grouped data to show only past applications.

## Date Formatting

The schedule shows smart date labels:

```typescript
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'Date TBD';
  
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date === today) return 'Today';
  if (date === tomorrow) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
```

Examples:
- `starts_at: "2026-07-01T09:00:00Z"` (if today is July 1) → "Today"
- `starts_at: "2026-07-02T09:00:00Z"` (if today is July 1) → "Tomorrow"
- `starts_at: "2026-08-15T09:00:00Z"` (if today is July 1) → "Aug 15"

## Status Badges

Each application shows a colored status badge:

```typescript
const STATUS_COLORS = {
  pending: { bg: '#DBEAFE', text: '#0284C7' },      // Blue
  approved: { bg: '#DCFCE7', text: '#16A34A' },    // Green
  in_progress: { bg: '#FEF3C7', text: '#D97706' },  // Amber
  completed: { bg: '#DCFCE7', text: '#16A34A' },   // Green
  rejected: { bg: '#FEE2E2', text: '#DC2626' },    // Red
  cancelled: { bg: '#F3F4F6', text: '#6B7280' },   // Gray
};
```

The background color is a soft tint, text is bold. Makes status instantly recognizable.

## Performance Notes

1. **RLS Filtering**: Database only returns this volunteer's data
   - Can't accidentally see other volunteers' applications

2. **Nested Select**: One query gets everything
   - No N+1 problem (asking for each opportunity separately)
   - Single request to Supabase

3. **Client-Side Grouping**: Fast and simple
   - Data is already in memory
   - No re-fetch needed when switching tabs

4. **useMemo**: Grouping only re-runs if data changes
   - Switching tabs doesn't re-filter (cached)
   - Only re-filters when new applications arrive

## Example Flow

```
User opens Schedule tab
  ↓
fetchApplications() runs:
  SELECT * FROM applications
  JOIN opportunities ON ...
  JOIN charities ON ...
  WHERE volunteer_id = auth.uid()
  ORDER BY applied_at DESC
  ↓
Data arrives: [
  { status: 'approved', opportunities: {...} },
  { status: 'pending', opportunities: {...} },
  { status: 'completed', opportunities: {...} }
]
  ↓
useMemo groups into:
  Upcoming: [approved, pending]
  Past: [completed]
  ↓
User sees "Upcoming" tab with 2 applications
User taps "Past" tab → shows 1 application
User sees other volunteer's data? → RLS prevents it
```

## RLS + Queries

The `.eq('volunteer_id', session.user.id)` is redundant with RLS **but good practice**:

```typescript
// Frontend filter:
.eq('volunteer_id', session.user.id)  // ← App-level safety

// Database RLS policy:
WHERE volunteer_id = auth.uid()        // ← Database-level safety
```

Even if an attacker removed the `.eq()` call, RLS would still block them from seeing other volunteers' data. Defense in depth.
