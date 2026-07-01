'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const flush = () => new Promise(r => setTimeout(r, 0));

const BANANA = {
  fdcId: 1105073, description: 'Bananas, raw', dataType: 'Foundation',
  foodNutrients: [
    { nutrientNumber: '208', unitName: 'KCAL', value: 89 },
    { nutrientNumber: '203', unitName: 'G', value: 1.09 },
    { nutrientNumber: '205', unitName: 'G', value: 22.8 },
    { nutrientNumber: '204', unitName: 'G', value: 0.33 },
    { nutrientNumber: '291', unitName: 'G', value: 2.6 },
    { nutrientNumber: '269', unitName: 'G', value: 12.2 },
    { nutrientNumber: '307', unitName: 'MG', value: 1 },
    { nutrientNumber: '306', unitName: 'MG', value: 358 }
  ]
};
const BRANDED = {
  fdcId: 555, description: 'Protein Bar', dataType: 'Branded', brandName: 'BrandX',
  servingSize: 30, servingSizeUnit: 'GRM',
  foodNutrients: [
    { nutrientNumber: '208', unitName: 'KCAL', value: 400 },  // per 100 g
    { nutrientNumber: '203', unitName: 'G', value: 33 },
    { nutrientNumber: '601', unitName: 'MG', value: 10 }
  ]
};

(async () => {
  // 1. Missing key -> prompts Settings, no fetch
  {
    let fetched = false;
    const w = boot({ fetch: () => { fetched = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({ foods: [] }) }); } });
    w.openUsdaSearch('log');
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    ok(/Settings/.test(w.document.getElementById('usdaStatus').innerHTML), 'no key -> prompts Settings');
    eq(fetched, false, 'no key -> does not call the API');
  }

  // 2. With key -> queries API (url carries query+key+dataType), renders results
  {
    let url = '';
    const w = boot({
      localStorage: { 'plate.usda.key': 'KEY123' },
      fetch: (u) => { url = u; return Promise.resolve({ ok: true, json: () => Promise.resolve({ foods: [BANANA] }) }); }
    });
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    ok(url.includes('query=banana'), 'request includes query');
    ok(url.includes('api_key=KEY123'), 'request includes the user key');
    ok(/Foundation/.test(decodeURIComponent(url)), 'request scopes dataType');
    const html = w.document.getElementById('usdaList').innerHTML;
    ok(html.includes('Bananas, raw'), 'result row shows banana');
    ok(html.includes('>89<') || html.includes('89'), 'result row shows ~89 cal (per 100 g)');

    // 3. picking maps onto the Create Food form (review-first)
    w.pickUsda(0);
    eq(w.document.getElementById('fName').value, 'Bananas, raw', 'prefill name');
    eq(w.document.getElementById('fServQty').value, '100', 'foundation -> per 100');
    eq(w.getUnitValue(), 'g', 'foundation unit g');
    eq(Number(w.document.getElementById('n_calories').value), 89, 'prefill calories 89');
    near(Number(w.document.getElementById('n_totalCarbs').value), 22.8, 'prefill carbs');
    near(Number(w.document.getElementById('n_fiber').value), 2.6, 'prefill fiber (extra field)');
    near(Number(w.document.getElementById('n_potassium').value), 358, 'prefill potassium mg');
    ok(w.document.getElementById('moreNutrients').classList.contains('open'), 'extra nutrients -> More section opened');
  }

  // 4. Branded item scales per-serving by servingSize/100 and maps unit
  {
    const w = boot({
      localStorage: { 'plate.usda.key': 'KEY123' },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ foods: [BRANDED] }) })
    });
    w.document.getElementById('usdaSearch').value = 'protein bar';
    w.runUsdaQuery();
    await flush();
    w.pickUsda(0);
    eq(w.document.getElementById('fName').value, 'Protein Bar', 'branded name');
    eq(w.document.getElementById('fBrand').value, 'BrandX', 'branded brand');
    eq(w.document.getElementById('fServQty').value, '30', 'branded servQty=30');
    eq(w.getUnitValue(), 'g', 'GRM normalized to g');
    eq(Number(w.document.getElementById('n_calories').value), 120, 'branded cal 400/100*30=120');
    near(Number(w.document.getElementById('n_protein').value), 9.9, 'branded protein 33*0.3');
  }

  // 5. Offline -> graceful message, no crash
  {
    const w = boot({
      localStorage: { 'plate.usda.key': 'KEY123' },
      navigatorOnLine: false,
      fetch: () => Promise.reject(new Error('network'))
    });
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    ok(/offline/i.test(w.document.getElementById('usdaStatus').innerHTML), 'offline -> offline message');
  }

  // 6. Error (bad key / non-ok) -> retry/Settings message
  {
    const w = boot({
      localStorage: { 'plate.usda.key': 'BAD' },
      fetch: () => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) })
    });
    w.document.getElementById('usdaSearch').value = 'banana';
    w.runUsdaQuery();
    await flush();
    ok(/key|again/i.test(w.document.getElementById('usdaStatus').innerHTML), 'http error -> check key / try again');
  }

  // 7. Settings key card reflects state + save/clear
  {
    const w = boot();
    ok(/Add a free API key/.test(w.document.getElementById('usdaBox').innerHTML), 'key card: not connected copy');
    w.document.getElementById('usdaKeyInput').value = 'NEWKEY';
    w.saveUsdaKeyFromInput();
    eq(w.usdaKey(), 'NEWKEY', 'save key from input');
    ok(/Connected/.test(w.document.getElementById('usdaBox').innerHTML), 'key card: connected copy after save');
    w.clearUsdaKey();
    eq(w.usdaKey(), '', 'clear key');
  }

  // 8. Search buttons surfaced where users look
  {
    const w = boot();
    w.openPicker('breakfast');
    ok(w.document.getElementById('pickerList').innerHTML.includes('Search the food database'), 'picker (log) shows USDA search button');
    w.nav('foods'); w.renderFoods();
    ok(w.document.getElementById('foodsList').innerHTML.includes('Search the food database'), 'Foods screen shows USDA search button');
    // meal-ingredient mode should NOT offer it (you pick existing foods there)
    w.openPickerForMeal();
    ok(!w.document.getElementById('pickerList').innerHTML.includes('Search the food database'), 'meal-ingredient picker hides USDA search');
  }

  done('USDA SEARCH');
})();
