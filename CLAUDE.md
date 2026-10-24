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
tables you've marked private), licensing rules, etc.

---

## About Own Club

A football management game. A new career starts with your manager name, a mock
wallet of 1,000 Dummy USDC and a shop of all 306 clubs, priced 100 USDC in
Division 3, 200 in Division 2 and 300 in Division 1;
then you set the eleven on a pitch diagram, choose formation, mentality,
pressing and each player's role, and play each of your group's 34 matchdays
and read the report. A Club tab lists the nine club facilities (stadium,
training ground, academy, shop, food stand, hotel, toilets, parking, VIP room),
each level 1 to 5, and upgrades them with Club credits. Training and cups come
later.

The Coastal League has three tiers and 306 clubs. Division 1 is one group of
18; Division 2 has four groups, A to D, and Division 3 has twelve, A to L, all
of 18. The bottom 8 of Division 1 go down, two into each Division 2 group; the
top 2 of each Division 2 group go up to Division 1 and its bottom 6 go down,
two into each of its three Division 3 groups in finish order (18th and 17th to
the first, 16th and 15th to the second, 14th and 13th to the third); the top 2
of each Division 3 group go up into the Division 2 group above it (A, B and C
under Division 2 A, D, E and F under B, and so on). Nobody leaves Division 3,
and every group stays at 18. Start next season carries your
club, its players and their roles into its new group.

Matches play by themselves at 00:00, 06:00, 12:00 and 18:00 on the manager's own
clock, with the lineup, tactics and roles last saved: a season's 34 matchdays
take about nine days. Times follow the IANA zone saved with the career at
purchase (`timeZone`, never moved afterwards; the demo always uses
`Europe/London`), not the server's UTC clock. The server owns the schedule:
`state.nextMatchAt` is stamped at purchase and after every match, and each
request plays every kick-off that has passed (`playDueMatches`), writing the
slot instant into `plays` and saving. An unusable lineup is replaced by
`autoLineup`, so nothing is skipped; a finished season sets `nextMatchAt` to
null until Start next season. `public/app.js` shows the countdown and refreshes
quietly when a kick-off passes.

One manager per club: the public `club_owners` table (`club_id` primary key,
`user_id`, `manager_name`) records who bought a club and the display name they
gave. `GET /api/career` sends the taken ids with the shop and an `owners` map
of club id to manager name (never a `user_id`), `POST` claims a club with that
name in the same transaction that saves the career (409 `owned` if taken, 409
`has_club` while a career exists), and a sale (`DELETE`) frees it. Careers that
predate the table are grandfathered on boot, so nobody loses a club; a club
several managers already share stays with all of them. A row from before the
name column is filled from its manager's `careers` row on boot, so nobody has
to buy again. `managerLine` in `engine.js` turns the map into the grey line
under a club's name in the Competition table ("Manager <name>", or "Run by a
bot"), and the shop's taken rows say "Run by <name>". Staging seeds two fake
owners in Division 3 Group A, "Staging Demo Manager" and "Staging Demo Rival".

Selling is how a career ends. `DELETE /api/career` pays the club's sale value
into the person's wallet (`wallets`, one row per person) in the same
transaction that frees the club and deletes the career, and the New career
screen shows the kept balance. The sale value comes from the division the club
is in when it is sold: `SALE_VALUE` in `server.js` pays 300/200/100 for
Divisions 1/2/3.

