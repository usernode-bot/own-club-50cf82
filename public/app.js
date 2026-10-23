// Own Club's screens. Everything a person sees and taps: the new career, the
// club screen with its pitch, the player sheet and the match report. All the
// football is in engine.js; this file renders state, sends changes to the
// server and draws the pitch on a canvas.

import {
  CLUBS, CLUB_BY_ID, LEAGUE_NAME, FORMATIONS, FORMATION_NAMES,
  MENTALITY_NAMES, PRESSING_NAMES, ROLES, POS_GROUP,
  GROUPS, TIER_COUNT, clubToGroup, groupName,
  divisionClubIds, placeName, seasonOutcome, startNextSeason,
  arrangeLineup, autoLineup,
  leagueTable, formOf, nextFixture, objectiveMet, clubSummary, defaultRole,
  repairCareer, slotLabel, upcomingSlots, clubTier, saleValue, CREDIT_REWARDS,
  moneyFields, seasonMoney, creditsForResult, TICKET_PRICE, GROUND_UPKEEP, FAN_CHANGE,
  FACILITIES, FACILITY_MAX_LEVEL, facilityLevels, upgradeCost, upgradeFacility,
  STAFF_ROLES, staffFields, staffWagesDue, MAINTENANCE, maintenanceDue,
  MATCHDAY_SALES, matchdaySales,
  wageBill, playerWage, stadiumSeats, homeCrowd, FAN_CAP, ACADEMY_INTAKE, academyCapacity,
  youthFields, SQUAD_MAX, SQUAD_MIN, systemSaleValue, leaveError, signCost, signError, ageingFor,
  growthOutlook,
} from './engine.js';

// ── Small helpers ────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const displayName = (club) => (club.name || '').replace(/ (FC|Athletic|Town|United|Rovers|City|Wanderers)$/, '');
const capitalise = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
// The Scout reveals every player's peak style and how they change next season.
function scouted() {
  return !!(career && staffFields(career).scout);
}
function growthLine(p) {
  const o = growthOutlook(career, p);
  return capitalise(o.style) + ' peak, ' + o.next;
}

const params = new URLSearchParams(location.search);
const DEMO = params.get('demo') === '1';
const TOKEN = params.get('token') || '';

let career = null;
let version = null;
let screen = 'loading';
// What the shop says a club costs and how much a new wallet holds. The server
// sends these with every load; the defaults only stand in until it does.
let shop = { price: 100, startingBalance: 1000, currency: 'Dummy USDC' };
const SHOP_GROUPS = GROUPS;
let pickedDivision = TIER_COUNT;
let pickedGroup = 'A';
let pickedClub = GROUPS.filter((g) => g.tier === TIER_COUNT)[0].clubIds[0];
let menuKind = null;
let sheetPlayerId = null;
let saveFailed = false;
let loadError = '';
let busy = false;
let autoPlayed = 0;
let tab = 'home';
let reportFrom = 'home';
let refreshFailed = false;
// The sale just made, so the New career screen can say where the money came
// from. Cleared once a new club is bought.
let lastSale = null;
// The person's linked Homeroom wallet, sent with each load for a signed-in
// person. Undefined for a guest looking at the demo; never stored or sent back.
let homeroomWallet = undefined;

const TABS = ['home', 'squad', 'tactics', 'competition', 'club', 'finance', 'transfers'];
// On a phone the bar keeps the first four tabs and folds these into More.
const OVERFLOW_TABS = ['club', 'finance', 'transfers'];
function hashTab() {
  const h = (location.hash || '').replace(/^#/, '');
  return TABS.includes(h) ? h : 'home';
}
function showTab(next) {
  tab = TABS.includes(next) ? next : 'home';
  for (const t of TABS) $('tab-' + t).hidden = t !== tab;
  for (const a of $('tabnav').querySelectorAll('[data-tab]')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const more = $('tab-more');
  if (OVERFLOW_TABS.includes(tab)) more.setAttribute('data-current', '');
  else more.removeAttribute('data-current');
  closeMore();
  if (tab === 'tactics' && career) drawPitch();
  if (tab === 'transfers' && career) {
    renderMarket();
    loadMarket();
  }
}

// The phone bar's More button and its menu. It opens on a tap, closes on a
// choice, a tap outside or Escape, and the tab it opens is marked too.
function openMore() {
  $('more-menu').hidden = false;
  $('tab-more').setAttribute('aria-expanded', 'true');
}
function closeMore() {
  const menu = $('more-menu');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $('tab-more').setAttribute('aria-expanded', 'false');
}

async function refreshShop() {
  try {
    const { status, data } = await api('GET');
    if (status === 200 && data && data.shop) { shop = data.shop; renderNew(); }
  } catch (_) { /* the error already says the club is taken */ }
}

function apiUrl(path) { return (path || '/api/career') + (DEMO ? '?demo=1' : ''); }

// "Now" for anything that decides what shows: a staging preview can be shown
// at another moment, and the platform's clock is the one that says which.
function nowDate() {
  return window.usernode && window.usernode.now ? window.usernode.now() : new Date();
}

// The manager's own clock, saved with the career so their match times stay
// where they were even if their device's zone changes later.
function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
}

function ensureZone() {
  if (!career || career.timeZone) return;
  // The demo season is always London time, so every viewer sees the same day.
  career.timeZone = DEMO ? 'Europe/London' : deviceZone();
}

async function api(method, body, path) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (TOKEN) headers['x-usernode-token'] = TOKEN;
  // A staging preview's moment, so the server checks the same day as the page.
  if (window.usernode && window.usernode.previewNow) {
    headers['x-usernode-now'] = window.usernode.now().toISOString();
  }
  const res = await fetch(apiUrl(path), {
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
  const nav = $('tabnav');
  nav.hidden = !(career && (name === 'club' || name === 'report'));
  $('demo-note').hidden = !(DEMO && career && (name === 'club' || name === 'report' || name === 'error'));
  if (name === 'club') showTab(tab === 'report' ? 'home' : tab);
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
  server: (data, status) => {
    const parts = [(data && data.error) || 'HTTP ' + status];
    if (data && typeof data.code === 'string' && data.code) parts.push('database ' + data.code);
    if (data && typeof data.requestId === 'string' && data.requestId) parts.push('ref ' + data.requestId);
    return 'The server could not read your career (' + parts.join(', ') + '). Try again in a moment.';
  },
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
  // The linked Homeroom wallet, sent for a signed-in person and absent for a
  // guest looking at the demo.
  if (answer && answer.data) homeroomWallet = answer.data.homeroomWallet;
  autoPlayed = answer && answer.data && Number(answer.data.autoPlayed) > 0 ? Number(answer.data.autoPlayed) : 0;

  if (!cause && answer) {
    if (answer.status === 404 || (answer.status === 200 && answer.data && answer.data.career === null)) {
      screen = 'new';
      render();
      return;
    }
    if (answer.status === 401) cause = LOAD_CAUSE.signin;
    else if (answer.status !== 200 || !answer.data || !answer.data.career) {
      cause = LOAD_CAUSE.server(answer.data, answer.status);
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
      tab = hashTab();
      try {
        render();
        // A career saved before the zone was stored gets one now, once.
        if (!career.timeZone) { ensureZone(); save(); }
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
const credits = (n) => Number(n).toLocaleString('en-US') + ' Club credits';
const num = (n) => Number(n).toLocaleString('en-US');
// A figure with an explicit direction: +50, −250, 0.
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + num(Math.abs(n));

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
  const taken = new Set(Array.isArray(shop.taken) ? shop.taken : []);
  const prices = shop.prices || { 1: 300, 2: 200, 3: 100 };
  const price = prices[pickedDivision] || shop.price;
  const inDivision = SHOP_GROUPS.filter((g) => g.tier === pickedDivision);
  // Division 1 is one group of 18; Divisions 2 and 3 have four groups.
  const groups = inDivision.map((g) => ({ group: g.group, clubIds: g.clubIds, free: g.clubIds.filter((id) => !taken.has(id)) }));
  const freeTotal = groups.reduce((n, g) => n + g.free.length, 0);
  const freeAll = SHOP_GROUPS.reduce((n, g) => n + g.clubIds.filter((id) => !taken.has(id)).length, 0);

  for (const btn of $('division-row').querySelectorAll('[data-division]')) {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.division) === pickedDivision));
  }
  const group = groups.find((g) => g.group === pickedGroup) || groups[0];
  $('division-price').textContent = pickedDivision === 1
    ? usdc(price) + ' a club, ' + freeTotal + ' of 18 free'
    : usdc(price) + ' a club';
  $('group-section').hidden = pickedDivision === 1;
  $('group-note').textContent = freeTotal === 0 ? '' : (group ? group.free.length : 0) + ' of 18 free in Group ' + pickedGroup;
  for (const btn of $('group-row').querySelectorAll('[data-group]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.group === pickedGroup));
  }

  $('wallet-balance').textContent = usdc(shop.balance == null ? shop.startingBalance : shop.balance);
  const sold = lastSale ? CLUB_BY_ID[lastSale.clubId] : null;
  $('wallet-note').textContent = sold
    ? 'You sold ' + sold.name + ' for ' + usdc(lastSale.price)
      + '. Your wallet keeps it for your next club. No real payment is taken.'
    : shop.kept
      ? 'Your wallet, kept from your earlier clubs. No real payment is taken.'
      : 'Every new manager gets this to buy a club. No real payment is taken.';

  const list = $('club-list');
  const buy = $('start-career');
  const errBox = $('career-error');
  if (!freeAll) {
    list.innerHTML = '<li class="list-row"><span class="nm">No club is free right now. A club comes free when its manager sells it.</span></li>';
    buy.disabled = true;
    buy.textContent = 'No club is free right now';
    pickedClub = null;
    return;
  }
  if (!group.free.includes(pickedClub)) pickedClub = group.free[0] || null;
  if (!group.free.length) {
    list.innerHTML = '<li class="list-row"><span class="nm">Every club in ' + esc(group.group ? 'Group ' + group.group : 'Division 1') + ' has a manager. Choose another group.</span></li>';
    buy.disabled = true;
    buy.textContent = 'Choose another group';
    return;
  }
  list.innerHTML = group.clubIds.map((id) => CLUB_BY_ID[id]).map((c) => {
    const isTaken = taken.has(c.id);
    if (isTaken) {
      return `
    <li class="list-row club-row taken-row" aria-disabled="true">
      <span class="badge" style="background:${c.color}">${esc(c.short)}</span>
      <span class="nm">${esc(c.name)}<small>Another manager runs this club</small></span>
      <span class="taken">Taken</span>
      <span class="tick" aria-hidden="true"></span>
    </li>`;
    }
    return `
    <li class="list-row club-row${c.id === pickedClub ? ' me' : ''}" data-club-id="${esc(c.id)}" tabindex="0" role="button" aria-pressed="${c.id === pickedClub}">
      <span class="badge" style="background:${c.color}">${esc(c.short)}</span>
      <span class="nm">${esc(c.name)}<small>${stars(c.rep)} Squad ${CLUB_PREVIEW[c.id]}, run by a bot</small></span>
      <span class="price">${usdc(price)}</span>
      <span class="tick" aria-hidden="true">${c.id === pickedClub ? CHECK_SVG : ''}</span>
    </li>`;
  }).join('');
  const picked = CLUB_BY_ID[pickedClub];
  const balance = shop.balance == null ? shop.startingBalance : shop.balance;
  if (picked && balance < price) {
    buy.disabled = true;
    buy.textContent = 'Your wallet does not cover ' + usdc(price);
  } else {
    buy.disabled = false;
    buy.textContent = picked ? 'Buy ' + picked.name + ' for ' + usdc(price) : 'Buy a club';
  }
  if (errBox.hidden) errBox.hidden = true;
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
    const { status, data } = await api('POST', { managerName: name, clubId: pickedClub, timeZone: DEMO ? 'Europe/London' : deviceZone() });
    if (status === 401 && data && data.error === 'account_required') {
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'start a career' });
      errBox.hidden = false;
      errText.textContent = 'Make an account to start a career.';
      return;
    }
    if ((status === 400 || status === 409) && data && data.message) {
      errBox.hidden = false;
      errText.textContent = data.message;
      if (data.error === 'owned') await refreshShop();
      return;
    }
    if (status !== 200) throw new Error('HTTP ' + status);
    career = data.career;
    version = data.version;
    autoPlayed = 0;
    lastSale = null;
    screen = 'club';
    tab = 'home';
    if (!location.hash) location.hash = '#home';
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
  parts.push('Age ' + p.age + ', wage ' + playerWage(p, clubTier(career)));
  if (career && p.academy === career.season) parts.push('academy graduate');
  return parts.join(', ');
}

// The wall-clock time where the manager is, e.g. "11:42 am".
function clockText(date, zone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })
      .format(date).toLowerCase();
  } catch (_) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date).toLowerCase();
  }
}

