import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '../ui/Popover';
import './ChatNotice.css';
export type ChatNoticeData = {
  text: string; kind?: 'connection'; requestType?: string; clientMessageId?: string;
  actionLabel?: string; onAction?: () => void;
};
export function ChatNotice({notice}:{notice:ChatNoticeData}) {
  const [open,setOpen]=useState(false), [checking,setChecking]=useState(false);
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
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger className="chat-notice-trigger" aria-label="Afficher l’alerte du chat" title={title}><CircleAlert aria-hidden="true"/></PopoverTrigger>
    <PopoverContent className="chat-notice-card" align="start">
      <div className="chat-notice-heading"><PopoverTitle>{title}</PopoverTitle><button type="button" className="chat-notice-close" aria-label="Fermer le détail de l’alerte" onClick={()=>setOpen(false)}><X/></button></div>
      <div role="status" className="chat-notice-detail">{checking && <LoaderCircle className="chat-notice-spinner"/>}<p>{text}</p></div>
      {receipt && <p className="chat-notice-hint">Ton message n’a pas été renvoyé.</p>}
      {notice.onAction && <Button variant="secondary" disabled={checking} onClick={()=>{
        if(receipt){requested.current=notice;setChecking(true);setTimedOut(false);}
        notice.onAction?.();
      }}>{checking?'Vérification…':notice.actionLabel || 'Réessayer'}</Button>}
    </PopoverContent>
  </Popover>;
}
