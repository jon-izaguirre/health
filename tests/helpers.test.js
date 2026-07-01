'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const w = boot();

// --- pluralize (display only) ---
eq(w.pluralizeUnit('serving', 2), 'servings', 'serving->servings @2');
eq(w.pluralizeUnit('serving', 1), 'serving', 'serving stays @1');
eq(w.pluralizeUnit('bottle', 2), 'bottles', 'bottle->bottles');
eq(w.pluralizeUnit('egg', 3), 'eggs', 'egg->eggs');
eq(w.pluralizeUnit('slice', 2), 'slices', 'slice->slices');
eq(w.pluralizeUnit('g', 200), 'g', 'g stays singular (measured)');
eq(w.pluralizeUnit('mL', 325), 'mL', 'mL stays singular (measured)');
eq(w.pluralizeUnit('oz', 4), 'oz', 'oz stays singular');
eq(w.pluralizeUnit('blorp', 5), 'blorp', 'unknown unit stays singular (no guessing)');

// --- entry pluralization end-to-end via entryAmountText ---
{
  const w2 = boot({ localStorage: { 'plate.data.v1': JSON.stringify({
    foods: { b: { id:'b', name:'Water', servQty:1, servUnit:'bottle', nut:{calories:0} } }
  }) } });
  eq(w2.entryAmountText({type:'food',refId:'b',amt:2,unit:'bottle'}), '2 bottles', 'diary: 2 bottles');
  eq(w2.entryAmountText({type:'food',refId:'b',amt:1,unit:'bottle'}), '1 bottle', 'diary: 1 bottle');
}

// --- brand helper ---
{
  const w3 = boot({ localStorage: { 'plate.data.v1': JSON.stringify({
    foods: { p: { id:'p', name:'Shake', brand:'Premier Protein', servQty:325, servUnit:'mL', nut:{calories:160} } },
    meals: { m:{ id:'m', name:'Bowl', comps:[] } }
  }) } });
  eq(w3.entryBrand({type:'food',refId:'p'}), 'Premier Protein', 'entryBrand returns food brand');
  eq(w3.entryBrand({type:'meal',refId:'m'}), '', 'entryBrand empty for meals');
  eq(w3.entryBrand({type:'food',refId:'missing'}), '', 'entryBrand empty for deleted ref');
}

// --- unit families ---
eq(w.unitFamily('g'), 'mass', 'g is mass');
eq(w.unitFamily('oz'), 'mass', 'oz is mass');
eq(w.unitFamily('mL'), 'volume', 'mL is volume');
eq(w.unitFamily('cup'), 'volume', 'cup is volume');
eq(w.unitFamily('serving'), null, 'serving has no family');
eq(w.unitFamily('bar'), null, 'count unit has no family');

// --- unitsForFood ---
{
  const gFood = { servQty:138, servUnit:'g' };
  const u = w.unitsForFood(gFood);
  ok(u[0]==='serving' && u.includes('g') && u.includes('oz') && u.includes('lb') && u.includes('kg'), 'g food offers serving + mass units');
  ok(!u.includes('mL'), 'g food does NOT offer volume units (no fake conversion)');
  const mlFood = { servQty:325, servUnit:'mL' };
  const v = w.unitsForFood(mlFood);
  ok(v.includes('mL') && v.includes('cup') && v.includes('fl oz') && !v.includes('g'), 'mL food offers volume units only');
  const barFood = { servQty:1, servUnit:'bar' };
  const b = w.unitsForFood(barFood);
  eq(JSON.stringify(b), JSON.stringify(['serving','bar']), 'count food offers serving + its own unit only');
}

// --- conversion correctness: mult is invariant of display unit ---
{
  const f = { servQty:138, servUnit:'g' };       // 1 serving = 138 g
  near(w.foodMultForUnit(f,138,'g'), 1, 'mult: 138 g = 1 serving');
  near(w.foodMultForUnit(f,1,'serving'), 1, 'mult: 1 serving = 1 serving');
  near(w.foodMultForUnit(f,276,'g'), 2, 'mult: 276 g = 2 servings');
  near(w.foodMultForUnit(f,4.8678,'oz'), 1, 'mult: ~4.87 oz = 1 serving (138g)', 0.01);
  // round trip
  const mult = w.foodMultForUnit(f,138,'g');
  near(w.multToUnitAmount(f,mult,'oz'), 4.8678, 'inverse: 1 serving -> ~4.87 oz', 0.01);
  near(w.multToUnitAmount(f,mult,'serving'), 1, 'inverse: -> 1 serving');
  near(w.multToUnitAmount(f,mult,'g'), 138, 'inverse: -> 138 g');
}
{
  const f = { servQty:240, servUnit:'mL' };
  near(w.foodMultForUnit(f,1,'cup'), 236.588/240, 'mult: 1 cup of a 240mL serving', 0.001);
}

// --- USDA nutrient mapping (per 100g) ---
{
  const fn = [
    {nutrientNumber:'208', unitName:'KCAL', value:89},
    {nutrientNumber:'203', unitName:'G', value:1.09},
    {nutrientNumber:'205', unitName:'G', value:22.8},
    {nutrientNumber:'204', unitName:'G', value:0.33},
    {nutrientNumber:'291', unitName:'G', value:2.6},
    {nutrientNumber:'269', unitName:'G', value:12.2},
    {nutrientNumber:'307', unitName:'MG', value:1},
    {nutrientNumber:'306', unitName:'MG', value:358}
  ];
  const p = w.usdaPer100(fn);
  near(p.calories, 89, 'usda banana kcal');
  near(p.totalCarbs, 22.8, 'usda banana carbs');
  near(p.fiber, 2.6, 'usda banana fiber');
  near(p.sodium, 1, 'usda sodium already mg');
  near(p.potassium, 358, 'usda potassium already mg');
  eq(p.addedSugars, null, 'missing nutrient -> null');
}
// energy from kJ fallback
{
  const fn = [{nutrientNumber:'268', unitName:'kJ', value:418.4}];
  near(w.usdaPer100(fn).calories, 100, 'usda kJ->kcal fallback');
}
// serving basis
{
  eq(JSON.stringify(w.usdaServingBasis({})), JSON.stringify({servQty:100,servUnit:'g',factor:1}), 'usda default basis = per 100 g');
  const b = w.usdaServingBasis({servingSize:30, servingSizeUnit:'GRM'});
  eq(b.servQty, 30, 'usda branded servQty=30'); eq(b.servUnit, 'g', 'GRM->g'); near(b.factor, 0.3, 'factor 30/100');
}
eq(w.usdaName({description:'Bananas, raw'}), 'Bananas, raw', 'usdaName');
eq(w.usdaBrand({brandName:'Chiquita'}), 'Chiquita', 'usdaBrand from brandName');

// --- key storage ---
{
  const w5 = boot();
  eq(w5.usdaKey(), '', 'no key by default');
  w5.setUsdaKey('  ABC123  ');
  eq(w5.usdaKey(), 'ABC123', 'key trimmed + stored');
  eq(w5.__store['plate.usda.key'], 'ABC123', 'key persisted to localStorage');
  w5.setUsdaKey('');
  eq(w5.usdaKey(), '', 'empty clears key');
}

done('HELPERS');