Club credits are the club's own in-game currency, a per-career field
(`state.credits`, non-negative integer) rather than a table like `wallets`. The
engine owns them: `CREDIT_REWARDS` (50 for a win, 25 for a draw, 10 for a loss)
and `creditsForResult` in `engine.js`, added in `playMatchday` for the fixture
involving `state.clubId` only, so the server's catch-up, a watched kick-off and
the demo's 17 matchdays all earn the same way. `buildInitialState` starts at 0,
`repairCareer` fills a missing or invalid value as 0, `startNextSeason` carries
them, and a sale deletes the career so they end with it. `PUT /api/career` keeps
the stored balance whatever the page sends. Facilities spend them: `FACILITIES`,
`UPGRADE_COSTS` (100/250/500/1000 to reach levels 2 to 5) and `upgradeFacility`
in `engine.js`, and `POST /api/career/facility` in `server.js`, which names only
a facility and a target level from the page, checks the balance against the
stored career, deducts the credits and saves the level in one version-checked
UPDATE. `downgradeFacility` in `engine.js` lowers a facility one level for free
(nothing is refunded, floor 1); the same route sends a level one below the
stored one to it. Maintenance, seats and academy capacity follow the new level
from the next matchday. `state.facilities` holds one integer per facility; `repairCareer` fills a
missing or invalid one with 1, `startNextSeason` carries them, and the demo has
its stadium at 4, training ground at 2 and toilets at 3. An upgrade changes only
what the facility says it has. Three of them are the crowd facilities:
`CROWD_FACILITIES` (toilets, parking, VIP room) bring more fans through the gate
at home through `CROWD_BONUS` (2% of the fan base for each level above 1, up to
8% each) and `homeCrowd`, which `playMatchday` uses for a home attendance. The
bonus adds to the crowd only, never to `state.fans`, and the crowd still cannot
pass `STADIUM_SEATS` or the division's `FAN_CAP`, so it pays only while the
ground has empty seats; away matches earn nothing. Home's Home gate row shows
the extra fans when there are any. Each level above 1 also adds its share of
`MAINTENANCE` on every matchday, like every other facility. The shop, food stand
and hotel also earn on a home matchday (`MATCHDAY_SALES` and `matchdaySales`:
Club credits for every 10 fans in the ground, 4/6/10/15/22 at the shop,
3/5/8/12/18 at the food stand and 1/2/4/7/12 at the hotel, by level). The Finance
tab shows the balance as the second row of the Wallet section, and that section's tag reads
"Staging mock" rather than "Dummy USDC (staging mock)".

The Finance tab holds the Wallet and the season's Club credits, and Home no
longer shows either. The Wallet is Dummy USDC, Club credits and a read-only
Homeroom wallet row: `GET /api/career` reads the verified token's
`usernode_pubkey` into a top-level `homeroomWallet` (`{ address }`) for a
signed-in person only, never stores it and never accepts one from the page.
`seasonMoney` in `engine.js` totals the season for the summary and the income
and expense lists (result credits, gate, shop, food and hotel against upkeep,
maintenance and wages; upgrades, staff fees, transfers and the sponsor are left
out of the net). `state.financeHistory` is the last `FINANCE_HISTORY_MAX` (10)
matchdays of this season, newest first, each `{ season, matchday, venue,
opponentId, income, expenses, net, balanceAfter }`; `playMatchday` writes one
entry for the club's own fixture, `moneyFields` drops malformed or
older-season entries and caps the list, `seasonEndMoney` empties it, and
`startNextSeason` and `repairCareer` carry it through their spreads. The server
keeps the stored list whatever the page sends.

Players move between clubs through the public `transfer_listings` table
(`id`, `seller_user_id`, `seller_club_id`, a `player` snapshot, `asking_price`,
`created_at`), read by `GET /api/transfers`, written by `POST /api/transfers` and
`DELETE /api/transfers/:id`, and bought through `transfers-db.js`'s
`buyListing`, which locks the listing, the buyer and the seller in that order.
`seller_user_id` is in `usernode-user-data.js`'s `OWNED_BY`. Selling the club
deletes the seller's listings. `engine.js` owns the rules: `playerWage`,
`wageBill`, `systemSaleValue`, `leaveError` (11 players, one goalkeeper),
`signError` (40 players, price plus one matchday of wages and upkeep),
`listPlayer`, `buyPlayer`, `returnListing`, `sellToLeague`, `releasePlayer`,
`ageingFor` and `academyGraduate`; `playMatchday` charges `wageBill` beside
`GROUND_UPKEEP` into `finance.wage` and `startNextSeason` ages the squad and
replaces each retiree with a graduate. `PUT /api/career` keeps the stored squad
(and, on a rollover, the aged one) whatever the page sends, and rebuilds an
unusable lineup with `autoLineup`.

