// Own Club's screens. Everything a person sees and taps: the new career, the
// club screen with its pitch, the player sheet and the match report. All the
// football is in engine.js; this file renders state, sends changes to the
// server and draws the pitch on a canvas.

import {
  CLUBS, CLUB_BY_ID, LEAGUE_NAME, FORMATIONS, FORMATION_NAMES,
  MENTALITY_NAMES, PRESSING_NAMES, ROLES, POS_GROUP,
  GROUPS, TIER_COUNT, clubToGroup, groupName,
  divisionClubIds, placeName, seasonOutcome, startNextSeason,
  arrangeLineup, autoLineup, validateLineup, playMatchday,
  leagueTable, formOf, nextFixture, objectiveMet, clubSummary, defaultRole,
  repairCareer,
} from './engine.js';

// ── Small helpers ────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const displayName = (club) => (club.name || '').replace(/ (FC|Athletic|Town|United|Rovers|City|Wanderers)$/, '');

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const TOKEN = params.get('token') || '';

let career = null;
let version = null;
let screen = 'loading';
// What the shop says a club costs and how much a new wallet holds. The server
// sends these with every load; the defaults only stand in until it does.
let shop = { price: 100, startingBalance: 1000, currency: 'Dummy USDC' };
const SHOP_GROUPS = GROUPS.filter((g) => g.tier === TIER_COUNT);
let pickedGroup = 'A';
let pickedClub = SHOP_GROUPS[0].clubIds[0];
let menuKind = null;
let sheetPlayerId = null;
let saveFailed = false;
let loadError = '';
let busy = false;

function apiUrl() { return '/api/career' + (DEMO ? '?demo=1' : ''); }

async function api(method, body) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (TOKEN) headers['x-usernode-token'] = TOKEN;
  const res = await fetch(apiUrl(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, data };
}

// ── Views ────────────────────────────────────────────────────────────────
function showView(name) {
  screen = name;
  for (const v of ['loading', 'error', 'new', 'club']) {
    $('view-' + v).hidden = v !== name;
  }
  $('view-report').hidden = name !== 'report';
  $('demo-note').hidden = !(DEMO && career && (name === 'club' || name === 'report' || name === 'error'));
}

function render() {
  showView(screen);
  if (screen === 'club' && career) renderClub();
  if (screen === 'new') renderNew();
  if (screen === 'report' && career && career.lastReport) renderReport();
}

// Why a career did not load, in one line under the message. The codes in
// brackets name the exact failure in a report.
const LOAD_CAUSE = {
  signin: 'Your Homeroom sign-in has run out. Close Own Club and open it again from Homeroom.',
  server: (code) => 'The server could not read your career (' + code + '). Try again in a moment.',
  network: 'Own Club could not reach the server. Check your connection, then press Retry.',
  shown: 'Your saved career was read but could not be shown on this screen (career_unreadable).',
};

function setLoadCause(text) {
  const el = $('error-cause');
  el.textContent = text || '';
  el.hidden = !text;
}

async function load() {
  screen = 'loading';
  career = null;
  setLoadCause('');
  render();

  let cause = '';
  let answer = null;
  try {
    answer = await api('GET');
  } catch (err) {
    cause = LOAD_CAUSE.network;
  }

  if (answer && answer.data && answer.data.shop) shop = answer.data.shop;

  if (!cause && answer) {
    if (answer.status === 404 || (answer.status === 200 && answer.data && answer.data.career === null)) {
      screen = 'new';
      render();
      return;
    }
    if (answer.status === 401) cause = LOAD_CAUSE.signin;
    else if (answer.status !== 200 || !answer.data || !answer.data.career) {
      cause = LOAD_CAUSE.server((answer.data && answer.data.error) || 'HTTP ' + answer.status);
    }
  }

  if (!cause) {
    const repaired = repairCareer(answer.data.career);
    if (!repaired) {
      cause = LOAD_CAUSE.shown;
    } else {
      career = repaired;
      version = answer.data.version;
      screen = 'club';
      try {
        render();
        return;
      } catch (err) {
        console.error('career render failed', err);
        career = null;
        cause = LOAD_CAUSE.shown;
      }
    }
  }

  loadError = cause;
  $('error-text').textContent = 'Your career could not be read from the server. Your last saved matchday is kept.';
  setLoadCause(cause);
  screen = 'error';
  render();
}

// ── New career ───────────────────────────────────────────────────────────
const CLUB_PREVIEW = {};
for (const c of CLUBS) CLUB_PREVIEW[c.id] = clubSummary(1, c, GROUPS[clubToGroup[c.id]].tier).avg;

const usdc = (n) => Number(n).toLocaleString('en-US') + ' USDC';

const STAR_PATH = 'M12 3.2l2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 16.99l-5.4 2.84 1.03-6.02L3.26 9.55l6.04-.88z';

