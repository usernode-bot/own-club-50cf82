// One manager per club: the shop's free list and what a save may change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { freeShopClubs, saveCheck, SHOP_CLUB_IDS } from '../public/engine.js';

test('freeShopClubs drops taken clubs from each group', () => {
  const groups = freeShopClubs([]);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].clubIds.length, 18);
  assert.equal(groups.reduce((n, g) => n + g.free.length, 0), SHOP_CLUB_IDS.length);
  const taken = [groups[0].clubIds[0], groups[0].clubIds[1], groups[2].clubIds[0]];
  const after = freeShopClubs(taken);
  assert.equal(after[0].free.length, 16);
  assert.equal(after[2].free.length, 17);
  assert.equal(after[0].clubIds.length, 18);
  const report = after.map((g) => g.group);
  assert.deepEqual(report, ['A', 'B', 'C', 'D']);
});

test('a group with every club taken is reported empty', () => {
  const groups = freeShopClubs([]);
  const taken = groups[1].clubIds.slice();
  const after = freeShopClubs(taken);
  assert.equal(after[1].free.length, 0);
  assert.equal(after[0].free.length, 18);
});

test('saveCheck allows the same state and the rollover, and refuses a skipped matchday', () => {
  assert.equal(saveCheck({ season: 1, matchday: 5, finished: false }, { season: 1, matchday: 5 }), 'same');
  assert.equal(saveCheck({ season: 1, matchday: 34, finished: true }, { season: 2, matchday: 0 }), 'rollover');
  assert.equal(saveCheck({ season: 1, matchday: 5, finished: false }, { season: 1, matchday: 6 }), 'stale');
  assert.equal(saveCheck({ season: 1, matchday: 34, finished: true }, { season: 2, matchday: 3 }), 'stale');
  assert.equal(saveCheck({ season: 1, matchday: 34, finished: false }, { season: 2, matchday: 0 }), 'stale');
});
