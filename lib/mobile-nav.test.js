const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mobileNav = require('../public/js/mobile-nav.js');

function fakeClassList(initial) {
  const set = new Set(initial || []);
  return {
    add: (name) => set.add(name),
    remove: (name) => set.delete(name),
    toggle: (name, force) => {
      if (force === true) set.add(name);
      else if (force === false) set.delete(name);
      else if (set.has(name)) set.delete(name);
      else set.add(name);
      return set.has(name);
    },
    contains: (name) => set.has(name),
    toArray: () => [...set]
  };
}

describe('mobile-nav', () => {
  it('känner igen mobil via matchMedia', () => {
    assert.equal(mobileNav.isMobile(() => ({ matches: true })), true);
    assert.equal(mobileNav.isMobile(() => ({ matches: false })), false);
    assert.equal(mobileNav.MQ, '(max-width: 768px)');
  });

  it('använder inte ihopfälld sidomeny på mobil', () => {
    const body = { classList: fakeClassList(['sidebar-collapsed']) };
    assert.equal(mobileNav.applyCollapsedState(body, '1', true), false);
    assert.equal(body.classList.contains('sidebar-collapsed'), false);
  });

  it('behåller ihopfälld sidomeny på dator', () => {
    const body = { classList: fakeClassList([]) };
    assert.equal(mobileNav.applyCollapsedState(body, '1', false), true);
    assert.equal(body.classList.contains('sidebar-collapsed'), true);
  });

  it('öppnar och stänger drawern utan att röra sidebar-collapsed', () => {
    const sidebar = { classList: fakeClassList([]) };
    const body = { classList: fakeClassList(['sidebar-collapsed']) };
    const attrs = {};
    const toggle = {
      setAttribute: (k, v) => { attrs[k] = v; },
      querySelector: () => ({ classList: fakeClassList(['fa-bars']) })
    };
    mobileNav.setOpen(sidebar, body, toggle, true);
    assert.equal(sidebar.classList.contains('open'), true);
    assert.equal(body.classList.contains('mobile-nav-open'), true);
    assert.equal(body.classList.contains('sidebar-collapsed'), true);
    assert.equal(attrs['aria-expanded'], 'true');
    mobileNav.setOpen(sidebar, body, toggle, false);
    assert.equal(sidebar.classList.contains('open'), false);
    assert.equal(body.classList.contains('mobile-nav-open'), false);
    assert.equal(attrs['aria-label'], 'Öppna meny');
  });
});

describe('mobil-css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf8');

  it('ger innehållet full bredd när sidomenyn är dold', () => {
    assert.match(css, /@media \(max-width: 768px\)[\s\S]*?\.main-content\s*\{[\s\S]*?width:\s*100%/);
    assert.match(css, /\.mobile-topbar,\s*\.mobile-nav-toggle,\s*\.mobile-nav-overlay\s*\{\s*display:\s*none;/);
  });

  it('låter form-rutor krympa under 280px utan att spränga layouten', () => {
    assert.match(css, /minmax\(min\(280px,\s*100%\),\s*1fr\)/);
  });
});
