import test from 'node:test';
import assert from 'node:assert/strict';
import {columnAligns, displayMathSource, expandMacros, formatCitation, formatReference, imageCandidates, parseTabular, plainCaption, richInline} from '../../src/browser/cm6/latex_visual.ts';

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

test('display math drops labels and wraps multi-line environments for KaTeX', () => {
  assert.deepEqual(displayMathSource('equation', '\\label{eq:a}\n a = b\n'), {tex: 'a = b', labels: ['eq:a'], numbered: true});
  assert.equal(displayMathSource('align*', 'a &= b \\\\ c &= d').tex, '\\begin{aligned}a &= b \\\\ c &= d\\end{aligned}');
  assert.equal(displayMathSource('align*', 'x').numbered, false);
  assert.equal(displayMathSource('gather', 'x \\nonumber').tex, '\\begin{gathered}x\\end{gathered}');
  assert.equal(displayMathSource('displaymath', 'x^2').numbered, false);
});

test('images resolve like LaTeX: document folders, graphicspath, missing extensions', () => {
  const found = imageCandidates('trend', ['/p/thesis', '/p/thesis/ch1'], ['figs/']);
  assert.equal(found[0], '/p/thesis/trend.pdf');
  assert.ok(found.includes('/p/thesis/figs/trend.png'));
  assert.ok(found.includes('/p/thesis/ch1/figs/trend.jpg'));
  assert.deepEqual(imageCandidates('./fig/a.png', ['/p']), ['/p/fig/a.png']);
  assert.deepEqual(imageCandidates('/abs/a.png', ['/p']), ['/abs/a.png']);
  assert.deepEqual(imageCandidates('  ', ['/p']), []);
});

test('captions read as text: formatting stripped, citations and references resolved', () => {
  assert.equal(plainCaption('Trend of the \\emph{accumulation zone} (\\citep{ren2021}), see Fig.~\\ref{fig:trend} --- 50\\%.\\label{x}', context),
    'Trend of the accumulation zone ((Ren et al., 2021)), see Fig. 3 \u2014 50%.');
});

test('column specs give one alignment per column (rules, p{}, *{n}{}, @{} skipped)', () => {
  assert.deepEqual(columnAligns('l|c r'), ['left', 'center', 'right']);
  assert.deepEqual(columnAligns('@{}lp{3cm}*{2}{r}@{}'), ['left', 'left', 'right', 'right']);
  assert.deepEqual(columnAligns('>{\\centering}X l'), ['left', 'left']);
});

test('tabular rows split on \\\\ and & outside braces, booktabs rules become borders', () => {
  const body = `
\\toprule
Site & Albedo & $n$ \\\\
\\midrule
A & 0.61 & 12 \\\\ % comment & ignored
\\multicolumn{2}{c}{B \\& C} & {1 & 2}\\\\[2pt]
\\bottomrule
`;
  const rows = parseTabular(body, 'lrr', {});
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.header), [true, false, false]);
  assert.deepEqual(rows.map(row => row.ruleAbove), [true, true, false]);
  assert.equal(rows[2]!.ruleBelow, true);
  assert.deepEqual(rows[1]!.cells.map(cell => [cell.html, cell.align]), [['A', 'left'], ['0.61', 'right'], ['12', 'right']]);
  assert.deepEqual(rows[2]!.cells.map(cell => [cell.html, cell.span, cell.align]), [['B &amp; C', 2, 'center'], ['1 &amp; 2', 1, 'right']]);
  assert.equal(rows[0]!.cells[2]!.html, 'n');
});

test('preamble text macros expand, in captions and cells too', () => {
  const macros = {'\\modis': 'MODIS', '\\sensor': '\\textsc{\\modis}'};
  assert.equal(expandMacros('data from \\modis{} and \\sensor', macros), 'data from MODIS and \\textsc{MODIS}');
  assert.equal(expandMacros('\\modisx stays', macros), '\\modisx stays');
  assert.equal(plainCaption('Albedo from \\sensor.', {macros}), 'Albedo from MODIS.');
});

test('rich captions render math with KaTeX and escape the text around it', () => {
  const math = {renderToString: (tex: string) => `<k>${tex}</k>`};
  assert.equal(richInline('Mean $\\alpha$ <5% of \\modis', {macros: {'\\modis': 'MODIS'}}, math), 'Mean <span class="cm-vis-math"><k>\\alpha</k></span> &lt;5% of MODIS');
  assert.equal(richInline('a \\% b $x$ c', {}, math), 'a % b <span class="cm-vis-math"><k>x</k></span> c');
});
