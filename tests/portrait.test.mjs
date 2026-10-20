import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePortrait, portraitImageInfo, portraitGeometry, portraitStyle, importPortrait, MAX_PORTRAIT_DATA_URL } from '../dist/portrait.js';
import { portraitPng } from './portrait-fixture.mjs';

test('portrait validation accepts bounded raster data, preserves crop and isolates defaults', () => {
  const dataUrl = portraitPng();
  assert.ok(dataUrl.length > 50_000 && dataUrl.length < MAX_PORTRAIT_DATA_URL);
  const source = { dataUrl, zoom:2, x:12.5, y:99 };
  const p = normalizePortrait(source);
  assert.deepEqual(p, source);
  assert.notEqual(p, source);
  assert.deepEqual(normalizePortrait(), {dataUrl:'',zoom:1,x:50,y:50});
  assert.deepEqual(portraitImageInfo(dataUrl).width, 180);
  assert.equal(portraitImageInfo(dataUrl).height,140);
  assert.equal(portraitStyle(p), 'object-position:12.5% 99%;transform:scale(2);transform-origin:12.5% 99%');
});

test('portrait rejects active content, external URLs, wrong signatures, huge images and invalid crop', () => {
  for (const dataUrl of ['https://example.com/a.png', 'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:text/html;base64,PGgxPng8L2gxPg==',
    'data:image/png;base64,PGh0bWw+eDwvaHRtbD4=', 'data:image/png;base64,!!!!',
    'data:image/png;base64,' + 'A'.repeat(MAX_PORTRAIT_DATA_URL), portraitPng(801,1)]) {
    assert.throws(() => normalizePortrait({ dataUrl }));
  }
  for (const value of [null, [], {zoom:0}, {zoom:3.1}, {x:-1}, {y:101}, {x:'50'}, {zoom:Infinity}]) {
    assert.throws(() => normalizePortrait(value));
  }
});

test('crop geometry matches cover, zoom and pan for portrait/landscape frames', () => {
  assert.deepEqual(portraitGeometry({}, 400,200,200,250), {width:500,height:250,x:-150,y:0});
  assert.deepEqual(portraitGeometry({zoom:2,x:0,y:100},400,200,200,250), {width:1000,height:500,x:0,y:-250});
  assert.throws(() => portraitGeometry({},0,100,200,250));
});

test('file import decodes and re-encodes bounded raster pixels without retaining original metadata', async () => {
  const original = portraitPng(180,140), output = portraitPng(180,140);
  const bytes = Buffer.from(original.split(',')[1],'base64');
  let closed = false, decoded = false, drew = false;
  const canvas = {width:0,height:0,getContext:()=>({fillRect(){},drawImage(){drew=true;}}),toDataURL:()=>output};
  const file = {type:'image/png',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
  const environment = {createImageBitmap:async()=>{decoded=true;return {width:180,height:140,close(){closed=true;}};}, document:{createElement:()=>canvas}};
  const p = await importPortrait(file,{environment});
  assert.equal(p.dataUrl, output);
  assert.ok(decoded && drew && closed);
  assert.equal(canvas.width,180);assert.equal(canvas.height,140);
  for (const type of ['image/svg+xml','text/html','image/gif']) {
    await assert.rejects(importPortrait({...file,type},{environment}));
  }
  await assert.rejects(importPortrait({...file,size:13*1024*1024},{environment}));
});

test('file import rejects excessive dimensions before decoding and releases failures', async () => {
  const hugeBytes = Buffer.from(portraitPng(8193,1).split(',')[1],'base64');
  let decoded = false;
  await assert.rejects(importPortrait({type:'image/png',size:hugeBytes.length,arrayBuffer:async()=>Uint8Array.from(hugeBytes).buffer},
    {environment:{createImageBitmap:async()=>{decoded=true;}}}));
  assert.equal(decoded,false);
  const bytes = Buffer.from(portraitPng(1,1).split(',')[1],'base64');
  let released = false;
  await assert.rejects(importPortrait({type:'image/png',size:bytes.length,arrayBuffer:async()=>Uint8Array.from(bytes).buffer},
    {environment:{createImageBitmap:async()=>({width:1,height:1,close(){released=true;}}),document:{createElement:()=>({getContext:()=>null})}}}));
  assert.equal(released,true);
});
