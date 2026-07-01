'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const persisted = (w) => JSON.parse(w.__store[KEY]);
const flush = () => new Promise(r => setTimeout(r, 0));
const usdaBoot = (foods) => boot({
  localStorage: { 'plate.usda.key': 'K' },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ foods }) })
});

(async () => {
  // provenance inference + labels
  {
    const w = boot();
    eq(w.foodSource({ source: 'usda' }), 'usda', 'explicit usda');
    eq(w.foodSource({ source: 'off' }), 'off', 'explicit off');
    eq(w.foodSource({ barcode: '123' }), 'off', 'no source + barcode -> off (legacy infer)');
    eq(w.foodSource({}), 'manual', 'no source/barcode -> manual');
    eq(w.sourceLabel('usda'), 'USDA FoodData Central', 'label usda');
    eq(w.sourceLabel('off'), 'Open Food Facts', 'label off');
    eq(w.sourceLabel('manual'), 'Added by you', 'label manual');
    eq(w.sourceTag('usda'), 'USDA', 'tag usda');
    eq(w.sourceTag('off'), 'Open Food Facts', 'tag off');
    eq(w.sourceTag('manual'), '', 'manual -> no tag (no clutter)');
  }

  // saveFood stamps source: manual
  {
    const w = boot();
    w.openCreateFood(false);
    w.document.getElementById('fName').value = 'Homemade Soup';
    w.document.getElementById('n_calories').value = '120';
    w.saveFood();
    eq(Object.values(persisted(w).foods)[0].source, 'manual', 'manual create -> source manual');
  }

  // saveFood stamps source: USDA (via prefill) + fdcId
  {
    const w = usdaBoot([{ fdcId: 1105073, description: 'Bananas, raw', dataType: 'Foundation', foodNutrients: [{ nutrientNumber: '208', value: 89 }] }]);
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    w.pickUsda(0);
    w.saveFood();
    const f = Object.values(persisted(w).foods)[0];
    eq(f.source, 'usda', 'USDA prefill -> source usda');
    eq(f.fdcId, 1105073, 'USDA fdcId stored');
  }

  // editFood preserves source
  {
    const w = boot(seed({ foods: { u: { id: 'u', name: 'Bananas, raw', source: 'usda', fdcId: 1105073, servQty: 100, servUnit: 'g', nut: { calories: 89 } } } }));
    w.editFood('u');
    w.document.getElementById('fName').value = 'Bananas, raw (edited)';
    w.saveFood();
    const f = persisted(w).foods['u'];
    eq(f.source, 'usda', 'edit preserves source usda');
    eq(f.fdcId, 1105073, 'edit preserves fdcId');
  }

  // portion sheet shows source
  {
    const w = boot(seed({
      foods: {
        u: { id: 'u', name: 'Bananas, raw', source: 'usda', servQty: 100, servUnit: 'g', nut: { calories: 89 } },
        o: { id: 'o', name: 'Yogurt', source: 'off', barcode: '555', servQty: 170, servUnit: 'g', nut: { calories: 100 } },
        m: { id: 'm', name: 'My Eggs', source: 'manual', servQty: 1, servUnit: 'egg', nut: { calories: 70 } }
      },
      meals: { ml: { id: 'ml', name: 'Bowl', comps: [] } }
    }));
    w.openPortion('food', 'u'); eq(w.document.getElementById('pSource').textContent, 'Source: USDA FoodData Central', 'portion: USDA source');
    w.openPortion('food', 'o'); eq(w.document.getElementById('pSource').textContent, 'Source: Open Food Facts', 'portion: OFF source');
    w.openPortion('food', 'm'); eq(w.document.getElementById('pSource').textContent, 'Source: Added by you', 'portion: manual source');
    w.openPortion('meal', 'ml'); eq(w.document.getElementById('pSource').textContent, 'Your meal', 'portion: meal label');
  }

  // picker + library rows: source tag for db foods, none for manual
  {
    const w = boot(seed({ foods: {
      u: { id: 'u', name: 'Bananas', source: 'usda', servQty: 100, servUnit: 'g', nut: { calories: 89 } },
      m: { id: 'm', name: 'My Soup', source: 'manual', servQty: 1, servUnit: 'serving', nut: { calories: 120 } }
    } }));
    w.openPicker('breakfast');
    const ph = w.document.getElementById('pickerList').innerHTML;
    ok(ph.includes('USDA'), 'picker row shows USDA tag');
    ok(ph.includes('My Soup') && !/My Soup[\s\S]{0,60}Added by you/.test(ph), 'manual food has no source clutter in picker');
    w.nav('foods'); w.renderFoods();
    ok(w.document.getElementById('foodsList').innerHTML.includes('USDA'), 'library row shows USDA tag');
  }

  // USDA results show dataType for disambiguation
  {
    const w = usdaBoot([
      { fdcId: 1, description: 'Bananas, raw', dataType: 'Foundation', foodNutrients: [{ nutrientNumber: '208', value: 89 }] },
      { fdcId: 2, description: 'Bananas, raw', dataType: 'SR Legacy', foodNutrients: [{ nutrientNumber: '208', value: 89 }] }
    ]);
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    const h = w.document.getElementById('usdaList').innerHTML;
    ok(h.includes('Foundation') && h.includes('SR Legacy'), 'USDA results show dataType to tell duplicates apart');
  }

  done('SOURCE / PROVENANCE');
})();
