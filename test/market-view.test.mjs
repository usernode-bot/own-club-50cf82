// The Transfers tab's view state: the sort orders, the filters that combine,
// the value hint and the count of filters that are on.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKET_SORTS, POSITION_FILTERS, MIN_OVERALL_STEPS, MAX_PRICE_STEPS,
  DEFAULT_MARKET_VIEW, usualPrice, valueHint, filterListings, sortListings, activeFilterCount,
} from '../public/market-view.js';

// The three staging listings, as the server sends them.
const KEEPER = {
  id: 3, price: 1500, createdAt: '2026-10-24T04:00:00.000Z',
  player: { name: 'Staging Demo Keeper', pos: 'GK', age: 29, overall: 52, wage: 168 },
};
const MIDFIELDER = {
  id: 2, price: 2400, createdAt: '2026-10-24T04:00:02.000Z',
  player: { name: 'Staging Demo Midfielder', pos: 'CM', age: 24, overall: 55, wage: 210 },
};
const STRIKER = {
  id: 1, price: 3200, createdAt: '2026-10-24T04:00:01.000Z',
  player: { name: 'Staging Demo Striker', pos: 'ST', age: 31, overall: 58, wage: 252 },
};
const LISTINGS = [KEEPER, MIDFIELDER, STRIKER];

const view = (over) => ({ ...DEFAULT_MARKET_VIEW, ...over });
const ids = (rows) => rows.map((l) => l.id);

test('the choices the controls offer', () => {
  assert.deepEqual(MARKET_SORTS.map((s) => s.value), ['newest', 'price-asc', 'price-desc', 'overall', 'age']);
  assert.equal(MARKET_SORTS[0].label, 'Newest listing');
  assert.deepEqual(POSITION_FILTERS.map((p) => p.value), ['', 'GK', 'DF', 'MF', 'FW']);
  assert.deepEqual(MIN_OVERALL_STEPS, [45, 50, 55, 60, 65, 70, 75, 80]);
  assert.deepEqual(MAX_PRICE_STEPS, [500, 1000, 2500, 5000, 10000, 25000, 100000]);
  assert.deepEqual(DEFAULT_MARKET_VIEW, { sort: 'newest', pos: '', minOverall: 0, maxPrice: 0, shortlistOnly: false });
});

test('the usual price follows overall and age', () => {
  assert.equal(usualPrice({ overall: 52, age: 29 }), 1800);
  assert.equal(usualPrice({ overall: 55, age: 24 }), 2250);
  assert.equal(usualPrice({ overall: 58, age: 31 }), 2300);
  // Age bands: up to 23 is worth a quarter more, 33 and over much less.
  assert.equal(usualPrice({ overall: 60, age: 23 }), 3750);
  assert.equal(usualPrice({ overall: 60, age: 24 }), 3000);
  assert.equal(usualPrice({ overall: 60, age: 29 }), 3000);
  assert.equal(usualPrice({ overall: 60, age: 30 }), 2550);
  assert.equal(usualPrice({ overall: 60, age: 32 }), 2550);
  assert.equal(usualPrice({ overall: 60, age: 33 }), 1800);
  // An overall below 45 still counts as five points above 40.
  assert.equal(usualPrice({ overall: 20, age: 26 }), 750);
});

test('each staging listing gets its hint and reason', () => {
  assert.deepEqual(valueHint(KEEPER.player, KEEPER.price), {
    kind: 'bargain', label: 'Bargain', reason: 'Below the usual 1,800 for a 52-overall 29-year-old.',
  });
  assert.deepEqual(valueHint(MIDFIELDER.player, MIDFIELDER.price), {
    kind: 'fair', label: 'Fair', reason: 'Close to the usual 2,250 for a 55-overall 24-year-old.',
  });
  assert.deepEqual(valueHint(STRIKER.player, STRIKER.price), {
    kind: 'steep', label: 'Steep', reason: 'Above the usual 2,300 for a 58-overall 31-year-old.',
  });
});

test('the hint boundaries count as fair', () => {
  const p = { overall: 52, age: 29 }; // usual 1,800
  assert.equal(valueHint(p, 1530).kind, 'fair'); // exactly 0.85 of it
  assert.equal(valueHint(p, 1529).kind, 'bargain');
  assert.equal(valueHint(p, 2250).kind, 'fair'); // exactly 1.25 of it
  assert.equal(valueHint(p, 2251).kind, 'steep');
});

