import { expect, it } from 'vitest';
import { annotationDisplayText } from './annotationDisplayText';
const annotation = {name:'main.pdf',lines:null,text:'main.pdf (p.7) : « Passage sélectionné »\nCommentaire : Pourquoi ce seuil ?',pdfAnnotation:{origin:'http://localhost',rel:'main.pdf',id:'a1'}};
it('shows the passage and comment for an attachment-only direct send',()=>{
  expect(annotationDisplayText('',[annotation])).toBe(annotation.text);
});
it('keeps the typed prompt and every annotation, excluding ordinary file instructions',()=>{
  const second={...annotation,text:'Second passage\nCommentaire : À préciser',pdfAnnotation:{origin:'http://localhost',rel:'main.pdf',id:'a2'}};
  expect(annotationDisplayText('Vérifie',[annotation,second,{name:'data.csv',lines:null,text:'Read data.csv'}])).toBe(`Vérifie\n\n${annotation.text}\n\n${second.text}`);
  expect(annotationDisplayText('',[{name:'data.csv',lines:null,text:'Read data.csv'}])).toBe('');
});