Players grow to a peak and then decline. Every player has one of three peak
styles (`PEAK_STYLES` and `PEAK_NAMES` in `engine.js`): early peaks at 23 and
declines from 26, mid at 27 and from 30, late at 30 and from 33. `ageingFor`
adds a year each summer, raises every attribute 1 to 3 points while the new age
is at or below the peak (never above 92), holds it for the two summers before
the decline age, then drops it 1 to 3 points a summer as before (never below
20). Retirement is unchanged: possible from 34, certain at 39. A player's
style comes from `peakStyleFor(seed, id)` from the career's seed, not the
squad's rng, so generated squads and fixtures stay exactly as they were; it is
stored as `peak` on the player. `buildSquad`, `academyIntake` and
`academyGraduate` set it, `playerForNewSeason` and `listPlayer`'s snapshot keep
it, and `ageingFor` writes it back so a career saved before the field gets it on
its next rollover. `playerPeak` resolves a missing or invalid `peak` from the
seed. Growth happens whether or not a Scout is hired; the Scout only reveals it,
through `growthOutlook(state, p)` (`{ style, peakAge, next }` where `next` is
improving, steady or declining for the coming summer), on the squad rows and in
the player sheet's Growth section.

The finances are Club credits only; the wallet and Dummy USDC are never
touched. A career has fans (`state.fans`, seeded by tier at 15,000 / 6,000 /
2,500 and carried across seasons), which move after each of the club's matches
(+5% win, +2% draw, −3% loss, floored at 0) and never above `FAN_CAP` for its
division (30,000 / 12,000 / 5,000, the same figures as `GROUND_CAPACITY`);
`moneyFields` and the rollover clamp a stored value, and a relegated club drops
to its new limit. Only a home match earns a gate: the smaller of the fans, the
stadium's own seats (`STADIUM_SEATS`, 2,000 to 40,000 by level) and the
division's cap, times 5 credits a seat; away matches earn nothing. That same
home crowd also spends at the shop, food stand and hotel, which pay
`matchdaySales` on top of the gate and are recorded as `finance.shop`, `food`
and `hotel` and on the match report with the balance it left (`balanceAfter`);
away matches earn none of it. Every club
matchday pays a flat ground upkeep of 250 credits, home or away, then facility
maintenance (`MAINTENANCE`, nothing at level 1 and 150/500/1,500/4,000 per
facility at levels 2 to 5, summed by `maintenanceDue`), then player wages
(`playerWage`/`wageBill`: `WAGE_RATE` 45/24/14 by division times the player's
overall above 40, never below 5 points), then staff wages. Each is paid only as
far as the balance reaches, never below 0. The engine's `moneyFields` fills
these for an older career and `playMatchday` applies them, so catch-up, a
watched kick-off and the demo all earn the same. Each season has one sponsor
(`state.sponsor`: name, target, fee) chosen deterministically at purchase and at
every rollover; when its target (reusing the board objective's wording) was
met, `startNextSeason` pays its fee once and records the result in
`state.lastSponsor`. Upkeep is a placeholder until stadium and facility
buildings arrive and scale it.

Staff are the five roles in `STAFF_ROLES` (coach, scout, doctor, physio, club
staff), each with a one-off fee and a wage every matchday, one of each. They
live in `state.staff` (`{ name, season, matchday }` or null), are hired and
released by `hireStaff`/`releaseStaff` (no refund) through
`POST /api/career/staff`, and pay `staffWagesDue` each matchday until released.
They do not change matches yet. The academy takes in `ACADEMY_INTAKE` young
players after every matchday (1/1/2/2/3 at levels 1 to 5), stronger at a higher
level, up to `ACADEMY_CAPACITY` (10/20/30/45/60, matching the facility text);
when full the longest waiting leaves. Prospects above a downgraded capacity
stay, and the academy takes in none while over; `youthFields` caps at 60. `academyIntake` is called from
`playMatchday`; `state.youth` holds prospects newest first, earn nothing, and
`promoteYouth` moves one into the squad (`SQUAD_MAX` 25) on a wage through
`POST /api/career/youth`. `PUT /api/career` keeps the stored `staff` and
`youth` whatever the page sends.

The ten original clubs make up most of Division 1; the other 296 are generated
from a fixed seed in `engine.js`, so every career meets the same clubs, with
squads that get weaker with each tier down. Only the manager's own group is
saved; the other sixteen groups are played out from the career seed when a
season rolls over. A career saved in the old eight divisions finishes its
season and joins the three tiers at rollover. A career saved with the old nine
groups keeps all nine as they are and gains the eight new Division 3 groups,
so its own season carries on untouched.

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
- Market rows follow the Club tab's rows: a position chip, name and a small grey
  line, ending in the plain secondary button (Buy, Withdraw) or a muted
  "N needed" / "Squad full" in the same place.
- The Wallet section is one list of the same rows, Dummy USDC then Club
  credits then the read-only Homeroom wallet: the balance in `.bal`, the price
  in `.price` (bold, tabular numbers); the group chips reuse the division
  chip row, four wide. The Finance tab's summary and its income, expense and
  history sections are that same list of rows, each name over a small grey
  line with a bold tabular figure at the end; the net row uses the raised
  background.
- **Navigation:** seven tabs, Home, Squad, Tactics, Competition, Club, Finance
  and Transfers, each with a line icon in the same stroke as the report's icons
  (a house, two players, a tactics board, a cup, a stadium, a banknote with a
  circle in it, and two opposite arrows). On phones the bottom bar shows Home,
  Squad, Tactics and Competition plus a More button (three dots) whose menu
  holds Club, Finance and Transfers; More is pitch green while one of those is
  open. The five labels are 10 px so they fit at 360 px. The More menu is a
  surface panel with a line border above the bar at the right, one 48 px row
  per tab with its icon, and the current row pitch green on the raised
  background. A fixed bottom bar on phones
  (56 px items,
  safe-area padding) becomes a 240 px sticky left sidebar from `md` up, with
  the club's badge and name; the sidebar lists all seven tabs and has no More
  button. The bar and sidebar use surface with a line
  border; the current tab is pitch green, on a raised background in the
  sidebar, never amber. The header with the club, matchday and position sits
  above every tab.
- **Competition:** every league-table row keeps the club's name as its title
  and carries the same small grey line a Squad row has under it: "Manager
  <name>" for a club a person runs (your own row included), "Run by a bot" for
  one nobody does. The shop's taken rows agree, saying "Run by <name>". Under
  the table (and under the Group buttons on New career, for Divisions 2 and 3)
  one grey line says "Division 2 has four groups of 18: the Coastal League
  holds 306 clubs." ("twelve" in Division 3), from `groupsNote` in `engine.js`;
  it is absent for Division 1 and for a career from before the three tiers.
- **Signature element:** the pitch diagram: a drawn pitch with your formation
  as white player tokens you drag to swap, the goalkeeper in amber. Small line
  icons mark each kind of moment in the report (a ball, a card, a swap arrow,
  a cross).
- **Facility levels:** the Club tab's five-step bar reuses the Squad list's
  fitness green (`pitch-ink`) for filled steps on the raised background, the
  step that just filled flashing amber once (off under reduced motion); the
  upgrade button is the plain secondary button, not amber. A Downgrade button
  is the plain secondary button before Upgrade, absent at level 1, free, with
  no flash; the maintenance line names the level-down cost too. The balance at
  the top of the tab is the same `.bal` row as Home's Wallet.
- **Staff and Academy:** two more sections on the Club tab below Facilities,
  built from the same list rows. There is no new primary action: Hire, Release
  and Promote are the plain secondary button, never amber, and a role you
  cannot afford shows "N needed" in muted text like a facility. Academy rows
  look like Squad list rows (position, name with a small line, overall) with
  Promote at the end; an empty academy says the academy takes in N after every
  matchday. Hire, release and promotion failures use the same error box and
  Retry as a failed upgrade.
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
  price, the starting balance and the sale values live only in `server.js`
  (`TIER_PRICE`, `STARTING_BALANCE`, `SALE_VALUE`). The server owns the
  `wallets` table (staging:private) and changes a balance only on a purchase
  (debit, inside `POST`'s transaction) or a sale (credit, inside `DELETE`'s).
  The browser never sends an amount, `PUT /api/career` never changes money, and
  `state.wallet` in a career is only a display copy written at purchase. A
  first-time manager's row is seeded with `STARTING_BALANCE`; careers saved
  before the table grandfather their `state.wallet.balance` on boot.
- The pyramid is capped at three tiers and 306 clubs (the early-stage maximum):
  no Division 4. The shop lists every division's clubs at its tier price
  (`TIER_PRICE`), and a manager owns one club at a time. Selling a club, owning more than one and real USDC come
  later; the purchase is stored so selling can be added.

## Licensing and legal

`AGENTS.md` at the root carries a summary of this section for tools that read
that file; this section is authoritative if the two ever disagree, and the two
should be fixed in the same change. Public prose (README, in-app copy) stays
fictional too, as the rest of this section requires.

1. **Invented names only.** Every club, player, manager, coach, staff member,
   sponsor, ground and competition name in the game is invented, and new ones
   stay invented. The pools that generate every name in the game live in
   `public/engine.js` and are what an extending agent keeps clean:
   `COASTAL_CLUBS` (the ten original clubs, their grounds and badge colours),
   `PLACE_POOL`, `CLUB_SUFFIXES` and `GROUND_WORDS` (the 152 generated clubs),
   `FIRST_NAMES` and `LAST_NAMES` (players, staff and managers),
   `SPONSOR_NAMES`, `PEAK_NAMES`, `STAFF_ROLES`, `FACILITIES` and
   `LEAGUE_NAME`. A name is not safe merely because it is not spelled
   identically to a real one: a famous surname paired with a fitting first
   name, a real club's nickname ("The Reds"), a real club's name with one word
   swapped, or a real player's full name all count as real. When a generated
   or hand-picked combo collides with a famous real name, change one part.
   Some `PLACE_POOL` entries coincide with small real settlements (Jarrow,
   Ivybridge, Mossley, Millbrook, …) — geographic names are facts, not
   trademarks, and stay.
2. **No real marks or looks.** Badges stay initials on a plain colour; never
   draw, fetch or approximate a real club's crest or kit, a brand's logo, or
   one real club's distinctive colour identity.
3. **Generated data only.** Squads, attributes, results and ratings come from
   the seeded generator (`buildSquad`, `ageingFor`, the pyramid seed). Never
   load a real player database, real fixtures, photos or third-party data
   APIs; never scrape.
4. **Mock money stays mock.** Dummy USDC and Club credits are play
   currencies; no real payment, wallet or crypto integration, ever. The
   Finance tab's "Staging mock" tag stays.
5. **Permissive inputs only.** Any new dependency, vendored file, font, icon
   set or data file must carry a permissive licence (MIT, Apache-2.0, BSD,
   ISC) and have its source and licence recorded — the platform's
   vendored-file convention covers vendored runtime files, and new npm
   packages should be mainstream and permissively licensed. Never paste code
   of unknown origin. Icons stay hand-drawn inline SVG on the platform's
   line-icon grid.
6. **Original mechanics.** Design features fresh; do not port code, data or a
   named patented mechanic from a commercial game.
7. **When a request asks for the real thing** (a real club, player,
   competition or brand), do not refuse the intent — build the invented
   equivalent in the same style as the rest of the game, and say in the
   change notes why the real name was not used.
8. **The audit.** On 2026-10-24 the whole tree was grepped for major real
   club, player, manager, league and brand names and the pools above were read
   in full: no real-world names anywhere, so the baseline is clean. Re-check
   the pools when extending them; the greps to repeat are any list of major
   real football names and brands.
