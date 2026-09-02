---
name: Carbon
description: Local-first candidate file that fills job applications.
colors:
  ink: "#111111"
  muted: "#5c5c5c"
  bg: "#ffffff"
  line: "#e8e8e6"
  fill: "#2f6fed"
  fill-hover: "#1f5fd6"
  fill-ink: "#ffffff"
  mapped: "#1f7a4d"
  mapped-bg: "#edf3ec"
  ai: "#8a5a00"
  ai-bg: "#fbf3db"
  empty-bg: "#f4f4f5"
  danger: "#b42318"
  danger-bg: "#fdebec"
  disabled: "#e8e8e6"
typography:
  ui:
    fontFamily: "Source Sans 3, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  title:
    fontFamily: "Source Sans 3, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  meta:
    fontFamily: "Source Sans 3, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  chip:
    fontFamily: "Source Sans 3, Segoe UI, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.04em"
rounded:
  control: "6px"
  chip: "999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.fill}"
    textColor: "{colors.fill-ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.fill-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled}"
    textColor: "{colors.muted}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design

## Overview

Carbon is an ATS recruiter console in popup form: a candidate file, not a chat overlay. White ground, charcoal ink, one utility blue for Fill, dense rows, status chips. Source Sans 3 is the only face. The popup is 400×600; the options tab is the same file at 760px.

## Colors

Restrained. Ink and hairline do the structure. `#2F6FED` is Fill and focus only. Mapped green and AI amber live on chips, never as page color. Disabled Fill is gray `#E8E8E6`, not a faded blue.

## Typography

One family, tight product scale. Title 16/650/−0.02em. Body 13. Meta 12 muted. Chips 10/700/uppercase/0.04em tracking. Tabular nums on status. No display serif, no Inter.

## Layout

Header rail (title + Fill) → scrollable main → five equal bottom tabs. Fill tab: identity strip then a three-column field table (Field / Value / Status). Profile is a two-column form grid. Jobs are stacked records with a hairline, not cards-in-cards. Options page is the same chrome centered at 760px with side rules.

## Elevation & Depth

None. Hairline `#E8E8E6` is the only separator. No shadows.

## Shapes

Controls 6px. Status chips full pill. No large rounded shells.

## Components

- **Fill** sits in the header on every tab. Disabled until fields exist.
- **Tabs** recede in muted ink; current tab is ink with a 2px bottom rule.
- **Status chips:** mapped (green), needs AI (amber), empty (gray), writing (blue wash), failed (red).
- **Inputs:** 1px hairline, 6px radius, ink caret, `#2F6FED` focus ring.
- **Empty states** teach the next action. No illustration.

## Do's and Don'ts

- Do keep Fill as the only saturated imperative.
- Do treat the popup as a candidate record, not a chatbot.
- Don't add sparkle, gradients, glass, or a second accent.
- Don't export the OpenRouter key — that's product, not paint, but it binds every settings treatment.
- Don't introduce a display face or a kicker above "Candidate file."
