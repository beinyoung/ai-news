const API = '';

const state = {
  page: 1,
  limit: 15,
  date: null,
  category: 'all',
  search: '',
  total: 0,
  mode: 'news', // news | events | subscribed
  saved: false,
  unread: false,
  personalized: false,
};

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str.replace(' ', 'T'));
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
themeToggle.addEventListener('click', () => {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('theme', t);
  themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
});

function renderTags(tags) {
  if (!tags) return '';
  return tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => `<span class="tag tag-click" onclick="toggleTagSub('${escAttr(t)}')">${escHtml(t)}</span>`)
    .join('');
}

function renderCard(item) {
  const tags = renderTags(item.tags);
  return `<article class="news-card">
    <div class="card-header">
      <div class="importance-badge imp-${Math.max(1, Math.min(10, item.importance || 5))}">${item.importance || 5}</div>
      <div class="card-meta">
        <div class="card-title">${escHtml(item.title)}</div>
        <div class="card-info">
          <span class="card-source">${escHtml(item.source_name || '')}</span>
          <span class="card-time">${fmtDate(item.published_at)}</span>
          ${item.personal_score !== undefined ? `<span class="card-cat">个性分 ${item.personal_score}</span>` : ''}
        </div>
      </div>
    </div>
    <div class="card-body">
      ${item.summary ? `<p class="card-summary">${escHtml(item.summary)}</p>` : ''}
      <div>${tags}</div>
      <div class="card-actions-row">
        <button class="btn-sm ${item.is_saved ? 'edit' : ''}" onclick="toggleSaved(${item.id}, ${item.is_saved ? 0 : 1})">${item.is_saved ? '已收藏' : '收藏'}</button>
        <button class="btn-sm ${item.is_read ? 'edit' : ''}" onclick="toggleRead(${item.id}, ${item.is_read ? 0 : 1})">${item.is_read ? '已读' : '未读'}</button>
        ${item.source_url ? `<a class="card-source-link" href="${escAttr(item.source_url)}" target="_blank" rel="noopener">查看原文</a>` : ''}
      </div>
    </div>
  </article>`;
}

function renderEventCard(event) {
  return `<article class="news-card">
    <div class="card-header">
      <div class="importance-badge imp-${Math.max(1, Math.min(10, event.importance || 5))}">${event.importance || 5}</div>
      <div class="card-meta">
        <div class="card-title">${escHtml(event.title)}</div>
        <div class="card-info">
          <span class="card-source">事件聚合</span>
          <span class="card-time">${event.count} 条报道</span>
        </div>
      </div>
    </div>
    <div class="card-body">
      <p class="card-summary">${escHtml(event.summary || '')}</p>
      <div class="detail-text">来源：${(event.sources || []).map(escHtml).join(' / ')}</div>
    </div>
  </article>`;
}

function updateModeButtonState() {
  const map = [
    ['modeNews', state.mode === 'news'],
    ['modeEvents', state.mode === 'events'],
    ['modeSubscribed', state.mode === 'subscribed'],
    ['filterSaved', state.saved],
    ['filterUnread', state.unread],
    ['filterPersonal', state.personalized],
  ];
  map.forEach(([id, active]) => document.getElementById(id)?.classList.toggle('active', !!active));
}

function updateFilterBar() {
  const chips = [];
  chips.push(`模式: ${state.mode === 'events' ? '事件聚合' : state.mode === 'subscribed' ? '订阅主题' : '新闻流'}`);
  if (state.category !== 'all') chips.push(`分类: ${state.category}`);
  if (state.date) chips.push(`日期: ${state.date}`);
  if (state.search) chips.push(`搜索: ${state.search}`);
  if (state.saved) chips.push('仅收藏');
  if (state.unread) chips.push('仅未读');
  if (state.personalized) chips.push('个性分排序');
  document.getElementById('filterTags').innerHTML = chips.map(c => `<span class="filter-chip">${escHtml(c)}</span>`).join('');
}

function applyUiState() {
  updateModeButtonState();
  updateFilterBar();
}

async function loadNews() {
  const list = document.getElementById('newsList');
  list.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  applyUiState();

  try {
    if (state.mode === 'events') {
      const p = new URLSearchParams({ limit: 40 });
      if (state.date) p.set('date', state.date);
      const data = await (await fetch(`${API}/api/events?${p}`)).json();
      list.innerHTML = data.items?.length ? data.items.map(renderEventCard).join('') : '<div class="empty"><p>暂无事件聚合</p></div>';
      document.getElementById('resultInfo').textContent = `事件聚合 ${data.items?.length || 0} 条`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    if (state.mode === 'subscribed') {
      const p = new URLSearchParams({ page: state.page, limit: state.limit });
      const data = await (await fetch(`${API}/api/news/subscribed?${p}`)).json();
      list.innerHTML = data.items?.length ? data.items.map(renderCard).join('') : '<div class="empty"><p>暂无订阅主题新闻</p></div>';
      document.getElementById('resultInfo').textContent = `订阅主题 ${data.total || 0} 条`;
      renderPagination(data.total || 0, data.page || 1, data.limit || state.limit);
      return;
    }

    const p = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.date) p.set('date', state.date);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.search) p.set('search', state.search);
    if (state.saved) p.set('saved', 'true');
    if (state.unread) p.set('unread', 'true');
    if (state.personalized) p.set('personalized', 'true');
    const data = await (await fetch(`${API}/api/news?${p}`)).json();
    state.total = data.total || 0;
    list.innerHTML = data.items?.length ? data.items.map(renderCard).join('') : '<div class="empty"><p>暂无新闻</p></div>';
    document.getElementById('resultInfo').textContent = `共 ${state.total} 条`;
    renderPagination(data.total || 0, data.page || 1, data.limit || state.limit);
  } catch {
    list.innerHTML = '<div class="empty"><p>加载失败</p></div>';
  }
}

