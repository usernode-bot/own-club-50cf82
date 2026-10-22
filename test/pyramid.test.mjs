// Checks for the three-tier pyramid, its season rollover, the club shop and
// the careers a version 1 or version 2 season left behind. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, CLUB_BY_ID, COASTAL_IDS, GROUPS, GROUP_LETTERS, TIER_COUNT, CLUB_COUNT,
  DIVISION_SIZE, MATCHDAYS, clubToGroup, groupName, SHOP_CLUB_IDS, purchaseError,
  divisionClubIds, placeName, seasonSeed, seasonOutcome, nextPlacement, startNextSeason,
  buildInitialState, buildFixtures, buildSquad, buildDemoState,
  leagueTable, playMatchday, objectiveMet, clubSummary, defaultRole, autoLineup,
  openingBalance,
} from '../public/engine.js';

const avgOverall = (squad) => squad.reduce((s, p) => s + p.overall, 0) / squad.length;

function finishedCareer(clubId, seed) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  while (!state.finished) playMatchday(state);
  return state;
}

// A few clubs exactly as the eight-division league had them: the new pyramid
// must not have moved or renamed any of them.
const KEPT_CLUBS = [
  [0, 'harbourside', 'Harbourside FC', 4, 'HF'],
  [7, 'marrow', 'Marrow Bay', 2, 'MB'],
  [17, 'valebrook-rovers', 'Valebrook Rovers', 2, 'VR'],
  [18, 'rosemarket-rovers', 'Rosemarket Rovers', 3, 'RR'],
  [44, 'torcross-town', 'Torcross Town', 1, 'TT'],
  [89, 'jarrow-athletic', 'Jarrow Athletic', 1, 'JA'],
  [90, 'hartwell-fc', 'Hartwell FC', 2, 'HA'],
  [133, 'ashcombe-united', 'Ashcombe United', 1, 'AS'],
];

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

test('the Coastal League is three tiers and 162 clubs in nine groups', () => {
  assert.equal(CLUB_COUNT, 162);
  assert.equal(CLUBS.length, CLUB_COUNT);
  assert.equal(new Set(CLUBS.map((c) => c.id)).size, 162);
  assert.equal(new Set(CLUBS.map((c) => c.name)).size, 162);
  assert.equal(MATCHDAYS, 34);

  assert.deepEqual(GROUPS.map((g) => g.tier), [1, 2, 2, 2, 2, 3, 3, 3, 3]);
  assert.deepEqual(GROUPS.map((g) => g.group), [null, 'A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
  assert.deepEqual(GROUPS.map((g) => g.name), [
    'Division 1', 'Division 2 Group A', 'Division 2 Group B', 'Division 2 Group C', 'Division 2 Group D',
    'Division 3 Group A', 'Division 3 Group B', 'Division 3 Group C', 'Division 3 Group D',
  ]);
  assert.deepEqual(GROUPS.map((g) => g.clubIds.length), Array(9).fill(DIVISION_SIZE));

  // The ten original clubs keep their order and their data, all in Division 1.
  assert.deepEqual(CLUBS.slice(0, 10).map((c) => c.id), COASTAL_IDS);
  assert.deepEqual(CLUBS[0], {
    id: 'harbourside', name: 'Harbourside FC', short: 'HF', color: 'rgb(var(--pitch))',
    rep: 4, formation: '4-3-3', objective: 'Finish in the top half', ground: 'The Quay',
  });
  for (const id of COASTAL_IDS) {
    assert.ok(GROUPS[0].clubIds.includes(id));
    assert.equal(clubToGroup[id], 0);
  }
  // The 18 extra clubs come after the ones that already existed, so every
  // club a saved career knows keeps its id, name and strength.
  for (const [i, id, name, rep, short] of KEPT_CLUBS) {
    assert.equal(CLUBS[i].id, id);
    assert.equal(CLUBS[i].name, name);
    assert.equal(CLUBS[i].rep, rep);
    assert.equal(CLUBS[i].short, short);
  }

  // Every club is in exactly one group, and clubToGroup names it.
  const all = GROUPS.flatMap((g) => g.clubIds);
  assert.equal(new Set(all).size, 162);
  for (const c of CLUBS) assert.ok(GROUPS[clubToGroup[c.id]].clubIds.includes(c.id));
});

test('the shop is every Division 3 club, and the purchase is checked', () => {
  assert.equal(SHOP_CLUB_IDS.length, 72);
  for (const id of SHOP_CLUB_IDS) assert.equal(GROUPS[clubToGroup[id]].tier, TIER_COUNT);
  assert.equal(SHOP_CLUB_IDS[0], GROUPS[5].clubIds[0]);

  assert.equal(purchaseError('harbourside', 1000, 100), 'club');
  assert.equal(purchaseError('nowhere', 1000, 100), 'club');
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 50, 100), 'balance');
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 1000, 100), null);
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 100, 100), null);
});

