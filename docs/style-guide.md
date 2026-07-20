# UMS Style Guide

This guide documents the current Untitled Management Software visual language. Prefer these tokens and patterns before introducing new colors or component styles.

## Color Tokens

Primary brand colors:

- `--main-color: #f8ad9d` - primary UMS coral. Use for primary actions, active navigation, focus rings, brand accents, and soft hero washes.
- `--main-color-shade: #f4978e` - hover/pressed shade for primary coral actions.
- `--main-accent: #f08080` - stronger coral accent. Use sparingly for destructive actions, urgent states, and small emphasis.

Neutral colors:

- `--surface: #ffffff` - cards, dialogs, popovers, and controls.
- `--secondary-color: #f7f7f7` - app background and quiet control fills.
- `--secondary-accent: #56494c` - primary readable text color. Use instead of black.
- `--secondary-accent-hover: #473d40` - hover state for secondary controls.
- `--secondary-accent-soft: #f0ecec` - soft gray-pink fill for secondary controls.
- `--text-primary: #2f2f2f` - high-emphasis text when a neutral dark is needed.
- `--text-secondary: #5a5a5a` - body copy, labels, helper text, and muted UI.
- `--border-light: #e8e8e8` - neutral borders and dividers.

Course colors:

- `--course-green: #cfe8da`
- `--course-blue: #c9d8f3`
- `--course-yellow: #f8e7af`
- `--course-gray: #d8d8dd`
- `--course-teal: #bfe6e1`
- `--course-purple: #ded2f4`
- `--course-pink: #f5cddd`
- `--course-red: #f7c7c7`

Use course colors as soft tints with darker derived text from `app/data/courseColors.ts`. Avoid pure black; use `--secondary-accent`, `--text-primary`, or `--text-secondary`.

## Typography

- Font family: Poppins (`--font-sans`, `--font-family`).
- Letter spacing: `0`.
- Page titles: bold, compact, usually `text-3xl` to `text-4xl` on mobile and `text-4xl` to `text-5xl` on larger screens.
- Section titles: bold, `text-xl` to `text-2xl`.
- Card titles: bold, `text-base` to `text-lg`.
- Body copy: medium or regular, `text-sm` to `text-base`, using `--text-secondary`.
- Labels and metadata: semibold, `text-xs` to `text-sm`.

## Shape, Spacing, And Shadow

- Default radius: `--radius: 10px`; most cards and controls should use `rounded-lg`.
- Compact repeated cards may use `rounded-lg` with restrained padding (`p-3` to `p-5`).
- Use generous gaps for page sections, but keep mobile controls short enough to show useful content in the first viewport.
- Prefer subtle shadows based on the UMS gray-brown text color, such as `rgb(86 73 76 / 0.04-0.08)`.
- Avoid nested cards. Use cards for repeated items, dialogs, and framed tools.

## Components

Buttons:

- Primary action: `bg-[var(--main-color)] text-white hover:bg-[var(--main-color-shade)]`.
- Secondary action: soft gray-pink fill with `--secondary-accent` text.
- Destructive or urgent icon: `--main-accent`.
- Icon buttons should use lucide icons and visible tooltips/titles for compact actions.

Inputs and selects:

- Use white surfaces, `--border-light` borders, `--secondary-accent` text, and Poppins semibold labels.
- Mobile touch targets should generally be `h-12` to `h-14`; reserve taller controls for hero-like actions.

Cards:

- Use `--surface` or a soft course tint for card backgrounds.
- Use `--border-light`, `--main-color`, or course borders depending on context.
- Assignment/course cards should combine a soft tinted background, a narrow status/course rail, and readable gray text.

Navigation:

- Active states use `--main-color`.
- Inactive states use `--text-secondary` or `--secondary-accent`.
- Avoid black icons; gray or brand coral should be used instead.

Status Treatments:

- Upcoming: use UMS coral (`--main-color` or `--main-accent`) with a soft coral tint.
- Late/overdue: use `--main-accent` with a soft red/coral tint.
- Completed: derive from `--course-green` mixed with `--secondary-accent` for text and a soft green tint.
- Due today or warning-neutral: derive from `--course-yellow` mixed with `--secondary-accent`.
