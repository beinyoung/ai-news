const API = '';

const state = {
  page: 1,
  limit: 15,
  date: null,
  category: 'all',
  search: '',
  mode: 'news',
  saved: false,
  unread: false,
  personalized: false,
};

initTheme('themeToggle');

function fmtDate(str) {
  if (!str) return '';
  var d = new Date(str.replace(' ', 'T'));
  return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderTags(tags) {
  if (!tags) return '';
  return tags
    .split(',')
    .map(function (t) { return t.trim(); })
    .filter(Boolean)
    .map(function (t) { return '<span class="tag tag-click" onclick="toggleTagSub(\'' + escAttr(t) + '\')">' + escHtml(t) + '</span>'; })
    .join('');
}

function renderCard(item) {
  var tags = renderTags(item.tags);
  return '<article class="news-card">' +
    '<div class="card-header">' +
      '<div class="importance-badge imp-' + Math.max(1, Math.min(10, item.importance || 5)) + '">' + (item.importance || 5) + '</div>' +
      '<div class="card-meta">' +
        '<div class="card-title">' + escHtml(item.title) + '</div>' +
        '<div class="card-info">' +
          '<span class="card-source">' + escHtml(item.source_name || '') + '</span>' +
          '<span class="card-time">' + fmtDate(item.published_at) + '</span>' +
          (item.personal_score !== undefined ? '<span class="card-cat">个性分 ' + item.personal_score + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      (item.summary ? '<p class="card-summary">' + escHtml(item.summary) + '</p>' : '') +
      '<div>' + tags + '</div>' +
      '<div class="card-actions-row">' +
        '<button class="btn-sm ' + (item.is_saved ? 'edit' : '') + '" onclick="toggleSaved(' + item.id + ', ' + (item.is_saved ? 0 : 1) + ')">' + (item.is_saved ? '已收藏' : '收藏') + '</button>' +
        '<button class="btn-sm ' + (item.is_read ? 'edit' : '') + '" onclick="toggleRead(' + item.id + ', ' + (item.is_read ? 0 : 1) + ')">' + (item.is_read ? '已读' : '未读') + '</button>' +
        (item.source_url ? '<a class="card-source-link" href="' + escAttr(item.source_url) + '" target="_blank" rel="noopener">查看原文</a>' : '') +
      '</div>' +
    '</div>' +
  '</article>';
}

function renderEventCard(event) {
  return '<article class="news-card">' +
    '<div class="card-header">' +
      '<div class="importance-badge imp-' + Math.max(1, Math.min(10, event.importance || 5)) + '">' + (event.importance || 5) + '</div>' +
      '<div class="card-meta">' +
        '<div class="card-title">' + escHtml(event.title) + '</div>' +
        '<div class="card-info">' +
          '<span class="card-source">事件聚合</span>' +
          '<span class="card-time">' + event.count + ' 条报道</span>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-body">' +
      '<p class="card-summary">' + escHtml(event.summary || '') + '</p>' +
      '<div class="detail-text">来源：' + (event.sources || []).map(escHtml).join(' / ') + '</div>' +
    '</div>' +
  '</article>';
}

function updateModeButtonState() {
  var map = [
    ['modeNews', state.mode === 'news'],
    ['modeEvents', state.mode === 'events'],
    ['modeSubscribed', state.mode === 'subscribed'],
    ['filterSaved', state.saved],
    ['filterUnread', state.unread],
    ['filterPersonal', state.personalized],
  ];
  map.forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (el) el.classList.toggle('active', !!pair[1]);
  });
}

