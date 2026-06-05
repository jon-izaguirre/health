'use strict';
const { boot } = require('./harness');
const { ok, eq, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const FOOD = { foods: { f: { id: 'f', name: 'Banana', servQty: 100, servUnit: 'g', nut: { calories: 90 } } } };
const logOf = (w) => { const l = JSON.parse(w.__store[KEY]).log; return l[Object.keys(l)[0]]; };

// fmtTime formatting
{
  const w = boot();
  eq(w.fmtTime('14:30'), '2:30 PM', 'fmtTime afternoon');
  eq(w.fmtTime('00:05'), '12:05 AM', 'fmtTime after midnight');
  eq(w.fmtTime('12:00'), '12:00 PM', 'fmtTime noon');
  eq(w.fmtTime(''), '', 'fmtTime empty -> empty');
}

// default is current time, pending (not accepted)
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  const t = w.document.getElementById('pTime').value;
  ok(/^\d\d:\d\d$/.test(t), 'time control defaults to current time');
  ok(!w.document.getElementById('pTime').classList.contains('accepted'), 'starts pending (must accept)');
}

// log WITHOUT accepting -> no time saved
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  w.commitPortion();
  const e = logOf(w).breakfast[0];
  ok(e && e.time === undefined, 'no time stored when the check is not tapped');
}

// log WITH accepting -> control value saved
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  const t = w.document.getElementById('pTime').value;
  w.toggleTimeAccept();
  ok(w.document.getElementById('pTime').classList.contains('accepted'), 'accept marks the field');
  ok(w.document.getElementById('pTimeOk').classList.contains('on'), 'green check turns on');
  w.commitPortion();
  eq(logOf(w).breakfast[0].time, t, 'accepted time saved on the entry');
}

// custom time then accept
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  w.document.getElementById('pTime').value = '07:15';
  w.toggleTimeAccept();
  w.commitPortion();
  eq(logOf(w).breakfast[0].time, '07:15', 'edited+accepted time saved');
}

// toggling off again clears acceptance -> no time
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  w.toggleTimeAccept();   // on
  w.toggleTimeAccept();   // off
  w.commitPortion();
  ok(logOf(w).breakfast[0].time === undefined, 'un-accepting drops the time');
}

// editing an entry that HAS a time -> pre-accepted with that time
{
  const today = boot().todayStr();
  const db = JSON.parse(JSON.stringify(FOOD));
  db.log = { [today]: { lunch: [{ type: 'food', refId: 'f', amt: 100, unit: 'g', qty: 1, time: '13:45' }] } };
  const w = boot(seed(db));
  w.editEntry('lunch', 0);
  eq(w.document.getElementById('pTime').value, '13:45', 'edit prefills the saved time');
  ok(w.document.getElementById('pTime').classList.contains('accepted'), 'edit shows it as accepted');
}

// editing an entry WITHOUT a time -> pending, defaults to a time
{
  const today = boot().todayStr();
  const db = JSON.parse(JSON.stringify(FOOD));
  db.log = { [today]: { lunch: [{ type: 'food', refId: 'f', amt: 100, unit: 'g', qty: 1 }] } };
  const w = boot(seed(db));
  w.editEntry('lunch', 0);
  ok(!w.document.getElementById('pTime').classList.contains('accepted'), 'untimed entry edits as pending');
  ok(/^\d\d:\d\d$/.test(w.document.getElementById('pTime').value), 'pending still shows a default time');
}

// diary shows the time
{
  const today = boot().todayStr();
  const db = JSON.parse(JSON.stringify(FOOD));
  db.log = { [today]: { breakfast: [{ type: 'food', refId: 'f', amt: 100, unit: 'g', qty: 1, time: '08:20' }] } };
  const w = boot(seed(db));
  w.renderToday();
  ok(w.document.getElementById('diary').innerHTML.includes('8:20 AM'), 'diary row shows the formatted time');
}

// chronological sort within a section, untimed last, original indices preserved
{
  const today = boot().todayStr();
  const db = { foods: {
    a: { id: 'a', name: 'Aaa', servQty: 1, servUnit: 'serving', nut: { calories: 10 } },
    b: { id: 'b', name: 'Bbb', servQty: 1, servUnit: 'serving', nut: { calories: 10 } },
    c: { id: 'c', name: 'Ccc', servQty: 1, servUnit: 'serving', nut: { calories: 10 } }
  } };
  db.log = { [today]: { lunch: [
    { type: 'food', refId: 'a', amt: 1, unit: 'serving', qty: 1, time: '13:00' },
    { type: 'food', refId: 'b', amt: 1, unit: 'serving', qty: 1 },               // untimed
    { type: 'food', refId: 'c', amt: 1, unit: 'serving', qty: 1, time: '12:00' }
  ] } };
  const w = boot(seed(db));
  w.renderToday();
  const chunks = w.document.getElementById('diary').innerHTML.split('<div class="entry"').slice(1);
  const order = chunks.map(ch => ch.includes('Ccc') ? 'C' : ch.includes('Aaa') ? 'A' : ch.includes('Bbb') ? 'B' : '?').join('');
  eq(order, 'CAB', 'displayed in time order (12:00, 13:00) with the untimed entry last');
  const idx = {};
  chunks.forEach(ch => { const m = ch.match(/editEntry\('lunch',(\d+)\)/); if (!m) return; const i = Number(m[1]); if (ch.includes('Ccc')) idx.C = i; if (ch.includes('Aaa')) idx.A = i; if (ch.includes('Bbb')) idx.B = i; });
  eq(idx.C, 2, 'time-sorted row still edits its original entry (index 2)');
  eq(idx.A, 0, 'original index 0 preserved after sort');
  eq(idx.B, 1, 'untimed row keeps original index 1');
}

// sticky time hint: stays up until dismissed (tap-away / second ? / check)
{
  const w = boot(seed(FOOD));
  w.openPortion('food', 'f');
  const toast = w.document.getElementById('toast');
  const tap = (id) => w.document.getElementById(id).dispatchEvent(new w.Event('click', { bubbles: true }));

  w.explainTime();
  ok(toast.classList.contains('show'), 'hint shows on ?');
  ok(/save the exact time/.test(toast.textContent), 'hint carries the explanation');

  w.explainTime();
  ok(!toast.classList.contains('show'), 'a second ? tap closes it (toggle)');

  w.explainTime();
  tap('portionSheet');                    // tap blank space inside the sheet
  ok(!toast.classList.contains('show'), 'tapping away on blank space closes it');

  w.explainTime();
  tap('pTimeQ');                          // real tap on the ? itself
  ok(!toast.classList.contains('show'), 'real tap on ? closes the open hint');

  const before = w.document.getElementById('pTime').classList.contains('accepted');
  w.explainTime();
  tap('pTimeOk');                         // tapping the check
  ok(!toast.classList.contains('show'), 'tapping the check closes the hint');
  ok(w.document.getElementById('pTime').classList.contains('accepted') !== before, 'tapping the check also confirms/toggles the time');

  w.explainTime();
  w.toast('Saved');
  eq(toast.textContent, 'Saved', 'a normal toast supersedes the hint');
}

done('LOG TIME (optional time eaten)');
