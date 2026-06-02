'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY = 'plate.data.v1';
const seed = (db) => ({ localStorage: { [KEY]: JSON.stringify(db) } });
const persisted = (w) => JSON.parse(w.__store[KEY]);
const flush = () => new Promise(r => setTimeout(r, 0));
const resolved = (body, okFlag = true) => () => Promise.resolve({ ok: okFlag, status: okFlag ? 200 : 500, json: () => Promise.resolve(body) });

(async () => {
  // 1. FOUND (status 1) -> prefills the form; saving tags source 'off' + keeps barcode
  {
    const product = { product_name: 'Nutella', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }, serving_quantity: 15, serving_quantity_unit: 'g' };
    const w = boot({ fetch: resolved({ status: 1, product }) });
    w.lookupBarcode('3017624010701');
    await flush(); await flush();
    eq(w.document.getElementById('fName').value, 'Nutella', 'found -> form prefilled with product name');
    w.saveFood();
    const f = Object.values(persisted(w).foods)[0];
    eq(f.source, 'off', 'found+save -> source off');
    eq(f.barcode, '3017624010701', 'found+save -> barcode kept');
  }

  // 2. NOT FOUND (status 0) -> explicit message + manual-add button, spinner gone, guard released
  {
    const w = boot({ fetch: resolved({ status: 0, status_verbose: 'product not found' }) });
    w.lookupBarcode('0000000000000');
    await flush(); await flush();
    const html = w.document.getElementById('scanStatus').innerHTML;
    ok(/not in the database/i.test(html), 'not-found -> says "Not in the database"');
    ok(/add it manually/i.test(html), 'not-found -> offers manual-add button');
    ok(!/Looking up/i.test(html) && !html.includes('spinner'), 'not-found -> spinner cleared (not stuck)');

    // the manual-add path opens the form, keeps the barcode, but tags it MANUAL (data is user-entered)
    w.addScannedManually();
    w.document.getElementById('fName').value = 'Generic Cereal';
    w.document.getElementById('n_calories').value = '380';
    w.saveFood();
    const f = Object.values(persisted(w).foods)[0];
    eq(f.barcode, '0000000000000', 'manual-add keeps the scanned barcode');
    eq(f.source, 'manual', 'manual-add tags source MANUAL, not off');
  }

  // 3. Guard released after not-found: a second scan actually runs (not blocked)
  {
    let calls = 0;
    const w = boot({ fetch: () => { calls++; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 0 }) }); } });
    w.onScanFound('111111111111');   // sets scanHandling=true then looks up
    await flush(); await flush();
    eq(calls, 1, 'first scan triggered one lookup');
    w.onScanFound('222222222222');   // should NOT be blocked now
    await flush(); await flush();
    eq(calls, 2, 'second scan runs -> scanHandling was released');
  }

  // 4. HTTP error (non-ok) -> graceful "couldn't reach" message, no crash
  {
    const w = boot({ fetch: resolved({}, false) });
    w.lookupBarcode('123');
    await flush(); await flush();
    ok(/couldn.t reach|offline/i.test(w.document.getElementById('scanStatus').innerHTML), 'http error -> offline/try-again message');
  }

  // 5. Timeout/abort -> distinct "took too long" message
  {
    const w = boot({ fetch: () => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) });
    w.lookupBarcode('123');
    await flush(); await flush();
    ok(/too long|slow/i.test(w.document.getElementById('scanStatus').innerHTML), 'abort/timeout -> "took too long" message');
  }

  // 6. Already in library -> no network call at all, jumps to logging
  {
    let called = false;
    const w = boot({
      localStorage: { [KEY]: JSON.stringify({ foods: { x: { id: 'x', name: 'Saved Bar', barcode: '999', servQty: 1, servUnit: 'serving', nut: { calories: 200 } } } }) },
      fetch: () => { called = true; return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); }
    });
    w.lookupBarcode('999');
    eq(called, false, 'local barcode match -> no API call');
    await new Promise(r => setTimeout(r, 260));   // local match opens portion after 200ms
    eq(w.document.getElementById('pName').textContent, 'Saved Bar', 'local match opens the log sheet for that food');
  }

  done('SCAN / BARCODE');
})();
