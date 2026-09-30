import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCitation, formatReference} from '../../src/browser/cm6/latex_visual.ts';

const context = {
  citations: {ren2021: {label: 'Ren et al., 2021', title: 'Anisotropy'}, smith2020: {label: 'Smith, 2020'}},
  references: {'fig:trend': '3', 'eq:main': '1', 'sec:data': '2.1'},
};

test('citations follow natbib: parentheses, notes inside, textual form without', () => {
  assert.equal(formatCitation('\\citep', [], ['ren2021', ' smith2020'], context).text, '(Ren et al., 2021; Smith, 2020)');
  assert.equal(formatCitation('\\citep', ['p.~3'], ['ren2021'], context).text, '(Ren et al., 2021, p. 3)');
  assert.equal(formatCitation('\\citep', ['see', 'ch. 2'], ['ren2021'], context).text, '(see Ren et al., 2021, ch. 2)');
  assert.equal(formatCitation('\\citet', [], ['smith2020'], context).text, 'Smith, 2020');
  assert.equal(formatCitation('\\textcite', [], ['smith2020'], context).text, 'Smith, 2020');
});

test('unknown citation keys stay readable and say why in the tooltip', () => {
  const {text, title} = formatCitation('\\cite', [], ['nobody1999'], context);
  assert.equal(text, '(nobody1999)');
  assert.match(title, /non résolue : nobody1999/);
});

test('references use the compiled numbers, with the key as fallback', () => {
  assert.deepEqual(formatReference('\\ref', 'fig:trend', context), {text: '3', title: 'fig:trend', resolved: true});
  assert.equal(formatReference('\\eqref', 'eq:main', context).text, '(1)');
  assert.equal(formatReference('\\cref', 'fig:trend', context).text, 'fig. 3');
  assert.equal(formatReference('\\Cref', 'sec:data', context).text, 'Sec. 2.1');
  assert.equal(formatReference('\\cref', 'thm:one', {references: {'thm:one': '4'}}).text, '4');
  const missing = formatReference('\\ref', 'fig:none', context);
  assert.equal(missing.text, 'fig:none');
  assert.equal(missing.resolved, false);
});
