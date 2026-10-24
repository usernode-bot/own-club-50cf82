// Checks for the group setup: a career's league group must hold its 18 clubs
// and a full 34-matchday fixture list, a broken one is rebuilt around the
// results already played, and a whole one is never touched. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUBS, CLUB_BY_ID, GROUPS, DIVISION_SIZE, MATCHDAYS, clubToGroup,
  buildInitialState, buildFixtures, buildSquad, buildDemoState, seasonSeed,
  playMatchday, leagueTable, groupSetupError, repairGroupSetup, repairCareer,
} from '../public/engine.js';

const clubIndex = (id) => CLUBS.findIndex((c) => c.id === id);

const HALF = DIVISION_SIZE / 2;

// A career a few matchdays into its first season, exactly as the server saves
// one: the state has been through JSON, the way the database stores it.
function midCareer(clubId, days, seed = 33) {
  const state = JSON.parse(JSON.stringify(buildInitialState(clubId, 'Test manager', seed)));
  for (let i = 0; i < days; i++) playMatchday(state);
  return JSON.parse(JSON.stringify(state));
}

const playedResults = (results, day) => results.filter((r) => r.matchday === day);

test('a whole group setup is never touched: the same state comes back', () => {
  for (const clubId of [GROUPS[0].clubIds[0], GROUPS[5].clubIds[3], GROUPS[8].clubIds[7]]) {
    for (const state of [
      buildInitialState(clubId, 'Test manager', 5),
      midCareer(clubId, 5),
      midCareer(clubId, 1),
    ]) {
      assert.equal(groupSetupError(state), null, clubId);
      assert.equal(repairGroupSetup(state), state, 'the same object comes back');
      const reloaded = JSON.parse(JSON.stringify(state));
      assert.deepEqual(repairCareer(reloaded), reloaded);
    }
  }
  // The staging demo, a finished season, and one that rolled over: all whole.
  assert.equal(groupSetupError(buildDemoState(1)), null);
  const finished = midCareer(GROUPS[2].clubIds[2], MATCHDAYS);
  assert.equal(groupSetupError(finished), null);
  assert.equal(repairGroupSetup(finished), finished);
});

