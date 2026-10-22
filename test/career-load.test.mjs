// Checks for opening a saved career: a career saved in the old flat divisions
// is filled in where it is missing something, plays out its season and joins
// the three tiers; a career that cannot be shown is rejected. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, CLUB_BY_ID, COASTAL_IDS, GROUPS,
  buildInitialState, buildFixtures, buildSquad, buildDemoState,
  repairCareer, validateLineup, autoLineup, defaultRole,
  playMatchday, leagueTable, seasonOutcome, startNextSeason,
} from '../public/engine.js';

// A saved version 1 career, built the way the app built one before the pyramid.
function v1State(seed) {
  const state = {
    version: 1,
    managerName: 'M',
    clubId: 'harbourside',
    seed,
    squads: {},
    fixtures: buildFixtures(seed),
    results: [],
    tactics: { formation: '4-3-3', mentality: 'Balanced', pressing: 'Medium' },
    roles: {},
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  COASTAL_IDS.forEach((id, i) => { state.squads[id] = buildSquad(seed, i, CLUB_BY_ID[id].rep); });
  for (const id in state.squads) for (const p of state.squads[id]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = autoLineup(state.squads.harbourside, state.tactics.formation, state.roles);
  return state;
}

// A saved version 2 career: the eight flat divisions, with the manager partway
// through a season in one of them, built the way the app built one then.
function v2State(division, index, seed) {
  const ids = CLUBS.map((c) => c.id);
  const divisions = Array.from({ length: 8 }, (_, d) => ids.slice(d * 18, (d + 1) * 18));
  const clubId = divisions[division - 1][index];
  const state = {
    version: 2,
    season: 1,
    division,
    divisions,
    managerName: 'M',
    clubId,
    seed,
    squads: {},
    fixtures: buildFixtures(seed, divisions[division - 1]),
    results: [],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: {},
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  for (const id of divisions[division - 1]) {
    state.squads[id] = buildSquad(seed, CLUBS.findIndex((c) => c.id === id), CLUB_BY_ID[id].rep, division);
  }
  for (const id in state.squads) for (const p of state.squads[id]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = autoLineup(state.squads[clubId], state.tactics.formation, state.roles);
  return state;
}

test('repairCareer keeps a valid career', () => {
  const fresh = buildInitialState('harbourside', 'Test manager', 42);
  assert.deepEqual(repairCareer(fresh), fresh);

  const mid = buildInitialState(GROUPS[2].clubIds[4], 'Test manager', 77);
  playMatchday(mid);
  playMatchday(mid);
  assert.deepEqual(repairCareer(mid), mid);

  const demo = buildDemoState(1);
  assert.deepEqual(repairCareer(demo), demo);
});

test('repairCareer passes the wallet and the purchase through untouched', () => {
  const state = buildInitialState(GROUPS[5].clubIds[0], 'Test manager', 42);
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: state.clubId, price: 100, at: '2026-01-15T12:00:00.000Z' };
  playMatchday(state);
  const repaired = repairCareer(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(repaired, state);
  assert.deepEqual(repaired.wallet, { currency: 'Dummy USDC', balance: 900 });
  assert.equal(repaired.purchase.clubId, state.clubId);
});

test('repairCareer fills a partial career', () => {
  const state = buildInitialState('harbourside', 'Test manager', 42);
  playMatchday(state);
  const matchday = state.matchday;
  const results = state.results;
  delete state.roles;
  state.tactics.formation = 'x';
  state.lineup = [];
  state.lastReport = { matchday: 3 };

  const repaired = repairCareer(state);
  assert.ok(repaired);
  assert.deepEqual(repaired.roles, {});
  assert.equal(repaired.tactics.formation, CLUB_BY_ID.harbourside.formation);
  assert.equal(repaired.tactics.mentality, 'Balanced');
  assert.equal(repaired.tactics.pressing, 'Medium');
  assert.deepEqual(validateLineup(repaired), { ok: true, message: '' });
  assert.equal(repaired.lastReport, null);
  assert.equal(repaired.matchday, matchday);
  assert.deepEqual(repaired.results, results);
});

test('repairCareer gives a career saved before Club credits a balance of 0, and keeps a real one', () => {
  const state = buildInitialState('harbourside', 'Test manager', 42);
  playMatchday(state);
  assert.equal(state.credits > 0, true);

  const old = JSON.parse(JSON.stringify(state));
  delete old.credits;
  assert.equal(repairCareer(old).credits, 0);

  for (const bad of [-5, 1.5, '600', null]) {
    const saved = JSON.parse(JSON.stringify(state));
    saved.credits = bad;
    assert.equal(repairCareer(saved).credits, 0);
  }

  const kept = JSON.parse(JSON.stringify(state));
  kept.credits = 605;
  assert.equal(repairCareer(kept).credits, 605);
});

test('repairCareer rejects what cannot be shown', () => {
  assert.equal(repairCareer(null), null);
  assert.equal(repairCareer('career'), null);
  const unknown = buildInitialState('harbourside', 'Test manager', 42);
  unknown.clubId = 'nowhere';
  assert.equal(repairCareer(unknown), null);
  const noSquad = buildInitialState('harbourside', 'Test manager', 42);
  delete noSquad.squads.harbourside;
  assert.equal(repairCareer(noSquad), null);
  const noResults = buildInitialState('harbourside', 'Test manager', 42);
  delete noResults.results;
  assert.equal(repairCareer(noResults), null);

  // A three-tier career whose groups are broken, or which is not in its group.
  const brokenGroups = buildInitialState('harbourside', 'Test manager', 42);
  brokenGroups.groups = 'x';
  assert.equal(repairCareer(brokenGroups), null);
  const wrongGroup = buildInitialState('harbourside', 'Test manager', 42);
  wrongGroup.groupIndex = 5;
  assert.equal(repairCareer(wrongGroup), null);
});

test('a version 1 career opens and plays', () => {
  const state = repairCareer(v1State(7));
  assert.ok(state);
  assert.equal(state.version, 1);
  assert.equal(state.fixtures.length, 18);
  while (!state.finished) playMatchday(state);
  assert.equal(leagueTable(state).length, 10);

  const next = startNextSeason(state);
  assert.equal(next.version, 3);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.ok(next.groups[0].clubIds.includes('harbourside'));
});

test('a version 2 career loads, plays its season and joins the three tiers', () => {
  // The club goes to the tier its next old division maps to: old Division 1 to
  // Division 1, old Division 2 to Division 2, old Divisions 3 to 8 to
  // Division 3. A club that stays in old Division 1 or 2 lands in tier 1 or 2.
  for (const [division, index] of [[1, 3], [2, 3], [4, 3], [8, 3]]) {
    const state = repairCareer(v2State(division, index, 11));
    assert.ok(state, 'a version 2 career in old Division ' + division + ' loads');
    playMatchday(state);
    while (!state.finished) playMatchday(state);
    assert.equal(leagueTable(state).length, 18);
    const outcome = seasonOutcome(state);
    let oldNext = division;
    if (outcome.kind === 'promoted') oldNext = division - 1;
    if (outcome.kind === 'relegated') oldNext = division + 1;
    const expected = oldNext === 1 ? 1 : oldNext === 2 ? 2 : 3;
    const next = startNextSeason(state);
    assert.equal(next.version, 3);
    assert.equal(next.division, expected, 'old Division ' + division + ' maps to tier ' + expected);
    assert.equal(outcome.toDivision, expected);
    if (outcome.kind === 'stayed' || outcome.kind === 'champions') {
      assert.equal(next.division, Math.min(division, 3), 'a club staying in old Division ' + division + ' lands in its tier');
    }
    assert.equal(next.groups.length, 9);
    assert.deepEqual(next.groups.map((g) => g.clubIds.length), Array(9).fill(18));
    // The club is present in exactly one group, and it is the manager's.
    assert.equal(next.groups.filter((g) => g.clubIds.includes(state.clubId)).length, 1);
    assert.ok(next.groups[next.groupIndex].clubIds.includes(state.clubId));
    assert.deepEqual(repairCareer(next), next);
  }
});

test('the match report has what the report screen reads', () => {
  const state = buildInitialState('harbourside', 'Test manager', 42);
  playMatchday(state);
  const r = state.lastReport;
  assert.ok(r);
  assert.ok(r.home.id && r.away.id);
  assert.equal(typeof r.homeGoals, 'number');
  assert.equal(typeof r.awayGoals, 'number');
  assert.ok(Array.isArray(r.moments));
  for (const key of ['possession', 'shots', 'onTarget', 'passes', 'fouls', 'yellow', 'red']) {
    assert.equal(r.stats[key].length, 2, key + ' is a pair');
  }
  assert.ok(r.ratings.home && r.ratings.away);
  assert.ok(Object.keys(r.ratings.home).length > 0);
});

test('season rollover starts matchday 0 in the named group', () => {
  const state = buildInitialState(GROUPS[3].clubIds[1], 'Test manager', 555);
  while (!state.finished) playMatchday(state);
  const outcome = seasonOutcome(state);
  const next = startNextSeason(state);
  assert.equal(next.matchday, 0);
  assert.equal(next.finished, false);
  assert.equal(next.season, state.season + 1);
  assert.equal(next.division, outcome.toDivision);
  assert.equal(next.group, outcome.toGroup);
  assert.deepEqual(repairCareer(next), next);
});