function resultLetter(report, clubId) {
  const gf = report.home.id === clubId ? report.homeGoals : report.awayGoals;
  const ga = report.home.id === clubId ? report.awayGoals : report.homeGoals;
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}
function resultClass(report, clubId) { return resultLetter(report, clubId).toLowerCase(); }

function localHm(date, zone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(date).toLowerCase().replace(':00', '');
  } catch (_) {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date).toLowerCase().replace(':00', '');
  }
}

function kickoffText(nextAt, zone, now) {
  if (!nextAt) return '';
  const at = new Date(nextAt);
  const diff = at.getTime() - now.getTime();
  const clock = localHm(at, zone);
  if (diff <= 0) return 'Kicking off now';
  if (diff < 60000) return 'Kick-off at ' + clock + ', in under a minute';
  const hours = Math.floor(diff / 3600000);
  const mins = Math.round((diff % 3600000) / 60000);
  const gap = hours > 0 ? hours + ' h' + (mins ? ' ' + mins + ' min' : '') : mins + ' min';
  return 'Kick-off at ' + clock + ', in ' + gap;
}

function fixtureDate(date, zone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(date)
      + ', ' + localHm(date, zone);
  } catch (_) {
    return date.toISOString();
  }
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
  $('tab-badge').outerHTML = badgeHtml(club).replace('<span ', '<span id="tab-badge" ');
  $('tab-name').textContent = club.name;

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
    $('kickoff-when').textContent = kickoffText(career.nextMatchAt, career.timeZone, nowDate());
  } else {
    $('next-card').hidden = true;
    $('season-card').hidden = false;
    const outcome = seasonOutcome(career);
    const okay = objectiveMet(me.rank, club.objective, divisionClubIds(career).length);
    const to = groupName(outcome.toDivision, outcome.toGroup);
    const bits = [];
    if (pyramid) {
      bits.push(outcome.kind === 'champions' ? 'Champions of the ' + LEAGUE_NAME + '.'
        : outcome.kind === 'promoted' ? 'Promoted to ' + to + '.'
          : outcome.kind === 'relegated' ? 'Relegated to ' + to + '.'
            : 'You stay in ' + to + '.');
    }
    bits.push('The board asked you to ' + club.objective.toLowerCase() + '. That was ' + (okay ? 'met.' : 'not met.'));
    // The sponsor's own target is settled at the rollover, not by the board.
    const settle = moneyFields(career);
    const sponsorMet = objectiveMet(me.rank, settle.sponsor.target, divisionClubIds(career).length);
    bits.push(sponsorMet
      ? settle.sponsor.name + '\'s target is met: Start next season pays ' + num(settle.sponsor.fee) + ' Club credits.'
      : settle.sponsor.name + '\'s target was missed, so no sponsor fee is paid.');
    bits.push('You took ' + me.points + ' points from ' + me.played + ' matches.');
    const retiring = ageingFor(career).retiring;
    if (retiring.length) {
      bits.push('Retiring this summer: ' + retiring.map((r) => r.name + ' (' + r.age + ')').join(', ')
        + '. The academy brings in one young player for each.');
    }
    if (outcome.joinsNewLeague) bits.push('Next season the Coastal League becomes three tiers, and your club starts in ' + to + '.');
    $('season-title').textContent = 'You finished ' + ordinal(me.rank) + ' in ' + place;
    $('season-text').textContent = bits.join(' ');
  }

  const awayNote = $('away-note');
  if (refreshFailed) {
    awayNote.hidden = false;
    awayNote.textContent = 'The latest result could not be loaded. Your club is shown as it was at your last visit.';
  } else if (autoPlayed > 0) {
    awayNote.hidden = false;
    awayNote.textContent = autoPlayed + (autoPlayed === 1 ? ' match was' : ' matches were') + ' played since your last visit.';
    autoPlayed = 0;
  } else {
    awayNote.hidden = true;
  }

  const okay = objectiveMet(me.rank, club.objective, divisionClubIds(career).length);
  $('objective-season').textContent = 'Season ' + career.season;
  $('objective-text').innerHTML = esc(club.objective)
    + '<small>' + (okay ? 'On track' : 'Off track') + ': ' + ordinal(me.rank) + ' of ' + divisionClubIds(career).length + '</small>';

  $('val-formation').textContent = career.tactics.formation;
  $('val-mentality').textContent = career.tactics.mentality;
  $('val-pressing').textContent = career.tactics.pressing;

  const squad = career.squads[career.clubId];
  $('squad-label').textContent = 'Squad, ' + squad.length + ' of ' + SQUAD_MAX;
  const starters = new Set(career.lineup);
  const ordered = [...squad].sort((a, b) => {
    const sa = starters.has(a.id) ? 0 : 1;
    const sb = starters.has(b.id) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return b.overall - a.overall;
  });
  const showGrowth = scouted();
  $('squad-list').innerHTML = ordered.map((p) => {
    const low = p.fitness < 60;
    const wage = playerWage(p, clubTier(career));
    const growth = showGrowth ? growthLine(p) : '';
    const label = [esc(p.name), esc(p.pos), esc(playerStatus(p, starters))].concat(growth ? [esc(growth)] : []).join(', ');
    return `<li class="list-row row-btn" data-player-id="${esc(p.id)}" tabindex="0" role="button" aria-label="${label}">
      <span class="pos">${esc(p.pos)}</span>
      <span class="nm">${esc(p.name)}<small>${esc(playerStatus(p, starters))}, wage ${num(wage)}</small>${growth ? `<small>${esc(growth)}</small>` : ''}</span>
      <span class="fit"><i style="width:${Math.max(4, p.fitness)}%${low ? ';background:rgb(var(--card-y))' : ''}"></i></span>
      <span class="ovr">${p.overall}</span>
    </li>`;
  }).join('');

  const last = career.lastReport;
  if (last) {
    const ownHome = last.home.id === career.clubId;
    const h = CLUB_BY_ID[last.home.id];
    const a = CLUB_BY_ID[last.away.id];
    $('last-sec').hidden = false;
    $('last-md').textContent = 'Matchday ' + last.matchday;
    $('last-list').innerHTML = `<li class="list-row row-btn" data-open-report="1" tabindex="0" role="button" aria-label="Open the match report">
      <span class="nm">${esc(h.name)} ${last.homeGoals}–${last.awayGoals} ${esc(a.name)}<small>Shots ${last.stats.shots[0]}–${last.stats.shots[1]}, possession ${last.stats.possession[0]}%–${last.stats.possession[1]}%</small></span>
      <span class="form"><i class="${resultClass(last, career.clubId)}">${resultLetter(last, career.clubId, ownHome)}</i></span>
      <span class="chev" aria-hidden="true">›</span>
    </li>`;
  } else {
    $('last-sec').hidden = true;
  }

  $('club-form').innerHTML = formOf(career, career.clubId).map((r) => `<i class="${r.toLowerCase()}">${r}</i>`).join('');
  $('table-list').innerHTML = table.map((r) => `
    <li class="list-row${r.id === career.clubId ? ' me' : ''}">
      <span class="n">${r.rank}</span>
      <span class="t">${esc(r.id === career.clubId ? r.name + ' (you)' : r.name)}</span>
      <span class="g">${r.gd > 0 ? '+' : ''}${r.gd}</span>
      <span class="p">${r.points}</span>
    </li>`).join('');

  $('fixtures-season').textContent = career.season;
  const remainder = Math.max(0, career.fixtures.length - career.matchday);
  const dates = career.nextMatchAt && remainder ? upcomingSlots(career.nextMatchAt, remainder, career.timeZone) : [];
  const mine = [];
  career.fixtures.forEach((fixtures, md) => {
    const f = fixtures.find((x) => x.home === career.clubId || x.away === career.clubId);
    if (f) mine.push({ md, home: f.home, away: f.away });
  });
  const resultFor = (md) => career.results.find((r) => r.matchday === md + 1
    && (r.home.id === career.clubId || r.away.id === career.clubId));
  $('fixtures-list').innerHTML = mine.map((f) => {
    const r = resultFor(f.md);
    const h = CLUB_BY_ID[f.home];
    const a = CLUB_BY_ID[f.away];
    if (r) {
      const latest = career.lastReport && career.lastReport.matchday === f.md + 1;
      return `<li class="list-row${latest ? ' row-btn' : ''}"${latest ? ' data-open-report="1" tabindex="0" role="button"' : ''}>
        <span class="nm">${esc(h.name)} ${r.homeGoals}–${r.awayGoals} ${esc(a.name)}<small>Matchday ${f.md + 1}</small></span>
        <span class="form"><i class="${resultClass(r, career.clubId)}">${resultLetter(r, career.clubId)}</i></span>
        ${latest ? '<span class="chev" aria-hidden="true">›</span>' : ''}
      </li>`;
    }
    const when = dates[f.md - career.matchday];
    return `<li class="list-row">
      <span class="nm">Matchday ${f.md + 1}, ${esc(displayName(h))} v ${esc(displayName(a))}<small>${when ? esc(fixtureDate(when, career.timeZone)) : 'To be played'}</small></span>
    </li>`;
  }).join('');

  renderFinance();

  // Selling the club: the price comes from the division it is in today, and
  // the money stays in the manager's wallet for their next club.
  const price = saleValue(career, shop.saleValues || {});
  const forPrice = price > 0 ? ' for ' + usdc(price) : '';
  $('start-over').textContent = 'Sell ' + club.name + forPrice;
  $('new-from-season').textContent = 'Sell ' + club.name;
  $('confirm-over-yes').textContent = 'Sell club';
  if (DEMO) {
    $('confirm-text').textContent = 'Sell ' + club.name
      + '? This is the staging demo season, so no wallet is credited.';
  } else {
    $('confirm-text').textContent = 'Sell ' + club.name + forPrice
      + '? This career and its results end, and the ' + usdc(price)
      + ' goes into your wallet for your next club. ' + club.name + ' goes back in the shop.';
  }
  $('save-error').hidden = !saveFailed;
  renderFacilities();
  renderStaff();
  renderAcademy();
  if (tab === 'tactics') drawPitch();
}

