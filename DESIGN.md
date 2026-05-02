# Design System Inspired by OpenMonetis

## 1. Visual Theme & Atmosphere

OpenMonetis embodies a warm, approachable financial management aesthetic grounded in trust and transparency. The design system combines a rich warm-orange accent palette with a sophisticated warm-neutral foundation, creating an interface that feels both professional and inviting. The typography and spacing work together to emphasize clarity and hierarchy, supporting the open-source ethos of personal financial control. The visual atmosphere prioritizes legibility and calm navigation, with generous whitespace and deliberate color restraint—the bold orange is reserved for critical calls-to-action and highlights, while the warm grays and blacks anchor the interface with stability and focus.

**Key Characteristics**
- Warm, approachable color story with a dominant orange accent (`#FF7733`)
- Generous whitespace and breathing room between sections
- High contrast between backgrounds and text for accessibility
- Clear typographic hierarchy using Inter for all text and UI
- Minimal elevation and shadow treatment—mostly flat design
- Subtle border accents in warm grays to define surfaces
- Open-source transparency reflected in straightforward, honest design language

## 2. Color Palette & Roles

### Primary
- **Primary Accent** (`#FF7733`): Used for primary call-to-action buttons, highlights, and key interactive elements throughout the interface; draws user attention to the most important actions
- **Primary Dark** (`#443732`): Warm-brown anchor color used extensively for text, headings, and interactive elements; provides the primary text color across the system

### Interactive
- **Interactive Neutral** (`#0F0D0C`): Near-black used for primary text and strong emphasis elements; highest contrast state
- **Interactive Overlay** (`#0006`): Transparent black overlay at 24% opacity; used for hover states, modals, and depth layering

### Neutral Scale
- **Neutral 900** (`#2A2827`): Very dark warm gray; used for secondary text and disabled states
- **Neutral 800** (`#322C2A`): Dark warm gray; alternative text color for lower-emphasis content
- **Neutral 700** (`#676260`): Medium warm gray; used for tertiary text, captions, and metadata
- **Neutral 50** (`#FCF7F6`): Almost-white warm cream; primary background color for light surfaces
- **Neutral 100** (`#F8F6F4`): Very light warm gray; secondary background and subtle surface distinction
- **Neutral 200** (`#F5F2EF`): Light warm gray; tertiary background and card interiors
- **Neutral 300** (`#F0EEEC`): Pale warm gray; border and divider lines

### Surface & Borders
- **Surface** (`#FFFFFF`): Pure white; primary card and container background; high-contrast surface
- **Border Light** (`#F0EEEC`): Pale warm gray used for subtle borders between elements
- **Border Dark** (`#2A2827`): Dark warm gray; stronger borders for defined card boundaries

### Semantic / Status
- **Success** (`#0E9D6E`): Green used for positive status indicators, confirmation states, and success messages
- **Warning** (`#F7A439`): Amber used for cautionary states, warnings, and attention-drawing alerts
- **Error** (`#F53F2D`): Red-orange used for error states, destructive actions, and validation failures
- **Error Alt** (`#D40C1A`): Deep red alternative for critical errors and danger states

## 3. Typography Rules

### Font Family
**Primary:** Inter (sans-serif)
Fallback: `Inter, system-ui, -apple-system, sans-serif`

**Monospace:** ui-monospace
Fallback: `ui-monospace, 'Courier New', monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display / H1 | Inter | 60px | 600 | 60px | 0px | Page titles and hero headlines; maximum visual impact |
| Heading H2 | Inter | 36px | 600 | 40px | 0px | Section headers and major subsections |
| Heading H3 | Inter | 16px | 600 | 20px | 0px | Card titles and smaller section headers |
| Body | Inter | 20px | 400 | 28px | 0px | Descriptive text, paragraphs, and long-form content |
| Body Secondary | Inter | 16px | 400 | 24px | 0px | Standard body text, list items, and descriptions |
| Emphasis / Span | Inter | 14px | 500 | 20px | 0px | Emphasized text, labels, and badge content |
| Button | Inter | 14px | 500 | 20px | 0px | All button text; medium weight for clarity |
| Caption | Inter | 14px | 400 | 20px | 0px | Metadata, timestamps, and small supporting text |
| Code | ui-monospace | 14px | 400 | 20px | 0px | Code blocks and technical content |

### Principles
- **Contrast & Clarity:** Text color `#0F0D0C` on light backgrounds; `#FFFFFF` on dark backgrounds
- **Weight Hierarchy:** Use 600 weight for all headings; 500 for interactive/emphasized text; 400 for body
- **Scale Progression:** Sizes increase in meaningful increments (14 → 16 → 20 → 36 → 60); maintain consistent rhythm
- **Line Height:** Body text uses 1.4× line height multiplier for comfortable reading; headings use tighter ratio (1:1) for impact
- **Readability First:** Avoid line lengths over 80 characters for long-form content; increase line height on smaller screens

