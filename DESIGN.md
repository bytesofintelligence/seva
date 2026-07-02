# SEVA — Design System Specification

This document is the single source of truth for how SEVA looks. Restyle every
screen and component to match these exact values. Do not invent new colours,
radii, or spacing outside this spec. Where the app already has a `theme.ts` and
`components/ui/`, update those tokens and components to these values rather than
creating parallel ones.

The goal: a warm, calm, trustworthy look built on one confident teal, generous
whitespace, soft rounded corners, hairline borders (not heavy shadows), and only
two font weights. Colour is used sparingly and always means something (a
category, a status), never decoration.

---

## 1. Colour tokens

Define these in the theme and reference them everywhere. Never hardcode a hex in
a screen; always go through the token.

### Brand
| Token | Hex | Use |
|---|---|---|
| `primary` | `#0F6E56` | Brand teal. Primary buttons, active tab, links, ring fill, key numbers |
| `primaryTintBg` | `#E1F5EE` | Soft teal fill behind avatars, teal icon badges |

### Neutrals (warm, not cold grey)
| Token | Hex | Use |
|---|---|---|
| `textPrimary` | `#2C2C2A` | Titles, main text (warm near-black) |
| `textSecondary` | `#5F5E5A` | Subtitles, descriptions, meta labels |
| `textTertiary` | `#888780` | Hints, placeholder text, inactive icons |
| `pageBg` | `#F5F3EE` | App screen background (warm off-white) |
| `cardBg` | `#FFFFFF` | Cards and raised surfaces |
| `surfaceMuted` | `#F1EFE8` | Search bar fill, stat cells, unselected chips |
| `border` | `#E7E5DD` | Hairline borders on cards and dividers (1px) |
| `ringTrack` | `#E0DED5` | Unfilled portion of the progress ring |

### Category / accent colours
Each is a pair: a light fill background and a dark text/icon colour from the same
family. Text on a coloured fill always uses the dark member of its own pair,
never black or grey.

| Category | Fill (bg) | Text/Icon |
|---|---|---|
| Teal (Support, positive) | `#E1F5EE` | `#0F6E56` |
| Coral (Delivery, Flagship, Volunteer) | `#FAECE7` | `#993C1D` (icon may use `#D85A30`) |
| Amber (Empower, "nearly full") | `#FAEEDA` | `#BA7517` |
| Blue (On-site) | `#E6F1FB` | `#0C447C` |
| Purple (Remote, Act) | `#EEEDFE` | `#534AB7` |

### Status text colours (for "spots left" and badges)
- Plenty of room → `primary` teal `#0F6E56`.
- Nearly full (few spots remaining) → amber `#BA7517`.
- Threshold: treat "nearly full" as 2 or fewer spots remaining, or under 25% of
  total remaining, whichever you prefer, applied consistently.

---

## 2. Typography

Font family: **Inter** everywhere (already loaded via `expo-font`).

Use **only two weights**: Regular (400) and Medium (500). Body text is 400;
every title, label, button, and number is 500. (You may use SemiBold 600 for the
`SEVA` wordmark alone if you want more presence, but default to 500 to match the
mockups.)

| Role | Size | Weight | Colour |
|---|---|---|---|
| SEVA wordmark | 34px | 500 | `textPrimary`, letter-spacing 3px |
| Devanagari सेवा | 22px | 500 | `primary` |
| Screen title (e.g. "Discover ways to help") | 22px | 500 | `textPrimary` |
| Card title (opportunity) | 16px | 500 | `textPrimary` |
| Hero card title | 18px | 500 | `textPrimary` |
| Body / org name / subtitle | 13px | 400 | `textSecondary` |
| Greeting ("Good morning") | 13px | 400 | `textSecondary` |
| Tag / badge text | 11px | 500 | its pair's text colour |
| Filter chip text | 13px | 400/500 | see chips |
| Meta (distance, "2h") | 12px | 400 | `textSecondary` / `textTertiary` |
| Button label | 15px | 500 | white or teal |
| Ring centre number | 30px | 500 | `textPrimary` |
| Ring centre caption ("of 25 target") | 12px | 400 | `textSecondary` |
| Stat cell number | 20px | 500 | `textPrimary` (or teal for "to target") |
| Stat cell label | 11px | 400 | `textSecondary` |
| Pillar word | 15px | 500 | `textPrimary`, first letter in accent |
| Pillar description | 12px | 400 | `textSecondary` |

