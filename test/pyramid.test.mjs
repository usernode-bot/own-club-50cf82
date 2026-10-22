// Checks for the eight-division pyramid, its season rollover and the careers
// a version 1 season left behind. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, CLUB_BY_ID, COASTAL_IDS, DIVISIONS, DIVISION_SIZE, DIVISION_COUNT, MATCHDAYS,
  clubToDivision, divisionClubIds, seasonSeed, seasonOutcome, startNextSeason,
  buildInitialState, buildFixtures, buildSquad, buildDemoState, findDemoSeed,
  leagueTable, playMatchday, objectiveMet, clubSummary, defaultRole, autoLineup,
} from '../public/engine.js';

const avgOverall = (squad) => squad.reduce((s, p) => s + p.overall, 0) / squad.length;

function finishedCareer(clubId, seed) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  while (!state.finished) playMatchday(state);
  return state;
}

// The exact ten-club table the code produced for seed 7 before the pyramid.
const V1_SEED_7 = 'redvale,18,38,22|kingsmoor,18,35,10|cliffton,18,33,7|harbourside,18,32,14'
  + '|northmoor,18,26,-1|marrow,18,23,-3|baymouth,18,19,-8|gullport,18,16,-8|kestrel,18,14,-8'
  + '|saltmarsh,18,10,-25';

// A saved version 1 career, built the way the app built one before this change.
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

test('the Coastal League is eight divisions of 18 clubs', () => {
  assert.equal(CLUBS.length, DIVISION_COUNT * DIVISION_SIZE);
  assert.equal(new Set(CLUBS.map((c) => c.id)).size, 144);
  assert.equal(new Set(CLUBS.map((c) => c.name)).size, 144);
  assert.deepEqual(DIVISIONS.map((d) => d.clubIds.length), Array(8).fill(18));
  assert.deepEqual(DIVISIONS.map((d) => d.name), Array.from({ length: 8 }, (_, i) => 'Division ' + (i + 1)));
  assert.equal(MATCHDAYS, 34);

  // The ten original clubs keep their order and their data, all in Division 1.
  assert.deepEqual(CLUBS.slice(0, 10).map((c) => c.id), COASTAL_IDS);
  assert.deepEqual(CLUBS[0], {
    id: 'harbourside', name: 'Harbourside FC', short: 'HF', color: 'rgb(var(--pitch))',
    rep: 4, formation: '4-3-3', objective: 'Finish in the top half', ground: 'The Quay',
  });
  for (const id of COASTAL_IDS) {
    assert.ok(DIVISIONS[0].clubIds.includes(id));
    assert.equal(clubToDivision[id], 1);
    for (const d of DIVISIONS.slice(1)) assert.ok(!d.clubIds.includes(id));
  }
  // Every club is in exactly one division.
  const all = DIVISIONS.flatMap((d) => d.clubIds);
  assert.equal(new Set(all).size, 144);
  for (const c of CLUBS) assert.equal(clubToDivision[c.id], DIVISIONS.findIndex((d) => d.clubIds.includes(c.id)) + 1);
});

test('a division plays a double round robin', () => {
  const ids = DIVISIONS[2].clubIds;
  const fixtures = buildFixtures(5, ids);
  assert.equal(fixtures.length, 34);
  for (const round of fixtures) assert.equal(round.length, 9);
  const seen = new Set();
  for (const round of fixtures) {
    for (const f of round) {
      assert.notEqual(f.home, f.away);
      assert.ok(ids.includes(f.home) && ids.includes(f.away));
      seen.add(f.home + '@' + f.away);
    }
  }
  assert.equal(seen.size, 18 * 17);
  for (const a of ids) for (const b of ids) if (a !== b) assert.ok(seen.has(a + '@' + b));
});

