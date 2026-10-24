// The team sheet's new pieces: duties, the out-of-position rule, Auto pick
// and the next opponent preview. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialState, autoLineup, repairCareer, startNextSeason, removePlayer,
  outOfPosition, dutyFields, dutyOf, defaultDuty, defaultRole, opponentPreview,
  leagueTable, formOf, CLUB_BY_ID, DUTIES,
} from '../public/engine.js';

const SEED = 20261024;

function fresh() {
  return buildInitialState('harbourside', 'Test Manager', SEED);
}

test('outOfPosition flags a player away from his own place, but not across central midfield', () => {
  assert.equal(outOfPosition('ST', 'CB'), true);
  assert.equal(outOfPosition('CB', 'RB'), true);
  assert.equal(outOfPosition('LW', 'CM'), true);
  assert.equal(outOfPosition('CM', 'DM'), false);
  assert.equal(outOfPosition('AM', 'CM'), false);
  assert.equal(outOfPosition('CB', 'CB'), false);
});

test('Auto pick fills eleven places from the squad, with a fit goalkeeper in goal', () => {
  const state = fresh();
  const squad = state.squads[state.clubId];

  const eleven = autoLineup(squad, state.tactics.formation, state.roles);
  assert.equal(eleven.length, 11);
  assert.equal(new Set(eleven).size, 11);
  assert.ok(eleven.every((id) => squad.some((p) => p.id === id)));
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  assert.equal(byId[eleven[0]].pos, 'GK');
  assert.ok(eleven.every((id) => byId[id].injury <= 0));

  // A keeper and two outfield players injured: the eleven is still full and
  // fit, with a goalkeeper in goal.
  const hurt = squad.find((p) => p.pos === 'GK');
  hurt.injury = 2;
  squad.find((p) => p.pos === 'CM').injury = 1;
  squad.find((p) => p.pos === 'ST').injury = 1;
  const picked = autoLineup(squad, state.tactics.formation, state.roles);
  assert.equal(picked.length, 11);
  assert.equal(new Set(picked).size, 11);
  assert.ok(picked.every((id) => byId[id].injury <= 0));
  assert.equal(byId[picked[0]].pos, 'GK');
});

test('Saved tactics reload exactly, duties included', () => {
  const state = fresh();
  const squad = state.squads[state.clubId];
  const striker = squad.find((p) => p.pos === 'ST');
  const cbSlot = state.lineup.findIndex((id) => {
    const p = squad.find((q) => q.id === id);
    return p && p.pos === 'CB';
  });
  state.lineup[cbSlot] = striker.id;
  state.tactics.mentality = 'Attacking';
  state.roles[striker.id] = 'Target forward';
  state.duties[striker.id] = 'Support';

  const reloaded = repairCareer(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(reloaded.lineup, state.lineup);
  assert.deepEqual(reloaded.tactics, state.tactics);
  assert.equal(reloaded.roles[striker.id], 'Target forward');
  assert.equal(reloaded.duties[striker.id], 'Support');
});

test('Duties default from each role and invalid entries are replaced', () => {
  const state = fresh();
  const squad = state.squads[state.clubId];
  for (const p of squad) {
    assert.equal(state.duties[p.id], defaultDuty(state.roles[p.id] || defaultRole(p.pos)));
  }

  const saved = JSON.parse(JSON.stringify(state));
  delete saved.duties;
  const filled = repairCareer(saved);
  for (const p of filled.squads[filled.clubId]) {
    assert.equal(filled.duties[p.id], defaultDuty(filled.roles[p.id] || defaultRole(p.pos)));
  }

  const wrong = JSON.parse(JSON.stringify(state));
  const first = wrong.squads[wrong.clubId][0];
  wrong.duties[first.id] = 'Not a duty';
  wrong.duties['gone-player'] = 'Attack';
  const cleaned = repairCareer(wrong);
  assert.equal(cleaned.duties[first.id], defaultDuty(cleaned.roles[first.id]));
  assert.equal(cleaned.duties['gone-player'], undefined);
  assert.ok(DUTIES.includes(cleaned.duties[first.id]));
});

test('A rollover keeps the duties of the players it carries, and a sale drops them', () => {
  const state = fresh();
  const squad = state.squads[state.clubId];
  const keptId = squad[0].id;
  state.duties[keptId] = state.duties[keptId] === 'Attack' ? 'Defend' : 'Attack';
  const chosen = state.duties[keptId];
  state.finished = true;

  const next = startNextSeason(state);
  const carried = next.squads[next.clubId].some((p) => p.id === keptId);
  if (carried) assert.equal(next.duties[keptId], chosen);
  assert.ok(Object.keys(next.duties).every((id) => next.squads[next.clubId].some((p) => p.id === id)));

  const other = squad.find((p) => p.id !== keptId);
  const after = removePlayer(state, other.id);
  assert.equal(after.duties[other.id], undefined);
});

test('opponentPreview names the next club with its table place, form and formation', () => {
  const state = fresh();
  const preview = opponentPreview(state);
  const next = state.fixtures[0].find((f) => f.home === state.clubId || f.away === state.clubId);
  const opponentId = next.home === state.clubId ? next.away : next.home;
  const club = CLUB_BY_ID[opponentId];
  const row = leagueTable(state).find((r) => r.id === opponentId);

  assert.equal(preview.clubId, opponentId);
  assert.equal(preview.name, club.name);
  assert.equal(preview.formation, club.formation);
  assert.equal(preview.rank, row.rank);
  assert.equal(preview.size, leagueTable(state).length);
  assert.deepEqual(preview.form, formOf(state, opponentId));
  assert.ok(preview.form.length <= 5);
  assert.equal(preview.played, row.played);

  state.matchday = state.fixtures.length;
  assert.equal(opponentPreview(state), null);
});

test('dutyOf falls back to the role default for a player with no stored duty', () => {
  const state = fresh();
  const p = state.squads[state.clubId][0];
  delete state.duties;
  assert.equal(dutyOf(state, p.id), defaultDuty(state.roles[p.id] || defaultRole(p.pos)));
  assert.equal(dutyFields(state)[p.id], dutyOf(state, p.id));
});
