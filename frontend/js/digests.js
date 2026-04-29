const API = '';
let currentPage = 1;

const dailyBtn = document.getElementById('dailyBtn');
const weeklyBtn = document.getElementById('weeklyBtn');
const statusEl = document.getElementById('digestStatus');

function showStatus(text, type = 'info') {
  statusEl.style.display = 'block';
  statusEl.textContent = text;
  statusEl.style.borderColor = type === 'error' ? '#b91c1c' : type === 'success' ? '#15803d' : 'var(--border)';
}

function setGenerating(kind, on) {
  if (kind === 'daily') {
    dailyBtn.disabled = on;
    dailyBtn.textContent = on ? '日报生成中...' : '生成今日日报';
  } else {
    weeklyBtn.disabled = on;
    weeklyBtn.textContent = on ? '周报生成中...' : '生成本周周报';
  }
}

async function loadDigests() {
  const el = document.getElementById('digestList');
  el.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  const res = await fetch(`${API}/api/digests?page=${currentPage}&limit=10`);
  const data = await res.json();
  if (!data.items || !data.items.length) {
    el.innerHTML = '<div class="empty"><p>暂无综述</p></div>';
    return;
  }
  el.innerHTML = data.items.map(d => `
    <div class="digest-card">
      <div class="digest-card-header" onclick="toggleDigestCard(${d.id})">
        <div class="digest-card-date">${d.date}</div>
        <div class="digest-card-count">共 ${d.article_count} 条 · ${String(d.created_at || '').slice(0,16)}</div>
        <span class="digest-card-toggle" id="digest-toggle-${d.id}">展开</span>
      </div>
      <div class="digest-card-body" id="digest-body-${d.id}">${(d.content || '').replace(/</g, '&lt;')}</div>
    </div>
  `).join('');
}

window.toggleDigestCard = (id) => {
  const body = document.getElementById(`digest-body-${id}`);
  const t = document.getElementById(`digest-toggle-${id}`);
  const open = body.classList.toggle('open');
  t.textContent = open ? '收起' : '展开';
};

window.generateDigest = async () => {
  setGenerating('daily', true);
  showStatus('正在生成今日日报，请稍候...');
  try {
    const res = await fetch(`${API}/api/digests/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showStatus(data.detail || '日报生成失败', 'error');
      return;
    }
    showStatus(data.message || '今日日报生成完成', 'success');
    currentPage = 1;
    await loadDigests();
  } catch {
    showStatus('请求失败，请检查后端服务', 'error');
  } finally {
    setGenerating('daily', false);
  }
};

window.generateWeeklyDigest = async () => {
  setGenerating('weekly', true);
  showStatus('正在生成本周周报，请稍候...');
  try {
    const res = await fetch(`${API}/api/digests/generate-weekly`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showStatus(data.detail || '周报生成失败', 'error');
      return;
    }
    showStatus(data.message || '本周周报生成完成', 'success');
    currentPage = 1;
    await loadDigests();
  } catch {
    showStatus('请求失败，请检查后端服务', 'error');
  } finally {
    setGenerating('weekly', false);
  }
};

loadDigests();
