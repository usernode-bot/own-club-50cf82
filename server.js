const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { queryWithRetry, loadFailureBody } = require('./career-db');
const { buyListing } = require('./transfers-db');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// node-pg emits 'error' on the pool when an idle client's connection dies.
// With no listener Node would throw it and the process would exit, which is
// itself one way players see the career error screen.
pool.on('error', (err) => {
  console.error('db idle client error: ' + ((err && err.code) || '') + ' ' + (err && err.message));
});

// The platform signs user-identity tokens with an RSA private key it never
// shares. Containers get only the PUBLIC half, so this app can verify who a
// user is but cannot mint an identity — and neither can any other app.
const JWT_PUBLIC_KEY = (process.env.USERNODE_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Tokens are minted for one app: the audience is this app's numeric id, so a
// token issued for a different app is rejected below rather than accepted as
// a valid user.
const APP_AUDIENCE = process.env.USERNODE_APP_ID
  ? 'usernode:app:' + process.env.USERNODE_APP_ID
  : null;

// Visitors with no Homeroom account ("guests") may look around this app at
// its own address, read-only (every public app). The platform marks
// them with a token of their own: ES256, signed by a key of its own (its
// public half is USERNODE_GUEST_JWT_PUBLIC_KEY), this audience, `pur:
// 'guest'`, `guest: true`, and no id or username. Such a visitor is
// `req.guest`, never `req.user`, and every write they try is answered 401
// `account_required`, which the bridge turns into "Make an account to
// continue".
const GUEST_AUDIENCE = APP_AUDIENCE ? APP_AUDIENCE + ':guest' : null;
const GUEST_PUBLIC_KEY = (process.env.USERNODE_GUEST_JWT_PUBLIC_KEY || '')
  .replace(/\\n/g, '\n');

// Paths that stay open without authentication. Add a path here (and add it
// with `app.get`/`app.post` below) if you deliberately want it public.
// Everything else requires a valid platform-issued JWT.
const PUBLIC_API_PATHS = new Set(['/health']);

// A career's state carries every squad, fixture, result and match report.
app.use(express.json({ limit: '8mb' }));

// The platform's three centrally hosted files — the bridge, the native UI
// kit and the Tailwind runtime — are reachable at these paths on this app's
// OWN origin, so index.html can load them with a RELATIVE path and never
// name the platform's hostname. A hostname baked into an app is what breaks
// every app at once when the platform's domain moves.
//
// In production and on a staging preview the platform's edge answers these
// before the request ever reaches this process (a per-app Ingress rule on
// Kubernetes, the wildcard site's matcher on the docker runtime). This
// handler is what makes the same relative paths work under a plain
// `node server.js`, where there is no edge in front of the app at all.
//
// Registered BEFORE the auth middleware because these three files are
// public: the platform serves them anonymously from any app origin, and a
// login redirect arriving where a <script> was expected is exactly the
// failure a relative path is meant to avoid.
// The platform's origin, at RUNTIME, and ONLY from the variable the platform
// injects. No hostname is written into this file: a baked-in one is what left
// the whole fleet pointing at a domain the platform had moved away from.
// Unset only outside the platform (a plain local `node server.js`) — set
// USERNODE_PLATFORM_ORIGIN there too if you want the hosted assets locally.
const PLATFORM_ORIGIN = (process.env.USERNODE_PLATFORM_ORIGIN || '')
  .replace(/\/+$/, '');
// This project's address on the platform (/app/<slug>), from the variable the
// platform injects, and not written in here either: every project made from
// the same starter is then the same code. Unset only outside the platform.
const APP_SLUG = process.env.USERNODE_APP_SLUG || '';

app.get(/^\/usernode-(?:bridge|native|tailwind)\//, async (req, res) => {
  try {
    if (!PLATFORM_ORIGIN) return res.sendStatus(503);
    const upstream = await fetch(PLATFORM_ORIGIN + req.path);
    if (!upstream.ok) return res.sendStatus(upstream.status);
    const type = upstream.headers.get('content-type');
    if (type) res.type(type);
    // max-age=0 with revalidation, never a long TTL: the whole point of
    // central hosting is that a platform-side fix lands on the next load.
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (err) {
    console.warn('hosted asset fetch failed: ' + err.message);
    return res.sendStatus(502);
  }
});

// Homeroom's requests about one person's data: erase it when they delete
// their account, export it when they ask for a copy. Mounted BEFORE the
// sign-in check because they carry a platform token of their own, which
// usernode-user-data.js verifies. When you add a table, check that file's
// OWNED_BY and SKIP lists ("Your people's data" in the platform conventions).
require('./usernode-user-data').mount(app, pool);

// "Now" for this request, as a Date: `req.now`, set for every request by
// the middleware below. Read the day and the time through it (and
// `usernode.now()` in the page), never `new Date()` or SQL's NOW(),
// wherever they decide what shows: a reminder, a rota, a deadline.
// Production always gets the real time. A staging preview may be shown as of
// a chosen moment: the platform opens it with `?un-now=<ISO time>`, and the
// page sends `usernode.now()` on as the `x-usernode-now` header. Only a
// staging container reads either. See "Time-dependent features" in the
// platform conventions.
const IS_STAGING = process.env.USERNODE_ENV === 'staging';
const PREVIEW_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
function requestNow(req) {
  const raw = IS_STAGING ? (req.headers['x-usernode-now'] || req.query['un-now']) : null;
  return typeof raw === 'string' && PREVIEW_NOW.test(raw) ? new Date(raw) : new Date();
}

// Verify platform-issued JWT if one was passed, then enforce auth on
// anything not explicitly marked public. The iframe adds `?token=…`
// on load; the frontend script forwards the token via `x-usernode-token`
// on subsequent fetches.
app.use((req, res, next) => {
  req.now = requestNow(req);
  const token = req.query.token || req.headers['x-usernode-token'];
  if (token && JWT_PUBLIC_KEY && APP_AUDIENCE) {
    try {
      // Pin the algorithm, issuer and audience. Without `algorithms` a
      // caller could hand us an HS256 token signed with the public PEM
      // (which every app knows) and forge any user.
      const claims = jwt.verify(token, JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
        issuer: 'usernode',
        audience: APP_AUDIENCE,
      });
      // `pur` names what the token is for. Only user-identity tokens
      // authenticate a person here.
      if (claims && claims.pur === 'iframe') req.user = claims;
    } catch {}
  }
  if (!req.user && token && GUEST_PUBLIC_KEY && GUEST_AUDIENCE) {
    try {
      const guest = jwt.verify(token, GUEST_PUBLIC_KEY, {
        algorithms: ['ES256'],
        issuer: 'usernode',
        audience: GUEST_AUDIENCE,
      });
      if (guest && guest.pur === 'guest' && guest.guest === true) req.guest = true;
    } catch {}
  }

  // Static assets (CSS/JS/images) are always served; the API and the HTML
  // shell are gated so direct hits to the staging/prod subdomain don't
  // leak app data to the public internet. A guest may READ: every GET,
  // `/api/*` included, so read routes must not assume req.user (use
  // `req.user ? req.user.id : null`). Every write needs an account.
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    if (PUBLIC_API_PATHS.has(req.path)) return next();
    if (!req.user && req.guest) {
      if (req.method === 'GET' || req.method === 'HEAD') return next();
      return res.status(401).json({ error: 'account_required' });
    }
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));