function starIcon(filled) {
  return '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false" ' +
    (filled
      ? 'fill="currentColor" '
      : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" ') +
    'class="star' + (filled ? '' : ' star-off') + '"><path d="' + STAR_PATH + '"/></svg>';
}

function stars(n) {
  let icons = '';
  for (let i = 0; i < 5; i++) icons += starIcon(i < n);
  return '<span class="stars" role="img" aria-label="' + n + ' of 5 stars">' + icons + '</span>';
}

const CHECK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

function renderNew() {
  $('manager-name').value = $('manager-name').value || '';
  for (const btn of $('group-row').querySelectorAll('[data-group]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.group === pickedGroup));
  }
  $('wallet-balance').textContent = usdc(shop.startingBalance);
  const group = SHOP_GROUPS.find((g) => g.group === pickedGroup) || SHOP_GROUPS[0];
  const list = $('club-list');
  list.innerHTML = group.clubIds.map((id) => CLUB_BY_ID[id]).map((c) => `
    <li class="list-row club-row${c.id === pickedClub ? ' me' : ''}" data-club-id="${esc(c.id)}" tabindex="0" role="button" aria-pressed="${c.id === pickedClub}">
      <span class="badge" style="background:${c.color}">${esc(c.short)}</span>
      <span class="nm">${esc(c.name)}<small>${stars(c.rep)} Squad ${CLUB_PREVIEW[c.id]}, ${esc(c.objective)}</small></span>
      <span class="price">${usdc(shop.price)}</span>
      <span class="tick" aria-hidden="true">${c.id === pickedClub ? CHECK_SVG : ''}</span>
    </li>`).join('');
  const picked = CLUB_BY_ID[pickedClub];
  $('start-career').textContent = picked ? 'Buy ' + picked.name + ' for ' + usdc(shop.price) : 'Buy a club';
}

async function startCareer() {
  if (busy) return;
  const name = $('manager-name').value.trim();
  const errBox = $('career-error');
  const errText = $('career-error-text');
  errBox.hidden = true;
  if (!name) {
    errBox.hidden = false;
    errText.textContent = 'Add a manager name to start.';
    $('manager-name').focus();
    return;
  }
  if (name.length > 40) {
    errBox.hidden = false;
    errText.textContent = 'A manager name is up to 40 characters.';
    return;
  }
  if (!pickedClub) {
    errBox.hidden = false;
    errText.textContent = 'Choose a club to manage.';
    return;
  }
  busy = true;
  const btn = $('start-career');
  btn.disabled = true;
  try {
    const { status, data } = await api('POST', { managerName: name, clubId: pickedClub });
    if (status === 401 && data && data.error === 'account_required') {
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'start a career' });
      errBox.hidden = false;
      errText.textContent = 'Make an account to start a career.';
      return;
    }
    if (status === 400 && data && data.message) {
      errBox.hidden = false;
      errText.textContent = data.message;
      return;
    }
    if (status !== 200) throw new Error('HTTP ' + status);
    career = data.career;
    version = data.version;
    screen = 'club';
    render();
  } catch (err) {
    errBox.hidden = false;
    errText.textContent = 'The club was not bought. Check the connection and press Buy again.';
  } finally {
    busy = false;
    btn.disabled = false;
  }
}

// ── Club screen ──────────────────────────────────────────────────────────
function badgeHtml(club) {
  return '<span class="badge" style="background:' + club.color + '">' + esc(club.short) + '</span>';
}

function playerStatus(p, starters) {
  const parts = [];
  if (p.injury > 0) parts.push('Injured for ' + p.injury + (p.injury === 1 ? ' match' : ' matches'));
  else parts.push(starters.has(p.id) ? 'Starter' : 'Bench');
  if (p.captain) parts.push('captain');
  if (p.yellow > 0 && p.injury <= 0) parts.push(p.yellow + (p.yellow === 1 ? ' yellow card' : ' yellow cards'));
  if (p.goals > 0) parts.push(p.goals + (p.goals === 1 ? ' goal' : ' goals'));
  return parts.join(', ');
}

