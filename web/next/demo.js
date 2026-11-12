(() => {
  window.DEMO = {
    status: { mode: 'offline', connected: false, selfId: '', uptimeSec: 0, sent: 0, tasks: 0 },
    card: { name: '', identity: '', voice: [], values: [], boundaries: [] },
    scenes: {},
    bilibili: { enabled: false, loggedIn: false, user: null },
    autonomy: { enabled: false, discoveries: [], countToday: 0 },
    story: []
  };
  window.DEMO_STORY = { self: '', relationship: '', now: '', episodes: [] };
})();