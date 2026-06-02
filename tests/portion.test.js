'use strict';
const { boot } = require('./harness');
const { ok, eq, near, done } = require('./runner');
const KEY='plate.data.v1';
const seed=(db)=>({localStorage:{[KEY]:JSON.stringify(db)}});
const CH={id:'c',name:'Chicken',servQty:138,servUnit:'g',nut:{calories:240,protein:22,totalCarbs:15,totalFat:9}};

function persisted(w){return JSON.parse(w.__store[KEY]);}
function entriesToday(w){const d=persisted(w).log[w.todayStr()]||{};return d[w.pickerMeal]||d.breakfast||[];}

// 1. Opening the sheet for a grams food offers serving+mass units, defaults to native g
{
  const w=boot(seed({foods:{c:CH}}));
  w.openPortion('food','c');
  const sel=w.document.getElementById('pQtyUnit');
  const opts=[...sel.options].map(o=>o.value);
  ok(opts.includes('serving')&&opts.includes('g')&&opts.includes('oz')&&opts.includes('lb')&&opts.includes('kg'),'sheet offers serving + mass units');
  ok(!opts.includes('mL'),'sheet hides volume units for a g food');
  eq(sel.disabled,false,'unit select enabled for food');
  eq(w.document.getElementById('pQty').value,'138','defaults to 138 in native g');
  eq(w.document.getElementById('pQtyUnit').value,'g','selected unit defaults to native g');
}

// 2. Switching units holds the physical quantity constant
{
  const w=boot(seed({foods:{c:CH}}));
  w.openPortion('food','c');
  const sel=w.document.getElementById('pQtyUnit');
  sel.value='serving'; w.onPortionUnitChange();
  eq(w.document.getElementById('pQty').value,'1','138 g -> 1 serving');
  sel.value='oz'; w.onPortionUnitChange();
  near(parseFloat(w.document.getElementById('pQty').value),4.87,'1 serving -> ~4.87 oz',0.02);
  sel.value='g'; w.onPortionUnitChange();
  near(parseFloat(w.document.getElementById('pQty').value),138,'~4.87 oz -> 138 g',0.5);
}

// 3. Nutrition is invariant across the unit the user logs in
function logInUnit(unitSeq){
  const w=boot(seed({foods:{c:CH}}));
  w.openPortion('food','c');
  const sel=w.document.getElementById('pQtyUnit');
  for(const u of unitSeq){ sel.value=u; w.onPortionUnitChange(); }
  w.commitPortion();
  const e=entriesToday(w)[0];
  return {w,e};
}
{
  const a=logInUnit(['g']);        // 138 g
  const b=logInUnit(['serving']);  // 1 serving
  const c=logInUnit(['oz']);       // ~4.87 oz
  near(a.w.entryNut(a.e).calories,240,'log in g -> 240 cal');
  near(b.w.entryNut(b.e).calories,240,'log in servings -> 240 cal');
  near(c.w.entryNut(c.e).calories,240,'log in oz -> 240 cal');
  eq(a.e.unit,'g','entry stores unit g'); eq(b.e.unit,'serving','entry stores unit serving'); eq(c.e.unit,'oz','entry stores unit oz');
  near(a.e.qty,1,'qty(mult)=1 regardless of unit (g)'); near(c.e.qty,1,'qty(mult)=1 regardless of unit (oz)',0.001);
}

// 4. Edit re-opens in the stored unit
{
  const date='__T__';
  const w0=boot(seed({foods:{c:CH}}));
  const today=w0.todayStr();
  const w=boot(seed({foods:{c:CH}, log:{[today]:{lunch:[{type:'food',refId:'c',amt:4.87,unit:'oz',qty:1}]}}}));
  w.editEntry('lunch',0);
  eq(w.document.getElementById('pQtyUnit').value,'oz','edit opens in stored unit (oz)');
  near(parseFloat(w.document.getElementById('pQty').value),4.87,'edit shows stored amount in oz',0.02);
}

// 5. Meals: unit select is locked to servings, switching disabled
{
  const w=boot(seed({meals:{m:{id:'m',name:'Bowl',comps:[]}}}));
  w.openPortion('meal','m');
  const sel=w.document.getElementById('pQtyUnit');
  eq(sel.disabled,true,'meal unit select disabled');
  eq(w.document.getElementById('pQtyUnit').value,'serving','meal unit is serving');
}

// 6. Diary renders brand (faint) + pluralized countable unit together
{
  const today=boot().todayStr();
  const w=boot(seed({
    foods:{
      sh:{id:'sh',name:'Vanilla Shake',brand:'Premier Protein',servQty:325,servUnit:'mL',nut:{calories:160}},
      wa:{id:'wa',name:'Water',brand:'',servQty:1,servUnit:'bottle',nut:{calories:0}}
    },
    log:{[today]:{breakfast:[
      {type:'food',refId:'sh',amt:325,unit:'mL',qty:1},
      {type:'food',refId:'wa',amt:2,unit:'bottle',qty:2}
    ]}}
  }));
  w.selectDate(today); w.renderToday();
  const html=w.document.getElementById('diary').innerHTML;
  ok(html.includes('entry-brand')&&html.includes('Premier Protein'),'diary shows brand span');
  ok(html.includes('2 bottles'),'diary pluralizes -> 2 bottles');
  ok(html.includes('325 mL'),'measured unit stays singular -> 325 mL');
}

done('PORTION/UNIT-SWITCHER + DIARY');
