// Checks for the eight-division pyramid, its season rollover, the club shop
// and the careers an earlier ten-club or flat-division season left behind.
// Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, COASTAL_IDS, clubById, clubIndex, DIVISION_COUNT, DIVISION_SIZE,
  GROUP_COUNTS, GROUP_COUNT, PYRAMID_CLUB_COUNT, LEGACY_CLUB_COUNT, MATCHDAYS,
  groupsInDivision, groupName, groupLabel, groupClubIds, groupClubs,
  SHOP_CLUB_IDS, SHOP_GROUPS, SHOP_DIVISION, purchaseError,
  divisionClubIds, placeName, seasonSeed, seasonOutcome, startNextSeason,
  buildInitialState, buildFixtures, buildSquad, buildDemoState,
  leagueTable, playMatchday, objectiveMet, clubSummary, defaultRole, autoLineup,
  repairCareer,
} from '../public/engine.js';

const avgOverall = (squad) => squad.reduce((s, p) => s + p.overall, 0) / squad.length;

function finishedCareer(clubId, seed) {
  const state = buildInitialState(clubId, 'Test manager', seed);
  while (!state.finished) playMatchday(state);
  return state;
}

// A finished season whose outcome is the kind asked for, so a test does not
// depend on one seed's luck. Division 1's weakest club is used for looking
// for relegation.
function finishedAs(clubId, kind, seeds = 40) {
  for (let seed = 1; seed <= seeds; seed++) {
    const state = finishedCareer(clubId, seed);
    if (seasonOutcome(state).kind === kind) return state;
  }
  throw new Error('no seed gave a ' + kind + ' season for ' + clubId);
}

// A few clubs exactly as the flat league had them: the pyramid must not have
// moved or renamed any of them.
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

test('the pyramid is eight divisions of 18-club groups, 78,714 clubs in all', () => {
  assert.equal(DIVISION_COUNT, 8);
  assert.deepEqual(GROUP_COUNTS, [1, 4, 12, 36, 108, 324, 972, 2916]);
  assert.equal(GROUP_COUNT, 4373);
  assert.equal(PYRAMID_CLUB_COUNT, 78714);
  assert.equal(PYRAMID_CLUB_COUNT, GROUP_COUNT * DIVISION_SIZE);
  assert.equal(MATCHDAYS, 34);
  for (let d = 1; d <= DIVISION_COUNT; d++) assert.equal(groupsInDivision(d), GROUP_COUNTS[d - 1]);
  assert.equal(groupsInDivision(DIVISION_COUNT + 1), 0);

  // Each division below Division 1 has three times the groups of the one
  // above, except Division 2, which has four so that the eight clubs leaving
  // Division 1 land two to a group.
  assert.equal(groupName(1, 0), 'Division 1');
  assert.equal(groupName(2, 0), 'Division 2 Group A');
  assert.equal(groupName(3, 11), 'Division 3 Group L');
  assert.equal(groupName(8, 25), 'Division 8 Group Z');
  assert.equal(groupName(8, 26), 'Division 8 Group AA');
  assert.equal(groupName(8, 2915), 'Division 8 Group ' + groupLabel(2915));
  assert.equal(groupLabel(0), 'A');
  assert.equal(groupLabel(25), 'Z');
  assert.equal(groupLabel(26), 'AA');

  // The 162 clubs the flat league had keep their ids, names and strength, in
  // the same order. The ten original clubs are the whole of Division 1's core.
  assert.equal(CLUBS.length, LEGACY_CLUB_COUNT);
  assert.deepEqual(CLUBS.slice(0, 10).map((c) => c.id), COASTAL_IDS);
  for (const id of COASTAL_IDS) assert.ok(groupClubIds(1, 0).includes(id));
  for (const [i, id, name, rep, short] of KEPT_CLUBS) {
    assert.equal(CLUBS[i].id, id);
    assert.equal(CLUBS[i].name, name);
    assert.equal(CLUBS[i].rep, rep);
    assert.equal(CLUBS[i].short, short);
    assert.equal(clubIndex(id), i);
    assert.equal(clubById(id).name, name);
  }
});

