"""Add visible PT-BR/EN vector labels to the official, otherwise unchanged record.

Requires reportlab and pypdf. The original source is only read, never overwritten.
Usage: python scripts/build-haven-template.py "path/to/official Haven Record.pdf"
"""
from io import BytesIO
from pathlib import Path
import argparse
import hashlib

from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "dist/assets/fonts"
for name, filename in (("Pirata", "PirataOne-Regular.ttf"),
                       ("Lusitana", "Lusitana-Regular.ttf"),
                       ("LusitanaBold", "Lusitana-Bold.ttf")):
    pdfmetrics.registerFont(TTFont(name, str(FONTS / filename)))


def main(source):
    output = ROOT / "dist/assets/haven-template.pdf"
    source = source.resolve()
    if source == output.resolve():
        raise ValueError("The official source must differ from the output template.")
    original = source.read_bytes()
    pdf = PdfReader(BytesIO(original))
    if len(pdf.pages) != 2 or any(tuple(p.mediabox)[2:] != (612, 792) for p in pdf.pages):
        raise ValueError("Expected the two US Letter pages of Haven Record v2.1.3.")
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(612, 792), pageCompression=1, invariant=1)
    count = 0

    def label(x, top, width, height, pt, en, size=13, english=6,
              face="Pirata", align="center", gap=.6):
        """Mask only a label band; fit both baselines inside that same band."""
        nonlocal count
        c.setFillColorRGB(1, 1, 1)
        c.rect(x, 792-top-height, width, height, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)
        size = min(size, (width-2)/max(.01, pdfmetrics.stringWidth(pt, face, 1)))
        english = min(english, (width-2)/max(.01, pdfmetrics.stringWidth(en, "Lusitana", 1)))
        a, b = pdfmetrics.getAscentDescent(face)
        ea, eb = pdfmetrics.getAscentDescent("Lusitana")
        primary_height = (a-b)*size/1000
        english_height = (ea-eb)*english/1000
        total = primary_height+gap+english_height
        if total > height-1:
            factor = (height-1-gap)/(primary_height+english_height)
            size *= factor
            english *= factor
            primary_height *= factor
            english_height *= factor
            total = primary_height+gap+english_height
        ink_top = top+(height-total)/2
        baseline = 792-ink_top-a*size/1000
        second = 792-ink_top-primary_height-gap-ea*english/1000
        for text, font, font_size, y in ((pt, face, size, baseline),
                                        (en, "Lusitana", english, second)):
            c.setFont(font, font_size)
            if align == "right":
                c.drawRightString(x+width-1, y, text)
            elif align == "left":
                c.drawString(x+1, y, text)
            else:
                c.drawCentredString(x+width/2, y, text)
        count += 1

    # Page one: original boxes, table values, brand and linework are preserved.
    # The small Haven Record wordmark touches the logo's descenders. Keep that
    # original brand artwork intact; the visible form labels are bilingual.
    label(205.5, 24, 83.5, 19, "Nome do refúgio", "Haven Name", 12, 6)
    label(205.5, 50, 75, 19, "Liderança", "Leadership", 11, 6)
    label(410, 50, 58, 18, "Localização", "Location", 11, 6)
    label(24, 86, 166, 22, "Atributos e perícias", "Attributes & Skills", 14, 6.2)
    label(137, 107, 48, 11, "Valor", "Score", 6.2, 4.8, face="LusitanaBold", gap=.1)
    attrs = [("Militar", "Military"), ("Eficiência", "Efficiency"),
             ("Recursos", "Resources"), ("Conhecimento", "Expertise"),
             ("Lealdade", "Allegiance"), ("Atratividade", "Appeal")]
    # Replace the labels' own underlines at the exact same locations, avoiding
    # tiny old line fragments around the white masks. Score cells stay intact.
    c.setFillColorRGB(1, 1, 1)
    c.rect(22, 792-247, 106, 127, fill=1, stroke=0)
    for (pt, en), top, height in zip(attrs, [121, 144, 165, 186, 207, 228], [18, 18, 18, 18, 18, 17]):
        label(24, top, 103, height, pt, en, 12.4, 6)
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(.4)
    for top in [139.3, 162.7, 183.4, 204.1, 224.8, 245.5]:
        c.line(23, 792-top, 127, 792-top)
    label(22, 257, 106, 20, "Proficiência", "Skill Bonus", 13, 6)
    c.line(23, 792-277.5, 127, 792-277.5)
    skills = [("Agricultura", "Agriculture"), ("Construção", "Construction"),
              ("Comércio", "Commerce"), ("Culinária", "Cuisine"),
              ("Entretenimento", "Entertainment"), ("Espionagem", "Espionage"),
              ("Fé", "Faith"), ("Hospitalidade", "Hospitality"),
              ("Pesquisa", "Research"), ("Navegação", "Seafaring"),
              ("Diplomacia", "Statecraft"), ("Guerra", "Warfare")]
    for i, (pt, en) in enumerate(skills):
        label(16 if i < 6 else 113, 291.5+(i % 6)*17.5,
              79 if i < 6 else 69, 13.5, pt, en, 8, 5.7, face="LusitanaBold", align="right", gap=.15)
    label(218, 86, 368, 23, "Vagas de construção", "Build Slots", 15, 6.5)
    for x in [214, 409]:
        label(x, 111, 143, 12, "Construção", "Build", 7.5, 5, face="LusitanaBold", gap=.1)
        label(x+146, 111, 38, 12, "Relógio", "Clock", 7.5, 5, face="LusitanaBold", gap=.1)
    label(219, 195, 365, 23, "Construções concluídas", "Finished Buildings", 15, 6.5)
    label(25, 408, 168, 22, "Progressão", "Advancement", 15, 6.2)
    for x, width, pt, en in [(47, 30, "População", "Pop. Rank"), (80, 31, "Proficiência", "Skill Bonus"),
                             (117, 36, "Vagas", "Build Slots"), (155, 38, "Limite", "Building Limit")]:
        label(x, 430, width, 17, pt, en, 6.5, 5, face="LusitanaBold", gap=.2)
    label(213, 409, 182, 22, "População", "Population", 15, 6.2)
    label(416, 408, 169, 23, "Outros projetos", "Other Projects", 15, 6.5)
    label(217, 439, 111, 19, "Patamar de população", "Population Rank", 10.6, 6)
    label(211, 472, 100, 16, "Atratividade + Hospitalidade", "Appeal + Hospitality", 6.8, 5.8, face="LusitanaBold")
    label(315, 473, 49, 16, "Crescimento", "Growth", 9.5, 5.8)
    label(211, 490, 100, 16, "Lealdade + Fé", "Allegiance + Faith", 7.4, 5.8, face="LusitanaBold")
    label(315, 491, 49, 16, "Declínio", "Decline", 10, 5.8)
    label(217, 517, 178, 18, "Chegadas", "Arrivals", 11, 6)
    label(22, 610, 122, 19, "Evento", "Event", 14, 6)
    label(23, 652, 120, 13, "Evento", "Event", 7.4, 5.2, face="LusitanaBold", gap=.2)
    label(153, 652, 36, 13, "Relógio", "Clock", 7.4, 5.2, face="LusitanaBold", gap=.2)
    c.showPage()

    # Page two: narrow hireling name bands use two readable compact lines.
    label(22, 16, 171, 18, "Tesouro", "Treasure", 15, 6.2)
    label(22, 40, 94, 18, "Riqueza atual", "Current Wealth", 11, 6)
    label(23, 62, 171, 17, "Contratados", "Hirelings", 11, 6)
    hirelings = [("Artesão", "Artisan"), ("Cozinheiro", "Cook"), ("Arauto", "Harbinger"),
                 ("Herbalista", "Herbalist"), ("Mensageiro", "Messenger"), ("Mineiro", "Miner"),
                 ("Trabalhador", "Worker"), ("Domador", "Beast Tamer"), ("Ferreiro", "Blacksmith"),
                 ("Engenheiro", "Engineer"), ("Curandeiro", "Healer"), ("Mercenário", "Mercenary"),
                 ("Pesquisador", "Researcher"), ("Carroceiro", "Wagoner"), ("Alquimista", "Alchemist"),
                 ("Oficial", "Officer"), ("Espião", "Spy"), ("Escriba arcano", "Spellscribe"),
                 ("Ferreiro arcano", "Spellsmith")]
    for i, (pt, en) in enumerate(hirelings):
        label(18, 81.5+i*12.65, 61, 12.3, pt, en, 6.8, 5.5,
              face="LusitanaBold", align="right", gap=.15)
    label(22, 375, 103, 18, "Despesas semanais", "Weekly Expenses", 10.2, 6)
    label(218, 16, 369, 23, "Cadeias de produção", "Production Chains", 15, 6.5)
    for x, width, pt, en in [(218, 39, "Custo", "Cost"), (262, 140, "Contratados", "Hirelings"),
                             (407, 180, "Itens produzidos por semana", "Items produced each week")]:
        label(x, 42, width, 12, pt, en, 7.4, 5.3, face="LusitanaBold", gap=.1)
    label(219, 191, 366, 23, "Itens armazenados", "Stored Items", 15, 6.5)
    for i in range(6):
        x = 20+196*(i % 3)
        top = 409 if i < 3 else 598
        label(x-.5, top+2, 69, 21, "Fortaleza", "Stronghold", 11, 6)
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(.4)
        c.line(x-.5, 792-top-21.5, x+65.5, 792-top-21.5)
        label(x+2, top+25, 137, 15, "Projeto", "Project", 8.5, 5.7, face="LusitanaBold")
        label(x+140, top+25, 37, 15, "Relógio", "Clock", 8.1, 5.5, face="LusitanaBold")
        label(x+2, top+73, 175, 23, "Chegadas", "Arrivals", 12, 6.5)
    c.save()
    overlay = PdfReader(BytesIO(buffer.getvalue()))
    writer = PdfWriter()
    for base, labels in zip(pdf.pages, overlay.pages):
        base.merge_page(labels)
        writer.add_page(base)
    writer.add_metadata({"/Title": "Trespasser - Registro de Refúgio / Haven Record",
                         "/Subject": "Rótulos PT-BR + EN sobre a ficha oficial v2.1.3; linhas e arte preservadas.",
                         "/Creator": "Trespasser RPG - build-haven-template.py"})
    with output.open("wb") as stream:
        writer.write(stream)
    print(f"{count} bilingual labels; {len(writer.pages)} pages")
    print(f"source SHA-256: {hashlib.sha256(original).hexdigest()}")
    print(f"template SHA-256: {hashlib.sha256(output.read_bytes()).hexdigest()}")
    print(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    main(parser.parse_args().source)