## 4. Component Stylings

### Buttons

#### Primary Button
- **Background:** `#FF7733`
- **Text Color:** `#FFFFFF`
- **Font Size:** `14px`
- **Font Weight:** `500`
- **Font Family:** `Inter`
- **Padding:** `8px 16px`
- **Border Radius:** `9.2px`
- **Border:** `0px solid transparent`
- **Height:** `40px`
- **Box Shadow:** `none`
- **Hover State:** Darken background to `#E55F1F`; add subtle shadow `0px 2px 8px rgba(0, 0, 0, 0.12)`
- **Active State:** Darken further to `#CC5118`; increase shadow
- **Disabled State:** Background `#E8E3E0`; text color `#999890`; cursor not-allowed

#### Secondary Button
- **Background:** `#FFFFFF`
- **Text Color:** `#2A2827`
- **Font Size:** `14px`
- **Font Weight:** `500`
- **Font Family:** `Inter`
- **Padding:** `8px 24px`
- **Border Radius:** `9.2px`
- **Border:** `1px solid #F0EEEC`
- **Height:** `40px`
- **Box Shadow:** `0px 1px 3px rgba(0, 0, 0, 0.06)`
- **Hover State:** Background `#F8F6F4`; border color `#E8E3E0`
- **Active State:** Background `#F0EEEC`; border color `#D5CCCA`
- **Disabled State:** Background `#FAFAF8`; text color `#BFBAB7`; border color `#F0EEEC`

#### Ghost Button
- **Background:** `transparent`
- **Text Color:** `#443732`
- **Font Size:** `14px`
- **Font Weight:** `500`
- **Font Family:** `Inter`
- **Padding:** `6px 8px`
- **Border Radius:** `9.2px`
- **Border:** `0px solid transparent`
- **Height:** `32px`
- **Box Shadow:** `none`
- **Hover State:** Background `rgba(68, 55, 50, 0.05)`
- **Active State:** Background `rgba(68, 55, 50, 0.1)`
- **Disabled State:** Text color `#BFBAB7`; cursor not-allowed

#### Icon Button
- **Background:** `transparent`
- **Icon Color:** `#443732`
- **Size:** `32px` × `32px`
- **Border Radius:** `9.2px`
- **Border:** `0px solid transparent`
- **Padding:** `0px`
- **Box Shadow:** `none`
- **Hover State:** Background `rgba(68, 55, 50, 0.08)`
- **Active State:** Background `rgba(68, 55, 50, 0.12)`

### Cards & Containers

#### Standard Card
- **Background:** `#FFFFFF`
- **Border:** `1px solid #F0EEEC`
- **Border Radius:** `11.2px`
- **Padding:** `24px`
- **Box Shadow:** `none`
- **Text Color:** `#2A2827`
- **Hover State:** Border color `#E8E3E0`; box-shadow `0px 4px 12px rgba(0, 0, 0, 0.08)`

#### Card with Top Border
- **Background:** `#FFFFFF`
- **Border:** `1px solid #F0EEEC`
- **Border Radius:** `15.2px 15.2px 0px 0px` (top corners only)
- **Padding:** `24px`
- **Box Shadow:** `none`
- **Top Border Color:** `#FF7733` (3px height implied)

#### Surface Container (Header/Nav)
- **Background:** `#FF7733`
- **Height:** `64px`
- **Padding:** `0px 24px`
- **Box Shadow:** `none`
- **Text Color:** `#FFFFFF`
- **Border:** `0px solid transparent`

