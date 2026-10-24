// The 2D match view. A pure, deterministic timeline is built from a match
// report (the same report the match record keeps), and a small controller
// plays it on a canvas. The timeline parts are DOM-free so tests can import
// them; the controller takes the elements it needs and owns the animation
// loop. The pitch keeps the drawn pitch's white lines and white tokens; the
// viewer's own club is always the near side.

import { FORMATIONS, POS_GROUP, mulberry32 } from './engine.js';

// ── Pure timeline ────────────────────────────────────────────────────────

// The score as it stands at match minute t, counted from the report's goals.
export function scoreAt(report, t) {
  let home = 0;
  let away = 0;
  for (const m of report.moments) {
    if (m.type !== 'goal' || m.minute > t) continue;
    if (m.side === 'home') home++;
    else away++;
  }
  return { home, away };
}

// The moment in force at minute t: the last one the engine sorted before it.
export function currentMoment(report, t) {
  let cur = null;
  for (const m of report.moments) {
    if (m.minute <= t) cur = m;
  }
  return cur;
}

// Canonical pitch coordinates: x across the pitch, y from the goal the near
// side attacks (0) to the goal it defends (1). Formation slots already read
// this way (y from the opponent's goal), so the near side keeps them and the
// far side mirrors both axes.
const GOAL_Y = { near: 0.03, far: 0.97 };
const round6 = (v) => Math.round(v * 1e6) / 1e6;
const clamp01 = (v) => Math.min(0.98, Math.max(0.02, v));

