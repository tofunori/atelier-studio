import test from 'node:test';
import assert from 'node:assert/strict';
import {fluidJoins} from '../../assets/cm6/fluid_text.mjs';

function projected(source) {
  let result = source;
  for (const {from, to} of fluidJoins(source).reverse()) result = result.slice(0, from) + ' ' + result.slice(to);
  return result;
}
test('joins prose only, including inline math and citations, without changing offsets', () => {
  const source = 'A fire effect of $-0.003$\n  is observed \\citep{Smith}.\n\nAnother paragraph\ncontinues here.';
  assert.equal(projected(source), 'A fire effect of $-0.003$ is observed \\citep{Smith}.\n\nAnother paragraph continues here.');
  for (const {from, to} of fluidJoins(source)) assert.match(source.slice(from, to), /^\s+$/);
});
test('preserves structural and ambiguous LaTeX lines', () => {
  for (const source of [
    'Text % comment\nnext line', 'Text\\\\\nnext line',
    '\\section{Long\nheading}\nText',
    '\\newcommand{\\demo}{first\nsecond}\nText',
    'Text $a\n+b$ then\nnext line',
    'Text \\[a\n+b\\]\nnext line',
    '\\begin{align}\na=b\nc=d\n\\end{align}',
    '\\begin{itemize}\n\\item First\ncontinuation\n\\end{itemize}',
    '\\begin{verbatim}\nraw source\nnext line\n\\end{verbatim}',
  ]) assert.equal(projected(source), source);
  assert.equal(projected('50\\% of glaciers\nremain.'), '50\\% of glaciers remain.');
});

test('literal dollar signs do not disable subsequent prose', () => {
  for (const literal of ['\\begin{verbatim}\n$5 {\n\\end{verbatim}', 'Use \\verb|$| for currency.', '\\begin{align}\na = $broken\n\\end{align}']) {
    assert.equal(projected(literal + '\n\nA normal paragraph\ncontinues here.'), literal + '\n\nA normal paragraph continues here.');
  }
});
