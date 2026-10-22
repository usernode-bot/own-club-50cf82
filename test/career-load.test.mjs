// Checks for opening a saved career: a career saved by an earlier version is
// filled in where it is missing something, and a career that cannot be shown
// is rejected. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUB_BY_ID, COASTAL_IDS, DIVISIONS,
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

test('repairCareer keeps a valid career', () => {
  const fresh = buildInitialState('harbourside', 'Test manager', 42);
  assert.deepEqual(repairCareer(fresh), fresh);

  const mid = buildInitialState(DIVISIONS[2].clubIds[4], 'Test manager', 77);
  playMatchday(mid);
  playMatchday(mid);
  assert.deepEqual(repairCareer(mid), mid);

  const demo = buildDemoState(1);
  assert.deepEqual(repairCareer(demo), demo);
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
});

test('a version 1 career opens and plays', () => {
  const state = repairCareer(v1State(7));
  assert.ok(state);
  assert.equal(state.version, 1);
  assert.equal(state.fixtures.length, 18);
  while (!state.finished) playMatchday(state);
  assert.equal(leagueTable(state).length, 10);

  const next = startNextSeason(state);
  assert.equal(next.version, 2);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.ok(next.divisions[0].includes('harbourside'));
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

test('season rollover starts matchday 0 in the named division', () => {
  const state = buildInitialState(DIVISIONS[3].clubIds[1], 'Test manager', 555);
  while (!state.finished) playMatchday(state);
  const outcome = seasonOutcome(state);
  const next = startNextSeason(state);
  assert.equal(next.matchday, 0);
  assert.equal(next.finished, false);
  assert.equal(next.season, state.season + 1);
  assert.equal(next.division, outcome.toDivision);
  assert.deepEqual(repairCareer(next), next);
});
