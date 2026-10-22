# Own Club

A football management game for the browser. You name your manager, get a mock
wallet of 1,000 Dummy USDC and buy one of the 72 Division 3 clubs for 100, then
set your eleven on a pitch diagram, choose the formation, mentality and pressing,
and follow your club through its group's 34 matchdays. Four tabs split the club
screen: Home, Squad, Tactics and Competition, in a bar along the bottom on a
phone and a sidebar on a laptop. Matches play by themselves at 9 am, 3 pm and
9 pm on the manager's own clock, with the lineup and tactics last saved, so a
season takes about twelve days. Squads tire, pick up cards and injuries, and the
group table builds up as the season goes.

A Division 3 club has one manager, so a taken club shows as Taken in the shop.
A club comes free when its manager starts a new career.

The Coastal League has three tiers and 162 fictional clubs. Division 1 is one
group of 18; Divisions 2 and 3 have four groups each, A to D, of 18. At the end
of a season the bottom 8 of Division 1 go down (two into each Division 2 group),
the top 2 of each Division 2 group go up and its bottom 2 go down into the
same-letter Division 3 group, and the top 2 of each Division 3 group go up.
Nobody leaves Division 3, and every group stays at 18. Start next season takes
the same club and players into its new group. Lower tiers start with weaker
players.

Dummy USDC is a mock: there is no crypto wallet, no payment and no real money
anywhere in the app. The club price and the starting balance live only in
`server.js`, and a save never changes them.

There is no sign-in of its own: the app runs on Homeroom, which tells it who is
signed in, and keeps each person's career in its own Postgres table.

## How it is built

- `public/engine.js` is the whole football simulation as a plain ES module:
  the generated pyramid, seeded squads and fixtures, a match simulator that is
  reproducible from a seed, and the season rollover. It has no DOM and no
  network, and the server imports the same file.
- `public/app.js` renders the screens and saves the career through
  `/api/career`. The server plays every kick-off that has passed on each load,
  stamped with its own slot time, so no result is skipped.
- `public/index.html` and `public/screens.css` carry the drawn club screen and
  match report; `public/app.css` adds the pitch canvas, the player sheet and
  the rest of the interaction.
- `server.js` boots the `careers` table, serves the API, the shop's price and
  starting balance, the `club_owners` table (one manager per club), and the
  demo. A career saved by an earlier version of the
  app passes through `repairCareer` in `engine.js` as it loads, which fills in
  only what is missing, so it still opens. A career saved in the old eight
  divisions finishes its season and joins the three tiers at Start next
  season, in the tier its old division maps to (Division 1 to Division 1,
  Division 2 to Division 2, Divisions 3 to 8 to Division 3).

## Running it

    npm install
    npm run build
    DATABASE_URL=postgres://... node server.js

`npm run build` compiles `public/tailwind.css` from
`styles/tailwind-input.css`.
