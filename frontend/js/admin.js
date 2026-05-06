const API = '';

const tableState = {
  page: 1,
  limit: 20,
  search: '',
  sort: 'time',
};

initTheme('themeToggle');

const CAT_MAP = {
  research: '研究',
  industry: '产业',
  product: '产品',
  policy: '政策',
  security: '安全',
  general: '综合',
};

function loadStats() {
  fetch(API + '/api/stats')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById('statTotal').textContent = data.total != null ? data.total : 0;
      document.getElementById('statToday').textContent = data.today != null ? data.today : 0;
    });
}

function loadTable() {
  var params = new URLSearchParams({ page: tableState.page, limit: tableState.limit });
  if (tableState.search) params.set('search', tableState.search);
  if (tableState.sort === 'importance') params.set('sort', 'importance');

  fetch(API + '/api/news?' + params)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById('tableInfo').textContent = '共 ' + (data.total || 0) + ' 条';
      var tbody = document.getElementById('tableBody');

      if (!data.items || !data.items.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">暂无数据</td></tr>';
        document.getElementById('adminPagination').innerHTML = '';
        return;
      }

      tbody.innerHTML = data.items.map(function (item) {
        var dt = item.published_at ? new Date(item.published_at.replace(' ', 'T')).toLocaleDateString('zh-CN') : '';
        var imp = item.importance || 5;
        return '<tr>' +
          '<td>' + item.id + '</td>' +
          '<td class="td-title" title="' + escAttr(item.title) + '">' + escHtml(item.title) + '</td>' +
          '<td><span class="importance-badge imp-' + imp + '" style="display:inline-flex;width:28px;height:28px;font-size:.72rem">' + imp + '</span></td>' +
          '<td>' + (CAT_MAP[item.category] || item.category || '-') + '</td>' +
          '<td style="font-size:.78rem;color:var(--text-muted)">' + escHtml(item.source_name || '') + '</td>' +
          '<td style="font-size:.78rem;color:var(--text-muted)">' + dt + '</td>' +
          '<td class="td-actions"><button class="btn-sm delete" onclick="deleteItem(' + item.id + ')">删除</button></td>' +
        '</tr>';
      }).join('');

      renderPagination('adminPagination', data.total, data.page, data.limit, 'tablePage');
    });
}

window.tablePage = function (p) {
  tableState.page = p;
  loadTable();
};

window.deleteItem = function (id) {
  if (!confirm('确定要删除这条新闻吗？')) return;
  fetch(API + '/api/news/' + id, { method: 'DELETE' })
    .then(function (res) {
      if (res.ok) {
        toast('已删除', 'success');
        return Promise.all([loadStats(), loadTable()]);
      } else {
        toast('删除失败', 'error');
      }
    });
};

function loadCrawlLogs() {
  var el = document.getElementById('crawlLogs');
  fetch(API + '/api/crawl/logs')
    .then(function (r) { return r.json(); })
    .then(function (logs) {
      if (!logs.length) {
        el.innerHTML = '<p style="text-align:center">暂无抓取记录</p>';
        return;
      }
      var statusMap = { success: '成功', partial: '部分成功', failed: '失败', running: '进行中' };
      el.innerHTML = '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="font-size:.8rem;color:var(--text-muted)">' +
          '<th style="text-align:left;padding:4px 8px;font-weight:normal">开始时间</th>' +
          '<th style="text-align:left;padding:4px 8px;font-weight:normal">结束时间</th>' +
          '<th style="text-align:center;padding:4px 8px;font-weight:normal">新增</th>' +
          '<th style="text-align:center;padding:4px 8px;font-weight:normal">状态</th>' +
          '<th style="text-align:left;padding:4px 8px;font-weight:normal">错误</th>' +
        '</tr></thead>' +
        '<tbody>' +
          logs.map(function (log) {
            return '<tr style="border-top:1px solid var(--border)">' +
              '<td style="padding:6px 8px">' + (log.started_at || '-') + '</td>' +
              '<td style="padding:6px 8px">' + (log.finished_at || '-') + '</td>' +
              '<td style="padding:6px 8px;text-align:center">' + (log.total_saved != null ? log.total_saved : 0) + '</td>' +
              '<td style="padding:6px 8px;text-align:center">' + (statusMap[log.status] || log.status) + '</td>' +
              '<td style="padding:6px 8px;color:var(--text-muted);font-size:.78rem;white-space:pre-wrap">' + escHtml(log.errors || '') + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
      '</table>';
    })
    .catch(function () {
      el.textContent = '加载失败';
    });
}
window.loadCrawlLogs = loadCrawlLogs;

document.getElementById('sortBtn') && document.getElementById('sortBtn').addEventListener('click', function () {
  tableState.sort = tableState.sort === 'time' ? 'importance' : 'time';
  var btn = document.getElementById('sortBtn');
  btn.textContent = tableState.sort === 'importance' ? '按时间排序' : '按重要度排序';
  tableState.page = 1;
  loadTable();
});

var tableSearchTimer = 0;
document.getElementById('tableSearch') && document.getElementById('tableSearch').addEventListener('input', function (e) {
  clearTimeout(tableSearchTimer);
  tableSearchTimer = setTimeout(function () {
    tableState.search = e.target.value.trim();
    tableState.page = 1;
    loadTable();
  }, 300);
});

document.getElementById('crawlBtn') && document.getElementById('crawlBtn').addEventListener('click', function () {
  var btn = document.getElementById('crawlBtn');
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = '抓取中...';
  fetch(API + '/api/crawl', { method: 'POST' })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (result.ok) {
        toast(result.data.message || '抓取完成', 'success');
        return Promise.all([loadStats(), loadTable(), loadCrawlLogs()]);
      } else {
        toast(result.data.detail || '抓取失败', 'error');
      }
    })
    .catch(function () {
      toast('请求失败', 'error');
    })
    .then(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
});

document.getElementById('reprocessBtn') && document.getElementById('reprocessBtn').addEventListener('click', function () {
  var btn = document.getElementById('reprocessBtn');
  btn.disabled = true;
  var old = btn.textContent;
  btn.textContent = '处理中...';
  fetch(API + '/api/reprocess', { method: 'POST' })
    .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
    .then(function (result) {
      if (result.ok) {
        toast(result.data.message || '处理完成', 'success');
        return loadTable();
      } else {
        toast(result.data.detail || '处理失败', 'error');
      }
    })
    .catch(function () {
      toast('请求失败', 'error');
    })
    .then(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
});

Promise.all([loadStats(), loadTable(), loadCrawlLogs()]);
