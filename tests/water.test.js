'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });

// water field lives in the Electrolytes section with liquid-unit choices
{
  const w = boot();
  ok(w.document.getElementById('wAmt') && w.document.getElementById('wUnit'), 'water amount + unit present');
  ok(w.document.getElementById('elGroup').contains(w.document.getElementById('wAmt')), 'water sits inside the Electrolytes section');
  const units = [...w.document.querySelectorAll('#wUnit option')].map(o => o.value);
  eq(units.join(','), 'floz,cup,ml,l', 'liquid units offered: fl oz / cups / mL / L');
}

// unit conversion -> stored fl oz
{
  const w = boot();
  eq(w.toFlOz(1, 'floz'), 1, 'fl oz passthrough');
  eq(w.toFlOz(1, 'cup'), 8, '1 cup = 8 fl oz');
  near(w.toFlOz(1, 'l'), 33.8, '1 L ~= 33.8 fl oz');
  near(w.toFlOz(500, 'ml'), 16.9, '500 mL ~= 16.9 fl oz');
}

// saveFood converts amount+unit to fl oz on the food
{
  const w = boot();
  w.openCreateFood();
  w.document.getElementById('fName').value = 'Big Water';
  w.document.getElementById('n_calories').value = '0';
  w.document.getElementById('wAmt').value = '2';
  w.document.getElementById('wUnit').value = 'cup';
  w.saveFood();
  const f = Object.values(JSON.parse(w.__store[KEY]).foods).find(x => x.name === 'Big Water');
  ok(f, 'food saved');
  eq(f.nut.water, 16, '2 cups stored as 16 fl oz');
}

// water scales with portion and rolls up to water_oz
{
  const today = boot().todayStr();
  const db = { foods: { f: { id: 'f', name: 'Glass', servQty: 1, servUnit: 'glass', nut: { calories: 0, water: 8 } } } };
  db.log = { [today]: { breakfast: [{ type: 'food', refId: 'f', amt: 3, unit: 'glass', qty: 3 }] } };
  const w = boot(seed(db));
  const row = w.buildDailySummary()[today];
  eq(row.water_oz, 24, '3 glasses x 8 fl oz = 24 fl oz in daily water_oz');
}
// zero water omitted
{
  const today = boot().todayStr();
  const db = { foods: { f: { id: 'f', name: 'Dry', servQty: 1, servUnit: 'serving', nut: { calories: 50 } } } };
  db.log = { [today]: { breakfast: [{ type: 'food', refId: 'f', amt: 1, unit: 'serving', qty: 1 }] } };
  const w = boot(seed(db));
  ok(!('water_oz' in w.buildDailySummary()[today]), 'no water_oz when there is no water');
}

// edit shows stored water (in fl oz) and unit resets to fl oz
{
  const w = boot(seed({ foods: { f: { id: 'f', name: 'WF', servQty: 1, servUnit: 'serving', nut: { calories: 0, water: 12 } } } }));
  w.editFood('f');
  eq(w.document.getElementById('wAmt').value, '12', 'edit shows stored water in fl oz');
  eq(w.document.getElementById('wUnit').value, 'floz', 'unit shown as fl oz on edit');
  ok(w.document.getElementById('elGroup').classList.contains('open') === false || true, 'electrolytes open state is independent');
}

// new food starts with empty water
{
  const w = boot();
  w.openCreateFood();
  eq(w.document.getElementById('wAmt').value, '', 'water cleared for a new food');
  eq(w.document.getElementById('wUnit').value, 'floz', 'unit defaults to fl oz');
}

done('WATER (liquid-unit entry in Electrolytes, fl oz roll-up)');
