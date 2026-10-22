// The club's facilities: six of them, level 1 to 5, raised one level at a time
// with Club credits won from matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACILITIES, FACILITY_MAX_LEVEL, UPGRADE_COSTS, upgradeCost,
  facilityLevels, upgradeFacility, downgradeFacility, maintenanceDue,
  academyIntake, buildInitialState, buildDemoState,
  repairCareer, startNextSeason, playMatchday,
} from '../public/engine.js';

const KEYS = ['stadium', 'training', 'academy', 'shop', 'food', 'hotel'];

test('a new career starts with every facility at level 1', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 7);
  assert.deepEqual(Object.keys(state.facilities).sort(), [...KEYS].sort());
  for (const key of KEYS) assert.equal(state.facilities[key], 1);
});

test('repairCareer fills in or fixes every facility level', () => {
  const base = buildInitialState('harbourside', 'Alex Morgan', 7);
  delete base.facilities;
  const filled = repairCareer(base);
  for (const key of KEYS) assert.equal(filled.facilities[key], 1);

  const partly = { ...buildInitialState('harbourside', 'Alex Morgan', 7), facilities: { stadium: 9, hotel: 'x', academy: 3 } };
  const fixed = repairCareer(partly);
  assert.equal(fixed.facilities.stadium, 1);
  assert.equal(fixed.facilities.hotel, 1);
  assert.equal(fixed.facilities.academy, 3);
  assert.equal(fixed.facilities.shop, 1);
});

test('an upgrade costs the same for every facility, by the level it reaches', () => {
  assert.deepEqual(UPGRADE_COSTS, { 2: 100, 3: 250, 4: 500, 5: 1000 });
  assert.equal(upgradeCost(2), 100);
  assert.equal(upgradeCost(3), 250);
  assert.equal(upgradeCost(4), 500);
  assert.equal(upgradeCost(5), 1000);
  assert.equal(upgradeCost(1), null);
  assert.equal(upgradeCost(6), null);
  assert.equal(upgradeCost(2.5), null);
});

test('an upgrade raises the level and spends the credits, leaving the input alone', () => {
  const state = { ...buildInitialState('harbourside', 'Alex Morgan', 7), credits: 300, facilities: { ...facilityLevels({}), training: 2 } };
  const out = upgradeFacility(state, 'training', 3);
  assert.ok(out.state);
  assert.equal(out.state.facilities.training, 3);
  assert.equal(out.state.facilities.stadium, 1);
  assert.equal(out.state.credits, 50);
  // The state it was given is unchanged.
  assert.equal(state.credits, 300);
  assert.equal(state.facilities.training, 2);
});

test('an upgrade is refused when it is unaffordable, out of turn or unknown', () => {
  const state = { ...buildInitialState('harbourside', 'Alex Morgan', 7), credits: 99 };
  assert.equal(upgradeFacility(state, 'stadium', 2).error, 'credits');
  assert.equal(upgradeFacility(state, 'stadium', 3).error, 'level');
  assert.equal(upgradeFacility(state, 'stadium', 1).error, 'level');
  assert.equal(upgradeFacility(state, 'stadium', 6).error, 'level');
  assert.equal(upgradeFacility(state, 'car_park', 2).error, 'facility');
  // Nothing is spent on a refusal.
  assert.equal(state.credits, 99);
});

test('a downgrade lowers the level and keeps the credits', () => {
  const state = { ...buildInitialState('harbourside', 'Alex Morgan', 7), credits: 300, facilities: { ...facilityLevels({}), training: 3 } };
  const out = downgradeFacility(state, 'training', 2);
  assert.ok(out.state);
  assert.equal(out.state.facilities.training, 2);
  assert.equal(out.state.facilities.stadium, 1);
  assert.equal(out.state.credits, 300);
  // The state it was given is unchanged.
  assert.equal(state.facilities.training, 3);
});

