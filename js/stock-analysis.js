/* ===== KLine Analyzer - Stock Analysis (搜索驱动版) ===== */

/* ---- 左侧栏面板 ---- */

async function loadSidePanels() {
    for (let [file, countId, listId, hasTag] of [
        ['index-list-for-chart.json', 'idx-count', 'idx-list', false],
        ['smc-buy-list.json', 'smc-count', 'smc-list', true],
    ]) {
        try {
            const list = await fetchJSON('data/latest/' + file);
            document.getElementById(countId).textContent = list.length;
            const el = document.getElementById(listId);
            el.innerHTML = list.slice(0, 200).map(s => {
                const tag = hasTag ? `<span class="tag">${escapeHtml(s.signal || s.event_type || '')}</span>` : '';
                const file = s.file || `${s.code}.json`;
                return `<div class="side-item" onclick="fromSidebar('${escapeHtml(s.code)}','${escapeHtml(file)}','${escapeHtml(s.name)}')">
                    <span class="code">${escapeHtml(s.code)}</span>
                    <span class="name">${escapeHtml(s.name)}</span>${tag}
                </div>`;
            }).join('');
        } catch (e) {
            document.getElementById(countId).textContent = 'err';
        }
    }
}

function fromSidebar(code, file, name) {
    const input = document.getElementById('stock-search-input');
    if (input && name) input.value = `${code} ${name}`;
    selectStockByCode(code, file);
}

/* ---- 搜索框渲染（替换原 stock-tabs） ---- */

function renderSearchBox() {
    const container = document.getElementById('stock-selection');
    if (!container) return;

    // 清除旧内容，渲染搜索区域
    const searchHTML = `
        <div class="search-box">
            <span class="search-icon">&#128269;</span>
            <input
                type="text"
                id="stock-search-input"
                class="search-input"
                placeholder="输入股票代码 / 名称 / 拼音搜索..."
                autocomplete="off"
            />
            <div id="search-results" class="search-results" style="display:none;"></div>
        </div>
        <div id="stock-detail" class="stock-detail empty-state">
            <div class="empty-hint">&#128200;<br>搜索股票查看 K 线分析</div>
        </div>
    `;

    // 保留 section 标题，替换其余内容
    const h2 = container.querySelector('h2');
    container.innerHTML = '';
    if (h2) container.appendChild(h2);
    container.insertAdjacentHTML('beforeend', searchHTML);

    // 绑定搜索事件
    const input = document.getElementById('stock-search-input');
    if (input) {
        input.addEventListener('input', debounce(onSearchInput, 200));
        input.addEventListener('focus', () => {
            if (input.value.trim()) onSearchInput({ target: input });
        });
        // 点击外部关闭下拉
        document.addEventListener('click', (e) => {
            const results = document.getElementById('search-results');
            const box = document.querySelector('.search-box');
            if (results && box && !box.contains(e.target)) {
                results.style.display = 'none';
            }
        });
    }
}

/* ---- 搜索输入处理 ---- */

function onSearchInput(event) {
    const query = event.target.value;
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    if (!query || query.trim().length === 0) {
        resultsEl.style.display = 'none';
        return;
    }

    const results = searchStocks(query);
    renderSearchResults(results, resultsEl);
}

/* ---- 搜索结果下拉 ---- */

function renderSearchResults(results, container) {
    if (results.length === 0) {
        container.innerHTML = '<div class="search-result-empty">无匹配结果</div>';
        container.style.display = 'block';
        return;
    }

    // 最多展示 20 条，避免下拉过长
    const display = results.slice(0, 20);
    const moreHint = results.length > 20
        ? `<div class="search-result-more">... 还有 ${results.length - 20} 条结果，请缩小搜索范围</div>`
        : '';

    container.innerHTML = display.map((stock, i) => {
        const marketLabel = stock.market === 'INDEX' ? '指数' : stock.market;
        const typeClass = stock.type === 'index' ? 'result-index' : '';
        return `
            <div class="search-result-item ${typeClass}" data-code="${escapeHtml(stock.code)}" onclick="onSearchResultClick('${escapeHtml(stock.code)}')">
                <span class="result-code">${escapeHtml(stock.code)}</span>
                <span class="result-name">${escapeHtml(stock.name)}</span>
                <span class="result-market">${escapeHtml(marketLabel)}</span>
            </div>
        `;
    }).join('') + moreHint;

    container.style.display = 'block';
}

