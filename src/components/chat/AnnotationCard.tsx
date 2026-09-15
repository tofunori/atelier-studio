import { useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import type { AnnotationCard as Annotation } from '../../lib/annotationCards';
import { t } from '../../lib/i18n';
import { openFileRef } from './md';
import { RowButton } from '../ui/RowButton';
import './AnnotationCard.css';

export function AnnotationCard({ annotation }: { annotation: Annotation }) {
  const [expanded, setExpanded] = useState(false);
  const long = annotation.quote.length > 360 || annotation.quote.split('\n').length > 4;
  return <section className="chat-annotation-card">
    <RowButton className="chat-annotation-source" title={annotation.path}
      onClick={() => openFileRef(annotation.path + (annotation.line ? `:${annotation.line}` : ''), { page: annotation.page })}>
      <FileText size={16} aria-hidden="true" />
      <span className="chat-annotation-name">{annotation.name}</span>
      {annotation.location && <span className="chat-annotation-location">· {annotation.location}</span>}
      <ArrowUpRight size={15} className="chat-annotation-open" aria-hidden="true" />
    </RowButton>
    <blockquote className={`chat-annotation-quote${long && !expanded ? ' is-collapsed' : ''}`}>{annotation.quote}</blockquote>
    {long && <RowButton className="chat-annotation-expand" aria-expanded={expanded}
      onClick={() => setExpanded(value => !value)}>{t(expanded ? 'passage.collapse' : 'passage.expand')}</RowButton>}
    {annotation.comment && <div className="chat-annotation-comment">{annotation.comment}</div>}
  </section>;
}