// ── The football engine ─────────────────────────────────────────────────
// public/engine.js is a browser ES module; the server imports the same file
// so a career and the demo are built by exactly the code the app runs.
let enginePromise = null;
function engine() {
  if (!enginePromise) {
    enginePromise = import(pathToFileURL(path.join(__dirname, 'public', 'engine.js')).href);
  }
  return enginePromise;
}

// The demo's fixed seed puts Harbourside third on 32 points after seventeen
// matchdays of a Division 1 season, as the spec's staging demo describes.
const DEMO_SEED = 1;

// The demo season is always shown in London time, so every voter sees the
// same day and the same four match times.
function demoCareer(e, now) {
  const state = e.buildDemoState(DEMO_SEED);
  state.timeZone = 'Europe/London';
  state.plays = [];
  state.nextMatchAt = e.firstSlotOfDay(now, 'Europe/London').toISOString();
  return state;
}

// The dummy money: a staging mock, never a real payment. Every new manager is
// given this much to buy one Division 3 club, and a sale pays back by the tier
// the club is in. The server owns the wallet in `wallets` and is the only
// place a balance changes (a purchase debits it, a sale credits it); the
// browser never sends an amount.
const CURRENCY = 'Dummy USDC';
// What a club costs, by the division it is in on the day it is bought.
const TIER_PRICE = { 1: 300, 2: 200, 3: 100 };
const STARTING_BALANCE = 1000;
// What selling pays, by the division the club is in on the day it is sold.
const SALE_VALUE = { 1: 300, 2: 200, 3: 100 };
const SHOP = {
  prices: TIER_PRICE,
  price: TIER_PRICE[3],
  startingBalance: STARTING_BALANCE,
  currency: CURRENCY,
  saleValues: SALE_VALUE,
};