/* ---- 点击搜索结果 ---- */

async function onSearchResultClick(code) {
    // 关闭下拉
    const resultsEl = document.getElementById('search-results');
    if (resultsEl) resultsEl.style.display = 'none';

    // 更新输入框的值（显示名称）
    const stock = stockList.find(s => s.code === code);
    const input = document.getElementById('stock-search-input');
    if (input && stock) {
        input.value = `${code} ${stock.name}`;
    }

    // 加载个股数据（优先用 file 字段处理重名冲突）
    const fileName = (stock && stock.file) || `${code}.json`;
    await selectStockByCode(code, fileName);
}

/* ---- 个股详情渲染（图表 + 卡片） ---- */

function renderStockDetail(data) {
    const detailEl = document.getElementById('stock-detail');
    if (!detailEl || !data) {
        if (detailEl) detailEl.innerHTML = '<div class="loading">无股票数据</div>';
        return;
    }

    detailEl.classList.remove('empty-state');

    const legendHtml = typeof buildLegendHTML === 'function' ? buildLegendHTML() : '';
    const isWeekly = currentPeriod === 'weekly';
    detailEl.innerHTML = `
        ${legendHtml}
        <div class="period-bar">
            <button class="period-btn ${!isWeekly ? 'active' : ''}" onclick="switchPeriod('daily')">日线</button>
            <button class="period-btn ${isWeekly ? 'active' : ''}" onclick="switchPeriod('weekly')">周线</button>
        </div>
        <div class="chart-wrapper">
            <span class="btn-landscape" onclick="toggleLandscape()">⤢</span>
            <div id="stock-chart" style="width:100%;height:500px;"></div>
        </div>
        <div id="stock-analysis-summary" class="analysis-grid"></div>
    `;

    renderStockChart(data);
    if (!isWeekly) renderStockAnalysisSummary(data);
}

/* ---- K 线图 ---- */

function renderStockChart(data) {
    const chartData = data.chart_data || {};
    const w = chartData.weekly;
    const useWeekly = currentPeriod === 'weekly' && w && w.kline && w.kline.dates && w.kline.dates.length > 0;
    const klineData = useWeekly ? w.kline : (chartData.kline || data.kline_data || {});
    const annotations = useWeekly ? {} : (chartData.annotations || data.chart_annotations || {});
    const maLines = useWeekly ? (w.ma_lines || {}) : (chartData.ma_lines || {});

    renderKlineChart('stock-chart', klineData, annotations, maLines);
}

/* ---- 周期切换 ---- */

function switchPeriod(period) {
    currentPeriod = period;
    if (currentStockData) renderStockDetail(currentStockData);
}

/* ---- 分析卡片（SMC） ---- */

function renderStockAnalysisSummary(data) {
    const container = document.getElementById('stock-analysis-summary');
    if (!container) return;

    const analysis = data.analysis || {};
    const cards = [];

    // SMC card
    const smc = analysis.smc || {};
    const smcEvent = smc.last_event;
    const smcEventText = smcEvent ? `${smcEvent.type} ${smcEvent.direction === 'bullish' ? '↑' : '↓'}` : '无';
    cards.push(`
        <div class="analysis-card">
            <div class="analysis-title">SMC结构</div>
            <div class="analysis-key ${dirColorClass(smc.current_structure)}">${escapeHtml(smc.current_structure || '--')}</div>
            <div class="analysis-body">最后事件: ${escapeHtml(smcEventText)}<br>强度: ${escapeHtml(smc.trend_strength || '--')}</div>
        </div>
    `);

    container.innerHTML = cards.join('');
}

/* ---- 手机侧栏切换 ---- */
function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    var ov = document.querySelector('.sidebar-overlay');
    if (sb && ov) {
        sb.classList.toggle('open');
        ov.classList.toggle('show');
    }
}
