const messages = [
  '在吗',
  '你今天怎么这么安静',
  '你是不是AI？',
  '帮我写个周报',
  '我叫阿杰，记住',
  '你刚才说错了',
  '算了，不想聊了',
  '那你唱歌给我听',
  '晚安',
  '今天有点累'
];
for (const text of messages) {
  const res = await fetch('http://127.0.0.1:3201/simulate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, userId: '10001', name: '阿杰' })
  });
  console.log(res.status, text);
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
