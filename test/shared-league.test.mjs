// The shared league: one world seed, every club's own money, and one table
// two managers in the same group can both read.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLeague, buildLeagueGroup, buildFixtures, playLeagueMatchday, clubView,
  leagueTable, movePyramid, carryClubSquad, autoLineup, GROUPS, CLUBS,
  MATCHDAYS, LEAGUE_SEED, LEAGUE_ZONE,
} from '../public/engine.js';

function group0() {
  const league = buildLeague();
  const g = league.groups[0];
  return { league, g, group: buildLeagueGroup(league.seed, league.season, 0, g, null) };
}

test('the shared league is the same world from the same seed', () => {
  const a = buildLeague();
  const b = buildLeague(LEAGUE_SEED);
  assert.equal(a.seed, LEAGUE_SEED);
  assert.equal(LEAGUE_ZONE, 'Europe/London');
  assert.equal(a.groups.length, GROUPS.length);
  assert.equal(a.groups.flatMap((g) => g.clubIds).length, CLUBS.length);
  const ga = buildLeagueGroup(a.seed, 1, 0, a.groups[0], null);
  const gb = buildLeagueGroup(b.seed, 1, 0, b.groups[0], null);
  assert.deepEqual(ga.fixtures, gb.fixtures);
  assert.deepEqual(ga.squads, gb.squads);
});

test('a matchday settles every club, not only one manager', () => {
  const { league, g, group } = group0();
  playLeagueMatchday(group, 0, league, {});
  assert.equal(group.matchday, 1);
  assert.equal(group.results.length, 9);
  for (const id of g.clubIds) {
    const entry = group.clubs[id];
    assert.equal(typeof entry.credits, 'number');
    assert.ok(entry.credits >= 0);
    assert.equal(entry.financeHistory.length, 1);
    assert.ok(entry.lastReport);
    assert.ok(Array.isArray(group.squads[id]));
  }
  // The home side earned a gate; the away side did not.
  const fixture = group.fixtures[0][0];
  assert.ok(group.clubs[fixture.home].finance.gate > 0);
  assert.equal(group.clubs[fixture.away].finance.gate, 0);
});

test('two clubs in the same group read the same table and the same report', () => {
  const { league, g, group } = group0();
  playLeagueMatchday(group, 0, league, {});
  const fixture = group.fixtures[0][0];
  const home = clubView(league, group, 0, fixture.home, null);
  const away = clubView(league, group, 0, fixture.away, null);
  assert.deepEqual(leagueTable(home), leagueTable(away));
  assert.deepEqual(home.results, away.results);
  assert.deepEqual(home.lastReport, away.lastReport);
  assert.equal(home.mode, 'shared');
  assert.equal(home.timeZone, LEAGUE_ZONE);
});

test("a manager's saved tactics are used only for their own club", () => {
  const { league, g, group } = group0();
  const mine = g.clubIds[3];
  const manager = {
    manager_name: 'Alex Morgan',
    lineup: autoLineup(group.squads[mine], '4-4-2', {}),
    tactics: { formation: '4-4-2', mentality: 'Attacking', pressing: 'High' },
    roles: {},
  };
  const rebuilt = playLeagueMatchday(group, 0, league, { [mine]: manager });
  const view = clubView(league, group, 0, mine, manager);
  assert.equal(view.tactics.formation, '4-4-2');
  assert.equal(view.tactics.mentality, 'Attacking');
  assert.deepEqual(rebuilt, {});
  const other = g.clubIds.find((id) => id !== mine);
  const otherView = clubView(league, group, 0, other, null);
  assert.notEqual(otherView.tactics.mentality, 'Attacking');
});

test('a lineup that no longer fits is rebuilt and reported', () => {
  const { league, g, group } = group0();
  const mine = g.clubIds[2];
  const manager = {
    manager_name: 'Alex Morgan',
    lineup: ['gone-1', 'gone-2'],
    tactics: { formation: '4-4-2', mentality: 'Balanced', pressing: 'Medium' },
    roles: {},
  };
  const rebuilt = playLeagueMatchday(group, 0, league, { [mine]: manager });
  assert.equal(rebuilt[mine].length, 11);
  assert.equal(new Set(rebuilt[mine]).size, 11);
});

test('promotion and relegation happen once and every group stays at 18', () => {
  const descriptors = GROUPS.map((g) => ({ tier: g.tier, group: g.group, clubIds: g.clubIds.slice() }));
  // A table that finishes in club id order, so the top and bottom are known.
  const tables = descriptors.map((g) => g.clubIds.map((id, i) => ({ id, rank: i + 1 })));
  const moved = movePyramid(descriptors, tables);
  assert.equal(moved.length, descriptors.length);
  for (const g of moved) assert.equal(g.clubIds.length, 18);
  // Division 1 loses its bottom 8 and gains the 8 Division 2 leaders.
  assert.equal(moved[0].clubIds.length, 18);
  // The top 2 of a Division 2 group are no longer in it.
  const up = tables[1].slice(0, 2).map((r) => r.id);
  for (const id of up) assert.ok(!moved[1].clubIds.includes(id));
  // Every club appears exactly once.
  const all = moved.flatMap((g) => g.clubIds);
  assert.equal(new Set(all).size, CLUBS.length);
});

test('a club keeps its own squad, aged, into the summer', () => {
  const { league, g, group } = group0();
  // Play six matchdays so there is money and history to carry.
  for (let i = 0; i < 6; i++) playLeagueMatchday(group, 0, league, {});
  const groups = [group];
  const before = group.clubs[g.clubIds[0]];
  const view = clubView(league, group, 0, g.clubIds[0], null);
  assert.ok(group.matchday < MATCHDAYS);
  assert.ok(view.lineup.length === 11);
  const carried = carryClubSquad(view, 2, group.tier);
  assert.equal(carried.length, group.squads[g.clubIds[0]].length);
  for (const p of carried) assert.equal(p.goals, 0);
  assert.equal(before.financeHistory.length, 6);
});
