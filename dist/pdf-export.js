import {
  PDFDocument, PDFName, PDFTextField, PDFCheckBox, StandardFonts,
  defaultTextFieldAppearanceProvider, rgb,
} from './vendor/pdf-lib.js';
import { buildExportData, STANDARD_STATES } from './export-data.js';

let templatePromise;
async function template() {
  if (!templatePromise) {
    templatePromise = fetch(new URL('./assets/trespasser-template.pdf', import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error('Não foi possível carregar o modelo do PDF. Tente novamente.');
        return response.arrayBuffer();
      }).catch(error => { templatePromise = null; throw error; });
  }
  return templatePromise;
}

// These are appearance-only line breaks. The field's canonical /V retains the
// complete original text, including user whitespace and Unicode normalization.
function wrapText(text, font, size, width) {
  const result = [];
  for (const paragraph of text.split(/\r\n|\r|\n/u)) {
    let line = '';
    for (const word of paragraph.match(/\S+|\s+/gu) || []) {
      if (!word.trim()) { if (line) line += ' '; continue; }
      if (font.widthOfTextAtSize(line+word, size) <= width) { line += word; continue; }
      if (line.trim()) result.push(line.trimEnd());
      line = '';
      for (const char of word) {
        if (line && font.widthOfTextAtSize(line+char, size) > width) {
          result.push(line); line = '';
        }
        line += char;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}

function displayText(value, font) {
  const text = String(value).normalize('NFC').replace(/\t/gu, '    ');
  const available = new Set(font.getCharacterSet());
  for (const char of text) {
    if (!/[\r\n]/u.test(char) && !available.has(char.codePointAt(0))) {
      throw new Error(`O caractere “${char}” não é suportado pela fonte do PDF. O JSON preserva o texto completo.`);
    }
  }
  return text;
}

function fieldSize(field) {
  const sizes = field.acroField.getWidgets().map(widget => widget.getRectangle());
  return { width: Math.min(...sizes.map(r => r.width))-2,
           height: Math.min(...sizes.map(r => r.height))-2 };
}

function defaultSize(field) {
  const raw = field.acroField.dict.get(PDFName.of('DA'));
  // Both '/' and '.' may be octal-escaped in a PDF literal string. Decode it
  // before parsing, otherwise '8\\0564 Tf' would be mistaken for size 564.
  const da = typeof raw?.decodeText === 'function' ? raw.decodeText() : field.acroField.getDefaultAppearance();
  return Number(da?.match(/([\d.]+)\s+Tf/u)?.[1]) || 9;
}

function fitText(field, text, font) {
  const bounds = fieldSize(field);
  const initial = defaultSize(field);
  const minimum = Math.min(initial, 6.5);
  for (let size = initial; size >= minimum-.001; size -= .25) {
    const lines = field.isMultiline() ? wrapText(text, font, size, bounds.width) : [text.replace(/[\r\n]+/gu, ' ')];
    const textHeight = field.isMultiline() ? lines.length*font.heightAtSize(size)*1.2 :
      font.heightAtSize(size, {descender:false});
    const fits = lines.every(line => font.widthOfTextAtSize(line, size) <= bounds.width) &&
      textHeight <= bounds.height;
    if (fits) return { size, display: lines.join('\n'), overflow: false };
  }
  return { size: initial, display: text, overflow: true };
}

function appearance(field, font, text, size) {
  // Original widgets have their own /DA font size. Remove it so every shared
  // widget consistently uses the field's selected, readable font size.
  for (const widget of field.acroField.getWidgets()) widget.dict.delete(PDFName.of('DA'));
  // Recreate /DA as a literal operator string: the source PDF writes the slash
  // as an octal escape, which pdf-lib's font-size parser does not decode.
  field.acroField.setDefaultAppearance(`/${font.name} ${size} Tf 0 g`);
  field.updateAppearances(font, (actual, widget, embedded) => {
    const view = Object.create(actual);
    view.getText = () => text;
    return defaultTextFieldAppearanceProvider(view, widget, embedded);
  });
}

function titleOf(field) {
  const title = field.acroField.dict.get(PDFName.of('TU'));
  return typeof title?.decodeText === 'function' ? title.decodeText() : field.getName();
}

function appendPages(doc, form, font, bold, entries) {
  let page, cursor;
  const width = 595.276, height = 841.89;
  const pageNumbers = new Map();
  const nextPage = () => {
    page = doc.addPage([width, height]);
    page.drawRectangle({ x:20, y:20, width:width-40, height:height-40, borderWidth:2.5,
                         borderColor:rgb(.08,.08,.08), color:rgb(.98,.98,.98) });
    page.drawText('TRESPASSER', {x:32,y:height-47,font:bold,size:15});
    page.drawText('CONTINUAÇÃO / CONTINUATION', {x:32,y:height-67,font:bold,size:10});
    page.drawLine({start:{x:21,y:height-80},end:{x:width-21,y:height-80},thickness:2});
    page.drawText('REGISTRO NÃO OFICIAL - CAMPOS PREENCHÍVEIS', {x:30,y:29,font,size:6});
    page.drawText(String(doc.getPageCount()), {x:width-42,y:29,font:bold,size:8});
    cursor = 103;
  };
  for (const entry of entries) {
    const text = displayText(entry.text, font);
    const lines = wrapText(text, font, 9, 517);
    let offset = 0, part = 0;
    while (offset < lines.length) {
      if (!page || cursor > 690) nextPage();
      const available = Math.floor((788-cursor-30)/10.5);
      if (available < 2) { nextPage(); continue; }
      const chunk = lines.slice(offset, offset+available);
      const top = cursor+20;
      const boxHeight = chunk.length*10.5+9;
      const field = form.createTextField(`extra_${entry.key}_${++part}`);
      field.enableMultiline();
      field.addToPage(page, {x:32,y:height-top-boxHeight,width:531,height:boxHeight,
                            borderWidth:.5,borderColor:rgb(.35,.35,.35),
                            backgroundColor:rgb(1,1,1),font,textColor:rgb(0,0,0)});
      field.setText(chunk.join('\n'));
      appearance(field, font, chunk.join('\n'), 9);
      const title = displayText(entry.title+(part>1 ? ' (continuação)' : ''), font);
      const titleSize = Math.min(8.5, 529/font.widthOfTextAtSize(title, 1));
      page.drawText(title, {x:33,y:height-cursor-9,size:titleSize,font:bold});
      if (!pageNumbers.has(entry.key)) pageNumbers.set(entry.key, doc.getPageCount());
      offset += chunk.length;
      cursor = top+boxHeight+17;
    }
  }
  return pageNumbers;
}

export async function createPdfExport(input, { templateBytes } = {}) {
  const data = buildExportData(input);
  const doc = await PDFDocument.load(templateBytes ?? await template());
  const form = doc.getForm();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const continuations = [];
  const pending = [];
  for (const [name, value] of Object.entries(data.values)) {
    const field = form.getField(name);
    field.disableReadOnly();
    if (field instanceof PDFCheckBox) {
      value ? field.check() : field.uncheck();
    } else if (field instanceof PDFTextField) {
      const text = String(value);
      const rendered = displayText(text, font);
      field.removeMaxLength();
      field.setText(text);
      const fit = fitText(field, rendered, font);
      if (fit.overflow && text) {
        continuations.push({key:name,title:titleOf(field),text});
        pending.push({field,text:rendered,size:fit.size});
      } else appearance(field, font, fit.display, fit.size);
    }
  }
  const radio = form.getRadioGroup('key_attribute');
  data.keyAttribute ? radio.select(data.keyAttribute) : radio.clear();
  const kinds = { light:'Leve / Light', heavy:'Pesado / Heavy', mighty:'Poderoso / Mighty', special:'Especial / Special' };
  data.deedsOverflow.forEach((deed, i) => continuations.push({
    key:`deed_${i+7}`, title:`Feito ${i+7} / Deed`,
    text:`Nome / Name: ${deed.name}\nCategoria / Kind: ${kinds[deed.kind]}\nCusto base / Base cost: ${deed.cost}\nMarcas / Focus marks: ${deed.focus}\nEfeito / Effect: ${deed.description}`,
  }));
  data.inventoryOverflow.forEach((item, i) => continuations.push({
    key:`inventory_${i+11}`, title:`Inventário ${i+11} / Inventory`,
    text:`Item: ${item.name}\nEspaços / Slots: ${item.slots}\nNotas / Notes: ${item.notes}`,
  }));
  for (const [key, value] of Object.entries(data.character.states)) {
    if (!STANDARD_STATES.includes(key)) continuations.push({key:`state_${key}`,title:'Estado adicional / Additional state',text:`${key}: ${value}`});
  }
  const pageNumbers = appendPages(doc, form, font, bold, continuations);
  if (doc.getPageCount() > 4) {
    doc.getPages().forEach((page, index) => {
      const width = page.getWidth();
      const number = `${index+1} / ${doc.getPageCount()}`;
      const baseline = index < 4 ? 26.8 : 29;
      page.drawRectangle({x:width-80,y:23,width:55,height:15,color:rgb(.98,.98,.98)});
      page.drawText(number,{x:width-28-bold.widthOfTextAtSize(number,6.2),y:baseline,font:bold,size:6.2});
    });
  }
  for (const {field,text,size} of pending) {
    const bounds = fieldSize(field);
    const note = `[Texto completo: p. ${pageNumbers.get(field.getName())}]`;
    let preview;
    let chosenSize = size;
    if (field.isMultiline()) {
      const capacity = Math.max(1, Math.floor(bounds.height/(font.heightAtSize(size)*1.2)));
      preview = wrapText(text,font,size,bounds.width).slice(0,Math.max(0,capacity-1)).concat(note).join('\n');
    } else {
      preview = note;
      chosenSize = Math.min(size,bounds.width/font.widthOfTextAtSize(note,1));
    }
    appearance(field,font,preview,chosenSize);
  }
  form.updateFieldAppearances(font);
  doc.setTitle(`Trespasser - ${data.character.name || 'Ficha de personagem'}`);
  doc.setSubject('Ficha redesenhada preenchível. Valores exportados da ficha web; edição manual no PDF.');
  return doc.save({updateFieldAppearances:false});
}
