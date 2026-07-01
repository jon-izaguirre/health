'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const persisted = (w) => JSON.parse(w.__store[KEY]);
const today = boot().todayStr();

// ===== SOFT-DELETE =====
{
  // food: delete hides it but keeps history intact
  const w = boot(seed({
    foods: { f1: { id: 'f1', name: 'Greek Yogurt', servQty: 170, servUnit: 'g', nut: { calories: 100, protein: 17 } } },
    log: { [today]: { breakfast: [{ type: 'food', refId: 'f1', amt: 170, unit: 'g', qty: 1 }] } }
  }));
  const calsBefore = w.dayTotals(today).calories;
  w.editFood('f1');           // sets editingFood
  w.deleteFood();             // confirm() defaults true in harness
  const f = persisted(w).foods.f1;
  ok(f && f.deleted === true, 'deleteFood soft-deletes (record kept, flagged)');
  ok(!!f.deletedAt, 'deletedAt stamped');
  near(w.dayTotals(today).calories, calsBefore, 'past day keeps its calories after delete');
  w.setFoodsTab('foods');
  ok(!w.document.getElementById('foodsList').innerHTML.includes('Greek Yogurt'), 'deleted food hidden from Foods list');
  w.openPicker('lunch');
  ok(!w.document.getElementById('pickerList').innerHTML.includes('Greek Yogurt'), 'deleted food hidden from picker');
}
{
  // findFoodByBarcode skips deleted (so a re-scan looks it up fresh)
  const w = boot(seed({ foods: { f1: { id: 'f1', name: 'X', barcode: '12345', deleted: true, servQty: 1, servUnit: 'g', nut: { calories: 1 } } } }));
  eq(w.findFoodByBarcode('12345'), undefined, 'deleted barcode not matched locally');
}
{
  // meal soft-delete
  const w = boot(seed({ meals: { m1: { id: 'm1', name: 'Shake', comps: [] } } }));
  w.editMeal('m1'); w.deleteMeal();
  ok(persisted(w).meals.m1.deleted === true, 'deleteMeal soft-deletes');
  w.setFoodsTab('meals');
  ok(!w.document.getElementById('foodsList').innerHTML.includes('Shake'), 'deleted meal hidden from Meals tab');
}

// ===== FIBER BREAKDOWN =====
{
  const w = boot();
  const f = { servQty: 100, servUnit: 'g', nut: { calories: 100, fiber: 5, fiberSoluble: 2, fiberInsoluble: 3 } };
  eq(w.foodNut(f, 2).fiberSoluble, 4, 'foodNut scales soluble fiber');
  eq(w.foodNut(f, 2).fiberInsoluble, 6, 'foodNut scales insoluble fiber');
}
{
  // daily roll-up: present when >0, omitted when 0
  const d1 = '2026-02-01', d2 = '2026-02-02';
  const w = boot(seed({
    foods: {
      a: { id: 'a', name: 'Oats', servQty: 100, servUnit: 'g', nut: { calories: 150, fiber: 10, fiberSoluble: 4, fiberInsoluble: 6 } },
      b: { id: 'b', name: 'Rice', servQty: 100, servUnit: 'g', nut: { calories: 130, fiber: 1 } }
    },
    log: {
      [d1]: { breakfast: [{ type: 'food', refId: 'a', amt: 100, unit: 'g', qty: 1 }] },
      [d2]: { breakfast: [{ type: 'food', refId: 'b', amt: 100, unit: 'g', qty: 1 }] }
    }
  }));
  const daily = w.buildDailySummary();
  near(daily[d1].fiber_g, 10, 'total fiber stays canonical in daily');
  near(daily[d1].fiber_soluble_g, 4, 'soluble fiber rolls up to daily');
  near(daily[d1].fiber_insoluble_g, 6, 'insoluble fiber rolls up to daily');
  ok(!('fiber_soluble_g' in daily[d2]), 'sub-fiber omitted from days without it (lean daily layer)');
}
{
  // auto-sum into total only when total is blank; never overrides a typed total
  const w = boot();
  w.openCreateFood(false);
  w.document.getElementById('n_fiberSoluble').value = '2';
  w.document.getElementById('n_fiberInsoluble').value = '3';
  w.document.getElementById('n_fiber').value = '';
  w.onFiberSubInput();
  eq(w.document.getElementById('n_fiber').value, '5', 'blank total auto-fills to soluble+insoluble');
  eq(w.document.getElementById('fiberHint').textContent, '', 'no warning when sum matches');

  w.document.getElementById('n_fiber').value = '10';
  w.onFiberSubInput();
  eq(w.document.getElementById('n_fiber').value, '10', 'typed total is never overridden');

  w.document.getElementById('n_fiber').value = '4';
  w.onFiberSubInput();
  ok(/more than the total/i.test(w.document.getElementById('fiberHint').textContent), 'warns when soluble+insoluble exceed total');
}
{
  // USDA maps soluble(295)/insoluble(297)
  const w = boot();
  const p = w.usdaPer100([{ nutrientNumber: '295', value: 1.5 }, { nutrientNumber: '297', value: 2.5 }]);
  near(p.fiberSoluble, 1.5, 'USDA 295 -> soluble');
  near(p.fiberInsoluble, 2.5, 'USDA 297 -> insoluble');
}
{
  // editing a food that has sub-fiber opens the breakdown
  const w = boot(seed({ foods: { fx: { id: 'fx', name: 'Psyllium', servQty: 6, servUnit: 'g', nut: { calories: 20, fiber: 5, fiberSoluble: 4, fiberInsoluble: 1 } } } }));
  w.editFood('fx');
  eq(w.document.getElementById('fiberBreak').style.display, 'block', 'edit opens breakdown when sub-fiber present');
}

// ===== VERSION LABEL =====
{
  const w = boot();
  const t = w.document.getElementById('buildNote').textContent;
  ok(/build/i.test(t) && t.includes('2026-06-02.10'), 'Settings shows a build label with the version string');
}

// ===== SETTINGS ORDER: Cloud Sync -> Daily Goals -> Food Search =====
{
  const w = boot();
  const h = w.document.getElementById('s-settings').innerHTML;
  ok(h.indexOf('Cloud Sync') < h.indexOf('Daily Goals'), 'Cloud Sync above Daily Goals');
  ok(h.indexOf('Daily Goals') < h.indexOf('Food Search'), 'Daily Goals above Food Search');
  ok(h.indexOf('Food Search') < h.indexOf('Your Data'), 'Food Search above Your Data');
}

done('DELIVERY 2A: SOFT-DELETE / FIBER / VERSION / SETTINGS ORDER');
