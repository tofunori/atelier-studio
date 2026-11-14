"""Fixture e2e `zones.docx` : la fixture d'atelier-docx (christophe) avec des
zones de texte et formes synthétiques (valeurs inventées), comme Word les
écrit. Outil de test, à relancer seulement si la fixture doit changer :

    python3 gallery/tests/e2e/fixtures/make_zones.py \
        rust/crates/atelier-docx/tests/fixtures/christophe \
        gallery/tests/e2e/fixtures/zones.docx
"""
import sys, zipfile, os
src, out = sys.argv[1], sys.argv[2]

def box(x, y, w, h, z, lines, color=None):
    e = lambda pt: pt * 12700
    rpr = f'<w:rPr><w:color w:val="{color}"/></w:rPr>' if color else ''
    paras = ''.join(f'<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>{rpr}<w:t>{l}</w:t></w:r></w:p>' for l in lines)
    return (f'<w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>'
            f'<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="{z}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
            f'<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>{e(x)}</wp:posOffset></wp:positionH>'
            f'<wp:positionV relativeFrom="paragraph"><wp:posOffset>{e(y)}</wp:posOffset></wp:positionV>'
            f'<wp:extent cx="{e(w)}" cy="{e(h)}"/><wp:effectExtent l="12700" t="12700" r="12700" b="12700"/><wp:wrapNone/>'
            f'<wp:docPr id="{z}" name="Rectangle {z}"/><wp:cNvGraphicFramePr/><a:graphic>'
            f'<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr/><wps:spPr>'
            f'<a:xfrm><a:off x="0" y="0"/><a:ext cx="{e(w)}" cy="{e(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            f'<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="25400"><a:solidFill><a:srgbClr val="F79646"/></a:solidFill></a:ln></wps:spPr>'
            f'<wps:txbx><w:txbxContent>{paras}</w:txbxContent></wps:txbx>'
            f'<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="ctr" anchorCtr="0"><a:noAutofit/></wps:bodyPr>'
            f'</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict>'
            f'<v:rect style="position:absolute;margin-left:{x}pt;margin-top:{y}pt;width:{w}pt;height:{h}pt;z-index:{z};v-text-anchor:middle" fillcolor="white" strokecolor="#f79646" strokeweight="2pt">'
            f'<v:textbox><w:txbxContent>{paras}</w:txbxContent></v:textbox></v:rect></w:pict></mc:Fallback></mc:AlternateContent></w:r>')

OLD = ('<w:r><w:pict><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"/>'
       '<v:shape id="Zone 1" type="#_x0000_t202" style="position:absolute;margin-left:300pt;margin-top:4pt;width:120pt;height:28pt;z-index:5">'
       '<v:textbox><w:txbxContent><w:p><w:r><w:t>Ancien Word</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>')
ARROW = ('<w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor behindDoc="0" relativeHeight="7">'
         '<wp:positionH relativeFrom="column"><wp:posOffset>2540000</wp:posOffset></wp:positionH>'
         '<wp:positionV relativeFrom="paragraph"><wp:posOffset>254000</wp:posOffset></wp:positionV>'
         '<wp:extent cx="1143000" cy="0"/><wp:wrapNone/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
         '<wps:wsp><wps:cNvCnPr/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1143000" cy="0"/></a:xfrm><a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom>'
         '<a:ln w="19050"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></wps:spPr><wps:bodyPr/></wps:wsp>'
         '</a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice><mc:Fallback><w:pict/></mc:Fallback></mc:AlternateContent></w:r>')

files = []
for root, _, names in os.walk(src):
    for n in names:
        full = os.path.join(root, n)
        files.append((os.path.relpath(full, src).replace(os.sep, '/'), full))
files.sort(key=lambda f: (f[0] != '[Content_Types].xml', f[0]))
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel, full in files:
        data = open(full, 'rb').read()
        if rel == 'word/document.xml':
            doc = data.decode('utf-8')
            at = doc.index('<w:r><w:drawing><wp:inline')
            doc = doc[:at] + box(190, 20, 100, 36, 2, ['H = 0,4 m'], '00B050') + box(0, 60, 150, 30, 3, ['Niveau initial', '= 12,5 m']) + doc[at:]
            i = doc.index('<w:t>Ces valeurs sont')
            at = doc.rindex('<w:r>', 0, i)
            doc = doc[:at] + OLD + ARROW + doc[at:]
            data = doc.encode('utf-8')
        info = zipfile.ZipInfo(rel, date_time=(2026, 11, 14, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
