// How the Transfers tab narrows, orders and judges the market. Pure functions
// with no DOM, shared only by app.js, so the market's view state never touches
// the saved career.

import { POS_GROUP } from './engine.js';

export const MARKET_SORTS = [
  { value: 'newest', label: 'Newest listing' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'overall', label: 'Overall: highest first' },
  { value: 'age', label: 'Age: youngest first' },
];

export const POSITION_FILTERS = [
  { value: '', label: 'Any position' },
  { value: 'GK', label: 'Goalkeepers' },
  { value: 'DF', label: 'Defenders' },
  { value: 'MF', label: 'Midfielders' },
  { value: 'FW', label: 'Forwards' },
];

export const MIN_OVERALL_STEPS = [45, 50, 55, 60, 65, 70, 75, 80];
export const MAX_PRICE_STEPS = [500, 1000, 2500, 5000, 10000, 25000, 100000];

export const DEFAULT_MARKET_VIEW = {
  sort: 'newest',
  pos: '',
  minOverall: 0,
  maxPrice: 0,
  shortlistOnly: false,
};

const num = (n) => Number(n).toLocaleString('en-US');

const round50 = (n) => Math.round(n / 50) * 50;

// What a player is usually worth in Club credits: every overall point above
// 40 (at least 5 of them) is 150 credits, and age moves the price.
export function usualPrice(player) {
  const overall = Number(player && player.overall) || 0;
  const age = Number(player && player.age) || 0;
  const factor = age <= 23 ? 1.25 : age <= 29 ? 1 : age <= 32 ? 0.85 : 0.6;
  return round50(150 * Math.max(5, overall - 40) * factor);
}

// Bargain, Fair or Steep against the usual price, with one short reason.
export function valueHint(player, price) {
  const usual = usualPrice(player);
  const ask = Number(price) || 0;
  const kind = ask < 0.85 * usual ? 'bargain' : ask > 1.25 * usual ? 'steep' : 'fair';
  const label = kind === 'bargain' ? 'Bargain' : kind === 'steep' ? 'Steep' : 'Fair';
  const lead = kind === 'bargain' ? 'Below the usual ' : kind === 'steep' ? 'Above the usual ' : 'Close to the usual ';
  const whose = ' for a ' + (Number(player && player.overall) || 0) + '-overall '
    + (Number(player && player.age) || 0) + '-year-old.';
  return { kind, label, reason: lead + num(usual) + whose };
}

// The listings that pass every filter that is on.
export function filterListings(listings, view, starred) {
  const pos = view.pos;
  const minOverall = view.minOverall;
  const maxPrice = view.maxPrice;
  const shortlistOnly = view.shortlistOnly;
  return (listings || []).filter((l) => {
    if (!l || !l.player) return false;
    if (pos && POS_GROUP[l.player.pos] !== pos) return false;
    if (minOverall && l.player.overall < minOverall) return false;
    if (maxPrice && l.price > maxPrice) return false;
    if (shortlistOnly && !(starred && starred.has(l.id))) return false;
    return true;
  });
}

const listingTime = (l) => {
  const t = Date.parse(l && l.createdAt);
  return Number.isFinite(t) ? t : 0;
};
const listingId = (l) => {
  const n = Number(l && l.id);
  return Number.isFinite(n) ? n : 0;
};

// Newest first, then the listing number: every order ends the same way, so a
// tie never lets the list shuffle and the input array is never changed.
function compare(a, b, sort) {
  if (sort === 'price-asc' && a.price !== b.price) return a.price - b.price;
  if (sort === 'price-desc' && a.price !== b.price) return b.price - a.price;
  if (sort === 'overall' && a.player.overall !== b.player.overall) return b.player.overall - a.player.overall;
  if (sort === 'age' && a.player.age !== b.player.age) return a.player.age - b.player.age;
  const ta = listingTime(a);
  const tb = listingTime(b);
  if (ta !== tb) return tb - ta;
  return listingId(b) - listingId(a);
}

export function sortListings(listings, sort) {
  const order = MARKET_SORTS.some((s) => s.value === sort) ? sort : 'newest';
  return (listings || []).slice().sort((a, b) => compare(a, b, order));
}

// How many filters are on: the sort is not one of them.
export function activeFilterCount(view) {
  let n = 0;
  if (view.pos) n++;
  if (view.minOverall) n++;
  if (view.maxPrice) n++;
  if (view.shortlistOnly) n++;
  return n;
}
