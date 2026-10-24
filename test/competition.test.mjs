// Checks for the Competition tab's data: which places move at the end of the
// season, each club's last five results, and the group's top scorers. Run with
// `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, CLUB_BY_ID, COASTAL_IDS,
  buildInitialState, buildSquad, buildFixtures, playMatchday, defaultRole, autoLineup,
  divisionClubIds, leagueTable, formOf, nextPlacement, tableZone, topScorers,
} from '../public/engine.js';

// A state whose league ranks the clubs exactly in `order`: each club beats
// every club below it, so no two clubs share a points total.
function rankedState(base, order) {
  const state = { ...base, results: [] };
  for (let i = 0; i < order.length; i++) {
    for (let j = i + 1; j < order.length; j++) {
      state.results.push({
        matchday: 1,
        home: CLUB_BY_ID[order[i]],
        away: CLUB_BY_ID[order[j]],
        homeGoals: 1,
        awayGoals: 0,
      });
    }
  }
  return state;
}

// The managers' clubs, one in each tier.
const CLUB = {
  1: GROUPS[0].clubIds[0],
  2: GROUPS[1].clubIds[0],
  3: GROUPS[5].clubIds[0],
};

// A saved version 1 career, the old ten-club season.
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

test('table zones follow each tier\'s rules', () => {
  const cases = {
    1: (rank) => (rank >= 11 ? 'relegation' : null),
    2: (rank) => (rank <= 2 ? 'promotion' : rank >= 17 ? 'relegation' : null),
    3: (rank) => (rank <= 2 ? 'promotion' : null),
  };
  for (const tier of [1, 2, 3]) {
    const state = buildInitialState(CLUB[tier], 'Zone tester', 11);
    assert.equal(state.division, tier);
    const size = divisionClubIds(state).length;
    for (let rank = 1; rank <= size; rank++) {
      assert.equal(tableZone(state, rank), cases[tier](rank), `tier ${tier}, rank ${rank}`);
    }
  }
});

test('every rank\'s zone agrees with where the season actually sends the club', () => {
  for (const tier of [1, 2, 3]) {
    const base = buildInitialState(CLUB[tier], 'Zone tester', 11);
    const ids = divisionClubIds(base);
    for (let rank = 1; rank <= ids.length; rank++) {
      // Rank `rank` goes to the manager; the rest keep their order.
      const order = ids.filter((id) => id !== base.clubId);
      order.splice(rank - 1, 0, base.clubId);
      const state = rankedState(base, order);
      const rows = leagueTable(state);
      assert.equal(rows.find((r) => r.id === state.clubId).rank, rank, `tier ${tier} rank ${rank}`);
      const placement = nextPlacement(state);
      const expected = placement.kind === 'promoted' ? 'promotion'
        : placement.kind === 'relegated' ? 'relegation' : null;
      assert.equal(tableZone(state, rank), expected, `tier ${tier}, rank ${rank}: ${placement.kind}`);
    }
  }
});

test('a career from before the three tiers has no zones', () => {
  const state = v1State(7);
  for (let rank = 1; rank <= divisionClubIds(state).length; rank++) {
    assert.equal(tableZone(state, rank), null);
  }
  assert.equal(tableZone({ version: 2, results: [] }, 1), null);
});

test('form is empty before the first matchday and matches the results after two', () => {
  const state = buildInitialState(CLUB[2], 'Form tester', 11);
  for (const id of divisionClubIds(state)) assert.deepEqual(formOf(state, id), []);

  playMatchday(state);
  playMatchday(state);

  for (const id of divisionClubIds(state)) {
    const form = formOf(state, id);
    assert.equal(form.length, 2);
    const expected = state.results.map((r) => {
      if (r.home.id === id) return r.homeGoals > r.awayGoals ? 'W' : r.homeGoals < r.awayGoals ? 'L' : 'D';
      if (r.away.id === id) return r.awayGoals > r.homeGoals ? 'W' : r.awayGoals < r.homeGoals ? 'L' : 'D';
      return null;
    }).filter(Boolean);
    assert.deepEqual(form, expected, CLUB_BY_ID[id].name);
  }
  assert.deepEqual(formOf(state, CLUB[2]).length, 2);
});

test('top scorers come from the goals recorded in the group\'s matches', () => {
  const state = buildInitialState(CLUB[2], 'Scorer tester', 11);
  const ids = divisionClubIds(state);
  assert.deepEqual(topScorers(state), []);

  playMatchday(state);
  playMatchday(state);

  const list = topScorers(state);
  assert.ok(list.length > 0);
  assert.ok(list.length <= 10);
  for (const p of list) {
    assert.ok(p.goals > 0);
    assert.ok(ids.includes(p.clubId));
    assert.equal(p.clubName, CLUB_BY_ID[p.clubId].name);
  }
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].goals > list[i].goals
      || (list[i - 1].goals === list[i].goals && list[i - 1].name.localeCompare(list[i].name) <= 0));
  }

  const all = topScorers(state, Infinity);
  const recorded = state.results.reduce((s, r) => s + r.homeGoals + r.awayGoals, 0);
  const scored = all.reduce((s, p) => s + p.goals, 0);
  assert.equal(scored, recorded);

  // A leading scorer who leaves the goals behind, or moves to a club in the
  // group with no goals of their own, still sorts correctly.
  const leader = all[0];
  const player = state.squads[leader.clubId].find((p) => p.id === leader.id);
  player.goals = 0;
  const without = topScorers(state, Infinity);
  assert.ok(!without.some((p) => p.id === leader.id));
  assert.equal(without.reduce((s, p) => s + p.goals, 0), recorded - leader.goals);
  for (let i = 1; i < without.length; i++) {
    assert.ok(without[i - 1].goals >= without[i].goals);
  }
});
