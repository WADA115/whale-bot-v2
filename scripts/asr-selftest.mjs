import { createAsr } from '../src/core/asr.js';
const asr=createAsr({url:'http://127.0.0.1:3199',ffmpegPath:'E:/deepseek_qq.bot/qq-bridge/tools/ffmpeg/ffmpeg.exe',logger:console});
const text=await asr.transcribe([{type:'record',data:{file:'E:/deepseek_qq.bot/qq-bridge/tools/asr/sherpa-onnx-paraformer-zh-small-2024-03-09/test_wavs/0.wav'}}]);
console.log('ASR:',text);
