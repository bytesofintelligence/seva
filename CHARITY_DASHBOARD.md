# Charity Dashboard: Managing Opportunities

## Overview

The charity dashboard lets a charity manage their posted opportunities and see how many applications they've received. The key mechanism is the **foreign key relationship** between opportunities and charities.

## Data Model: The Connection

### Database Schema

```
charities table
├── id (UUID, PK)
├── owner_id (UUID, FK) → profiles(id)
├── name TEXT
└── ...

opportunities table
├── id (UUID, PK)
├── charity_id (UUID, FK) → charities(id) ← KEY LINK
├── title TEXT
├── type TEXT
├── location TEXT
├── spots_total INT
├── spots_filled INT
├── status TEXT
└── ...

applications table
├── id (UUID, PK)
├── volunteer_id (UUID, FK) → profiles(id)
├── opportunity_id (UUID, FK) → opportunities(id)
└── ...
```

### The Link: charity_id

When a charity posts an opportunity, the insert includes:

```typescript
supabase.from('opportunities').insert({
  charity_id: charityId,        // ← Links to charities.id
  title: 'Paint the Park',
  location: 'Central Park',
  type: 'On-site',
  spots_total: 5,
  ...
})
```

This `charity_id` field:
- References the charity's `id` in the charities table
- Is enforced by a **foreign key constraint** in the database
- Can't be null or point to a non-existent charity
- Is used to fetch only THIS charity's opportunities

## Dashboard Fetching

### Fetching the Charity

```typescript
const { data: charityData } = await supabase
  .from('charities')
  .select('*')
  .eq('owner_id', session.user.id)  // Only this user's charity
  .single();
```

**Result**: One charity row with id, name, description, address, verified status.

### Fetching Opportunities

```typescript
const { data: oppsData } = await supabase
  .from('opportunities')
  .select('id, title, status, type, location, created_at')
  .eq('charity_id', charityData.id)  // ← Uses the charity_id from above
  .order('created_at', { ascending: false });
```

**How it works:**
1. Query opportunities table
2. Filter: `WHERE charity_id = <this-charity-id>`
3. Only returns opportunities posted by THIS charity
4. Other charities can't see these opportunities in this query (though volunteers can see them on browse screen)

### Counting Applications

For each opportunity, count how many applications it received:

```typescript
const { count } = await supabase
  .from('applications')
  .select('id', { count: 'exact', head: true })
  .eq('opportunity_id', opp.id);  // ← Count for THIS opportunity
```

**Chain of data:**
```
opportunity (with id = opp.id)
  → applications (WHERE opportunity_id = opp.id)
    → count = number of applications
```

## Posting an Opportunity

### The Form (PostOpportunityModal)

Collects:
- **Title** (required): e.g., "Paint the Community Park"
- **Description**: Details about the work
- **Type** (required): Delivery, On-site, Remote, or Hybrid
- **Location** (required): Where the work happens
- **Date & Time**: When the opportunity starts
- **Number of Spots** (required): How many volunteers needed

### The Insert

```typescript
const { error: insertError } = await supabase
  .from('opportunities')
  .insert({
    charity_id: charityId,        // ← Connects to THIS charity
    title: title.trim(),
    description: description.trim() || null,
    type: type.toLowerCase(),     // 'on-site', 'delivery', 'remote'
    location: location.trim(),
    starts_at: startsAt.toISOString(),
    spots_total: spotsNum,
    spots_filled: 0,              // Starts at 0
    status: 'active',             // Ready for volunteers to apply
  });
```

**Key details:**
- `charity_id: charityId` ensures the opportunity belongs to THIS charity
- `spots_filled: 0` means no one has applied yet
- `status: 'active'` makes it visible to volunteers
- `starts_at` is stored as ISO string (timezone-aware)

### Why It Works