function renderClub() {
  const table = leagueTable(career);
  const me = table.find((r) => r.id === career.clubId);
  const club = CLUB_BY_ID[career.clubId];
  const total = career.fixtures.length;
  const next = nextFixture(career);
  const pyramid = career.version >= 2;
  const place = placeName(career);

  if (pyramid) {
    $('club-md').textContent = career.finished
      ? 'Season ' + career.season + ' complete'
      : 'Season ' + career.season + ', matchday ' + (career.matchday + 1) + ' of ' + total;
  } else {
    $('club-md').textContent = career.finished ? 'Season complete' : 'Matchday ' + (career.matchday + 1) + ' of ' + total;
  }
  $('club-name').textContent = club.name;
  $('club-pos').textContent = ordinal(me.rank) + ' in ' + place;

  // Next match, or the wrap-up.
  if (next && !career.finished) {
    $('next-card').hidden = false;
    $('season-card').hidden = true;
    const home = CLUB_BY_ID[next.home];
    const away = CLUB_BY_ID[next.away];
    $('next-home-badge').outerHTML = badgeHtml(home).replace('<span ', '<span id="next-home-badge" ');
    $('next-home-name').textContent = displayName(home);
    $('next-away-badge').outerHTML = badgeHtml(away).replace('<span ', '<span id="next-away-badge" ');
    $('next-away-name').textContent = displayName(away);
    $('next-venue').textContent = next.venue;
    $('next-label').textContent = 'Next match';
    $('play-note').hidden = true;
    $('play-btn').hidden = false;
    $('play-btn').disabled = false;
  } else {
    $('next-card').hidden = true;
    $('season-card').hidden = false;
    const outcome = seasonOutcome(career);
    const met = objectiveMet(me.rank, club.objective, divisionClubIds(career).length);
    const to = groupName(outcome.toDivision, outcome.toGroup);
    const bits = [];
    if (pyramid) {
      bits.push(outcome.kind === 'champions' ? 'Champions of the ' + LEAGUE_NAME + '.'
        : outcome.kind === 'promoted' ? 'Promoted to ' + to + '.'
          : outcome.kind === 'relegated' ? 'Relegated to ' + to + '.'
            : 'You stay in ' + to + '.');
    }
    bits.push('The board asked you to ' + club.objective.toLowerCase() + '. That was ' + (met ? 'met.' : 'not met.'));
    bits.push('You took ' + me.points + ' points from ' + me.played + ' matches.');
    if (outcome.joinsNewLeague) {
      bits.push('Next season the Coastal League becomes three tiers, and your club starts in ' + to + '.');
    }
    $('season-title').textContent = 'You finished ' + ordinal(me.rank) + ' in ' + place;
    $('season-text').textContent = bits.join(' ');
  }

  $('val-formation').textContent = career.tactics.formation;
  $('val-mentality').textContent = career.tactics.mentality;
  $('val-pressing').textContent = career.tactics.pressing;

  // Squad: starters first, then the rest by rating.
  const squad = career.squads[career.clubId];
  const starters = new Set(career.lineup);
  const ordered = [...squad].sort((a, b) => {
    const sa = starters.has(a.id) ? 0 : 1;
    const sb = starters.has(b.id) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return b.overall - a.overall;
  });
  $('squad-list').innerHTML = ordered.map((p) => {
    const low = p.fitness < 60;
    return `<li class="list-row row-btn" data-player-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)}, ${esc(p.pos)}, ${esc(playerStatus(p, starters))}">
      <span class="pos">${esc(p.pos)}</span>
      <span class="nm">${esc(p.name)}<small>${esc(playerStatus(p, starters))}</small></span>
      <span class="fit"><i style="width:${Math.max(4, p.fitness)}%${low ? ';background:rgb(var(--card-y))' : ''}"></i></span>
      <span class="ovr">${p.overall}</span>
    </li>`;
  }).join('');

  // Last result.
  const last = career.lastReport;
  if (last) {
    const ownHome = last.home.id === career.clubId;
    const h = CLUB_BY_ID[last.home.id];
    const a = CLUB_BY_ID[last.away.id];
    $('last-sec').hidden = false;
    $('last-md').textContent = 'Matchday ' + last.matchday;
    $('last-list').innerHTML = `<li class="list-row">
      <span class="nm">${esc(h.name)} ${last.homeGoals}–${last.awayGoals} ${esc(a.name)}<small>Shots ${last.stats.shots[0]}–${last.stats.shots[1]}, possession ${last.stats.possession[0]}%–${last.stats.possession[1]}%</small></span>
      <span class="form"><i class="${resultClass(last, career.clubId)}">${resultLetter(last, career.clubId, ownHome)}</i></span>
    </li>`;
  } else {
    $('last-sec').hidden = true;
  }

  // Form and league table.
  $('club-form').innerHTML = formOf(career, career.clubId).map((r) => `<i class="${r.toLowerCase()}">${r}</i>`).join('');
  $('table-list').innerHTML = table.map((r) => `
    <li class="list-row${r.id === career.clubId ? ' me' : ''}">
      <span class="n">${r.rank}</span>
      <span class="t">${esc(r.id === career.clubId ? r.name + ' (you)' : r.name)}</span>
      <span class="g">${r.gd > 0 ? '+' : ''}${r.gd}</span>
      <span class="p">${r.points}</span>
    </li>`).join('');

  if (career.wallet) {
    $('wallet-sec').hidden = false;
    $('club-wallet').textContent = usdc(career.wallet.balance);
    const bought = career.purchase ? CLUB_BY_ID[career.purchase.clubId] : null;
    $('club-wallet-note').textContent = bought
      ? 'You bought ' + bought.name + ' for ' + usdc(career.purchase.price) + '. No real payment was taken.'
      : 'No real payment was taken.';
  } else {
    $('wallet-sec').hidden = true;
  }

  $('save-error').hidden = !saveFailed;
  drawPitch();
}