Casing: sentence case everywhere ("Discover ways to help", not Title Case). The
only uppercase is the `SEVA` wordmark and short category words inside tags if
desired. Never all-caps a sentence.

---

## 3. Spacing, radius, elevation

### Radius
| Element | Radius |
|---|---|
| Buttons | 14px |
| Opportunity / hero cards | 18px |
| Large dashboard panels | 20px |
| Phone-screen container feel | keep generous top padding, no need to round the screen itself |
| Logo mark (rounded square) | 18px |
| Pillar icon badges (rounded square) | 12px |
| Search bar | 12px |
| Stat cells | 10px |
| Tags, chips, "spots" pills | 999px (fully rounded) |
| Avatar | 50% (circle) |

### Spacing
- Screen horizontal padding: 20px.
- Card internal padding: 14px (16px for the hero card and dashboard panel).
- Gap between stacked cards: 12px.
- Gap between major sections (title → search → chips): 12–16px.
- Gap between pillar rows: 16px.

### Elevation
No drop shadows on cards. Depth comes from the 1px `border` hairline plus the
contrast between `cardBg` white and `pageBg` off-white. Keep it flat and clean.
The only shadow permitted is a focus ring on inputs.

---

## 4. Icons (important)

The mockups show empty squares as placeholders. In the app, render real icons
using **lucide-react-native**. Icon colour follows context: inactive/meta icons
use `textTertiary`; active or branded icons use `primary` or the element's
accent colour.

| Location | Icon | Colour |
|---|---|---|
| Logo mark | `HeartHandshake` | white on teal fill |
| Support pillar | `HeartHandshake` | teal `#0F6E56` |
| Empower pillar | `Zap` | amber `#BA7517` |
| Volunteer pillar | `Users` | coral `#D85A30` |
| Act pillar | `Rocket` | purple `#534AB7` |
| Search bar | `Search` | `textTertiary` |
| Duration ("2h") | `Clock` | `textTertiary` |
| Location / distance | `MapPin` | `textTertiary` |
| Tab bar | `Home`, `Search`, `Calendar`, `User` | active teal, inactive `textTertiary` |

Icon sizes: 20–22px inline in tab bar and cards; 21px in pillar badges (inside a
42px badge); 32px in the 60px logo mark. Never below 14px.

---

## 5. Components

### Primary button
Full-width. `primary` teal fill, white label (15px/500), radius 14px, ~15px
vertical padding, text centred. Pressed state: scale to ~0.98 and/or slight
opacity drop. This is "Get started", "Count me in", "Apply to help".

### Text link button
Transparent. Surrounding text in `textSecondary`; the action word in `primary`
teal at 500 (e.g. "Already have an account? **Sign in**").

### Filter chips (row)
Horizontal, 8px gap, each fully rounded (999px), padding 7px 14px, 13px label.
- Selected: `primary` teal fill, white label (500).
- Unselected: `surfaceMuted` fill, `textSecondary` label (400).

### Search bar
`surfaceMuted` fill, radius 12px, padding ~9px 12px, a `Search` icon in
`textTertiary` followed by placeholder text in `textTertiary` at 14px. No border.

### Category tag / badge
Small rounded pill (999px), padding ~4px 10px, 11px/500 label. Fill + text from
the matching category pair in section 1. Examples: Delivery = coral pair,
On-site = blue pair, Flagship event = coral pair.

### Avatar (header, top-right)
34px circle, `primaryTintBg` fill, user initials in `primary` teal at 13px/500.
If the user has a photo, show the photo instead; initials are the fallback.

### Opportunity card (standard)
- White `cardBg`, 1px `border`, radius 18px, padding 14px.
- Top row: category tag on the left; duration meta on the right (`Clock` icon +
  "2h" in `textTertiary`, 12px).
- Title: 16px/500 `textPrimary`.
- Subtitle: organisation name, 13px/400 `textSecondary`, ~12px below title.
- A 1px hairline divider, then a footer row:
  - Left: `MapPin` + distance, 12px `textSecondary`.
  - Right: "X of Y spots left", 12px/500, in teal normally or amber when nearly
    full (section 1 threshold).