function weightedPick(rng, items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// The whole replay: keyframes for the ball and all 22 players, who is on the
// pitch when, and the moments with the marker each one points at. Same
// report, sides and seed in, same timeline out.
export function buildTimeline(report, sides, ownClubId, seed) {
  const ownIsHome = report.home.id === ownClubId;
  const near = ownIsHome ? sides.home : sides.away;
  const far = ownIsHome ? sides.away : sides.home;
  const slotsOf = {
    near: FORMATIONS[near.tactics.formation].slots,
    far: FORMATIONS[far.tactics.formation].slots,
  };
  const baseOf = {
    near: slotsOf.near.map((s) => [s.x, s.y]),
    far: slotsOf.far.map((s) => [1 - s.x, 1 - s.y]),
  };
  const posOf = {
    near: slotsOf.near.map((s) => s.pos),
    far: slotsOf.far.map((s) => s.pos),
  };
  const byId = (side) => Object.fromEntries(side.squad.map((p) => [p.id, p]));
  const lookup = { near: byId(near), far: byId(far) };

  // Moments, remapped to near/far so nothing downstream needs home/away.
  const moments = report.moments.map((m) => ({
    ...m,
    side: (m.side === 'home') === ownIsHome ? 'near' : 'far',
  }));

  // ── Who is on the pitch, when ──────────────────────────────────────────
  // One track per starting slot. A sub keeps the slot: the outgoing player's
  // segment closes at the sub minute and the incoming one opens just after,
  // so the two never overlap for long. A red closes the segment for good.
  const tracks = { near: [], far: [] };
  for (const key of ['near', 'far']) {
    tracks[key] = key === 'near' ? near.lineup : far.lineup;
    tracks[key] = tracks[key].map((id, i) => ({
      slot: i,
      segs: [{ from: 0, to: 90, player: lookup[key][id] || { id, name: id, pos: 'CM' } }],
    }));
  }

  const findSlot = (key, minute, match) => {
    const track = tracks[key].find((tr) => tr.segs.some((s) => s.player && s.from <= minute && minute < s.to && match(s.player)));
    return track ? track.slot : null;
  };
  const closeSeg = (key, slot, minute) => {
    const track = tracks[key][slot];
    if (!track) return;
    const seg = track.segs[track.segs.length - 1];
    if (seg && seg.to > minute && seg.from < minute) seg.to = minute;
  };
  const openSeg = (key, slot, minute, player) => {
    const track = tracks[key][slot];
    if (track) track.segs.push({ from: minute, to: 90, player });
  };

  for (const m of moments) {
    if (m.type === 'sub') {
      const slot = findSlot(m.side, m.minute, (p) => p.name === m.playerOutName);
      m.ring = slot != null ? { side: m.side, slot } : null;
      if (slot != null) {
        closeSeg(m.side, slot, m.minute);
        openSeg(m.side, slot, m.minute + 0.6, lookup[m.side][m.playerId] || null);
      }
      continue;
    }
    const slot = findSlot(m.side, m.minute, (p) => p.id === m.playerId);
    m.ring = slot != null ? { side: m.side, slot } : null;
    if (m.type === 'red' && slot != null) closeSeg(m.side, slot, m.minute);
  }

  const markers = [];
  for (const key of ['near', 'far']) {
    for (const tr of tracks[key]) {
      for (const seg of tr.segs) {
        if (seg.player && seg.to > seg.from) {
          markers.push({
            side: key,
            slot: tr.slot,
            from: seg.from,
            to: seg.to,
            player: { id: seg.player.id, name: seg.player.name, pos: seg.player.pos },
          });
        }
      }
    }
  }

  const onPitchAt = (key, t) => {
    const out = [];
    for (const tr of tracks[key]) {
      for (const seg of tr.segs) {
        if (seg.player && seg.from <= t && (t < seg.to || seg.to >= 90)) out.push(tr.slot);
      }
    }
    return out;
  };

  // ── Ball choreography ──────────────────────────────────────────────────
  const minutes = [...new Set(moments.map((m) => m.minute))].sort((a, b) => a - b);
  const bounds = [0, ...minutes.filter((x) => x > 0 && x < 90), 90];
  const nearShare = (ownIsHome ? report.stats.possession[0] : report.stats.possession[1]) / 100;
  const weightOf = (pos) => {
    const g = POS_GROUP[pos] || 'MF';
    return g === 'GK' ? 0.5 : g === 'MF' ? 3 : 2;
  };

  // Where everyone stands when the ball is at `ball`: the owner runs to it,
  // the nearest teammate closes in halfway (capped), the nearest opponent
  // drifts a quarter of the way (capped), the rest hold their slot with a
  // little noise. All from the segment's own rng, so the timeline repeats.
  function positionsAt(t, ball, possKey, rng) {
    const pos = new Array(44).fill(0);
    for (const key of ['near', 'far']) {
      const base = baseOf[key];
      const entries = onPitchAt(key, t)
        .map((slot) => ({ slot, b: base[slot] }))
        .sort((a, b) => Math.hypot(ball[0] - a.b[0], ball[1] - a.b[1]) - Math.hypot(ball[0] - b.b[0], ball[1] - b.b[1]));
      entries.forEach((e, rank) => {
        let p;
        if (key === possKey && rank === 0) p = [ball[0], ball[1]];
        else if (key === possKey && rank === 1) {
          const dx = ball[0] - e.b[0];
          const dy = ball[1] - e.b[1];
          const d = Math.hypot(dx, dy) || 1;
          const k = Math.min(0.5, 0.15 / d);
          p = [e.b[0] + dx * k, e.b[1] + dy * k];
        } else if (key !== possKey && rank === 0) {
          const dx = ball[0] - e.b[0];
          const dy = ball[1] - e.b[1];
          const d = Math.hypot(dx, dy) || 1;
          const k = Math.min(0.25, 0.1 / d);
          p = [e.b[0] + dx * k, e.b[1] + dy * k];
        } else {
          p = [e.b[0] + (rng() * 2 - 1) * 0.012, e.b[1] + (rng() * 2 - 1) * 0.012];
        }
        const i = (key === 'near' ? 0 : 11) + e.slot;
        pos[i * 2] = round6(p[0]);
        pos[i * 2 + 1] = round6(p[1]);
      });
    }
    return pos;
  }

  const frames = [];
  const pushFrame = (t, ball, possKey, rng) => {
    frames.push({ t: round6(t), ball: [round6(ball[0]), round6(ball[1])], pos: positionsAt(t, ball, possKey, rng) });
  };

  // Where the move at the end of a segment ends: the goal mouth for a goal,
  // the offender's spot for a card or an injury, the touchline for a sub.
  function endFor(evs, rng) {
    const goal = evs.find((m) => m.type === 'goal');
    if (goal) return [0.4 + rng() * 0.2, GOAL_Y[goal.side]];
    const spot = evs.find((m) => m.type === 'injury' || m.type === 'yellow' || m.type === 'red');
    if (spot && spot.ring) {
      const b = baseOf[spot.side][spot.ring.slot];
      return [clamp01(b[0] + (rng() * 2 - 1) * 0.05), clamp01(b[1] + (rng() * 2 - 1) * 0.05)];
    }
    const sub = evs.find((m) => m.type === 'sub');
    if (sub && sub.ring) {
      const b = baseOf[sub.side][sub.ring.slot];
      return [b[0] < 0.5 ? 0.04 : 0.96, clamp01(b[1])];
    }
    return [clamp01(0.5 + (rng() * 2 - 1) * 0.25), clamp01(0.5 + (rng() * 2 - 1) * 0.25)];
  }

  let lastBall = [0.5, 0.5];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i];
    const b = bounds[i + 1];
    if (b <= a) continue;
    const rng = mulberry32((seed ^ Math.imul(i + 1, 0x9E3779B9)) >>> 0);
    const evs = moments.filter((m) => m.minute === b);
    const possKey = rng() < nearShare ? 'near' : 'far';

    // Kick off from the centre. After a goal, play restarts there too, with
    // the occasional set piece taken wide.
    let start = lastBall;
    if (i === 0) start = [0.5, 0.5];
    else if (evs.some((m) => m.type === 'goal')) {
      start = rng() < 0.15
        ? [rng() < 0.5 ? 0.05 : 0.95, rng() < 0.5 ? 0.05 : 0.95]
        : [0.5, 0.5];
    }

    if (i === 0) pushFrame(a, start, possKey, rng);

    const onPitch = onPitchAt(possKey, a);
    const pool = (onPitch.length ? onPitch : baseOf[possKey].map((_, s) => s));
    const jit = () => (rng() * 2 - 1) * 0.06;
    const n = 2 + Math.floor(rng() * 3);
    for (let k = 1; k <= n; k++) {
      const pick = weightedPick(rng, pool.map((slot) => ({ slot, w: weightOf(posOf[possKey][slot]) })));
      const b0 = baseOf[possKey][pick.slot];
      pushFrame(a + ((b - a) * k) / (n + 1), [clamp01(b0[0] + jit()), clamp01(b0[1] + jit())], possKey, rng);
    }
    const end = endFor(evs, rng);
    pushFrame(b, end, possKey, rng);
    lastBall = end;
  }

  return { frames, markers, moments };
}

