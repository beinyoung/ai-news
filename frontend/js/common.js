function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 2800);
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function initTheme(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  var saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  btn.addEventListener('click', function () {
    var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
  });
}

function renderPagination(elId, total, page, limit, goFn) {
  var el = document.getElementById(elId);
  if (!el) return;
  total = total || 0;
  limit = limit || 20;
  var pages = Math.ceil(total / limit);
  if (pages <= 1) {
    el.innerHTML = '';
    return;
  }
  var html = '<button class="page-btn"' + (page <= 1 ? ' disabled' : '') + ' onclick="' + goFn + '(' + (page - 1) + ')">上一页</button>';
  for (var i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    html += '<button class="page-btn' + (i === page ? ' active' : '') + '" onclick="' + goFn + '(' + i + ')">' + i + '</button>';
  }
  html += '<button class="page-btn"' + (page >= pages ? ' disabled' : '') + ' onclick="' + goFn + '(' + (page + 1) + ')">下一页</button>';
  el.innerHTML = html;
}
