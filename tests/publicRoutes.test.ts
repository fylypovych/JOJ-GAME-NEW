import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PUBLIC_TAB,
  getCanonicalPublicPath,
  getPublicTabFromPathname,
  getPublicTabPath,
} from '../src/ui/app/routes';

test('the site root opens news and canonicalizes to the news route', () => {
  assert.equal(DEFAULT_PUBLIC_TAB, 'home');
  assert.equal(getPublicTabFromPathname('/'), 'home');
  assert.equal(getPublicTabPath('home'), '/news');
  assert.equal(getCanonicalPublicPath('/', 'home'), '/news');
});

test('the games lobby remains available only on its own public route', () => {
  assert.equal(getPublicTabFromPathname('/news'), 'home');
  assert.equal(getPublicTabFromPathname('/games'), 'games');
  assert.equal(getCanonicalPublicPath('/games', 'games'), '/games');
});
