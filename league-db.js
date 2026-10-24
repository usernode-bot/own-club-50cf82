// The shared league's storage. Kept apart from server.js so the catch-up and
// the club actions can be tested with a scripted client, like transfers-db.js.
// Every due kick-off is played once for all 17 groups, under a row lock on the
// current season, then the groups are written back in the same transaction.

function iso(value) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function slotBefore(isoString, count) {
  return new Date(Date.parse(isoString) - count * 6 * 60 * 60 * 1000);
}

// Season 1, its 17 group rows, and its first kick-off. In staging the first
// kick-off is six slots in the past, so matchdays 1 to 6 are already played.
async function ensureLeague(pool, e, now, staging) {
  const found = await pool.query('SELECT season FROM league_seasons ORDER BY season DESC LIMIT 1');
  if (found.rows.length) return false;
  const league = e.buildLeague();
  const next = e.slotAfter(now, e.LEAGUE_ZONE);
  const first = staging ? slotBefore(next, 6) : next;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const again = await client.query('SELECT season FROM league_seasons LIMIT 1');
    if (!again.rows.length) {
      await client.query(
        `INSERT INTO league_seasons (season, seed, groups, matchday, phase, next_match_at, plays, version)
         VALUES ($1, $2, $3::jsonb, 0, 'playing', $4, '[]'::jsonb, 1)
         ON CONFLICT (season) DO NOTHING`,
        [league.season, league.seed, JSON.stringify(league.groups), first.toISOString()]
      );
      const groups = league.groups.map((g, i) => e.buildLeagueGroup(league.seed, league.season, i, g, null));
      for (let i = 0; i < groups.length; i++) {
        await client.query(
          `INSERT INTO league_groups (season, group_index, tier, group_letter, state)
           VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (season, group_index) DO NOTHING`,
          [league.season, i, groups[i].tier, groups[i].group, JSON.stringify(groups[i])]
        );
      }
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

function managersOf(rows) {
  const managers = {};
  for (const r of rows) managers[r.club_id] = r;
  return managers;
}

async function readManagers(client) {
  const { rows } = await client.query(
    'SELECT club_id, user_id, manager_name, lineup, tactics, roles, version FROM league_managers'
  );
  return managersOf(rows);
}

async function writeGroups(client, season, groups) {
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    await client.query(
      `INSERT INTO league_groups (season, group_index, tier, group_letter, state, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, now())
       ON CONFLICT (season, group_index) DO UPDATE SET
         tier = EXCLUDED.tier, group_letter = EXCLUDED.group_letter,
         state = EXCLUDED.state, updated_at = now()`,
      [season, i, g.tier, g.group, JSON.stringify(g)]
    );
  }
}

async function writeManagers(client, rebuilt) {
  for (const clubId of Object.keys(rebuilt || {})) {
    await client.query(
      'UPDATE league_managers SET lineup = $2::jsonb, version = version + 1 WHERE club_id = $1',
      [clubId, JSON.stringify(rebuilt[clubId])]
    );
  }
}

async function writeLeague(client, league, previousSeason) {
  if (league.season === previousSeason) {
    await client.query(
      `UPDATE league_seasons SET matchday = $2, phase = $3, next_match_at = $4, plays = $5::jsonb,
         groups = $6::jsonb, version = version + 1, updated_at = now()
       WHERE season = $1`,
      [league.season, league.matchday, league.phase, league.nextMatchAt, JSON.stringify(league.plays), JSON.stringify(league.groups)]
    );
    return;
  }
  await client.query(
    `INSERT INTO league_seasons (season, seed, groups, matchday, phase, next_match_at, plays, version)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb, 1)
     ON CONFLICT (season) DO UPDATE SET
       groups = EXCLUDED.groups, matchday = EXCLUDED.matchday, phase = EXCLUDED.phase,
       next_match_at = EXCLUDED.next_match_at, plays = EXCLUDED.plays,
       version = league_seasons.version + 1, updated_at = now()`,
    [league.season, league.seed, JSON.stringify(league.groups), league.matchday, league.phase, league.nextMatchAt, JSON.stringify(league.plays)]
  );
}

function leagueFromRow(row) {
  return {
    season: row.season,
    seed: row.seed,
    groups: row.groups,
    matchday: row.matchday,
    phase: row.phase,
    nextMatchAt: row.next_match_at ? iso(row.next_match_at) : null,
    plays: Array.isArray(row.plays) ? row.plays : [],
  };
}

async function load(client, e, season) {
  const { rows: seasonRows } = await client.query('SELECT * FROM league_seasons WHERE season = $1', [season]);
  const { rows: groupRows } = await client.query(
    'SELECT state FROM league_groups WHERE season = $1 ORDER BY group_index', [season]
  );
  const managers = await readManagers(client);
  return {
    league: leagueFromRow(seasonRows[0]),
    groups: groupRows.map((r) => r.state),
    managers,
    version: seasonRows[0].version,
  };
}

// Play every due kick-off for the whole league, once. A cheap read first: if
// nothing is due, nothing is locked. A waiting request that finds the season
// already advanced simply reads it.
async function catchUpLeague(pool, e, now, options = {}) {
  await ensureLeague(pool, e, now, !!options.staging);
  const peek = await pool.query('SELECT * FROM league_seasons ORDER BY season DESC LIMIT 1');
  const row = peek.rows[0];
  if (!row.next_match_at || Date.parse(iso(row.next_match_at)) > now.getTime()) {
    return load(pool, e, row.season);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT * FROM league_seasons ORDER BY season DESC LIMIT 1 FOR UPDATE'
    );
    const seasonRow = locked.rows[0];
    if (!seasonRow.next_match_at || Date.parse(iso(seasonRow.next_match_at)) > now.getTime()) {
      // Another request played it while this one waited for the lock.
      await client.query('COMMIT');
      return load(pool, e, seasonRow.season);
    }
    const previousSeason = seasonRow.season;
    const { rows: groupRows } = await client.query(
      'SELECT state FROM league_groups WHERE season = $1 ORDER BY group_index FOR UPDATE',
      [previousSeason]
    );
    const managers = await readManagers(client);
    const league = leagueFromRow(seasonRow);
    const groups = groupRows.map((r) => r.state);
    const out = e.playDueLeague(league, groups, managers, now);
    await writeGroups(client, league.season, groups);
    await writeManagers(client, out.rebuilt);
    await writeLeague(client, league, previousSeason);
    await client.query('COMMIT');
    return load(pool, e, league.season);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

// One club's group row, locked for a club action (a facility, a signing, a
// sale). Returns everything the caller needs to rebuild the club view.
async function loadClub(client, e, season, clubId) {
  const seasonRow = await client.query(
    'SELECT * FROM league_seasons WHERE season = $1 FOR UPDATE', [season]
  );
  if (!seasonRow.rows.length) return null;
  const descriptors = seasonRow.rows[0].groups || [];
  const index = descriptors.findIndex((g) => Array.isArray(g.clubIds) && g.clubIds.includes(clubId));
  if (index < 0) return null;
  const groupRow = await client.query(
    'SELECT state FROM league_groups WHERE season = $1 AND group_index = $2 FOR UPDATE',
    [season, index]
  );
  if (!groupRow.rows.length) return null;
  const managers = await readManagers(client);
  return {
    league: leagueFromRow(seasonRow.rows[0]),
    index,
    group: groupRow.rows[0].state,
    manager: managers[clubId] || null,
    managers,
  };
}

async function saveClub(client, season, index, group, manager) {
  await client.query(
    'UPDATE league_groups SET state = $3::jsonb, updated_at = now() WHERE season = $1 AND group_index = $2',
    [season, index, JSON.stringify(group)]
  );
  if (manager) {
    await client.query(
      'UPDATE league_managers SET lineup = $2::jsonb, tactics = $3::jsonb, roles = $4::jsonb, version = version + 1 WHERE club_id = $1',
      [manager.club_id, JSON.stringify(manager.lineup), JSON.stringify(manager.tactics), JSON.stringify(manager.roles)]
    );
  }
}

module.exports = {
  ensureLeague,
  catchUpLeague,
  loadClub,
  saveClub,
  readManagers,
};
