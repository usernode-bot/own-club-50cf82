# Own Club — notes for Claude Code

This app runs on **Homeroom**. The platform conventions are the single
source of truth for platform-wide behavior (auth model, `USERNODE_ENV`,
public/private tables, "don't `git push`", etc.):

**Platform conventions (authoritative, always current):**
https://app.onhomeroom.com/claude.md

**Inside Homeroom** (its dev chat, and Homeroom bot's builds), do not
fetch that URL: what applies to your change is already in your
instructions, and the `homeroom` MCP server's
`get_platform_conventions` reads any one section of the conventions
when you need it. The two sections below are for working outside
Homeroom; skip them there.

**Anywhere else** (Claude Code run against this repo locally, or another
harness), fetch it at the start of each session. The hosted copy is
updated in place when platform rules change, so fetching it gives you
today's rules, not a stale snapshot.

## Connector permission prompts (outside Homeroom)

This repo ships `.claude/settings.json`, which allows the **read-only**
Homeroom connector calls (`mcp__homeroom__get_*`,
`…__list_*`, `…__whoami`) once you accept the workspace trust dialog.
See `.claude/README.md` for the whole story, including what to do if you
are still being prompted.

## Check that this checkout is current

You may be working in a fork of this app whose `main` is behind the app's
canonical repository, and nothing in the checkout says so: `git fetch origin`
compares the fork with itself. This matters before you **read** code to answer
a question about how the app behaves now, not only before you edit it.

The canonical repository is named in `.claude/homeroom-canonical-repo`. Check against
it, not against `origin`:

```sh
git fetch "$(cat .claude/homeroom-canonical-repo)" main
git merge-base --is-ancestor FETCH_HEAD HEAD && echo current || echo behind
```

`behind` means this checkout does not contain the canonical `main`. To answer
a question, read the canonical code instead (`git show FETCH_HEAD:<path>`,
`git grep <pattern> FETCH_HEAD`). To change code, start from the exact base
commit your Homeroom work order gives, and never merge or rebase onto the
canonical `main` yourself: which commit a change is diffed against decides
what the group votes on. With the Homeroom connector, `get_checkout_status`
answers the same question.

A session-start hook (`.claude/hooks/homeroom-freshness.sh`, see `.claude/README.md`) runs
this check for you and tells you when you are behind. It is silent offline, so
its silence is not proof the checkout is current. Inside Homeroom (its dev
chat, and Homeroom bot's builds) the platform fixes the base commit, and none
of this applies.

## Starter template

The screen this app currently ships — the "Starter template" hero with
the app's thumbnail tile and the plain-English note on how the app gets
built (by asking Homeroom bot) — is placeholder content from the
Homeroom starter template, not product intent.

When the user asks for their first real feature, REPLACE the template
screen rather than building alongside it:

- remove the `usernode-starter-notice@1` block in `public/index.html`
  (both sentinel comments and everything between them),
- rewrite `README.md` to describe the actual app.

Keep the `usernode-dev-console@1` forwarder `<script>` when rewriting the
HTML — that block is platform infrastructure, not template content. So is
the bridge `<script>`. The design kit is not placeholder either: build the
real app with it, and fill in "## Design" below.

The screen has a light and a dark look and follows the viewer's Homeroom
theme, switching live when they change it: the theme `<script>` right after
the bridge tag sets a `dark` class on `<html>`. Keep that script, and give
everything you build both looks (the design kit's colour tokens carry both), unless one
fixed look is the point of this app, like a game's own scene; then say so
under "## Design" below. Unless a request asks for one, add
no theme picker: the viewer's Homeroom setting is the control. "The
platform's light/dark theme inside the app frame" in the platform
conventions has the details.

If a rule below this line conflicts with the hosted conventions, the
hosted conventions win. This file is **app-specific** — write down
things about *this* app that belong in the repo: product intent,
data-model quirks, style preferences, opt-in policies (e.g. which
tables you've marked private), etc.

---

## About Own Club

A football management game. A new career starts with your manager name, a mock
wallet of 1,000 Dummy USDC and a shop of the 72 Division 3 clubs at 100 each;
then you set the eleven on a pitch diagram, choose formation, mentality,
pressing and each player's role, and play each of your group's 34 matchdays
and read the report. Training, transfers, finances and cups come later.

The Coastal League has three tiers and 162 clubs. Division 1 is one group of
18; Divisions 2 and 3 have four groups, A to D, of 18. The bottom 8 of
Division 1 go down, two into each Division 2 group; the top 2 of each
Division 2 group go up to Division 1 and its bottom 2 go down into the
same-letter Division 3 group; the top 2 of each Division 3 group go up. Nobody
leaves Division 3, and every group stays at 18. Start next season carries your
club, its players and their roles into its new group.

Matches play by themselves at 09:00, 15:00 and 21:00 on the manager's own
clock, with the lineup, tactics and roles last saved: a season's 34 matchdays
take about twelve days. Times follow the IANA zone saved with the career at
purchase (`timeZone`, never moved afterwards; the demo always uses
`Europe/London`), not the server's UTC clock. The server owns the schedule:
`state.nextMatchAt` is stamped at purchase and after every match, and each
request plays every kick-off that has passed (`playDueMatches`), writing the
slot instant into `plays` and saving. An unusable lineup is replaced by
`autoLineup`, so nothing is skipped; a finished season sets `nextMatchAt` to
null until Start next season. `public/app.js` shows the countdown and refreshes
quietly when a kick-off passes.

One manager per Division 3 club: the public `club_owners` table
(`club_id` primary key, `user_id`) records who bought a club. `GET /api/career`
sends taken ids with the shop, `POST` claims a club in the same transaction
that saves the career (409 `owned` if taken), and `DELETE` or a replacement
career frees it. Careers that predate the table are grandfathered on boot, so
nobody loses a club; a club several managers already share stays with all of
them. Staging seeds two fake owners in Division 3 Group A.

The ten original clubs make up most of Division 1; the other 152 are generated
from a fixed seed in `engine.js`, so every career meets the same clubs, with
squads that get weaker with each tier down. Only the manager's own group is
saved; the other eight groups are played out from the career seed when a
season rolls over. A career saved in the old eight divisions finishes its
season and joins the three tiers at rollover.

The simulation lives in `public/engine.js` as a pure, seeded ES module shared
by the browser and the server: the same state and seed always produce the same
match. `public/app.js` renders and saves; `server.js` owns the `careers` table
and the `?demo=1` staging season. Careers saved before the pyramid (`version 1`)
still play their ten-club, 18-matchday season and then join Division 1.
A saved career that is missing something today's club screen reads passes
through `repairCareer` in `engine.js` on load, which fills only what is missing.

## Your people's data

`usernode-user-data.js` erases a person's rows when they delete their
Homeroom account, and exports them when they ask for a copy. By default it
covers every table with a `user_id` (or `usernode_pubkey`) column. When
you add a table that keys a person's rows another way (`author_id`), add it
to `OWNED_BY`; when a table's `user_id` is not the person the row is
about, add it to `SKIP`. Keep the file and its mount in `server.js`.

## Design

This app's look. The first real version fills in the blanks; every later
change follows it, and updates it when a request changes the look on purpose.

- **Palette:** accent: warm amber (the one action colour, and the goalkeeper's
  token); pitch: deep pitch green (the header, the pitch and Harbourside's
  badge); card yellow and card red for bookings; neutrals: chalk white and pale
  grass in the light look, green-black in the dark. Each club also has one
  badge colour of its own, stored as data in `engine.js` (Harbourside uses the
  pitch token).
- The Wallet section is one row of the same list: the balance in `.bal`, the
  price in `.price` (bold, tabular numbers); the group chips reuse the division
  chip row, four wide.
- **Navigation:** four tabs, Home, Squad, Tactics and Competition, each with a
  line icon in the same stroke as the report's icons (a house, two players, a
  tactics board and a cup). A fixed bottom bar on phones (56 px items,
  safe-area padding) becomes a 240 px sticky left sidebar from `md` up, with
  the club's badge and name. The bar and sidebar use surface with a line
  border; the current tab is pitch green, on a raised background in the
  sidebar, never amber. The header with the club, matchday and position sits
  above every tab.
- **Signature element:** the pitch diagram: a drawn pitch with your formation
  as white player tokens you drag to swap, the goalkeeper in amber. Small line
  icons mark each kind of moment in the report (a ball, a card, a swap arrow,
  a cross).
- **Type scale:** `text-title`, `text-heading`, `text-body`, `text-small`
  (unchanged sizes), in the rounded system typeface; scores, stats, ratings
  and the table use tabular numbers.
- The pitch and its tokens keep white lines and white tokens in both looks;
  the panel around it uses the pitch gradient in both.

The kit is in `styles/tailwind-input.css`: colour tokens with a light and
a dark value (named in `tailwind.config.js`), and a few components
(`page-column`, `btn-primary`, `btn-secondary`, `field`, `list`, `list-row`,
`card`, `section-label`, `skeleton`, `state-empty`, `state-error`).
Re-theme by changing the token values there, keeping every text pair at
4.5:1 or more in both looks.

- Colour comes only from the tokens (`bg-ground`, `bg-surface`,
  `text-fg`, `text-muted`, `border-line`, `bg-accent` with
  `text-on-accent`, ...): never a raw hex value or a stock palette class.
- Tap targets are at least 44 px; the buttons and fields already are.
- A field's label says what it is; its placeholder, if any, is an example
  that says so ("e.g. 5.0"), never a bare value that could pass for one
  already entered.
- Each screen sits in `page-column`, one centred column on a wide window.
- Every screen that loads data has honest loading, empty and error states.
  Never show the empty state while loading or after a failure; an error says
  what failed, what still works, and offers Retry. Loading has the content's
  own shape (its rows, with `skeleton` bars for their text).
- Seed obviously fake staging demo data so the populated screen can be seen
  ("Staging mock data" in the platform conventions).
- No cards in cards, no uppercase eyebrows, no emoji as icons.
- A header that shows the app's own mark shows the project's icon there
  (the emoji in `dapp.json`'s `icon` block) or no mark at all: never an
  empty tile, and never `brand/icon.png`, which the app does not serve.

## App-specific conventions

- Dummy USDC is a mock: no payment, wallet or crypto integration. The club
  price and the starting balance live only in `server.js` (`CLUB_PRICE`,
  `STARTING_BALANCE`); the browser never sends an amount, and `PUT /api/career`
  never changes `wallet` or `purchase`.
- The pyramid is capped at three tiers and 162 clubs (the early-stage maximum):
  no Division 4. The shop lists Division 3 clubs only, and a manager owns one
  club at a time. Selling a club, owning more than one and real USDC come
  later; the purchase is stored so selling can be added.
