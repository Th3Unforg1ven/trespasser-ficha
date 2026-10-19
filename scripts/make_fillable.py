"""Add portable AcroForms to the supplied two-page Character Record.

The published page artwork stays vector-based. The PT edition adds only a
bilingual label layer. No JavaScript is required to fill, save, or print it.
"""
from io import BytesIO
from pathlib import Path
import json

import pdfplumber
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, BooleanObject, DecodedStreamObject, DictionaryObject,
    FloatObject, NameObject, NumberObject, TextStringObject,
)
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\yurig\Downloads\Trespasser v2.1.3\Trespasser v2.1.3\Trespasser v2.1.3 - Character Record.pdf')
OUT = ROOT / 'output' / 'pdf'
TMP = ROOT / 'tmp' / 'pdfs'
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
W, H = 612, 792
SPECS = []


def text(page, name, tooltip, x, top, width, height, size=8, multiline=False,
         limit=200, align=0, border=False):
    SPECS.append(dict(page=page, name=name, tooltip=tooltip, type='text',
                      rect=[x, H-top-height, x+width, H-top], size=size,
                      multiline=multiline, limit=limit, align=align, border=border))


def box(page, name, tooltip, x, top, size=6.5, radio=None, choice=None):
    SPECS.append(dict(page=page, name=name, tooltip=tooltip, type='radio' if radio else 'check',
                      rect=[x, H-top-size, x+size, H-top], radio=radio, choice=choice))


def bottom_text(page, name, tooltip, rect, **kwargs):
    x0,y0,x1,y1=rect
    text(page,name,tooltip,x0,H-y1,x1-x0,y1-y0,**kwargs)


def inset(rect, gap=1.5):
    x0,y0,x1,y1=rect
    return [x0+gap,y0+gap,x1-gap,y1-gap]


