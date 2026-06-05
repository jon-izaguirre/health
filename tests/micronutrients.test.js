'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });

// the full panel is generated with labels + units
{
  const w = boot();
  const inputs = [...w.document.querySelectorAll('#microGrid input[id^="n_"]')];
  eq(inputs.length, 18, 'all 18 micronutrient fields generated');
  const byLabel = {};
  inputs.forEach(i => { byLabel[i.id.replace('n_', '')] = i.closest('.field').querySelector('label').textContent; });
  ok(/Vitamin B12 \(mcg\)/.test(byLabel.b12), 'B12 labelled in mcg');
  ok(/Zinc \(mg\)/.test(byLabel.zinc), 'Zinc labelled in mg');
  ok(/Folate \(B9\) \(mcg\)/.test(byLabel.b9), 'Folate labelled');
  ok(!w.document.getElementById('microGroup').classList.contains('open'), 'micronutrients collapsed by default');
}

// foodNut scales micros
{
  const w = boot();
  const n = w.foodNut({ nut: { zinc: 5, b12: 2.4, selenium: 30 } }, 3);
  eq(n.zinc, 15, 'zinc scales'); near(n.b12, 7.2, 'b12 scales'); eq(n.selenium, 90, 'selenium scales');
}

// saveFood persists micros
{
  const w = boot();
  w.openCreateFood();
  w.document.getElementById('fName').value = 'MicroFood';
  w.document.getElementById('n_calories').value = '100';
  w.document.getElementById('n_zinc').value = '8';
  w.document.getElementById('n_b12').value = '2.4';
  w.document.getElementById('n_vitK').value = '90';
  w.document.getElementById('n_iodine').value = '150';
  w.saveFood();
  const f = Object.values(JSON.parse(w.__store[KEY]).foods).find(x => x.name === 'MicroFood');
  ok(f, 'food saved');
  eq(f.nut.zinc, 8, 'zinc stored'); eq(f.nut.b12, 2.4, 'b12 stored');
  eq(f.nut.vitK, 90, 'vitK stored'); eq(f.nut.iodine, 150, 'iodine stored');
}

// edit auto-opens micronutrients when a value is present; populates it
{
  const w = boot(seed({ foods: { f: { id: 'f', name: 'Z', servQty: 1, servUnit: 'serving', nut: { calories: 10, zinc: 6 } } } }));
  w.editFood('f');
  ok(w.document.getElementById('microGroup').classList.contains('open'), 'micronutrients open when a micro is present');
  eq(w.document.getElementById('n_zinc').value, '6', 'zinc populated on edit');
}
{
  const w = boot(seed({ foods: { f: { id: 'f', name: 'Plain', servQty: 1, servUnit: 'serving', nut: { calories: 10 } } } }));
  w.editFood('f');
  ok(!w.document.getElementById('microGroup').classList.contains('open'), 'micronutrients stay collapsed when none present');
}

// daily roll-up uses spec registry keys, omits zeros
{
  const today = boot().todayStr();
  const db = { foods: { f: { id: 'f', name: 'X', servQty: 1, servUnit: 'serving', nut: { calories: 100, zinc: 8, b12: 2.4, vitK: 90, iodine: 150, copper: 0 } } } };
  db.log = { [today]: { breakfast: [{ type: 'food', refId: 'f', amt: 1, unit: 'serving', qty: 1 }] } };
  const w = boot(seed(db));
  const row = w.buildDailySummary()[today];
  eq(row.zinc_mg, 8, 'zinc_mg rolled up');
  eq(row.vit_b12_mcg, 2.4, 'vit_b12_mcg rolled up (decimal preserved)');
  eq(row.vit_k_mcg, 90, 'vit_k_mcg rolled up');
  eq(row.iodine_mcg, 150, 'iodine_mcg rolled up');
  ok(!('copper_mg' in row), 'zero copper omitted');
}

// USDA maps the standard micros
{
  const w = boot();
  const per100 = w.usdaPer100([
    { nutrientNumber: '323', value: 1.2 }, { nutrientNumber: '430', value: 4 },
    { nutrientNumber: '404', value: 0.5 }, { nutrientNumber: '418', value: 1.1 },
    { nutrientNumber: '309', value: 6 }, { nutrientNumber: '317', value: 25 }
  ]);
  eq(per100.vitE, 1.2, '323 -> vitE'); eq(per100.vitK, 4, '430 -> vitK');
  eq(per100.b1, 0.5, '404 -> thiamin'); eq(per100.b12, 1.1, '418 -> b12');
  eq(per100.zinc, 6, '309 -> zinc'); eq(per100.selenium, 25, '317 -> selenium');
}

done('MICRONUTRIENTS (full vitamin + trace-mineral panel)');
