// One manager per club: the shop's free list and what a save may change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freeShopClubs, shopGroups, purchaseError, saveCheck, clubTier, saleValue, openingBalance, GROUPS,
} from '../public/engine.js';

// The server's sale values, as server.js holds them.
const SALE_VALUE = { 1: 300, 2: 200, 3: 100 };

// A version 3 career in the division it says it is in.
function v3State(division) {
  return {
    version: 3,
    division,
    groupIndex: 0,
    group: 'A',
    groups: [{ name: 'Division ' + division + ' Group A', clubIds: [] }],
  };
}

test('freeShopClubs drops taken clubs from every group in the pyramid', () => {
  const groups = freeShopClubs([]);
  assert.equal(groups.length, 9);
  assert.equal(groups[0].clubIds.length, 18);
  assert.equal(groups.reduce((n, g) => n + g.free.length, 0), 162);
  const taken = [groups[0].clubIds[0], groups[0].clubIds[1], groups[8].clubIds[0]];
  const after = freeShopClubs(taken);
  assert.equal(after[0].free.length, 16);
  assert.equal(after[8].free.length, 17);
  assert.equal(after[0].clubIds.length, 18);
  const shop = shopGroups(taken);
  assert.equal(shop.length, 9);
  assert.equal(shop[0].tier, 1);
  assert.equal(shop[8].tier, 3);
  assert.equal(shop[0].clubs[0].taken, true);
  assert.equal(shop[8].clubs[1].taken, false);
});

test('purchaseError accepts a free club in any division and refuses a short wallet', () => {
  const d1 = GROUPS.find((g) => g.tier === 1).clubIds[0];
  const d2 = GROUPS.find((g) => g.tier === 2).clubIds[0];
  assert.equal(purchaseError(d1, 300, 300), null);
  assert.equal(purchaseError(d1, 299, 300), 'balance');
  assert.equal(purchaseError(d2, 200, 200), null);
  assert.equal(purchaseError('not-a-club', 1000, 100), 'club');
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

test('a sale pays by the tier the club is in when it is sold', () => {
  assert.equal(clubTier(v3State(3)), 3);
  assert.equal(clubTier(v3State(2)), 2);
  assert.equal(clubTier(v3State(1)), 1);
  assert.equal(saleValue(v3State(3), SALE_VALUE), 100);
  assert.equal(saleValue(v3State(2), SALE_VALUE), 200);
  assert.equal(saleValue(v3State(1), SALE_VALUE), 300);
});

test('a career from before the pyramid pays by the division it maps to', () => {
  // The eight-division league: 1 stays, 2 stays, every other division is
  // Division 3 in the pyramid.
  assert.equal(clubTier({ version: 2, division: 2 }), 2);
  assert.equal(saleValue({ version: 2, division: 2 }, SALE_VALUE), 200);
  assert.equal(clubTier({ version: 2, division: 5 }), 3);
  assert.equal(saleValue({ version: 2, division: 5 }, SALE_VALUE), 100);
  // The old ten-club season became Division 1.
  assert.equal(clubTier({ version: 1 }), 1);
  assert.equal(saleValue({ version: 1 }, SALE_VALUE), 300);
  // A version 3 career with no group, and a tier with no value, pay nothing
  // rather than guessing.
  assert.equal(clubTier({ version: 3, division: 2 }), 1);
  assert.equal(saleValue(v3State(2), {}), 0);
  assert.equal(saleValue(v3State(2), undefined), 0);
});

test('a sold Division 3 club is free in the shop again', () => {
  const groups = freeShopClubs([]);
  const sold = groups[0].clubIds[0];
  const before = freeShopClubs([sold]);
  assert.equal(before[0].free.includes(sold), false);
  // The sale takes the club out of the taken list, so the shop lists it.
  const after = freeShopClubs([sold].filter((id) => id !== sold));
  assert.equal(after[0].free.includes(sold), true);
  assert.equal(after[0].free.length, 18);
});

test('a sale credits the wallet the person keeps across careers', () => {
  // Bought for 100 out of 1,000, promoted, then sold for 300.
  assert.equal(openingBalance(900, 1000) + saleValue(v3State(2), SALE_VALUE), 1100);
  // A career from before the wallet: the starting balance plus the sale.
  assert.equal(openingBalance(null, 1000) + saleValue(v3State(3), SALE_VALUE), 1100);
  // The store's own balance is the one used when there is one.
  assert.equal(openingBalance(1200, 1000), 1200);
});