// ── Finance ──────────────────────────────────────────────────────────────
// The Finance tab: the Wallet at the top, then the season's Club credits in,
// out and net, where each came from and went, and the last ten matchdays.
// Home shows none of it.
function renderFinance() {
  const money = moneyFields(career);
  const season = seasonMoney(career);
  const table = leagueTable(career);
  const size = divisionClubIds(career).length;
  const me = table.find((r) => r.id === career.clubId) || { rank: size };
  const tier = clubTier(career);
  const capacity = FAN_CAP[tier] || FAN_CAP[3];
  const seats = stadiumSeats(career);
  const crowd = homeCrowd(career, money.fans, capacity);
  const seated = crowd.attendance;
  const maintenanceNow = maintenanceDue(career);
  const wagesNow = wageBill(career);
  const staffNow = staffWagesDue(career);
  const squadSize = career.squads[career.clubId].length;
  const staffCount = STAFF_ROLES.filter((s) => staffFields(career)[s.key]).length;
  const sponsor = money.sponsor;
  const sponsorMet = objectiveMet(me.rank, sponsor.target, size);
  const fanRate = (r) => Math.round(r * 100);
  const sponsorNote = sponsor.target + ': ' + (sponsorMet ? 'on track' : 'off track')
    + ', ' + ordinal(me.rank) + ' of ' + size + '. Paid when you start next season.'
    + (money.lastSponsor
      ? ' Last season ' + money.lastSponsor.name + (money.lastSponsor.paid
        ? ' paid ' + num(money.lastSponsor.fee) + '.'
        : ' missed its target.')
      : '');
  const seasonLabel = 'Season ' + (career.season || 1);
  $('finance-season').textContent = seasonLabel;
  $('income-season').textContent = seasonLabel;
  $('expense-season').textContent = seasonLabel;

  // Wallet: Dummy USDC and Club credits, then the Homeroom wallet linked to
  // the person, shown for reference only. A guest looking at the demo has no
  // Homeroom wallet, so the row is left out.
  if (career.wallet) {
    $('wallet-sec').hidden = false;
    $('club-wallet').textContent = usdc(career.wallet.balance);
    const bought = career.purchase ? CLUB_BY_ID[career.purchase.clubId] : null;
    $('club-wallet-note').textContent = bought
      ? 'You bought ' + bought.name + ' for ' + usdc(career.purchase.price) + '. No real payment was taken.'
      : 'No real payment was taken.';
    $('club-credits').textContent = credits(career.credits || 0);
    $('club-credits-note').textContent = creditsNote();
    const walletRow = $('homeroom-wallet-row');
    if (homeroomWallet !== undefined) {
      walletRow.hidden = false;
      const address = homeroomWallet && homeroomWallet.address;
      $('homeroom-wallet-addr').textContent = address || 'No Homeroom wallet linked to your account';
      $('homeroom-wallet-addr').classList.toggle('addr', !!address);
    } else {
      walletRow.hidden = true;
    }
  } else {
    $('wallet-sec').hidden = true;
  }

  // The summary: what came in, what went out and the net, in Club credits.
  $('finance-summary').innerHTML = `
    <li class="list-row"><span class="nm">Income this season<small>Results, gates, shop, food stand and hotel</small></span><span class="price">${signed(season.income.total)}</span></li>
    <li class="list-row"><span class="nm">Expenses this season<small>Ground upkeep, maintenance and wages</small></span><span class="price">${season.expenses.total ? '−' + num(season.expenses.total) : '0'}</span></li>
    <li class="list-row net"><span class="nm">Net this season<small>Upgrades, staff fees, transfers and the sponsor are not counted here. Your balance is ${num(career.credits || 0)} Club credits and never goes below 0.</small></span><span class="price">${signed(season.net)}</span></li>`;

  // What the home crowd spends at each earning facility, at today's crowd and
  // its level; the season totals come from the saved career.
  const levels = facilityLevels(career);
  const salesNow = matchdaySales(career, seated);
  const salesRow = (key, name) => `<li class="list-row"><span class="nm">${name} this season<small>${num(salesNow[key])} Club credits from a home crowd of ${num(seated)} at level ${levels[key]}</small></span><span class="price">+${num(money.finance[key])}</span></li>`;
  const record = season.record;
  const resultsNote = record.won + (record.won === 1 ? ' win' : ' wins')
    + ', ' + record.drawn + (record.drawn === 1 ? ' draw' : ' draws')
    + ', ' + record.lost + (record.lost === 1 ? ' loss' : ' losses');
  $('income-list').innerHTML = `
    <li class="list-row"><span class="nm">Results this season<small>${resultsNote}</small></span><span class="price">+${num(season.income.results)}</span></li>
    <li class="list-row"><span class="nm">Fans<small>Division ${tier} holds at most ${num(capacity)} fans. Wins add ${fanRate(FAN_CHANGE.win)}%, draws ${fanRate(FAN_CHANGE.draw)}%, losses take ${fanRate(-FAN_CHANGE.loss)}%.</small></span><span class="price">${num(money.fans)}</span></li>
    <li class="list-row"><span class="nm">Home gate<small>${num(seated)} of ${num(seats)} seats at ${TICKET_PRICE} Club credits${crowd.extra > 0
      ? ', with ' + num(crowd.extra) + ' extra fans from toilets, parking and the VIP room'
      : ''}. Away matches earn no gate.</small></span><span class="price">${num(seated * TICKET_PRICE)}</span></li>
    <li class="list-row"><span class="nm">Gate this season<small>${money.finance.homeGames
      ? money.finance.homeGames + (money.finance.homeGames === 1 ? ' home match' : ' home matches')
      : 'No home match yet this season'}</small></span><span class="price">+${num(money.finance.gate)}</span></li>
    ${salesRow('shop', 'Shop')}
    ${salesRow('food', 'Food stand')}
    ${salesRow('hotel', 'Hotel')}
    <li class="list-row"><span class="nm">Sponsor: ${esc(sponsor.name)}<small>${esc(sponsorNote)}</small></span><span class="price">${num(sponsor.fee)}</span></li>`;

  $('expense-list').innerHTML = `
    <li class="list-row"><span class="nm">Ground upkeep this season<small>${GROUND_UPKEEP} Club credits every matchday, home or away</small></span><span class="price">${money.finance.upkeep ? '−' + num(money.finance.upkeep) : '0'}</span></li>
    <li class="list-row"><span class="nm">Maintenance this season<small>${num(maintenanceNow)} Club credits every matchday for facilities above level 1</small></span><span class="price">${money.finance.maintenance ? '−' + num(money.finance.maintenance) : '0'}</span></li>
    <li class="list-row"><span class="nm">Player wages this season<small>${num(wagesNow)} Club credits every matchday for ${squadSize} players</small></span><span class="price">${money.finance.wages ? '−' + num(money.finance.wages) : '0'}</span></li>
    <li class="list-row"><span class="nm">Staff wages this season<small>${num(staffNow)} Club credits every matchday for ${staffCount} staff</small></span><span class="price">${money.finance.staffWages ? '−' + num(money.finance.staffWages) : '0'}</span></li>`;

  // The last ten matchdays of this season, newest first, from the career.
  const history = Array.isArray(career.financeHistory) ? career.financeHistory : [];
  $('finance-history').innerHTML = history.length
    ? history.map((h) => {
      const opp = CLUB_BY_ID[h.opponentId];
      const name = opp ? displayName(opp) : 'Unknown club';
      const income = h.income.result + h.income.gate + h.income.shop + h.income.food + h.income.hotel;
      const expenses = h.expenses.upkeep + h.expenses.maintenance + h.expenses.wages + h.expenses.staffWages;
      return `<li class="list-row"><span class="nm">Matchday ${h.matchday}, ${h.venue === 'Home' ? 'home v' : 'away at'} ${esc(name)}<small>Income ${num(income)}, expenses ${num(expenses)}. Balance ${num(h.balanceAfter)} Club credits.</small></span><span class="price">${signed(h.net)}</span></li>`;
    }).join('')
    : '<li class="list-row"><span class="nm"><small>No matchday played yet this season. Each matchday\'s Club credits in and out appear here.</small></span></li>';
}

