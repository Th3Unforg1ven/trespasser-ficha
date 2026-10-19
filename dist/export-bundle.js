import { buildExportData, fileStem } from './export-data.js';

export async function prepareExport(input, options = {}) {
  const { character } = buildExportData(input);
  const stem = fileStem(character);
  const json = JSON.stringify({format:'trespasser-character',version:1,rules:'2.1.3',character},null,2);
  const [{createPdfExport}] = await Promise.all([
    import('./pdf-export.js'),
    import('./vendor/jszip.js'),
  ]);
  const pdf = await createPdfExport(character, options);
  const archive = new globalThis.JSZip();
  archive.file(`${stem}.pdf`, pdf);
  archive.file(`${stem}.json`, json);
  const zip = await archive.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
  return {pdf,json,zip,stem};
}
