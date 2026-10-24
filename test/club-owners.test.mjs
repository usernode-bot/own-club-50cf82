// One manager per club: the shop's free list and what a save may change.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freeShopClubs, shopGroups, purchaseError, saveCheck, clubTier, saleValue, openingBalance, GROUPS,
  managerLine, groupsNote, CLUBS, DIVISION_SIZE,
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

test('the league table names the manager of an owned club and calls the rest bots', () => {
  assert.equal(managerLine('a', { a: 'Sam' }, 'me', 'Alex'), 'Manager Sam');
  assert.equal(managerLine('b', { a: 'Sam' }, 'me', 'Alex'), 'Run by a bot');
});

test('the manager of the own club is named even when the map leaves it out', () => {
  // The demo season's own club is not in club_owners, so the map has nothing
  // for it; the page's own manager name is what the row says.
  assert.equal(managerLine('harbourside', {}, 'harbourside', 'Demo Manager'), 'Manager Demo Manager');
  assert.equal(managerLine('harbourside', { harbourside: 'Other' }, 'harbourside', 'Demo Manager'), 'Manager Demo Manager');
  // Without a name of its own, the stored one is used, then the bot line.
  assert.equal(managerLine('x', { x: 'Sam' }, 'x', ''), 'Manager Sam');
  assert.equal(managerLine('x', {}, 'x', ''), 'Run by a bot');
});

test('a club a person owns is never called a bot, and a nameless one says Manager', () => {
  assert.equal(managerLine('a', undefined, 'me', 'Alex'), 'Run by a bot');
  assert.equal(managerLine('a', null, 'me', 'Alex'), 'Run by a bot');
  assert.equal(managerLine('a', 'Sam', 'me', 'Alex'), 'Run by a bot');
  // An owned club with no stored name, as a row from before the column.
  assert.equal(managerLine('a', { a: '' }, 'me', 'Alex'), 'Manager');
});

test('the four-groups note matches the pyramid, and Division 1 has none', () => {
  assert.equal(groupsNote(2), 'Division 2 has four groups of 18: the Coastal League holds 162 clubs.');
  assert.equal(groupsNote(3), 'Division 3 has four groups of 18: the Coastal League holds 162 clubs.');
  assert.equal(groupsNote(1), '');
  assert.equal(groupsNote(4), '');
  assert.equal(groupsNote(undefined), '');
  // The sentence is the pyramid's own numbers.
  assert.equal(GROUPS.filter((g) => g.tier === 3).length, 4);
  assert.equal(GROUPS.filter((g) => g.tier === 2).length, 4);
  assert.equal(GROUPS.every((g) => g.clubIds.length === DIVISION_SIZE), true);
  assert.equal(CLUBS.length, 162);
  assert.match(groupsNote(3), /holds 162 clubs/);
});
