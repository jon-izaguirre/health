'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const open = (w, id) => w.document.getElementById(id + 'Sheet').classList.contains('open');
const LIB = {
  foods: {
    f1: { id: 'f1', name: 'Banana', servQty: 118, servUnit: 'g', nut: { calories: 105 } },
    f2: { id: 'f2', name: 'ISO100 Whey Protein Isolate Vanilla', servQty: 30, servUnit: 'g', nut: { calories: 110, protein: 25 } },
    f3: { id: 'f3', name: 'Metamucil Sugar-Free Psyllium Fiber', servQty: 6, servUnit: 'g', nut: { calories: 30, totalCarbs: 12 } }
  },
  meals: { m1: { id: 'm1', name: 'Protein Shake', comps: [{ foodId: 'f2', qty: 1 }, { foodId: 'f3', qty: 1 }] } }
};

// ===== #4 stacking bug =====
{
  const w = boot(seed(LIB));
  w.openCreateMeal();
  ok(open(w, 'meal'), 'meal sheet opens for new meal');
  w.openPickerForMeal();
  ok(!open(w, 'meal'), 'opening ingredient picker CLOSES the meal sheet (no stacking)');
  ok(open(w, 'picker'), 'ingredient picker is open');
  eq(w.document.getElementById('pickScanBtn').style.display, 'none', 'meal mode hides Scan button (log-only)');
  eq(w.document.getElementById('pickCreateBtn').style.display, 'none', 'meal mode hides Create-food button');

  // pick an ingredient -> picker closes, meal reopens with the ingredient
  w.pickItem('food', 'f2');
  ok(!open(w, 'picker'), 'after pick: picker closed');
  ok(open(w, 'meal'), 'after pick: meal sheet reopened');
  ok(w.document.getElementById('mealComps').innerHTML.includes('ISO100'), 'picked ingredient now in the meal');
}
{
  // cancel path: X / scrim reopens the meal sheet so the draft isn't lost
  const w = boot(seed(LIB));
  w.openCreateMeal(); w.openPickerForMeal();
  w.cancelPicker();
  ok(!open(w, 'picker') && open(w, 'meal'), 'cancel ingredient picker -> meal sheet restored');
}
{
  // log-mode picker still shows scan + create
  const w = boot(seed(LIB));
  w.openPicker('breakfast');
  eq(w.document.getElementById('pickScanBtn').style.display, '', 'log mode shows Scan button');
  eq(w.document.getElementById('pickCreateBtn').style.display, '', 'log mode shows Create-food button');
}

// ===== #3 Foods / Meals tabs =====
{
  const w = boot(seed(LIB));
  w.setFoodsTab('foods');
  let h = w.document.getElementById('foodsList').innerHTML;
  ok(h.includes('Banana'), 'Foods tab lists foods');
  ok(!h.includes('Protein Shake'), 'Foods tab excludes meals');
  ok(h.includes('Search the food database'), 'Foods tab keeps USDA search');
  ok(w.document.getElementById('segFoods').classList.contains('sel') && !w.document.getElementById('segMeals').classList.contains('sel'), 'Foods tab marked active');

  w.setFoodsTab('meals');
  h = w.document.getElementById('foodsList').innerHTML;
  ok(h.includes('Protein Shake'), 'Meals tab lists meals');
  ok(!h.includes('Banana'), 'Meals tab excludes foods');
  ok(!h.includes('Search the food database'), 'Meals tab drops USDA search (foods-only feature)');
  ok(w.document.getElementById('segMeals').classList.contains('sel') && !w.document.getElementById('segFoods').classList.contains('sel'), 'Meals tab marked active');
}

// ===== #2 ingredients shown in Edit Entry sheet for a logged meal =====
{
  const w = boot(seed(LIB));
  w.openPortion('meal', 'm1');
  const ing = w.document.getElementById('pIngredients').innerHTML;
  ok(ing.includes('ISO100 Whey Protein Isolate Vanilla'), 'meal entry shows ingredient #1');
  ok(ing.includes('Metamucil Sugar-Free Psyllium Fiber'), 'meal entry shows ingredient #2');
  eq(w.document.getElementById('pServingDesc').textContent, '2 ingredients', 'still shows the count');

  // a plain food entry shows no ingredient list
  w.openPortion('food', 'f1');
  eq(w.document.getElementById('pIngredients').innerHTML, '', 'plain food entry has no ingredient list');
}

done('UI: MEAL STACKING / TABS / INGREDIENTS');