test('each sort order is stable and ties fall back to newest then id', () => {
  assert.deepEqual(ids(sortListings(LISTINGS, 'newest')), [2, 1, 3]);
  assert.deepEqual(ids(sortListings(LISTINGS, 'price-asc')), [3, 2, 1]);
  assert.deepEqual(ids(sortListings(LISTINGS, 'price-desc')), [1, 2, 3]);
  assert.deepEqual(ids(sortListings(LISTINGS, 'overall')), [1, 2, 3]);
  assert.deepEqual(ids(sortListings(LISTINGS, 'age')), [2, 3, 1]);
});

test('a shuffled input gives the same order, and the input is untouched', () => {
  const copy = LISTINGS.slice();
  for (const sort of MARKET_SORTS.map((s) => s.value)) {
    const once = sortListings(LISTINGS, sort);
    const twice = sortListings(LISTINGS.slice().reverse(), sort);
    assert.deepEqual(ids(once), ids(twice), sort);
  }
  assert.deepEqual(LISTINGS, copy);
});

test('every order breaks a tie with the newest listing, then the id', () => {
  const a = { id: 10, price: 1000, createdAt: '2026-10-24T10:00:00Z', player: { pos: 'DF', age: 25, overall: 60 } };
  const b = { id: 11, price: 1000, createdAt: '2026-10-24T11:00:00Z', player: { pos: 'DF', age: 25, overall: 60 } };
  const c = { id: 12, price: 1000, createdAt: '2026-10-24T11:00:00Z', player: { pos: 'DF', age: 25, overall: 60 } };
  for (const sort of ['price-asc', 'price-desc', 'overall', 'age', 'newest']) {
    assert.deepEqual(ids(sortListings([a, b, c], sort)), [12, 11, 10], sort);
    assert.deepEqual(ids(sortListings([c, a, b], sort)), [12, 11, 10], sort);
  }
});

test('a listing with no date sorts last for newest', () => {
  const undated = { id: 9, price: 900, createdAt: null, player: { pos: 'DF', age: 25, overall: 60 } };
  assert.deepEqual(ids(sortListings([undated, KEEPER, MIDFIELDER], 'newest')), [2, 3, 9]);
});

test('each filter alone, and all of them together', () => {
  assert.deepEqual(ids(filterListings(LISTINGS, view({ pos: 'GK' }), new Set())), [3]);
  // The position filter uses the engine's groups: a left-back counts as DF.
  const back = { id: 4, price: 1200, createdAt: '2026-10-24T03:00:00Z', player: { pos: 'LB', age: 26, overall: 50 } };
  assert.deepEqual(ids(filterListings([...LISTINGS, back], view({ pos: 'DF' }), new Set())), [4]);
  assert.deepEqual(ids(filterListings(LISTINGS, view({ minOverall: 55 }), new Set())), [2, 1]);
  assert.deepEqual(ids(filterListings(LISTINGS, view({ maxPrice: 2400 }), new Set())), [3, 2]);
  assert.deepEqual(ids(filterListings(LISTINGS, view({ minOverall: 55, maxPrice: 2400 }), new Set())), [2]);
  assert.deepEqual(ids(filterListings(LISTINGS, view({ pos: 'MF', minOverall: 50, maxPrice: 2500 }), new Set())), [2]);
  // The same filters with a position that matches nobody.
  assert.deepEqual(ids(filterListings(LISTINGS, view({ pos: 'FW', minOverall: 50, maxPrice: 2500 }), new Set())), []);
});

test('the shortlist filter keeps only starred listings', () => {
  assert.deepEqual(ids(filterListings(LISTINGS, view({ shortlistOnly: true }), new Set())), []);
  assert.deepEqual(ids(filterListings(LISTINGS, view({ shortlistOnly: true }), new Set([1, 3]))), [3, 1]);
});

test('the filter count covers the filters, never the sort', () => {
  assert.equal(activeFilterCount(DEFAULT_MARKET_VIEW), 0);
  assert.equal(activeFilterCount(view({ sort: 'overall' })), 0);
  assert.equal(activeFilterCount(view({ pos: 'MF' })), 1);
  assert.equal(activeFilterCount(view({ pos: 'MF', minOverall: 60, maxPrice: 2500, shortlistOnly: true })), 4);
});