def make_specs():
    text(0,'identity_name','Nome do personagem / Name',258.3,52.2,133.2,16,10,limit=90)
    text(0,'identity_player','Jogador / Player',459.9,52.2,128.4,16,9,limit=90)
    text(0,'identity_motto','Palavras para viver / Words to live by',328.5,79.7,259.7,16,8.5,limit=160)
    for key,pt,top,height in [('might','Força',151.2,17.4),('agility','Agilidade',171.6,20.5),
                              ('intellect','Intelecto',195,17.8),('spirit','Espírito',215.6,17.5)]:
        text(0,f'attribute_{key}',f'{pt} / {key.title()}',107,top,56.8,height,13,limit=2,align=1)
        box(0,'key_attribute',f'Atributo-chave: {pt}',176.5,top+3,8.5,radio='key_attribute',choice=key)
    text(0,'skill_bonus','Bônus de perícia / Skill bonus',66.2,247.8,21.8,12.8,9,limit=4,align=1)
    text(0,'skill_die','Dado de perícia / Skill die',167.6,247.8,22.2,12.8,9,limit=5,align=1)
    skills=[('acrobatics','Acrobacia',0,0),('alchemy','Alquimia',0,1),('athletics','Atletismo',0,2),('crafting','Manufatura',0,3),
            ('folklore','Folclore',1,0),('letters','Letras',1,1),('magic','Magia',1,2),('nature','Natureza',1,3),
            ('perception','Percepção',2,0),('speech','Oratória',2,1),('stealth','Furtividade',2,2),('tinkering','Engenharia',2,3)]
    for key,pt,col,row in skills:
        box(0,f'skill_{key}',f'Perícia treinada: {pt} / {key.title()}',[67.2,122.9,185.6][col],278.6+11.1*row,6.5)
    for key,pt,top,height in [('explore','Explorar / Explore',333,15.1),('encounter','Encontro / Encounter',351,14.6)]:
        text(0,key,pt,176.6,top,14.8,height,size=10,limit=4,align=1)
    # Current resources have genuine shared parent fields across both pages.
    for key,pt,top in [('hp','Pontos de vida / Hit points',151),('recovery','Dados de recuperação / Recovery dice',171.3),('endurance','Resistência / Endurance',191.4)]:
        text(0,f'{key}_current',pt+' - atual',322.1,top,32.1,17.1,11,limit=4,align=1)
        text(0,f'{key}_total',pt+' - total',366.1,top,29.3,17.1,11,limit=4,align=1)
    text(0,'hp_current','Pontos de vida atuais / Current hit points',207,24,27,12.6,8,limit=4,align=1,border=True)
    text(0,'recovery_current','Dados de recuperação atuais',472,24,23,12.6,8,limit=4,align=1,border=True)
    text(0,'focus_current','Foco atual / Focus',578,24,23,12.6,8,limit=4,align=1,border=True)
    text(1,'focus_current','Foco atual / Focus',66,24,23,12.6,8,limit=4,align=1,border=True)
    text(1,'recovery_current','Dados de recuperação atuais',212,24,23,12.6,8,limit=4,align=1,border=True)
    text(1,'hp_current','Pontos de vida atuais / Current hit points',462,24,27,12.6,8,limit=4,align=1,border=True)
    text(0,'plights','Aflições / Plights',214.9,233.2,180.3,31,7,True,450)
    for i,top in enumerate([291.8,319.3,346.7],1):
        text(0,f'injury_{i}',f'Ferimento {i} / Injury',215.1,top,147.9,18.8,8,limit=140)
        text(0,f'injury_clock_{i}',f'Relógio do ferimento {i}',378.2,top+2.6,14.2,14.4,9,limit=2,align=1)
    text(0,'level','Nível / Level',461.3,145.8,20.3,15,11,limit=2,align=1)
    text(0,'xp_current','Experiência atual / Current XP',525.1,145.8,31.1,15,10,limit=5,align=1)
    text(0,'xp_next','Experiência para o próximo nível / Next XP',559.2,145.8,30.1,15,10,limit=5,align=1)
    for key,pt,top in [('lineage','Linhagem / Lineage',171.2),('past_life','Vida passada / Past life',195),('calling','Vocação / Calling',220.2)]:
        text(0,key,pt,485.6,top,103.8,15.3,8,limit=100)
    for i,top in enumerate([245,263.7,282.5],1):
        text(0,f'craft_{i}',f'Ofício {i} / Craft',485.3,top,104.1,15.3,8,limit=100)
    for i,top in enumerate([326.5,346.5],1):
        text(0,f'alignment_{i}',f'Traço de alinhamento {i} / Alignment',459.1,top,88.4,16,7.5,limit=90)
        for side,x in [('deny',420.2),('affirm',553.6)]:
            for j in range(3):
                box(0,f'alignment_{i}_{side}_{j+1}',f'Traço {i}: '+('negar' if side=='deny' else 'afirmar')+f' marca {j+1}',x+12.3*j,top+4,6)
    text(0,'features','Características e talentos / Features & talents',20,410,173.5,249,8,True,5000)
    for i,(hand,top) in enumerate([('main',419.5),('off',435.4)]):
        for key,pt,x,width in [('name','Arma',264,90.4),('damage','Dados de dano',357.4,24.1),('range','Tipos e alcance',384.5,102),('properties','Propriedades',489.5,98)]:
            text(0,f'weapon_{hand}_{key}',f'{pt} - '+('mão principal' if i==0 else 'mão secundária'),x,top,width,13,7.5,limit=150)
    armor=[('head','Cabeça'),('body','Corpo'),('arms','Braços'),('legs','Pernas'),('outer','Cobertura'),('shield','Escudo')]
    for i,(slot,pt) in enumerate(armor):
        top=470.2+i*16.3
        for key,label,x,width in [('name','peça',264,90.4),('weight','peso L/H',357.4,24.1),('ar','AR',384.5,22.4),('die','dado',409.9,21.5),('properties','propriedades',434.4,153)]:
            text(0,f'armor_{slot}_{key}',f'{pt}: {label}',x,top,width,13,7.3,limit=150)
    for i,(slot,pt) in enumerate([('amulet','Amuleto'),('ring','Anel'),('talisman','Talismã')]):
        text(0,f'magic_{slot}_name',pt,264,586.2+i*16.5,90.4,13.3,7.5,limit=100)
        text(0,f'magic_{slot}_effect',pt+' - efeito',357.4,586.2+i*16.5,230,13.3,7,limit=240)
    for i in range(5):
        for side,x,width in [('base',219.4,178.4),('might',400.8,177)]:
            text(0,f'inventory_{side}_{i+1}',f'Inventário: espaço '+('base' if side=='base' else 'de Might')+f' {i+1}',x,666.5+i*19.8,width,16.3,7.5,limit=190)
    # Page 2: combat, states, equipment effects and every blank deed block.
    combat=[('initiative','Iniciativa',708.7,725.9),('accuracy','Precisão',690.7,708.1),('guard','Guarda',672.7,690.1),('resist','Resistir',654.7,672.1),('prevail','Prevalecer',636.7,654.1),('tenacity','Tenacidade',619.1,636.1)]
    for key,pt,y0,y1 in combat:
        bottom_text(1,key,pt,inset([180.1,y0,205.6,y1]),size=10,limit=5,align=1)
    bottom_text(1,'speed_base','Velocidade base / Base speed',inset([65,591.3,80.4,609.1],1),size=9,limit=3,align=1)
    bottom_text(1,'speed_bonus','Bônus de velocidade / Speed bonus',inset([81,591.3,96.5,609.1],1),size=9,limit=3,align=1)
    for i,x in enumerate([171.9,183.8,195.7],1):box(1,f'resolve_{i}',f'Determinação / Resolve: ponto {i}',x,H-607.9,8.3)
    positives=['accurate','guarded','fortified','hastened','mending','strong','swift','willful']
    negatives=['inaccurate','unguarded','frail','hindered','afflicted','weak','slow','weary']
    for i,(pos,neg) in enumerate(zip(positives,negatives)):
        for key,x,w in [(pos,66.8,14.3),(neg,135.9,13.4)]:
            bottom_text(1,f'state_{key}',f'Intensidade: {key}',[x,538.1-12.8*i,x+w,547.4-12.8*i],size=7,limit=2,align=1)
    for i,key in enumerate(['bleeding','blinded','burning','staggered','toppled']):
        bottom_text(1,f'state_{key}',f'Intensidade: {key}',[66.8,429.4-12.7*i,81.1,438.8-12.7*i],size=7,limit=2,align=1)
    for i,(y0,y1) in enumerate([(353.1,364.7),(328.4,340),(303.9,315.5)],1):
        bottom_text(1,f'custom_state_{i}',f'Estado personalizado {i}',[20,y0+1,56,y1-1],size=6.4,limit=30)
        bottom_text(1,f'custom_intensity_{i}',f'Intensidade personalizada {i}',[66.8,y0+1,81.1,y1-1],size=7,limit=2,align=1)
        bottom_text(1,f'custom_effect_{i}',f'Efeito do estado personalizado {i}',[92,y0-9.5,209,y1],size=6.5,multiline=True,limit=180)
    bottom_text(1,'weapon_main_damage','Dados de dano da arma principal',inset([52,240.1,74,254.9],1),size=7.5,limit=20)
    bottom_text(1,'weapon_main_range','Tipos e alcance da arma principal',inset([74.6,240.1,192,254.9],1),size=7.2,limit=150)
    bottom_text(1,'weapon_main_effect','Efeito da arma principal',inset([52,224,192,239.5],1),size=7,limit=180)
    armor_y=[(189.8,206.6),(172.5,189.2),(155.1,171.9),(137.7,154.5),(120.4,137.1),(104.2,119.8)]
    for (slot,pt),(y0,y1) in zip(armor,armor_y):
        bottom_text(1,f'armor_{slot}_die',f'{pt}: dado de armadura',inset([52.1,y0,73.5,y1],1),size=7.3,limit=150)
        bottom_text(1,f'armor_{slot}_effect',f'{pt}: efeito da armadura',inset([74.1,y0,192.3,y1],1),size=6.8,limit=180)
        box(1,f'armor_{slot}_spent',f'{pt}: dado de armadura gasto',199.6,H-(y1-2.8),7.2)
    deed_boxes={
        'light':[(423,689.38,597.74,752.5),(244.73,617.68,419.47,685.91),(422.58,617.68,597.32,685.91),(244.98,545.86,419.72,614.09),(422.82,545.86,597.56,614.09)],
        'heavy':[(244.92,443.29,419.66,533.26),(423.06,443.29,597.8,533.26),(245.16,350.01,419.9,439.98),(423.06,350.01,597.8,439.98)],
        'mighty':[(244.92,237.18,419.66,340.34),(423,237.18,597.74,340.34),(245.16,131.05,419.9,234.21),(423.24,131.05,597.98,234.21)],
        'special':[(245.16,15.6,419.9,118.76),(423.29,15.6,598.03,118.76)]}
    for kind,rects in deed_boxes.items():
        for i,(x0,y0,x1,y1) in enumerate(rects,1):
            bottom_text(1,f'deed_{kind}_{i}_name',f'Feito {kind} {i}: nome',[x0+3,y1-17,x1-49,y1-3],size=8,limit=120)
            # Body spans ruled writing space, with a font aligned near the rules.
            bottom_text(1,f'deed_{kind}_{i}_effect',f'Feito {kind} {i}: ação, alvo, alcance e efeito',[x0+3,y0+3,x1-3,y1-25],size=7,multiline=True,limit=1200)
            if kind!='light':
                for j in range(3):
                    box(1,f'deed_{kind}_{i}_mark_{j+1}',f'Feito {kind} {i}: marca de foco {j+1}',x1-31.4+9.84*j,H-(y1-5.1),7.2)


