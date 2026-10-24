# Own Club — notes for coding agents

The agent instructions for this repo live in **`CLAUDE.md`** at the root.
Read it in full before changing anything: it holds the product intent, the
data-model quirks, the design rules and the app-specific conventions, and it
is the single source for app guidance, so this file does not duplicate it —
except for the summary below.

## Licensing and legal (summary)

- **Invented names only.** Every club, player, manager, coach, sponsor,
  ground and competition name in the game is invented. Never introduce a
  real one — a real club, player, manager, coach, league, cup, stadium,
  sponsor or brand — and not even a near-miss of one (a famous surname
  paired with a fitting first name, a real club's nickname, a real club's
  name with one word swapped).
- **No real marks or looks.** Badges stay initials on a plain colour; never
  draw, fetch or approximate a real club's crest or kit, a brand's logo, or
  one real club's distinctive colour identity.
- **Generated data only.** Squads, attributes, results and ratings come from
  the game's own seeded generator; never load a real player database, real
  fixtures, photos or third-party data APIs, and never scrape.
- **Mock money stays mock.** Dummy USDC and Club credits are play
  currencies; no real payment, wallet or crypto integration, ever.
- **Permissive inputs only.** Any new dependency, vendored file, font, icon
  set or data file must carry a permissive licence (MIT, Apache-2.0, BSD,
  ISC) with its source and licence recorded; never paste code of unknown
  origin. Icons stay hand-drawn inline SVG.
- **Original mechanics.** Design features fresh; do not port code, data or a
  named patented mechanic from a commercial game.

If this file and `CLAUDE.md` ever disagree, the "Licensing and legal"
section of `CLAUDE.md` wins — and the two should be fixed in the same
change. When a request asks for the real thing (a real club, player,
competition or brand), build the invented equivalent in the same style as
the rest of the game and say in the change notes why the real name was not
used.

The game's names were audited against real-world club, player, league and
brand names on 2026-10-24 and found clean. The name pools to keep clean
(`COASTAL_CLUBS`, `PLACE_POOL`, `FIRST_NAMES`, `LAST_NAMES`,
`SPONSOR_NAMES`, …) are listed in `CLAUDE.md`'s "Licensing and legal"
section.