test('groupSetupError names what is broken, and leaves careers before the pyramid alone', () => {
  const state = midCareer(GROUPS[5].clubIds[2], 4);
  const broken = (change) => {
    const copy = JSON.parse(JSON.stringify(state));
    change(copy);
    return copy;
  };
  const noGroups = (copy) => { delete copy.groups; };

  assert.equal(groupSetupError(null), 'state');
  assert.equal(groupSetupError('x'), 'state');
  // A career from before the three tiers is never checked.
  const v1 = broken(noGroups);
  v1.version = 1;
  assert.equal(groupSetupError(v1), null);
  assert.equal(groupSetupError({ version: 1 }), null);

  assert.equal(groupSetupError(broken((c) => { c.clubId = 'nowhere'; })), 'club');
  assert.equal(groupSetupError(broken(noGroups)), 'groups');
  assert.equal(groupSetupError(broken((c) => { c.groups = c.groups.slice(0, 8); })), 'groups');
  assert.equal(groupSetupError(broken((c) => { c.groups[5].clubIds = c.groups[5].clubIds.slice(0, 17); })), 'groups');
  assert.equal(groupSetupError(broken((c) => { c.groups[5].clubIds[3] = c.groups[5].clubIds[2]; })), 'groups');

  assert.equal(groupSetupError(broken((c) => { delete c.groupIndex; })), 'groupIndex');
  assert.equal(groupSetupError(broken((c) => { c.groupIndex = 99; })), 'groupIndex');
  // The group the index names must be the one the career says it plays in,
  // and it must hold the club.
  assert.equal(groupSetupError(broken((c) => { c.groupIndex = 1; })), 'groupIndex');
  assert.equal(groupSetupError(broken((c) => { c.division = 2; })), 'groupIndex');
  assert.equal(groupSetupError(broken((c) => { c.group = 'B'; })), 'groupIndex');
  assert.equal(groupSetupError(broken((c) => {
    const gi = c.groupIndex;
    c.groups[gi].clubIds = c.groups[gi].clubIds.filter((id) => id !== c.clubId);
  })), 'groups');

  assert.equal(groupSetupError(broken((c) => { c.matchday = -1; })), 'matchday');
  assert.equal(groupSetupError(broken((c) => { c.matchday = MATCHDAYS + 1; })), 'matchday');
  assert.equal(groupSetupError(broken((c) => { c.matchday = 2.5; })), 'matchday');
  // A matchday the results cannot account for: five claimed, four played.
  assert.equal(groupSetupError(broken((c) => { c.matchday = 5; })), 'results');
  // Results beyond the matchday played are damage too.
  assert.equal(groupSetupError(broken((c) => {
    const extra = JSON.parse(JSON.stringify(c.results[0]));
    extra.matchday = c.matchday + 1;
    c.results.push(extra);
  })), 'results');

  assert.equal(groupSetupError(broken((c) => { c.fixtures = c.fixtures.slice(0, 20); })), 'fixtures');
  assert.equal(groupSetupError(broken((c) => { c.fixtures = []; })), 'fixtures');
  assert.equal(groupSetupError(broken((c) => { c.fixtures[2] = c.fixtures[2].slice(0, 8); })), 'fixtures');
  assert.equal(groupSetupError(broken((c) => { c.fixtures[2][0].away = c.fixtures[2][1].away; })), 'fixtures');
  assert.equal(groupSetupError(broken((c) => {
    // A pairing with a club outside the group.
    c.fixtures[2][0] = { home: GROUPS[0].clubIds[0], away: c.fixtures[2][0].away };
  })), 'fixtures');

  assert.equal(groupSetupError(broken((c) => { delete c.results; })), 'results');
  assert.equal(groupSetupError(broken((c) => { c.results[0].homeGoals = -1; })), 'results');
  assert.equal(groupSetupError(broken((c) => { c.results[0].matchday = 40; })), 'results');
  assert.equal(groupSetupError(broken((c) => { c.results[0].home = null; })), 'results');
  // A result naming clubs the group never held.
  assert.equal(groupSetupError(broken((c) => {
    c.results.push({
      matchday: 1, home: { id: GROUPS[0].clubIds[1], name: 'x', short: 'x', color: 'x' },
      away: { id: GROUPS[0].clubIds[2], name: 'y', short: 'y', color: 'y' },
      homeGoals: 0, awayGoals: 0,
    });
  })), 'membership');
});

test('a short group is rebuilt around the results already played', () => {
  const state = midCareer(GROUPS[5].clubIds[2], 5);
  const before = leagueTable(JSON.parse(JSON.stringify(state)));
  const results = JSON.parse(JSON.stringify(state.results));
  const broken = JSON.parse(JSON.stringify(state));
  broken.groups[broken.groupIndex].clubIds = broken.groups[broken.groupIndex].clubIds.slice(0, 12);
  assert.equal(groupSetupError(broken), 'groups');

  const repaired = repairGroupSetup(broken);
  assert.ok(repaired);
  assert.equal(groupSetupError(repaired), null);
  const ids = repaired.groups[repaired.groupIndex].clubIds;
  assert.equal(ids.length, DIVISION_SIZE);
  assert.equal(new Set(ids).size, DIVISION_SIZE);
  for (const id of ids) assert.ok(CLUB_BY_ID[id]);
  assert.ok(ids.includes(state.clubId));
  // Every club the season's history named is still in the group.
  for (const r of results) {
    assert.ok(ids.includes(r.home.id), r.home.id);
    assert.ok(ids.includes(r.away.id), r.away.id);
  }
  // The results are kept verbatim, so the table is the one that was earned.
  assert.deepEqual(repaired.results, results);
  assert.deepEqual(leagueTable(repaired), before);
  assert.equal(repaired.matchday, 5);
  assert.equal(repaired.division, state.division);
  assert.equal(repaired.group, state.group);
});