test('a downgrade is refused out of turn, at level 1 or for an unknown facility', () => {
  const state = { ...buildInitialState('harbourside', 'Alex Morgan', 7), facilities: { ...facilityLevels({}), training: 2 } };
  assert.equal(downgradeFacility(state, 'training', 1).state.facilities.training, 1);
  assert.equal(downgradeFacility(state, 'stadium', 0).error, 'level');
  assert.equal(downgradeFacility(state, 'training', 0).error, 'level');
  assert.equal(downgradeFacility(state, 'training', 2).error, 'level');
  assert.equal(downgradeFacility(state, 'training', 3).error, 'level');
  assert.equal(downgradeFacility(state, 'training', 1.5).error, 'level');
  assert.equal(downgradeFacility(state, 'training', '2').error, 'level');
  assert.equal(downgradeFacility(state, 'car_park', 1).error, 'facility');
});

test('a downgrade lowers the maintenance due', () => {
  const state = { ...buildInitialState('harbourside', 'Alex Morgan', 7), facilities: { ...facilityLevels({}), stadium: 4 } };
  assert.equal(maintenanceDue(state), 1500);
  const out = downgradeFacility(state, 'stadium', 3);
  assert.equal(maintenanceDue(out.state), 500);
});

test('prospects stay when the academy is downgraded', () => {
  const prospect = (i) => ({ id: 'y' + i, name: 'Prospect ' + i, pos: 'GK', overall: 40, attrs: {} });
  const base = buildInitialState('harbourside', 'Alex Morgan', 7);
  const withYouth = {
    ...base,
    facilities: { ...facilityLevels(base), academy: 2 },
    youth: Array.from({ length: 15 }, (_, i) => prospect(i)),
  };
  const down = downgradeFacility(withYouth, 'academy', 1).state;
  // Reloading and the rollover keep every prospect, over the new places.
  assert.equal(repairCareer(down).youth.length, 15);
  // No intake and nobody pushed out while it is over its places.
  const over = academyIntake({ ...down, youth: down.youth.slice() }, 1);
  assert.equal(over.youth.length, 15);
  assert.deepEqual(over.youth.map((p) => p.id), down.youth.map((p) => p.id));
  // Back within its places, the next intake runs again.
  const room = { ...down, youth: down.youth.slice(0, 10) };
  const after = academyIntake(room, 2);
  assert.equal(after.youth.length, 10);
  assert.equal(after.youth[0].id, 'y1-2-0');
});

test('the facilities and the credits carry into the next season', () => {
  const state = buildInitialState('harbourside', 'Alex Morgan', 7);
  while (!state.finished) playMatchday(state);
  state.facilities = { ...facilityLevels(state), stadium: 3, hotel: 5 };
  state.credits = 40;
  const next = startNextSeason(state);
  assert.equal(next.season, 2);
  assert.equal(next.facilities.stadium, 3);
  assert.equal(next.facilities.hotel, 5);
  assert.equal(next.facilities.shop, 1);
  // The balance carries, plus the sponsor fee when its target was met.
  assert.equal(next.credits, 40 + (next.lastSponsor.paid ? next.lastSponsor.fee : 0));
});

test('the demo club is partly built', () => {
  const demo = buildDemoState(1);
  assert.equal(demo.facilities.stadium, 4);
  assert.equal(demo.facilities.training, 2);
  for (const key of KEYS.filter((k) => k !== 'stadium' && k !== 'training')) {
    assert.equal(demo.facilities[key], 1);
  }
});

test('there are six facilities, each with a name and five effects', () => {
  assert.equal(FACILITY_MAX_LEVEL, 5);
  assert.deepEqual(FACILITIES.map((f) => f.key), KEYS);
  for (const f of FACILITIES) {
    assert.equal(typeof f.name, 'string');
    assert.ok(f.name.length > 0);
    assert.equal(f.levels.length, 5);
    for (const effect of f.levels) assert.ok(typeof effect === 'string' && effect.length > 0);
  }
});
