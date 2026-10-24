# AGENTS.md: rules for building Own Club

This file adds one rule set for anyone working on this project: Homeroom bot,
other coding agents, and people editing the code. `CLAUDE.md` (this app's own
notes) and the Homeroom platform conventions still apply in full; where this
file and they disagree, they win.

## Names, originality and licensing

- **Everything in the game is invented.** The Coastal League and its three
  divisions; the ten hand-written clubs in `COASTAL_CLUBS` in
  `public/engine.js` (Harbourside FC, Redvale Athletic and the rest, with
  their grounds); the 152 generated clubs that `generateClubs()` builds from
  `PLACE_POOL`, `CLUB_SUFFIXES` and `GROUND_WORDS`; player and staff names
  from `FIRST_NAMES` and `LAST_NAMES`; the sponsors in `SPONSOR_NAMES`; the
  club badges, which are two initials on a colour from the club's own data
  or from `BADGE_COLORS`; and the staging owners "Staging Demo Manager" and
  "Staging Demo Rival". Keep it that way.
- **Never add** a real club, league, cup, federation, player, coach, referee,
  owner or ground; a real badge, crest, logo, kit design or sponsor; a photo,
  avatar or likeness of a real person; any third-party trademark or brand
  name; licensed fonts, images, sounds or data sets (for example real player
  ratings); or text, images or layouts copied from another football game or
  website.
- **New names:** make them from invented or generic place words joined with
  ordinary words, the way the existing pools do ("Harbourside FC", "The
  Quay", "Tidewater Ferries"). Add words to the pools rather than
  hand-picking a famous name. Never name anything after a real person, and
  never use a real club's name, nickname, initials or colours as a reference.
- **Coincidences:** generic place words can match a real town or a small real
  club. If a generated combination is found to match a real club's name, fix
  it in its own request by changing the pool or skipping the combination. A
  rename changes the generated club list for every career, so it needs its
  own change and migration plan.
- **Assets:** icons and drawings are the app's own inline SVG and the design
  kit. Only add an image, font or sound that the project made itself or that
  comes with a licence allowing its use here, and record its source and
  licence next to it.
- **Money:** Dummy USDC is a mock. There is no real payment, wallet or
  cryptocurrency, and Club credits are in-game only. Nothing can be bought
  with real money, and the game has no betting or wagering. The details are
  in `CLAUDE.md` under "App-specific conventions".

This is a project rule for keeping the game original. It is not legal advice
and it does not promise that no legal claim could ever be made.