#### Light Surface
- **Background:** `#F8F6F4`
- **Border:** `0px solid transparent`
- **Border Radius:** `11.2px`
- **Padding:** `16px`
- **Box Shadow:** `none`

### Inputs & Forms

#### Text Input
- **Background:** `#FFFFFF`
- **Border:** `1px solid #F0EEEC`
- **Border Radius:** `9.2px`
- **Padding:** `12px 16px`
- **Font Size:** `16px`
- **Text Color:** `#2A2827`
- **Line Height:** `24px`
- **Placeholder Color:** `#999890`
- **Focus State:** Border color `#FF7733`; box-shadow `0px 0px 0px 3px rgba(255, 119, 51, 0.1)`
- **Error State:** Border color `#F53F2D`; background `#FEF5F3`
- **Disabled State:** Background `#F8F6F4`; text color `#BFBAB7`; border color `#F0EEEC`

#### Select / Dropdown
- **Background:** `#FFFFFF`
- **Border:** `1px solid #F0EEEC`
- **Border Radius:** `9.2px`
- **Padding:** `12px 16px`
- **Font Size:** `16px`
- **Text Color:** `#2A2827`
- **Focus State:** Border color `#FF7733`; outline `0px`
- **Hover State:** Background `#FAFAF8`

#### Checkbox & Radio
- **Size:** `20px` × `20px`
- **Border Radius:** `4px` (checkbox), `50%` (radio)
- **Border:** `2px solid #F0EEEC`
- **Background:** `#FFFFFF`
- **Checked Background:** `#FF7733`
- **Checked Border:** `2px solid #FF7733`
- **Checked Icon Color:** `#FFFFFF`
- **Focus:** Border `2px solid #FF7733`; box-shadow `0px 0px 0px 3px rgba(255, 119, 51, 0.1)`

### Navigation

#### Primary Navigation
- **Background:** `#FF7733`
- **Height:** `64px`
- **Padding:** `0px 48px`
- **Display:** flex; align-items: center; gap `32px`
- **Link Color:** `#FFFFFF`
- **Link Font Size:** `16px`
- **Link Font Weight:** `400`
- **Link Hover:** Opacity `0.8`
- **Link Active:** Text decoration underline; opacity `1.0`

#### Secondary Navigation / Tabs
- **Background:** `transparent`
- **Border Bottom:** `2px solid #F0EEEC`
- **Tab Padding:** `16px 24px`
- **Tab Color:** `#676260`
- **Tab Font Size:** `16px`
- **Tab Hover:** Color `#443732`
- **Tab Active:** Color `#FF7733`; border-bottom color `#FF7733`

#### Breadcrumb Navigation
- **Font Size:** `14px`
- **Color:** `#676260`
- **Separator:** `/` with `0px 8px` margin
- **Link Color:** `#443732`
- **Link Hover:** Color `#FF7733`
- **Current (Active):** Color `#2A2827`; font-weight `500`

### Badges & Status Indicators

#### Badge – Default
- **Background:** `#F8F6F4`
- **Text Color:** `#443732`
- **Padding:** `4px 12px`
- **Border Radius:** `20px`
- **Font Size:** `12px`
- **Font Weight:** `500`
- **Border:** `0px solid transparent`

#### Badge – Success
- **Background:** `#E8F5F0`
- **Text Color:** `#0E9D6E`
- **Padding:** `4px 12px`
- **Border Radius:** `20px`
- **Font Size:** `12px`
- **Font Weight:** `500`

#### Badge – Warning
- **Background:** `#FEF5E8`
- **Text Color:** `#F7A439`
- **Padding:** `4px 12px`
- **Border Radius:** `20px`
- **Font Size:** `12px`
- **Font Weight:** `500`

#### Badge – Error
- **Background:** `#FEF5F3`
- **Text Color:** `#F53F2D`
- **Padding:** `4px 12px`
- **Border Radius:** `20px`
- **Font Size:** `12px`
- **Font Weight:** `500`

## 5. Layout Principles

