import { useEffect, useRef, useState } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import './ChatNotice.css';
export type ChatNoticeData = {
  text: string; kind?: 'connection'; requestType?: string; clientMessageId?: string;
  actionLabel?: string; onAction?: () => void;
  onDismiss?: () => void;
};
export function ChatNotice({notice}:{notice:ChatNoticeData}) {
  const [checking,setChecking]=useState(false);
  const [checked,setChecked]=useState(false), [timedOut,setTimedOut]=useState(false);
  const requested=useRef<ChatNoticeData | null>(null);
  useEffect(()=>{
    if(requested.current && requested.current !== notice){
      requested.current=notice;setChecking(false);setChecked(true);setTimedOut(false);
    }
  },[notice,checking]);
  useEffect(()=>{
    if(!checking)return;
    const timer=setTimeout(()=>{setChecking(false);setTimedOut(true);},8000);
    return ()=>clearTimeout(timer);
  },[checking]);
  const receipt=notice.requestType==='sendReceipt';
  const uncertain=receipt && /incertain/.test(notice.text);
  const title=checking?'Vérification en cours':timedOut?'Vérification indisponible':uncertain?(checked?'État toujours incertain':'Envoi à vérifier'):notice.kind==='connection'?'Connexion interrompue':'Attention requise';
  const text=checking?'Lecture de l’état enregistré par Atelier…':timedOut?'Aucune réponse reçue. Tu peux réessayer.':uncertain?'Atelier ne peut pas confirmer la réception après le redémarrage.':notice.text;
  // Une ligne lisible au-dessus du compositeur (Thierry 2026-10-19) : le
  // « ! » de la barre du haut cachait le texte derrière une bulle et restait
  // affiché tant qu'on ne l'ouvrait pas pour cliquer sur la croix.
  const titled=receipt || checking || timedOut;
  return <div role="status" className="chat-notice-line" data-kind={notice.kind}>
    {checking ? <Spinner size={14} className="chat-notice-spinner" aria-hidden="true"/> : <CircleAlert className="chat-notice-icon" aria-hidden="true"/>}
    <p className="chat-notice-text" title={notice.text}>
      {titled && <span className="chat-notice-title">{title}</span>}<span className="chat-notice-body">{text}</span>
      {receipt && <span className="chat-notice-hint">Ton message n’a pas été renvoyé.</span>}
    </p>
    {notice.onAction && <Button variant="ghost" size="sm" disabled={checking} onClick={()=>{
      if(receipt){requested.current=notice;setChecking(true);setTimedOut(false);}
      notice.onAction?.();
    }}>{checking?'Vérification…':notice.actionLabel || 'Réessayer'}</Button>}
    {notice.onDismiss && <IconButton size="s" className="chat-notice-close" label="Retirer l’alerte du chat" onClick={notice.onDismiss}><X aria-hidden="true"/></IconButton>}
  </div>;
}