// ── The career table ─────────────────────────────────────────────────────
// One row per person (and one demo row per person), holding the whole saved
// season as JSON. It carries the manager's name, so it is staging:private.
async function boot() {
  await pool.query(`CREATE TABLE IF NOT EXISTS careers (
    user_id text NOT NULL,
    is_demo boolean NOT NULL DEFAULT false,
    manager_name text NOT NULL,
    club_id text NOT NULL,
    seed integer NOT NULL,
    state jsonb NOT NULL,
    version integer NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, is_demo)
  )`);
  await pool.query("COMMENT ON TABLE careers IS 'staging:private'");
  // A table that already exists from an earlier version of the app keeps its
  // rows: only columns that are missing are added, never dropped or retyped.
  const guards = [
    'is_demo boolean NOT NULL DEFAULT false',
    "manager_name text NOT NULL DEFAULT ''",
    "club_id text NOT NULL DEFAULT ''",
    'seed integer NOT NULL DEFAULT 1',
    'state jsonb',
    'version integer NOT NULL DEFAULT 1',
    'updated_at timestamptz NOT NULL DEFAULT now()',
  ];
  for (const column of guards) {
    const name = column.split(' ')[0];
    try {
      await pool.query('ALTER TABLE careers ADD COLUMN IF NOT EXISTS ' + column);
    } catch (err) {
      // A table this version cannot bring up to date would fail every
      // career read later. Stop the start instead, so the deployed app
      // never runs against a drifted careers table.
      const wrapped = new Error('careers guard failed: ' + name + ': ' + (err && err.message));
      if (err && err.code) wrapped.code = err.code;
      throw wrapped;
    }
  }
  // One manager per Division 3 club. This table holds no names, so it is
  // public. It has no foreign key to careers: that table is private.
  await pool.query(`CREATE TABLE IF NOT EXISTS club_owners (
    club_id text PRIMARY KEY,
    user_id text NOT NULL,
    acquired_at timestamptz NOT NULL DEFAULT now()
  )`);
  // Careers saved before this change keep their club: a club several managers
  // already share stays with all of them and is simply taken for new buyers.
  await pool.query(`INSERT INTO club_owners (club_id, user_id, acquired_at)
    SELECT DISTINCT ON (club_id) club_id, user_id, updated_at
      FROM careers WHERE NOT is_demo AND club_id <> ''
      ORDER BY club_id, updated_at
    ON CONFLICT (club_id) DO NOTHING`);
  if (IS_STAGING) {
    await pool.query(`INSERT INTO club_owners (club_id, user_id) VALUES
      ('wrenfield-wanderers', 'staging-demo-owner-1'),
      ('torcross-rovers', 'staging-demo-owner-2')
      ON CONFLICT (club_id) DO NOTHING`);
  }
  // The money a person keeps across careers. It holds a balance, so it is
  // staging:private. It has a user_id column, so usernode-user-data.js erases
  // it and exports it by default.
  await pool.query(`CREATE TABLE IF NOT EXISTS wallets (
    user_id text PRIMARY KEY,
    usdc integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("COMMENT ON TABLE wallets IS 'staging:private'");
  // Careers that already exist keep the balance their career shows: nobody
  // loses money when the wallet moves out of the career.
  await pool.query(`INSERT INTO wallets (user_id, usdc)
    SELECT user_id, round((state->'wallet'->>'balance')::numeric)::integer
      FROM careers
     WHERE NOT is_demo AND jsonb_typeof(state->'wallet'->'balance') = 'number'
    ON CONFLICT (user_id) DO NOTHING`);
  // The transfer market. It holds fictional players and ids, no names of
  // people, and no foreign key to the private careers table, so it is public.
  await pool.query(`CREATE TABLE IF NOT EXISTS transfer_listings (
    id serial PRIMARY KEY,
    seller_user_id text NOT NULL,
    seller_club_id text NOT NULL,
    player jsonb NOT NULL,
    asking_price integer NOT NULL CHECK (asking_price BETWEEN 1 AND 1000000),
    created_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS transfer_listings_seller ON transfer_listings (seller_user_id)');
  if (IS_STAGING) {
    // Three obviously fake players from the two fake staging clubs, put back
    // whenever one has been bought.
    const seeds = [
      ['staging-demo-owner-1', 'wrenfield-wanderers', 'Staging Demo Striker', 'ST', 31, 58, 3200],
      ['staging-demo-owner-2', 'torcross-rovers', 'Staging Demo Midfielder', 'CM', 24, 55, 2400],
      ['staging-demo-owner-1', 'wrenfield-wanderers', 'Staging Demo Keeper', 'GK', 29, 52, 1500],
    ];
    for (const [user, club, name, pos, age, overall, price] of seeds) {
      const attrs = { pac: overall - 2, pas: overall - 1, sho: overall, def: overall - 3, gk: pos === 'GK' ? overall + 6 : overall - 20 };
      const player = {
        id: 'staging-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name, pos, age, attrs, overall, fitness: 90, morale: 70, injury: 0,
        goals: 0, assists: 0, apps: 0, yellow: 0, red: 0, captain: false,
      };
      await pool.query(`INSERT INTO transfer_listings (seller_user_id, seller_club_id, player, asking_price)
        SELECT $1, $2, $3::jsonb, $4
         WHERE NOT EXISTS (
           SELECT 1 FROM transfer_listings WHERE seller_user_id = $1 AND player->>'name' = $5)`,
        [user, club, player, price, name]);
    }
  }
}

// Play every kick-off that has passed since the career's nextMatchAt, using
// the saved lineup and tactics. The demo always uses London time. A career
// with no saved zone is left alone until the page sends one.
async function catchUp(row, now, demo, fallbackZone) {
  const e = await engine();
  const state = row.state;
  const zone = demo ? 'Europe/London'
    : e.validTimeZone(state.timeZone) ? state.timeZone
      : fallbackZone && e.validTimeZone(fallbackZone) ? fallbackZone : null;
  if (!zone) return { state, version: row.version, autoPlayed: 0, changed: false, zone };
  let changed = false;
  if (!state.finished && !state.nextMatchAt) {
    // A career with no schedule starts at the next kick-off, not at one it
    // missed before this change shipped.
    state.nextMatchAt = (demo ? e.firstSlotOfDay(now, zone) : e.slotAfter(now, zone)).toISOString();
    changed = true;
  }
  const played = e.playDueMatches(state, now, zone);
  if (played) changed = true;
  return { state, version: row.version, autoPlayed: played, changed, zone };
}

async function catchUpAndSave(userId, demo, row, now, fallbackZone) {
  const out = await catchUp(row, now, demo, fallbackZone);
  if (!out.changed) return out;
  const upd = await pool.query(
    'UPDATE careers SET state = $3, version = version + 1 WHERE user_id = $1 AND is_demo = $2 AND version = $4 RETURNING version',
    [userId, demo, out.state, row.version]
  );
  if (upd.rows.length) {
    out.version = upd.rows[0].version;
    return out;
  }
  // Another request won the race. Every career is deterministic from its
  // seed, so re-reading gives the same matches.
  const again = await pool.query('SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2', [userId, demo]);
  if (again.rows.length) {
    out.state = again.rows[0].state;
    out.version = again.rows[0].version;
  }
  return out;
}

async function takenClubs() {
  const { rows } = await pool.query('SELECT club_id FROM club_owners');
  return rows.map((r) => r.club_id);
}

// ?demo=1 acts on the viewer's demo career, and only in staging.
function wantsDemo(req) {
  return IS_STAGING && req.query.demo === '1';
}

function validName(name) {
  return typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 40;
}

app.get('/api/career', async (req, res) => {
  const demo = wantsDemo(req);
  try {
    if (!req.user) {
      // A guest looking around in staging sees the demo season, read-only.
      if (demo) {
        const e = await engine();
        const state = demoCareer(e, req.now);
        const out = await catchUp({ state, version: 1 }, req.now, true);
        return res.json({
          career: out.state, version: 1, demo: true, shop: SHOP, autoPlayed: out.autoPlayed,
        });
      }
      const eg = await engine();
      const taken = await takenClubs();
      return res.json({ career: null, version: 0, demo: false, shop: {
        ...SHOP,
        taken,
        groups: eg.shopGroups(taken),
        balance: STARTING_BALANCE,
        kept: false,
      } });
    }
    const { rows } = await queryWithRetry(
      pool,
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    if (rows.length) {
      const state = rows[0].state;
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        const requestId = crypto.randomUUID().slice(0, 8);
        console.error('career load failed [' + requestId + '] career_unreadable state is not an object');
        return res.status(500).json({ error: 'career_unreadable', requestId, message: 'The saved career could not be shown.' });
      }
      // Every kick-off that has passed is played now, with the saved lineup
      // and tactics, and the result is stored before the page sees it.
      const out = await catchUpAndSave(req.user.id, demo, { state, version: rows[0].version }, req.now);
      return res.json({ career: out.state, version: out.version, demo, shop: SHOP, autoPlayed: out.autoPlayed });
    }
    if (demo) {
      const e = await engine();
      const state = demoCareer(e, req.now);
      const out = await catchUp({ state, version: 1 }, req.now, true);
      await pool.query(
        `INSERT INTO careers (user_id, is_demo, manager_name, club_id, seed, state, version)
         VALUES ($1, true, $2, $3, $4, $5, 1)
         ON CONFLICT (user_id, is_demo) DO NOTHING`,
        [req.user.id, 'Demo Manager', state.clubId, DEMO_SEED, out.state]
      );
      const again = await pool.query(
        'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = true',
        [req.user.id]
      );
      return res.json({ career: again.rows[0].state, version: again.rows[0].version, demo: true, shop: SHOP, autoPlayed: out.autoPlayed });
    }
    // No career yet is an ordinary answer: the page shows New career, with the
    // wallet this person already has (a first-time manager gets the starting
    // balance). A guest gets none.
    const e = await engine();
    const wallet = await queryWithRetry(pool, 'SELECT usdc FROM wallets WHERE user_id = $1', [req.user.id]);
    const stored = wallet.rows[0];
    const taken = await takenClubs();
    return res.json({
      career: null,
      version: 0,
      demo: false,
      shop: {
        ...SHOP,
        taken,
        groups: e.shopGroups(taken),
        balance: e.openingBalance(stored && stored.usdc, STARTING_BALANCE),
        kept: !!stored,
      },
    });
  } catch (err) {
    const requestId = crypto.randomUUID().slice(0, 8);
    console.error('career load failed [' + requestId + '] ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json(loadFailureBody(err, requestId));
  }
});

// A sold club goes back to the shop, then passes on to any other grandfathered
// manager who still runs it.
async function releaseClub(client, clubId, userId) {
  if (!clubId) return;
  await client.query('DELETE FROM club_owners WHERE club_id = $1 AND user_id = $2', [clubId, userId]);
  await client.query(
    `INSERT INTO club_owners (club_id, user_id)
     SELECT club_id, user_id FROM careers WHERE club_id = $1 AND NOT is_demo AND user_id <> $2 LIMIT 1
     ON CONFLICT (club_id) DO NOTHING`,
    [clubId, userId]
  );
}

app.post('/api/career', async (req, res) => {
  const demo = wantsDemo(req);
  const { managerName, clubId } = req.body || {};
  if (!validName(managerName)) {
    return res.status(400).json({ error: 'manager_name', message: 'A manager name is 1 to 40 characters.' });
  }
  try {
    const e = await engine();
    // The shop and the price are the server's: a forged club or balance in the
    // request body never gets through. The price follows the division the
    // club is in today. The balance is checked inside the transaction,
    // against the wallet that is being debited.
    const groupIndex = e.clubToGroup[clubId];
    if (groupIndex === undefined) {
      return res.status(400).json({ error: 'club', message: 'That club is not in the shop.' });
    }
    const tier = e.GROUPS[groupIndex].tier;
    const price = TIER_PRICE[tier];
    if (e.purchaseError(clubId, price, price) === 'club') {
      return res.status(400).json({ error: 'club', message: 'That club is not in the shop.' });
    }
    const zone = e.validTimeZone(req.body && req.body.timeZone) ? req.body.timeZone : 'UTC';
    const seed = crypto.randomInt(1, 2147483647);
    const state = e.buildInitialState(clubId, managerName.trim(), seed);
    state.managerName = managerName.trim();
    state.timeZone = demo ? 'Europe/London' : zone;
    state.nextMatchAt = e.slotAfter(req.now, state.timeZone).toISOString();
    state.purchase = { clubId, price, tier, at: req.now.toISOString() };

    if (demo) {
      const demoState = demoCareer(e, req.now);
      demoState.managerName = managerName.trim();
      const out = await catchUp({ state: demoState, version: 1 }, req.now, true);
      const { rows } = await pool.query(
        `INSERT INTO careers (user_id, is_demo, manager_name, club_id, seed, state, version)
         VALUES ($1, true, $2, $3, $4, $5, 1)
         ON CONFLICT (user_id, is_demo) DO UPDATE SET
           manager_name = EXCLUDED.manager_name, club_id = EXCLUDED.club_id,
           seed = EXCLUDED.seed, state = EXCLUDED.state,
           version = careers.version + 1, updated_at = now()
         RETURNING state, version`,
        [req.user.id, demoState.managerName, demoState.clubId, DEMO_SEED, out.state]
      );
      return res.json({ career: rows[0].state, version: rows[0].version, demo });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // One club at a time: a manager sells before buying another.
      const existing = await client.query(
        'SELECT 1 FROM careers WHERE user_id = $1 AND is_demo = false FOR UPDATE',
        [req.user.id]
      );
      if (existing.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'has_club', message: 'Sell your club before you buy another.' });
      }
      const claim = await client.query(
        'INSERT INTO club_owners (club_id, user_id) VALUES ($1, $2) ON CONFLICT (club_id) DO NOTHING RETURNING club_id',
        [clubId, req.user.id]
      );
      if (!claim.rows.length) {
        const owner = await client.query('SELECT user_id FROM club_owners WHERE club_id = $1', [clubId]);
        if (owner.rows.length && owner.rows[0].user_id !== req.user.id) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: 'owned',
            message: 'Another manager already runs ' + e.CLUB_BY_ID[clubId].name + '. Choose another club.',
          });
        }
      }
      // A first-time manager is given the starting balance; the club is paid
      // for out of the wallet the person keeps between careers.
      await client.query(
        'INSERT INTO wallets (user_id, usdc) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [req.user.id, STARTING_BALANCE]
      );
      const wallet = await client.query('SELECT usdc FROM wallets WHERE user_id = $1 FOR UPDATE', [req.user.id]);
      const storedBalance = wallet.rows.length ? wallet.rows[0].usdc : STARTING_BALANCE;
      if (e.purchaseError(clubId, storedBalance, price) === 'balance') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'balance', message: 'Your Dummy USDC does not cover this club.' });
      }
      const debit = await client.query(
        'UPDATE wallets SET usdc = usdc - $2, updated_at = now() WHERE user_id = $1 RETURNING usdc',
        [req.user.id, price]
      );
      // The career's wallet is a display copy of the row, written here only.
      state.wallet = { currency: CURRENCY, balance: debit.rows[0].usdc };
      const { rows } = await client.query(
        `INSERT INTO careers (user_id, is_demo, manager_name, club_id, seed, state, version)
         VALUES ($1, false, $2, $3, $4, $5, 1)
         ON CONFLICT (user_id, is_demo) DO UPDATE SET
           manager_name = EXCLUDED.manager_name,
           club_id = EXCLUDED.club_id,
           seed = EXCLUDED.seed,
           state = EXCLUDED.state,
           version = careers.version + 1,
           updated_at = now()
         RETURNING state, version`,
        [req.user.id, state.managerName, clubId, seed, state]
      );
      await client.query('COMMIT');
      return res.json({ career: rows[0].state, version: rows[0].version, demo });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('career create failed: ' + err.message);
    return res.status(500).json({ error: 'career_create_failed' });
  }
});

