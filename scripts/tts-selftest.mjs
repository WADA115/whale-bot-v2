import { createTts } from '../src/core/tts.js';
const tts=createTts({outDir:'E:/deepseek_qq.bot/qq-bridge-v2/state/voice',logger:console});
const f=await tts.synthesize('在的，说吧。');
console.log(f);
