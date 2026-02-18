# Whoap Launcher - UI Guidelines

> **Design Philosophy**: Minimal monochrome aesthetic with functional beauty. Every pixel serves a purpose.

---

## 🎯 Core Principles

### 1. **Minimalism**
- Less is more
- Remove anything that doesn't serve a function
- White space is not empty space - it's breathing room
- One action per screen area

### 2. **Monochrome Base**
- Black, white, and grays as foundation
- Accent colors for attention, not decoration
- Color indicates state, not brand
- Consistent tonal values across the app

### 3. **Function First**
- Form follows function
- Visual hierarchy guides user flow
- Clear affordances on all interactive elements
- Error prevention over error correction

### 4. **Consistency**
- Same patterns throughout
- Predictable behavior
- Reusable components
- Standardized spacing

---

## 🎨 Color Usage Guide

### When to Use Colors

| Color | Use For | Don't Use For |
|-------|---------|---------------|
| **White (#fff)** | Primary buttons, active states, primary text | Backgrounds, secondary actions |
| **Orange (#ff8800)** | Play buttons, success, selected items | Backgrounds, borders, text |
| **Green (#4ade80)** | Success states, online status | Primary actions |
| **Red (#ff4444)** | Errors, deletions, warnings | Decorative elements |
| **Grays (#666, #888)** | Secondary text, inactive states | Primary actions |

### Color Ratios
- **90%** - Monochrome (black/white/gray)
- **8%** - White (buttons, active states)
- **2%** - Accent (orange for play/success only)

---

## 📐 Layout Principles

### Grid System
- Base unit: **4px**
- All spacing multiples of 4
- Never use arbitrary values

### Spacing Scale
```
4px   - Micro (icon gaps)
8px   - Tight (button groups)
12px  - Default (card padding)
16px  - Comfortable (section gaps)
24px  - Loose (page sections)
32px  - Large (major divisions)
40px  - XL (page padding)
```

### Layout Patterns

**Split Layout** (Login, Settings)
```
| Sidebar (380px) | Content (flex) |
```

**Card Grid** (Instances, Mods)
```
grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
gap: 16px;
```

**List Layout** (News, Changelogs)
```
flex-direction: column;
gap: 12px;
```

---

## 🔘 Button Guidelines

### Hierarchy

1. **Primary Button** (White)
   - Main action on the page
   - Only ONE per view
   - Examples: Play, Create, Save

2. **Secondary Button** (Outline)
   - Alternative actions
   - Examples: Cancel, Back, Import

3. **Tertiary Button** (Text only)
   - Subtle actions
   - Examples: Edit, More, Details

4. **Danger Button** (Red outline)
   - Destructive actions
   - Always with confirmation
   - Examples: Delete, Remove

### Button States

```css
/* Default */
background: #ffffff;
color: #000000;

/* Hover */
background: #e5e5e5;
transform: translateY(-2px);

/* Active */
background: #cccccc;
transform: translateY(0);

/* Disabled */
opacity: 0.5;
cursor: not-allowed;

/* Loading */
pointer-events: none;
/* Show spinner instead of text */
```

### Button Content
- Icon + Text for clarity
- Minimum 44px touch target
- Clear action verbs: "Save Changes" not "Submit"

---

## 📋 Form Guidelines

### Input Fields

**Structure**
```
[Label]
[Input Field]
[Helper Text / Error]
```

**States**
```css
/* Default */
border: 1px solid rgba(255, 255, 255, 0.1);
background: rgba(255, 255, 255, 0.05);

/* Focus */
border-color: #333333;
background: rgba(255, 255, 255, 0.08);

/* Error */
border-color: #ff4444;
background: rgba(255, 68, 68, 0.05);

/* Disabled */
opacity: 0.5;
```

### Validation
- Validate on blur, not on change
- Show inline errors below field
- Use icons for error/success states
- Never disable submit button (show errors instead)

### Labels
- Always visible (not placeholders)
- Short and descriptive
- Sentence case: "Email address" not "Email Address"

---

## 🎴 Card Guidelines

### Card Anatomy
```
┌─────────────────────────────┐
│  [Icon]  Title              │  ← Header
│              Subtitle       │
├─────────────────────────────┤
│                             │
│  Content                    │  ← Body
│                             │
├─────────────────────────────┤
│  [Action Button]            │  ← Footer
└─────────────────────────────┘
```

### Card Types

**Instance Card**
- Icon/Avatar (left)
- Name + Version (center)
- Favorite indicator (top-right)

**Mod Card**
- Thumbnail (left)
- Name + Author (center)
- Download button (right)

**Setting Card**
- Label (left)
- Description (below)
- Toggle/Input (right)

### Card Interactions
- Hover: Border highlight + lift
- Click: Full card is clickable
- Actions: Stop propagation on buttons

---

## 📱 Responsive Design

### Breakpoints
```css
/* Mobile */
@media (max-width: 640px) { }

/* Tablet */
@media (max-width: 900px) { }

/* Desktop */
@media (min-width: 901px) { }
```

### Mobile Patterns
- Stack layouts vertically
- Full-width buttons
- Bottom sheets for modals
- Hamburger menu for navigation
- Swipe gestures where appropriate

### Touch Targets
- Minimum 44x44px
- Space between buttons: 8px minimum
- No hover-dependent interactions

---

## 🎭 Animation Guidelines

### Timing
```
Fast:    150ms (micro-interactions)
Normal:  200ms (state changes)
Slow:    300ms (page transitions)
```

### Easing
```css
/* Standard */
transition-timing-function: ease;

/* Enter (fade in) */
transition-timing-function: ease-out;

/* Exit (fade out) */
transition-timing-function: ease-in;

/* Bounce (playful) */
transition-timing-function: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### When to Animate

**Always Animate**
- Button hover states
- Tab switches
- Modal open/close
- Dropdowns
- Page transitions

**Never Animate**
- Scroll
- Text input
- Resizing
- Loading spinners (continuous)

### Performance
- Use `transform` and `opacity` only
- Avoid animating `width`, `height`, `top`, `left`
- Use `will-change` sparingly
- Respect `prefers-reduced-motion`

---

## ♿ Accessibility

### Color Contrast
- Minimum 4.5:1 for normal text
- Minimum 3:1 for large text
- Never rely on color alone

### Focus States
```css
:focus-visible {
    outline: 2px solid #ffffff;
    outline-offset: 2px;
}
```

### Screen Readers
- Semantic HTML elements
- `aria-label` on icon buttons
- `aria-expanded` on dropdowns
- `aria-live` for dynamic content

### Keyboard Navigation
- Tab order follows visual order
- Enter/Space activates buttons
- Escape closes modals
- Arrow keys navigate lists

---

## 🧩 Component Library

### Using Components

All components are in `src/components/`. Import like:
```typescript
import { Button } from '../components/Button';
import { Card } from '../components/Card';
```

### Creating New Components

1. Create folder: `ComponentName/`
2. Files:
   - `ComponentName.tsx` - Component logic
   - `ComponentName.module.css` - Styles
   - `index.ts` - Export
   - `ComponentName.stories.tsx` - Documentation (optional)

3. Props interface:
```typescript
interface ComponentNameProps {
    /** Description of prop */
    propName: string;
    /** Optional prop */
    optionalProp?: boolean;
}
```

4. Export:
```typescript
export const ComponentName: React.FC<ComponentNameProps> = ({
    propName,
    optionalProp = false
}) => {
    // Component logic
};
```

---

## 🚨 Common Mistakes

### ❌ Don't
- Use gradients for backgrounds
- Use orange for non-action elements
- Center-align long text
- Use arbitrary values for spacing
- Animate layout properties
- Use `!important` in CSS

### ✅ Do
- Keep backgrounds solid black
- Use white buttons for primary actions
- Left-align text for readability
- Use the spacing scale
- Animate only transform/opacity
- Use specific selectors

---

## 📚 Resources

### Internal
- `src/components/` - Component library
- `src/App.module.css` - Global styles
- `public/` - Static assets

### External
- [Inter Font](https://rsms.me/inter/)
- [Lucide Icons](https://lucide.dev/)
- [React Docs](https://react.dev/)
- [Electron Docs](https://www.electronjs.org/docs)

### Tools
- Figma: Design files
- Storybook: Component docs (coming soon)

---

## ✅ Checklist

Before submitting UI changes:

- [ ] Follows color palette
- [ ] Uses spacing scale
- [ ] Consistent with existing components
- [ ] Responsive at all breakpoints
- [ ] Accessible (keyboard, screen reader)
- [ ] Animations use correct timing
- [ ] No arbitrary CSS values
- [ ] Tested in both themes
- [ ] No console errors
- [ ] Performance optimized

---

**Remember**: Every design decision should serve the user. When in doubt, simplify.

---

*Last updated: 2024*
*Maintained by Whoap Design Team*