function renderPagination(total, page, limit) {
  const pages = Math.ceil(total / limit);
  const el = document.getElementById('pagination');
  if (pages <= 1) {
    el.innerHTML = '';
    return;
  }
  let html = `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="goPage(${page - 1})">上一页</button>`;
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="goPage(${page + 1})">下一页</button>`;
  el.innerHTML = html;
}
window.goPage = (p) => { state.page = p; loadNews(); };

async function loadDates() {
  const dates = await (await fetch(`${API}/api/dates`)).json();
  const el = document.getElementById('dateList');
  el.innerHTML =
    `<li class="date-item ${!state.date ? 'active' : ''}" onclick="filterDate(null)"><span>全部日期</span></li>` +
    dates.map(d => `<li class="date-item ${state.date === d.date ? 'active' : ''}" onclick="filterDate('${d.date}')"><span>${d.date}</span><span class="date-count">${d.count}</span></li>`).join('');
}
window.filterDate = (d) => {
  state.date = d;
  state.page = 1;
  loadDates();
  loadNews();
};

async function loadSubscribedTagsPanel() {
  const box = document.getElementById('subscribedTags');
  try {
    const data = await (await fetch(`${API}/api/tags/subscribed`)).json();
    const tags = data.tags || [];
    if (!tags.length) {
      box.innerHTML = '<div class="subscribed-empty">暂无订阅。点击新闻标签即可订阅。</div>';
      return;
    }
    box.innerHTML = tags.map(t => `
      <span class="subscribed-tag">
        ${escHtml(t)}
        <button title="取消订阅" onclick="removeSubscribedTag('${escAttr(t)}')">×</button>
      </span>
    `).join('');
  } catch {
    box.innerHTML = '<div class="subscribed-empty">加载失败</div>';
  }
}

window.removeSubscribedTag = async (tag) => {
  const cur = await (await fetch(`${API}/api/tags/subscribed`)).json();
  const set = new Set(cur.tags || []);
  set.delete(tag);
  await fetch(`${API}/api/tags/subscribed`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: [...set] }),
  });
  toast(`已取消订阅: ${tag}`, 'success');
  loadSubscribedTagsPanel();
  if (state.mode === 'subscribed') loadNews();
};

window.toggleTagSub = async (tag) => {
  const cur = await (await fetch(`${API}/api/tags/subscribed`)).json();
  const set = new Set(cur.tags || []);
  if (set.has(tag)) set.delete(tag); else set.add(tag);
  await fetch(`${API}/api/tags/subscribed`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: [...set] }),
  });
  toast(`订阅标签已更新: ${tag}`, 'success');
  loadSubscribedTagsPanel();
};

window.toggleSaved = async (id, v) => {
  await fetch(`${API}/api/news/${id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_saved: !!v }),
  });
  loadNews();
};

window.toggleRead = async (id, v) => {
  await fetch(`${API}/api/news/${id}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_read: !!v }),
  });
  loadNews();
};

async function loadTrends() {
  const d = await (await fetch(`${API}/api/trends?days=7`)).json();
  document.getElementById('trendTopTags').textContent =
    (d.top_tags || []).slice(0, 6).map(x => `${x.tag}(${x.count})`).join(' · ') || '暂无';
  document.getElementById('trendTopSources').textContent =
    (d.top_sources || []).slice(0, 5).map(x => `${x.source_name}(${x.count})`).join(' · ') || '暂无';
}

document.getElementById('catList').addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.cat;
  state.page = 1;
  loadNews();
});

document.getElementById('searchInput').addEventListener('input', (e) => {
  state.search = e.target.value.trim();
  state.page = 1;
  loadNews();
});

document.getElementById('crawlBtn').addEventListener('click', async () => {
  await fetch(`${API}/api/crawl`, { method: 'POST' });
  await loadDates();
  await loadNews();
  await loadTrends();
});

document.getElementById('modeNews').addEventListener('click', () => {
  state.mode = 'news';
  state.page = 1;
  loadNews();
});
document.getElementById('modeEvents').addEventListener('click', () => {
  state.mode = 'events';
  state.page = 1;
  loadNews();
});
document.getElementById('modeSubscribed').addEventListener('click', () => {
  state.mode = 'subscribed';
  state.page = 1;
  loadNews();
});
document.getElementById('filterSaved').addEventListener('click', () => {
  state.saved = !state.saved;
  state.page = 1;
  loadNews();
});
document.getElementById('filterUnread').addEventListener('click', () => {
  state.unread = !state.unread;
  state.page = 1;
  loadNews();
});
document.getElementById('filterPersonal').addEventListener('click', () => {
  state.personalized = !state.personalized;
  state.page = 1;
  loadNews();
});

document.getElementById('clearFilters').addEventListener('click', () => {
  state.page = 1;
  state.mode = 'news';
  state.saved = false;
  state.unread = false;
  state.personalized = false;
  state.date = null;
  state.search = '';
  state.category = 'all';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b.dataset.cat === 'all'));
  loadDates();
  loadNews();
});

loadDates();
loadNews();
loadTrends();
loadSubscribedTagsPanel();
