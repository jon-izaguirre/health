'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });

// USDA Foundation banana, per 100 g (no servingSize -> 100 g basis)
const banana = {
  fdcId: 1105314,
  description: 'Bananas, overripe, raw',
  dataType: 'Foundation',
  foodNutrients: [
    { nutrientNumber: '208', value: 85 },    // calories
    { nutrientNumber: '203', value: 0.7 },   // protein
    { nutrientNumber: '205', value: 20.1 },  // total carbs
    { nutrientNumber: '204', value: 0.2 }    // total fat
  ]
};
const val = (w, id) => w.document.getElementById(id).value;

// 1. USDA prefill -> change serving 100 -> 115 rescales per-serving nutrition
{
  const w = boot();
  w.prefillFromUSDA(banana);
  eq(val(w, 'fServQty'), '100', 'prefill lands at 100 g basis');
  eq(val(w, 'n_calories'), '85', 'prefill calories 85 (per 100 g)');

  w.document.getElementById('fServQty').value = '115';
  w.onServingSizeChange();
  eq(val(w, 'n_calories'), '98', 'calories rescale to 98 (85 × 1.15)');
  eq(val(w, 'n_totalCarbs'), '23.1', 'carbs rescale to 23.1');
  eq(val(w, 'n_protein'), '0.8', 'protein rescale to 0.8');
  eq(val(w, 'n_totalFat'), '0.2', 'fat rescale to 0.2');
}

// 2. Save persists the SCALED values at the 115 g serving
{
  const w = boot();
  w.prefillFromUSDA(banana);
  w.document.getElementById('fServQty').value = '115';
  w.onServingSizeChange();
  w.saveFood();
  const f = Object.values(JSON.parse(w.__store[KEY]).foods)[0];
  eq(f.servQty, 115, 'saved serving size is 115');
  eq(f.nut.calories, 98, 'saved calories scaled to 98 (no more silent 115g=85cal)');
  near(f.nut.totalCarbs, 23.1, 'saved carbs scaled', 0.05);
}

// 3. Multiple serving changes net out correctly (100 -> 115 -> 120)
{
  const w = boot();
  w.prefillFromUSDA(banana);
  w.document.getElementById('fServQty').value = '115'; w.onServingSizeChange();
  w.document.getElementById('fServQty').value = '120'; w.onServingSizeChange();
  eq(val(w, 'n_calories'), '102', '100→115→120 nets calories 102 (≈85 × 1.2)');
}

// 4. MANUAL entry does NOT auto-scale (you type the label values yourself)
{
  const w = boot();
  w.openCreateFood(false);
  w.document.getElementById('fName').value = 'Hand-typed food';
  w.document.getElementById('fServQty').value = '100';
  w.document.getElementById('n_calories').value = '85';
  w.document.getElementById('fServQty').value = '115';
  w.onServingSizeChange();
  eq(val(w, 'n_calories'), '85', 'manual: changing serving leaves typed values untouched');
}

// 5. EDITING an existing food does NOT auto-scale
{
  const w = boot(seed({ foods: { f1: { id: 'f1', name: 'X', servQty: 100, servUnit: 'g', nut: { calories: 85, totalCarbs: 20.1 } } } }));
  w.editFood('f1');
  eq(val(w, 'n_calories'), '85', 'edit loads existing 85');
  w.document.getElementById('fServQty').value = '115';
  w.onServingSizeChange();
  eq(val(w, 'n_calories'), '85', 'edit: changing serving leaves values untouched');
}

// 6. Blank / invalid serving is safe; a later valid value still scales from the original basis
{
  const w = boot();
  w.prefillFromUSDA(banana);
  w.document.getElementById('fServQty').value = '';
  w.onServingSizeChange();
  eq(val(w, 'n_calories'), '85', 'blank serving leaves values untouched');
  w.document.getElementById('fServQty').value = '115';
  w.onServingSizeChange();
  eq(val(w, 'n_calories'), '98', 'after blank then 115, scales from the 100 g basis to 98');
}

done('SERVING-SIZE AUTO-SCALE (database foods)');