test('every group has 18 clubs of its own, generated once and always the same', () => {
  const legacyNames = new Set(CLUBS.map((c) => c.name));
  const samples = [[1, 0], [2, 0], [2, 3], [3, 0], [3, 11], [4, 0], [4, 35], [7, 500], [8, 0], [8, 2915]];
  for (const [division, group] of samples) {
    const clubs = groupClubs(division, group);
    assert.equal(clubs.length, DIVISION_SIZE, groupName(division, group));
    assert.equal(new Set(clubs.map((c) => c.id)).size, DIVISION_SIZE);
    assert.equal(new Set(clubs.map((c) => c.name)).size, DIVISION_SIZE);
    assert.equal(new Set(clubs.map((c) => c.short)).size, DIVISION_SIZE);
    for (const c of clubs) {
      assert.equal(clubById(c.id), c);
      assert.equal(clubIndex(c.id), clubIndex(c.id));
      assert.ok(c.rep >= 1 && c.rep <= 5);
      // A generated club's name carries a district word, so it can never
      // collide with one of the 162 clubs that were already named.
      if (clubIndex(c.id) >= LEGACY_CLUB_COUNT) assert.ok(!legacyNames.has(c.name), c.name);
    }
    // The same group comes back identical, whatever was generated before it.
    const again = groupClubs(division, group);
    assert.deepEqual(again, clubs);
  }
  // The bottom division's clubs are the weakest, one or two stars.
  for (const c of groupClubs(SHOP_DIVISION, 0)) assert.ok(c.rep <= 2);
  // A club that is not in the pyramid does not resolve.
  assert.equal(clubById('nowhere'), undefined);
  assert.equal(clubIndex('nowhere'), null);
  assert.equal(clubIndex('c999999-x'), null);
});

test('the shop is the first four groups of Division 8', () => {
  assert.equal(SHOP_DIVISION, 8);
  assert.equal(SHOP_CLUB_IDS.length, 72);
  assert.deepEqual(SHOP_GROUPS.map((g) => g.name), [
    'Division 8 Group A', 'Division 8 Group B', 'Division 8 Group C', 'Division 8 Group D',
  ]);
  assert.deepEqual(SHOP_CLUB_IDS, SHOP_GROUPS.flatMap((g) => g.clubIds));
  for (const id of SHOP_CLUB_IDS) assert.ok(id.startsWith('c'), 'a Division 8 club is generated');

  assert.equal(purchaseError('harbourside', 1000, 100), 'club');
  assert.equal(purchaseError('nowhere', 1000, 100), 'club');
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 50, 100), 'balance');
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 1000, 100), null);
  assert.equal(purchaseError(SHOP_CLUB_IDS[0], 100, 100), null);
});

test('a group plays a double round robin', () => {
  const ids = groupClubIds(2, 0);
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
});

