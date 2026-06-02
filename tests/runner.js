'use strict';
// Minimal runner shared by all suites.
let pass = 0, fail = 0; const fails = [];
function ok(cond, name) { if (cond) { pass++; } else { fail++; fails.push(name); console.log('  ✗ ' + name); } }
function eq(a, b, name) { ok(a === b, name + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function near(a, b, name, tol = 0.5) { ok(Math.abs(a - b) <= tol, name + '  (got ' + a + ', want ~' + b + ')'); }
function done(label) {
  console.log(`\n${label}: ${pass} passed, ${fail} failed` + (fail ? '  ❌' : '  ✅'));
  if (fail) process.exit(1);
}
module.exports = { ok, eq, near, done, _state: () => ({ pass, fail, fails }) };