// ── The controller ───────────────────────────────────────────────────────

// A goal, a card or an injury stops the clock for a beat; a sub plays on.
const AUTO_PAUSE = new Set(['goal', 'yellow', 'red', 'injury']);
const HOLD_MS = 1500;
const EVENT_WINDOW = 2.5; // match minutes an announcement stays up

const ICONS = {
  goal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/></svg>',
  yellow: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2" fill="rgb(var(--card-y))"/></svg>',
  red: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2" fill="rgb(var(--card-r))"/></svg>',
  sub: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/></svg>',
  injury: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/></svg>',
};

function callText(m, who) {
  if (m.type === 'goal') return { main: 'Goal, ' + who + m.playerName, sub: m.assistName ? 'Assist: ' + m.assistName : '' };
  if (m.type === 'yellow') return { main: 'Yellow card, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'red') return { main: 'Red card, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'injury') return { main: 'Injury, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'sub') return { main: 'Sub: ' + m.playerName + ' on for ' + m.playerOutName, sub: m.teamName };
  return { main: m.type, sub: '' };
}

export function createMatchView(els) {
  const canvas = els.canvas;
  const ctx = canvas.getContext('2d');
  const reduced = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  let timeline = null;
  let report = null;
  let meta = null;
  let t = 0;
  let playing = false;
  let speed = 1;
  let hold = 0; // a performance.now() deadline: the beat an event holds for
  let raf = 0;
  let last = 0;
  let scrubbing = false;
  let ro = null;

  function open(setup) {
    close();
    report = setup.report;
    timeline = buildTimeline(setup.report, setup.sides, setup.ownClubId, setup.seed);
    meta = setup.meta;
    t = 0;
    speed = 1;
    hold = 0;
    scrubbing = false;
    playing = !reduced.matches;
    els.stepBack.hidden = !reduced.matches;
    els.speeds.hidden = !!reduced.matches;
    setSpeedButtons();
    updatePlayButton();
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => draw());
      ro.observe(canvas);
    }
    last = performance.now();
    raf = requestAnimationFrame(loop);
    draw();
  }

  function close() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    playing = false;
    hold = 0;
    if (ro) {
      ro.disconnect();
      ro = null;
    }
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    // Never fast-forward: a background tab gets throttled frames, and a
    // long frame is clamped so the clock cannot jump.
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (hold) {
      if (now >= hold) hold = 0;
    } else if (playing && !scrubbing) {
      const prev = t;
      t = Math.min(90, t + dt * speed);
      const stop = pauseAt(prev, t);
      if (stop != null) {
        t = stop;
        hold = now + HOLD_MS;
      } else if (t >= 90) {
        playing = false;
        updatePlayButton();
      }
    }
    draw();
  }

  function pauseAt(prev, next) {
    for (const m of timeline.moments) {
      if (AUTO_PAUSE.has(m.type) && m.minute > prev && m.minute <= next) return m.minute;
    }
    return null;
  }

  function updatePlayButton() {
    els.playIcon.hidden = playing;
    els.pauseIcon.hidden = !playing;
    els.play.setAttribute('aria-label', reduced.matches ? 'Next moment' : playing ? 'Pause' : 'Play');
  }

  function setSpeedButtons() {
    for (const b of els.speeds.querySelectorAll('[data-speed]')) {
      b.setAttribute('aria-pressed', Number(b.dataset.speed) === speed ? 'true' : 'false');
    }
  }

  function playToggle() {
    if (reduced.matches) {
      step(1);
      return;
    }
    if (playing) {
      playing = false;
      hold = 0;
    } else {
      if (t >= 90) t = 0;
      hold = 0;
      playing = true;
    }
    updatePlayButton();
  }

  // Reduced motion never tweens: each press jumps to the next event, paused.
  function step(dir) {
    const stops = [0, ...timeline.moments.filter((m) => AUTO_PAUSE.has(m.type)).map((m) => m.minute), 90];
    if (dir > 0) {
      const next = stops.find((s) => s > t + 1e-9);
      t = next != null ? next : 90;
    } else {
      const prev = stops.filter((s) => s < t - 1e-9).pop();
      t = prev != null ? prev : 0;
    }
    playing = false;
    updatePlayButton();
    draw();
  }

  function onScrubInput() {
    scrubbing = true;
    playing = false;
    hold = 0;
    t = Math.max(0, Math.min(90, Number(els.scrub.value) || 0));
    updatePlayButton();
    draw();
  }
  function onScrubChange() {
    scrubbing = false;
  }

  function onVisibility() {
    if (document.hidden) {
      playing = false;
      hold = 0;
      updatePlayButton();
    }
  }

  function frameAt(tt) {
    const fr = timeline.frames;
    if (!fr.length) return { ball: [0.5, 0.5], pos: new Array(44).fill(0.5) };
    if (tt <= fr[0].t) return fr[0];
    for (let i = 1; i < fr.length; i++) {
      if (tt <= fr[i].t) {
        const a = fr[i - 1];
        const b = fr[i];
        const k = (tt - a.t) / (b.t - a.t || 1);
        return {
          ball: [a.ball[0] + (b.ball[0] - a.ball[0]) * k, a.ball[1] + (b.ball[1] - a.ball[1]) * k],
          pos: a.pos.map((v, j) => v + (b.pos[j] - v) * k),
        };
      }
    }
    return fr[fr.length - 1];
  }

  function visibleAt(tt) {
    return timeline.markers.filter((mk) => tt >= mk.from && (tt < mk.to || (mk.to >= 90 && tt >= 90)));
  }

  function draw() {
    if (!timeline || !report) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Portrait keeps the pitch tall (near side at the bottom); a wide canvas
    // lays it across (near side attacks to the right).
    const landscape = w >= h;
    const pad = 8;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const P = landscape
      ? (x, y) => [pad + (1 - y) * iw, pad + x * ih]
      : (x, y) => [pad + x * iw, pad + y * ih];

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    const corner = (x, y) => P(x, y);
    const box = (bx, by, bw, bh) => {
      const p1 = corner(bx, by);
      const p2 = corner(bx + bw, by + bh);
      ctx.strokeRect(Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.abs(p2[0] - p1[0]), Math.abs(p2[1] - p1[1]));
    };
    box(0, 0, 1, 1);
    const [m0, m1] = [P(0, 0.5), P(1, 0.5)];
    ctx.beginPath();
    ctx.moveTo(m0[0], m0[1]);
    ctx.lineTo(m1[0], m1[1]);
    ctx.stroke();
    const c = P(0.5, 0.5);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 0.085 * Math.min(iw, ih), 0, Math.PI * 2);
    ctx.stroke();
    box(0.29, 0, 0.42, 0.17);
    box(0.29, 0.83, 0.42, 0.17);

    const style = getComputedStyle(document.documentElement);
    const accent = 'rgb(' + style.getPropertyValue('--accent').trim() + ')';
    const onAccent = 'rgb(' + style.getPropertyValue('--on-accent').trim() + ')';
    const cardY = 'rgb(' + style.getPropertyValue('--card-y').trim() + ')';
    const cardR = 'rgb(' + style.getPropertyValue('--card-r').trim() + ')';

    const frame = frameAt(t);
    const r = Math.max(7, Math.min(iw, ih) * 0.032);

    const at = (mk) => {
      const i = (mk.side === 'near' ? 0 : 11) + mk.slot;
      return P(frame.pos[i * 2], frame.pos[i * 2 + 1]);
    };

    // The active event's marker gets a ring and a name label. A sub rings
    // the player walking off; a red's marker is gone by now, so the ring
    // falls back to anyone visible in that slot.
    const active = timeline.moments.find((m) => m.minute <= t && t - m.minute <= EVENT_WINDOW && m.ring) || null;
    let ringMk = null;
    if (active) {
      ringMk = visibleAt(active.minute).find((v) => v.side === active.ring.side && v.slot === active.ring.slot)
        || visibleAt(t).find((v) => v.side === active.ring.side && v.slot === active.ring.slot)
        || null;
    }

    const drawMarker = (mk) => {
      const [x, y] = at(mk);
      const isNear = mk.side === 'near';
      const isGk = mk.player.pos === 'GK';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isNear ? (isGk ? accent : '#ffffff') : 'rgba(9,20,13,0.85)';
      ctx.fill();
      ctx.fillStyle = isNear ? (isGk ? onAccent : '#16241c') : '#ffffff';
      ctx.font = '700 ' + Math.max(8, r * 0.72) + 'px ui-rounded, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(mk.player.pos, x, y + 0.5);
    };

    for (const mk of visibleAt(t)) {
      if (mk.side === 'far') drawMarker(mk);
    }
    for (const mk of visibleAt(t)) {
      if (mk.side === 'near') drawMarker(mk);
    }

    // The ball, on top of everything.
    const [bx, by] = P(frame.ball[0], frame.ball[1]);
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(4, r * 0.45), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(9,20,13,0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // A card's ring reads in its own colour; everything else in amber.
    if (ringMk) {
      const [x, y] = at(ringMk);
      ctx.beginPath();
      ctx.strokeStyle = active.type === 'yellow' ? cardY : active.type === 'red' ? cardR : accent;
      ctx.lineWidth = 3;
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      const label = active.playerName || '';
      if (label) {
        ctx.font = '600 ' + Math.max(10, r * 0.85) + 'px ui-rounded, system-ui, -apple-system, sans-serif';
        const tw = ctx.measureText(label).width;
        const pw = tw + 10;
        const ph = Math.max(10, r * 0.85) + 7;
        let py = y + r + 4;
        if (py + ph > h - 2) py = y - r - 4 - ph;
        const px = Math.min(Math.max(x - pw / 2, 2), w - pw - 2);
        const rad = ph / 2;
        ctx.beginPath();
        ctx.moveTo(px + rad, py);
        ctx.lineTo(px + pw - rad, py);
        ctx.arc(px + pw - rad, py + rad, rad, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(px + rad, py + ph);
        ctx.arc(px + rad, py + rad, rad, Math.PI / 2, -Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(9,20,13,0.82)';
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px + pw / 2, py + ph / 2 + 0.5);
      }
    }

    // The readouts around the pitch.
    const s = scoreAt(report, t);
    els.score.textContent = s.home + '–' + s.away;
    const minute = Math.floor(t);
    els.clock.textContent = 'Matchday ' + meta.matchday + ' · ' + (t >= 90 ? 'Full time' : minute + "'");
    if (!scrubbing) els.scrub.value = String(Math.min(90, t));
    const ann = timeline.moments.find((m) => m.minute <= t && t - m.minute <= EVENT_WINDOW) || null;
    if (ann) {
      els.call.hidden = false;
      els.callIcon.innerHTML = ICONS[ann.type] || '';
      const who = ann.teamName.replace(/ (FC|Athletic|Town|United|Rovers|City|Wanderers)$/, '') + ': ';
      const txt = callText(ann, who);
      els.callMain.textContent = txt.main;
      els.callSub.textContent = txt.sub;
      els.callSub.hidden = !txt.sub;
    } else {
      els.call.hidden = true;
    }
    canvas.setAttribute('aria-label', 'Match view, minute ' + minute + ', score ' + s.home + ' to ' + s.away);
  }

  els.play.addEventListener('click', playToggle);
  els.stepBack.addEventListener('click', () => step(-1));
  els.scrub.addEventListener('input', onScrubInput);
  els.scrub.addEventListener('change', onScrubChange);
  els.speeds.addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (b) {
      speed = Number(b.dataset.speed) || 1;
      setSpeedButtons();
    }
  });
  document.addEventListener('visibilitychange', onVisibility);

  return {
    open,
    close,
    get playing() {
      return playing;
    },
  };
}