test('the same seed and actions give the same season and the same rollover', () => {
  const clubId = groupClubIds(2, 0)[3];
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

test('Division 1 sends 8 down, two into each Division 2 group, and takes 8 up', () => {
  const state = finishedAs('kestrel', 'relegated');
  const divisionOne = leagueTable(state);
  const rank = divisionOne.find((r) => r.id === state.clubId).rank;
  const next = startNextSeason(state);

  assert.equal(next.version, 4);
  assert.equal(next.division, 2);
  assert.equal(next.group, Math.floor((rank - 11) / 2));
  assert.equal(placeName(next), groupName(2, Math.floor((rank - 11) / 2)));
  assert.equal(next.groupClubIds.length, DIVISION_SIZE);
  assert.equal(new Set(next.groupClubIds).size, DIVISION_SIZE);
  assert.ok(next.groupClubIds.includes(state.clubId));

  // The bottom 8 leave Division 1: two into each Division 2 group in order of
  // finish, 11th and 12th to A, 13th and 14th to B, and so on.
  const down = divisionOne.slice(10, 18).map((r) => r.id);
  assert.equal(down.length, 8);
  assert.ok(down.includes(state.clubId));
  // The two it takes are the pair for its group; a third club from Division 1
  // does not land in the same group.
  const pair = next.groupClubIds.filter((id) => down.includes(id));
  assert.equal(pair.length, 2);
  assert.deepEqual(pair.sort(), [down[(next.group) * 2], down[next.group * 2 + 1]].sort());
  for (let k = 0; k < down.length; k++) {
    if (Math.floor(k / 2) !== next.group) assert.ok(!next.groupClubIds.includes(down[k]));
  }
});

test('a group in Divisions 2 to 7 keeps 10, takes 2 from above and 6 from below', () => {
  // A Division 2 club that stays up, so the rollover is the ordinary one.
  const state = finishedAs(groupClubIds(2, 1)[0], 'stayed');
  const before = divisionClubIds(state).slice();
  const table = leagueTable(state);
  const next = startNextSeason(state);

  assert.equal(next.division, 2);
  assert.equal(next.group, 1);
  assert.equal(next.groupClubIds.length, DIVISION_SIZE);
  assert.equal(new Set(next.groupClubIds).size, DIVISION_SIZE);
  assert.ok(next.groupClubIds.includes(state.clubId));

  // The top two went up and the bottom six went down; none of them is still
  // in the group.
  const gone = table.slice(0, 2).concat(table.slice(-6)).map((r) => r.id);
  for (const id of gone) assert.ok(!next.groupClubIds.includes(id), id + ' left the group');
  const kept = next.groupClubIds.filter((id) => before.includes(id));
  assert.equal(kept.length, 10);
  assert.equal(next.groupClubIds.filter((id) => !before.includes(id)).length, 8);
});

test('Division 8 keeps everyone, and the top two still go up', () => {
  // The bottom six of a Division 8 group are never relegated: a club that
  // finishes in the bottom two stays in Division 8.
  let bottom = null;
  for (let seed = 1; seed <= 30 && !bottom; seed++) {
    const state = finishedCareer(groupClubIds(8, 0)[5], seed);
    if (leagueTable(state).find((r) => r.id === state.clubId).rank >= 17) bottom = state;
  }
  assert.ok(bottom, 'some seed puts the club in the bottom two');
  assert.equal(seasonOutcome(bottom).kind, 'stayed');
  const next = startNextSeason(bottom);
  assert.equal(next.division, 8);
  assert.ok(next.groupClubIds.includes(bottom.clubId));

  // Nor do any of the six clubs below the manager's group leave it.
  const staying = finishedAs(groupClubIds(8, 0)[0], 'stayed');
  const bottomSix = leagueTable(staying).slice(-6).map((r) => r.id);
  const after = startNextSeason(staying);
  for (const id of bottomSix) assert.ok(after.groupClubIds.includes(id), id + ' left Division 8');

  // A Division 8 club that finishes top two goes up into the Division 7 group
  // above it: the first three groups feed Group A, the next three Group B.
  const promoted = finishedAs(groupClubIds(8, 0)[0], 'promoted', 60);
  const out = seasonOutcome(promoted);
  assert.equal(out.toDivision, 7);
  assert.equal(out.toGroup, 0);
  assert.equal(startNextSeason(promoted).division, 7);
});

test('the outcome names the group each club moves to', () => {
  // Where a finish at each end of a Division 3 group sends a club.
  const state = finishedCareer(groupClubIds(3, 5)[0], 313);
  const out = seasonOutcome(state);
  assert.equal(out.size, 18);
  if (out.kind === 'promoted') {
    assert.equal(out.toDivision, 2);
    assert.equal(out.toGroup, 1, 'Division 3 Group F goes up into Division 2 Group B');
  }
  if (out.kind === 'relegated') {
    assert.equal(out.toDivision, 4);
    assert.ok([15, 16, 17].includes(out.toGroup), 'Group F relegates into Division 4 groups 16 to 18');
  }
  assert.equal(groupName(out.toDivision, out.toGroup), groupName(out.division, out.group));

  // Division 1's winner is the only champion.
  const champion = finishedAs('redvale', 'champions', 60);
  assert.equal(seasonOutcome(champion).kind, 'champions');
  assert.equal(seasonOutcome(champion).toDivision, 1);
});

test('the manager carries their club, players and roles into the next season', () => {
  const state = finishedCareer(groupClubIds(2, 2)[1], 555);
  const before = state.squads[state.clubId];
  const roleOf = state.roles[before[0].id];
  if (roleOf) state.roles[before[0].id] = 'Centre-back';
  state.wallet = { currency: 'Dummy USDC', balance: 900 };
  state.purchase = { clubId: state.clubId, price: 100, at: '2026-01-15T12:00:00.000Z' };
  const next = startNextSeason(state);

  assert.equal(next.version, 4);
  assert.equal(next.season, state.season + 1);
  assert.equal(next.matchday, 0);
  assert.equal(next.finished, false);
  assert.equal(next.results.length, 0);
  assert.equal(next.fixtures.length, 34);
  assert.ok(next.fixtures.some((round) => round.some((f) => f.home === state.clubId || f.away === state.clubId)));
  assert.equal(Object.keys(next.squads).length, 18);
  assert.ok(next.groupClubIds.includes(state.clubId));
  assert.equal(next.groupClubIds.filter((id) => id === state.clubId).length, 1);
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
  assert.equal(placeName(next), groupName(next.division, next.group));
  assert.deepEqual(divisionClubIds(next), next.groupClubIds);
  assert.deepEqual(repairCareer(JSON.parse(JSON.stringify(next))), next);
});

test('a finished season does not roll over until it is asked to', () => {
  const mid = buildInitialState(groupClubIds(4, 3)[2], 'Test manager', 909);
  assert.equal(startNextSeason(mid), mid);
  assert.equal(startNextSeason(mid).matchday, 0);
  assert.equal(startNextSeason(mid).season, 1);
});

test('lower divisions start with weaker squads', () => {
  // Kestrel Park, a one-star Division 1 club.
  const rep1 = clubById('kestrel');
  const top = buildSquad(1, clubIndex(rep1.id), rep1.rep, 1);
  const bottomClub = groupClubs(8, 0).find((c) => c.rep === 2);
  const bottom = buildSquad(1, clubIndex(bottomClub.id), bottomClub.rep, 8);
  assert.ok(avgOverall(bottom) < avgOverall(top) - 15);
  assert.ok(clubSummary(1, bottomClub, 8).avg < clubSummary(1, rep1, 1).avg);
});

test('a new career starts in its Division 8 group with no money of its own', () => {
  const clubId = groupClubIds(8, 3)[5];
  const state = buildInitialState(clubId, 'Test manager', 12);
  assert.equal(state.version, 4);
  assert.equal(state.season, 1);
  assert.equal(state.division, 8);
  assert.equal(state.group, 3);
  assert.equal(placeName(state), 'Division 8 Group D');
  assert.deepEqual(state.groupClubIds, groupClubIds(8, 3));
  assert.deepEqual(Object.keys(state.squads).sort(), state.groupClubIds.slice().sort());
  assert.equal(state.fixtures.length, 34);
  assert.equal(state.wallet, undefined);
  assert.equal(state.purchase, undefined);
  assert.deepEqual(divisionClubIds(state), state.groupClubIds);
});

test('a version 1 career plays its 18 matchdays exactly as it did', () => {
  const state = v1State(7);
  while (!state.finished) playMatchday(state);
  assert.equal(state.fixtures.length, 18);
  assert.equal(leagueTable(state).length, 10);
  const signature = leagueTable(state).map((r) => [r.id, r.played, r.points, r.gd].join(',')).join('|');
  assert.equal(signature, V1_SEED_7);

  const next = startNextSeason(state);
  assert.equal(next.version, 4);
  assert.equal(next.season, 2);
  assert.equal(next.division, 1);
  assert.equal(next.group, 0);
  assert.ok(next.groupClubIds.includes('harbourside'));
  assert.equal(next.groupClubIds.length, 18);
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

test('a finished season stays well inside the save limit', () => {
  const state = finishedCareer(groupClubIds(6, 4)[4], 4242);
  assert.ok(JSON.stringify(state).length < 1024 * 1024);
});

test('the staging demo shows Harbourside third in Division 1 with 900 USDC', () => {
  const demo = buildDemoState(1);
  assert.equal(demo.version, 4);
  assert.equal(demo.division, 1);
  assert.equal(demo.season, 1);
  assert.equal(placeName(demo), 'Division 1');
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
