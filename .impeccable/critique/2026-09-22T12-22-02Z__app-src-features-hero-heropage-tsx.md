---
target: Hero page (app/src/features/hero/HeroPage.tsx)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\stuhl\\Documents\\Projekte\\training-dashboard\\app\\src\\features\\hero\\HeroPage.tsx"
target_fingerprint: "sha256:f9b6444244c09deb0e3a5b4d657c288584cc4f17a2db2eefc9d02b663e094251"
target_path: "C:\\Users\\stuhl\\Documents\\Projekte\\training-dashboard\\app\\src\\features\\hero\\HeroPage.tsx"
timestamp: 2026-09-22T12-22-02Z
slug: app-src-features-hero-heropage-tsx
---
Method: dual-agent (A: design review · B: detector/browser evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3/4 | No data-freshness indicator; sync runs every 15 min but nothing on-page says how fresh the numbers are |
| 2 | Match real world | 3/4 | Good cyclist vocabulary, but raw stats jargon ("z = -0.22 · Konfidenz: veraltet") leaks through unexplained |
| 3 | User control & freedom | 2/4 | No "reset to default layout" after drag-rearranging tiles; What-if slider has no reset-to-current-eFTP |
| 4 | Consistency & standards | 3/4 | Same "readiness" verdict shown two different ways 40px apart (traffic-light box vs. colored dot) |
| 5 | Error prevention | 2/4 | Loading/error state is one bare gray sentence, no retry, no distinction between error causes |
| 6 | Recognition not recall | 3/4 | Measured/estimated icon convention is consistent; InfoTooltip glossary works well |
| 7 | Flexibility & efficiency | 2/4 | No collapse/hide outside edit mode, no keyboard shortcuts, no jump-nav on a long page |
| 8 | Aesthetic & minimalist design | 2/4 | ~10 cards stacked with near-duplicate readiness content; minimalism is in components, not composition |
| 9 | Error recovery | 2/4 | Same bare-sentence failure as #5, no visual match to the rest of the system |
| 10 | Help & documentation | 3/4 | InfoTooltip is properly accessible, but misses the two densest jargon values (TSB "Form +45", z-score/Konfidenz) |

**Total: 25/40 — Acceptable** (significant improvements needed, solid foundation underneath)

## Design Specificity Verdict

**Genuinely built for this product**, not a reskinned generic dashboard — the zone-color system, the measured-vs-estimated icon convention (used identically on rings AND the timeline), and the What-if FTP slider are bespoke, domain-native. The one generic-feeling part: the 9-metric-tile strip treats lifetime totals and today's power data with the same visual weight, like a stock "stat card grid."

**Automated scan**: the static code scanner found nothing (0 findings — clean). The *live browser* scan found 34 flagged patterns, but on inspection **most are false positives**: a documented background gradient, a documented diagonal-stripe accent, two documented "active state" glow effects, and the Inter font (already explicitly whitelisted in this project's own config — the live-scan mode just doesn't apply the whitelist the way the static scan does, a tooling gap worth knowing about, not a design problem).

What's left after removing the false positives is real: **26 places with very small text** (11px and under — several as small as ~9px, e.g. "Ramp · W"), which actually breaks the project's own documented type scale (DESIGN.md commits to nothing below 0.6rem/9.6px). Plus one concrete bug the automated scan caught that the manual review didn't: **a chart caption text that overflows its own clipping box by ~120px on a 390px-wide phone** (Trainingskonsistenz-Kalender), so part of that label is literally cut off and invisible.

## What's Working

1. **Measured vs. estimated distinction** — a solid check-icon vs. a dashed circle, used identically everywhere (rings, timeline). Real trust signal most training apps skip.
2. **InfoTooltip component** — properly accessible (keyboard-reachable, Escape closes it, screen-reader-friendly) — better craftsmanship than most of the rest of the page's interactive bits.
3. **One zone-color system, reused everywhere** — the power-zone colors aren't decoration, they're the same computed data driving the scale, the sweet-spot overlay, and the progress ring. Real information architecture.

## Priority Issues

**[P1] Athlete-toggle looks broken at normal desktop width.** At 1440×900, the four athlete-name pills ("Stuhlsen", "hc_diZee", "Hendrik", "bentastiic") render squished together as one unreadable string, no spacing, no visible active state — even though the code correctly registers 4 separate buttons underneath. This is the control a Trainer uses to pick which athlete they're looking at — at normal desktop size, it's effectively unusable. Works fine on mobile (390px), so it's width-specific.
→ `/impeccable adapt` (targeting the AthleteToggle component)

**[P1] Two cards independently tell the user "should I train today" — with different verdicts and different visual languages.** BriefingCard says "Mit Bedacht" (mind it), ReadinessCard says "Angeschlagen" (worn down) — same underlying signal, shown as a 3-box traffic light in one and a colored dot in the other, only linked by a small button at the very bottom of the second card. For someone checking in after a bad day, the second, colder verdict undercuts the gentler one right above it.
→ `/impeccable clarify` or `/impeccable layout` (merge or visually unify the two cards)

**[P1] Two interactive elements are mouse-only (keyboard/screen-reader users are locked out).** The PowerScale's hover readout (exact watts at cursor position) has no keyboard equivalent; the Trainingskonsistenz-Kalender's day cells are plain unfocusable `<div>`s, not real buttons. Both are core interactions, not decoration.
→ `/impeccable harden` or `/impeccable adapt`

**[P2] Chart caption text is cut off on phones.** The Trainingskonsistenz-Kalender's summary line ("Serie aktuell 0 Wochen · längste 25 · Ø 3,8 Tage/Woche") overflows its own chart box by ~120px at 390px width and gets visually clipped — confirmed via direct DOM measurement, not a guess.
→ `/impeccable adapt`

**[P2] A lot of very small text, some breaking the project's own minimum.** 26 spots with text at 11px or smaller live-scanned, several around 9px (e.g. "Ramp · W", record-date captions) — below DESIGN.md's own documented floor of 0.6rem/9.6px.
→ `/impeccable typeset`

**[P2] Nine metric tiles in one flat, unlabeled row.** Lifetime totals (total distance, ride count) and today-relevant numbers (FTP, eFTP) get identical visual weight with no grouping — unlike ReadinessCard's own 4-metric list, which *does* group correctly two components away.
→ `/impeccable layout`

**[P2] Loading/error state is one bare gray sentence, no retry.** On a page whose whole point is reassurance, a failed load just says "Fehler beim Laden der Trainingsdaten." with no visual connection to the rest of the design system and no way to retry.
→ `/impeccable harden`

## Cognitive Load

Four of the eight checklist items fail: **single focus** (10+ cards compete on one continuous scroll), **chunking** (the 9-tile strip has no ≤4 grouping), **one-thing-at-a-time** (everything renders at once, only one disclosure exists), **working memory** (user must reconcile two independently-computed readiness verdicts in different vocabularies — see P1 above).

## Emotional Journey

The Briefing card is gentle on a bad day. The very next card restates the same judgment more clinically, undercutting the reassurance. There's also no reserved "peak" moment anywhere — even a genuinely good week (8 personal records) is buried mid-scroll with no visual celebration.

## Persona Red Flags

**Jordan (first-timer)**: the two densest jargon values on the page — "Form +45" (TSB) and the z-score/"Konfidenz: veraltet" readout — are exactly the two *without* the accessible InfoTooltip; only a native browser tooltip, easy to miss.

**Sam (keyboard/screen-reader)**: PowerScale hover-readout and calendar day cells (see P1) are mouse-only. The 3-box traffic light in BriefingCard has no accessible name per box — screen readers get nothing from the visualization itself, saved only by the redundant text headline next to it.

**Casey (distracted mobile, 390px)**: the page is Wetter → Briefing → FTP-Ringe → Leistungsskala → 9-Kachel-Streifen → Kalender → Records → Wochenrückblick before reaching Tagesform — the thing a glancing user most wants ("should I train today?") is second-to-last, with no jump-link to skip to it.

## Minor Observations

- The `<h1>` "Radsport / Trainingsdashboard" reads to screen readers as one run-together word (no space between the two lines).
- Once a user drags tiles into a custom layout, there's no indicator it differs from default, and no reset button.
- `ReadinessCard` uses plain native browser tooltips for its jargon, while `InfoTooltip` (fully accessible) is used two components away for the same kind of thing — inconsistent pattern on one page.
- Cleanup note (not a design issue): this project's `.impeccable/config.json` has a few old waiver entries pointing at `assets/css/main.css`/`components.css` — files that don't exist anymore since the vanilla-JS frontend was removed. Dead config, harmless, but worth a tidy-up sometime.

## Questions to Consider

1. What if BriefingCard and ReadinessCard were one card with one verdict, instead of two cards independently re-deriving the same answer?
2. What if the page had one sticky "today's answer" strip (readiness + next session) pinned above the fold, with lifetime stats and records demoted to a collapsible "more" section?
3. The athlete/trainer toggle just broke silently at the most common desktop width — how long would that have gone unnoticed without this check?