function resultLetter(report, clubId) {
  const gf = report.home.id === clubId ? report.homeGoals : report.awayGoals;
  const ga = report.home.id === clubId ? report.awayGoals : report.homeGoals;
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}
function resultClass(report, clubId) { return resultLetter(report, clubId).toLowerCase(); }

// ── The pitch, drawn on a canvas ─────────────────────────────────────────
const canvas = $('pitch-canvas');
const ctx = canvas.getContext('2d');
let drag = null;

function tokenLayout() {
  const slots = FORMATIONS[career.tactics.formation].slots;
  const squad = career.squads[career.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  return career.lineup.map((id, i) => {
    const slot = slots[i] || slots[slots.length - 1];
    return { player: byId[id], slot, i };
  }).filter((t) => t.player);
}

function pitchSize() {
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width || 358, h: rect.height || (rect.width || 358) * 300 / 358 };
}

function drawPitch() {
  if (!career) return;
  const wrap = $('pitch-wrap');
  wrap.dataset.formation = career.tactics.formation;
  wrap.dataset.starters = career.lineup.join(',');

  const dpr = window.devicePixelRatio || 1;
  const { w, h } = pitchSize();
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const sx = w / 358;
  const sy = h / 300;
  const scale = Math.min(sx, sy);

  // White lines, in both looks (as the drawn pitch has them).
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2 * scale;
  ctx.beginPath();
  ctx.rect(10 * scale, 10 * scale, w - 20 * scale, h - 20 * scale);
  ctx.moveTo(10 * scale, h / 2);
  ctx.lineTo(w - 10 * scale, h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 36 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeRect(w / 2 - 84 * scale, 10 * scale, 168 * scale, 48 * scale);
  ctx.strokeRect(w / 2 - 84 * scale, h - 58 * scale, 168 * scale, 48 * scale);
  ctx.restore();

  const r = Math.max(14, 16 * scale);
  const style = getComputedStyle(document.documentElement);
  const accent = 'rgb(' + style.getPropertyValue('--accent').trim() + ')';
  const onAccent = 'rgb(' + style.getPropertyValue('--on-accent').trim() + ')';

  const tokens = tokenLayout();
  const aria = tokens.map((t) => t.player.pos + ' ' + t.player.name).join(', ');
  canvas.setAttribute('aria-label', 'Your ' + career.tactics.formation + ' lineup: ' + aria);

  tokens.forEach((t, idx) => {
    if (drag && drag.moved && drag.i === t.i) return;
    drawToken(t.player, t.slot.x * w, t.slot.y * h, r, accent, onAccent, t.i === 0);
  });

  if (drag) {
    const i = drag.i;
    const t = tokens.find((x) => x.i === i);
    if (t) {
      const target = drag.moved ? hitToken(drag.x, drag.y) : -1;
      if (target >= 0 && target !== i) {
        const tt = tokens.find((x) => x.i === target);
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(tt.slot.x * w, tt.slot.y * h, r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      drawToken(t.player, drag.x, drag.y, r * 1.05, accent, onAccent, i === 0);
    }
  }
}

function drawToken(player, x, y, r, accent, onAccent, isGk) {
  if (!player) return;
  const { w, h } = pitchSize();
  const scale = r / 16;
  ctx.save();

  // The circle carries the position, so a long name never spills off it.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = isGk ? accent : '#ffffff';
  ctx.fill();
  ctx.fillStyle = isGk ? onAccent : '#16241c';
  ctx.font = '700 ' + Math.max(9, 10 * scale) + 'px ui-rounded, system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.pos, x, y + 0.5);

  // The name is a white label on a dark pill, under the token (above it when
  // the token sits on the bottom edge of the pitch).
  const name = player.name.split(' ').slice(1).join(' ') || player.name;
  const fs = Math.min(13, Math.max(10, 12 * scale));
  ctx.font = '600 ' + fs + 'px ui-rounded, system-ui, -apple-system, sans-serif';
  const maxW = 82 * scale;
  let label = name;
  if (ctx.measureText(label).width > maxW) {
    while (label.length > 1 && ctx.measureText(label + '…').width > maxW) label = label.slice(0, -1);
    label += '…';
  }
  const textW = ctx.measureText(label).width;
  const pillW = textW + 10 * scale;
  const pillH = fs + 7 * scale;
  let pillY = y + r + 2 * scale;
  if (pillY + pillH > h - 1) pillY = h - 1 - pillH;
  const pillX = Math.min(Math.max(x - pillW / 2, 2), w - pillW - 2);
  const rad = pillH / 2;
  ctx.beginPath();
  ctx.moveTo(pillX + rad, pillY);
  ctx.lineTo(pillX + pillW - rad, pillY);
  ctx.arc(pillX + pillW - rad, pillY + rad, rad, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(pillX + rad, pillY + pillH);
  ctx.arc(pillX + rad, pillY + rad, rad, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(9, 20, 13, 0.82)';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
  ctx.restore();
}

function hitToken(x, y) {
  const { w, h } = pitchSize();
  const r = Math.max(14, 16 * Math.min(w / 358, h / 300));
  const tokens = tokenLayout();
  for (const t of tokens) {
    const dx = x - t.slot.x * w;
    const dy = y - t.slot.y * h;
    if (dx * dx + dy * dy <= (r + 8) * (r + 8)) return t.i;
  }
  return -1;
}

function pointerPos(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('pointerdown', (e) => {
  if (!career || screen !== 'club') return;
  const p = pointerPos(e);
  const i = hitToken(p.x, p.y);
  if (i < 0) return;
  e.preventDefault();
  drag = { i, x: p.x, y: p.y, startX: p.x, startY: p.y, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pointerPos(e);
  drag.x = p.x;
  drag.y = p.y;
  if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) > 7) drag.moved = true;
  if (drag.moved) e.preventDefault();
  drawPitch();
});

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) {
    const t = tokenLayout().find((x) => x.i === d.i);
    if (t) openSheet(t.player.id);
    drawPitch();
    return;
  }
  const p = pointerPos(e);
  const j = hitToken(p.x, p.y);
  if (j >= 0 && j !== d.i) {
    const lineup = career.lineup.slice();
    [lineup[d.i], lineup[j]] = [lineup[j], lineup[d.i]];
    career.lineup = lineup;
    renderClub();
    save();
  } else {
    drawPitch();
  }
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { drag = null; drawPitch(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('resize', () => { if (career && screen === 'club') drawPitch(); });
window.addEventListener('ownclub:theme', () => { if (career && screen === 'club') drawPitch(); });

// ── Tactics menus ────────────────────────────────────────────────────────
const MENUS = {
  formation: { key: 'formation', values: FORMATION_NAMES, chip: 'chip-formation' },
  mentality: { key: 'mentality', values: MENTALITY_NAMES, chip: 'chip-mentality' },
  pressing: { key: 'pressing', values: PRESSING_NAMES, chip: 'chip-pressing' },
};

function closeMenu() {
  menuKind = null;
  $('menu').hidden = true;
  for (const k in MENUS) $(MENUS[k].chip).setAttribute('aria-expanded', 'false');
}

function openMenu(kind) {
  if (menuKind === kind) { closeMenu(); return; }
  menuKind = kind;
  const m = MENUS[kind];
  $('menu-list').innerHTML = m.values.map((v) => `
    <li><button class="list-row menu-row" type="button" data-value="${esc(v)}" aria-pressed="${career.tactics[m.key] === v}">
      <span class="nm">${esc(v)}</span><span class="tick">${career.tactics[m.key] === v ? '✓' : ''}</span>
    </button></li>`).join('');
  $('menu').hidden = false;
  for (const k in MENUS) $(MENUS[k].chip).setAttribute('aria-expanded', String(k === kind));
  $('menu-list').querySelector('button').focus();
}

function chooseOption(value) {
  if (!menuKind || !career) return;
  const kind = menuKind;
  const m = MENUS[kind];
  if (kind === 'formation' && value !== career.tactics.formation) {
    career.tactics.formation = value;
    career.lineup = arrangeLineup(career.squads[career.clubId], career.lineup, value);
  } else {
    career.tactics[m.key] = value;
  }
  closeMenu();
  renderClub();
  save();
}

for (const kind in MENUS) {
  $(MENUS[kind].chip).addEventListener('click', () => openMenu(kind));
}
$('menu-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-value]');
  if (btn) chooseOption(btn.dataset.value);
});
document.addEventListener('click', (e) => {
  if (!menuKind) return;
  if ($('menu').contains(e.target)) return;
  if (Object.values(MENUS).some((m) => $(m.chip).contains(e.target))) return;
  closeMenu();
});

// ── Player sheet ─────────────────────────────────────────────────────────
function findPlayer(id) {
  return career.squads[career.clubId].find((p) => p.id === id);
}

function openSheet(id) {
  const p = findPlayer(id);
  if (!p) return;
  sheetPlayerId = id;
  const starters = new Set(career.lineup);
  const isStarter = starters.has(id);
  $('sheet-name').textContent = p.name;
  $('sheet-sub').textContent = p.pos + ', ' + (p.captain ? 'captain, ' : '') + (isStarter ? 'starter' : p.injury > 0 ? 'injured for ' + p.injury + ' matches' : 'bench');

  $('sheet-vitals').innerHTML = `
    <div class="vital"><span>Fitness</span><span class="vital-track"><i style="width:${p.fitness}%${p.fitness < 60 ? ';background:rgb(var(--card-y))' : ''}"></i></span><b>${p.fitness}%</b></div>
    <div class="vital"><span>Morale</span><span class="vital-track"><i style="width:${p.morale}%"></i></span><b>${p.morale}%</b></div>`;
  const attrs = [['Pace', 'pac'], ['Passing', 'pas'], ['Shooting', 'sho'], ['Defending', 'def'], ['Goalkeeping', 'gk']];
  $('sheet-attrs').innerHTML = attrs.map(([label, key]) => `
    <div class="attr"><span>${label}</span><span class="attr-track"><i style="width:${p.attrs[key]}%"></i></span><b>${p.attrs[key]}</b></div>`).join('');

  const group = POS_GROUP[p.pos];
  const list = ROLES[group] || ROLES.MF;
  const current = career.roles[id] || defaultRole(p.pos);
  $('sheet-role').innerHTML = list.map((r) => `<option value="${esc(r)}"${r === current ? ' selected' : ''}>${esc(r)}</option>`).join('');

  const bench = career.squads[career.clubId].filter((q) => !starters.has(q.id));
  if (isStarter) {
    $('sheet-bench').innerHTML = bench.map((q) => `
      <li class="list-row">
        <span class="pos">${esc(q.pos)}</span>
        <span class="nm">${esc(q.name)}<small>${q.injury > 0 ? 'Injured for ' + q.injury + ' matches' : 'Fitness ' + q.fitness + '%, ' + q.overall + ' overall'}</small></span>
        <button class="btn-secondary small" type="button" data-swap-in="${esc(q.id)}"${q.injury > 0 ? ' disabled' : ''}>Bring on</button>
      </li>`).join('') || '<li class="list-row"><span class="nm">No bench players</span></li>';
  } else {
    $('sheet-bench').innerHTML = career.lineup.map((sid) => {
      const q = findPlayer(sid);
      if (!q) return '';
      return `<li class="list-row">
        <span class="pos">${esc(q.pos)}</span>
        <span class="nm">${esc(q.name)}<small>Starter</small></span>
        <button class="btn-secondary small" type="button" data-swap-with="${esc(sid)}"${p.injury > 0 ? ' disabled' : ''}>Swap in</button>
      </li>`;
    }).join('');
  }
  $('sheet').hidden = false;
  $('sheet-close').focus();
}

function closeSheet() {
  sheetPlayerId = null;
  $('sheet').hidden = true;
  if (screen === 'club') drawPitch();
}

$('sheet-close').addEventListener('click', closeSheet);
$('sheet').addEventListener('pointerdown', (e) => { if (e.target === $('sheet')) closeSheet(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('sheet').hidden) closeSheet();
    else if (menuKind) closeMenu();
  }
});
$('sheet-role').addEventListener('change', (e) => {
  if (!career || !sheetPlayerId) return;
  career.roles[sheetPlayerId] = e.target.value;
  save();
});
$('sheet-bench').addEventListener('click', (e) => {
  const inBtn = e.target.closest('[data-swap-in]');
  const withBtn = e.target.closest('[data-swap-with]');
  if (!career || !sheetPlayerId) return;
  if (inBtn) {
    const outId = sheetPlayerId;
    const inId = inBtn.dataset.swapIn;
    const idx = career.lineup.indexOf(outId);
    if (idx >= 0) career.lineup[idx] = inId;
    const benchIdx = career.lineup.indexOf(inId);
    if (benchIdx >= 0 && benchIdx !== idx) career.lineup[benchIdx] = outId;
    closeSheet();
    renderClub();
    save();
  } else if (withBtn) {
    const otherId = withBtn.dataset.swapWith;
    const a = career.lineup.indexOf(sheetPlayerId);
    const b = career.lineup.indexOf(otherId);
    if (a >= 0 && b >= 0) {
      [career.lineup[a], career.lineup[b]] = [career.lineup[b], career.lineup[a]];
      renderClub();
      save();
    }
  }
});

// ── Playing a match ──────────────────────────────────────────────────────
function playMatch() {
  if (!career || busy) return;
  const check = validateLineup(career);
  const note = $('play-note');
  if (!check.ok) {
    note.textContent = check.message;
    note.hidden = false;
    return;
  }
  note.hidden = true;
  busy = true;
  try {
    playMatchday(career);
    screen = 'report';
    render();
    save();
  } catch (err) {
    note.textContent = 'The match could not be played. Try again.';
    note.hidden = false;
  } finally {
    busy = false;
  }
}

$('play-btn').addEventListener('click', playMatch);

// The summer: promotion and relegation, then a fresh season in the new
// division. The other eight groups are played out from the career's seed.
async function nextSeason() {
  if (!career || busy || !career.finished) return;
  busy = true;
  const btn = $('next-season');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Starting next season...';
  try {
    career = startNextSeason(career);
    saveFailed = false;
    render();
    save();
    window.scrollTo(0, 0);
  } catch (err) {
    saveFailed = true;
    $('save-error').hidden = false;
  } finally {
    busy = false;
    btn.disabled = false;
    btn.textContent = label;
  }
}
$('next-season').addEventListener('click', nextSeason);

// ── Match report ─────────────────────────────────────────────────────────
const ICONS = {
  goal: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/></svg>',
  yellow: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2" fill="rgb(var(--card-y))"/></svg>',
  red: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="16" rx="2" fill="rgb(var(--card-r))"/></svg>',
  sub: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/></svg>',
  injury: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/></svg>',
};

function momentText(m, own) {
  const who = own ? '' : m.teamName.replace(/ (FC|Athletic|Town|United|Rovers|City|Wanderers)$/, '') + ': ';
  if (m.type === 'goal') return { main: 'Goal, ' + who + m.playerName, sub: m.assistName ? 'Assist: ' + m.assistName : '' };
  if (m.type === 'yellow') return { main: 'Yellow card, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'red') return { main: 'Red card, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'injury') return { main: 'Injury, ' + who + m.playerName, sub: m.detail || '' };
  if (m.type === 'sub') return { main: 'Sub: ' + m.playerName + ' on for ' + m.playerOutName, sub: own ? (m.detail || '') : m.teamName };
  return { main: m.type, sub: '' };
}

function statRow(label, left, right, suffix = '') {
  const l = Number(left) || 0;
  const r = Number(right) || 0;
  const total = l + r || 1;
  return `<li class="stat list-row" style="display:block">
    <div class="h"><span>${esc(l + suffix)}</span><span>${esc(label)}</span><span>${esc(r + suffix)}</span></div>
    <div class="bar"><i style="width:${Math.round((l / total) * 100)}%"></i><u style="width:${Math.round((r / total) * 100)}%"></u></div>
  </li>`;
}

function renderReport() {
  const r = career.lastReport;
  const ownHome = r.home.id === career.clubId;
  const own = ownHome ? r.home : r.away;
  const opp = ownHome ? r.away : r.home;
  const ownSide = ownHome ? 'home' : 'away';
  const oppSide = ownHome ? 'away' : 'home';
  const ownClub = CLUB_BY_ID[own.id];
  const oppClub = CLUB_BY_ID[opp.id];

  $('report-md').textContent = 'Full time, matchday ' + r.matchday;
  $('report-home-badge').outerHTML = badgeHtml(CLUB_BY_ID[r.home.id]).replace('<span ', '<span id="report-home-badge" ');
  $('report-home-name').textContent = CLUB_BY_ID[r.home.id].name;
  $('report-away-badge').outerHTML = badgeHtml(CLUB_BY_ID[r.away.id]).replace('<span ', '<span id="report-away-badge" ');
  $('report-away-name').textContent = CLUB_BY_ID[r.away.id].name;
  $('report-score').textContent = r.homeGoals + '–' + r.awayGoals;

  $('report-moments').innerHTML = r.moments.length ? r.moments.map((m) => {
    const isOwn = m.side === ownSide;
    const txt = momentText(m, isOwn);
    return `<li class="list-row">
      <span class="min">${m.minute}'</span>
      <span class="ico${isOwn ? ' own' : ''}">${ICONS[m.type] || ''}</span>
      <span class="ev${isOwn ? '' : ' away'}">${esc(txt.main)}${txt.sub ? '<small>' + esc(txt.sub) + '</small>' : ''}</span>
    </li>`;
  }).join('') : '<li class="list-row"><span class="nm">No goals, cards, injuries or substitutions.</span></li>';

  $('report-stats-home').textContent = ownClub.name;
  $('report-stats-away').textContent = oppClub.name;
  const s = r.stats;
  const ownIdx = ownHome ? 0 : 1;
  const oppIdx = ownHome ? 1 : 0;
  const pick = (pair) => [pair[ownIdx], pair[oppIdx]];
  const rows = [
    statRow('Possession', pick(s.possession)[0], pick(s.possession)[1], '%'),
    statRow('Shots', pick(s.shots)[0], pick(s.shots)[1]),
    statRow('Shots on target', pick(s.onTarget)[0], pick(s.onTarget)[1]),
    statRow('Passes', pick(s.passes)[0], pick(s.passes)[1]),
    statRow('Fouls', pick(s.fouls)[0], pick(s.fouls)[1]),
    statRow('Yellow cards', pick(s.yellow)[0], pick(s.yellow)[1]),
    statRow('Red cards', pick(s.red)[0], pick(s.red)[1]),
  ];
  $('report-stats').innerHTML = rows.join('');

  $('report-ratings-team').textContent = ownClub.name;
  const ratings = r.ratings[ownSide] || {};
  const effects = (r.effects && r.effects[ownSide]) || {};
  const squad = career.squads[career.clubId];
  const byId = Object.fromEntries(squad.map((p) => [p.id, p]));
  const ids = Object.keys(ratings).filter((id) => byId[id]);
  ids.sort((a, b) => ratings[b] - ratings[a]);
  const best = ids[0];
  $('report-ratings').innerHTML = ids.map((id) => {
    const p = byId[id];
    const e = effects[id] || {};
    const bits = [p.pos];
    if (e.subOn != null) bits.push('on ' + e.subOn + "'");
    if (e.goals) bits.push(e.goals + (e.goals === 1 ? ' goal' : ' goals'));
    if (e.assists) bits.push(e.assists + (e.assists === 1 ? ' assist' : ' assists'));
    if (e.yellow) bits.push('yellow card');
    if (e.red) bits.push('red card');
    if (e.subOff != null) bits.push('off ' + e.subOff + "'");
    if (!e.goals && !e.assists && e.subOn == null && !e.yellow && !e.red) bits.push(e.minutes ? e.minutes + ' min' : 'unused');
    return `<li class="list-row">
      <span class="nm">${esc(p.name)}<small>${esc(bits.join(', '))}</small></span>
      <span class="rt${id === best ? ' top1' : ''}">${ratings[id].toFixed(1)}</span>
    </li>`;
  }).join('');
}

function backToClub() {
  if (!career) return;
  screen = 'club';
  render();
  window.scrollTo(0, 0);
}
$('report-close').addEventListener('click', backToClub);
$('report-back').addEventListener('click', backToClub);
$('report-back').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); backToClub(); }
});

