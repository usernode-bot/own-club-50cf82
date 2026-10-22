// Checks for opening a saved career: a career saved in the old ten-club league
// or the flat divisions is filled in where it is missing something, plays out
// its season and joins the pyramid; a career that cannot be shown is rejected.
// Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, clubById, COASTAL_IDS, groupClubIds,
  buildInitialState, buildFixtures, buildSquad, buildDemoState,
  repairCareer, validateLineup, autoLineup, defaultRole,
  playMatchday, leagueTable, seasonOutcome, startNextSeason, placeName,
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
  COASTAL_IDS.forEach((id, i) => { state.squads[id] = buildSquad(seed, i, clubById(id).rep); });
  for (const id in state.squads) for (const p of state.squads[id]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = autoLineup(state.squads.harbourside, state.tactics.formation, state.roles);
  return state;
}

// A saved version 2 career: the eight flat divisions of 18, with the manager
// partway through a season in one of them, built the way the app built one
// then.
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
    state.squads[id] = buildSquad(seed, CLUBS.findIndex((c) => c.id === id), clubById(id).rep, division);
  }
  for (const id in state.squads) for (const p of state.squads[id]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = autoLineup(state.squads[clubId], state.tactics.formation, state.roles);
  return state;
}

// A saved version 3 career: the three-tier league's nine groups, the manager
// in a group named by a letter.
function v3State(tier, letter, seed) {
  const ids = CLUBS.map((c) => c.id);
  const groups = [];
  for (let i = 0; i < 9; i++) {
    const t = i === 0 ? 1 : 1 + Math.ceil(i / 4);
    groups.push({
      tier: t,
      group: i === 0 ? null : 'ABCD'[(i - 1) % 4],
      clubIds: ids.slice(i * 18, (i + 1) * 18),
    });
  }
  const groupIndex = tier === 1 ? 0 : 1 + (tier - 2) * 4 + 'ABCD'.indexOf(letter);
  const clubId = groups[groupIndex].clubIds[3];
  const squads = {};
  for (const id of groups[groupIndex].clubIds) {
    squads[id] = buildSquad(seed, CLUBS.findIndex((c) => c.id === id), clubById(id).rep, tier);
  }
  const state = {
    version: 3,
    season: 1,
    division: tier,
    group: groups[groupIndex].group,
    groups,
    groupIndex,
    managerName: 'M',
    clubId,
    seed,
    squads,
    fixtures: buildFixtures(seed, groups[groupIndex].clubIds),
    results: [],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: {},
    lineup: [],
    matchday: 0,
    finished: false,
    lastReport: null,
  };
  for (const id in squads) for (const p of squads[id]) state.roles[p.id] = defaultRole(p.pos);
  state.lineup = autoLineup(squads[clubId], state.tactics.formation, state.roles);
  return state;
}

test('repairCareer keeps a valid career', () => {
  const fresh = buildInitialState('harbourside', 'Test manager', 42);
  assert.deepEqual(repairCareer(fresh), fresh);

  const mid = buildInitialState(groupClubIds(2, 1)[4], 'Test manager', 77);
  playMatchday(mid);
  playMatchday(mid);
  assert.deepEqual(repairCareer(mid), mid);

  const demo = buildDemoState(1);
  assert.deepEqual(repairCareer(demo), demo);
});

test('repairCareer passes the wallet and the purchase through untouched', () => {
  const state = buildInitialState(groupClubIds(8, 2)[0], 'Test manager', 42);
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
  assert.equal(repaired.tactics.formation, clubById('harbourside').formation);
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

  // A pyramid career must know its group, be in it and have all 18 clubs.
  const missingGroup = buildInitialState('harbourside', 'Test manager', 42);
  delete missingGroup.groupClubIds;
  assert.equal(repairCareer(missingGroup), null);
  const notInGroup = buildInitialState('harbourside', 'Test manager', 42);
  notInGroup.groupClubIds = groupClubIds(2, 0);
  assert.equal(repairCareer(notInGroup), null);
  const shortGroup = buildInitialState('harbourside', 'Test manager', 42);
  shortGroup.groupClubIds = shortGroup.groupClubIds.slice(0, 17);
  assert.equal(repairCareer(shortGroup), null);
  const badClub = buildInitialState('harbourside', 'Test manager', 42);
  badClub.groupClubIds = badClub.groupClubIds.slice(0, 17).concat('nowhere');
  assert.equal(repairCareer(badClub), null);
  const badDivision = buildInitialState('harbourside', 'Test manager', 42);
  badDivision.division = 9;
  assert.equal(repairCareer(badDivision), null);

  // A three-tier career whose groups are broken, or which is not in its group.
  const brokenGroups = v3State(2, 'B', 5);
  brokenGroups.groups = 'x';
  assert.equal(repairCareer(brokenGroups), null);
  const wrongGroup = v3State(2, 'B', 5);
  wrongGroup.groupIndex = 5;
  assert.equal(repairCareer(wrongGroup), null);
});

test('a version 1 career opens, plays and joins Division 1', () => {
  const state = repairCareer(v1State(7));
  assert.ok(state);
  assert.equal(state.version, 1);
  assert.equal(state.fixtures.length, 18);
  while (!state.finished) playMatchday(state);
  assert.equal(leagueTable(state).length, 10);

  const next = startNextSeason(state);
  assert.equal(next.version, 4);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.equal(next.group, 0);
  assert.ok(next.groupClubIds.includes('harbourside'));
  assert.equal(placeName(next), 'Division 1');
});

test('a version 2 career loads, plays its season and joins the same division', () => {
  // Old Division 1 is new Division 1, old Division 8 is new Division 8; the
  // club lands in that division after its old league's promotion or
  // relegation is applied, in that division's first group.
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
    const next = startNextSeason(state);
    assert.equal(next.version, 4);
    assert.equal(next.division, oldNext, 'old Division ' + division + ' lands in Division ' + oldNext);
    assert.equal(outcome.toDivision, oldNext);
    assert.equal(next.group, 0);
    assert.equal(next.groupClubIds.length, 18);
    assert.equal(new Set(next.groupClubIds).size, 18);
    assert.ok(next.groupClubIds.includes(state.clubId));
    assert.deepEqual(repairCareer(next), next);
  }
});

test('a version 3 career finishes its season and joins the pyramid in place', () => {
  for (const [tier, letter] of [[1, null], [2, 'B'], [3, 'C']]) {
    const state = repairCareer(v3State(tier, letter, 21));
    assert.ok(state, 'a three-tier career in Division ' + tier + ' loads');
    while (!state.finished) playMatchday(state);
    const outcome = seasonOutcome(state);
    const next = startNextSeason(state);
    assert.equal(next.version, 4);
    assert.equal(next.division, outcome.toDivision);
    assert.equal(next.group, outcome.toGroup);
    assert.equal(next.groupClubIds.length, 18);
    assert.equal(new Set(next.groupClubIds).size, 18);
    assert.ok(next.groupClubIds.includes(state.clubId));
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
  const state = buildInitialState(groupClubIds(3, 1)[1], 'Test manager', 555);
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
