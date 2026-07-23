/* ===== KLine Analyzer - Utils & Global State ===== */

// Global state
let stockList = [];          // 全量标的索引 (stock-list.json)
let currentStockData = null; // 当前选中个股的完整数据
let currentStockCode = null; // 当前选中的股票代码
let currentPeriod = 'daily';  // daily | weekly

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    await loadStockList();
});

// ---- 搜索逻辑 ----

/** 加载全量标的索引 */
async function loadStockList() {
    try {
        stockList = await fetchJSON('data/latest/stock-list.json');
        if (typeof renderSearchBox === 'function') {
            renderSearchBox();
        }
        if (typeof loadSidePanels === 'function') {
            loadSidePanels();
        }
    } catch (error) {
        showError('索引加载失败', error.message);
    }
}

/** 搜索股票：代码 / 名称 / 拼音首字母模糊匹配 */
function searchStocks(query) {
    if (!query || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();

    return stockList.filter(stock => {
        const code = String(stock.code);
        const name = (stock.name || '').toLowerCase();
        const pinyin = (stock.pinyin || '').toLowerCase();

        return code.includes(q)
            || name.includes(q)
            || pinyin.includes(q);
    });
}

/** debounce: 延迟执行，用于输入框实时搜索 */
function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ---- 数据加载 ----

/** 选中并加载个股 */
async function selectStockByCode(code, fileName) {
    currentStockCode = code;

    const detailEl = document.getElementById('stock-detail');
    if (detailEl) {
        detailEl.innerHTML = '<div class="loading">加载股票数据...</div>';
    }

    const file = fileName || `${code}.json`;
    try {
        const stockData = await fetchJSON(`data/latest/stocks/${file}`);
        currentStockData = stockData;
        if (typeof renderStockDetail === 'function') {
            renderStockDetail(stockData);
        }
    } catch (error) {
        if (detailEl) {
            detailEl.innerHTML = `<div class="loading">加载失败: ${escapeHtml(error.message)}</div>`;
        }
    }
}

// ---- 工具函数 ----

/** fetch JSON 并禁用缓存 */
async function fetchJSON(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
}

/** 显示错误 */
function showError(title, message) {
    const container = document.getElementById('error-container');
    if (container) {
        container.style.display = 'block';
        container.innerHTML = `<strong>${title}</strong>: ${message}`;
        setTimeout(() => { container.style.display = 'none'; }, 10000);
    }
}

/** 格式化数字 */
function fmtNum(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    return Number(val).toFixed(decimals);
}

/** 格式化大数字（亿/万） */
function fmtBig(val) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    const abs = Math.abs(val);
    if (abs >= 1e8) return (val / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4) return (val / 1e4).toFixed(2) + '万';
    return val.toFixed(2);
}

/** HTML 转义 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** 方向 → CSS 颜色类 */
function dirColorClass(dir) {
    if (!dir) return 'text-flat';
    if (dir.includes('上升') || dir.includes('上涨') || dir.includes('多') || dir.includes('bullish')) return 'text-up';
    if (dir.includes('下降') || dir.includes('下跌') || dir.includes('空') || dir.includes('bearish')) return 'text-down';
    return 'text-flat';
}