// ── Club: the facilities ─────────────────────────────────────────────────
// Which facility change is in flight and in which direction, which one
// failed, and which one just went up a level (for the one-shot bar flash).
let facilityBusy = null;
let facilityDir = 'up';
let facilityError = null;
let facilityRetry = null;
let facilityNew = null;

const creditsNote = () => 'Earned from results, home gates and the shop, food stand and hotel, less upkeep, maintenance and wages.';

function facilityRow(f, level) {
  const steps = Array.from({ length: FACILITY_MAX_LEVEL }, (_, i) =>
    `<i class="${i < level ? 'on' : ''}${i === level - 1 && facilityNew === f.key ? ' new' : ''}"></i>`).join('');
  const now = 'Level ' + level + ': ' + f.levels[level - 1] + '.';
  const next = level < FACILITY_MAX_LEVEL ? ' Next: ' + f.levels[level] + '.' : '';
  const here = MAINTENANCE[level] || 0;
  const below = level > 1 ? MAINTENANCE[level - 1] || 0 : null;
  const ahead = level < FACILITY_MAX_LEVEL ? MAINTENANCE[level + 1] || 0 : null;
  const maintenance = here === 0
    ? 'No maintenance at level 1, ' + num(ahead) + ' at the next level.'
    : 'Maintenance ' + num(here) + ' every matchday'
      + (below != null ? ', ' + (below ? num(below) : 'nothing') + ' a level down' : '')
      + (ahead != null ? ', ' + num(ahead) + ' at the next level.' : '.');
  const cost = upgradeCost(level + 1);
  const down = level > 1
    ? `<button class="btn-secondary small" type="button" data-facility="${esc(f.key)}" data-facility-dir="down"${facilityBusy ? ' disabled' : ''}>${
      facilityBusy === f.key && facilityDir === 'down' ? 'Downgrading...' : 'Downgrade'}</button>`
    : '';
  let end;
  if (level >= FACILITY_MAX_LEVEL) {
    end = '<span class="need">Top level</span>';
  } else if ((career.credits || 0) >= cost) {
    end = `<button class="btn-secondary small" type="button" data-facility="${esc(f.key)}" data-facility-dir="up"${facilityBusy ? ' disabled' : ''}>${
      facilityBusy === f.key && facilityDir === 'up' ? 'Upgrading...' : 'Upgrade for ' + cost.toLocaleString('en-US')}</button>`;
  } else {
    end = `<span class="need">${cost.toLocaleString('en-US')} needed</span>`;
  }
  return `<li class="list-row fac-row">
    <span class="nm">${esc(f.name)}<span class="lvl" aria-hidden="true">${steps}</span><small>${esc(now + next + ' ' + maintenance)}</small></span>
    <span class="fac-acts">${down}${end}</span>
  </li>`;
}