app.put('/api/career', async (req, res) => {
  const demo = wantsDemo(req);
  const { state, version } = req.body || {};
  if (!state || typeof state !== 'object' || !Number.isInteger(version)) {
    return res.status(400).json({ error: 'state_or_version' });
  }
  try {
    const e = await engine();
    if (!e.CLUB_BY_ID[state.clubId]) return res.status(400).json({ error: 'club' });
    const { rows: storedRows } = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    if (!storedRows.length) return res.status(404).json({ error: 'no_career' });
    const incomingZone = e.validTimeZone(state.timeZone) ? state.timeZone : null;
    // A kick-off that passed before this save plays first. The page reloads
    // and shows the new result.
    const up = await catchUpAndSave(req.user.id, demo, storedRows[0], req.now, incomingZone);
    if (up.autoPlayed > 0) return res.status(409).json({ error: 'version_mismatch' });
    const stored = up.state;
    const zone = demo ? 'Europe/London'
      : e.validTimeZone(stored.timeZone) ? stored.timeZone
        : incomingZone || 'UTC';
    // The page never decides how far the season has advanced.
    const check = e.saveCheck(stored, state);
    if (check === 'stale') return res.status(409).json({ error: 'version_mismatch' });
    let nextMatchAt = stored.nextMatchAt === undefined ? null : stored.nextMatchAt;
    if (check === 'rollover' || (!stored.finished && !nextMatchAt)) {
      nextMatchAt = e.slotAfter(req.now, zone).toISOString();
    }
    // The browser never sets the money: a career that has a wallet keeps the
    // one already stored, and a career without one cannot gain one. Club
    // credits, fans, the sponsor and this season's totals are the server's
    // too. A played match adds them; a rollover settles the sponsor fee from
    // the stored finished season, so the page cannot award itself one.
    const money = check === 'rollover' ? e.seasonEndMoney(stored) : e.moneyFields(stored);
    // The page never decides who is in the squad: a listed, sold or retired
    // player cannot be brought back by a stale or forged save.
    const guardedSquad = check === 'rollover'
      ? e.startNextSeason(stored).squads[stored.clubId]
      : (stored.squads && Array.isArray(stored.squads[stored.clubId])
        ? stored.squads[stored.clubId] : state.squads[state.clubId]);
    const ids = new Set(guardedSquad.map((p) => p.id));
    let lineup = Array.isArray(state.lineup) ? state.lineup : stored.lineup;
    if (!Array.isArray(lineup) || lineup.length !== 11 || new Set(lineup).size !== 11
      || !lineup.every((id) => ids.has(id))) {
      lineup = e.autoLineup(guardedSquad, (state.tactics && state.tactics.formation) || stored.tactics.formation, state.roles || {});
    }
    const saved = {
      ...state,
      ...money,
      squads: { ...(state.squads || {}), [stored.clubId]: guardedSquad },
      lineup,
      plays: Array.isArray(stored.plays) ? stored.plays : [],
      nextMatchAt,
      timeZone: zone,
    };
    const { rows } = await pool.query(
      // The browser never sets the money: a career that has a wallet keeps
      // the one already stored, and a career without one cannot gain one. Club
      // credits and facilities are the server's too: only a played match adds
      // credits and only an upgrade raises a facility, so both keep the stored
      // values whatever the page sends.
      `UPDATE careers SET state = (CASE WHEN careers.state ? 'wallet'
          THEN $3::jsonb || jsonb_build_object('wallet', careers.state->'wallet', 'purchase', careers.state->'purchase')
          ELSE $3::jsonb - 'wallet' - 'purchase' END)
          || jsonb_build_object('credits', COALESCE(careers.state->'credits', '0'::jsonb),
                                'facilities', COALESCE(careers.state->'facilities', '{}'::jsonb),
                                'staff', COALESCE(careers.state->'staff', '{}'::jsonb),
                                'youth', COALESCE(careers.state->'youth', '[]'::jsonb)),
        version = version + 1, updated_at = now()
        WHERE user_id = $1 AND is_demo = $2 AND version = $4
        RETURNING version`,
      [req.user.id, demo, saved, up.version]
    );
    if (rows.length) return res.json({ version: rows[0].version });
    const exists = await pool.query(
      'SELECT 1 FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    return exists.rows.length
      ? res.status(409).json({ error: 'version_mismatch' })
      : res.status(404).json({ error: 'no_career' });
  } catch (err) {
    console.error('career save failed: ' + err.message);
    return res.status(500).json({ error: 'career_save_failed' });
  }
});

// Changing a facility, up or down. The page names a facility and the level it
// wants; whether it can be afforded, and the new balance, are the server's. A
// level one below the stored one is a free downgrade. One UPDATE with the
// version check makes any deduction and the level change a single write, so
// nothing is charged twice.
app.post('/api/career/facility', async (req, res) => {
  const demo = wantsDemo(req);
  const { facility, level } = req.body || {};
  try {
    const e = await engine();
    if (!e.FACILITY_BY_KEY[facility] || !Number.isInteger(level)
      || level < 1 || level > e.FACILITY_MAX_LEVEL) {
      return res.status(400).json({ error: 'facility', message: 'Choose a facility and the level next to it.' });
    }
    const { rows } = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    if (!rows.length) return res.status(404).json({ error: 'no_career' });
    // A kick-off that has passed plays first, so its credits count.
    const up = await catchUpAndSave(req.user.id, demo, rows[0], req.now);
    const state = e.repairCareer(up.state);
    if (!state) return res.status(500).json({ error: 'facility_upgrade_failed' });
    const stored = e.facilityLevels(state)[facility];
    const out = level === stored - 1
      ? e.downgradeFacility(state, facility, level)
      : e.upgradeFacility(state, facility, level);
    if (out.error === 'level') return res.status(409).json({ error: 'level' });
    if (out.error === 'credits') return res.status(409).json({ error: 'credits' });
    if (out.error) return res.status(400).json({ error: 'facility' });
    const upd = await pool.query(
      'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = $2 AND version = $4 RETURNING version',
      [req.user.id, demo, out.state, up.version]
    );
    if (!upd.rows.length) return res.status(409).json({ error: 'version_mismatch' });
    return res.json({ career: out.state, version: upd.rows[0].version });
  } catch (err) {
    console.error('facility change failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'facility_upgrade_failed' });
  }
});

// ── The transfer market ──────────────────────────────────────────────────
const TRANSFER_MESSAGES = {
  player: 'That player is not in your squad.',
  min: 'Your squad needs at least 11 players.',
  goalkeeper: 'Your squad needs a goalkeeper.',
  full: 'Your squad has 40 players, the most a club can have.',
  squad_full: 'Your squad has 40 players, the most a club can have.',
  credits: 'Your Club credits do not cover this player and a matchday of wages.',
  gone: 'This player is no longer on the market.',
  own_listing: 'That is your own listing. Withdraw it instead.',
  price: 'An asking price is a whole number from 1 to 1,000,000 Club credits.',
};

function listingOut(e, row) {
  const p = row.player || {};
  const club = e.CLUB_BY_ID[row.seller_club_id];
  return {
    id: row.id,
    player: {
      name: p.name, pos: p.pos, age: p.age, overall: p.overall, attrs: p.attrs,
      wage: e.playerWage(p),
    },
    price: row.asking_price,
    club: { id: row.seller_club_id, name: club ? club.name : row.seller_club_id },
    createdAt: row.created_at,
  };
}

app.get('/api/transfers', async (req, res) => {
  try {
    const e = await engine();
    const userId = req.user ? req.user.id : null;
    const { rows } = await queryWithRetry(
      pool,
      `SELECT id, seller_user_id, seller_club_id, player, asking_price, created_at
         FROM transfer_listings ORDER BY created_at DESC, id DESC LIMIT 200`
    );
    const mine = userId ? rows.filter((r) => r.seller_user_id === userId) : [];
    const listings = userId ? rows.filter((r) => r.seller_user_id !== userId) : rows;
    return res.json({
      listings: listings.slice(0, 100).map((r) => listingOut(e, r)),
      mine: mine.map((r) => listingOut(e, r)),
    });
  } catch (err) {
    console.error('transfers load failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'transfers_load_failed' });
  }
});

// Put a player on the market. The player leaves the stored squad in the same
// version-checked write that inserts the listing.
app.post('/api/transfers', async (req, res) => {
  const demo = wantsDemo(req);
  const { playerId, price } = req.body || {};
  if (demo) return res.status(409).json({ error: 'demo', message: 'The demo season cannot list players.' });
  try {
    const e = await engine();
    if (typeof playerId !== 'string' || !Number.isInteger(price)) {
      return res.status(400).json({ error: 'player_or_price', message: TRANSFER_MESSAGES.price });
    }
    const found = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = false',
      [req.user.id]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'no_career' });
    const up = await catchUpAndSave(req.user.id, false, found.rows[0], req.now);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(
        'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = false FOR UPDATE',
        [req.user.id]
      );
      if (!locked.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'no_career' });
      }
      if (locked.rows[0].version !== up.version) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'version_mismatch' });
      }
      const state = e.repairCareer(locked.rows[0].state);
      if (!state) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'transfer_listing_failed' });
      }
      const out = e.listPlayer(state, playerId, price);
      if (out.error) {
        await client.query('ROLLBACK');
        const code = out.error === 'price' ? 400 : 409;
        return res.status(code).json({ error: out.error, message: TRANSFER_MESSAGES[out.error] || '' });
      }
      const ins = await client.query(
        `INSERT INTO transfer_listings (seller_user_id, seller_club_id, player, asking_price)
         VALUES ($1, $2, $3::jsonb, $4) RETURNING id, seller_club_id, player, asking_price, created_at`,
        [req.user.id, state.clubId, out.snapshot, price]
      );
      const upd = await client.query(
        'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = false AND version = $4 RETURNING version',
        [req.user.id, false, out.state, up.version]
      );
      if (!upd.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'version_mismatch' });
      }
      await client.query('COMMIT');
      return res.json({ career: out.state, version: upd.rows[0].version, listing: listingOut(e, ins.rows[0]) });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('transfer listing failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'transfer_listing_failed' });
  }
});

