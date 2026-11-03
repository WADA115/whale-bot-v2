"""把逐字语音拼成一段清唱，并铺一层很轻的旋律。

不是声乐模型，不假装是真唱。它只做两件事：
  1. 把每个字的语音按时间接起来；
  2. 在下面垫一条简单的旋律，让这段话有歌的骨架。

输入 JSON:
  {"segments": ["a.wav", "b.wav"], "notes": [261.6, 293.7], "out": "song.wav"}
"""
import json
import math
import sys
import wave

import numpy as np


def read_wav(path):
    with wave.open(path, 'rb') as f:
        channels = f.getnchannels()
        width = f.getsampwidth()
        rate = f.getframerate()
        raw = f.readframes(f.getnframes())
    if width != 2:
        raise ValueError('need 16-bit wav')
    data = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, rate


def envelope(n, rate, attack=0.015, release=0.08):
    a = max(1, int(attack * rate))
    r = max(1, int(release * rate))
    env = np.ones(n, dtype=np.float32)
    env[:min(a, n)] = np.linspace(0, 1, min(a, n), dtype=np.float32)
    env[-min(r, n):] = np.linspace(1, 0, min(r, n), dtype=np.float32)
    return env


def melody(notes, seg_len, rate):
    total = max(1, seg_len)
    out = np.zeros(total, dtype=np.float32)
    step = max(1, total // max(1, len(notes)))
    for i, freq in enumerate(notes):
        start = i * step
        end = min(total, start + step)
        if end <= start:
            continue
        t = np.arange(end - start, dtype=np.float32) / rate
        tone = 0.16 * np.sin(2 * math.pi * float(freq) * t)
        tone += 0.04 * np.sin(2 * math.pi * float(freq) * 2 * t)
        out[start:end] += tone * envelope(end - start, rate, 0.01, 0.05)
    return out


def main():
    payload = json.loads(sys.stdin.read())
    segments = payload.get('segments') or []
    notes = payload.get('notes') or []
    out = payload.get('out')
    if not segments or not out:
        raise SystemExit('missing segments/out')

    vocals = []
    rate = None
    for path in segments:
        data, sr = read_wav(path)
        if rate is None:
            rate = sr
        if sr != rate:
            raise SystemExit('sample rate mismatch')
        vocals.append(data)

    vocal = np.concatenate(vocals) if vocals else np.zeros(rate, dtype=np.float32)
    # 每个字之间留一点气口，不让人声粘成一条。
    gap = np.zeros(max(1, int(0.035 * rate)), dtype=np.float32)
    vocal = np.concatenate([np.concatenate([v, gap]) for v in vocals]) if vocals else vocal
    track = melody(notes, len(vocal), rate)
    mix = np.clip(vocal * 0.95 + track, -1.0, 1.0)
    pcm = (mix * 32767.0).astype('<i2').tobytes()
    with wave.open(out, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(pcm)
    print(out)


if __name__ == '__main__':
    main()
