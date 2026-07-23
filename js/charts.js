/* ===== klab - ECharts Chart Rendering ===== */

// A-share color scheme: red up, green down
const COLOR_UP = '#ef232a';
const COLOR_DOWN = '#14b143';

// Dark theme colors
const THEME = {
    bg: 'transparent',
    axisLine: '#30363d',
    splitLine: '#1c2128',
    splitArea: ['transparent', 'transparent'],
    axisLabel: '#8b949e',
    tooltipBg: 'rgba(22,27,34,0.96)',
    tooltipBorder: '#30363d',
    tooltipText: '#e6edf3',
    legendText: '#8b949e',
    dataZoomBorder: '#30363d',
    dataZoomFiller: 'rgba(139,148,158,0.15)',
    dataZoomHandle: '#484f58',
    markPointBorder: '#0d1117',
};

// dataZoom initial visible range (single source of truth)
const DATAZOOM_START = 50;
const DATAZOOM_END = 100;

// MA line colors (distinct, no green to avoid confusion with down-candles)
const MA_COLORS = {
    ma5: '#00d4aa',   // 青色
    ma10: '#b37feb',  // 紫
    ma20: '#4a90d9',  // 蓝
    ma60: '#e8c547',  // 浅金
    ma100: '#ff8c00', // 橙色
};

// MA toggle state (persisted in localStorage)
const MA_LIST = [
    { key: 'ma5',   label: 'MA5',   color: MA_COLORS.ma5 },
    { key: 'ma10',  label: 'MA10',  color: MA_COLORS.ma10 },
    { key: 'ma20',  label: 'MA20',  color: MA_COLORS.ma20 },
    { key: 'ma60',  label: 'MA60',  color: MA_COLORS.ma60 },
    { key: 'ma100', label: 'MA100', color: MA_COLORS.ma100 },
];

function getMaVisibility() {
    try {
        const saved = localStorage.getItem('maVisibility');
        if (saved) return JSON.parse(saved);
    } catch(e) {}
    // Default: all visible
    const vis = {};
    MA_LIST.forEach(m => vis[m.label] = true);
    return vis;
}

function saveMaVisibility(vis) {
    try { localStorage.setItem('maVisibility', JSON.stringify(vis)); } catch(e) {}
}

function buildMaToggleHTML() {
    const vis = getMaVisibility();
    let html = '<div class="ma-toggle-bar">';
    MA_LIST.forEach(m => {
        const active = vis[m.label] !== false;
        html += `<span class="ma-toggle-item ${active ? 'active' : 'inactive'}" data-ma="${m.label}">`
             +  `<span class="ma-toggle-dot" style="background:${m.color}"></span>${m.label}</span>`;
    });
    html += '</div>';
    return html;
}

// Track all chart instances for resize
let chartInstances = [];

// ---- Legend HTML (shared by index chart + stock detail) ----