test('the fixtures still to play stay whole, and never replay a played pairing', () => {
  const state = midCareer(GROUPS[6].clubIds[4], 13, 77);
  const original = JSON.parse(JSON.stringify(state.fixtures));
  const results = JSON.parse(JSON.stringify(state.results));
  const broken = JSON.parse(JSON.stringify(state));
  broken.fixtures = broken.fixtures.slice(0, 4);
  assert.equal(groupSetupError(broken), 'fixtures');

  const repaired = repairGroupSetup(broken);
  assert.equal(repaired.fixtures.length, MATCHDAYS);
  for (const day of repaired.fixtures) assert.equal(day.length, HALF);
  // The played days are the pairings as the results recorded them.
  for (let d = 0; d < 13; d++) {
    const fromResults = playedResults(results, d + 1).map((r) => ({ home: r.home.id, away: r.away.id }));
    assert.deepEqual(repaired.fixtures[d], fromResults, 'matchday ' + (d + 1));
  }
  // The rest of the season is the schedule it always had, with the played
  // pairings left out; a pairing already played does not come round again.
  const playedPairs = new Set(results.map((r) => r.home.id + '|' + r.away.id));
  const future = repaired.fixtures.slice(13);
  assert.deepEqual(future, original.slice(13));
  const seen = new Set(playedPairs);
  for (const day of future) {
    for (const f of day) {
      assert.ok(!seen.has(f.home + '|' + f.away), f.home + ' v ' + f.away + ' plays twice');
      seen.add(f.home + '|' + f.away);
    }
  }
  // Every pairing of the group still happens, home and away, across the season.
  const ids = repaired.groups[repaired.groupIndex].clubIds;
  assert.equal(seen.size, ids.length * (ids.length - 1));
});

test('a fixture list lost entirely is rebuilt from the results', () => {
  const state = midCareer(GROUPS[7].clubIds[1], 7, 41);
  const original = JSON.parse(JSON.stringify(state.fixtures));
  const results = JSON.parse(JSON.stringify(state.results));
  const broken = JSON.parse(JSON.stringify(state));
  broken.fixtures = [];
  assert.equal(groupSetupError(broken), 'fixtures');

  const repaired = repairGroupSetup(broken);
  assert.equal(groupSetupError(repaired), null);
  assert.equal(repaired.matchday, 7);
  assert.deepEqual(repaired.results, results);
  for (let d = 0; d < 7; d++) {
    const fromResults = playedResults(results, d + 1).map((r) => ({ home: r.home.id, away: r.away.id }));
    assert.deepEqual(repaired.fixtures[d], fromResults);
  }
  assert.deepEqual(repaired.fixtures.slice(7), original.slice(7));
});

test('a career whose fixtures are gone repairs through repairCareer', () => {
  const state = midCareer(GROUPS[8].clubIds[0], 3, 9);
  const original = JSON.parse(JSON.stringify(state.fixtures));
  const broken = JSON.parse(JSON.stringify(state));
  delete broken.fixtures;

  const repaired = repairCareer(broken);
  assert.ok(repaired, 'the career is still shown');
  assert.equal(groupSetupError(repaired), null);
  assert.equal(repaired.matchday, 3);
  assert.deepEqual(repaired.fixtures.slice(3), original.slice(3));
  // The season can play on from the rebuild.
  const next = JSON.parse(JSON.stringify(repaired));
  playMatchday(next);
  assert.equal(next.matchday, 4);
});

test('a club named twice in a group is counted once', () => {
  const state = midCareer(GROUPS[5].clubIds[0], 2, 12);
  const broken = JSON.parse(JSON.stringify(state));
  const ids = broken.groups[broken.groupIndex].clubIds;
  ids[10] = ids[0];
  assert.equal(groupSetupError(broken), 'groups');
  const repaired = repairGroupSetup(broken);
  const fixed = repaired.groups[repaired.groupIndex].clubIds;
  assert.equal(new Set(fixed).size, DIVISION_SIZE);
  assert.equal(fixed.length, DIVISION_SIZE);
  assert.deepEqual(repaired.results, state.results);
});