### Spacing System
- **Base Unit:** `4px`
- **Scale:** `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `56px`, `64px`, `80px`, `96px`, `128px`

**Usage Contexts:**
- **4–8px:** Tight spacing within compact components (icon-text pairs, inline elements)
- **12–16px:** Standard padding inside cards, inputs, and buttons
- **24–32px:** Section gaps, spacing between components on a page
- **48–64px:** Large section separations, hero spacing
- **80–128px:** Hero margins, page-level vertical rhythm

### Grid & Container
- **Max Width:** `1440px` for full-width containers
- **Content Width:** `1152px` for typical page layouts
- **Column Strategy:** 12-column grid system; gutter `24px`
- **Container Padding:** `48px` on desktop (left + right)
- **Section Pattern:** Full-width containers with internal max-width constraint

### Whitespace Philosophy
OpenMonetis prioritizes breathing room and visual clarity. Whitespace is intentional and strategic—surrounding headings, separating card groups, and framing key messages. The warm neutral backgrounds (`#F8F6F4`, `#F5F2EF`) create natural visual separation without hard borders. Minimum margin between major sections is `64px` vertically; minimum padding inside containers is `16px`.

### Border Radius Scale
- **Sharp Corners:** `0px` (utility container tops, category selectors)
- **Subtle Radius:** `9.2px` (buttons, small inputs, icon buttons)
- **Standard Radius:** `11.2px` (cards, standard containers, modals)
- **Rounded Top:** `15.2px 15.2px 0px 0px` (card headers, sheet-style containers)
- **Pill Shape:** `24px` (badges, full-rounded tags, avatar images)
- **Circle:** `50%` (avatar images, radial elements)

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (None) | No shadow, `border: 1px solid #F0EEEC` | Default cards, inputs, containers; baseline surfaces |
| Subtle (sm) | `0px 1px 3px rgba(0, 0, 0, 0.06)` | Secondary buttons, hover states on light surfaces |
| Medium (md) | `0px 4px 12px rgba(0, 0, 0, 0.08)` | Elevated cards on hover, floating actions |
| Deep (lg) | `0px 10px 24px rgba(0, 0, 0, 0.12)` | Modals, dropdowns, popover menus |

**Shadow Philosophy:**
The design system uses restrained shadow treatment aligned with a flat-modern aesthetic. Shadows emerge subtly on interaction (hover, focus) rather than as default styling. The primary depth cue is border color (`#F0EEEC`), which maintains visual hierarchy without excessive z-depth. When shadows are used, they employ warm-tinted blacks (`rgba(0, 0, 0, 0.06–0.12)`) to harmonize with the warm neutral palette.

## 7. Do's and Don'ts

### Do
- Use the primary orange (`#FF7733`) exclusively for the most important call-to-action buttons
- Apply generous padding (`24px–48px`) around sections and inside cards for breathing room
- Stack elements vertically with `24–32px` gaps for clear visual rhythm
- Use warm grays (`#443732`, `#2A2827`) for all body text to maintain the warm aesthetic
- Apply `9.2px` border radius consistently to all interactive elements (buttons, inputs)
- Keep line heights at `1.4×` or greater for comfortable reading on body text
- Use semantic colors (`#0E9D6E` success, `#F7A439` warning, `#F53F2D` error) intentionally
- Test contrast ratios; maintain WCAG AA minimum (4.5:1 for body text)
- Use the `Inter` typeface exclusively for consistency
- Implement focus states with a `3px` colored outline or border

### Don't
- Don't use orange anywhere except primary CTAs and critical highlights
- Don't reduce padding below `12px` inside cards or `8px` inside compact buttons
- Don't use dark backgrounds (`#0F0D0C`) for body text on light surfaces; stick to `#2A2827` or `#443732`
- Don't apply shadows as default styling; reserve them for elevated states (hover, focus, modal)
- Don't mix border radius values on the same component type; stick to defined scale
- Don't increase line height above `1.6×` for headings; tighten for impact
- Don't use the error color (`#F53F2D`) for general emphasis; reserve for genuine errors
- Don't create new colors outside the palette; use opacity if gradation is needed
- Don't apply multiple shadows to a single element; layer a maximum of two shadow values
- Don't forget to include focus/keyboard navigation states on all interactive elements