function buildLegendHTML() {
    return `<details class="chart-legend">
        <summary>图表标注图例（点击展开）</summary>
        <div class="legend-grid">
            <div class="legend-section">SMC智能货币概念</div>
            <div class="legend-item"><span class="legend-tri sw-tri-bull"></span>摆动点(看多) — HH更高高/HL更高低，上升趋势</div>
            <div class="legend-item"><span class="legend-tri sw-tri-bear"></span>摆动点(看空) — LH更低高/LL更低低，下降趋势</div>
            <div class="legend-item"><span class="legend-dot sw-dot-bull"></span>看涨结构事件 — BOS突破/MSS反转/CHoCH转性</div>
            <div class="legend-item"><span class="legend-dot sw-dot-bear"></span>看跌结构事件 — BOS突破/MSS反转/CHoCH转性</div>
            <div class="legend-item"><span class="legend-swatch sw-ob-bull"></span>看涨订单块(OB) — 阴线后上涨起点，潜在支撑</div>
            <div class="legend-item"><span class="legend-swatch sw-ob-bear"></span>看跌订单块(OB) — 阳线后下跌起点，潜在阻力</div>
            <div class="legend-item"><span class="legend-swatch sw-fvg-bull"></span>看涨FVG(公允价值缺口) — 向上跳空缺口</div>
            <div class="legend-item"><span class="legend-swatch sw-fvg-bear"></span>看跌FVG(公允价值缺口) — 向下跳空缺口</div>
            <div class="legend-item"><span class="legend-line sw-bsl"></span>BSL买单流动性 — 上方止损/阻力位</div>
            <div class="legend-item"><span class="legend-line sw-ssl"></span>SSL卖单流动性 — 下方止损/支撑位</div>
            <div class="legend-item"><span class="legend-line sw-bsl-swept"></span>BSL(已扫) — 已被测试/扫掉的上方流动性</div>
            <div class="legend-item"><span class="legend-line sw-ssl-swept"></span>SSL(已扫) — 已被测试/扫掉的下方流动性</div>
            <div class="legend-item"><span class="legend-swatch sw-ote"></span>OTE最优入场 — 61.8%-79%斐波那契回撤区间，金色虚线框</div>
            <div class="legend-item"><span class="legend-swatch sw-br-bull"></span>Breaker看多 — 失效OB翻转，原阻力变支撑（紫色虚线框）</div>
            <div class="legend-item"><span class="legend-swatch sw-br-bear"></span>Breaker看空 — 失效OB翻转，原支撑变阻力（青色虚线框）</div>
        </div>
    </details>`;
}

// ---- Annotation extraction helpers (兼容格式化数组 + 原始字典两种格式) ----

function extractOrderBlocks(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    const bull = (ann.bullish_obs || []).map(o => ({ ...o, direction: 'bullish' }));
    const bear = (ann.bearish_obs || []).map(o => ({ ...o, direction: 'bearish' }));
    return [...bull, ...bear];
}

function extractLiquidity(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    return ann.zones || [];
}

function extractFvgs(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    const bull = (ann.bullish_fvgs || []).map(f => ({ ...f, direction: 'bullish' }));
    const bear = (ann.bearish_fvgs || []).map(f => ({ ...f, direction: 'bearish' }));
    const unfilled = (ann.unfilled_fvgs || []).map(f => ({ ...f, direction: f.direction || 'bullish' }));
    return [...bull, ...bear, ...unfilled];
}

function extractStructureEvents(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    return ann.structure_events || ann.events || [];
}

function extractSwingPoints(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    return ann.swing_points || [];
}

function extractBreakers(ann) {
    if (!ann) return [];
    if (Array.isArray(ann)) return ann;
    return ann.breakers || [];
}

