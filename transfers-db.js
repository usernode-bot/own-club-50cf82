'use strict';

// Buying a listed player: one transaction that takes the listing, the buyer's
// career and the seller's career in that order, so a buy and a withdraw at
// the same moment wait on the listing instead of deadlocking. Kept apart from
// server.js so it can be tested with a scripted fake client, like
// career-db.js.
//
// Resolves { career, version } on success, or { error, code } when the buy is
// refused. Every path commits or rolls back exactly once.

const SELLER_CREDIT =
  `UPDATE careers
      SET state = jsonb_set(state, '{credits}', to_jsonb(COALESCE((state->>'credits')::int, 0) + $1::int)),
          version = version + 1,
          updated_at = now()
    WHERE user_id = $2 AND club_id = $3 AND NOT is_demo`;

async function buyListing(pool, e, { listingId, userId, version }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // 1. The listing, so a second buyer or the seller's withdraw finds it gone.
    const listed = await client.query(
      'SELECT id, seller_user_id, seller_club_id, player, asking_price FROM transfer_listings WHERE id = $1 FOR UPDATE',
      [listingId]
    );
    if (!listed.rows.length) {
      await client.query('ROLLBACK');
      return { error: 'gone', code: 409 };
    }
    const row = listed.rows[0];
    if (row.seller_user_id === userId) {
      await client.query('ROLLBACK');
      return { error: 'own_listing', code: 409 };
    }
    // 2. The buyer.
    const buyer = await client.query(
      'SELECT state, version FROM careers WHERE user_id = $1 AND is_demo = false FOR UPDATE',
      [userId]
    );
    if (!buyer.rows.length) {
      await client.query('ROLLBACK');
      return { error: 'no_career', code: 404 };
    }
    if (Number.isInteger(version) && buyer.rows[0].version !== version) {
      await client.query('ROLLBACK');
      return { error: 'version_mismatch', code: 409 };
    }
    const listing = { id: row.id, player: row.player, price: row.asking_price };
    const out = e.buyPlayer(buyer.rows[0].state, listing);
    if (out.error) {
      await client.query('ROLLBACK');
      return { error: out.error === 'full' ? 'squad_full' : out.error, code: 409 };
    }
    // 3. The seller, if they still run that club. A staging seed has none:
    // nobody is paid.
    await client.query(SELLER_CREDIT, [listing.price, row.seller_user_id, row.seller_club_id]);
    const saved = await client.query(
      'UPDATE careers SET state = $3, version = version + 1, updated_at = now() WHERE user_id = $1 AND is_demo = false AND version = $2 RETURNING version',
      [userId, buyer.rows[0].version, out.state]
    );
    if (!saved.rows.length) {
      await client.query('ROLLBACK');
      return { error: 'version_mismatch', code: 409 };
    }
    await client.query('DELETE FROM transfer_listings WHERE id = $1', [listingId]);
    await client.query('COMMIT');
    return { career: out.state, version: saved.rows[0].version };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { buyListing };