// Take a listing back and put the player in the squad again.
app.delete('/api/transfers/:id', async (req, res) => {
  if (wantsDemo(req)) return res.status(409).json({ error: 'demo', message: 'The demo season cannot use the market.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'gone', message: TRANSFER_MESSAGES.gone });
  try {
    const e = await engine();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const listed = await client.query(
        'SELECT id, seller_user_id, player, asking_price FROM transfer_listings WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (!listed.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'gone', message: TRANSFER_MESSAGES.gone });
      }
      if (listed.rows[0].seller_user_id !== req.user.id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'not_yours', message: 'That listing is not yours.' });
      }
      const career = await client.query(
        'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = false FOR UPDATE',
        [req.user.id]
      );
      if (!career.rows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'no_career' });
      }
      const state = e.repairCareer(career.rows[0].state);
      const listing = { id: listed.rows[0].id, player: listed.rows[0].player, price: listed.rows[0].asking_price };
      const out = e.returnListing(state, listing);
      if (out.error) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: out.error, message: TRANSFER_MESSAGES[out.error] || '' });
      }
      const upd = await client.query(
        'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = false AND version = $4 RETURNING version',
        [req.user.id, false, out.state, career.rows[0].version]
      );
      if (!upd.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'version_mismatch' });
      }
      await client.query('DELETE FROM transfer_listings WHERE id = $1', [id]);
      await client.query('COMMIT');
      return res.json({ career: out.state, version: upd.rows[0].version });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('transfer withdraw failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'transfer_withdraw_failed' });
  }
});

