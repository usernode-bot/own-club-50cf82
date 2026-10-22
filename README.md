# Own Club

A football management game for the browser. You name your manager, get a mock
wallet of 1,000 Dummy USDC and buy a club in one of Division 8's first four
groups for 100, then set your eleven on a pitch diagram, choose the formation,
mentality and pressing, and play each of your group's 34 matchdays and read the
match report. Squads tire, pick up cards and injuries, and the group table
builds up as the season goes.

The Coastal League is an eight-division pyramid of 78,714 fictional clubs.
Division 1 is one group of 18; Division 2 has four groups, Division 3 twelve,
Division 4 thirty-six, and every division below that three times the groups of
the one above it, down to Division 8's 2,916. The top 2 of every group go up
(only Division 1 has a champion); the bottom 8 of Division 1 and the bottom 6 of
every group in Divisions 2 to 7 go down, two into each of the groups below, so
every group stays at 18. Nobody leaves Division 8. Start next season takes the
same club and players into its new group. Lower divisions start with weaker
players.

Only the manager's own group is stored and played out in full. Its clubs below
the first 162 are generated from their place in the pyramid, so the same place
always gives the same club; the groups around it are played out from the
career's seed at a rollover to decide who comes and goes.

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
  `/api/career`.
- `public/index.html` and `public/screens.css` carry the drawn club screen and
  match report; `public/app.css` adds the pitch canvas, the player sheet and
  the rest of the interaction.
- `server.js` boots the `careers` table, serves the API, the shop's price and
  starting balance, and the demo. A career saved by an earlier version of the
  app passes through `repairCareer` in `engine.js` as it loads, which fills in
  only what is missing, so it still opens. A career saved in the old eight
  divisions finishes its season and joins the pyramid at Start next season, in
  the same-numbered division (old Division 1 is Division 1, old Division 8 is
  Division 8).

## Running it

    npm install
    npm run build
    DATABASE_URL=postgres://... node server.js

`npm run build` compiles `public/tailwind.css` from
`styles/tailwind-input.css`.