test('a group plays a double round robin', () => {
  const ids = GROUPS[2].clubIds;
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
  const clubId = GROUPS[2].clubIds[3];
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

test('eight clubs go down from Division 1 and eight come up into it', () => {
  const state = finishedCareer(GROUPS[0].clubIds[0], 77);
  const before = state.groups.map((g) => g.clubIds.slice());
  const divisionOne = leagueTable(state);
  const next = startNextSeason(state);

  assert.deepEqual(next.groups.map((g) => g.clubIds.length), Array(9).fill(18));
  assert.equal(new Set(next.groups.flatMap((g) => g.clubIds)).size, 162);

  // The bottom 8 of Division 1 go down, two into each Division 2 group in
  // order of finish: 11th to A, 12th to B, 13th to C, 14th to D, and so on.
  const down = divisionOne.slice(10).map((r) => r.id);
  assert.equal(down.length, 8);
  down.forEach((id, k) => {
    const gi = 1 + (k % GROUP_LETTERS.length);
    assert.ok(next.groups[gi].clubIds.includes(id), id + ' is in ' + next.groups[gi].name);
    assert.equal(next.groups.filter((g) => g.clubIds.includes(id)).length, 1);
  });

  // Division 1 gains the top two of each Division 2 group, so it keeps 10 of
  // its own clubs and gains 8.
  assert.equal(next.groups[0].clubIds.filter((id) => before[0].includes(id)).length, 10);
  assert.equal(next.groups[0].clubIds.filter((id) => !before[0].includes(id)).length, 8);
  for (let gi = 1; gi <= GROUP_LETTERS.length; gi++) {
    const lost = before[gi].filter((id) => !next.groups[gi].clubIds.includes(id));
    const gained = next.groups[gi].clubIds.filter((id) => !before[gi].includes(id));
    assert.equal(lost.length, 4, next.groups[gi].name + ' loses 2 up and 2 down');
    assert.equal(gained.length, 4, next.groups[gi].name + ' gains 2 down and 2 up');
    // Same letter between Division 2 and Division 3.
    const down3 = before[gi + GROUP_LETTERS.length].filter((id) => !next.groups[gi + GROUP_LETTERS.length].clubIds.includes(id));
    assert.equal(down3.length, 2);
    for (const id of down3) assert.ok(next.groups[gi].clubIds.includes(id));
  }
});

test('nobody goes down from Division 3', () => {
  const state = finishedCareer(GROUPS[8].clubIds[0], 78);
  const bottom = leagueTable(state).slice(-2);
  const next = startNextSeason(state);
  for (const row of bottom) assert.ok(next.groups[8].clubIds.includes(row.id));
  assert.equal(next.division, 3);
  assert.equal(objectiveMet(bottom[1].rank, 'Avoid finishing bottom', 18), false);
});

test('the outcome names the group each club moves to', () => {
  assert.equal(groupName(1, null), 'Division 1');
  assert.equal(groupName(2, 'C'), 'Division 2 Group C');
  assert.equal(groupName(3, 'D'), 'Division 3 Group D');

  // Every Division 1 finish from 11th down lands in a Division 2 group by
  // rank, and a Division 2 finish of 1st or 2nd goes up.
  for (let seed = 1; seed <= 12; seed++) {
    const state = finishedCareer(GROUPS[0].clubIds[0], seed);
    const outcome = seasonOutcome(state);
    assert.equal(outcome.toDivision, outcome.kind === 'relegated' ? 2 : 1);
    if (outcome.kind === 'relegated') {
      assert.equal(outcome.toGroup, GROUP_LETTERS[(outcome.rank - 11) % GROUP_LETTERS.length]);
    }
    if (outcome.kind === 'champions') assert.equal(outcome.rank, 1);
  }
  const second = finishedCareer(GROUPS[1].clubIds[0], 313);
  const out2 = seasonOutcome(second);
  assert.equal(out2.toDivision, out2.kind === 'promoted' ? 1 : out2.kind === 'relegated' ? 3 : 2);
  if (out2.kind === 'relegated') assert.equal(out2.toGroup, 'A');

  // A Division 3 club that goes up keeps its group's letter.
  for (let seed = 1; seed <= 12; seed++) {
    const state = finishedCareer(GROUPS[6].clubIds[0], seed);
    const outlet = seasonOutcome(state);
    if (outlet.kind === 'promoted') {
      assert.equal(outlet.toDivision, 2);
      assert.equal(outlet.toGroup, 'B');
    }
    assert.notEqual(outlet.kind, 'relegated');
  }
});

test('the manager carries their club, players and roles into the next season', () => {
  const state = finishedCareer(GROUPS[3].clubIds[1], 555);
  const before = state.squads[state.clubId];
  const roleOf = state.roles[before[0].id];
  if (roleOf) state.roles[before[0].id] = 'Centre-back';
  assert.ok(before.some((p) => p.goals > 0 || p.apps > 0));
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: state.clubId, price: 100, at: '2026-01-15T12:00:00.000Z' };
  const next = startNextSeason(state);

  assert.equal(next.version, 3);
  assert.equal(next.season, state.season + 1);
  assert.equal(next.matchday, 0);
  assert.equal(next.finished, false);
  assert.equal(next.results.length, 0);
  assert.equal(next.fixtures.length, 34);
  assert.ok(next.fixtures.some((round) => round.some((f) => f.home === state.clubId || f.away === state.clubId)));
  assert.equal(Object.keys(next.squads).length, 18);
  assert.equal(next.groups.length, 9);
  assert.ok(next.groups[next.groupIndex].clubIds.includes(state.clubId));
  assert.equal(next.groups.filter((g) => g.clubIds.includes(state.clubId)).length, 1);
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
  if (roleOf) assert.equal(next.roles[before[0].id], 'Centre-back');
  assert.deepEqual(next.wallet, { currency: 'Dummy USDC', balance: 900 });
  assert.deepEqual(next.purchase, state.purchase);
  assert.equal(seasonSeed(next), seasonSeed({ seed: state.seed, season: state.season + 1 }));
  assert.equal(placeName(next), next.group ? groupName(next.division, next.group) : 'Division 1');
  assert.deepEqual(divisionClubIds(next), next.groups[next.groupIndex].clubIds);
});

test('a finished season does not roll over until it is asked to', () => {
  const state = finishedCareer(GROUPS[5].clubIds[2], 909);
  const mid = buildInitialState(GROUPS[5].clubIds[2], 'Test manager', 909);
  assert.equal(startNextSeason(mid), mid);
  assert.equal(startNextSeason(mid).matchday, 0);
  assert.equal(startNextSeason(mid).season, 1);
  assert.equal(state.finished, true);
});

test('lower tiers start with weaker squads', () => {
  // Kestrel Park, a one-star Division 1 club.
  const rep1 = CLUB_BY_ID.kestrel;
  const top = buildSquad(1, CLUBS.indexOf(rep1), rep1.rep, 1);
  const bottomClub = GROUPS[8].clubIds.map((id) => CLUB_BY_ID[id]).find((c) => c.rep === rep1.rep);
  assert.ok(bottomClub, 'a Division 3 club of the same reputation exists');
  const bottom = buildSquad(1, CLUBS.indexOf(bottomClub), bottomClub.rep, 3);
  assert.ok(avgOverall(bottom) < avgOverall(top) - 4);
  assert.ok(clubSummary(1, bottomClub, 3).avg < clubSummary(1, rep1, 1).avg);
});

test('a new career starts in a Division 3 group with no money of its own', () => {
  const clubId = GROUPS[8].clubIds[5];
  const state = buildInitialState(clubId, 'Test manager', 12);
  assert.equal(state.version, 3);
  assert.equal(state.season, 1);
  assert.equal(state.division, 3);
  assert.equal(state.group, 'D');
  assert.equal(state.groupIndex, 8);
  assert.deepEqual(state.groups, GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds })));
  assert.deepEqual(Object.keys(state.squads).sort(), GROUPS[8].clubIds.slice().sort());
  assert.equal(state.fixtures.length, 34);
  assert.equal(state.wallet, undefined);
  assert.equal(state.purchase, undefined);
  assert.deepEqual(divisionClubIds(state), GROUPS[8].clubIds);
  assert.equal(placeName(state), 'Division 3 Group D');
});