function updateFilterBar() {
  var chips = [];
  chips.push('模式: ' + (state.mode === 'events' ? '事件聚合' : state.mode === 'subscribed' ? '订阅主题' : '新闻流'));
  if (state.category !== 'all') chips.push('分类: ' + state.category);
  if (state.date) chips.push('日期: ' + state.date);
  if (state.search) chips.push('搜索: ' + state.search);
  if (state.saved) chips.push('仅收藏');
  if (state.unread) chips.push('仅未读');
  if (state.personalized) chips.push('个性分排序');
  document.getElementById('filterTags').innerHTML = chips.map(function (c) { return '<span class="filter-chip">' + escHtml(c) + '</span>'; }).join('');
}

function applyUiState() {
  updateModeButtonState();
  updateFilterBar();
}

var searchTimer = 0;

function loadNews() {
  var list = document.getElementById('newsList');
  list.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  applyUiState();

  var url, p;
  if (state.mode === 'events') {
    p = new URLSearchParams({ limit: 40 });
    if (state.date) p.set('date', state.date);
    url = API + '/api/events?' + p;
  } else if (state.mode === 'subscribed') {
    p = new URLSearchParams({ page: state.page, limit: state.limit });
    url = API + '/api/news/subscribed?' + p;
  } else {
    p = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.date) p.set('date', state.date);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.search) p.set('search', state.search);
    if (state.saved) p.set('saved', 'true');
    if (state.unread) p.set('unread', 'true');
    if (state.personalized) p.set('personalized', 'true');
    url = API + '/api/news?' + p;
  }

  fetch(url)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (state.mode === 'events') {
        list.innerHTML = data.items && data.items.length ? data.items.map(renderEventCard).join('') : '<div class="empty"><p>暂无事件聚合</p></div>';
        document.getElementById('resultInfo').textContent = '事件聚合 ' + (data.items ? data.items.length : 0) + ' 条';
        document.getElementById('pagination').innerHTML = '';
        return;
      }
      if (state.mode === 'subscribed') {
        list.innerHTML = data.items && data.items.length ? data.items.map(renderCard).join('') : '<div class="empty"><p>暂无订阅主题新闻</p></div>';
        document.getElementById('resultInfo').textContent = '订阅主题 ' + (data.total || 0) + ' 条';
        renderPagination('pagination', data.total || 0, data.page || 1, data.limit || state.limit, 'goPage');
        return;
      }
      list.innerHTML = data.items && data.items.length ? data.items.map(renderCard).join('') : '<div class="empty"><p>暂无新闻</p></div>';
      document.getElementById('resultInfo').textContent = '共 ' + (data.total || 0) + ' 条';
      renderPagination('pagination', data.total || 0, data.page || 1, data.limit || state.limit, 'goPage');
    })
    .catch(function () {
      list.innerHTML = '<div class="empty"><p>加载失败</p></div>';
    });
}

window.goPage = function (p) { state.page = p; loadNews(); };

function loadDates() {
  fetch(API + '/api/dates')
    .then(function (r) { return r.json(); })
    .then(function (dates) {
      var el = document.getElementById('dateList');
      var prevActive = el.querySelector('.date-item.active');
      el.innerHTML =
        '<li class="date-item' + (!state.date ? ' active' : '') + '" onclick="filterDate(null)"><span>全部日期</span></li>' +
        dates.map(function (d) {
          return '<li class="date-item' + (state.date === d.date ? ' active' : '') + '" onclick="filterDate(\'' + d.date + '\')"><span>' + d.date + '</span><span class="date-count">' + d.count + '</span></li>';
        }).join('');
      return el;
    });
}

window.filterDate = function (d) {
  state.date = d;
  state.page = 1;
  loadDates();
  loadNews();
};

function loadSubscribedTagsPanel() {
  var box = document.getElementById('subscribedTags');
  fetch(API + '/api/tags/subscribed')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var tags = data.tags || [];
      if (!tags.length) {
        box.innerHTML = '<div class="subscribed-empty">暂无订阅。点击新闻标签即可订阅。</div>';
        return;
      }
      box.innerHTML = tags.map(function (t) {
        return '<span class="subscribed-tag">' + escHtml(t) + '<button title="取消订阅" onclick="removeSubscribedTag(\'' + escAttr(t) + '\')">×</button></span>';
      }).join('');
    })
    .catch(function () {
      box.innerHTML = '<div class="subscribed-empty">加载失败</div>';
    });
}

