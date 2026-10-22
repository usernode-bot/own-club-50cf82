// The buy transaction in transfers-db.js, against a scripted fake client: the
// lock order, one commit, and a rollback on every refusal. Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buyListing } from '../transfers-db.js';
import { buildInitialState, GROUPS } from '../public/engine.js';

const CLUB = GROUPS[8].clubIds[5];

function fakeState(credits) {
  const state = buildInitialState(CLUB, 'Buyer', 5);
  state.credits = credits;
  return state;
}

// A client that answers the four queries buyListing runs, in any order, and
// records every statement.
function fakePool({ listing, buyer, sellerVersion = 2, deal = true }) {
  const log = [];
  const client = {
    released: false,
    async query(text, params) {
      log.push({ text, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
      if (/^DELETE FROM transfer_listings/.test(text)) return { rows: [] };
      if (/FROM transfer_listings WHERE id/.test(text)) {
        return { rows: listing ? [listing] : [] };
      }
      if (/FROM careers WHERE user_id = \$1 AND is_demo = false FOR UPDATE/.test(text)) {
        return { rows: buyer ? [buyer] : [] };
      }
      if (/jsonb_set/.test(text)) {
        // The seller is credited only when they still run the club.
        return { rows: deal ? [{ user_id: params[1] }] : [] };
      }
      if (/UPDATE careers SET state = \$3/.test(text)) {
        return { rows: [{ version: buyer.version + 1 }] };
      }
      throw new Error('unexpected query: ' + text);
    },
    release() { this.released = true; },
  };
  return { pool: { connect: async () => client }, log, client };
}

const listingRow = {
  id: 9,
  seller_user_id: 'seller',
  seller_club_id: 'wrenfield-wanderers',
  player: { id: 's1', name: 'Listed', pos: 'CM', age: 24, overall: 60, attrs: { pac: 60, pas: 60, sho: 50, def: 50, gk: 20 } },
  asking_price: 2000,
};

test('a buy locks the listing, then the buyer, then the seller, and commits once', async () => {
  const buyer = { state: fakeState(5000), version: 3 };
  const { pool, log } = fakePool({ listing: listingRow, buyer });
  const out = await buyListing(pool, (await import('../public/engine.js')), {
    listingId: 9, userId: 'buyer', version: 3,
  });
  const kinds = log.map((l) => {
    if (/^DELETE FROM transfer_listings/.test(l.text)) return 'delete';
    if (/FROM transfer_listings WHERE id/.test(l.text)) return 'listing';
    if (/FROM careers.*FOR UPDATE/.test(l.text)) return 'buyer';
    if (/jsonb_set/.test(l.text)) return 'seller';
    if (/UPDATE careers SET state = \$3/.test(l.text)) return 'buyer-write';
    return l.text;
  });
  assert.deepEqual(kinds, [
    'BEGIN', 'listing', 'buyer', 'seller', 'buyer-write', 'delete', 'COMMIT',
  ]);
  assert.equal(out.version, 4);
  assert.equal(out.career.credits, 3000);
  assert.ok(out.career.squads[CLUB].some((p) => p.id === 't9'));
  assert.equal(log.filter((l) => l.text === 'COMMIT').length, 1);
  assert.equal(log.filter((l) => l.text === 'ROLLBACK').length, 0);
  // The seller is credited in the same statement, by the price.
  const seller = log.find((l) => /jsonb_set/.test(l.text));
  assert.equal(seller.params[0], 2000);
});

test('a listing that is gone is refused and rolls back', async () => {
  const buyer = { state: fakeState(5000), version: 3 };
  const { pool, log } = fakePool({ listing: null, buyer });
  const e = await import('../public/engine.js');
  const out = await buyListing(pool, e, { listingId: 9, userId: 'buyer', version: 3 });
  assert.equal(out.error, 'gone');
  assert.equal(out.code, 409);
  assert.equal(log.filter((l) => l.text === 'COMMIT').length, 0);
  assert.equal(log.filter((l) => l.text === 'ROLLBACK').length, 1);
});

test('your own listing cannot be bought', async () => {
  const buyer = { state: fakeState(5000), version: 3 };
  const own = { ...listingRow, seller_user_id: 'buyer' };
  const { pool } = fakePool({ listing: own, buyer });
  const e = await import('../public/engine.js');
  const out = await buyListing(pool, e, { listingId: 9, userId: 'buyer', version: 3 });
  assert.equal(out.error, 'own_listing');
});

test('a full squad or short credits is refused, rolled back, and the listing kept', async () => {
  const e = await import('../public/engine.js');
  for (const credits of [0, 5000]) {
    const state = credits ? fakeState(5000) : fakeState(0);
    if (credits) {
      const player = listingRow.player;
      state.squads[CLUB] = new Array(e.SQUAD_MAX).fill(player);
    }
    const { pool, log } = fakePool({ listing: listingRow, buyer: { state, version: 3 } });
    const out = await buyListing(pool, e, { listingId: 9, userId: 'buyer', version: 3 });
    assert.equal(out.error, credits ? 'squad_full' : 'credits');
    assert.equal(log.some((l) => l.text === 'COMMIT'), false);
    assert.equal(log.some((l) => /DELETE FROM transfer_listings/.test(l.text)), false);
  }
});

test('a stale buyer version is refused before anything moves', async () => {
  const e = await import('../public/engine.js');
  const buyer = { state: fakeState(5000), version: 4 };
  const { pool, log } = fakePool({ listing: listingRow, buyer });
  const out = await buyListing(pool, e, { listingId: 9, userId: 'buyer', version: 3 });
  assert.equal(out.error, 'version_mismatch');
  assert.equal(log.some((l) => /jsonb_set/.test(l.text)), false);
  assert.equal(log.some((l) => l.text === 'COMMIT'), false);
});

test('when the seller has no career nobody is paid, and the buy still commits', async () => {
  const e = await import('../public/engine.js');
  const buyer = { state: fakeState(5000), version: 3 };
  const { pool, log } = fakePool({ listing: listingRow, buyer, deal: false });
  const out = await buyListing(pool, e, { listingId: 9, userId: 'buyer', version: 3 });
  assert.equal(out.error, undefined);
  assert.equal(out.career.credits, 3000);
  assert.equal(log.filter((l) => l.text === 'COMMIT').length, 1);
});
