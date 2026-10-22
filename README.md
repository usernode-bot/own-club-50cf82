# Own Club

A football management game for the browser. You are the manager of one of ten
fictional clubs in the Coastal League: pick your eleven on a pitch diagram,
set the formation, mentality and pressing, then play each of the 18 matchdays
and read the match report. Squads tire, pick up cards and injuries, and the
league table builds up as the season goes.

There is no sign-in of its own: the app runs on Homeroom, which tells it who is
signed in, and keeps each person's career in its own Postgres table.

## How it is built

- `public/engine.js` is the whole football simulation as a plain ES module:
  seeded squads and fixtures, and a match simulator that is reproducible from
  a seed. It has no DOM and no network, and the server imports the same file.
- `public/app.js` renders the screens and saves the career through
  `/api/career`.
- `public/index.html` and `public/screens.css` carry the drawn club screen and
  match report; `public/app.css` adds the pitch canvas, the player sheet and
  the rest of the interaction.
- `server.js` boots the `careers` table, serves the API and the demo.

## Running it

    npm install
    npm run build
    DATABASE_URL=postgres://... node server.js

`npm run build` compiles `public/tailwind.css` from
`styles/tailwind-input.css`.
