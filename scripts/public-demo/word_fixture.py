"""Write a fictional Word manuscript (tracked changes, comments, a figure, an equation)."""
from pathlib import Path
from xml.sax.saxutils import escape
import zipfile

AUTHOR = 'Jordan Lee'      # fictional author of the manuscript
REVIEWER = 'Sam Rivera'    # fictional co-author who returned the review
W = ('xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
     'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
     'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
     'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
     'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
     'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
     'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
     'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
     'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14 w15"')
_para = [0]
_rev = [100]


def pid():
    _para[0] += 1
    return f'3D00{_para[0]:04X}'


def t(text, rpr=''):
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def ins(text, who=REVIEWER, date='2026-03-12T09:14:00Z'):
    _rev[0] += 1
    return f'<w:ins w:id="{_rev[0]}" w:author="{who}" w:date="{date}">{t(text)}</w:ins>'


def dele(text, who=REVIEWER, date='2026-03-12T09:14:00Z'):
    _rev[0] += 1
    return f'<w:del w:id="{_rev[0]}" w:author="{who}" w:date="{date}"><w:r><w:delText xml:space="preserve">{escape(text)}</w:delText></w:r></w:del>'


def commented(ids, text):
    starts = ''.join(f'<w:commentRangeStart w:id="{i}"/>' for i in ids)
    ends = ''.join(f'<w:commentRangeEnd w:id="{i}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="{i}"/></w:r>' for i in ids)
    return starts + t(text) + ends


def p(body, style=None, jc='both'):
    ppr = f'<w:pStyle w:val="{style}"/>' if style else ''
    if jc and not style:
        ppr += f'<w:jc w:val="{jc}"/>'
    i = pid()
    return f'<w:p w14:paraId="{i}" w14:textId="{i}"><w:pPr>{ppr}</w:pPr>{body}</w:p>'


def figure(rid, cx, cy):
    return (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/>'
            f'<wp:docPr id="1" name="Figure 1"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
            f'<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="figure1.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/>'
            f'<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


def mr(text):
    return f'<m:r><m:t>{escape(text)}</m:t></m:r>'


def sin(arg):
    return f'<m:func><m:fName>{mr("sin")}</m:fName><m:e>{mr(arg)}</m:e></m:func>'


EQUATION = f'<m:oMathPara><m:oMath>{mr("s(t)=0.45")}{sin("t")}{mr("+0.09")}{sin("4t")}</m:oMath></m:oMathPara>'

COMMENTS = [
    # id, author, date, text, parent id
    (1, REVIEWER, '2026-03-12T09:20:00Z', 'Could you state the two window lengths here? Readers meet them only in the figure caption.', None),
    (2, AUTHOR, '2026-03-13T15:02:00Z', 'Good point. I will give both lengths in days and keep the caption short.', 1),
    (3, REVIEWER, '2026-03-12T09:31:00Z', 'Is "broad pattern" defined anywhere? Consider "slow component" to match the equation.', None),
    (4, REVIEWER, '2026-03-12T09:40:00Z', 'This limit deserves its own sentence in the discussion as well.', None),
]


def document(image_rid):
    body = [
        p(t('Observation windows and visible patterns'), 'Title'),
        p(t(f'{AUTHOR} · Atelier demonstration · Draft 3'), 'Subtitle'),
        p(t('1. A question of scale'), 'Heading1'),
        p(t('A time series can tell different stories depending on the window through which it is observed. ')
          + dele('Short windows keep')
          + ins('Short windows retain')
          + t(' local variation, while ')
          + commented([1, 2], 'longer windows make the broad pattern easier to follow')
          + t('.')),
        p(t('This fictional study uses a synthetic signal to illustrate the comparison. It demonstrates a research workflow ')
          + ins('and does not report an empirical finding')
          + dele('only')
          + t('.')),
        p(t('2. An illustrative signal'), 'Heading1'),
        p(t('We combine a ') + commented([3], 'slowly varying component') + t(' with a smaller, faster oscillation. The construction is explicit and reproducible:')),
        p(EQUATION, jc='center'),
        p(t('Both components are generated mathematically; neither represents a measurement from a real site. Figure 1 shows the signal through two observation windows.')),
        p(figure(image_rid, 5486400, 3169920), jc='center'),
        p(t('Figure 1. ', '<w:rPr><w:b/></w:rPr>') + t('One synthetic signal seen through a short and a long observation window. Synthetic data.'), 'Caption'),
        p(t('3. Interpretation and limits'), 'Heading1'),
        p(t('A smooth curve is easier to read, but smoothing also removes detail. ')
          + commented([4], 'The choice of window should therefore follow the question being asked')
          + t('. ')
          + ins('A real analysis would require an observation model and an uncertainty assessment.')),
    ]
    sect = ('<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
            'w:header="708" w:footer="708" w:gutter="0"/><w:lnNumType w:countBy="1" w:restart="newPage"/><w:cols w:space="708"/></w:sectPr>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document {W}><w:body>{"".join(body)}{sect}</w:body></w:document>'


def comments():
    out = []
    for cid, who, date, text, _ in COMMENTS:
        initials = ''.join(part[0] for part in who.split())
        out.append(f'<w:comment w:id="{cid}" w:author="{who}" w:date="{date}" w:initials="{initials}"><w:p w14:paraId="4C00000{cid}" w14:textId="4C00000{cid}">'
                   f'<w:pPr><w:pStyle w:val="CommentText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>{t(text)}</w:p></w:comment>')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments {W}>{"".join(out)}</w:comments>'


def comments_extended():
    out = []
    for cid, _, _, _, parent in COMMENTS:
        link = f' w15:paraIdParent="4C00000{parent}"' if parent else ''
        out.append(f'<w15:commentEx w15:paraId="4C00000{cid}"{link} w15:done="0"/>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w15:commentsEx xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
            f'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" mc:Ignorable="w15">{"".join(out)}</w15:commentsEx>')


STYLES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="360" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:sz w:val="40"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CommentText"><w:name w:val="annotation text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:rPr><w:sz w:val="16"/></w:rPr></w:style></w:styles>'''

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/><Override PartName="/word/commentsExtended.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'''

ROOT_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'''

DOC_RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/><Relationship Id="rId3" Type="http://schemas.microsoft.com/office/2011/relationships/commentsExtended" Target="commentsExtended.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/figure1.png"/></Relationships>'''

CORE = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Observation windows and visible patterns</dc:title><dc:creator>{AUTHOR}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-03-10T10:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-03-13T15:02:00Z</dcterms:modified></cp:coreProperties>'''


def write(path: Path, figure_png: Path):
    """Deterministic package: fixed timestamps so the demo repository stays stable."""
    parts = [('[Content_Types].xml', CONTENT_TYPES), ('_rels/.rels', ROOT_RELS), ('docProps/core.xml', CORE),
             ('word/_rels/document.xml.rels', DOC_RELS), ('word/document.xml', document('rId4')),
             ('word/styles.xml', STYLES), ('word/comments.xml', comments()), ('word/commentsExtended.xml', comments_extended())]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, text in parts:
            z.writestr(zipfile.ZipInfo(name, (2026, 3, 13, 15, 2, 0)), text)
        z.writestr(zipfile.ZipInfo('word/media/figure1.png', (2026, 3, 13, 15, 2, 0)), figure_png.read_bytes())
