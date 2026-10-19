"""Four-page, portable AcroForm edition of the custom localhost sheet."""
from io import BytesIO
from pathlib import Path
import json

from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, TextStringObject
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

import make_fillable as form

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/Trespasser-2.1.3-Ficha-Redesenhada-Editavel-PT-EN.pdf'
TMP = ROOT / 'tmp/pdfs'
W, H = A4
form.W, form.H = W, H
form.SPECS.clear()
INK = .08
PAPER = .98
PAGE_NAMES = [('Personagem', 'Character'), ('Combate', 'Combat'),
              ('Equipamento', 'Equipment'), ('Anotações', 'Journal')]
FONT_DIR = ROOT / 'dist/assets/fonts'
for name, file in [('Pirata', 'PirataOne-Regular.ttf'), ('Lusitana', 'Lusitana-Regular.ttf'),
                   ('LusitanaBold', 'Lusitana-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_DIR / file)))
LOGO = ImageReader(ImageOps.invert(Image.open(ROOT/'dist/assets/Image16.png').convert('RGB')))
buf = BytesIO()
c = canvas.Canvas(buf, pagesize=A4)
page = 0


def rect(x, top, width, height, line=.5, fill=None):
    c.setLineWidth(line)
    c.setStrokeGray(INK)
    if fill is not None:
        c.setFillGray(fill)
    c.rect(x, H-top-height, width, height, stroke=int(line > 0), fill=int(fill is not None))


def line(x1, top1, x2, top2, width=.5, gray=.35):
    c.setStrokeGray(gray)
    c.setLineWidth(width)
    c.line(x1, H-top1, x2, H-top2)


def txt(x, top, text, size=8, font='Lusitana', gray=INK, width=None, align='left'):
    c.setFillGray(gray)
    if width:
        size = min(size, width/max(.01, pdfmetrics.stringWidth(text, font, 1)))
    c.setFont(font, size)
    y = H-top-size*.82
    if align == 'center':
        c.drawCentredString(x, y, text)
    elif align == 'right':
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)


def label(x, top, pt, en='', width=None, size=7):
    txt(x, top, pt.upper(), size, 'Helvetica-Bold', width=width)
    if en:
        txt(x, top+9, en, 5.5, 'Helvetica', gray=.36, width=width)


def field(name, tooltip, x, top, width, height=23, size=10, multiline=False,
          limit=160, align=0, ruled=False):
    rect(x, top, width, height, .45, fill=1)
    if ruled:
        for y in range(int(top+15), int(top+height-3), 12):
            line(x+4, y, x+width-4, y, .22, .86)
    form.text(page, name, tooltip, x+2, top+2, width-4, height-4,
              size=size, multiline=multiline, limit=limit, align=align)


def check(name, tooltip, x, top, size=7, radio=None, choice=None):
    if radio:
        p = c.beginPath()
        p.moveTo(x+size/2, H-top)
        p.lineTo(x+size, H-top-size/2)
        p.lineTo(x+size/2, H-top-size)
        p.lineTo(x, H-top-size/2)
        p.close()
        c.setStrokeGray(INK); c.setLineWidth(.6); c.drawPath(p, stroke=1, fill=0)
    else:
        rect(x, top, size, size, .6, fill=1)
    form.box(page, name, tooltip, x, top, size, radio=radio, choice=choice)


def panel(x, top, width, height, pt, en, heading_size=15):
    rect(x, top, width, height, 2.2)
    txt(x+width/2, top+11, pt.upper(), heading_size, 'Pirata',
        width=width-16, align='center')
    txt(x+width/2, top+31, en.upper(), 5.5, 'Helvetica-Bold',
        width=width-16, align='center')
    # Small cuts in the heavy frame echo the site's printed-ink treatment.
    c.setFillGray(PAPER)
    path = c.beginPath()
    path.moveTo(x+width-5, H-top-1)
    path.lineTo(x+width+2, H-top-8)
    path.lineTo(x+width-1, H-top-7)
    path.close()
    c.drawPath(path, fill=1, stroke=0)


def header(index):
    global page
    page = index
    c.bookmarkPage(f'page-{index}')
    c.addOutlineEntry(PAGE_NAMES[index][0], f'page-{index}', 0)
    rect(20, 20, W-40, H-40, 2.8, fill=PAPER)
    # Five-resource strip shared by all four pages.
    resources = [('hp', 'Pontos de vida', 'Hit points'),
                 ('recovery', 'Dados de recuperação', 'Recovery dice'),
                 ('endurance', 'Resistência', 'Endurance'),
                 ('focus', 'Foco', 'Focus'),
                 ('resolve', 'Determinação', 'Resolve')]
    cell = (W-44)/5
    for i, (key, pt, en) in enumerate(resources):
        x = 22+i*cell
        if i:
            c.setDash(1, 1.6); line(x, 29, x, 78, .7); c.setDash()
        txt(x+cell/2, 29, pt.upper(), 11, 'Pirata', width=cell-10, align='center')
        txt(x+cell/2, 43, en.upper(), 5, 'Helvetica-Bold', gray=.3, align='center')
        if key in ['hp', 'recovery', 'endurance']:
            field(f'{key}_current', f'{pt}: atual / Current {en}', x+22, 53, 28, 19, 12, limit=4, align=1)
            txt(x+54, 57, '/', 10)
            field(f'{key}_total', f'{pt}: máximo / Maximum {en}', x+62, 53, 26, 19, 12, limit=4, align=1)
        else:
            field(f'{key}_current', f'{pt}: atual / Current {en}', x+36, 53, 30, 19, 12, limit=4, align=1)
            if key == 'resolve':
                txt(x+71, 57, '/ 3', 9, gray=.35)
        line(x+8, 79, x+cell-8, 79, .7, INK)
        for j in range(20):
            tickx = x+8+j*(cell-16)/19
            line(tickx, 79, tickx, 74 if j%5 == 0 else 76, .45, INK)
    line(21, 85, W-21, 85, 2.8, INK)
    c.drawImage(LOGO, 32, H-143, 148, 49, mask='auto')
    txt(106, 146, 'REGISTRO DE PERSONAGEM', 10.8, 'Pirata', align='center')
    txt(106, 159, 'Character record - v2.1.3', 5.1, 'Helvetica', align='center')
    label(195, 95, 'Nome do personagem', 'Name')
    label(397, 95, 'Jogador', 'Player')
    field('identity_name', 'Nome do personagem / Name', 195, 113, 192, 23, 10, limit=85)
    field('identity_player', 'Jogador / Player', 397, 113, 164, 23, 10, limit=85)
    label(195, 143, 'Palavras para viver', 'Words to live by', width=92, size=6.3)
    field('identity_motto', 'Palavras para viver / Words to live by', 291, 142, 270, 23, 9, limit=160)
    line(21, 171, W-21, 171, 2.8, INK)
    for i, (pt, en) in enumerate(PAGE_NAMES):
        x = 22+i*(W-44)/4
        cw = (W-44)/4
        rect(x, 173, cw, 28, .45, fill=INK if i == index else .91)
        txt(x+cw/2, 179, f'0{i+1}  {pt.upper()}', 12, 'Pirata',
            gray=1 if i == index else INK, width=cw-12, align='center')
        c.linkRect('', f'page-{i}', (x, H-201, x+cw, H-173), relative=0, thickness=0)
    txt(31, 213, f'0{index+1}', 8, 'Helvetica-Bold')
    txt(53, 208, PAGE_NAMES[index][0].upper(), 17, 'Pirata')
    subtitles = ['Atributos, perícias, saúde e avanço.', 'Valores de combate, feitos e estados.',
                 'Armas, armaduras e tudo o que você carrega.', 'Diário de viagem e continuação da ficha.']
    txt(53, 227, subtitles[index], 7.3, gray=.35)
    line(21, 240, W-21, 240, 1.1, INK)


def footer():
    txt(28, 810, 'TRESPASSER V2.1.3 - REGISTRO NÃO OFICIAL', 5.6, 'Helvetica-Bold', gray=.3)
    txt(W-28, 810, f'{page+1} / 4', 6.2, 'Helvetica-Bold', gray=.3, align='right')
    c.showPage()


def character_page():
    header(0)
    x1, x2, x3 = 25, 209, 393
    cw = 177
    panel(x1, 249, cw, 551, 'Atributos & perícias', 'Attributes & skills', 14)
    label(33, 295, 'Atributo', width=85, size=5.6)
    label(131, 295, 'Valor', size=5.6)
    label(174, 295, 'Chave', size=5.3)
    for i, (key, pt, en) in enumerate([('might', 'Força', 'Might'), ('agility', 'Agilidade', 'Agility'),
                                       ('intellect', 'Intelecto', 'Intellect'), ('spirit', 'Espírito', 'Spirit')]):
        y = 310+i*37
        txt(33, y+3, pt.upper(), 15, 'Pirata', width=91)
        txt(33, y+21, en, 6, 'Helvetica', gray=.4)
        field(f'attribute_{key}', f'{pt} / {en}', 132, y+1, 34, 27, 14, limit=2, align=1)
        check('key_attribute', f'Atributo-chave: {pt} / Key attribute: {en}', 179, y+10, 9,
              radio='key_attribute', choice=key)
        line(32, y+32, 195, y+32, .4, .55)
    label(33, 464, 'Proficiência', 'Skill bonus', width=63)
    field('skill_bonus', 'Proficiência / Skill bonus', 104, 464, 29, 23, 11, limit=4, align=1)
    label(33, 493, 'Dado de perícia', 'Skill die', width=86)
    field('skill_die', 'Dado de perícia / Skill die', 146, 491, 43, 23, 11, limit=5, align=1)
    line(32, 521, 195, 521, 1, INK)
    skills = [('acrobatics', 'Acrobacia', 'Acrobatics'), ('alchemy', 'Alquimia', 'Alchemy'),
              ('athletics', 'Atletismo', 'Athletics'), ('crafting', 'Manufatura', 'Crafting'),
              ('folklore', 'Folclore', 'Folklore'), ('letters', 'Letras', 'Letters'),
              ('magic', 'Magia', 'Magic'), ('nature', 'Natureza', 'Nature'),
              ('perception', 'Percepção', 'Perception'), ('speech', 'Oratória', 'Speech'),
              ('stealth', 'Furtividade', 'Stealth'), ('tinkering', 'Engenharia', 'Tinkering')]
    for i, (key, pt, en) in enumerate(skills):
        x = 33+(i%2)*82
        top = 534+(i//2)*27
        check(f'skill_{key}', f'Treinado em {pt} / Trained in {en}', x, top+2, 7)
        txt(x+11, top, pt, 7.7, 'LusitanaBold', width=68)
        txt(x+11, top+11, en, 5.7, 'Helvetica', gray=.4)
    line(32, 700, 195, 700, 1, INK)
    for key, pt, en, y in [('explore', 'Explorar', 'Explore', 712), ('encounter', 'Encontro', 'Encounter', 749)]:
        label(33, y, pt, en, size=8)
        field(key, f'{pt} / {en}', 146, y-1, 43, 25, 12, limit=5, align=1)
    txt(33, 784, 'Marque o atributo-chave e as perícias treinadas.', 5.9, width=158, gray=.4)

    panel(x2, 249, cw, 229, 'Saúde & ferimentos', 'Health & injuries', 14)
    label(218, 295, 'Aflições', 'Plights')
    field('plights', 'Aflições / Plights', 218, 314, 159, 48, 8.3, True, 300)
    for i in range(3):
        y = 365+i*35
        label(218, y, f'Ferimento {i+1}', 'Injury', size=6.5)
        label(350, y, 'Relógio', 'Clock', width=27, size=5.1)
        field(f'injury_{i+1}', f'Ferimento {i+1} / Injury', 218, y+17, 122, 17, 8, limit=100)
        field(f'injury_clock_{i+1}', f'Relógio do ferimento {i+1} / Clock', 350, y+17, 27, 17, 8, limit=2, align=1)
    panel(x2, 489, cw, 311, 'Características & talentos', 'Features & talents', 13.7)
    field('features', 'Características e talentos / Features & talents', 218, 536, 159, 253,
          8.4, True, 1400, ruled=True)

    panel(x3, 249, cw, 301, 'Avanço', 'Advancement')
    for name, pt, en, x, ww in [('level', 'Nível', 'Level', 402, 37), ('xp_current', 'Experiência', 'XP', 446, 51),
                                ('xp_next', 'Próx. nível', 'Next XP', 504, 57)]:
        label(x, 295, pt, en, width=ww, size=5.8)
        field(name, f'{pt} / {en}', x, 313, ww, 25, 11, limit=6, align=1)
    for key, pt, en, top in [('lineage', 'Linhagem', 'Lineage', 351), ('past_life', 'Vida passada', 'Past life', 398),
                              ('calling', 'Vocação', 'Calling', 445), ('crafts', 'Ofícios', 'Crafts', 492)]:
        label(402, top, pt, en)
        field(key, f'{pt} / {en}', 402, top+18, 159, 23, 9, limit=100)
    panel(x3, 561, cw, 239, 'Alinhamento', 'Alignment')
    for i in range(2):
        top = 608+i*91
        label(402, top, f'Traço {i+1}', 'Trait', size=6.5)
        field(f'alignment_{i+1}', f'Traço de alinhamento {i+1} / Alignment trait', 402, top+18, 159, 24, 9, limit=120)
        label(402, top+49, 'Negar', 'Deny', size=5.8)
        label(489, top+49, 'Afirmar', 'Affirm', size=5.8)
        for side, x in [('deny', 436), ('affirm', 529)]:
            for n in range(3):
                check(f'alignment_{i+1}_{side}_{n+1}', f'Traço {i+1}: {side} {n+1}', x+n*10, top+51, 7)
    footer()


def deed_card(index, x, top, width, height):
    rect(x, top, width, height, .8)
    label(x+6, top+6, f'Feito {index:02}', 'Deed', size=5.5)
    field(f'deed_{index}_name', f'Feito {index}: nome / Deed name', x+40, top+5, width-46, 18, 8, limit=95)
    cols = [(x+6, width*.43-8, 'kind', 'Categoria', 'Kind'),
            (x+width*.43+3, width*.27-5, 'cost', 'Custo base', 'Base cost'),
            (x+width*.70+3, width*.30-9, 'focus', 'Marcas', 'Focus marks')]
    for xx, ww, key, pt, en in cols:
        txt(xx, top+28, f'{pt} / {en}', 5.2, 'Helvetica', width=ww)
        field(f'deed_{index}_{key}', f'Feito {index}: {pt} / {en}', xx, top+37, ww, 15, 7.5, limit=25 if key == 'kind' else 4)
    field(f'deed_{index}_effect', f'Feito {index}: ação, alvo, alcance e efeito / Effect', x+6, top+58, width-12,
          height-64, 7.5, True, 250, ruled=True)


def combat_page():
    header(1)
    metrics = [('initiative', 'Iniciativa', 'Initiative'), ('accuracy', 'Precisão', 'Accuracy'),
               ('guard', 'Guarda', 'Guard'), ('resist', 'Resistir', 'Resist'),
               ('prevail', 'Prevalecer', 'Prevail'), ('tenacity', 'Tenacidade', 'Tenacity')]
    for i, (key, pt, en) in enumerate(metrics):
        x = 25+i*92
        rect(x, 249, 85, 60, 1.1)
        txt(x+42.5, 257, pt.upper(), 12.7, 'Pirata', width=76, align='center')
        txt(x+42.5, 272, en.upper(), 5.3, 'Helvetica', align='center', gray=.4)
        field(key, f'{pt} / {en}', x+23, 282, 39, 22, 13, limit=5, align=1)
    # Movement and editable weapon summaries share their values with Equipment.
    rect(25, 319, 545, 62, 1.4)
    label(34, 327, 'Velocidade', 'Base / bonus', size=6.8)
    field('speed_base', 'Velocidade base / Base speed', 34, 347, 31, 25, 12, limit=3, align=1)
    txt(69, 353, '+', 10)
    field('speed_bonus', 'Bônus de velocidade / Bonus speed', 82, 347, 31, 25, 12, limit=3, align=1)
    line(123, 326, 123, 374, .6)
    for x, pt, en, width in [(184, 'Arma', 'Weapon', 165), (357, 'Dano', 'Damage', 54),
                             (419, 'Tipo e alcance', 'Type / range', 142)]:
        txt(x, 325, f'{pt} / {en}', 5.3, 'Helvetica', width=width)
    for i, (hand, pt, en) in enumerate([('main', 'Principal', 'Main'), ('off', 'Secundária', 'Off hand')]):
        y = 337+i*21
        label(132, y+2, pt, en, size=5.2, width=47)
        field(f'weapon_{hand}_name', f'Arma {pt} / {en} weapon', 184, y, 165, 17, 8, limit=95)
        field(f'weapon_{hand}_damage', f'Dano da arma {pt} / Damage', 357, y, 54, 17, 8, limit=25)
        field(f'weapon_{hand}_range', f'Tipo e alcance da arma {pt} / Type and range', 419, y, 142, 17, 8, limit=100)
    panel(25, 392, 545, 258, 'Feitos', 'Deeds', 17)
    txt(35, 433, 'Categoria: Leve / Light, Pesado / Heavy, Poderoso / Mighty ou Especial / Special.',
        6.8, gray=.4)
    for i in range(6):
        deed_card(i+1, 33+(i%3)*178, 449+(i//3)*97, 172, 94)
    panel(25, 661, 545, 139, 'Estados', 'States', 16)
    states = [('accurate','Preciso','Accurate'),('inaccurate','Impreciso','Inaccurate'),
              ('guarded','Protegido','Guarded'),('unguarded','Desprotegido','Unguarded'),
              ('fortified','Fortificado','Fortified'),('frail','Frágil','Frail'),
              ('hastened','Acelerado','Hastened'),('hindered','Atrasado','Hindered'),
              ('mending','Regenerando','Mending'),('afflicted','Afligido','Afflicted'),
              ('strong','Forte','Strong'),('weak','Enfraquecido','Weak'),('swift','Veloz','Swift'),
              ('slow','Lento','Slow'),('willful','Determinado','Willful'),('weary','Exausto','Weary'),
              ('bleeding','Sangrando','Bleeding'),('blinded','Cego','Blinded'),('burning','Em chamas','Burning'),
              ('staggered','Cambaleante','Staggered'),('toppled','Derrubado','Toppled')]
    for i, (key, pt, en) in enumerate(states):
        x = 34+(i//7)*178
        y = 705+(i%7)*12.5
        txt(x, y+2, f'{pt} / {en}', 7.5, width=135)
        field(f'state_{key}', f'Intensidade: {pt} / {en}', x+139, y, 23, 12, 7, limit=2, align=1)
    footer()


def equipment_page():
    header(2)
    panel(25, 249, 545, 112, 'Armas', 'Weapons', 16)
    for i, (hand, pt, en) in enumerate([('main','Mão principal','Main hand'),('off','Mão secundária','Off hand')]):
        x = 34+i*269
        label(x, 294, pt, en, size=6.5)
        field(f'weapon_{hand}_name', f'Arma {pt} / {en}', x+81, 292, 178, 19, 8, limit=95)
        for key, pt2, en2, xx, ww in [('damage', 'Dano', 'Damage', x, 63),
                                       ('range', 'Tipo e alcance', 'Type / range', x+71, 93),
                                       ('properties', 'Propriedades', 'Properties', x+172, 87)]:
            label(xx, 317, pt2, en2, size=5.5, width=ww)
            field(f'weapon_{hand}_{key}', f'{pt}: {pt2} / {en2}', xx, 334, ww, 19, 8, limit=120)
    panel(25, 372, 545, 214, 'Armadura', 'Armor', 16)
    label(397, 383, 'Armadura total', 'Total AR', size=5.6)
    field('armor_total', 'Armadura total / Total armor rating', 516, 382, 44, 25, 12, limit=4, align=1)
    cols = [(34,87,'Posição / peça','Slot / piece'),(128,133,'Nome','Name'),(268,32,'Peso','L / H'),
            (307,29,'AR','Rating'),(343,37,'Dado','Die'),(387,138,'Propriedades','Properties'),(537,23,'Gasto','Spent')]
    for x, ww, pt, en in cols:
        label(x, 416, pt, en, width=ww, size=5.8)
    armor = [('head','Cabeça','Head'),('body','Corpo','Body'),('arms','Braços','Arms'),
             ('legs','Pernas','Legs'),('outer','Cobertura','Outer'),('shield','Escudo','Shield')]
    for i, (slot, pt, en) in enumerate(armor):
        y = 438+i*23
        txt(34, y+4, f'{pt} / {en}', 8, width=86)
        for key, x, ww, size, limit in [('name',128,133,8,100),('weight',268,32,8,2),('ar',307,29,8,3),
                                        ('die',343,37,8,10),('properties',387,138,7.8,120)]:
            field(f'armor_{slot}_{key}', f'{pt}: {key}', x, y, ww, 19, size, limit=limit)
        check(f'armor_{slot}_spent', f'{pt}: dado gasto / Spent', 543, y+6, 7)
    panel(25, 597, 545, 83, 'Itens mágicos', 'Magic items', 16)
    for i, (key, pt, en) in enumerate([('amulet','Amuleto','Amulet'),('ring','Anel','Ring'),('talisman','Talismã','Talisman')]):
        x = 34+i*178
        label(x, 637, pt, en, size=6)
        field(f'magic_{key}_name', f'{pt}: nome / Name', x+56, 635, 106, 17, 8, limit=90)
        field(f'magic_{key}_effect', f'{pt}: efeito / Effect', x, 657, 162, 16, 7.5, limit=150)
    # Dedicated continuation page keeps the inventory usable at a readable size.
    panel(25, 691, 545, 109, 'Inventário', 'Inventory', 16)
    label(34, 729, 'Moedas', 'cp / sp / gp', size=6)
    field('coins', 'Moedas / Coins', 87, 728, 152, 19, 9, limit=75)
    label(253, 729, 'Espaços usados / total', 'Used / total slots', size=5.8, width=120)
    field('inventory_used', 'Espaços usados / Used slots', 383, 728, 36, 19, 9, limit=5, align=1)
    txt(426, 732, '/', 9)
    field('inventory_total', 'Capacidade / Total slots', 442, 728, 36, 19, 9, limit=5, align=1)
    txt(490, 733, '5 + Might', 7, gray=.4)
    for x, width, title in [(34, 204, 'Item / Item'), (246, 43, 'Espaços / Slots'), (298, 262, 'Notas / Notes')]:
        txt(x, 750, title, 5.2, 'Helvetica', width=width)
    for i in range(2):
        y = 759+i*19
        for key, x, ww, size, limit in [('name',34,204,8,130),('slots',246,43,8,5),('notes',298,262,8,190)]:
            field(f'inventory_{i+1}_{key}', f'Inventário {i+1}: {key}', x, y, ww, 17, size, limit=limit)
    footer()


def journal_page():
    header(3)
    panel(25, 249, 545, 231, 'Inventário & provisões', 'Inventory & provisions', 16)
    for x, ww, pt, en in [(34,204,'Item','Item'),(246,43,'Espaços','Slots'),(298,262,'Notas / quantidade / usos','Notes / quantity / uses')]:
        label(x, 294, pt, en, width=ww, size=6)
    for i in range(8):
        y = 315+i*19.5
        for key, x, ww, size, limit in [('name',34,204,8,130),('slots',246,43,8,5),('notes',298,262,8,190)]:
            field(f'inventory_{i+3}_{key}', f'Inventário {i+3}: {key}', x, y, ww, 17, size, limit=limit)
    panel(25, 491, 545, 198, 'Diário de viagem', 'Journal', 17)
    field('notes', 'Anotações da aventura / Adventure notes', 34, 535, 527, 144, 9, True, 1500, ruled=True)
    panel(25, 700, 545, 100, 'Ajustes de regras', 'Bonuses & overrides', 16)
    adjustments = [('hp','PV máximos','Maximum HP'),('endurance','Resistência','Endurance'),
                   ('guard','Guarda','Guard'),('accuracy','Precisão','Accuracy'),('initiative','Iniciativa','Initiative'),
                   ('resist','Resistir','Resist'),('prevail','Prevalecer','Prevail'),('tenacity','Tenacidade','Tenacity'),
                   ('speed','Velocidade base','Base speed'),('focus','Foco inicial','Starting focus')]
    for i, (key, pt, en) in enumerate(adjustments):
        x = 34+(i%5)*106
        y = 744+(i//5)*24
        label(x, y, pt, en, size=5.4, width=60)
        field(f'bonus_{key}', f'Ajuste: {pt} / {en}', x+66, y, 30, 21, 9, limit=5, align=1)
    footer()


def build():
    character_page()
    combat_page()
    equipment_page()
    journal_page()
    c.save()
    buf.seek(0)
    writer = PdfWriter()
    writer.clone_document_from_reader(PdfReader(buf))
    form.add_form(writer)
    writer.add_metadata({'/Title': 'Trespasser - Ficha redesenhada preenchível - PT/EN',
                         '/Subject': 'Adaptação da ficha do localhost em quatro páginas com campos AcroForm.',
                         '/Creator': 'Ficha de personagem não oficial - Trespasser v2.1.3'})
    writer._root_object[NameObject('/Lang')] = TextStringObject('pt-BR')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    writer.write(OUT)
    TMP.mkdir(parents=True, exist_ok=True)
    (TMP/'redesigned-field-specs.json').write_text(json.dumps(form.SPECS, ensure_ascii=False, indent=2), encoding='utf8')
    result = PdfReader(OUT)
    print(json.dumps({'file': str(OUT), 'pages': len(result.pages), 'fields': len(result.get_fields()),
                      'widgets': len(form.SPECS)}, ensure_ascii=True))


if __name__ == '__main__':
    build()
