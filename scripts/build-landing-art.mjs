// Export the existing engraving layout once, rather than composing five large
// images during each page load. Source artworks remain untouched.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';

const require=createRequire(import.meta.url);
const sharp=require(process.argv.slice(2).find(argument=>!argument.startsWith('--'))||'sharp');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'dist/assets/landing/gravuras');
const target=resolve(root,'dist/assets/landing');
await mkdir(target,{recursive:true});

function mask(width,height,kind) {
  const horizontal=`<linearGradient id="h"><stop stop-color="white" stop-opacity="0"/><stop offset=".17" stop-color="white"/><stop offset=".80" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
  const vertical=`<linearGradient id="v" x2="0" y2="1"><stop offset=".74" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
  const radial=`<radialGradient id="r" cx=".58" cy=".5" r=".78" gradientTransform="translate(0 -.2) scale(1 1.4)"><stop offset=".48" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>`;
  const portrait=`<linearGradient id="p" x2="0" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".16" stop-color="white"/><stop offset=".72" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>`;
  const fill=kind==='portrait'?'p':kind==='radial'?'r':kind==='vertical'?'v':'h';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${horizontal}${vertical}${radial}${portrait}</defs><rect width="100%" height="100%" fill="url(#${fill})"/></svg>`);
}

async function layer(canvasW,canvasH,{name,x,y,w,h,focusX=.5,focusY=.5,brightness=1,opacity=1,fade='horizontal',bottom=false,portrait=false}) {
  const width=Math.round(canvasW*w),height=Math.round(canvasH*h);
  const input=sharp(resolve(source,`${name}.webp`));
  const metadata=await input.metadata();
  const scale=Math.max(width/metadata.width,height/metadata.height);
  const scaledW=Math.max(width,Math.round(metadata.width*scale));
  const scaledH=Math.max(height,Math.round(metadata.height*scale));
  let buffer=await input.resize(scaledW,scaledH).extract({left:Math.round((scaledW-width)*focusX),top:Math.round((scaledH-height)*focusY),width,height}).modulate({brightness}).ensureAlpha(opacity).png().toBuffer();
  buffer=await sharp(buffer).composite([{input:mask(width,height,fade),blend:'dest-in'},...(fade==='radial'?[{input:mask(width,height,'horizontal'),blend:'dest-in'}]:[]),...(bottom?[{input:mask(width,height,'vertical'),blend:'dest-in'}]:[]),...(portrait?[{input:mask(width,height,'portrait'),blend:'dest-in'}]:[])]).png().toBuffer();
  const left=Math.round(canvasW*x),top=Math.round(canvasH*y);
  const cutLeft=Math.max(0,-left),cutTop=Math.max(0,-top);
  buffer=await sharp(buffer).extract({left:cutLeft,top:cutTop,width:Math.min(width-cutLeft,canvasW-Math.max(0,left)),height:Math.min(height-cutTop,canvasH-Math.max(0,top))}).png().toBuffer();
  return {input:buffer,left:Math.max(0,left),top:Math.max(0,top)};
}

async function panorama(filename,width,height,compact=false) {
  const layout=[
    {name:'escadaria',x:compact?-.07:-.02,y:-.02,w:compact?.35:.33,h:1.04,focusX:.43,focusY:.20,opacity:.91},
    {name:'cavaleiro',x:compact?.06:.10,y:-.10,w:compact?.34:.31,h:.90,focusX:.57,focusY:.46,brightness:1.08,bottom:true},
    {name:'portal',x:compact?.56:.56,y:-.03,w:compact?.39:.36,h:1.03,focusX:.67,focusY:.44,brightness:1.48,bottom:true},
    {name:'monstro',x:compact?.22:.25,y:0,w:compact?.48:.42,h:1.03,focusX:.62,focusY:0},
    {name:'abismo',x:compact?.73:.74,y:0,w:compact?.31:.28,h:1.00,focusX:.55,focusY:.57,brightness:1.18,fade:'radial'},
  ];
  const composite=[];
  for(const entry of layout)composite.push(await layer(width,height,entry));
  const destination=resolve(target,filename);
  await sharp({create:{width,height,channels:4,background:'#080909'}}).composite(composite).webp({quality:92,effort:6}).toFile(destination);
  console.log(`${filename}: ${(await stat(destination)).size} bytes`);
}

// The phone uses the same five engravings, arranged vertically instead of
// cutting a narrow strip out of the desktop panorama. Keep the monster above
// the centre, with the two action scenes on the left and the two descents on
// the right. One encoded image also keeps every join ready at first reveal.
async function portraitPanorama() {
  const width=1080,height=2340;
  const layout=[
    {name:'escadaria',x:-.13,y:-.01,w:.71,h:.47,focusX:.39,focusY:.23,opacity:.91,bottom:true},
    {name:'portal',x:.44,y:.075,w:.69,h:.42,focusX:.56,focusY:.44,brightness:1.48,portrait:true},
    {name:'monstro',x:.13,y:-.025,w:.76,h:.49,focusX:.62,focusY:0,bottom:true},
    {name:'cavaleiro',x:-.07,y:.22,w:.67,h:.37,focusX:.57,focusY:.46,brightness:1.08,portrait:true},
    {name:'abismo',x:.43,y:.30,w:.70,h:.35,focusX:.55,focusY:.57,brightness:1.18,fade:'radial',portrait:true},
  ];
  const composite=[];
  for(const entry of layout)composite.push(await layer(width,height,entry));
  const destination=resolve(target,'panorama-mobile.webp');
  await sharp({create:{width,height,channels:4,background:'#080909'}}).composite(composite).webp({quality:92,effort:6}).toFile(destination);
  console.log(`panorama-mobile.webp: ${(await stat(destination)).size} bytes`);
}

if(!process.argv.includes('--mobile')) {
  await panorama('panorama-desktop.webp',2560,1440);
  await panorama('panorama-compact.webp',1440,1280,true);
  await sharp(resolve(target,'castelo.png')).resize({width:1000,withoutEnlargement:true}).webp({quality:92,effort:6}).toFile(resolve(target,'castelo-mobile.webp'));
  console.log(`castelo-mobile.webp: ${(await stat(resolve(target,'castelo-mobile.webp'))).size} bytes`);
}
await portraitPanorama();