def stream(writer, data, width, height):
    obj=DecodedStreamObject()
    obj.set_data(data.encode('ascii'))
    obj.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Form'),
                NameObject('/FormType'):NumberObject(1),NameObject('/BBox'):ArrayObject([FloatObject(x) for x in [0,0,width,height]]),
                NameObject('/Resources'):DictionaryObject()})
    return writer._add_object(obj)


def add_form(writer):
    helv=writer._add_object(DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),
                                            NameObject('/BaseFont'):NameObject('/Helvetica'),NameObject('/Encoding'):NameObject('/WinAnsiEncoding')}))
    fields=ArrayObject()
    form=DictionaryObject({NameObject('/Fields'):fields,NameObject('/NeedAppearances'):BooleanObject(False),
                           NameObject('/DA'):TextStringObject('/Helv 8 Tf 0 g'),
                           NameObject('/DR'):DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/Helv'):helv})})})
    writer._root_object[NameObject('/AcroForm')]=writer._add_object(form)
    parents={}
    for s in SPECS:
        name=s['name']
        if name not in parents:
            f=DictionaryObject({NameObject('/T'):TextStringObject(name),NameObject('/TU'):TextStringObject(s['tooltip']),NameObject('/Kids'):ArrayObject()})
            if s['type']=='text':
                f.update({NameObject('/FT'):NameObject('/Tx'),NameObject('/V'):TextStringObject(''),NameObject('/DV'):TextStringObject(''),
                          NameObject('/Ff'):NumberObject(4096 if s['multiline'] else 0),NameObject('/MaxLen'):NumberObject(s['limit']),
                          NameObject('/Q'):NumberObject(s['align']),NameObject('/DA'):TextStringObject(f"/Helv {s['size']} Tf 0 g")})
            else:
                f.update({NameObject('/FT'):NameObject('/Btn'),NameObject('/Ff'):NumberObject(32768 if s['type']=='radio' else 0),
                          NameObject('/V'):NameObject('/Off'),NameObject('/DV'):NameObject('/Off')})
            ref=writer._add_object(f);fields.append(ref);parents[name]=(f,ref)
        f,ref=parents[name]
        x0,y0,x1,y1=s['rect'];w=x1-x0;h=y1-y0
        widget=DictionaryObject({NameObject('/Type'):NameObject('/Annot'),NameObject('/Subtype'):NameObject('/Widget'),
                                 NameObject('/Rect'):ArrayObject([FloatObject(x) for x in s['rect']]),NameObject('/F'):NumberObject(4),
                                 NameObject('/Parent'):ref,NameObject('/P'):writer.pages[s['page']].indirect_reference,
                                 NameObject('/Border'):ArrayObject([NumberObject(0),NumberObject(0),NumberObject(0)]),
                                 NameObject('/BS'):DictionaryObject({NameObject('/W'):NumberObject(0)})})
        off=stream(writer,'q Q',w,h)
        if s['type']=='text':
            widget[NameObject('/DA')]=TextStringObject(f"/Helv {s['size']} Tf 0 g")
            widget[NameObject('/AP')]=DictionaryObject({NameObject('/N'):off})
            if s['border']:
                widget[NameObject('/BS')]=DictionaryObject({NameObject('/W'):FloatObject(.4),NameObject('/S'):NameObject('/S')})
                widget[NameObject('/MK')]=DictionaryObject({NameObject('/BC'):ArrayObject([NumberObject(0)]),NameObject('/BG'):ArrayObject([NumberObject(1)])})
        else:
            on_name=NameObject('/'+(s['choice'] if s['type']=='radio' else 'Yes'))
            mark=f'q 0 G 1 w 1.4 {h*.52:.2f} m {w*.40:.2f} 1.4 l {w-1.2:.2f} {h-1.2:.2f} l S Q'
            on=stream(writer,mark,w,h)
            widget[NameObject('/AP')]=DictionaryObject({NameObject('/N'):DictionaryObject({NameObject('/Off'):off,on_name:on})})
            widget[NameObject('/AS')]=NameObject('/Off')
        wr=writer._add_object(widget);f['/Kids'].append(wr)
        page=writer.pages[s['page']]
        if '/Annots' not in page:page[NameObject('/Annots')]=ArrayObject()
        page['/Annots'].append(wr)
    for page in writer.pages:page[NameObject('/Tabs')]=NameObject('/S')


def bilingual_overlay(page_index, words):
    buf=BytesIO();c=canvas.Canvas(buf,pagesize=(W,H))
    def label(x,top,width,height,pt,en,size=12,font='Pirata',black=False,align='center',pad=3):
        c.setFillColorRGB(*( (0,0,0) if black else (1,1,1) ));c.rect(x-.6,H-top-height-.1,width+1.2,height+pad+.1,fill=1,stroke=0)
        c.setFillColorRGB(*( (1,1,1) if black else (0,0,0) ))
        size=min(size,(width-1)/max(.1,pdfmetrics.stringWidth(pt,font,1)))
        c.setFont(font,size)
        y=H-top-height+height*(.48 if height<=12 else .34)
        if align=='right':c.drawRightString(x+width,y,pt)
        elif align=='left':c.drawString(x,y,pt)
        else:c.drawCentredString(x+width/2,y,pt)
        if en:
            en_size=min(4.2,height*.33,(width-.5)/max(.1,pdfmetrics.stringWidth(en,'Helvetica',1)))
            c.setFont('Helvetica',en_size);c.drawCentredString(x+width/2,H-top-height+.4,en)
    if page_index==0:
        for args in [
            (142,23.6,62,13,'Pontos de vida','Hit Points',10),(399,23.6,71,13,'Dados de recuperação','Recovery Dice',9),(546,23.6,31,13,'Foco','Focus',10),
            (103,90.8,87,12.1,'Ficha de personagem','Character Record',8),
            (210,54,38,15.1,'Nome','Name',11),(403,54,46,15.1,'Jogador','Player',11),(208,81,111,15.7,'Palavras para viver','Words to Live By',11),
            (23,117.5,169,20,'Atributos & perícias','Attributes & Skills',14),(216,117,180,20,'Saúde & recuperação','Health & Healing',14),(418,117,173,17,'Avanço','Advancement',14),
            (121,140.6,27,7.8,'Valor','Score',6),
            (26,153.5,70,16.2,'Força','Might',12),(26,176.8,70,16.2,'Agilidade','Agility',12),(26,197.3,70,16.2,'Intelecto','Intellect',12),(26,217.9,70,16.2,'Espírito','Spirit',12),
            (22,247.4,35,14.2,'Perícia','Skill',10),(98,247.4,60,14.2,'Dado de perícia','Skill Die',10),
            (314,140,44,8,'Atual','Current',5.5),(364,140,34,8,'Total','Total',5.5),
            (218,154.5,94,15.1,'Pontos de vida','Hit Points',11),(218,174.8,94,15.1,'Dados de recuperação','Recovery Dice',10),(218,195,94,15,'Resistência','Endurance',11),
            (267,218,82,15.3,'Aflições','Plights',12),(263,274.5,91,14.9,'Ferimentos','Injuries',12),(367,278,33,8,'Relógios','Clocks',5.5),
            (419,148.7,34,13.2,'Nível','Level',10),(526,134.4,65,8.8,'Atual / Próximo','Current / Next',5.2),
            (416,173.5,60,14.3,'Linhagem','Lineage',10),(415,197.4,61,14.3,'Vida passada','Past Life',10),(415,222.5,61,14.1,'Vocação','Calling',10),(416,266.6,60,14.2,'Ofícios','Crafts',10),
            (465,307.8,77,16.8,'Alinhamento','Alignment',12),(416,316,33,8,'Negar','Deny',6),(553,316,36,8,'Afirmar','Affirm',6),
            (102,335,65,14,'Explorar','Explore',10),(100,352.8,68,14,'Encontro','Encounter',10),
            (25,384.8,164,21,'Características & talentos','Features & Talents',13),(334,383.1,130,18.5,'Equipamento','Equipment',14),
            (275,407.2,62,9,'Arma','Weapon',6.7),(386,407.2,98,9,'Tipos & alcance','Types & Range',6.7),(489,407.2,99,9,'Propriedades','Properties',6.7),
            (208,421.5,52,11,'Principal','Main Hand',6.4),(208,437.4,52,11,'Secundária','Off Hand',6.2),
            (280,457.2,57,9,'Armadura','Armor',6.7),(357,457.2,25,9,'Peso','Weight',6),(409,457.2,23,9,'Dado','Die',6),(435,457.2,150,9,'Propriedades','Properties',6.7),
            (275,573.5,65,10,'Item mágico','Magic Item',6.7),(410,572,117,10,'Efeito','Effect',6.7),
            (344,642.7,116,17.5,'Inventário','Inventory',13),(277,657,50,7,'Espaços base','Base slots',5),(463,657,80,7,'Espaços Might','Might slots',5),
            (37,678.2,145,16,'Centelhas & sombras','Sparks & Shadows',12),
        ]:label(*args)
        for pt,en,col,row in [('Acrobacia','Acrobatics',0,0),('Alquimia','Alchemy',0,1),('Atletismo','Athletics',0,2),('Manufatura','Crafting',0,3),('Folclore','Folklore',1,0),('Letras','Letters',1,1),('Magia','Magic',1,2),('Natureza','Nature',1,3),('Percepção','Perception',2,0),('Oratória','Speech',2,1),('Furtividade','Stealth',2,2),('Engenharia','Tinkering',2,3)]:
            label([18,82,139][col],277.4+11.1*row,[47,38,44][col],10.4,pt,en,6.2,'Helvetica',pad=0)
        for i,(pt,en) in enumerate([('Cabeça','Head'),('Corpo','Body'),('Braços','Arms'),('Pernas','Legs'),('Cobertura','Outer'),('Escudo','Shield')]):label(208,472.5+i*16.3,52,10,pt,en,6.2,'Helvetica')
        for i,(pt,en) in enumerate([('Amuleto','Amulet'),('Anel','Ring'),('Talismã','Talisman')]):label(208,588.8+i*16.5,52,10,pt,en,6.2,'Helvetica')
    else:
        label(31,23.6,33,13,'Foco','Focus',10);label(139,23.6,71,13,'Dados de recuperação','Recovery Dice',9);label(399,23.6,62,13,'Pontos de vida','Hit Points',10)
        # PDF extraction reports logical advances, which are narrower than the
        # ink of the original all-cap display font. Mask whole label lanes.
        label(22,43.3,186,21.5,'Valores de combate','Combat Values',14,pad=0)
        c.setFillColorRGB(1,1,1);c.rect(104,H-173.8,74.4,108.5,fill=1,stroke=0)
        combat_pt=[('Iniciativa','Initiative'),('Precisão','Accuracy'),('Guarda','Guard'),('Resistir','Resist'),('Prevalecer','Prevail'),('Tenacidade','Tenacity')]
        for i,(pt,en) in enumerate(combat_pt):
            top=66.8+i*18
            label(105,top,71.5,15.8,pt,en,11,pad=0)
            c.setStrokeColorRGB(0,0,0);c.setLineWidth(.4);c.line(105,H-(83.7+i*18),170,H-(83.7+i*18))
        label(17,183.7,43,17,'Velocidade','Speed',10.5,pad=0)
        label(107,183.7,52,17,'Determinação','Resolve',10.5,pad=0)
        label(20,219.2,190,22,'Estados','States',14,pad=0)
        c.setFillColorRGB(1,1,1)
        c.rect(15,H-345.1,49.5,103,fill=1,stroke=0)
        c.rect(151.6,H-345.1,62.9,103,fill=1,stroke=0)
        paired=[('Preciso','Accurate','Impreciso','Inaccurate'),('Protegido','Guarded','Desprotegido','Unguarded'),('Fortificado','Fortified','Frágil','Frail'),('Acelerado','Hastened','Atrasado','Hindered'),('Regenerando','Mending','Afligido','Afflicted'),('Forte','Strong','Enfraquecido','Weak'),('Veloz','Swift','Lento','Slow'),('Determinado','Willful','Exausto','Weary')]
        for i,(pt,en,pt2,en2) in enumerate(paired):
            label(17,244.1+12.8*i,46,11.3,pt,en,6.6,'Helvetica',pad=0)
            label(153,244.1+12.8*i,60,11.3,pt2,en2,6.6,'Helvetica',pad=0)
        c.setFillColorRGB(1,1,1);c.rect(15,H-416.4,49.5,66,fill=1,stroke=0)
        for i,(pt,en) in enumerate([('Sangrando','Bleeding'),('Cego','Blinded'),('Em chamas','Burning'),('Cambaleante','Staggered'),('Derrubado','Toppled')]):
            label(17,352.6+12.7*i,46,11.3,pt,en,6.6,'Helvetica',pad=0)
        label(20,501,190,22.5,'Efeitos de equipamento','Equipment Effects',14,pad=0)
        label(78,525.1,114,10.7,'Tipos & alcance','Types & Ranges',7,pad=0)
        label(16,540.5,34,12,'Dano','Damage',7,pad=0)
        label(16,556.6,34,12,'Efeito','Effect',7,pad=0)
        label(52,573.5,21.5,9.8,'Dado','Die',6.5,pad=0)
        label(77,573.5,115,9.8,'Efeito da armadura','Armor Effect',6.5,pad=0)
        c.setFillColorRGB(1,1,1);c.rect(15,H-688.3,36,103,fill=1,stroke=0)
        for i,(pt,en) in enumerate([('Cabeça','Head'),('Corpo','Body'),('Braços','Arms'),('Pernas','Legs'),('Cobertura','Outer'),('Escudo','Shield')]):
            label(16,588.4+17.3*i,34,12,pt,en,6.6,'Helvetica',pad=0)
        label(20,702,190,23,'Centelhas','Sparks',14,pad=0)
        for pt,en,y0,y1 in [('LEVES','LIGHT',545.8,752.5),('PESADOS','HEAVY',350,533.3),('PODEROSOS','MIGHTY',131,340.4),('ESPECIAIS','SPECIAL',15.6,118.8)]:
            c.setFillColorRGB(0,0,0);c.rect(219.3,y0,24,y1-y0,fill=1,stroke=0)
            c.saveState();c.translate(229.2,(y0+y1)/2);c.rotate(90);c.setFillColorRGB(1,1,1);c.setFont('Pirata',16);c.drawCentredString(0,0,pt);c.setFont('Helvetica',4.8);c.drawCentredString(0,-7,en);c.restoreState()
    c.showPage();c.save();buf.seek(0)
    return PdfReader(buf).pages[0]


def build(translated=False):
    reader=PdfReader(SOURCE);writer=PdfWriter();writer.clone_document_from_reader(reader)
    if translated:
        pdfmetrics.registerFont(TTFont('Pirata',str(ROOT/'dist/assets/fonts/PirataOne-Regular.ttf')))
        with pdfplumber.open(SOURCE) as doc:
            for i,page in enumerate(writer.pages):page.merge_page(bilingual_overlay(i,doc.pages[i].extract_words()))
    add_form(writer)
    writer.add_metadata({'/Title':'Trespasser 2.1.3 - Ficha preenchível'+(' - Português e inglês' if translated else ' - Original'),
                         '/Subject':'Ficha com campos AcroForm. Preenchimento manual; sem dependência de JavaScript.',
                         '/Creator':'Adaptação preenchível da Character Record fornecida pelo usuário',
                         '/Lang':'pt-BR' if translated else 'en-US'})
    writer._root_object[NameObject('/Lang')]=TextStringObject('pt-BR' if translated else 'en-US')
    file=OUT/('Trespasser-2.1.3-Ficha-Editavel-PT-EN.pdf' if translated else 'Trespasser-2.1.3-Character-Record-Editavel.pdf')
    writer.write(file)
    return file


if __name__=='__main__':
    make_specs()
    (TMP/'field-specs.json').write_text(json.dumps(SPECS,ensure_ascii=False,indent=2),encoding='utf8')
    for translated in [False,True]:
        path=build(translated)
        r=PdfReader(path)
        print(path.name, len(r.pages),'páginas,',len(r.get_fields()),'campos,',sum(len(p['/Annots']) for p in r.pages),'widgets')