test('a career pointing at the wrong group is placed where its club plays', () => {
  const state = midCareer(GROUPS[6].clubIds[3], 2, 17);
  const broken = JSON.parse(JSON.stringify(state));
  broken.groupIndex = 1;
  assert.equal(groupSetupError(broken), 'groupIndex');

  const repaired = repairGroupSetup(broken);
  assert.equal(repaired.groupIndex, state.groupIndex);
  assert.equal(repaired.division, state.division);
  assert.equal(repaired.group, state.group);
  assert.deepEqual(repaired.groups[repaired.groupIndex].clubIds, state.groups[state.groupIndex].clubIds);
  assert.equal(groupSetupError(repaired), null);

  // A division and letter saved wrong are corrected from where the club sits.
  const misc = JSON.parse(JSON.stringify(state));
  misc.division = 2;
  misc.group = 'B';
  const recolored = repairGroupSetup(misc);
  assert.equal(recolored.division, 3);
  assert.equal(recolored.group, state.group);
});

test('clubs the rebuilt group gains get the squads they were always going to have', () => {
  const state = midCareer(GROUPS[5].clubIds[1], 2, 23);
  const broken = JSON.parse(JSON.stringify(state));
  const ids = broken.groups[broken.groupIndex].clubIds;
  // Three clubs leave the history and the group: their squads are gone too,
  // and the rebuild brings them back from the canonical membership.
  const leaving = ids.slice(15);
  broken.groups[broken.groupIndex].clubIds = ids.slice(0, 15);
  for (const id of leaving) {
    delete broken.squads[id];
    broken.results = broken.results.filter((r) => r.home.id !== id && r.away.id !== id);
  }
  assert.equal(groupSetupError(broken), 'groups');

  const repaired = repairGroupSetup(broken);
  const rebuilt = repaired.groups[repaired.groupIndex].clubIds;
  assert.equal(rebuilt.length, DIVISION_SIZE);
  for (const id of leaving) {
    assert.ok(rebuilt.includes(id), id);
    const seed = seasonSeed(repaired);
    assert.deepEqual(
      repaired.squads[id],
      buildSquad(seed, clubIndex(id), CLUB_BY_ID[id].rep, repaired.groups[repaired.groupIndex].tier)
    );
    for (const p of repaired.squads[id]) assert.ok(repaired.roles[p.id], p.id);
  }
  // The clubs that stayed keep their own squads untouched.
  for (const id of ids.slice(0, 15)) {
    assert.deepEqual(repaired.squads[id], state.squads[id]);
  }
  // The same damage rebuilds the same squads twice.
  const again = repairGroupSetup(JSON.parse(JSON.stringify(broken)));
  assert.deepEqual(again.squads[leaving[0]], repaired.squads[leaving[0]]);
});

test('results naming clubs outside the group are absorbed, not kept', () => {
  const state = midCareer(GROUPS[5].clubIds[2], 3, 65);
  const broken = JSON.parse(JSON.stringify(state));
  broken.results.push({
    matchday: 4,
    home: { id: GROUPS[0].clubIds[0], name: 'Out', short: 'OU', color: 'x' },
    away: { id: GROUPS[0].clubIds[1], name: 'Side', short: 'SI', color: 'x' },
    homeGoals: 2, awayGoals: 1,
  });
  assert.equal(groupSetupError(broken), 'membership');
  const repaired = repairGroupSetup(broken);
  assert.equal(groupSetupError(repaired), null);
  assert.equal(repaired.results.length, state.results.length);
  assert.deepEqual(repaired.results, state.results);
  // The group is the one the club always played in, not one stretched to 20.
  assert.deepEqual(repaired.groups[repaired.groupIndex].clubIds, state.groups[state.groupIndex].clubIds);
});