test('the same seed and actions give the same season and the same rollover', () => {
  const clubId = DIVISIONS[2].clubIds[3];
  const first = finishedCareer(clubId, 1234);
  const second = finishedCareer(clubId, 1234);
  assert.deepEqual(leagueTable(first), leagueTable(second));
  assert.deepEqual(seasonOutcome(first), seasonOutcome(second));

  // The saved state goes through JSON in the database, so it must survive it.
  const reloaded = JSON.parse(JSON.stringify(first));
  assert.deepEqual(leagueTable(reloaded), leagueTable(first));
  assert.deepEqual(seasonOutcome(reloaded), seasonOutcome(first));

  assert.deepEqual(startNextSeason(first), startNextSeason(reloaded));
});

test('three clubs go up and three come down between neighbouring divisions', () => {
  const state = finishedCareer(DIVISIONS[0].clubIds[0], 77);
  const before = state.divisions.map((ids) => ids.slice());
  const divisionOne = leagueTable(state);
  const next = startNextSeason(state);

  assert.deepEqual(next.divisions.map((ids) => ids.length), Array(8).fill(18));
  assert.equal(new Set(next.divisions.flat()).size, 144);
  for (let i = 0; i < DIVISION_COUNT - 1; i++) {
    const down = before[i].filter((id) => next.divisions[i + 1].includes(id) && !before[i + 1].includes(id));
    const up = before[i + 1].filter((id) => next.divisions[i].includes(id) && !before[i].includes(id));
    assert.equal(down.length, 3, 'three relegate from Division ' + (i + 1));
    assert.equal(up.length, 3, 'three promote from Division ' + (i + 2));
  }
  // Nobody goes up out of Division 1.
  for (const row of divisionOne.slice(0, 3)) assert.ok(next.divisions[0].includes(row.id));
});

test('nobody goes down from Division 8', () => {
  const state = finishedCareer(DIVISIONS[7].clubIds[0], 78);
  const bottom = leagueTable(state).slice(-3);
  const next = startNextSeason(state);
  for (const row of bottom) assert.ok(next.divisions[7].includes(row.id));
  assert.equal(objectiveMet(bottom[2].rank, 'Avoid finishing bottom', 18), false);
});

test('the manager carries their club and players into the next season', () => {
  const state = finishedCareer(DIVISIONS[3].clubIds[1], 555);
  const before = state.squads[state.clubId];
  assert.ok(before.some((p) => p.goals > 0 || p.apps > 0));
  const next = startNextSeason(state);

  assert.equal(next.version, 2);
  assert.equal(next.season, state.season + 1);
  assert.equal(next.matchday, 0);
  assert.equal(next.finished, false);
  assert.equal(next.results.length, 0);
  assert.equal(next.fixtures.length, 34);
  assert.ok(next.fixtures.some((round) => round.some((f) => f.home === state.clubId || f.away === state.clubId)));
  assert.equal(Object.keys(next.squads).length, 18);
  assert.ok(next.divisions[next.division - 1].includes(state.clubId));
  assert.deepEqual(next.squads[state.clubId].map((p) => p.id), before.map((p) => p.id));
  for (const p of next.squads[state.clubId]) {
    assert.equal(p.goals, 0);
    assert.equal(p.assists, 0);
    assert.equal(p.apps, 0);
    assert.equal(p.yellow, 0);
    assert.equal(p.red, 0);
    assert.equal(p.injury, 0);
    assert.equal(p.fitness, 100);
    assert.equal(p.lastRating, undefined);
  }
  assert.equal(next.lineup.length, 11);
  assert.equal(seasonSeed(next), seasonSeed({ seed: state.seed, season: state.season + 1 }));
});

test('a finished season does not roll over until it is asked to', () => {
  const state = finishedCareer(DIVISIONS[5].clubIds[2], 909);
  const mid = buildInitialState(DIVISIONS[5].clubIds[2], 'Test manager', 909);
  assert.equal(startNextSeason(mid), mid);
  assert.equal(startNextSeason(mid).matchday, 0);
  assert.equal(startNextSeason(mid).season, 1);
  assert.equal(state.finished, true);
});