## 8. Responsive Behavior

### Breakpoints

| Breakpoint | Width | Key Changes |
|-----------|-------|-------------|
| Mobile | `375px–599px` | Single column; container padding `16px`; font sizes reduce 1–2 sizes; gap scale halved |
| Tablet | `600px–1023px` | Two-column grid; container padding `32px`; button height `36px`; heading sizes reduce slightly |
| Desktop | `1024px+` | Full 12-column grid; container padding `48px`; full-scale typography; max-width `1440px` |

### Touch Targets
- **Minimum Interactive Size:** `44px` × `44px` for mobile; `40px` × `40px` for desktop
- **Button Padding:** `12px` vertical, `16px` horizontal (minimum)
- **Link Padding:** `6px` vertical, `8px` horizontal minimum
- **Icon Button:** `32px` × `32px` minimum (32px on mobile preferred)
- **Spacing Between Targets:** `8px` minimum to avoid accidental activation

### Collapsing Strategy
- **Navigation:** Horizontal nav on desktop collapses to hamburger menu on tablet; menu items stack vertically with `12px` gap
- **Grid:** 12-column layout on desktop → 6-column on tablet → 2-column (stacked) on mobile
- **Cards:** Three-column card layouts collapse to single column on mobile; padding reduces from `24px` to `16px`
- **Typography:** Display (60px) → 36px on tablet → 28px on mobile; body (20px) → 18px on tablet → 16px on mobile
- **Spacing:** All spacing scale values reduce by 25–33% on mobile (e.g., `24px` gap → `16px` on tablet, `12px` on mobile)
- **Buttons:** Full-width on mobile (padding `0px`); inline (auto-width) on desktop
- **Inputs:** Full-width on mobile; constrained width on desktop

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA:** Warm Orange (`#FF7733`) — Buttons, highlights, key interactions
- **Primary Text:** Warm Brown (`#443732`) — Headings, strong emphasis
- **Secondary Text:** Dark Neutral (`#2A2827`) — Body text, card content
- **Background:** White (`#FFFFFF`) — Cards, primary surfaces
- **Background Alt:** Cream (`#FCF7F6`) — Alternative surfaces, light containers
- **Border:** Pale Gray (`#F0EEEC`) — Card borders, divider lines
- **Success:** Green (`#0E9D6E`) — Confirmation, positive states
- **Warning:** Amber (`#F7A439`) — Cautions, attention states
- **Error:** Red-Orange (`#F53F2D`) — Errors, destructive actions
- **Disabled:** Light Gray (`#E8E3E0`) — Inactive elements, inaccessible states

### Iteration Guide
1. **Always use `#FF7733` for primary buttons** and all main call-to-action elements; secondary buttons use `#FFFFFF` with `#F0EEEC` border
2. **Typography is always `Inter`** with weights 400 (body), 500 (emphasis), and 600 (headings); size hierarchy: 14 → 16 → 20 → 36 → 60px
3. **Spacing base is `4px`**; use multiples from the scale (8, 12, 16, 24, 32, 48, 64, 80, 96, 128px); never arbitrary values
4. **Border radius:** Apply `9.2px` to all buttons and inputs, `11.2px` to cards, `15.2px 15.2px 0px 0px` to top-bordered containers
5. **Cards default to `#FFFFFF` background with `1px solid #F0EEEC` border**; add shadow only on hover (0px 4px 12px rgba(0, 0, 0, 0.08))
6. **Form inputs:** Padding `12px 16px`, border `1px solid #F0EEEC`, focus state `border: 1px solid #FF7733` + `box-shadow: 0px 0px 0px 3px rgba(255, 119, 51, 0.1)`
7. **Navigation background is always `#FF7733`** with white text; links in content use `#443732` with underline on active
8. **Maintain 1.4× line height minimum for body text**; tighten headings to 1:1 or 1.2:1 ratio
9. **Contrast validation:** Text `#0F0D0C` or `#2A2827` on light backgrounds (WCAG AA); text `#FFFFFF` on `#FF7733` (WCAG AAA)
10. **Responsive collapse:** Reduce padding and font by 25% on mobile; stack multi-column layouts to single column; full-width buttons on mobile only