// Sign a listed player: the price goes from the buyer's credits to the
// seller's in one transaction (transfers-db.js).
app.post('/api/transfers/:id/buy', async (req, res) => {
  if (wantsDemo(req)) return res.status(409).json({ error: 'demo', message: 'The demo season cannot buy players.' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(409).json({ error: 'gone', message: TRANSFER_MESSAGES.gone });
  try {
    const e = await engine();
    const found = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = false',
      [req.user.id]
    );
    if (!found.rows.length) return res.status(404).json({ error: 'no_career' });
    const up = await catchUpAndSave(req.user.id, false, found.rows[0], req.now);
    const out = await buyListing(pool, e, { listingId: id, userId: req.user.id, version: up.version });
    if (out.error) {
      return res.status(out.code || 409).json({ error: out.error, message: TRANSFER_MESSAGES[out.error] || '' });
    }
    return res.json({ career: out.career, version: out.version });
  } catch (err) {
    console.error('transfer buy failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'transfer_buy_failed' });
  }
});

// Selling a player to the league, or releasing one: the server changes the
// squad and the credits together, in one version-checked write.
async function playerAction(req, res, e, run) {
  const { playerId } = req.body || {};
  if (typeof playerId !== 'string') return res.status(400).json({ error: 'player', message: TRANSFER_MESSAGES.player });
  const demo = wantsDemo(req);
  const found = await pool.query(
    'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
    [req.user.id, demo]
  );
  if (!found.rows.length) return res.status(404).json({ error: 'no_career' });
  const up = await catchUpAndSave(req.user.id, demo, found.rows[0], req.now);
  const state = e.repairCareer(up.state);
  if (!state) return res.status(500).json({ error: 'player_action_failed' });
  const out = run(state, playerId);
  if (out.error) {
    const code = out.error === 'player' ? 404 : 409;
    return res.status(code).json({ error: out.error, message: TRANSFER_MESSAGES[out.error] || '' });
  }
  const upd = await pool.query(
    'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = $2 AND version = $4 RETURNING version',
    [req.user.id, demo, out.state, up.version]
  );
  if (!upd.rows.length) return res.status(409).json({ error: 'version_mismatch' });
  return res.json({ career: out.state, version: upd.rows[0].version, price: out.price });
}

app.post('/api/career/player/sell', async (req, res) => {
  try {
    const e = await engine();
    return await playerAction(req, res, e, e.sellToLeague);
  } catch (err) {
    console.error('player sale failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'player_action_failed' });
  }
});

app.post('/api/career/player/release', async (req, res) => {
  try {
    const e = await engine();
    return await playerAction(req, res, e, e.releasePlayer);
  } catch (err) {
    console.error('player release failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'player_action_failed' });
  }
});

// Hiring or releasing a staff member. The page names the role and the
// action; whether it can be afforded and the new balance are the server's.
// Same shape as the facility upgrade: read, play any passed kick-off, one
// version-checked UPDATE.
app.post('/api/career/staff', async (req, res) => {
  const demo = wantsDemo(req);
  const { role, action } = req.body || {};
  try {
    const e = await engine();
    if (!e.STAFF_BY_KEY[role] || (action !== 'hire' && action !== 'release')) {
      return res.status(400).json({ error: 'staff', message: 'Choose a staff role and whether to hire or release.' });
    }
    const { rows } = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    if (!rows.length) return res.status(404).json({ error: 'no_career' });
    const up = await catchUpAndSave(req.user.id, demo, rows[0], req.now);
    const state = e.repairCareer(up.state);
    if (!state) return res.status(500).json({ error: 'staff_failed' });
    const out = action === 'hire' ? e.hireStaff(state, role) : e.releaseStaff(state, role);
    if (out.error === 'credits') return res.status(409).json({ error: 'credits' });
    if (out.error === 'hired') return res.status(409).json({ error: 'hired' });
    if (out.error === 'not_hired') return res.status(409).json({ error: 'not_hired' });
    if (out.error) return res.status(400).json({ error: 'staff' });
    const upd = await pool.query(
      'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = $2 AND version = $4 RETURNING version',
      [req.user.id, demo, out.state, up.version]
    );
    if (!upd.rows.length) return res.status(409).json({ error: 'version_mismatch' });
    return res.json({ career: out.state, version: upd.rows[0].version });
  } catch (err) {
    console.error('staff change failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'staff_failed' });
  }
});

// Promoting a prospect from the academy into the senior squad.
app.post('/api/career/youth', async (req, res) => {
  const demo = wantsDemo(req);
  const { id } = req.body || {};
  try {
    const e = await engine();
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'youth', message: 'Choose a young player to promote.' });
    }
    const { rows } = await pool.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = $2',
      [req.user.id, demo]
    );
    if (!rows.length) return res.status(404).json({ error: 'no_career' });
    const up = await catchUpAndSave(req.user.id, demo, rows[0], req.now);
    const state = e.repairCareer(up.state);
    if (!state) return res.status(500).json({ error: 'youth_failed' });
    const out = e.promoteYouth(state, id);
    if (out.error === 'squad_full') return res.status(409).json({ error: 'squad_full' });
    if (out.error) return res.status(409).json({ error: 'youth' });
    const upd = await pool.query(
      'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = $2 AND version = $4 RETURNING version',
      [req.user.id, demo, out.state, up.version]
    );
    if (!upd.rows.length) return res.status(409).json({ error: 'version_mismatch' });
    return res.json({ career: out.state, version: upd.rows[0].version });
  } catch (err) {
    console.error('promotion failed: ' + ((err && err.code) || '') + ' ' + (err && err.message));
    return res.status(500).json({ error: 'youth_failed' });
  }
});

app.delete('/api/career', async (req, res) => {
  const demo = wantsDemo(req);
  try {
    if (demo) {
      await pool.query('DELETE FROM careers WHERE user_id = $1 AND is_demo = true', [req.user.id]);
      return res.json({ ok: true });
    }
    // Selling the club: the sale pays by the tier it is in, into the wallet the
    // person keeps, and the career ends. One transaction, so a sale is either
    // paid and complete or not made at all.
    const e = await engine();
    const client = await pool.connect();
    let sale = null;
    try {
      await client.query('BEGIN');
      const found = await client.query(
        'SELECT club_id, state FROM careers WHERE user_id = $1 AND is_demo = false FOR UPDATE',
        [req.user.id]
      );
      if (found.rows.length) {
        const row = found.rows[0];
        const price = e.saleValue(row.state, SALE_VALUE);
        // A career from before the wallet existed is credited the starting
        // balance as well, so selling never loses the money it never stored.
        const credit = await client.query(
          `INSERT INTO wallets (user_id, usdc) VALUES ($1, $2::integer + $3::integer)
           ON CONFLICT (user_id) DO UPDATE SET usdc = wallets.usdc + $3::integer, updated_at = now()
           RETURNING usdc`,
          [req.user.id, STARTING_BALANCE, price]
        );
        if (row.club_id) await releaseClub(client, row.club_id, req.user.id);
        // Selling the club takes its players off the market with it.
        await client.query('DELETE FROM transfer_listings WHERE seller_user_id = $1', [req.user.id]);
        await client.query('DELETE FROM careers WHERE user_id = $1 AND is_demo = false', [req.user.id]);
        sale = { clubId: row.club_id, price, balance: credit.rows[0].usdc };
      }
      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
    // No career is not a second sale: nothing is credited twice.
    return res.json(sale ? { ok: true, sale } : { ok: true });
  } catch (err) {
    console.error('career delete failed: ' + err.message);
    return res.status(500).json({ error: 'career_delete_failed' });
  }
});

// The template ships no favicon file; index.html carries an inline SVG
// icon instead. Answer 204 here so anything that still probes
// /favicon.ico (older browsers, direct visits) doesn't fall through to
// the auth-gated catch-all and surface a 401 in the console on every
// fresh load.
app.get('/favicon.ico', (_req, res) => res.status(204).end());

app.use(express.static(path.join(__dirname, 'public')));

// HTML shell: serve the app if authenticated. Unauthenticated top-level
// visits (share links pasted into a browser — Sec-Fetch-Dest: document)
// are sent to the platform's chromeless view of this app, where the shell
// embeds it with a real token so the link just works. Every other
// tokenless case (iframe loads with an expired token, old browsers
// without Sec-Fetch-*) gets the "open in Homeroom" landing page instead
// of a redirect, so the platform shell is never loaded INSIDE its own
// app iframe and stray visits still don't reveal the app.
app.get('*', (req, res) => {
  if (!req.user && !req.guest) {
    // Deep-link pass-through (platform #743): carry the visited
    // path+query into the chromeless view so share links land on the
    // shared screen, not Home. The clean platform route stores `path`
    // as one encoded query value so an inner ?, &, or = survives. The
    // shell decodes and validates it as relative-only before use. The
    // character test keeps the
    // value attribute-safe for the landing anchor below — anything
    // unusual falls back to the bare link.
    const deepPath = /^\/[A-Za-z0-9\-._~!$&()*+,;=:@\/%?]*$/.test(req.originalUrl)
      ? '?path=' + encodeURIComponent(req.originalUrl) : '';
    const appPath = APP_SLUG ? '/app/' + encodeURIComponent(APP_SLUG) + '/full' + deepPath : '';
    if (PLATFORM_ORIGIN && req.get('sec-fetch-dest') === 'document') {
      return res.redirect(302, PLATFORM_ORIGIN + appPath);
    }
    return res.status(401).send(`<!doctype html><meta charset=utf-8><title>Open in Homeroom</title>
<body style="font-family:system-ui;background:#09090b;color:#e4e4e7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="max-width:24rem;padding:2rem;text-align:center">
    <h1 style="font-size:1.25rem;margin:0 0 0.5rem">Open this app inside Homeroom</h1>
    <p style="color:#a1a1aa;font-size:0.9rem;margin:0 0 1.25rem">This page is served via the platform; direct visits aren't authenticated.</p>
    <a href="${PLATFORM_ORIGIN}${appPath}" style="display:inline-block;padding:0.5rem 1rem;background:#7c3aed;color:white;border-radius:0.5rem;text-decoration:none;font-size:0.9rem">Open in Homeroom</a>
  </div>
</body>`);
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  await boot();
  const server = app.listen(port, () => console.log(`Listening on :${port}`));
  // Let Envoy retire idle upstream connections at 60s, with a 15s margin.
  server.keepAliveTimeout = 75_000;
  let closing = false;
  function shutdown() {
    if (closing) return;
    closing = true;
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch(err => { console.error(err); process.exit(1); });