test('a version 1 career plays its 18 matchdays exactly as it did', () => {
  const state = v1State(7);
  while (!state.finished) playMatchday(state);
  assert.equal(state.fixtures.length, 18);
  assert.equal(leagueTable(state).length, 10);
  const signature = leagueTable(state).map((r) => [r.id, r.played, r.points, r.gd].join(',')).join('|');
  assert.equal(signature, V1_SEED_7);

  const next = startNextSeason(state);
  assert.equal(next.version, 3);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.equal(next.group, null);
  assert.ok(next.groups[0].clubIds.includes('harbourside'));
  assert.equal(next.groups.map((g) => g.clubIds.length).join(','), Array(9).fill(18).join(','));
  assert.equal(new Set(next.groups.flatMap((g) => g.clubIds)).size, 162);
  assert.equal(next.fixtures.length, 34);
  assert.deepEqual(next.squads.harbourside.map((p) => p.id), state.squads.harbourside.map((p) => p.id));
  assert.equal(Object.keys(next.squads).length, 18);
});

test('the board objective is measured against the group size', () => {
  assert.equal(objectiveMet(1, 'Win the league', 18), true);
  assert.equal(objectiveMet(2, 'Win the league', 18), false);
  assert.equal(objectiveMet(9, 'Finish in the top half', 18), true);
  assert.equal(objectiveMet(10, 'Finish in the top half', 18), false);
  assert.equal(objectiveMet(17, 'Avoid finishing bottom', 18), true);
  assert.equal(objectiveMet(18, 'Avoid finishing bottom', 18), false);
  // The ten-club season behaves as it always did.
  assert.equal(objectiveMet(5, 'Finish in the top half', 10), true);
  assert.equal(objectiveMet(6, 'Finish in the top half', 10), false);
});