// ── Club: staff and the academy ──────────────────────────────────────────
// Which staff change or promotion is in flight, and which one failed.
let staffBusy = null;
let staffBusyAction = 'hire';
let staffError = null;
let staffRetry = null;
let youthBusy = null;
let youthError = null;
let youthRetry = null;

function staffRow(role) {
  const staff = staffFields(career);
  const hired = staff[role.key];
  const note = hired
    ? role.wage.toLocaleString('en-US') + ' Club credits every matchday.'
    : 'Not hired. ' + role.wage.toLocaleString('en-US') + ' Club credits every matchday once hired.';
  const label = hired ? role.name + ': ' + hired.name : role.name;
  let end;
  if (staffBusy === role.key) {
    end = `<button class="btn-secondary small" type="button" disabled>${staffBusyAction === 'hire' ? 'Hiring...' : 'Releasing...'}</button>`;
  } else if (hired) {
    end = `<button class="btn-secondary small" type="button" data-staff="${esc(role.key)}" data-staff-action="release">Release</button>`;
  } else if ((career.credits || 0) >= role.fee) {
    end = `<button class="btn-secondary small" type="button" data-staff="${esc(role.key)}" data-staff-action="hire">Hire for ${role.fee.toLocaleString('en-US')}</button>`;
  } else {
    end = `<span class="need">${role.fee.toLocaleString('en-US')} needed</span>`;
  }
  return `<li class="list-row">
    <span class="nm">${esc(label)}<small>${esc(note)}</small></span>
    ${end}
  </li>`;
}

function renderStaff() {
  $('staff-list').innerHTML = STAFF_ROLES.map(staffRow).join('');
  const failed = STAFF_ROLES.find((s) => s.key === staffError);
  $('staff-error').hidden = !failed;
  if (failed) {
    $('staff-error-text').textContent = 'The change to your ' + failed.name.toLowerCase()
      + ' did not go through, and no Club credits were spent. Your staff are unchanged.';
  }
}

function youthRow(p) {
  const joined = p.joined || {};
  const when = joined.season != null && joined.season !== (career.season || 1)
    ? 'joined last season'
    : joined.matchday === career.matchday
      ? 'new this matchday'
      : joined.matchday != null ? 'joined on matchday ' + joined.matchday : '';
  const small = 'Age ' + p.age + (when ? ', ' + when : '');
  const full = career.squads[career.clubId].length >= SQUAD_MAX;
  const end = youthBusy === p.id
    ? '<button class="btn-secondary small" type="button" disabled>Promoting...</button>'
    : full
      ? '<span class="need">Squad full</span>'
      : `<button class="btn-secondary small" type="button" data-youth="${esc(p.id)}">Promote</button>`;
  return `<li class="list-row">
    <span class="pos">${esc(p.pos)}</span>
    <span class="nm">${esc(p.name)}<small>${esc(small)}</small></span>
    <span class="ovr">${p.overall}</span>
    ${end}
  </li>`;
}

function renderAcademy() {
  const youth = youthFields(career);
  $('youth-places').textContent = youth.length + ' of ' + academyCapacity(career) + ' places';
  if (youth.length) {
    $('youth-list').innerHTML = youth.map(youthRow).join('');
    $('youth-empty').hidden = true;
  } else {
    $('youth-list').innerHTML = '';
    $('youth-empty').hidden = false;
    const intake = ACADEMY_INTAKE[facilityLevels(career).academy] || 1;
    $('youth-empty').textContent = 'No young players yet. The academy takes in ' + intake
      + (intake === 1 ? ' after every matchday.' : ' after every matchday.');
  }
  $('youth-error').hidden = !youthError;
  if (youthError) {
    $('youth-error-text').textContent = 'The promotion did not go through, and your squad is unchanged.';
  }
}

function changeStaff(key, action) {
  if (!career || staffBusy) return saveChain;
  staffBusy = key;
  staffBusyAction = action;
  staffRetry = { key, action };
  staffError = null;
  renderStaff();
  saveChain = saveChain.then(() => changeStaffNow(key, action), () => changeStaffNow(key, action));
  return saveChain;
}

async function changeStaffNow(key, action) {
  try {
    const { status, data } = await api('POST', { role: key, action }, '/api/career/staff');
    staffBusy = null;
    if (status === 200 && data && data.career && repairCareer(data.career)) {
      career = repairCareer(data.career);
      version = data.version;
      staffError = null;
      render();
      return;
    }
    if (status === 401) {
      renderStaff();
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: action === 'hire' ? 'hire staff' : 'release staff' });
      return;
    }
    if (status === 409) {
      renderStaff();
      await refresh();
      return;
    }
    throw new Error('HTTP ' + status);
  } catch (err) {
    staffBusy = null;
    staffError = key;
    renderStaff();
  }
}

function promote(id) {
  if (!career || youthBusy) return saveChain;
  youthBusy = id;
  youthRetry = id;
  youthError = null;
  renderAcademy();
  saveChain = saveChain.then(() => promoteNow(id), () => promoteNow(id));
  return saveChain;
}

async function promoteNow(id) {
  try {
    const { status, data } = await api('POST', { id }, '/api/career/youth');
    youthBusy = null;
    if (status === 200 && data && data.career && repairCareer(data.career)) {
      career = repairCareer(data.career);
      version = data.version;
      youthError = null;
      render();
      return;
    }
    if (status === 401) {
      renderAcademy();
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'promote a young player' });
      return;
    }
    if (status === 409) {
      renderAcademy();
      await refresh();
      return;
    }
    throw new Error('HTTP ' + status);
  } catch (err) {
    youthBusy = null;
    youthError = id;
    renderAcademy();
  }
}

function renderFacilities() {
  $('club-tab-credits').textContent = credits(career.credits || 0);
  $('club-tab-credits-note').textContent = creditsNote();
  const levels = facilityLevels(career);
  $('facility-list').innerHTML = FACILITIES.map((f) => facilityRow(f, levels[f.key])).join('');
  const failed = FACILITIES.find((f) => f.key === facilityError);
  $('facility-error').hidden = !failed;
  if (failed) {
    $('facility-error-text').textContent = facilityDir === 'down'
      ? 'The ' + failed.name.toLowerCase() + ' downgrade did not go through. Your facilities are unchanged.'
      : 'The ' + failed.name.toLowerCase()
        + ' upgrade did not go through, and no Club credits were spent. Your other facilities are unchanged.';
  }
  facilityNew = null;
}

// The page names the facility and the level; the server decides whether it can
// be afforded and moves the credits. Goes through saveChain so it runs after a
// pending save, with the version that save left behind.
function changeFacility(key, dir) {
  if (!career || facilityBusy) return saveChain;
  const target = facilityLevels(career)[key] + (dir === 'down' ? -1 : 1);
  facilityBusy = key;
  facilityDir = dir;
  facilityRetry = { key, dir };
  facilityError = null;
  renderFacilities();
  saveChain = saveChain.then(() => changeFacilityNow(key, target, dir), () => changeFacilityNow(key, target, dir));
  return saveChain;
}

