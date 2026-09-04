---
name: Carbon
description: Local-first candidate file that fills job applications.
colors:
  ink: "#18201d"
  muted: "#68716d"
  bg: "#f7f8f5"
  surface: "#ffffff"
  line: "#dfe4df"
  fill: "#537568"
  fill-hover: "#405f54"
  fill-ink: "#ffffff"
  mapped: "#405f54"
  mapped-bg: "#dcebe4"
  ai: "#8a691f"
  ai-bg: "#f8f1d9"
  empty-bg: "#eef0ee"
  danger: "#b95c46"
  danger-bg: "#faeee9"
  disabled: "#e5e8e5"
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
  container: "9px"
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

Carbon is a quiet application desk in a persistent browser side panel, with a compact popup for quick access. It is a candidate file, not a chat overlay. Paper and white surfaces, deep green ink, one sage action color, readable rows, and restrained status chips. Source Sans 3 is the only face. The popup is 400×600; the options tab uses the same system at up to 840px.

## Colors

Restrained and workmanlike. Ink and hairlines carry the structure. Sage `#537568` is reserved for the primary Fill action, focus, and readiness. AI amber and failure terracotta appear only where their meaning is needed.

## Typography

One family, tight product scale. Title 16/700/−0.025em. Body 13. Meta 11 muted. Chips 10/650 in sentence case. Tabular nums on status. No display serif, no Inter.

## Layout

Compact brand/status rail → scrollable workspace → five equal bottom tabs. Fill shows one candidate summary followed by vertically stacked field rows that remain legible at side-panel widths. Profile is grouped into collapsible contact, location, work, voluntary, and skills sections. Jobs stay as compact disclosure rows. Options uses the same chrome centered at 840px.

## Elevation & Depth

Nearly none. Hairlines and surface color changes establish hierarchy; only the switch thumb uses a tiny functional shadow. No floating cards.

## Shapes

Controls use 6px corners, grouped sections use 9px, and status chips are full pills. Rounded shapes distinguish interactive groups rather than decorate every surface.

## Components

- **Fill** sits in the header on every tab. Disabled until fields exist.
- **Tabs** recede in muted ink; the current tab uses sage with a short 2px rule.
- **Status chips:** mapped (green), needs AI (amber), empty (gray), writing (blue wash), failed (red).
- **Inputs:** 1px hairline, 6px radius, ink caret, sage focus ring.
- **Empty states** teach the next action. No illustration.

## Do's and Don'ts

- Do keep sage Fill as the only saturated imperative.
- Do group long forms by the way applicants think about their information.
- Do treat the popup as a candidate record, not a chatbot.
- Don't add sparkle, gradients, glass, or a second accent.
- Don't export the OpenRouter key — that's product, not paint, but it binds every settings treatment.
- Don't introduce a display face or a kicker above "Candidate file."