Because the insert includes `charity_id`, the opportunity is **permanently linked** to the charity:
- Volunteers can see it when they browse
- Applications go to this opportunity
- The charity can see it in their dashboard
- If the charity is deleted, the opportunity is deleted (via CASCADE)

## Dashboard Stats

The dashboard shows live stats calculated from the data:

```typescript
// Count active opportunities
opportunities.filter((o) => o.status === 'active').length

// Sum all applications across all opportunities
opportunities.reduce((sum, o) => sum + o._applicationCount, 0)
```

These update in real-time as:
- New opportunities are posted
- Volunteers apply (application count goes up)
- Opportunity status changes (active → filled → closed)

## User Journey

```
Charity logs in
  ↓
Root layout detects: role='charity' AND charities exist
  ↓
Navigate to /charity-dashboard
  ↓
Dashboard loads:
  1. Fetch charity WHERE owner_id = auth.uid()
  2. Fetch opportunities WHERE charity_id = <charity-id>
  3. For each opportunity, count applications
  ↓
Display:
  - Charity info
  - Stats (active opps, total apps)
  - List of opportunities with app counts
  ↓
Charity taps "Post an Opportunity"
  ↓
Modal form opens
  ↓
Charity fills in details
  ↓
Submit → Insert into opportunities with charity_id = <this-charity-id>
  ↓
Success → Refetch opportunities list
  ↓
Dashboard updates: new opportunity appears
```

## Security: RLS on Charities

Remember the RLS policy:

```sql
CREATE POLICY charities_update ON charities
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

A user can only see/update charities where `owner_id = their ID`. So:
- Charity A can't see Charity B's dashboard
- Charity A can't edit Charity B's info
- The app only shows the charity they own

## Example Data Flow

### Setup

1. User signs up as "charity"
2. Creates charity: `{ owner_id: 'user-123', name: 'Green City' }`
3. Charity row created with `id = 'charity-456'`

### Posting Opportunity

1. Charity posts opportunity
2. Insert: `{ charity_id: 'charity-456', title: 'Paint Park', ... }`
3. Opportunity row created with `id = 'opp-789'`

### Volunteer Applies

1. Volunteer browses opportunities
2. Sees "Paint Park" (opp-789)
3. Clicks "Apply to help"
4. Submits application: `{ opportunity_id: 'opp-789', volunteer_id: 'vol-111', ... }`

### Dashboard Updates

1. Charity opens dashboard
2. Query: opportunities WHERE charity_id = 'charity-456'
3. Result: [{ id: 'opp-789', title: 'Paint Park', ... }]
4. Query applications: WHERE opportunity_id = 'opp-789'
5. Result: [{ id: 'app-222', volunteer_id: 'vol-111', ... }]
6. Dashboard shows: "Paint Park" with "1 application"

### If Volunteer Gets Accepted

1. Charity approves application (updates applications.status = 'approved')
2. System updates opportunity (increments spots_filled, or updates status)
3. Dashboard refreshes
4. Shows updated stats

## Cascading Deletes

```sql
ALTER TABLE opportunities 
  ADD FOREIGN KEY (charity_id) 
  REFERENCES charities(id) ON DELETE CASCADE;
```

If a charity is deleted:
- All their opportunities are deleted
- All applications to those opportunities are deleted (chain)
- Data is cleaned up automatically

Similarly:
```sql
ALTER TABLE charities 
  ADD FOREIGN KEY (owner_id) 
  REFERENCES profiles(id) ON DELETE CASCADE;
```

If a profile is deleted:
- Their charity is deleted
- All opportunities are deleted
- All applications are deleted

## Reusing Design System

The dashboard uses:
- `<Screen>` for safe-area wrapper
- `<Card>` for charity info, stats, opportunities
- `<Button>` for post, sign out, etc.
- `<Input>` for form fields in the modal
- `<Tag>` for opportunity type badges
- Design tokens (Colors, Spacing) for consistency

Everything is styled with the same palette and spacing scale.