### Hero / flagship card (top of browse)
Sits under a small section label "This week's big one" (13px/500
`textSecondary`). Visually louder than standard cards:
- Slightly larger padding (16px), title at 18px/500.
- A "Flagship event" coral tag at the top.
- Date, time, and location shown clearly in a meta row.
- A live line: "X volunteers signed up" pulled from the counts view.
- A full-width primary "Count me in" button inside the card.
- To set it apart, give it either a 2px teal border or a very subtle teal-tinted
  background (`#F3FAF7`); pick one, not both, and keep it tasteful.

### Progress ring (charity dashboard)
- SVG circle via react-native-svg. Track stroke `ringTrack`, progress stroke
  `primary` teal, stroke width ~11, rounded line cap, starts at 12 o'clock
  (rotate the progress circle -90°).
- Centre: big number (30px/500 `textPrimary`) with caption below ("of 25
  target", 12px `textSecondary`).
- When the count reaches or exceeds target: fill the ring fully and switch the
  centre caption to a positive "target reached · +N extra" message using the
  teal/positive colour, never a "full" or negative-remaining message.

### Stat cells (row under the ring)
Three equal cells, 8px gap. Each: `surfaceMuted` fill, radius 10px, padding 10px,
centred, with a number (20px/500) above a label (11px `textSecondary`). The
"to target" cell's number uses `primary` teal. Below the row, a single muted line
(12px `textTertiary`): "Sign-ups stay open past 25 to cover no-shows".

### Pillar row (welcome screen)
A 42px rounded-square badge (radius 12px) in the pillar's light fill, holding its
21px icon in the pillar's accent colour, followed by a text block: the word
(15px/500, its first letter coloured in the accent to spell S-E-V-A) above a
short description (12px `textSecondary`). Rows stacked with 16px gaps.

### Tab bar (bottom)
Hairline top border (`border`). Four icons evenly spaced, ~22px each. Active tab
in `primary` teal, the rest in `textTertiary`. Vertical padding ~12px.

---

## 6. Screen recipes

### Welcome (pre-auth entry)
Centred column: 60px teal logo mark (radius 18px, white `HeartHandshake`) →
`SEVA` wordmark → `सेवा` in teal → "selfless service" in `textTertiary` → four
pillar rows (Support/Empower/Volunteer/Act) → full-width "Get started" primary
button → "Already have an account? Sign in" text link. Generous top padding
(~35px), 20px sides.

### Volunteer browse (home)
Header: "Good morning" greeting (left) and the avatar (top-right) on one row,
then the "Discover ways to help" title beneath. Then the search bar, then the
filter chips (All / Delivery / On-site / Remote), then — if a featured event
exists — the "This week's big one" hero card, then the standard opportunity
cards in a 12px-gap stack. Page uses `pageBg`.

### Charity dashboard (flagship panel)
The dashboard panel described in section 5: "Flagship event" tag and "This
Friday" on the top row, event title, a meta row with time and location, the
centred progress ring, the three stat cells, and the muted no-shows line. White
panel, radius 20px, 1px border, on `pageBg`.

---

## 7. Dark mode

The mockups define the **light** theme. Provide a dark theme using the same hues
with inverted neutrals, so nothing hardcodes a light-only colour:

| Token | Dark value |
|---|---|
| `pageBg` | `#1A1917` (warm near-black) |
| `cardBg` | `#242320` |
| `surfaceMuted` | `#2C2B27` |
| `border` | `rgba(255,255,255,0.10)` |
| `textPrimary` | `#EDEBE4` |
| `textSecondary` | `#B4B2A9` |
| `textTertiary` | `#888780` |
| `primary` (accents/text on dark) | brighten to `#1D9E75` for legibility |
| `primary` (button fill) | keep `#0F6E56` with white label |

Category fills on dark: use the dark member of each pair as the fill at low
opacity and the light member as the text, or simply keep the same tags on
`cardBg`. The test: on a near-black background, is every piece of text still
clearly readable? If not, lift it.

---

## 8. How to apply this

1. Update `theme.ts` so its tokens exactly match sections 1–3.
2. Update each base component in `components/ui/` (Button, Card, Tag, Input,
   Screen) to the section 5 specs.
3. Restyle the welcome, browse, and charity dashboard screens to the section 6
   recipes.
4. Replace every placeholder icon with the lucide-react-native icon named in
   section 4.
5. Verify against the mockups in both light and dark mode on a real device.

Do not add gradients, drop shadows, extra colours, or heavier font weights. When
in doubt, choose less: more whitespace, fewer colours, one teal.
