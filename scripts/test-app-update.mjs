import assert from 'node:assert/strict';
import test from 'node:test';
import { AppVersionTracker } from '../src/lib/app-update.ts';

const consultation = Object.freeze({ pathname: '/chauffage', online: true, visible: true,
  dialogOpen: false, formPresent: false, fieldActive: false, hasDraft: false, busy: false, interacting: false });

function outdated(version = 'bundle-A') {
  const tracker = new AppVersionTracker(version);
  tracker.observe('bundle-B');
  return tracker;
}

test('heating consultation reloads once when its loaded page is older', () => {
  const tracker = outdated();
  assert.equal(tracker.consumeReload(consultation), true);
  assert.equal(tracker.consumeReload(consultation), false);
});

test('a blocked check never consumes the mismatch: unknown page then consultation', () => {
  const tracker = outdated();
  for (let i = 0; i < 4; i += 1) {
    assert.equal(tracker.consumeReload({ ...consultation, pathname: '/comptabilite' }), false);
    tracker.observe('bundle-B');
    assert.equal(tracker.hasPendingUpdate(), true);
  }
  assert.equal(tracker.consumeReload(consultation), true);
});

test('only exact consultation paths can reload; nested forms remain excluded', () => {
  for (const pathname of ['/', '/eau', '/chauffage']) {
    assert.equal(outdated().consumeReload({ ...consultation, pathname }), true, pathname);
  }
  for (const pathname of ['/achats', '/chauffage/nouveau', '/eau/modifier', '/unknown', '/login']) {
    assert.equal(outdated().consumeReload({ ...consultation, pathname }), false, pathname);
  }
});

test('dialogs, inline forms, focused fields, drafts and busy actions protect every safe page', () => {
  for (const pathname of ['/', '/eau', '/chauffage']) {
    for (const blocker of ['dialogOpen', 'formPresent', 'fieldActive', 'hasDraft', 'busy', 'interacting']) {
      const tracker = outdated();
      assert.equal(tracker.consumeReload({ ...consultation, pathname, [blocker]: true }), false, `${pathname}:${blocker}`);
      assert.equal(tracker.hasPendingUpdate(), true);
      assert.equal(tracker.consumeReload({ ...consultation, pathname }), true);
    }
  }
});

test('closing a sheet cannot reload while a saved action is still busy', () => {
  const tracker = outdated();
  assert.equal(tracker.consumeReload({ ...consultation, dialogOpen: true, busy: true }), false);
  assert.equal(tracker.consumeReload({ ...consultation, dialogOpen: false, busy: true }), false);
  assert.equal(tracker.consumeReload(consultation), true);
});

test('a field remains protected after blur while its unsaved draft exists', () => {
  const tracker = outdated();
  assert.equal(tracker.consumeReload({ ...consultation, fieldActive: true, hasDraft: true }), false);
  assert.equal(tracker.consumeReload({ ...consultation, fieldActive: false, hasDraft: true }), false);
  assert.equal(tracker.consumeReload(consultation), true);
});

test('an editor opened during the version request is checked at the reload decision', () => {
  const tracker = new AppVersionTracker('bundle-A');
  tracker.observe('bundle-B');
  assert.equal(tracker.consumeReload({ ...consultation, dialogOpen: true }), false);
  assert.equal(tracker.hasPendingUpdate(), true);
});

test('offline or hidden pages retain the pending update without reloading', () => {
  for (const patch of [{ online: false }, { visible: false }]) {
    const tracker = outdated();
    assert.equal(tracker.consumeReload({ ...consultation, ...patch }), false);
    assert.equal(tracker.hasPendingUpdate(), true);
    assert.equal(tracker.consumeReload(consultation), true);
  }
});

test('tabs keep their own actual loaded version, independent of another newer tab', () => {
  const oldTab = new AppVersionTracker('bundle-A');
  const newTab = new AppVersionTracker('bundle-B');
  newTab.observe('bundle-B');
  oldTab.observe('bundle-B');
  assert.equal(newTab.consumeReload(consultation), false);
  assert.equal(oldTab.consumeReload(consultation), true);
});

test('an old tab cannot convince a newer tab that it loaded another bundle', () => {
  const oldTab = new AppVersionTracker('bundle-A');
  const newTab = new AppVersionTracker('bundle-B');
  oldTab.observe('bundle-C');
  newTab.observe('bundle-B');
  assert.equal(oldTab.hasPendingUpdate(), true);
  assert.equal(newTab.hasPendingUpdate(), false);
});

test('malformed or unknown build versions never cause reload loops', () => {
  for (const version of [undefined, null, '', 'local', 123, {}, 'x'.repeat(201)]) {
    const tracker = new AppVersionTracker(version);
    tracker.observe('bundle-B');
    assert.equal(tracker.consumeReload(consultation), false);
  }
  const tracker = new AppVersionTracker('bundle-A');
  for (const version of [null, '', 'local', 123, {}]) tracker.observe(version);
  assert.equal(tracker.consumeReload(consultation), false);
});

test('malformed responses do not erase a known mismatch, while a verified rollback can clear it', () => {
  const tracker = outdated();
  assert.equal(tracker.observe(null), false);
  assert.equal(tracker.hasPendingUpdate(), true);
  tracker.observe('bundle-A');
  assert.equal(tracker.hasPendingUpdate(), false);
  assert.equal(tracker.consumeReload(consultation), false);
});