async function changeFacilityNow(key, level, dir) {
  try {
    const { status, data } = await api('POST', { facility: key, level }, '/api/career/facility');
    facilityBusy = null;
    if (status === 200 && data && data.career) {
      const repaired = repairCareer(data.career);
      if (repaired) {
        career = repaired;
        version = data.version;
        facilityNew = dir === 'up' ? key : null;
        facilityError = null;
        render();
        return;
      }
    }
    if (status === 401) {
      renderFacilities();
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: dir === 'down' ? 'downgrade a facility' : 'upgrade a facility' });
      return;
    }
    // The stored career moved on: show its real levels and balance, no error.
    if (status === 409) {
      renderFacilities();
      await refresh();
      return;
    }
    throw new Error('HTTP ' + status);
  } catch (err) {
    facilityBusy = null;
    facilityNew = null;
    facilityError = key;
    renderFacilities();
  }
}

function openReport(from) {
  if (!career || !career.lastReport) return;
  reportFrom = from || tab;
  const label = reportFrom === 'competition' ? 'Back to Competition' : 'Back to Home';
  $('report-back-label').textContent = label;
  $('report-close').textContent = label;
  screen = 'report';
  render();
  window.scrollTo(0, 0);
}

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
    await save();
    await refresh();
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
  $('sheet-sub').textContent = p.pos + ', ' + (p.captain ? 'captain, ' : '') + (isStarter ? 'starter' : p.injury > 0 ? 'injured for ' + p.injury + ' matches' : 'bench')
    + '. Age ' + p.age + ', wage ' + playerWage(p, clubTier(career)) + ' Club credits a matchday';

  $('sheet-vitals').innerHTML = `
    <div class="vital"><span>Fitness</span><span class="vital-track"><i style="width:${p.fitness}%${p.fitness < 60 ? ';background:rgb(var(--card-y))' : ''}"></i></span><b>${p.fitness}%</b></div>
    <div class="vital"><span>Morale</span><span class="vital-track"><i style="width:${p.morale}%"></i></span><b>${p.morale}%</b></div>`;
  const attrs = [['Pace', 'pac'], ['Passing', 'pas'], ['Shooting', 'sho'], ['Defending', 'def'], ['Goalkeeping', 'gk']];
  $('sheet-attrs').innerHTML = attrs.map(([label, key]) => `
    <div class="attr"><span>${label}</span><span class="attr-track"><i style="width:${p.attrs[key]}%"></i></span><b>${p.attrs[key]}</b></div>`).join('');

  if (scouted()) {
    const o = growthOutlook(career, p);
    $('sheet-growth').innerHTML = `<li class="list-row">
      <span class="nm">${capitalise(o.style)} peak, around ${o.peakAge}<small>${capitalise(o.next)} next season</small></span>
    </li>`;
  } else {
    $('sheet-growth').innerHTML = `<li class="list-row">
      <span class="nm muted">Not scouted<small>Hire a Scout on the Club tab to see this player's peak and how they will change next season.</small></span>
    </li>`;
  }

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
  renderSheetTransfer(p);
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

// ── The transfer market ──────────────────────────────────────────────────
let market = { listings: [], mine: [], loading: false, error: false, loaded: false };
let marketBusy = null;
let marketErrorText = '';
let sheetTransfer = { mode: 'rows', busy: false, error: '' };

const LEAVE_TEXT = {
  min: 'Your squad needs at least 11 players.',
  goalkeeper: 'Your squad needs a goalkeeper.',
  player: 'That player is not in your squad.',
};

function money(n) { return num(n); }

function marketRow(l) {
  return `<li class="list-row">
    <span class="pos">${esc(l.player.pos)}</span>
    <span class="nm">${esc(l.player.name)}<small>Age ${l.player.age}, ${l.player.overall} overall, wage ${l.player.wage}. ${esc(displayName(l.club))}</small></span>
    <span data-listing-end="${l.id}"></span>
  </li>`;
}

function renderMarket() {
  if (!career) return;
  const squad = career.squads[career.clubId];
  $('transfers-credits').textContent = credits(career.credits || 0);
  $('transfers-squad').textContent = 'Squad ' + squad.length + ' of ' + SQUAD_MAX;
  $('transfers-demo').hidden = !DEMO;

  const mine = market.mine || [];
  $('listing-sec').hidden = !mine.length;
  $('listing-count').textContent = mine.length + (mine.length === 1 ? ' player' : ' players');
  $('listing-list').innerHTML = mine.map((l) => `<li class="list-row">
    <span class="pos">${esc(l.player.pos)}</span>
    <span class="nm">${esc(l.player.name)}<small>Asking ${num(l.price)} Club credits</small></span>
    <button class="btn-secondary small" type="button" data-withdraw="${l.id}"${marketBusy ? ' disabled' : ''}>${marketBusy === 'w' + l.id ? 'Withdrawing...' : 'Withdraw'}</button>
  </li>`).join('');

  $('market-loading').hidden = userHidden();
  function userHidden() { return !(market.loading && !market.loaded); }
  $('market-error').hidden = !market.error;
  $('market-empty').hidden = !(market.loaded && !market.error && !(market.listings || []).length);
  const listings = market.listings || [];
  $('market-count').textContent = market.loaded && !market.error
    ? listings.length + (listings.length === 1 ? ' player' : ' players') : '';
  $('market-list').innerHTML = listings.map((l) => marketRow(l)).join('');
  if (market.error && marketErrorText) {
    $('market-error').querySelector('.state-text').textContent = marketErrorText;
  }
  // The end of each row: Buy, what is needed, or Squad full.
  for (const l of listings) {
    const slot = $('market-list').querySelector('[data-listing-end="' + l.id + '"]');
    if (!slot) continue;
    const err = signError(career, l.player, l.price);
    if (DEMO) {
      slot.innerHTML = '<span class="need">Demo</span>';
    } else if (err === 'full') {
      slot.innerHTML = '<span class="need">Squad full</span>';
    } else if (err === 'credits') {
      const short = Math.max(1, signCost(career, l.player, l.price) - (career.credits || 0));
      slot.innerHTML = '<span class="need">' + num(short) + ' needed</span>';
    } else {
      const busy = marketBusy === 'b' + l.id;
      slot.innerHTML = '<button class="btn-secondary small" type="button" data-buy="' + l.id + '"' + (marketBusy ? ' disabled' : '') + '>'
        + (busy ? 'Buying...' : 'Buy for ' + num(l.price)) + '</button>';
    }
  }
}

async function loadMarket() {
  if (!career) return;
  market.loading = true;
  market.error = false;
  marketErrorText = '';
  renderMarket();
  try {
    const { status, data } = await api('GET', null, '/api/transfers');
    if (status === 200 && data) {
      market.listings = Array.isArray(data.listings) ? data.listings : [];
      market.mine = Array.isArray(data.mine) ? data.mine : [];
      market.error = false;
    } else {
      market.error = true;
    }
  } catch (_) {
    market.error = true;
  }
  market.loading = false;
  market.loaded = true;
  if (tab === 'transfers') renderMarket();
}

function takeCareer(data) {
  const repaired = data && data.career ? repairCareer(data.career) : null;
  if (!repaired) return false;
  career = repaired;
  version = data.version;
  return true;
}

function marketFailure(data, fallback) {
  marketErrorText = (data && data.message) || fallback;
}

// Buy a listing. Goes through saveChain so it runs after a pending save.
function buyListing(id) {
  if (!career || marketBusy) return saveChain;
  marketBusy = 'b' + id;
  marketErrorText = '';
  renderMarket();
  saveChain = saveChain.then(() => buyNow(id), () => buyNow(id));
  return saveChain;
}

async function buyNow(id) {
  try {
    const { status, data } = await api('POST', {}, '/api/transfers/' + id + '/buy');
    marketBusy = null;
    if (status === 200 && takeCareer(data)) {
      render();
      await loadMarket();
      return;
    }
    if (status === 401) {
      renderMarket();
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'sign a player' });
      return;
    }
    if (status === 409 && data && data.error === 'version_mismatch') {
      renderMarket();
      await refresh();
      return;
    }
    marketFailure(data, 'The transfer did not go through, and no Club credits were spent.');
    market.error = true;
    if (status === 409 && data && data.error === 'gone') await loadMarket().then(() => { market.error = true; marketErrorText = data.message; renderMarket(); });
    else renderMarket();
  } catch (_) {
    marketBusy = null;
    market.error = true;
    marketErrorText = 'The transfer did not go through, and no Club credits were spent.';
    renderMarket();
  }
}

