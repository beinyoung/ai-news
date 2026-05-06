const API = '';
var currentPage = 1;

initTheme('themeToggle');

function showStatus(text, type) {
  var el = document.getElementById('digestStatus');
  el.style.display = 'block';
  el.textContent = text;
  el.className = 'digest-status' + (type ? ' ' + type : '');
}

function setGenerating(kind, on) {
  if (kind === 'daily') {
    document.getElementById('dailyBtn').disabled = on;
    document.getElementById('dailyBtn').textContent = on ? '日报生成中...' : '生成今日日报';
  } else {
    document.getElementById('weeklyBtn').disabled = on;
    document.getElementById('weeklyBtn').textContent = on ? '周报生成中...' : '生成本周周报';
  }
}

function loadDigests() {
  var el = document.getElementById('digestList');
  el.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  fetch(API + '/api/digests?page=' + currentPage + '&limit=10')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.items || !data.items.length) {
        el.innerHTML = '<div class="empty"><p>暂无综述</p></div>';
        return;
      }
      el.innerHTML = data.items.map(function (d) {
        return '<div class="digest-card">' +
          '<div class="digest-card-header" onclick="toggleDigestCard(' + d.id + ')">' +
            '<div class="digest-card-date">' + d.date + '</div>' +
            '<div class="digest-card-count">共 ' + d.article_count + ' 条 · ' + String(d.created_at || '').slice(0, 16) + '</div>' +
            '<span class="digest-card-toggle" id="digest-toggle-' + d.id + '">展开</span>' +
          '</div>' +
          '<div class="digest-card-body" id="digest-body-' + d.id + '">' + escHtml(d.content || '') + '</div>' +
        '</div>';
      }).join('');
    });
}

window.toggleDigestCard = function (id) {
  var body = document.getElementById('digest-body-' + id);
  var t = document.getElementById('digest-toggle-' + id);
  var open = body.classList.toggle('open');
  t.textContent = open ? '收起' : '展开';
};

window.generateDigest = function () {
  setGenerating('daily', true);
  showStatus('正在生成今日日报，请稍候...');
  fetch(API + '/api/digests/generate', { method: 'POST' })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) {
        showStatus(result.data.detail || '日报生成失败', 'error');
        return;
      }
      showStatus(result.data.message || '今日日报生成完成', 'success');
      currentPage = 1;
      return loadDigests();
    })
    .catch(function () {
      showStatus('请求失败，请检查后端服务', 'error');
    })
    .then(function () {
      setGenerating('daily', false);
    });
};

window.generateWeeklyDigest = function () {
  setGenerating('weekly', true);
  showStatus('正在生成本周周报，请稍候...');
  fetch(API + '/api/digests/generate-weekly', { method: 'POST' })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (!result.ok) {
        showStatus(result.data.detail || '周报生成失败', 'error');
        return;
      }
      showStatus(result.data.message || '本周周报生成完成', 'success');
      currentPage = 1;
      return loadDigests();
    })
    .catch(function () {
      showStatus('请求失败，请检查后端服务', 'error');
    })
    .then(function () {
      setGenerating('weekly', false);
    });
};

loadDigests();
