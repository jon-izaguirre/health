'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML_PATH = path.join(__dirname, '..', 'plate.html');

// Build a fresh app window. opts.localStorage = seed object of key->string.
// opts.fetch = function to use for window.fetch. opts.google = GIS stub.
function boot(opts = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const store = Object.assign({}, opts.localStorage || {});
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://jon-izaguirre.github.io/health/plate.html',
    beforeParse(window) {
      // writable localStorage mock (jsdom default isn't configurable for our needs)
      const ls = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
        clear: () => { for (const k in store) delete store[k]; },
        key: i => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
      };
      Object.defineProperty(window, 'localStorage', { value: ls, configurable: true, writable: true });
      window.confirm = opts.confirm || (() => true);
      window.alert = () => {};
      window.scrollTo = () => {};
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      if (opts.fetch) window.fetch = opts.fetch;
      if (opts.google) window.google = opts.google;
      if (opts.navigatorOnLine === false) {
        try { Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true }); } catch (e) {}
      }
    }
  });
  const w = dom.window;
  w.__store = store;       // expose backing store for assertions
  w.__dom = dom;
  return w;
}

module.exports = { boot };