test('damage beyond repair fails honestly, and a season with lost results restarts its table', () => {
  const state = midCareer(GROUPS[5].clubIds[2], 6, 88);
  // Corruption inside a played matchday that displaces a genuine result: the
  // history then names more clubs than one group holds, and nothing can
  // absorb it without losing results the table already counted.
  const crowded = JSON.parse(JSON.stringify(state));
  const day3 = crowded.results.filter((r) => r.matchday === 3);
  const firstOfDay3 = crowded.results.indexOf(day3[0]);
  crowded.results.splice(firstOfDay3, 0, {
    matchday: 3,
    home: { id: GROUPS[0].clubIds[0], name: 'Out', short: 'OU', color: 'x' },
    away: { id: GROUPS[0].clubIds[1], name: 'Side', short: 'SI', color: 'x' },
    homeGoals: 0, awayGoals: 0,
  });
  const distinct = new Set();
  for (const r of crowded.results) { distinct.add(r.home.id); distinct.add(r.away.id); }
  assert.ok(distinct.size > DIVISION_SIZE);
  assert.equal(repairGroupSetup(crowded), null);
  assert.equal(repairCareer(crowded), null);

  // A matchday claimed with no results behind it: the season restarts
  // honestly at matchday 0 rather than showing a table it never earned.
  const claimed = JSON.parse(JSON.stringify(state));
  claimed.matchday = 5;
  claimed.results = [];
  assert.equal(groupSetupError(claimed), 'results');
  const restarted = repairGroupSetup(claimed);
  assert.equal(restarted.matchday, 0);
  assert.deepEqual(restarted.results, []);
  const ids = restarted.groups[restarted.groupIndex].clubIds;
  assert.deepEqual(restarted.fixtures, buildFixtures(seasonSeed(restarted), ids));
  const through = repairCareer(JSON.parse(JSON.stringify(claimed)));
  assert.ok(through);
  assert.equal(through.matchday, 0);
});

test('a matchday whose results went missing is played again, not shown as played', () => {
  const state = midCareer(GROUPS[7].clubIds[5], 5, 52);
  const original = JSON.parse(JSON.stringify(state.fixtures));
  const results = JSON.parse(JSON.stringify(state.results));
  const broken = JSON.parse(JSON.stringify(state));
  broken.results = broken.results.filter((r) => r.matchday !== 5);
  assert.equal(groupSetupError(broken), 'results');

  const repaired = repairGroupSetup(broken);
  assert.equal(repaired.matchday, 4);
  assert.deepEqual(repaired.results, results.filter((r) => r.matchday <= 4));
  // Day 5 comes back as the schedule had it, so it plays again unchanged.
  assert.deepEqual(repaired.fixtures.slice(4), original.slice(4));
  assert.equal(groupSetupError(repaired), null);
  // The report went with the day it described: Home shows no last result.
  assert.equal(repaired.lastReport, null);
});

test('a played matchday with a corrupted record replays from that day', () => {
  const state = midCareer(GROUPS[5].clubIds[1], 6, 71);
  const broken = JSON.parse(JSON.stringify(state));
  const day2 = broken.results.findIndex((r) => r.matchday === 2);
  broken.results.splice(day2, 1, {
    matchday: 2,
    home: { id: 'harbourside', name: 'Harbourside', short: 'HAR', color: 'x' },
    away: { id: 'nowhere', name: 'Nowhere', short: 'NOW', color: 'x' },
    homeGoals: 1, awayGoals: 0,
  });
  // The corrupted day is incomplete, so the season restarts at the day
  // before it: the days after it were played against a schedule the repair
  // cannot vouch for either.
  const repaired = repairGroupSetup(broken);
  assert.equal(repaired.matchday, 1);
  assert.deepEqual(repaired.results, state.results.filter((r) => r.matchday <= 1));
  assert.equal(groupSetupError(repaired), null);
  assert.equal(repaired.lastReport, null, 'the dropped days take their report with them');
  const through = repairCareer(JSON.parse(JSON.stringify(broken)));
  assert.ok(through);
  assert.equal(through.matchday, 1);
  assert.equal(through.lastReport, null);
});

test('a repaired career round-trips and plays on', () => {
  const state = midCareer(GROUPS[5].clubIds[4], 4, 101);
  const broken = JSON.parse(JSON.stringify(state));
  broken.fixtures = broken.fixtures.slice(0, 2);
  const repaired = repairGroupSetup(broken);
  assert.equal(groupSetupError(repaired), null);
  // A second pass changes nothing: the repair settles.
  assert.deepEqual(repairCareer(JSON.parse(JSON.stringify(repaired))), repaired);

  const table = leagueTable(repaired);
  assert.equal(table.length, DIVISION_SIZE);
  const before = table.find((r) => r.id === repaired.clubId);
  const next = JSON.parse(JSON.stringify(repaired));
  playMatchday(next);
  assert.equal(next.matchday, 5);
  assert.equal(next.results.length, repaired.results.length + HALF);
  const after = leagueTable(next).find((r) => r.id === next.clubId);
  assert.equal(after.played, before.played + 1);
});
