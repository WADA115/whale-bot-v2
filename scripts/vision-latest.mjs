import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from '../src/config.js';
import { createVisionRouter } from '../src/core/vision.js';
const { config } = loadConfig({ configPath: path.join(ROOT, 'config.json') });
const buf=fs.readFileSync(path.join(ROOT,'state','latest-img-3.jpg'));
const message={segments:[{type:'image',data:{url:`data:image/jpeg;base64,${buf.toString('base64')}`}}]};
for(const p of config.vision.providers){
 const router=createVisionRouter({providers:[p],logger:console});
 try{const r=await router.describe({message});console.log(p.id,r.text)}catch(e){console.log(p.id,'FAIL',String(e.message).slice(0,200))}
}