function withdrawListing(id) {
  if (!career || marketBusy) return saveChain;
  marketBusy = 'w' + id;
  marketErrorText = '';
  renderMarket();
  saveChain = saveChain.then(() => withdrawNow(id), () => withdrawNow(id));
  return saveChain;
}

async function withdrawNow(id) {
  try {
    const { status, data } = await api('DELETE', null, '/api/transfers/' + id);
    marketBusy = null;
    if (status === 200 && takeCareer(data)) {
      render();
      await loadMarket();
      return;
    }
    if (status === 401) {
      renderMarket();
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'withdraw a listing' });
      return;
    }
    if (status === 409 && data && data.error === 'version_mismatch') {
      renderMarket();
      await refresh();
      return;
    }
    marketFailure(data, 'The listing was not withdrawn.');
    market.error = true;
    await loadMarket();
    market.error = true;
    renderMarket();
  } catch (_) {
    marketBusy = null;
    market.error = true;
    marketErrorText = 'The listing was not withdrawn.';
    renderMarket();
  }
}

// ── The player sheet's Transfer section ──────────────────────────────────
function renderSheetTransfer(p) {
  if (!p) return;
  const reason = leaveError(career, p.id);
  const blocked = reason ? LEAVE_TEXT[reason] : '';
  const dis = reason || sheetTransfer.busy;
  $('sheet-transfer-error').hidden = !sheetTransfer.error;
  if (sheetTransfer.error) $('sheet-transfer-error-text').textContent = sheetTransfer.error;
  const name = esc(p.name);
  const box = $('sheet-transfer');
  if (sheetTransfer.mode === 'list') {
    box.innerHTML = `<li class="list-row sheet-form">
      <label class="sheet-label" for="ask-price">Asking price in Club credits</label>
      <input class="field" id="ask-price" inputmode="numeric" placeholder="e.g. 2,000" autocomplete="off">
      <div class="confirm-row">
        <button class="btn-primary" type="button" data-sheet-act="list-go"${sheetTransfer.busy ? ' disabled' : ''}>${sheetTransfer.busy ? 'Listing...' : 'List player'}</button>
        <button class="btn-secondary" type="button" data-sheet-act="cancel">Cancel</button>
      </div>
    </li>`;
    return;
  }
  if (sheetTransfer.mode === 'sell' || sheetTransfer.mode === 'release') {
    const sell = sheetTransfer.mode === 'sell';
    box.innerHTML = `<li class="list-row sheet-form">
      <div class="confirm">
        <p class="state-text">${sell
          ? 'Sell ' + name + ' to the league for ' + num(systemSaleValue(p)) + ' Club credits? ' + name + ' leaves your squad now.'
          : 'Release ' + name + '? ' + name + ' leaves your squad now and you are paid nothing.'}</p>
        <div class="confirm-row">
          <button class="btn-primary" type="button" data-sheet-act="${sell ? 'sell-go' : 'release-go'}"${sheetTransfer.busy ? ' disabled' : ''}>${sheetTransfer.busy ? 'Working...' : sell ? 'Sell for ' + num(systemSaleValue(p)) : 'Release'}</button>
          <button class="btn-secondary" type="button" data-sheet-act="cancel">Cancel</button>
        </div>
      </div>
    </li>`;
    return;
  }
  box.innerHTML = `
    <li class="list-row"><span class="nm">List on market<small>${DEMO ? 'The demo season cannot list players.' : 'Other managers can buy ' + name + ' at your asking price.'}</small></span><button class="btn-secondary small" type="button" data-sheet-act="list"${dis || DEMO ? ' disabled' : ''}>List</button></li>
    <li class="list-row"><span class="nm">Sell to the league<small>${escapeSmall(blocked || 'Paid now. ' + name + ' leaves your squad.')}</small></span><button class="btn-secondary small" type="button" data-sheet-act="sell"${dis ? ' disabled' : ''}>Sell for ${num(systemSaleValue(p))}</button></li>
    <li class="list-row"><span class="nm">Release<small>${escapeSmall(blocked || 'Leaves for nothing, and you stop paying the wage.')}</small></span><button class="btn-secondary small" type="button" data-sheet-act="release"${dis ? ' disabled' : ''}>Release</button></li>`;
}

function escapeSmall(text) { return esc(text); }

async function sheetTransferAction(mode) {
  const p = sheetPlayerId ? findPlayer(sheetPlayerId) : null;
  if (!p) return;
  if (mode === 'cancel') {
    sheetTransfer = { mode: 'rows', busy: false, error: '' };
    renderSheetTransfer(p);
    return;
  }
  if (mode === 'list') {
    sheetTransfer = { mode: 'list', busy: false, error: '' };
    renderSheetTransfer(p);
    const input = $('ask-price');
    if (input) input.focus();
    return;
  }
  if (mode === 'sell' || mode === 'release') {
    sheetTransfer = { mode, busy: false, error: '' };
    renderSheetTransfer(p);
    return;
  }
  let path = '/api/career/player/release';
  let body = { playerId: p.id };
  if (mode === 'list-go') {
    const raw = ($('ask-price').value || '').replace(/[^0-9]/g, '');
    const price = raw ? Number(raw) : NaN;
    if (!Number.isInteger(price) || price < 1 || price > 1000000) {
      sheetTransfer = { mode: 'list', busy: false, error: 'An asking price is a whole number from 1 to 1,000,000 Club credits.' };
      renderSheetTransfer(p);
      return;
    }
    path = '/api/transfers';
    body = { playerId: p.id, price };
  } else if (mode === 'sell-go') {
    path = '/api/career/player/sell';
  }
  sheetTransfer.busy = true;
  sheetTransfer.error = '';
  renderSheetTransfer(p);
  try {
    const { status, data } = await api('POST', body, path);
    if (status === 200 && takeCareer(data)) {
      sheetTransfer = { mode: 'rows', busy: false, error: '' };
      closeSheet();
      render();
      if (tab === 'transfers') await loadMarket();
      return;
    }
    if (status === 401) {
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'change your squad' });
      sheetTransfer = { mode: 'rows', busy: false, error: '' };
      renderSheetTransfer(p);
      return;
    }
    if (status === 409 && data && data.error === 'version_mismatch') {
      sheetTransfer = { mode: 'rows', busy: false, error: '' };
      await refresh();
      return;
    }
    sheetTransfer = {
      mode: mode === 'list-go' ? 'list' : mode === 'sell-go' ? 'sell' : mode === 'release-go' ? 'release' : 'rows',
      busy: false,
      error: (data && data.message) || 'The change did not go through.',
    };
    renderSheetTransfer(p);
    if (data && data.error === 'version_mismatch') refresh();
  } catch (_) {
    sheetTransfer = {
      mode: mode === 'list-go' ? 'list' : 'rows',
      busy: false,
      error: 'The change did not go through. Check the connection and try again.',
    };
    renderSheetTransfer(p);
  }
}

