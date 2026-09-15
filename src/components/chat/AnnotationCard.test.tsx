import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { annotationCards } from '../../lib/annotationCards';
import { UserTurn } from './turns';
import { t } from '../../lib/i18n';

afterEach(cleanup);
const text = '/Documents/Mon projet/methods_en.tex (L122-123) : « providing a lower bound on the organic\ncontribution). »\nCommentaire : ca veut dire quoi ca';
function renderTurn(value = text, label = 'methods_en.tex (lines 122-123)') {
  const onEditingChange = vi.fn();
  renderUi(<UserTurn event={{kind:'user',text:value,label}} index={0} timeFormat="24h" pinned={false}
    renderBubbleText={value=>value} editingText={null} onEditingChange={onEditingChange}
    onEditSend={vi.fn()} onRevert={vi.fn()} onTogglePin={vi.fn()} onOpenPaste={vi.fn()} />);
  return { onEditingChange };
}
it('renders one source and preserves the original message for editing and navigation', () => {
  const { onEditingChange } = renderTurn();
  expect(document.querySelectorAll('.chat-annotation-card')).toHaveLength(1);
  expect(document.querySelector('.user-file-attachment')).toBeNull();
  expect(document.querySelector('.user-bubble')?.textContent).not.toContain('/Documents');
  expect(document.querySelector('.user-bubble')?.textContent).not.toContain('Commentaire :');
  expect(screen.getByText('ca veut dire quoi ca')).toBeTruthy();
  const opened = vi.fn();
  window.addEventListener('chat-open-file', opened, {once:true});
  fireEvent.click(screen.getByRole('button',{name:/methods_en.tex/}));
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toMatchObject({rel:'/Documents/Mon projet/methods_en.tex',line:'122-123'});
  fireEvent.click(screen.getByRole('button',{name:t('action.edit-resend')}));
  expect(onEditingChange).toHaveBeenCalledWith(text);
});
it('keeps the prompt, multiple annotations and unrelated attachments, and opens the PDF page', () => {
  renderTurn(`Vérifie ces passages\n\n${text}\n\npaper.pdf (p.7) : « Autre passage »\nCommentaire : Pourquoi ?`, 'methods_en.tex (lines 122-123) · paper.pdf (lines 7) · data.csv');
  expect(document.querySelectorAll('.chat-annotation-card')).toHaveLength(2);
  expect(document.querySelector('.user-file-attachment')?.textContent).toBe('data.csv');
  expect(screen.getByText('Vérifie ces passages')).toBeTruthy();
  const opened = vi.fn();
  window.addEventListener('chat-open-file', opened, {once:true});
  fireEvent.click(screen.getByRole('button',{name:/paper.pdf/}));
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toMatchObject({rel:'paper.pdf',line:null,page:7});
});
it('expands long excerpts without hiding the comment', () => {
  renderTurn(`notes.md (p.L1-8) : « ${'Texte long. '.repeat(45)} »\nCommentaire : À préciser`, 'notes.md (lines 1-8)');
  expect(document.querySelector('.chat-annotation-quote.is-collapsed')).toBeTruthy();
  expect(screen.getByText('À préciser')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:t('passage.expand')}));
  expect(document.querySelector('.chat-annotation-quote.is-collapsed')).toBeNull();
});
it('leaves ordinary and malformed messages intact', () => {
  for (const value of ['Explique ceci', 'notes.md (p.1) : « Citation sans enveloppe complète »']) {
    expect(annotationCards(value)).toEqual({prompt:value,cards:[]});
  }
});
it('handles Markdown without a recovered source line alongside LaTeX', () => {
  renderTurn(`${text}\n\nnotes.md : « Sélection Markdown »\nCommentaire : Seconde question`, 'methods_en.tex (lines 122-123) · notes.md : « Sélection Markdown »');
  expect(document.querySelectorAll('.chat-annotation-card')).toHaveLength(2);
  expect(screen.getByText('ca veut dire quoi ca')).toBeTruthy();
  expect(screen.getByText('Seconde question')).toBeTruthy();
  expect(document.querySelectorAll('.chat-annotation-location')).toHaveLength(1);
  expect(document.querySelector('.user-file-attachment')).toBeNull();
});
