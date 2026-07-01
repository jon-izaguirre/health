'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');

const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });

let w;
try { w = boot(); ok(true, 'boots headlessly without throwing'); }
catch (e) { ok(false, 'boots headlessly without throwing -> ' + e.message); throw e; }

ok(typeof w.foodNut === 'function', 'foodNut defined');
ok(typeof w.save === 'function', 'save defined');
ok(typeof w.ymd === 'function', 'ymd defined');
ok(typeof w.entryAmountText === 'function', 'entryAmountText defined');

eq(w.ymd(new Date(2026, 0, 5)), '2026-01-05', 'ymd formats local date');

const db = w.blankDB();
ok(db.foods && db.meals && db.log && db.goals, 'blankDB has core collections');
eq(db.updatedAt, '', 'blankDB.updatedAt empty');

const food = { name: 'X', servQty: 100, servUnit: 'g', nut: { calories: 200, protein: 10 } };
eq(w.foodNut(food, 2).calories, 400, 'foodNut scales calories x2');
eq(w.foodNut(food, 0.5).protein, 5, 'foodNut scales protein x0.5');

eq(w.esc('<b>&"'), '&lt;b&gt;&amp;&quot;', 'esc escapes < > & "');

w.save();
const persisted = JSON.parse(w.__store[KEY]);
ok(!!persisted.updatedAt, 'save stamps updatedAt in persisted DB');

{
  const w2 = boot(seed({ foods: { f1: { id: 'f1', name: 'Rice', servQty: 100, servUnit: 'g', nut: { calories: 130 } } } }));
  eq(w2.entryAmountText({ type: 'food', refId: 'f1', qty: 1.5 }), '150 g', 'entryAmountText falls back to food unit (g)');
  eq(w2.entryAmountText({ type: 'food', refId: 'f1', amt: 200, unit: 'g' }), '200 g', 'entryAmountText uses entry amt+unit');
}

{
  const w3 = boot(seed({ meals: { m1: { id: 'm1', name: 'Bowl', comps: [] } } }));
  eq(w3.entryAmountText({ type: 'meal', refId: 'm1', qty: 2 }), '2 servings', 'meal -> 2 servings');
  eq(w3.entryAmountText({ type: 'meal', refId: 'm1', qty: 1 }), '1 serving', 'meal -> 1 serving');
}

eq(w.normalizeUnit('grams'), 'g', 'normalizeUnit grams->g');
eq(w.normalizeUnit('ML'), 'mL', 'normalizeUnit ML->mL');

{
  const date = '2026-01-10';
  const w4 = boot(seed({
    foods: { f1: { id: 'f1', name: 'Rice', servQty: 100, servUnit: 'g', nut: { calories: 130, protein: 3 } } },
    log: { [date]: { breakfast: [{ type: 'food', refId: 'f1', amt: 200, unit: 'g', qty: 2 }] } }
  }));
  near(w4.dayTotals(date).calories, 260, 'dayTotals sums calories (200g rice)');
}

done('BASELINE');
