const API = '';

const tableState = {
  page: 1,
  limit: 20,
  search: '',
  sort: 'time',
};

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  themeToggle.addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    themeToggle.textContent = t === 'dark' ? '☀️' : '🌙';
  });
}

async function loadStats() {
  const res = await fetch(`${API}/api/stats`);
  const data = await res.json();
  document.getElementById('statTotal').textContent = data.total ?? 0;
  document.getElementById('statToday').textContent = data.today ?? 0;
}

const CAT_MAP = {
  research: '研究',
  industry: '产业',
  product: '产品',
  policy: '政策',
  security: '安全',
  general: '综合',
};

async function loadTable() {
  const params = new URLSearchParams({ page: tableState.page, limit: tableState.limit });
  if (tableState.search) params.set('search', tableState.search);
  if (tableState.sort === 'importance') params.set('sort', 'importance');

  const res = await fetch(`${API}/api/news?${params}`);
  const data = await res.json();

  document.getElementById('tableInfo').textContent = `共 ${data.total || 0} 条`;
  const tbody = document.getElementById('tableBody');

  if (!data.items || !data.items.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">暂无数据</td></tr>';
    document.getElementById('adminPagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = data.items.map(item => {
    const dt = item.published_at ? new Date(item.published_at.replace(' ', 'T')).toLocaleDateString('zh-CN') : '';
    const imp = item.importance || 5;
    return `<tr>
      <td>${item.id}</td>
      <td class="td-title" title="${escHtml(item.title)}">${escHtml(item.title)}</td>
      <td><span class="importance-badge imp-${imp}" style="display:inline-flex;width:28px;height:28px;font-size:.72rem">${imp}</span></td>
      <td>${CAT_MAP[item.category] || item.category || '-'}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${escHtml(item.source_name || '')}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${dt}</td>
      <td class="td-actions">
        <button class="btn-sm delete" onclick="deleteItem(${item.id})">删除</button>
      </td>
    </tr>`;
  }).join('');

  renderPagination(data.total, data.page, data.limit);
}

function renderPagination(total, page, limit) {
  const pages = Math.ceil((total || 0) / (limit || 20));
  const el = document.getElementById('adminPagination');
  if (pages <= 1) {
    el.innerHTML = '';
    return;
  }

  let html = `<button class="page-btn" ${page <= 1 ? 'disabled' : ''} onclick="tablePage(${page - 1})">上一页</button>`;
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="tablePage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${page >= pages ? 'disabled' : ''} onclick="tablePage(${page + 1})">下一页</button>`;
  el.innerHTML = html;
}

window.tablePage = (p) => {
  tableState.page = p;
  loadTable();
};

window.deleteItem = async (id) => {
  if (!confirm('确定要删除这条新闻吗？')) return;
  const res = await fetch(`${API}/api/news/${id}`, { method: 'DELETE' });
  if (res.ok) {
    toast('已删除', 'success');
    await loadStats();
    await loadTable();
  } else {
    toast('删除失败', 'error');
  }
};

async function loadCrawlLogs() {
  const el = document.getElementById('crawlLogs');
  try {
    const res = await fetch(`${API}/api/crawl/logs`);
    const logs = await res.json();
    if (!logs.length) {
      el.innerHTML = '<p style="text-align:center">暂无抓取记录</p>';
      return;
    }
    const statusMap = { success: '成功', partial: '部分成功', failed: '失败', running: '进行中' };
    el.innerHTML = `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="font-size:.8rem;color:var(--text-muted)">
        <th style="text-align:left;padding:4px 8px;font-weight:normal">开始时间</th>
        <th style="text-align:left;padding:4px 8px;font-weight:normal">结束时间</th>
        <th style="text-align:center;padding:4px 8px;font-weight:normal">新增</th>
        <th style="text-align:center;padding:4px 8px;font-weight:normal">状态</th>
        <th style="text-align:left;padding:4px 8px;font-weight:normal">错误</th>
      </tr></thead>
      <tbody>
        ${logs.map(log => `<tr style="border-top:1px solid var(--border)">
          <td style="padding:6px 8px">${log.started_at || '-'}</td>
          <td style="padding:6px 8px">${log.finished_at || '-'}</td>
          <td style="padding:6px 8px;text-align:center">${log.total_saved ?? 0}</td>
          <td style="padding:6px 8px;text-align:center">${statusMap[log.status] || log.status}</td>
          <td style="padding:6px 8px;color:var(--text-muted);font-size:.78rem;white-space:pre-wrap">${escHtml(log.errors || '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  } catch {
    el.textContent = '加载失败';
  }
}
window.loadCrawlLogs = loadCrawlLogs;

document.getElementById('sortBtn')?.addEventListener('click', () => {
  tableState.sort = tableState.sort === 'time' ? 'importance' : 'time';
  const btn = document.getElementById('sortBtn');
  btn.textContent = tableState.sort === 'importance' ? '按时间排序' : '按重要度排序';
  tableState.page = 1;
  loadTable();
});

document.getElementById('tableSearch')?.addEventListener('input', e => {
  tableState.search = e.target.value.trim();
  tableState.page = 1;
  loadTable();
});

document.getElementById('crawlBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('crawlBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '抓取中...';
  try {
    const res = await fetch(`${API}/api/crawl`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      toast(data.message || '抓取完成', 'success');
      await loadStats();
      await loadTable();
      await loadCrawlLogs();
    } else {
      toast(data.detail || '抓取失败', 'error');
    }
  } catch {
    toast('请求失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

document.getElementById('reprocessBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('reprocessBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '处理中...';
  try {
    const res = await fetch(`${API}/api/reprocess`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      toast(data.message || '处理完成', 'success');
      await loadTable();
    } else {
      toast(data.detail || '处理失败', 'error');
    }
  } catch {
    toast('请求失败', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
});

loadStats();
loadTable();
loadCrawlLogs();