test('lower divisions start with weaker squads', () => {
  // Kestrel Park, a one-star Division 1 club.
  const rep1 = CLUB_BY_ID.kestrel;
  const top = buildSquad(1, CLUBS.indexOf(rep1), rep1.rep, 1);
  const bottomClub = DIVISIONS[7].clubIds.map((id) => CLUB_BY_ID[id]).find((c) => c.rep === rep1.rep);
  assert.ok(bottomClub, 'a Division 8 club of the same reputation exists');
  const bottom = buildSquad(1, CLUBS.indexOf(bottomClub), bottomClub.rep, 8);
  assert.ok(avgOverall(bottom) < avgOverall(top) - 10);
  assert.ok(clubSummary(1, bottomClub, 8).avg < clubSummary(1, rep1, 1).avg);
  assert.ok(bottom.every((p) => p.overall < 70));
});

test('a career can start at a generated club in any division', () => {
  const clubId = DIVISIONS[7].clubIds[5];
  const state = buildInitialState(clubId, 'Test manager', 12);
  assert.equal(state.version, 2);
  assert.equal(state.season, 1);
  assert.equal(state.division, 8);
  assert.deepEqual(state.divisions, DIVISIONS.map((d) => d.clubIds));
  assert.deepEqual(Object.keys(state.squads).sort(), DIVISIONS[7].clubIds.slice().sort());
  assert.equal(state.fixtures.length, 34);
  assert.deepEqual(divisionClubIds(state), DIVISIONS[7].clubIds);
});

test('a version 1 career plays its 18 matchdays exactly as it did', () => {
  const state = v1State(7);
  while (!state.finished) playMatchday(state);
  assert.equal(state.fixtures.length, 18);
  assert.equal(leagueTable(state).length, 10);
  const signature = leagueTable(state).map((r) => [r.id, r.played, r.points, r.gd].join(',')).join('|');
  assert.equal(signature, V1_SEED_7);

  const next = startNextSeason(state);
  assert.equal(next.version, 2);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.ok(next.divisions[0].includes('harbourside'));
  assert.equal(next.fixtures.length, 34);
  assert.deepEqual(next.squads.harbourside.map((p) => p.id), state.squads.harbourside.map((p) => p.id));
  assert.equal(Object.keys(next.squads).length, 18);
});

test('the board objective is measured against the division size', () => {
  assert.equal(objectiveMet(1, 'Win the league', 18), true);
  assert.equal(objectiveMet(2, 'Win the league', 18), false);
  assert.equal(objectiveMet(9, 'Finish in the top half', 18), true);
  assert.equal(objectiveMet(10, 'Finish in the top half', 18), false);
  assert.equal(objectiveMet(17, 'Avoid finishing bottom', 18), true);
  assert.equal(objectiveMet(18, 'Avoid finishing bottom', 18), false);
  // The ten-club season behaves as it always did.
  assert.equal(objectiveMet(5, 'Finish in the top half', 10), true);
  assert.equal(objectiveMet(6, 'Finish in the top half', 10), false);
  assert.equal(objectiveMet(9, 'Avoid finishing bottom', 10), true);
  assert.equal(objectiveMet(10, 'Avoid finishing bottom', 10), false);
});

test('the outcome names promotion, relegation and the title', () => {
  const state = finishedCareer(DIVISIONS[1].clubIds[0], 313);
  const outcome = seasonOutcome(state);
  assert.equal(outcome.size, 18);
  assert.ok(['champions', 'promoted', 'relegated', 'stayed'].includes(outcome.kind));
  assert.equal(outcome.kind === 'promoted', outcome.rank <= 3);
  assert.equal(outcome.kind === 'relegated', outcome.rank >= 16);
});

test('a finished season stays well inside the save limit', () => {
  const state = finishedCareer(DIVISIONS[6].clubIds[4], 4242);
  assert.ok(JSON.stringify(state).length < 1024 * 1024);
});

test('the staging demo shows Harbourside third in Division 1', () => {
  const found = findDemoSeed(10);
  assert.ok(found, 'a demo seed exists');
  const demo = buildDemoState(found.seed);
  assert.equal(demo.version, 2);
  assert.equal(demo.division, 1);
  assert.equal(demo.season, 1);
  const table = leagueTable(demo);
  assert.equal(table.length, 18);
  const me = table.find((r) => r.id === 'harbourside');
  assert.equal(me.rank, 3);
  assert.equal(me.played, 17);
});
