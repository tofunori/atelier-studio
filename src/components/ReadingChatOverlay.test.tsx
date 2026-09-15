import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReadingChatOverlay } from './ReadingChatOverlay';
import { createThreadEventStore } from '../lib/threadEventStore';
afterEach(cleanup);
const setup = (extra = {}) => {
  const props = {threadId:'a',store:createThreadEventStore({a:[{kind:'text',text:'Réponse initiale'}]}),topLayer:false,prompt:'',onPromptChange:vi.fn(),count:2,disabled:false,working:false,onSend:vi.fn(),onClear:vi.fn(),...extra};
  return {props,...render(<ReadingChatOverlay {...props}/>)};
};
it('keeps response collapsed until requested and follows the active conversation', () => {
  const {props,rerender}=setup();
  expect(screen.queryByText('Réponse initiale')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Dernière réponse'}));
  expect(screen.getByText('Réponse initiale')).toBeTruthy();
  act(()=>props.store.update(prev=>({...prev,a:[{kind:'streaming',text:'Nouvelle réponse'}]})));
  expect(screen.getByText('Nouvelle réponse')).toBeTruthy();
  rerender(<ReadingChatOverlay {...props} threadId="b"/>);
  expect(screen.queryByText('Nouvelle réponse')).toBeNull();
});
it('separates annotation-only sends, normal sends and removal from draft', () => {
  const {props}=setup();
  fireEvent.click(screen.getByRole('button',{name:'Envoyer les annotations'}));
  expect(props.onSend).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button',{name:'Envoyer au chat'}));
  expect(props.onSend).toHaveBeenLastCalledWith(false);
  fireEvent.click(screen.getByRole('button',{name:'Retirer les annotations du brouillon'}));
  expect(props.onClear).toHaveBeenCalledOnce();
});
it('has no empty annotation bar, blocks disconnected sends and permits multiline input', () => {
  const {props}=setup({count:0,disabled:true,prompt:'Question'});
  expect(screen.queryByRole('group',{name:'Annotations en attente'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Envoyer au chat'}));
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'});
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter',shiftKey:true});
  expect(props.onSend).not.toHaveBeenCalled();
});