// ── Saving ───────────────────────────────────────────────────────────────
// Saves run one after another, so a quick second change never sends the
// previous version number and loses the first change to a 409.
let saveChain = Promise.resolve();
function save() {
  saveChain = saveChain.then(saveNow, saveNow);
  return saveChain;
}

async function saveNow() {
  if (!career) return;
  try {
    const { status, data } = await api('PUT', { state: career, version });
    if (status === 409) {
      const res = await api('GET');
      const reloaded = res.status === 200 && res.data && res.data.career
        ? repairCareer(res.data.career) : null;
      if (reloaded) {
        career = reloaded;
        version = res.data.version;
        saveFailed = false;
        render();
        return;
      }
    }
    if (status === 200 && data && data.version) {
      version = data.version;
      saveFailed = false;
    } else if (status === 401) {
      saveFailed = true;
    } else if (status !== 200) {
      throw new Error('HTTP ' + status);
    }
  } catch (err) {
    saveFailed = true;
  }
  if (screen === 'club' && $('save-error')) $('save-error').hidden = !saveFailed;
}

$('save-retry').addEventListener('click', save);

// ── Start over ───────────────────────────────────────────────────────────
function startOver() {
  $('confirm-over').hidden = false;
  $('confirm-over').scrollIntoView({ block: 'center' });
  $('confirm-over-yes').focus();
}

