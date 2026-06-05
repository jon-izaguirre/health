'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const persisted = (w) => JSON.parse(w.__store[KEY]);

(async () => {
  // ===== ISSUE 1: nutrition fields follow exact FDA Nutrition Facts order =====
  {
    const w = boot();
    const ids = [...w.document.querySelectorAll('#foodSheet input[id^="n_"]')].map(e => e.id.replace('n_', ''));
    const fda = ['calories','totalFat','satFat','transFat','polyFat','monoFat','cholesterol','sodium','totalCarbs','fiber','fiberSoluble','fiberInsoluble','sugars','addedSugars','sugarAlcohols','protein','vitD','calcium','iron','potassium','vitA','vitC','magnesium','chloride','phosphorus','bicarbonate','vitE','vitK','b1','b2','b3','b5','b6','b7','b9','b12','choline','zinc','copper','manganese','selenium','iodine','chromium','molybdenum'];
    eq(ids.join(','), fda.join(','), 'nutrition fields in FDA label order, then electrolyte-only, then micronutrient fields');
    // fiber breakdown toggle sits inside the Dietary Fiber field (not under Potassium)
    const fiberField = w.document.getElementById('n_fiber').closest('.field');
    ok(fiberField && fiberField.querySelector('#fiberToggle'), 'soluble/insoluble toggle lives under the Dietary Fiber field');
  }

  // ===== ISSUE 2: tapping a nutrition field selects its whole value (text inputs for iOS) =====
  {
    const w = boot();
    const el = w.document.getElementById('n_calories');
    eq(el.type, 'text', 'nutrition input is type=text (reliably selectable on iOS)');
    el.value = '85';
    el.dispatchEvent(new w.Event('focus'));
    await sleep(8);
    eq(el.selectionStart, 0, 'focus selects from start');
    eq(el.selectionEnd, 2, 'focus selects the whole value');
    const nm = w.document.getElementById('fName');
    ok(!nm.hasAttribute('inputmode'), 'name field is excluded from select-on-focus');
  }

  // ===== ISSUE 4: meal ingredient shows amount in the food's unit, not a raw serving count =====
  {
    const w = boot(seed({ foods: { m: { id: 'm', name: 'Metamucil', servQty: 11.6, servUnit: 'g', nut: { calories: 30, totalCarbs: 10 } } } }));
    w.openCreateMeal();
    w.addMealComp('m');
    const h = w.document.getElementById('mealComps').innerHTML;
    ok(h.includes('value="11.6"'), 'ingredient shows 11.6 g (one serving), not raw 1');
    ok(h.includes('>g</span>'), 'unit label is g');
    ok(/30 cal/.test(h), 'calories correct: 30 for one 11.6 g serving');

    w.setCompQty(0, '23.2'); // two servings' worth, in grams
    const h2 = w.document.getElementById('mealComps').innerHTML;
    ok(h2.includes('value="23.2"'), 'edited amount (23.2 g) preserved');
    ok(/60 cal/.test(h2), 'calories scale with the amount (60 for 23.2 g)');
    ok(w.document.getElementById('mealNutPrev').innerHTML.includes('>60<'), 'meal total reflects the corrected amount');

    w.document.getElementById('mName').value = 'Fiber Shake';
    w.saveMeal();
    const meal = Object.values(persisted(w).meals)[0];
    eq(meal.comps[0].qty, 2, 'saved ingredient qty is the serving multiplier (2), model unchanged');
  }
  {
    const w = boot(seed({ foods: { a: { id: 'a', name: 'Egg', servQty: 1, servUnit: '', nut: { calories: 70 } } } }));
    w.openCreateMeal();
    w.addMealComp('a');
    const h = w.document.getElementById('mealComps').innerHTML;
    ok(h.includes('value="1"'), 'unitless food shows serving count 1');
    ok(h.includes('>srv</span>'), 'unitless food labeled srv');
  }

  // ===== ISSUE 3: create a new food from inside the meal builder =====
  {
    const w = boot();
    w.openCreateMeal();
    w.document.getElementById('mName').value = 'Test Meal';
    w.openPickerForMeal();
    ok(w.document.getElementById('pickCreateBtn').style.display !== 'none', 'Create-a-new-food button shown in meal mode');
    ok(w.document.getElementById('pickScanBtn').style.display === 'none', 'Scan button stays hidden in meal mode');

    w.createFoodFromPicker();
    ok(w.document.getElementById('foodSheet').classList.contains('open'), 'create-food sheet opens from the meal picker');
    w.document.getElementById('fName').value = 'New Ingredient';
    w.document.getElementById('n_calories').value = '50';
    w.document.getElementById('fServQty').value = '10';
    w.setUnitValue('g');
    w.saveFood();
    await sleep(320);
    const comps = w.document.getElementById('mealComps').innerHTML;
    ok(/New Ingredient/.test(comps), 'newly created food is added to the meal as an ingredient');
    ok(/50 cal/.test(comps), 'ingredient carries its calories');
    ok(w.document.getElementById('mealSheet').classList.contains('open'), 'returns to the meal sheet after saving');
    ok(Object.values(persisted(w).foods).some(f => f.name === 'New Ingredient'), 'food also saved to the library');
  }
  {
    const w = boot();
    w.openCreateMeal();
    w.openPickerForMeal();
    w.createFoodFromPicker();
    w.closeFoodSheet();
    await sleep(320);
    ok(w.document.getElementById('mealSheet').classList.contains('open'), 'cancel returns to the meal sheet (draft preserved)');
  }
  {
    const w = boot();
    w.openPicker('breakfast');
    w.createFoodFromPicker();
    ok(w.document.getElementById('foodSheet').classList.contains('open'), 'log-mode Create still opens the create-food sheet');
  }

  done('MEAL/FOOD FLOW: fiber placement / select-on-focus / create-in-meal / ingredient units');
})();
