const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const demo = window.DEMO;
const demoStory = window.DEMO_STORY;
let state = demo;
let story = null;
let offline = false;
let activePage = 'today';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function autoGrow(el) {
  if (!el || el.offsetParent === null) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function autoGrowAll() {
  requestAnimationFrame(() => $$('textarea').forEach(autoGrow));
}

async function getJson(url, fallback = null) {
  try {
    const res = await api(url, { cache: 'no-store' });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

loadState();

const initialPage = new URLSearchParams(location.search).get('page');
if (initialPage && document.getElementById(`page-${initialPage}`)) switchPage(initialPage);