// 去重: 同一日期+方向+价格区间的标注只保留一个
function dedupAnnotations(list) {
    const seen = new Set();
    return list.filter(item => {
        const key = `${item.start_date || item.date}_${item.direction}_${item.upper}_${item.lower}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// 计算OB失效日: 价格穿越OB区域后, OB不再有效
// bullish OB: 收盘价跌破 lower → 失效
// bearish OB: 收盘价突破 upper → 失效
// 返回失效日的index, 未失效则返回 ohlcv.length-1
function findOBEndIdx(ohlcv, startIdx, upper, lower, direction) {
    for (let i = startIdx + 1; i < ohlcv.length; i++) {
        const close = ohlcv[i][1]; // [open, close, low, high]
        if (direction === 'bullish' && close < lower) return i;
        if (direction === 'bearish' && close > upper) return i;
    }
    return ohlcv.length - 1;
}

// 计算FVG填补日: 价格回到缺口区域后, FVG被填补
// bullish FVG: 最低价 <= upper → 填补
// bearish FVG: 最高价 >= lower → 填补
function findFVGEndIdx(ohlcv, startIdx, upper, lower, direction) {
    for (let i = startIdx + 1; i < ohlcv.length; i++) {
        const low = ohlcv[i][2];
        const high = ohlcv[i][3];
        if (direction === 'bullish' && low <= upper) return i;
        if (direction === 'bearish' && high >= lower) return i;
    }
    return ohlcv.length - 1;
}

// ---- Liquidity markLine builder (dataZoom-aware) ----
// Builds BSL/SSL markLines with coordinates clamped to the visible dataZoom range,
// ensuring lines always render regardless of zoom level.
function buildLiquidityMarkLines(liqToShow, dates, visibleStart, visibleEnd) {
    const lines = [];
    liqToShow.forEach(zone => {
        if (zone.price == null || zone.price <= 0) return;
        const isBSL = zone.side === 'BSL';
        const baseRgb = isBSL ? '239,35,42' : '20,177,67';
        const alpha = zone.swept ? 0.35 : 0.7;
        const color = `rgba(${baseRgb},${alpha})`;

        // Original start: swing point date (use date lookup to survive data truncation)
        let startIdx = zone.swing_date ? findDateIndex(dates, zone.swing_date) : 0;
        if (startIdx < 0) startIdx = 0;

        // Original end: last date, or sweep date if swept
        let endIdx = dates.length - 1;
        if (zone.swept && zone.sweep_date) {
            const sweepIdx = findDateIndex(dates, zone.sweep_date);
            if (sweepIdx !== -1) endIdx = sweepIdx;
        }

        // Clamp to visible range so ECharts always renders the line
        const clampedStart = Math.max(startIdx, visibleStart);
        const clampedEnd = Math.min(endIdx, visibleEnd);
        if (clampedStart > clampedEnd) return;

        const labelText = (zone.label || zone.side) + ' ' + zone.price.toFixed(2);

        lines.push([
            { coord: [clampedStart, zone.price] },
            {
                coord: [clampedEnd, zone.price],
                lineStyle: { type: zone.swept ? 'dotted' : 'dashed', color: color, width: zone.swept ? 1 : 1.5 },
                label: {
                    formatter: labelText,
                    position: 'end',
                    fontSize: 10,
                    color: color,
                    backgroundColor: 'rgba(13,17,23,0.7)',
                    padding: [2, 4],
                    borderRadius: 3
                }
            }
        ]);
    });
    return lines;
}

// ---- Chart rendering ----

function renderKlineChart(containerId, klineData, annotations = {}, maLines = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const existing = echarts.getInstanceByDom(container);
    if (existing) existing.dispose();

    if (!klineData || !klineData.dates || klineData.dates.length === 0) {
        container.innerHTML = '<div class="loading">无K线数据</div>';
        return null;
    }

    // ---- MA toggle bar (insert before chart container) ----
    const parentNode = container.parentNode;
    let toggleBar = parentNode.querySelector('.ma-toggle-bar');
    if (!toggleBar) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = buildMaToggleHTML();
        toggleBar = wrapper.firstChild;
        parentNode.insertBefore(toggleBar, container);
    } else {
        toggleBar.innerHTML = buildMaToggleHTML().replace(/<div class="ma-toggle-bar">/, '').replace(/<\/div>$/, '');
    }

    const dates = klineData.dates;
    // ECharts candlestick format: [open, close, low, high]
    const ohlcv = klineData.ohlcv || [];
    const volumes = klineData.volumes || [];

    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    // ---- MA lines: 后端预计算 ----
    const ma5  = maLines.ma5;
    const ma10 = maLines.ma10;
    const ma20 = maLines.ma20;
    const ma60 = maLines.ma60;
    const ma100 = maLines.ma100;

    // ---- 标注: markArea (色块) ----
    const markAreas = [];

    // 1) Order Blocks — bullish/bearish各取最近4个, 去重, 太窄加最小高度
    const allObs = extractOrderBlocks(annotations.order_blocks);
    const obsBull = allObs.filter(o => o.direction === 'bullish');
    const obsBear = allObs.filter(o => o.direction === 'bearish');
    const obsToShow = [...dedupAnnotations(obsBull).slice(-4), ...dedupAnnotations(obsBear).slice(-4)];
    obsToShow.forEach(ob => {
        const dateStr = ob.start_date || ob.date;
        const idx = findDateIndex(dates, dateStr);
        if (idx === -1) return;
        let upper = ob.upper;
        let lower = ob.lower;
        if (upper == null || lower == null || upper <= 0 || lower <= 0) return;
        const isBull = ob.direction === 'bullish';
        // 只延伸到失效日, 未失效才延伸到最后
        const endIdx = findOBEndIdx(ohlcv, idx, upper, lower, ob.direction);
        const color = isBull ? 'rgba(239,35,42,0.28)' : 'rgba(20,177,67,0.28)';
        markAreas.push([
            { xAxis: idx, yAxis: upper, itemStyle: { color: color, borderColor: isBull ? 'rgba(239,35,42,0.7)' : 'rgba(20,177,67,0.7)', borderWidth: 1.5 } },
            { xAxis: endIdx, yAxis: lower }
        ]);
    });

    // 2) FVGs — bullish/bearish各取最近4个, 去重
    const allFvgs = extractFvgs(annotations.fvgs);
    const fvgBull = allFvgs.filter(f => f.direction === 'bullish');
    const fvgBear = allFvgs.filter(f => f.direction === 'bearish');
    const fvgsToShow = [...dedupAnnotations(fvgBull).slice(-4), ...dedupAnnotations(fvgBear).slice(-4)];
    fvgsToShow.forEach(fvg => {
        const dateStr = fvg.start_date || fvg.date;
        const idx = findDateIndex(dates, dateStr);
        if (idx === -1) return;
        const upper = fvg.upper;
        const lower = fvg.lower;
        if (upper == null || lower == null || upper <= 0 || lower <= 0) return;
        const isBull = fvg.direction === 'bullish';
        // 只延伸到填补日, 未填补才延伸到最后
        const endIdx = findFVGEndIdx(ohlcv, idx, upper, lower, fvg.direction);
        const color = isBull ? 'rgba(239,35,42,0.22)' : 'rgba(20,177,67,0.22)';
        markAreas.push([
            { xAxis: idx, yAxis: upper, itemStyle: { color: color, borderColor: isBull ? 'rgba(239,35,42,0.6)' : 'rgba(20,177,67,0.6)', borderWidth: 1, borderType: 'dashed' } },
            { xAxis: endIdx, yAxis: lower }
        ]);
    });

    // 每个 OB 内部叠加 OTE 甜点区 (61.8%-79% 斐波那契)
    obsToShow.forEach(ob => {
        if (ob.ote_lower != null && ob.ote_upper != null && ob.ote_lower > 0 && ob.ote_upper > ob.ote_lower) {
            const idx = findDateIndex(dates, ob.start_date || ob.date);
            if (idx === -1) return;
            const isBull = ob.direction === 'bullish';
            const endIdx = findOBEndIdx(ohlcv, idx, ob.upper, ob.lower, ob.direction);
            markAreas.push([
                { xAxis: idx, yAxis: ob.ote_upper, itemStyle: { color: 'rgba(255,215,0,0.18)', borderColor: 'rgba(255,215,0,0.6)', borderWidth: 1, borderType: 'dashed' } },
                { xAxis: endIdx, yAxis: ob.ote_lower }
            ]);
        }
    });

    // Breaker Block (失效OB翻转) — 紫色bull / 青色bear
    const brList = extractBreakers(annotations.breakers);
    brList.forEach(br => {
        if (br.upper == null || br.lower == null || br.upper <= br.lower) return;
        const startIdx = findDateIndex(dates, br.start_date || br.date);
        if (startIdx === -1) return;
        const endIdx = findDateIndex(dates, br.end_date);
        if (endIdx === -1) return;
        const isBull = br.direction === 'bullish';
        markAreas.push([
            { xAxis: startIdx, yAxis: br.upper, itemStyle: { color: isBull ? 'rgba(155,89,182,0.22)' : 'rgba(0,188,212,0.22)', borderColor: isBull ? 'rgba(155,89,182,0.6)' : 'rgba(0,188,212,0.6)', borderWidth: 1.5, borderType: 'dashed' } },
            { xAxis: endIdx, yAxis: br.lower }
        ]);
    });

    // ---- 标注: markLine (水平虚线) — BSL/SSL 流动性线 ----
    // 4) Liquidity zones (BSL=红, SSL=绿) — 未扫的优先, 已扫的BSL/SSL各取最近2条
    const liqZones = extractLiquidity(annotations.liquidity);
    const unsweptBSL = liqZones.filter(z => !z.swept && z.side === 'BSL').slice(-3);
    const unsweptSSL = liqZones.filter(z => !z.swept && z.side === 'SSL').slice(-3);
    const sweptBSL = liqZones.filter(z => z.swept && z.side === 'BSL').slice(-2);
    const sweptSSL = liqZones.filter(z => z.swept && z.side === 'SSL').slice(-2);
    const liqToShow = [...unsweptBSL, ...unsweptSSL, ...sweptBSL, ...sweptSSL];

    // 初始可见范围 (单一来源 DATAZOOM_START，与 dataZoom 配置同步)
    const totalLen = dates.length;
    const initVisStart = Math.floor(totalLen * DATAZOOM_START / 100);
    const initVisEnd = totalLen - 1;
    const markLines = buildLiquidityMarkLines(liqToShow, dates, initVisStart, initVisEnd);

    // ---- 标注: markPoint (结构事件 + 摆动点 + 买卖点) ----
    const markPoints = [];

    // 4b) Liquidity sweep markers — 已扫的BSL/SSL标注扫荡点
    //    wick(影线扫荡): 空心圆 "扫" | break(收盘突破): 实心菱形 "破"
    liqToShow.filter(z => z.swept && z.sweep_date).forEach(zone => {
        const sweepIdx = findDateIndex(dates, zone.sweep_date);
        if (sweepIdx === -1) return;
        const isBSL = zone.side === 'BSL';
        const sweepColor = isBSL ? COLOR_UP : COLOR_DOWN;
        const isWick = zone.sweep_type === 'wick';
        markPoints.push({
            coord: [sweepIdx, zone.price],
            symbol: isWick ? 'circle' : 'diamond',
            symbolSize: 7,
            itemStyle: {
                color: isWick ? 'transparent' : sweepColor,
                borderColor: sweepColor,
                borderWidth: 1.5
            },
            label: {
                show: true,
                formatter: isWick ? '扫' : '破',
                fontSize: 8,
                color: sweepColor,
                position: isBSL ? 'top' : 'bottom',
                offset: [0, isBSL ? -10 : 10]
            }
        });
    });

    // 5) Structure events (BOS/MSS/CHoCH)
    const events = extractStructureEvents(annotations.structure_events);
    events.slice(-8).forEach(ev => {
        const idx = findDateIndex(dates, ev.date);
        if (idx === -1) return;
        const price = ev.price || ev.breakthrough_price;
        if (price == null || price <= 0) return;
        const isBull = ev.direction === 'bullish';
        markPoints.push({
            coord: [idx, price],
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: {
                color: isBull ? COLOR_UP : COLOR_DOWN,
                borderColor: THEME.markPointBorder,
                borderWidth: 1
            },
            label: {
                show: true,
                formatter: ev.type,
                fontSize: isTouch ? 8 : 10,
                color: isBull ? COLOR_UP : COLOR_DOWN,
                position: 'top',
                offset: [0, -15],
                backgroundColor: 'rgba(13,17,23,0.8)',
                padding: [2, 4],
                borderRadius: 3
            }
        });
    });

    // 6) SMC Swing Points (摆动点 HH/HL/LH/LL) — 最近15个
    const swingPts = extractSwingPoints(annotations.swing_points);
    swingPts.slice(-15).forEach(sp => {
        const idx = findDateIndex(dates, sp.date);
        if (idx === -1) return;
        if (sp.price == null || sp.price <= 0) return;
        const isBull = sp.direction === 'bullish';
        const isHigh = sp.type === 'HH' || sp.type === 'LH';
        // 高点: 倒三角在上方; 低点: 正三角在下方
        markPoints.push({
            coord: [idx, sp.price],
            symbol: 'triangle',
            symbolSize: 8,
            symbolRotate: isHigh ? 180 : 0,
            itemStyle: {
                color: isBull ? 'rgba(239,35,42,0.85)' : 'rgba(20,177,67,0.85)',
                borderColor: THEME.markPointBorder,
                borderWidth: 0.5
            },
            label: {
                show: true,
                formatter: sp.type,
                fontSize: isTouch ? 7 : 9,
                color: isBull ? COLOR_UP : COLOR_DOWN,
                position: isHigh ? 'top' : 'bottom',
                offset: [0, isHigh ? -8 : 8]
            }
        });
    });

    // ---- ECharts option (Dark Theme) ----
    const isLandscape = typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
    const sliderH = isTouch ? (isLandscape ? 30 : 27) : 24;
    const sliderB = isTouch ? (isLandscape ? '12%' : '5%') : '3%';
    const option = {
        animation: false,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', lineStyle: { color: THEME.axisLine } },
            backgroundColor: THEME.tooltipBg,
            borderColor: THEME.tooltipBorder,
            textStyle: { color: THEME.tooltipText, fontSize: 12 },
            formatter: function(params) {
                if (!params || params.length === 0) return '';
                const date = params[0].axisValue;
                let html = `<div style="font-weight:bold;margin-bottom:4px">${date}</div>`;
                params.forEach(p => {
                    if (p.seriesName === 'K线') {
                        // p.data in ECharts trigger:axis may not be the raw [o,c,l,h] array;
                        // use dataIndex to look up from ohlcv directly (most reliable)
                        const idx = p.dataIndex;
                        const bar = (idx != null && ohlcv[idx]) ? ohlcv[idx] : null;
                        let o, c, l, h;
                        if (bar) {
                            [o, c, l, h] = bar;
                        } else if (Array.isArray(p.data)) {
                            [o, c, l, h] = p.data;
                        } else if (p.data && p.data.value && Array.isArray(p.data.value)) {
                            [o, c, l, h] = p.data.value;
                        }
                        if (o != null && c != null) {
                            const change = ((c - o) / o * 100).toFixed(2);
                            const chgColor = c >= o ? COLOR_UP : COLOR_DOWN;
                            html += `<div style="color:${chgColor}">开:${o} 收:${c} (${change}%)</div>`;
                            html += `<div style="color:${THEME.axisLabel}">低:${l} 高:${h}</div>`;
                        }
                    } else if (p.seriesName === '成交量') {
                        const idx = p.dataIndex;
                        let v;
                        if (idx != null && volumes[idx] != null) {
                            v = volumes[idx];
                        } else if (p.data && p.data.value != null) {
                            v = p.data.value;
                        } else if (p.data != null) {
                            v = p.data;
                        }
                        if (v != null) {
                            html += `<div style="color:${THEME.axisLabel}">量:${fmtBig(v)}</div>`;
                        }
                    } else if (p.value != null && p.seriesName && p.seriesName.startsWith('MA')) {
                        html += `<div style="color:${p.color}">${p.seriesName}:${fmtNum(p.value)}</div>`;
                    }
                });
                return html;
            }
        },
        legend: {
            show: false,
            top: 0,
            left: 'center',
            data: ['K线', 'MA5', 'MA10', 'MA20', 'MA60', 'MA100'],
            textStyle: { fontSize: 11, color: THEME.legendText },
            itemWidth: 14,
            itemHeight: 10,
            selected: getMaVisibility()
        },
        axisPointer: { link: { xAxisIndex: 'all' } },
        grid: [
            { left: '6%', right: '8%', top: '8%', height: '56%' },
            { left: '6%', right: '8%', top: '70%', height: '18%' }
        ],
        xAxis: [
            {
                type: 'category', data: dates, scale: true, boundaryGap: false,
                axisLine: { lineStyle: { color: THEME.axisLine } },
                axisLabel: { fontSize: 10, color: THEME.axisLabel },
                splitLine: { show: false }
            },
            {
                type: 'category', gridIndex: 1, data: dates, scale: true, boundaryGap: false,
                axisLine: { lineStyle: { color: THEME.axisLine } },
                axisLabel: { show: false },
                splitLine: { show: false }
            }
        ],
        yAxis: [
            {
                scale: true,
                splitArea: { show: false },
                axisLine: { lineStyle: { color: THEME.axisLine } },
                axisLabel: { fontSize: 10, color: THEME.axisLabel },
                splitLine: { lineStyle: { color: THEME.splitLine } }
            },
            {
                gridIndex: 1, scale: true, splitNumber: 2,
                axisLabel: { show: false },
                axisLine: { show: false },
                splitLine: { show: false }
            }
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1], start: DATAZOOM_START, end: DATAZOOM_END, minSpan: 5 },
            {
                show: true, type: 'slider', xAxisIndex: [0, 1],
                bottom: sliderB, height: sliderH, start: DATAZOOM_START, end: DATAZOOM_END,
                borderColor: THEME.dataZoomBorder,
                fillerColor: THEME.dataZoomFiller,
                handleStyle: { color: THEME.dataZoomHandle },
                textStyle: { color: THEME.axisLabel }
            }
        ],
        series: [
            {
                name: 'K线',
                type: 'candlestick',
                data: ohlcv,
                xAxisIndex: 0, yAxisIndex: 0,
                itemStyle: {
                    color: COLOR_UP,       // 阳线实体 (close > open) → 红
                    color0: COLOR_DOWN,    // 阴线实体 (close < open) → 绿
                    borderColor: COLOR_UP, // 阳线边框 → 红
                    borderColor0: COLOR_DOWN
                },
                markArea: markAreas.length > 0 ? { silent: true, data: markAreas } : undefined,
                markLine: markLines.length > 0 ? { silent: true, symbol: 'none', data: markLines } : undefined,
                markPoint: markPoints.length > 0 ? { data: markPoints } : undefined
            },
            { name: 'MA5',   type: 'line', data: ma5,   xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: MA_COLORS.ma5 } },
            { name: 'MA10',  type: 'line', data: ma10,  xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: MA_COLORS.ma10 } },
            { name: 'MA20',  type: 'line', data: ma20,  xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: MA_COLORS.ma20 } },
            { name: 'MA60',  type: 'line', data: ma60,  xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: MA_COLORS.ma60 } },
            { name: 'MA100', type: 'line', data: ma100, xAxisIndex: 0, yAxisIndex: 0, smooth: true, showSymbol: false, lineStyle: { width: 1, color: MA_COLORS.ma100 } },
            {
                name: '成交量',
                type: 'bar',
                data: volumes.map((v, i) => {
                    const bar = ohlcv[i];
                    const isUp = bar && bar[1] >= bar[0]; // close >= open
                    return {
                        value: v,
                        itemStyle: { color: isUp ? 'rgba(239,35,42,0.6)' : 'rgba(20,177,67,0.6)' }
                    };
                }),
                xAxisIndex: 1, yAxisIndex: 1
            }
        ]
    };

    const chart = echarts.init(container);
    chart.setOption(option);

    // ---- MA toggle: click handler + ECharts legend sync ----
    if (toggleBar) {
        toggleBar.querySelectorAll('.ma-toggle-item').forEach(function(item) {
            item.addEventListener('click', function() {
                const maName = this.getAttribute('data-ma');
                chart.dispatchAction({ type: 'legendToggleSelect', name: maName });
            });
        });
    }
    // Sync toggle bar UI when ECharts legend is clicked directly
    chart.on('legendselectchanged', function(params) {
        const vis = params.selected || {};
        saveMaVisibility(vis);
        if (toggleBar) {
            toggleBar.querySelectorAll('.ma-toggle-item').forEach(function(item) {
                const maName = item.getAttribute('data-ma');
                const active = vis[maName] !== false;
                item.classList.toggle('active', active);
                item.classList.toggle('inactive', !active);
            });
        }
    });

    // Rebuild liquidity markLines on dataZoom to keep them visible at any zoom level.
    // Coordinates are clamped to the visible range so ECharts always renders the lines.
    if (liqToShow.length > 0) {
        let zoomTimer = null;
        chart.on('datazoom', function() {
            if (zoomTimer) clearTimeout(zoomTimer);
            zoomTimer = setTimeout(function() {
                const opt = chart.getOption();
                const dz = opt.dataZoom[0];
                const total = dates.length;
                const visStart = Math.floor(total * dz.start / 100);
                const visEnd = Math.min(Math.floor(total * dz.end / 100) - 1, total - 1);
                const newLines = buildLiquidityMarkLines(liqToShow, dates, visStart, visEnd);
                chart.setOption({
                    series: [{
                        markLine: { silent: true, symbol: 'none', data: newLines }
                    }]
                });
            }, 80);
        });
    }

    chartInstances = chartInstances.filter(c => c && !c.isDisposed());
    chartInstances.push(chart);
    return chart;
}

// Render index chart (market overview)
function renderIndexChart(containerId, chartData) {
    if (!chartData) {
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '<div class="loading">无指数数据</div>';
        return null;
    }

    const klineData = chartData.kline_data || chartData.index_kline || chartData.kline || chartData;
    const annotations = chartData.chart_annotations || chartData.annotations || {};
    const maLines = chartData.ma_lines || {};

    return renderKlineChart(containerId, klineData, annotations, maLines);
}

// ---- Helpers ----

function findDateIndex(dates, dateStr) {
    if (!dates || !dateStr) return -1;
    let idx = dates.indexOf(dateStr);
    if (idx !== -1) return idx;
    const target = String(dateStr).replace(/-/g, '');
    for (let i = 0; i < dates.length; i++) {
        if (String(dates[i]).replace(/-/g, '') === target) return i;
    }
    return -1;
}

function resizeAllCharts() {
    chartInstances.forEach(c => { if (c && !c.isDisposed()) c.resize(); });
}
window.addEventListener('resize', resizeAllCharts);

// Toggle landscape mode for mobile chart viewing
function toggleLandscape() {
    const wrapper = document.querySelector('.chart-wrapper');
    if (!wrapper) return;
    wrapper.classList.toggle('landscape');
    const isLs = wrapper.classList.contains('landscape');
    const btn = wrapper.querySelector('.btn-landscape');
    if (btn) btn.textContent = isLs ? '\u2715' : '\u2936';
    // 全屏隐藏工具栏
    if (isLs) {
        document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } else if (document.fullscreenElement) {
        document.exitFullscreen();
    }
    // grid 重设 + slider 重设
    setTimeout(() => {
        const chart = echarts.getInstanceByDom(document.getElementById('stock-chart'));
        if (chart) {
            const isT = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const opt = chart.getOption();
            opt.grid[0].height = isLs ? '48%' : '56%';
            opt.grid[1].top = isLs ? '60%' : '70%';
            opt.grid[1].height = isLs ? '12%' : '18%';
            if (opt.dataZoom && opt.dataZoom[1]) {
                opt.dataZoom[1].bottom = isLs ? (isT ? '20%' : '3%') : (isT ? '5%' : '3%');
                opt.dataZoom[1].height = isLs ? (isT ? '6%' : 24) : (isT ? 27 : 24);
            }
            chart.setOption(opt);
            chart.resize();
        }
    }, 350);
}