async function doStartOver() {
  $('confirm-over').hidden = true;
  try {
    const { status } = await api('DELETE');
    if (status === 401) {
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'start a new career' });
      return;
    }
    if (status !== 200) {
      // Only leave the club once the server says the old career is gone.
      saveFailed = true;
      $('save-error').hidden = false;
      return;
    }
    career = null;
    version = null;
    pickedGroup = 'A';
    pickedClub = SHOP_GROUPS[0].clubIds[0];
    $('manager-name').value = '';
    closeSheet();
    closeMenu();
    screen = 'new';
    render();
  } catch (_) {
    saveFailed = true;
    $('save-error').hidden = false;
  }
}
$('start-over').addEventListener('click', startOver);
$('new-from-season').addEventListener('click', startOver);
$('confirm-over-no').addEventListener('click', () => { $('confirm-over').hidden = true; });
$('confirm-over-yes').addEventListener('click', doStartOver);

// ── Wiring ───────────────────────────────────────────────────────────────
$('group-row').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-group]');
  if (!btn) return;
  pickedGroup = btn.dataset.group;
  const group = SHOP_GROUPS.find((g) => g.group === pickedGroup);
  if (group && !group.clubIds.includes(pickedClub)) pickedClub = group.clubIds[0];
  renderNew();
});
$('club-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-club-id]');
  if (!row) return;
  pickedClub = row.dataset.clubId;
  renderNew();
});
$('club-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('[data-club-id]');
  if (!row) return;
  e.preventDefault();
  pickedClub = row.dataset.clubId;
  renderNew();
});
$('squad-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-player-id]');
  if (row) openSheet(row.dataset.playerId);
});
$('squad-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('[data-player-id]');
  if (!row) return;
  e.preventDefault();
  openSheet(row.dataset.playerId);
});
$('start-career').addEventListener('click', startCareer);
$('retry-btn').addEventListener('click', load);

// The loading skeleton's squad rows, so the shape matches the real list.
$('loading-squad').innerHTML = Array.from({ length: 6 }).map(() => `
  <li class="list-row">
    <span class="skeleton sk-pos"></span>
    <span class="nm"><span class="skeleton sk-line"></span><span class="skeleton sk-sm"></span></span>
    <span class="skeleton sk-fit"></span>
    <span class="skeleton sk-ovr"></span>
  </li>`).join('');

load();