window.removeSubscribedTag = function (tag) {
  fetch(API + '/api/tags/subscribed')
    .then(function (r) { return r.json(); })
    .then(function (cur) {
      var set = new Set(cur.tags || []);
      set.delete(tag);
      return fetch(API + '/api/tags/subscribed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: Array.from(set) }),
      });
    })
    .then(function () {
      toast('已取消订阅: ' + tag, 'success');
      loadSubscribedTagsPanel();
      if (state.mode === 'subscribed') loadNews();
    });
};

window.toggleTagSub = function (tag) {
  fetch(API + '/api/tags/subscribed')
    .then(function (r) { return r.json(); })
    .then(function (cur) {
      var set = new Set(cur.tags || []);
      if (set.has(tag)) set.delete(tag); else set.add(tag);
      return fetch(API + '/api/tags/subscribed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: Array.from(set) }),
      });
    })
    .then(function () {
      toast('订阅标签已更新: ' + tag, 'success');
      loadSubscribedTagsPanel();
    });
};

window.toggleSaved = function (id, v) {
  fetch(API + '/api/news/' + id + '/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_saved: !!v }),
  }).then(loadNews);
};

window.toggleRead = function (id, v) {
  fetch(API + '/api/news/' + id + '/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_read: !!v }),
  }).then(loadNews);
};

function loadTrends() {
  fetch(API + '/api/trends?days=7')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      document.getElementById('trendTopTags').textContent =
        (d.top_tags || []).slice(0, 6).map(function (x) { return x.tag + '(' + x.count + ')'; }).join(' · ') || '暂无';
      document.getElementById('trendTopSources').textContent =
        (d.top_sources || []).slice(0, 5).map(function (x) { return x.source_name + '(' + x.count + ')'; }).join(' · ') || '暂无';
    });
}

document.getElementById('catList').addEventListener('click', function (e) {
  var btn = e.target.closest('.cat-btn');
  if (!btn) return;
  document.querySelectorAll('.cat-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  state.category = btn.dataset.cat;
  state.page = 1;
  loadNews();
});

document.getElementById('searchInput').addEventListener('input', function (e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    state.search = e.target.value.trim();
    state.page = 1;
    loadNews();
  }, 300);
});

document.getElementById('crawlBtn').addEventListener('click', function () {
  fetch(API + '/api/crawl', { method: 'POST' }).then(function () {
    return Promise.all([loadDates(), loadNews(), loadTrends()]);
  });
});

document.getElementById('modeNews').addEventListener('click', function () { state.mode = 'news'; state.page = 1; loadNews(); });
document.getElementById('modeEvents').addEventListener('click', function () { state.mode = 'events'; state.page = 1; loadNews(); });
document.getElementById('modeSubscribed').addEventListener('click', function () { state.mode = 'subscribed'; state.page = 1; loadNews(); });
document.getElementById('filterSaved').addEventListener('click', function () { state.saved = !state.saved; state.page = 1; loadNews(); });
document.getElementById('filterUnread').addEventListener('click', function () { state.unread = !state.unread; state.page = 1; loadNews(); });
document.getElementById('filterPersonal').addEventListener('click', function () { state.personalized = !state.personalized; state.page = 1; loadNews(); });

document.getElementById('clearFilters').addEventListener('click', function () {
  state.page = 1;
  state.mode = 'news';
  state.saved = false;
  state.unread = false;
  state.personalized = false;
  state.date = null;
  state.search = '';
  state.category = 'all';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.cat-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.cat === 'all'); });
  loadDates();
  loadNews();
});

Promise.all([loadDates(), loadNews(), loadTrends(), loadSubscribedTagsPanel()]);
