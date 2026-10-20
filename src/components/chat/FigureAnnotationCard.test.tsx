// Figure annotée envoyée depuis la galerie (2026-10-20) : la bulle n'affiche
// plus l'enveloppe destinée à l'agent (chemins, version) ; la carte la remplace,
// en direct comme au rechargement de l'historique.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderUi } from '../../test/render';
import { UserTurn } from './turns';
import { t } from '../../lib/i18n';

afterEach(cleanup);
const preview = '.fig_thumbs/annotation-previews/figS_snowpack_annot_1792458432712055000.png';
const envelope = `${preview}
Annotations (badges numerotes sur l'image) :
1. est-ce que 2012 est reconnu pour une année neigeuse?
Figure source : /Users/tofunori/Doctorat/figures/supp/figS_snowpack.png
Version affichée : v1 (SHA-256 db6186444a4a25b0c4f18d1b789e564aca1ee38cc8f2adc8fd904a0f29981c1e). La pièce jointe correspond à cette version ; le fichier source peut avoir changé.`;

function renderTurn(event: Record<string, unknown>) {
  const onEditingChange = vi.fn();
  const onTogglePin = vi.fn();
  renderUi(<UserTurn event={{kind:'user', ...event} as never} index={0} timeFormat="24h" pinned={false}
    renderBubbleText={value=>value} editingText={null} onEditingChange={onEditingChange}
    onEditSend={vi.fn()} onRevert={vi.fn()} onTogglePin={onTogglePin} onOpenPaste={vi.fn()} />);
  return { onEditingChange, onTogglePin };
}

it('shows only the card, never the agent envelope', async () => {
  const { onEditingChange, onTogglePin } = renderTurn({ text: envelope, label: 'figS_snowpack.png',
    imageUrl: 'http://127.0.0.1:1/x.png', notes: [{ n: 1, text: 'est-ce que 2012 est reconnu pour une année neigeuse?' }] });
  // La carte est chargée à part (budget de l'entrée).
  await screen.findByText('est-ce que 2012 est reconnu pour une année neigeuse?');
  expect(document.querySelector('.user-bubble')).toBeNull();
  expect(document.body.textContent).not.toContain('.fig_thumbs');
  expect(document.body.textContent).not.toContain('SHA-256');
  expect(document.querySelector('.user-annot-title')?.textContent).toBe('figS_snowpack.png');
  expect(screen.getByText('est-ce que 2012 est reconnu pour une année neigeuse?')).toBeTruthy();
  expect(document.body.textContent).not.toContain('Figure source');
  // L'agent et la réédition gardent le texte complet.
  fireEvent.click(screen.getByRole('button', { name: t('action.edit-resend') }));
  expect(onEditingChange).toHaveBeenCalledWith(envelope);
  fireEvent.click(screen.getByRole('button', { name: /pin|épingl/i }));
  expect(onTogglePin).toHaveBeenCalledWith(0, 'figS_snowpack.png');
});

it('rebuilds the card from a reloaded turn and keeps the typed prompt in the bubble', async () => {
  renderTurn({ text: `Compare avec SNOTEL.\n\n${envelope}`, label: 'figS_snowpack.png',
    imagePaths: [`/Users/tofunori/Doctorat/${preview}`] });
  await screen.findByText('est-ce que 2012 est reconnu pour une année neigeuse?');
  expect(document.querySelector('.user-bubble')?.textContent).toBe('Compare avec SNOTEL.');
  expect(document.querySelector('.user-file-attachment')).toBeNull();
  expect(document.querySelector('.user-annot-title')?.textContent).toBe('figS_snowpack.png');
  expect(document.querySelectorAll('.user-annot-badge')).toHaveLength(1);
});
