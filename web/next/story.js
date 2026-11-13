async function loadStory(key) {
  if (!key) return;
  story = await getJson('/api/story?key=' + encodeURIComponent(key));
  if (!story) story = key === 'private_demo' ? demoStory : { self: '', relationship: '', now: '', episodes: [] };
  $('#storyNow').value = story.now || '';
  $('#storyRelation').value = story.relationship || '';
  $('#storyLife').value = story.life || '';
  $('#storyWorld').value = story.world || '';
  autoGrowAll();
  $('#charSelf').textContent = story.self || '还没有 self.md。';
  $('#storyEpisodes').innerHTML = (story.episodes || []).length
    ? story.episodes.map((e) => `<article class="episode"><h3>${esc(e.title || '一件小事')}</h3><p>${esc(e.text || '')}</p></article>`).join('')
    : '<p class="muted">还没有 episode。</p>';
  renderToday();
}

async function saveStory() {
  const key = $('#storyKey').value;
  if (!key) return;
  for (const [section, el] of [['now', '#storyNow'], ['relationship', '#storyRelation'], ['life', '#storyLife'], ['world', '#storyWorld']]) {
    const res = await api('/api/story/section', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, section, text: $(el).value })
    });
    if (!res.ok) return alert('保存失败：' + section);
  }
  await loadStory(key);
}

async function loadPerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person) return;
  const data = await getJson('/api/story/person?key=' + encodeURIComponent(key) + '&person=' + encodeURIComponent(person));
  if (!data) return;
  $('#storyPersonHead').value = data.head || '';
  $('#storyPersonMiddle').value = data.middle || '';
  $('#storyPersonTail').value = data.tail || '';
  autoGrowAll();
}

async function savePerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person) return;
  const res = await api('/api/story/person', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key,
      person,
      head: $('#storyPersonHead').value,
      middle: $('#storyPersonMiddle').value,
      tail: $('#storyPersonTail').value
    })
  });
  if (!res.ok) alert('保存人物失败');
}

async function forgetPerson() {
  const key = $('#storyKey').value;
  const person = $('#storyPersonId').value.trim();
  if (!key || !person || !confirm('忘记这个人在这个群里的侧写？')) return;
  await api('/api/story/person/forget', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, person })
  });
  $('#storyPersonHead').value = '';
  $('#storyPersonMiddle').value = '';
  $('#storyPersonTail').value = '';
}

