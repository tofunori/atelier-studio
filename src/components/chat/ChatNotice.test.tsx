import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatNotice } from './ChatNotice';
afterEach(()=>{cleanup();vi.useRealTimers();});
const notice={text:'effet fournisseur incertain après redémarrage',requestType:'sendReceipt',clientMessageId:'a',actionLabel:'Vérifier l’état',onAction:vi.fn()};
it('shows the message in a line, verifies without resending, and reports the outcome',()=>{
 const {rerender}=render(<ChatNotice notice={notice}/>);
 expect(screen.getByRole('status').textContent).toContain('Envoi à vérifier');
 expect(screen.getByText('Ton message n’a pas été renvoyé.')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Vérifier l’état'}));
 expect(notice.onAction).toHaveBeenCalledOnce();
 expect(screen.getByText('Vérification en cours')).toBeTruthy();
 rerender(<ChatNotice notice={{...notice}}/>);
 expect(screen.getByText('État toujours incertain')).toBeTruthy();
});
it('ends a verification that receives no reply and lets the user retry',()=>{
 const {rerender}=render(<ChatNotice notice={notice}/>);
 vi.useFakeTimers();
 fireEvent.click(screen.getByRole('button',{name:'Vérifier l’état'}));
 act(()=>vi.advanceTimersByTime(8000));
 expect(screen.getByText('Vérification indisponible')).toBeTruthy();
 expect(screen.getByRole('button',{name:'Vérifier l’état'}).hasAttribute('disabled')).toBe(false);
 rerender(<ChatNotice notice={{...notice,text:'Échec confirmé : accès refusé'}}/>);
 expect(screen.getByText('Échec confirmé : accès refusé')).toBeTruthy();
 expect(screen.queryByText('Vérification indisponible')).toBeNull();
});
it('offers a close button only when the alert can be dismissed',()=>{
 const onDismiss=vi.fn();
 const {rerender}=render(<ChatNotice notice={{text:'Serveur injoignable',kind:'connection'}}/>);
 expect(screen.getByText('Serveur injoignable')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Retirer l’alerte du chat'})).toBeNull();
 rerender(<ChatNotice notice={{text:'Envoi refusé',onDismiss}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Retirer l’alerte du chat'}));
 expect(onDismiss).toHaveBeenCalledOnce();
});