$('sheet-transfer').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-sheet-act]');
  if (btn && !btn.disabled) sheetTransferAction(btn.dataset.sheetAct);
});
$('market-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (btn && !btn.disabled) buyListing(Number(btn.dataset.buy));
});
$('listing-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-withdraw]');
  if (btn && !btn.disabled) withdrawListing(Number(btn.dataset.withdraw));
});
$('market-retry').addEventListener('click', () => { loadMarket(); });

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

  // Club finances: what this match earned and cost, for a report saved with
  // them. A report from before they existed keeps the section hidden.
  const fin = r.finance;
  $('report-finance-sec').hidden = !fin;
  if (fin) {
    const resultCredits = creditsForResult(
      fin.result === 'win' ? 1 : 0,
      fin.result === 'loss' ? 1 : 0
    );
    const gateNote = fin.venue === 'Home'
      ? num(fin.attendance) + ' fans at ' + fin.price + ' each'
      : 'Away match: no gate';
    const upkeepNote = fin.upkeep < fin.upkeepDue
      ? fin.upkeepDue + ' due; the balance never goes below 0'
      : '';
    const short = (paid, due, name) => (paid < due
      ? name + ' ' + num(due) + ' due; the balance never goes below 0' : '');
    const line = (label, paid, due) => {
      const note = short(paid, due, label);
      return `<li class="list-row"><span class="nm">${label}${note ? '<small>' + note + '</small>' : ''}</span><span class="price">${paid ? '−' + num(paid) : '0'}</span></li>`;
    };
    // What the crowd spent at each earning facility. A report saved before
    // these existed has no shop, so it keeps its old lines.
    const salesLine = (key, label) => {
      const rate = fin.salesRates[key];
      const note = fin.venue === 'Home'
        ? 'Level ' + fin.levels[key] + ', ' + num(rate) + ' Club credit' + (rate === 1 ? '' : 's') + ' for every 10 fans'
        : 'Away match: no crowd';
      return `<li class="list-row"><span class="nm">${label}<small>${note}</small></span><span class="price">${signed(fin[key])}</span></li>`;
    };
    const balanceNote = Number.isInteger(fin.balanceAfter)
      ? '<small>Balance now ' + num(fin.balanceAfter) + ' Club credits</small>' : '';
    $('report-finance').innerHTML = `
      <li class="list-row"><span class="nm">Result<small>${fin.result === 'win' ? 'A win' : fin.result === 'loss' ? 'A loss' : 'A draw'}</small></span><span class="price">${signed(resultCredits)}</span></li>
      <li class="list-row"><span class="nm">Gate<small>${gateNote}</small></span><span class="price">${signed(fin.gate)}</span></li>
      ${fin.shop != null ? salesLine('shop', 'Shop') : ''}
      ${fin.food != null ? salesLine('food', 'Food stand') : ''}
      ${fin.hotel != null ? salesLine('hotel', 'Hotel') : ''}
      <li class="list-row"><span class="nm">Ground upkeep${upkeepNote ? '<small>' + upkeepNote + '</small>' : ''}</span><span class="price">${fin.upkeep ? '−' + num(fin.upkeep) : '0'}</span></li>
      ${fin.maintenanceDue != null ? line('Maintenance', fin.maintenance, fin.maintenanceDue) : ''}
      ${fin.wagesDue != null ? line('Player wages', fin.wages, fin.wagesDue) : ''}
      ${fin.staffDue != null ? line('Staff wages', fin.staffWages, fin.staffDue) : ''}
      <li class="list-row net"><span class="nm">Net${balanceNote}</span><span class="price">${signed(fin.net)}</span></li>
      <li class="list-row"><span class="nm">Fans<small>Now ${num(fin.fansAfter)}</small></span><span class="price">${signed(fin.fansAfter - fin.fansBefore)}</span></li>`;
  }

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
  closeSheet();
  closeMenu();
  screen = 'club';
  tab = reportFrom;
  if (location.hash !== '#' + tab) location.hash = '#' + tab;
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
        ensureZone();
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
    const { status, data } = await api('DELETE');
    if (status === 401) {
      if (window.usernode && window.usernode.askForAccount) window.usernode.askForAccount({ action: 'sell your club' });
      return;
    }
    if (status !== 200) {
      // Only leave the club once the server says the career is gone and the
      // money is in the wallet.
      saveFailed = true;
      $('save-error').hidden = false;
      return;
    }
    if (data && data.sale) {
      lastSale = data.sale;
      shop = { ...shop, balance: data.sale.balance, kept: true };
    }
    career = null;
    version = null;
    pickedDivision = TIER_COUNT;
    pickedGroup = 'A';
    pickedClub = GROUPS.filter((g) => g.tier === TIER_COUNT)[0].clubIds[0];
    $('manager-name').value = '';
    closeSheet();
    closeMenu();
    tab = 'home';
    history.replaceState(null, '', location.pathname + location.search);
    screen = 'new';
    render();
    // The shop's taken list and the wallet come from the server. Not in the
    // demo: a demo GET would create the demo career again.
    if (!DEMO) refreshShop();
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
$('division-row').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-division]');
  if (!btn) return;
  pickedDivision = Number(btn.dataset.division);
  const group = SHOP_GROUPS.find((g) => g.tier === pickedDivision);
  const taken = new Set(Array.isArray(shop.taken) ? shop.taken : []);
  pickedGroup = group.group || 'A';
  pickedClub = group.clubIds.find((id) => !taken.has(id)) || null;
  renderNew();
});
$('group-row').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-group]');
  if (!btn) return;
  pickedGroup = btn.dataset.group;
  const group = SHOP_GROUPS.find((g) => g.tier === pickedDivision && g.group === pickedGroup);
  const taken = new Set(Array.isArray(shop.taken) ? shop.taken : []);
  if (group && (!group.clubIds.includes(pickedClub) || taken.has(pickedClub))) {
    pickedClub = group.clubIds.find((id) => !taken.has(id)) || null;
  }
  renderNew();
});
$('club-list').addEventListener('click', (e) => {
  const row = e.target.closest('[data-club-id]');
  if (!row || row.getAttribute('aria-disabled') === 'true') return;
  pickedClub = row.dataset.clubId;
  renderNew();
});
$('club-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const row = e.target.closest('[data-club-id]');
  if (!row || row.getAttribute('aria-disabled') === 'true') return;
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
$('facility-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-facility]');
  if (btn && !btn.disabled) changeFacility(btn.dataset.facility, btn.dataset.facilityDir || 'up');
});
$('facility-retry').addEventListener('click', () => {
  if (facilityRetry) changeFacility(facilityRetry.key, facilityRetry.dir);
});
$('staff-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-staff]');
  if (btn && !btn.disabled) changeStaff(btn.dataset.staff, btn.dataset.staffAction);
});
$('staff-retry').addEventListener('click', () => {
  if (staffRetry) changeStaff(staffRetry.key, staffRetry.action);
});
$('youth-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-youth]');
  if (btn && !btn.disabled) promote(btn.dataset.youth);
});
$('youth-retry').addEventListener('click', () => {
  if (youthRetry) promote(youthRetry);
});
function openFromEvent(e) {
  const row = e.target.closest('[data-open-report]');
  if (!row) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  if (e.type === 'keydown') e.preventDefault();
  openReport(row.closest('#tab-competition') ? 'competition' : 'home');
}
$('last-list').addEventListener('click', openFromEvent);
$('last-list').addEventListener('keydown', openFromEvent);
$('fixtures-list').addEventListener('click', openFromEvent);
$('fixtures-list').addEventListener('keydown', openFromEvent);
// The phone bar's More button: opens the menu above the bar, and closes it on
// a choice, a tap outside or Escape.
$('tab-more').addEventListener('click', (e) => {
  e.stopPropagation();
  if ($('more-menu').hidden) openMore();
  else closeMore();
});
$('more-menu').addEventListener('click', (e) => {
  if (e.target.closest('a[data-tab]')) closeMore();
});
document.addEventListener('click', (e) => {
  if ($('more-menu').hidden) return;
  if (e.target.closest('#more-menu') || e.target.closest('#tab-more')) return;
  closeMore();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('more-menu').hidden) {
    closeMore();
    $('tab-more').focus();
  }
});

window.addEventListener('hashchange', () => {
  if (!career) return;
  if (screen === 'report') { screen = 'club'; render(); return; }
  if (screen === 'club') showTab(hashTab());
});
$('retry-btn').addEventListener('click', load);

// The wait line opens by itself when a match time passes, or when the manager
// comes back to the app.
async function refresh() {
  if (!career) return;
  try {
    const { status, data } = await api('GET');
    if (status === 200 && data && data.career) {
      const repaired = repairCareer(data.career);
      if (repaired) {
        career = repaired;
        version = data.version;
        autoPlayed = Number(data.autoPlayed) || 0;
        refreshFailed = false;
        if (data.shop) shop = data.shop;
        homeroomWallet = data.homeroomWallet;
        render();
        return;
      }
    }
    refreshFailed = true;
  } catch (_) {
    refreshFailed = true;
  }
  render();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && screen === 'club' && career) refresh();
});
setInterval(() => {
  if (screen !== 'club' || !career) return;
  if (tab === 'home' && career.nextMatchAt) {
    $('kickoff-when').textContent = kickoffText(career.nextMatchAt, career.timeZone, nowDate());
    if (nowDate().getTime() >= Date.parse(career.nextMatchAt)) refresh();
  }
}, 30000);

load();