test('the outcome names promotion, relegation and the title', () => {
  const state = finishedCareer(GROUPS[1].clubIds[0], 313);
  const outcome = seasonOutcome(state);
  const placement = nextPlacement(state);
  assert.equal(outcome.size, 18);
  assert.equal(outcome.toDivision, placement.tier);
  assert.equal(outcome.toGroup, placement.group);
  assert.ok(['champions', 'promoted', 'relegated', 'stayed'].includes(outcome.kind));
  assert.equal(outcome.kind === 'promoted', outcome.rank <= 2);
  assert.equal(outcome.kind === 'relegated', outcome.rank >= 17);
});

test('a finished season stays well inside the save limit', () => {
  const state = finishedCareer(GROUPS[6].clubIds[4], 4242);
  assert.ok(JSON.stringify(state).length < 1024 * 1024);
});

test('the staging demo shows Harbourside third in Division 1 with 900 USDC', () => {
  const demo = buildDemoState(1);
  assert.equal(demo.version, 3);
  assert.equal(demo.division, 1);
  assert.equal(demo.season, 1);
  const table = leagueTable(demo);
  assert.equal(table.length, 18);
  const me = table.find((r) => r.id === 'harbourside');
  assert.equal(me.rank, 3);
  assert.equal(me.played, 17);
  assert.deepEqual(demo.wallet, { currency: 'Dummy USDC', balance: 900 });
  assert.equal(demo.purchase.clubId, 'harbourside');
  assert.equal(demo.purchase.price, 100);
  assert.equal(demo.purchase.demo, true);
});

test('the wallet a first-time manager is given, and the one an earlier career kept', () => {
  // No wallet row yet: a first-time manager gets the starting balance.
  assert.equal(openingBalance(undefined, 1000), 1000);
  assert.equal(openingBalance(null, 1000), 1000);
  assert.equal(openingBalance(-5, 1000), 1000);
  assert.equal(openingBalance(1.5, 1000), 1000);
  assert.equal(openingBalance('900', 1000), 1000);
  // A balance kept from an earlier career is the one the shop spends.
  assert.equal(openingBalance(0, 1000), 0);
  assert.equal(openingBalance(900, 1000), 900);
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], openingBalance(null, 1000), 100), null);
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], openingBalance(0, 1000), 100), 'balance');
});
