// ==UserScript==
// @name         Ink Leitor (leitura automática)
// @namespace    ink-leitor
// @version      3.4.0
// @description  Leitura automática, ordem das bolhas, ordenador de mangá/HQ e modo menina (skins Gatinha/Lobo) para ink.app.br
// @match        https://www.ink.app.br/*
// @match        https://ink.app.br/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// @downloadURL  https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// ==/UserScript==
/* =====================================================================
   REGRA OBRIGATÓRIA PARA QUALQUER IA / PESSOA QUE EDITAR ESTE ARQUIVO:
   - O arquivo DEVE se chamar SEMPRE "content.js".
   - @updateURL e @downloadURL DEVEM apontar para .../ink-atualizacoes/main/content.js
   - Ao entregar nova versão, aumente @version e INK_VERSION e entregue como content.js.
   ===================================================================== */
(() => {
    if (window.__inkLeitorV3) return;
    window.__inkLeitorV3 = true;
    const INK_VERSION = 'v3.4.0';
    try { console.info('[Ink] leitor ' + INK_VERSION + ' carregado'); } catch (e) { }

    /* =====================================================================
       PATCH ANDROID — remove popup/tela preta sem quebrar layout do site
       ===================================================================== */
    (function androidFixes() {
        const KEY = 'serei sempre legal';
        const LOCK_TOKENS = new Set(['modal-open', 'no-scroll', 'locked', 'overflow-hidden', 'is-locked', 'scroll-lock', 'blur']);
        const MINE = '#ink-auto-ui,#ink-eye,#ink-ord-bar,#ink-ord-st,#ink-dbg';
        let popupAt = 0, timer = 0, lastRun = 0;

        const isMine = el => !!(el && el.closest && el.closest(MINE));

        function findPopupText() {
            const root = document.body;
            if (!root) return null;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: n => {
                    const p = n.parentElement;
                    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = walker.nextNode())) {
                if (n.nodeValue && n.nodeValue.toLowerCase().includes(KEY) && !isMine(n.parentElement)) return n.parentElement;
            }
            return null;
        }

        function popupContainer(hit) {
            const ui = document.getElementById('ink-auto-ui');
            let best = null, el = hit;
            for (let i = 0; el && el !== document.body && el !== document.documentElement && i < 12; i++, el = el.parentElement) {
                if (ui && el.contains(ui)) break;
                if (el.querySelector && el.querySelector('canvas,video,.comic-page,.bz-order')) break;
                if (el.querySelectorAll && el.querySelectorAll('img').length > 3) break;
                let pos = '';
                try { pos = getComputedStyle(el).position; } catch (e) { }
                if (el.tagName === 'DIALOG' || el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true' || pos === 'fixed') best = el;
            }
            if (best) return best;
            for (el = hit; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
                if (el.tagName === 'DIV' || el.tagName === 'SECTION') return el;
            }
            return null;
        }

        function removePopup() {
            const hit = findPopupText();
            if (!hit) return false;
            const box = popupContainer(hit);
            if (!box) return false;
            box.remove();
            return true;
        }

        const isDark = c => {
            const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
            if (!m) return false;
            const a = m[4] == null ? 1 : parseFloat(m[4]);
            return a >= 0.3 && (+m[1] + +m[2] + +m[3]) < 120;
        };

        function killBackdrops() {
            document.querySelectorAll('body > *, body > * > *').forEach(el => {
                if (isMine(el) || el.childElementCount > 0 || (el.textContent || '').trim()) return;
                let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
                if (cs.position !== 'fixed' || !isDark(cs.backgroundColor)) return;
                const r = el.getBoundingClientRect();
                if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) el.remove();
            });
        }

        function unlock() {
            const html = document.documentElement, body = document.body;
            if (!html || !body) return;
            [html, body].forEach(el => {
                const s = el.style;
                if (/hidden|clip/.test(s.overflow + ' ' + s.overflowY)) { s.removeProperty('overflow'); s.removeProperty('overflow-y'); }
                if (s.pointerEvents === 'none') s.removeProperty('pointer-events');
                if (s.touchAction === 'none') s.removeProperty('touch-action');
                if (s.filter && /blur/.test(s.filter)) s.removeProperty('filter');
                if (typeof el.className === 'string' && el.className) {
                    const keep = el.className.split(/\s+/).filter(t => t && !LOCK_TOKENS.has(t.toLowerCase()));
                    const nc = keep.join(' ');
                    if (nc !== el.className.trim()) el.className = nc;
                }
            });
            if (body.style.position === 'fixed') {
                const top = parseInt(body.style.top || '0', 10) || 0;
                ['position', 'top', 'width', 'left', 'right'].forEach(p => body.style.removeProperty(p));
                try { scrollTo(0, -top); } catch (e) { }
            }
        }

        function tick() {
            if (removePopup()) popupAt = Date.now();
            if (Date.now() - popupAt < 6000) { killBackdrops(); unlock(); }
        }

        function schedule() {
            if (timer) return;
            timer = setTimeout(() => { timer = 0; lastRun = Date.now(); try { tick(); } catch (e) { } },
                Math.max(50, 600 - (Date.now() - lastRun)));
        }

        const hasKey = n => {
            try {
                const t = n.nodeType === 1 ? n.textContent : (n.nodeType === 3 ? n.nodeValue : '');
                return !!t && t.length < 5000 && t.toLowerCase().includes(KEY);
            } catch (e) { return false; }
        };

        const start = () => {
            tick();
            new MutationObserver(muts => {
                if (Date.now() - popupAt < 6000) { schedule(); return; }
                for (const m of muts) for (const n of m.addedNodes) if (hasKey(n)) { schedule(); return; }
            }).observe(document.documentElement, { childList: true, subtree: true });
            setInterval(schedule, 3000);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
    })();

    /* =====================================================================
       COMUM
       ===================================================================== */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const MOBILE = (() => { try { return matchMedia('(pointer:coarse)').matches || innerWidth < 700; } catch (e) { return innerWidth < 700; } })();

    /* =====================================================================
       CONFIG
       ===================================================================== */
    const LS = 'ink_autoread_cfg_v3';
    let cfg = {
        speed: 1.5, method: '', methodM: '', manga: false, min: null, eye: false, eyeLvl: 0.25, pos: null,
        auto: true, voice: false, vrate: 1, vname: '', dbg: false, perf: null, bin: false, bin1: false,
        smooth: true, metaGoal: 10, girl: true, anx: 0, skin: 'gato', musicUrl: '', musicKey: '', musicVol: 0.6
    };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { }
    cfg.smooth = true;
    cfg.anx = cfg.anx === true ? 1 : (+cfg.anx === 1 || +cfg.anx === 2 ? +cfg.anx : 0);

    const SKINS = [
        { id: 'gato', nome: 'Gatinha', emo: '🐱', mascote: '🐾', msg: 'Skin Gatinha 🐱' },
        { id: 'lobo', nome: 'Lobo', emo: '🐺', mascote: '🐺', msg: 'Skin Lobo 🐺 Auuuu!' }
    ];
    const curSkin = () => SKINS.find(k => k.id === cfg.skin) || SKINS[0];
    const mascot = () => curSkin().mascote;
    const isPerf = () => cfg.perf == null ? MOBILE : !!cfg.perf;
    let saveT = 0;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }, 150); };

    let running = false, runId = 0, lastUser = 0;
    const alive = id => running && id === runId;
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

    /* =====================================================================
       DETECÇÃO DE ESTADO DO LEITOR
       ===================================================================== */
    const RX_CTR = /^\s*(\d+)\s*\/\s*(\d+)\s*[·•|-]\s*(\d+)\s*\/\s*(\d+)\s*$/;
    const RX_PG = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;
    const RX_PCT = /^\s*(\d{1,3})\s*%\s*$/;
    const cache = { ctr: null, pg: null, pct: null, t: 0 };

    const badEl = new WeakSet();
    let ctrFrozen = 0;
    const visible = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 120 && r.width < 320; };
    const sane = {
        ctr: m => +m[1] >= 1 && +m[1] <= +m[2] && +m[3] >= 1 && +m[3] <= +m[4],
        pg: m => +m[2] > 1 && +m[1] >= 1 && +m[1] <= +m[2],
        pct: m => +m[1] >= 0 && +m[1] <= 100
    };

    function scan() {
        const mine = document.getElementById('ink-auto-ui');
        let c = null, g = null, p = null;
        for (const n of document.querySelectorAll('div,span,p,button')) {
            if (n.childElementCount > 3 || (mine && mine.contains(n)) || badEl.has(n) || !visible(n)) continue;
            const t = n.textContent;
            if (!t || t.length > 30) continue;
            let m;
            if ((m = RX_CTR.exec(t)) && sane.ctr(m)) { if (!c || c.contains(n)) c = n; }
            else if ((m = RX_PG.exec(t)) && sane.pg(m)) { if (!g || g.contains(n)) g = n; }
            else if ((m = RX_PCT.exec(t)) && sane.pct(m)) { if (!p || p.contains(n)) p = n; }
        }
        if (c && g && c.contains(g)) g = null;
        cache.ctr = c; cache.pg = g; cache.pct = p;
    }
    const stale = (el, rx) => !el || !el.isConnected || !rx.test(el.textContent || '') || !visible(el);

    function camSig() {
        let list;
        try { list = document.elementsFromPoint(innerWidth / 2, innerHeight * 0.45); } catch (e) { return ''; }
        const out = [];
        const maxN = isPerf() ? 2 : 5;
        for (const e of list) {
            if (e === document.documentElement || e === document.body || e.closest('#ink-auto-ui,#ink-eye')) continue;
            const r = e.getBoundingClientRect();
            if (isPerf()) out.push((r.left | 0) + ',' + (r.top | 0) + ',' + (r.width | 0) + ',' + (r.height | 0));
            else {
                const cs = getComputedStyle(e);
                out.push((r.left | 0) + ',' + (r.top | 0) + ',' + (r.width | 0) + ',' + (r.height | 0) + ',' + cs.transform + ',' + cs.backgroundPosition + ',' + cs.objectPosition);
            }
            if (out.length >= maxN) break;
        }
        return out.join(';') + '|' + (scrollX | 0) + ',' + (scrollY | 0);
    }

    function readState() {
        const now = performance.now();
        const reScanMs = isPerf() ? 2800 : 1500;
        const bad = (cache.ctr && stale(cache.ctr, RX_CTR)) || (cache.pg && stale(cache.pg, RX_PG)) || (cache.pct && stale(cache.pct, RX_PCT));
        const none = !cache.ctr && !cache.pg && !cache.pct;
        if ((bad && now - cache.t > reScanMs) || (none && now - cache.t > reScanMs * 3) || now - cache.t > 8000) {
            scan(); cache.t = now;
        }
        const o = {};
        let m;
        if (cache.ctr && (m = RX_CTR.exec(cache.ctr.textContent)) && sane.ctr(m)) { o.b = +m[1]; o.bt = +m[2]; o.p = +m[3]; o.pt = +m[4]; }
        if (cache.pg && (m = RX_PG.exec(cache.pg.textContent)) && sane.pg(m)) { o.pg = +m[1]; o.pgt = +m[2]; }
        if (cache.pct && (m = RX_PCT.exec(cache.pct.textContent)) && sane.pct(m)) { o.pct = +m[1]; }
        o.cam = camSig();
        o.sig = [o.b, o.bt, o.p, o.pt, o.pg, o.pgt, o.pct, o.cam].join('|');
        return o;
    }
    const atEnd = st => st.p != null && st.p === st.pt && st.b === st.bt;
    const nearEnd = st => atEnd(st) || (st.pg != null && st.pg === st.pgt) || (st.pct != null && st.pct >= 98);
    const label = st => st.b != null ? `balão ${st.b}/${st.bt} · pág ${st.p}/${st.pt}` : (st.pg != null ? `pág ${st.pg}/${st.pgt}` : (st.pct != null ? `${st.pct}%` : 'lendo'));

    /* =====================================================================
       ENTRADA / NAVEGAÇÃO
       ===================================================================== */
    function sendKey(k, code, kc) {
        const t = document.activeElement || document.body;
        const o = { key: k, code, keyCode: kc, which: kc, bubbles: true, cancelable: true };
        t.dispatchEvent(new KeyboardEvent('keydown', o));
        t.dispatchEvent(new KeyboardEvent('keyup', o));
        return true;
    }
    function stageRect() {
        let e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.45);
        while (e && e !== document.body) {
            const r = e.getBoundingClientRect();
            if (r.width > 300 && r.width < innerWidth * 0.9 && r.height > 300) return r;
            e = e.parentElement;
        }
        return { left: innerWidth * .05, width: innerWidth * .9, top: innerHeight * .2, height: innerHeight * .5 };
    }
    function clickAt(x, y) {
        const t = document.elementFromPoint(x, y) || document.body;
        const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0 };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(tp => {
            t.dispatchEvent(tp.startsWith('pointer') ? new PointerEvent(tp, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(tp, o));
        });
        return true;
    }
    function swipe(dir) {
        const r = stageRect(), y = r.top + r.height * 0.5;
        const x0 = r.left + r.width * (dir < 0 ? 0.75 : 0.25);
        const t = document.elementFromPoint(x0, y) || document.body;
        const send = (type, x) => {
            try {
                const tc = new Touch({ identifier: 9, target: t, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y });
                const end = type === 'touchend';
                t.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [tc], targetTouches: end ? [] : [tc], changedTouches: [tc] }));
                return true;
            } catch (e) { return false; }
        };
        if (!send('touchstart', x0)) return false;
        const W = r.width * 0.5;
        for (let i = 1; i <= 5; i++) send('touchmove', x0 + dir * W * i / 5);
        send('touchend', x0 + dir * W);
        return true;
    }
    const METHODS = {
        ArrowRight: () => sendKey('ArrowRight', 'ArrowRight', 39),
        clickDir: () => { const r = stageRect(); return clickAt(r.left + r.width * 0.82, r.top + r.height * 0.5); },
        swipeL: () => swipe(-1),
        ArrowLeft: () => sendKey('ArrowLeft', 'ArrowLeft', 37),
        clickEsq: () => { const r = stageRect(); return clickAt(r.left + r.width * 0.18, r.top + r.height * 0.5); },
        swipeR: () => swipe(1),
        Space: () => sendKey(' ', 'Space', 32),
        Enter: () => sendKey('Enter', 'Enter', 13),
        ArrowDown: () => sendKey('ArrowDown', 'ArrowDown', 40),
        PageDown: () => sendKey('PageDown', 'PageDown', 34),
        wheel: () => {
            const r = stageRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) || document.body;
            t.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
            return true;
        },
        botao: () => {
            const b = [...document.querySelectorAll('button,[role=button]')].find(x =>
                /pr[oó]xim|avan[cç]|next|seguinte/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '')) && !x.closest('#ink-auto-ui'));
            if (b) { b.click(); return true; }
            return false;
        }
    };
    const WEST = ['ArrowRight', 'clickDir', 'swipeL'], MANGA = ['ArrowLeft', 'clickEsq', 'swipeR'];

    const prog = s => s.b != null ? s.p * 100000 + s.b : (s.pg != null ? s.pg : (s.pct != null ? s.pct : null));
    async function waitChange(before, id, maxMs) {
        const t0 = performance.now(), p0 = prog(before);
        while (performance.now() - t0 < maxMs) {
            await sleep(isPerf() ? 70 : 40);
            if (!alive(id)) return false;
            const s = readState(), pn = prog(s);
            if (p0 != null && pn != null) {
                if (pn > p0) { ctrFrozen = 0; return true; }
                if (s.cam !== before.cam && performance.now() - t0 > 450) {
                    if (++ctrFrozen >= 2) {
                        [cache.ctr, cache.pg, cache.pct].forEach(e => { if (e) badEl.add(e); });
                        cache.ctr = cache.pg = cache.pct = null; cache.t = 0; ctrFrozen = 0;
                    }
                    return true;
                }
            } else if (s.sig !== before.sig) return true;
        }
        return false;
    }
    async function advance(before, onlyLearned, id) {
        const names = Object.keys(METHODS).filter(n => cfg.manga ? !WEST.includes(n) : !MANGA.includes(n));
        const learned = cfg.manga ? cfg.methodM : cfg.method;
        const has = learned && names.includes(learned);
        const list = has ? (onlyLearned ? [learned] : [learned, ...names.filter(n => n !== learned)]) : names;
        for (const name of list) {
            if (!alive(id)) return false;
            try { if (!METHODS[name]()) continue; } catch (e) { continue; }
            const ok = await waitChange(before, id, has && name === learned ? 1100 : 650);
            if (ok) {
                const k = cfg.manga ? 'methodM' : 'method';
                if (cfg[k] !== name) { cfg[k] = name; save(); }
                return true;
            }
        }
        return false;
    }
    async function settle(id) {
        const maxIt = isPerf() ? 6 : 12;
        const step = isPerf() ? 70 : 50;
        let prev = camSig(), same = 0;
        for (let i = 0; i < maxIt && alive(id); i++) {
            await sleep(step);
            const c = camSig();
            if (c === prev) { if (++same >= 2) return; } else { same = 0; prev = c; }
        }
    }

    /* =====================================================================
       LOOP PRINCIPAL
       ===================================================================== */
    function dwellFor(st) {
        const sp = cfg.speed || 1;
        let ms = 2000 * Math.exp(gauss() * 0.22);
        if (st.b === 1) ms += rnd(500, 1200);
        if (st.b && st.b === st.bt) ms += rnd(100, 400);
        if (Math.random() < 0.04) ms += rnd(1500, 3500);
        return Math.min(9000, Math.max(300, ms / sp));
    }
    const userIdle = () => Date.now() - lastUser > 1800;
    const paused = () => document.hidden || !!document.querySelector('.bz-order') || !userIdle();

    async function humanWait(ms, st, id) {
        let left = ms, last = performance.now(), ui = 0, chk = 0;
        const uiEvery = isPerf() ? 600 : 250;
        const chkEvery = isPerf() ? 500 : 300;
        while (alive(id) && left > 0) {
            await sleep(Math.min(isPerf() ? 160 : 120, Math.max(20, left)));
            const now = performance.now(), dt = now - last; last = now;
            if (paused()) { setSt('⏸ Em pausa…'); continue; }
            if (cfg.auto && now - chk > chkEvery) { chk = now; if (findEndBtn()) return; }
            left -= dt;
            if (now - ui > uiEvery) { ui = now; setSt(`📖 ${label(st)} · próximo em ${Math.max(0, left / 1000).toFixed(1)}s`); }
        }
    }

    const visited = new Set();
    const pathOf = h => { try { return new URL(h, location.href).pathname; } catch (e) { return ''; } };
    const RX_END_BTN = /^pr[oó]xima\s+em\s+\d+\s*s$|^pr[oó]ximo\s+cap[ií]tulo$/i;
    function findEndBtn() {
        const mine = document.getElementById('ink-auto-ui');
        for (const el of document.querySelectorAll('button,a,[role=button]')) {
            if (mine && mine.contains(el)) continue;
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length < 40 && RX_END_BTN.test(t) && el.getBoundingClientRect().width > 0) return el;
        }
        return null;
    }
    function findNextEl() {
        const eb = findEndBtn();
        if (eb) return eb;
        const mine = document.getElementById('ink-auto-ui');
        const ok = el => el && !(mine && mine.contains(el)) && el.getBoundingClientRect().width > 0;
        const usable = a => { const pth = pathOf(a.getAttribute('href') || ''); return pth !== location.pathname && !visited.has(pth); };
        for (const el of document.querySelectorAll('a,button,[role=button]')) {
            if (!ok(el)) continue;
            const t = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '');
            if (t.length < 90 && /pr[oó]xim[oa]\s+(cap|edi)|next\s+chapter/i.test(t)) return el;
        }
        let head = null;
        for (const n of document.querySelectorAll('div,span,p,h1,h2,h3,h4,section')) {
            if (n.childElementCount > 2) continue;
            if (/^\s*pr[oó]ximas?\s+leituras?\s*$/i.test(n.textContent || '')) { head = n; break; }
        }
        if (!head) return null;
        let box = head.parentElement;
        for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
            const link = [...box.querySelectorAll('a[href*="/ler/"]')].find(a => ok(a) && usable(a));
            if (link) return link;
            const img = [...box.querySelectorAll('img')].find(ok);
            if (img) return img.closest('a,button,[role=button]') || img;
        }
        return null;
    }
    async function nextChapter(id, pre) {
        const from = location.pathname;
        visited.add(from);
        await sleep(700);
        const el = pre || findNextEl();
        if (!el) { console.info('[Ink] não achei o próximo capítulo'); return false; }
        try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { }
        const changed = async ms => {
            const t0 = performance.now();
            while (alive(id) && performance.now() - t0 < ms) { await sleep(150); if (location.pathname !== from) return true; }
            return false;
        };
        el.click();
        if (!(await changed(2000)) && alive(id)) {
            const r = el.getBoundingClientRect();
            clickAt(r.left + r.width / 2, r.top + r.height / 2);
            await changed(6000);
        }
        if (!alive(id) || location.pathname === from || !location.pathname.startsWith('/ler/')) return false;
        if (visited.has(location.pathname)) return false;
        const t1 = performance.now();
        while (alive(id) && performance.now() - t1 < 8000) {
            await sleep(200);
            const st = readState();
            if (st.b != null || st.pg != null || st.pct != null) break;
        }
        await sleep(600);
        return true;
    }

    /* =====================================================================
       ROLAGEM SUAVE / ANSIEDADE
       ===================================================================== */
    let smoothOff = false;
    function scrollerEl() {
        let e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.45);
        while (e && e !== document.body && e !== document.documentElement) {
            let oy = ''; try { oy = getComputedStyle(e).overflowY; } catch (x) { }
            if (/(auto|scroll)/.test(oy) && e.scrollHeight > e.clientHeight + 40) return e;
            e = e.parentElement;
        }
        const se = document.scrollingElement || document.documentElement;
        return se.scrollHeight > innerHeight + 40 ? se : null;
    }
    const isRoot = el => el === (document.scrollingElement || document.documentElement);
    const atBottom = el => el.scrollTop + (isRoot(el) ? innerHeight : el.clientHeight) >= el.scrollHeight - 4;
    function moveSig() {
        let list; try { list = document.elementsFromPoint(innerWidth / 2, innerHeight * 0.45); } catch (e) { return ''; }
        const out = [];
        for (const e of list) {
            if (e === document.documentElement || e === document.body || e.closest('#ink-auto-ui,#ink-eye')) continue;
            const r = e.getBoundingClientRect();
            let tf = ''; try { tf = getComputedStyle(e).transform; } catch (x) { }
            out.push((r.top | 0) + ',' + (r.height | 0) + ',' + tf);
            if (out.length >= 4) break;
        }
        return out.join(';') + '|' + (scrollY | 0);
    }
    function wheelAt(dy) {
        const r = stageRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const t = document.elementFromPoint(x, y) || document.body;
        t.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window }));
    }

    const anxS = { until: 0, mul: 1, phase: 'calm', phaseUntil: 0, t0: 0, lvl: 0 };
    function anxMul(now) {
        const lvl = cfg.anx | 0;
        if (!lvl) { anxS.until = 0; anxS.t0 = 0; anxS.lvl = 0; return 1; }
        if (anxS.lvl !== lvl || !anxS.t0) { anxS.lvl = lvl; anxS.t0 = now; anxS.until = 0; anxS.phase = 'calm'; anxS.phaseUntil = now + rnd(8000, 18000); }
        if (lvl === 1) {
            if (now > anxS.phaseUntil) {
                if (anxS.phase === 'calm') { anxS.phase = 'tense'; anxS.phaseUntil = now + rnd(6000, 14000); }
                else { anxS.phase = 'calm'; anxS.phaseUntil = now + rnd(20000, 45000); }
                anxS.until = 0;
            }
            if (now > anxS.until) {
                if (anxS.phase === 'calm') { anxS.mul = rnd(0.92, 1.08); anxS.until = now + rnd(1500, 3000); }
                else {
                    const r = Math.random();
                    if (r < 0.5) { anxS.mul = rnd(1.4, 1.9); anxS.until = now + rnd(800, 2000); }
                    else if (r < 0.8) { anxS.mul = rnd(0.3, 0.6); anxS.until = now + rnd(400, 900); }
                    else { anxS.mul = -rnd(0.6, 1.0); anxS.until = now + rnd(250, 450); }
                }
            }
            return anxS.mul;
        }
        if (now > anxS.until) {
            const r = Math.random();
            if (r < 0.30) { anxS.mul = rnd(1.5, 2.3); anxS.until = now + rnd(700, 2200); }
            else if (r < 0.58) { anxS.mul = rnd(0, 0.12); anxS.until = now + rnd(600, 1800); }
            else if (r < 0.78) { anxS.mul = -rnd(0.8, 1.6); anxS.until = now + rnd(300, 700); }
            else { anxS.mul = rnd(0.55, 1.25); anxS.until = now + rnd(300, 800); }
        }
        const fadiga = 1 - Math.min(0.3, (now - anxS.t0) / 600000);
        return anxS.mul * (anxS.mul > 0 ? fadiga : 1);
    }
    const ANX_LBL = ['Ansiedade', 'Ans. normal', 'Ans. crônica'];

    async function smoothRun(id) {
        if (readState().b != null) return 'none';
        let el = scrollerEl(), mode = el ? 'scroll' : 'wheel';
        let pos = el ? el.scrollTop : 0, last = performance.now(), ramp = 0, lastUi = 0, bottomSince = 0, lastH = el ? el.scrollHeight : 0;
        let wacc = 0, t0 = performance.now(), sig0 = moveSig(), lastMove = performance.now(), triedWheel = !el;
        while (alive(id)) {
            await new Promise(r => requestAnimationFrame(r));
            const now = performance.now(), dt = Math.min(100, now - last); last = now;
            if (paused()) {
                ramp = 0; if (el && mode === 'scroll') pos = el.scrollTop; lastMove = now; t0 = now; sig0 = moveSig();
                if (now - lastUi > 400) { lastUi = now; setSt('⏸ Em pausa…'); }
                continue;
            }
            if (cfg.auto && findEndBtn()) return 'cont';
            ramp = Math.min(1, ramp + dt / 700);
            const pxs = innerHeight * 0.15 * (cfg.speed || 1) * (0.25 + 0.75 * ramp);
            const step = pxs * anxMul(now) * dt / 1000;
            if (mode === 'scroll') {
                if (!el.isConnected) { el = scrollerEl(); if (!el) { mode = 'wheel'; continue; } pos = el.scrollTop; }
                if (Math.abs(el.scrollTop - pos) > 3) pos = el.scrollTop;
                pos = Math.max(0, pos + step); el.scrollTop = pos;
                if (el.scrollTop < pos - 2) pos = el.scrollTop;
            } else {
                wacc += step;
                if (Math.abs(wacc) >= 3) { wheelAt(wacc); wacc = 0; }
            }
            const sg = moveSig();
            if (sg !== sig0) { sig0 = sg; lastMove = now; }
            if (now - lastMove > 1600) {
                const s = readState();
                if (nearEnd(s) || (mode === 'scroll' && atBottom(el))) {
                    if (!bottomSince) bottomSince = now;
                    if (now - bottomSince > 1500) return 'end';
                    continue;
                }
                if (mode === 'scroll' && !triedWheel) {
                    triedWheel = true; mode = 'wheel'; lastMove = now; wacc = 0;
                    continue;
                }
                smoothOff = true; return 'none';
            } else bottomSince = 0;
            if (mode === 'scroll') {
                if (atBottom(el)) {
                    if (el.scrollHeight !== lastH) { lastH = el.scrollHeight; bottomSince = 0; continue; }
                    if (!bottomSince) bottomSince = now;
                    if (now - bottomSince > 1500) return 'end';
                } else bottomSince = 0;
                lastH = el.scrollHeight;
            }
            if (now - lastUi > 500) { lastUi = now; setSt(`${cfg.anx === 2 ? '😰' : cfg.anx === 1 ? '😬' : '📖'} ${label(readState())} · rolando ${Math.round(pxs)} px/s (${mode})`); }
        }
        return 'cont';
    }

    async function loop() {
        const id = ++runId;
        running = true; refreshBtn(); keepAwake(true);
        let stuck = 0, endFails = 0;
        visited.clear();
        try {
            while (alive(id)) {
                if (cfg.auto) {
                    const eb = findEndBtn();
                    if (eb) {
                        setSt('✓ Fim do capítulo. Indo para o próximo…');
                        if (await nextChapter(id, eb)) { stuck = 0; endFails = 0; continue; }
                        if (!alive(id)) break;
                        if (++endFails >= 3) { finish('✓ Fim do capítulo, mas o botão "Próxima" não respondeu.'); return; }
                        await sleep(1000); continue;
                    }
                }
                if (!cfg.voice && cfg.smooth !== false && !smoothOff) {
                    const r = await smoothRun(id);
                    if (!alive(id)) break;
                    if (r === 'cont') continue;
                    if (r === 'end') {
                        for (let i = 0; i < 15 && alive(id) && !(cfg.auto && findEndBtn()); i++) await sleep(200);
                        if (!alive(id)) break;
                        if (cfg.auto && findEndBtn()) continue;
                        if (cfg.auto) {
                            setSt('✓ Fim do capítulo. Indo para o próximo…');
                            if (await nextChapter(id)) { stuck = 0; continue; }
                            if (!alive(id)) break;
                            finish('✓ Fim do capítulo, mas não achei o próximo.'); return;
                        }
                        finish('✓ Chegou ao fim do capítulo.'); return;
                    }
                }
                const st = readState();
                if (cfg.voice) await narrate(st, id);
                else await humanWait(dwellFor(st), st, id);
                if (!alive(id)) break;
                if (cfg.auto && findEndBtn()) continue;
                await settle(id);
                if (!alive(id)) break;
                await sleep(rnd(30, 140));
                const before = readState();
                const end = nearEnd(before);
                const ok = await advance(before, end, id);
                if (!alive(id)) break;
                if (ok) { stuck = 0; continue; }
                if (end) {
                    await sleep(900);
                    if (alive(id) && await advance(readState(), true, id)) { stuck = 0; continue; }
                    if (!alive(id)) break;
                    if (cfg.auto) {
                        setSt('✓ Fim do capítulo. Indo para o próximo…');
                        if (await nextChapter(id)) { stuck = 0; continue; }
                        if (!alive(id)) break;
                        finish('✓ Fim do capítulo, mas não achei o próximo.'); return;
                    }
                    finish('✓ Chegou ao fim do capítulo.'); return;
                }
                if (++stuck >= 3) { finish('Não consegui avançar. Como você vira para o próximo balão (toque, tecla)?'); return; }
            }
        } finally {
            if (id === runId) { running = false; refreshBtn(); keepAwake(false); }
        }
    }
    function finish(msg) { running = false; runId++; cancelSpeech(); if (typeof musDuck === 'function') musDuck(false); setSt(msg); refreshBtn(); keepAwake(false); }
    function stop(msg) { if (!running) return; running = false; runId++; cancelSpeech(); if (typeof musDuck === 'function') musDuck(false); setSt(msg || 'Parado.'); refreshBtn(); keepAwake(false); }

    let wl = null;
    async function keepAwake(on) {
        try {
            if (on) {
                if (!wl && navigator.wakeLock && !document.hidden) {
                    wl = await navigator.wakeLock.request('screen');
                    wl.addEventListener('release', () => { wl = null; });
                }
            } else if (wl) { const w = wl; wl = null; await w.release(); }
        } catch (e) { wl = null; }
    }
    document.addEventListener('visibilitychange', () => { if (running && !document.hidden) keepAwake(true); });

    /* =====================================================================
       TTS
       ===================================================================== */
    const TTS = window.speechSynthesis || null;
    let ttsVoices = [];
    function loadVoices() { try { ttsVoices = TTS ? TTS.getVoices() : []; } catch (e) { ttsVoices = []; } }
    if (TTS) { loadVoices(); try { TTS.addEventListener('voiceschanged', () => { loadVoices(); refreshBtn(); }); } catch (e) { } }

    const VRATES = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2];
    const isNatural = v => /natural|neural|online/i.test(v.name);
    function ptVoices() {
        const pt = ttsVoices.filter(v => /^pt([-]|$)/i.test(v.lang));
        const br = pt.filter(v => /^pt[-]BR$/i.test(v.lang));
        return (br.length ? br : pt).slice().sort((a, b) => isNatural(b) - isNatural(a));
    }
    function currentVoice() {
        const l = ptVoices();
        return l.find(v => v.name === cfg.vname) || l[0] || null;
    }
    const shortVoice = n => n.replace(/^Microsoft\s+|^Google\s+/i, '').replace(/\s*[-–(].*$/, '').trim() || n;
    function cycleVoice() {
        const l = ptVoices();
        if (!l.length) { setSt('Nenhuma voz em português neste navegador.'); return; }
        const cur = currentVoice();
        const i = l.findIndex(v => cur && v.name === cur.name);
        cfg.vname = l[(i + 1) % l.length].name; save(); refreshBtn();
        try { TTS.cancel(); TTS.speak(mkUtt('Olá! Esta é a voz do audiolivro.')); } catch (e) { }
    }
    function setVRate(dir) {
        let i = 0, best = 1e9;
        VRATES.forEach((v, k) => { const d = Math.abs(v - (cfg.vrate || 1)); if (d < best) { best = d; i = k; } });
        cfg.vrate = VRATES[Math.min(VRATES.length - 1, Math.max(0, i + dir))];
        save(); refreshBtn();
    }
    function mkUtt(text) {
        const u = new SpeechSynthesisUtterance(text);
        const v = currentVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'pt-BR';
        u.rate = cfg.vrate || 1; u.pitch = 1;
        return u;
    }
    function chunk(t) {
        const out = []; let cur = '';
        for (const x of t.split(/(?<=[.!?…])\s+/)) {
            if (cur && (cur + ' ' + x).length > 200) { out.push(cur); cur = x; }
            else cur = cur ? cur + ' ' + x : x;
        }
        if (cur) out.push(cur);
        return out;
    }
    async function speak(text, id) {
        if (!TTS) return;
        for (const p of chunk(text)) {
            if (!alive(id)) break;
            await new Promise(res => {
                let done = false, wd = 0;
                const fin = () => { if (done) return; done = true; clearTimeout(wd); res(); };
                const u = mkUtt(p);
                u.onend = fin; u.onerror = fin;
                wd = setTimeout(fin, 3500 + p.length * 140 / (cfg.vrate || 1));
                try { TTS.speak(u); } catch (e) { fin(); }
            });
        }
    }
    const cancelSpeech = () => { try { if (TTS) TTS.cancel(); } catch (e) { } };

    /* =====================================================================
       OCR
       ===================================================================== */
    const OCR = { w: null, p: null };
    function ocrBase() {
        let b = window.__inkOcrBase || (document.documentElement.dataset && document.documentElement.dataset.inkOcr) || '';
        if (!b) { try { if (chrome && chrome.runtime && chrome.runtime.getURL) b = chrome.runtime.getURL('ocr'); } catch (e) { } }
        return b.replace(/\/$/, '');
    }
    function ocrWorker() {
        if (OCR.w) return Promise.resolve(OCR.w);
        if (OCR.p) return OCR.p;
        OCR.p = (async () => {
            if (typeof Tesseract === 'undefined') throw new Error('Tesseract não carregou.');
            const base = ocrBase();
            setSt('⏳ Carregando o OCR…');
            const options = { logger: () => { }, errorHandler: e => console.warn('[Ink-OCR]', e) };
            if (base) {
                options.workerPath = base + '/worker.min.js';
                options.corePath = base;
                options.langPath = base;
                options.gzip = true;
            }
            const w = await Tesseract.createWorker('por', 1, options);
            await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            OCR.w = w;
            return w;
        })();
        OCR.p.catch(() => { OCR.p = null; });
        return OCR.p;
    }

    let capSeq = 0;
    const capWait = new Map();
    window.addEventListener('message', e => {
        const d = e.data;
        if (e.source !== window || !d || !d.inkCapRes) return;
        const f = capWait.get(d.inkCapRes);
        if (f) { capWait.delete(d.inkCapRes); f(d); }
    });
    function capture() {
        return new Promise((res, rej) => {
            const id = ++capSeq;
            const t = setTimeout(() => { capWait.delete(id); rej(new Error('a captura de tela não respondeu.')); }, 5000);
            capWait.set(id, d => { clearTimeout(t); d.err ? rej(new Error(d.err)) : res(d.data); });
            window.postMessage({ inkCap: id }, '*');
        });
    }
    async function captureRetry() {
        try { return await capture(); }
        catch (e) {
            if (/MAX_CAPTURE|quota|per second/i.test(e.message || '')) { await sleep(700); return capture(); }
            throw e;
        }
    }

    function pageImgEl(x, y) {
        let list = [];
        try { list = document.elementsFromPoint(x, y); } catch (e) { }
        for (const e of list) {
            if (e === document.documentElement || e === document.body) break;
            if (e.closest && e.closest('#ink-auto-ui,#ink-eye,#ink-dbg')) continue;
            if (e.tagName === 'IMG' || e.tagName === 'CANVAS') return e;
        }
        return null;
    }
    async function grabView() {
        const cx0 = innerWidth / 2, cy0 = innerHeight * 0.45;
        let x0 = 0, y0 = 0, x1 = innerWidth, y1 = innerHeight;
        const pe = pageImgEl(cx0, cy0);
        if (pe) {
            const r = pe.getBoundingClientRect();
            x0 = Math.max(r.left, 0); y0 = Math.max(r.top, 0); x1 = Math.min(r.right, innerWidth); y1 = Math.min(r.bottom, innerHeight);
            if (x1 - x0 < 40 || y1 - y0 < 40) { x0 = 0; y0 = 0; x1 = innerWidth; y1 = innerHeight; }
        } else if (innerWidth > 700) {
            x0 = 0; x1 = innerWidth;
            y0 = Math.max(0, cy0 - innerHeight * 0.45); y1 = Math.min(innerHeight, cy0 + innerHeight * 0.42);
        }
        const dbg = document.getElementById('ink-dbg'); if (dbg) dbg.remove();
        const panel = document.getElementById('ink-auto-ui');
        const eye = document.getElementById('ink-eye');
        const hideList = [];
        [panel, eye].forEach(el => {
            if (!el) return;
            hideList.push({ el, vis: el.style.visibility, disp: el.style.display });
            el.style.visibility = 'hidden';
        });
        let shot;
        try {
            if (hideList.length) await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            shot = await captureRetry();
        } finally {
            hideList.forEach(({ el, vis, disp }) => { el.style.visibility = vis; el.style.display = disp; });
        }
        const img = new Image();
        img.src = shot;
        await img.decode();
        const kx = img.naturalWidth / innerWidth, ky = img.naturalHeight / innerHeight;
        const sx = x0 * kx, sy = y0 * ky, sw = (x1 - x0) * kx, sh = (y1 - y0) * ky;
        let sc = Math.min(4, Math.max(2, 2000 / sw));
        if (sw * sc > 3000) sc = 3000 / sw;
        const pad = 16;
        const c = document.createElement('canvas');
        c.width = Math.round(sw * sc) + pad * 2; c.height = Math.round(sh * sc) + pad * 2;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingQuality = 'high';
        try { g.filter = 'grayscale(1) contrast(1.5)'; } catch (e) { }
        g.drawImage(img, sx, sy, sw, sh, pad, pad, sw * sc, sh * sc);
        return {
            canvas: c,
            tx: (cx0 - x0) * kx * sc + pad, ty: (cy0 - y0) * ky * sc + pad,
            view: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
            toScr: (px, py) => ({ x: x0 + (px - pad) / sc / kx, y: y0 + (py - pad) / sc / ky })
        };
    }

    function linesOf(d) {
        if (!d) return [];
        let L = d.lines;
        if (!L || !L.length) {
            L = [];
            (d.blocks || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => L.push(l))));
        }
        return L;
    }
    function refineLine(l) {
        const ws = l && l.words;
        if (!ws || !ws.length) return l;
        const hOf = w => w.bbox ? w.bbox.y1 - w.bbox.y0 : 0;
        const hs = ws.map(hOf).filter(h => h > 0).sort((a, b) => a - b);
        const mh = hs.length ? hs[hs.length >> 1] : 0;
        const SHORT = new Set(['a', 'e', 'o', 'é', 'à', 'as', 'os', 'um', 'de', 'do', 'da', 'em', 'no', 'na', 'se', 'me', 'te', 'eu', 'ou', 'ao', 'já', 'só', 'há', 'vi', 'ir', 'vê', 'lá', 'aí']);
        const keep = ws.filter(w => {
            const t = (w.text || '').replace(/[^\p{L}\p{N}]/gu, '');
            if (!t) return false;
            const c = w.confidence != null ? w.confidence : 100;
            const common = SHORT.has(t.toLowerCase());
            if (c < (common ? 25 : 45)) return false;
            if (t.length === 1 && !common && c < 85) return false;
            if (t.length <= 2 && !common && c < 70) return false;
            if (mh && hOf(w) && (hOf(w) < mh * 0.5 || hOf(w) > mh * 2)) return false;
            return true;
        });
        if (!keep.length) return null;
        if (keep.length === ws.length) return l;
        const bb = keep.filter(w => w.bbox).map(w => w.bbox);
        if (!bb.length) return l;
        return {
            text: keep.map(w => w.text).join(' '),
            confidence: keep.reduce((a, w) => a + (w.confidence != null ? w.confidence : 100), 0) / keep.length,
            bbox: { x0: Math.min(...bb.map(b => b.x0)), y0: Math.min(...bb.map(b => b.y0)), x1: Math.max(...bb.map(b => b.x1)), y1: Math.max(...bb.map(b => b.y1)) }
        };
    }
    const RX_UI = /leitura\s*autom[aá]tica|modo\s*meninas|audiolivro|pr[oó]ximo\s*cap|conforto|desempenho|mang[aá]\s*:|pausar|ler\s*sozinho|francisca|em\s*pausa\s*|aba\s*oculta|voc[eê]\s*mexendo|online\s*$|sem\s*voz\s*pt/i;

    function cleanLine(l, relaxed) {
        l = refineLine(l);
        if (!l || !l.bbox) return null;
        const t = (l.text || '').replace(/[^\p{L}\p{N}\s.,!?…:;'"’“”()–—¡¿%-]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (RX_UI.test(t)) return null;
        const letters = (t.match(/\p{L}/gu) || []).length;
        const conf = l.confidence != null ? l.confidence : 100;
        if (letters < 2 || letters < t.length * 0.45 || conf < (relaxed ? 28 : 35)) return null;
        const ws = t.split(' ').map(w => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
        if (!ws.some(w => w.length >= 2)) return null;
        const good = relaxed
            ? letters >= 2 && letters >= t.length * 0.45 && conf >= 38 && ws.some(w => w.length >= 2)
            : letters >= 3 && letters >= t.length * 0.55 && conf >= 55 &&
            ws.some(w => w.length >= 3) && !ws.some(w => /\p{Ll}\p{Lu}/u.test(w));
        return { bbox: l.bbox, text: t, good };
    }
    function pickBubble(lines, tx, ty, W, H) {
        if (!lines.length) return [];
        const dist = l => { const b = l.bbox; return Math.hypot(Math.max(b.x0 - tx, 0, tx - b.x1), Math.max(b.y0 - ty, 0, ty - b.y1)); };
        const letters = l => (l.text.match(/\p{L}/gu) || []).length;
        const hs = lines.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
        const lh = hs[hs.length >> 1] || 20;
        const pool = lines.filter(l => l.good && letters(l) >= 4);
        const pool2 = pool.length ? pool : lines.filter(l => l.good);
        if (!pool2.length) return [];
        const hOf = l => l.bbox.y1 - l.bbox.y0;
        const maxH = Math.max(...pool2.map(hOf));
        const lowH = hs[Math.floor(hs.length * 0.25)] || lh;
        const big = pool2.length >= 2 && maxH >= lowH * 2 && maxH >= 24 ? pool2.filter(l => hOf(l) >= maxH * 0.75) : [];
        let seed;
        if (big.length >= 1) {
            seed = big.reduce((a, l) => {
                const da = dist(a), dl = dist(l);
                if (dl < da - 4) return l;
                if (Math.abs(dl - da) <= 4 && letters(l) > letters(a)) return l;
                return a;
            });
        } else {
            seed = pool2.reduce((a, l) => {
                const da = dist(a), dl = dist(l);
                if (dl < da - 4) return l;
                if (Math.abs(dl - da) <= 4 && letters(l) > letters(a)) return l;
                return a;
            });
            if (dist(seed) > 0.55 * Math.min(W, H)) return [];
        }
        const sel = new Set([seed]);
        for (let grew = true; grew;) {
            grew = false;
            for (const l of lines) {
                if (sel.has(l)) continue;
                const hl = hOf(l), hs0 = hOf(seed);
                if (hl < hs0 * 0.5 || hl > hs0 * 2.0) continue;
                for (const s of sel) {
                    const a = l.bbox, b = s.bbox;
                    const gapY = Math.max(a.y0 - b.y1, b.y0 - a.y1, 0);
                    const gapX = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
                    const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
                    if ((gapY <= lh * 2.0 && ov > -lh * 0.3) || (gapY <= lh * 0.8 && gapX <= lh * 2.0)) { sel.add(l); grew = true; break; }
                }
            }
        }
        const out = [...sel];
        const totalLet = out.reduce((n, l) => n + letters(l), 0);
        if (totalLet < 6 && out.length <= 2) return [];
        return out;
    }
    function joinLines(ls) {
        const lh = Math.max(10, ...ls.map(l => l.bbox.y1 - l.bbox.y0));
        ls = ls.slice().sort((a, b) => {
            const ay = (a.bbox.y0 + a.bbox.y1) / 2, by = (b.bbox.y0 + b.bbox.y1) / 2;
            if (Math.abs(ay - by) > lh * 0.6) return ay - by;
            return cfg.manga ? b.bbox.x0 - a.bbox.x0 : a.bbox.x0 - b.bbox.x0;
        });
        let out = '';
        for (const l of ls) {
            if (!out) out = l.text;
            else if (/\p{L}-$/u.test(out)) out = out.slice(0, -1) + l.text;
            else out += ' ' + l.text;
        }
        return out;
    }
    function toSpeech(t) {
        t = t.replace(/\s+/g, ' ').trim();
        if (RX_UI.test(t)) return '';
        const up = (t.match(/\p{Lu}/gu) || []).length, lo = (t.match(/\p{Ll}/gu) || []).length;
        if (up >= 3 && up > 3 * lo)
            t = t.toLowerCase().replace(/(^|[.!?…]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
        return t.replace(/\.{3,}/g, '…').replace(/([!?])[!?]+/g, '$1');
    }

    let dbgT = 0;
    function drawDbg(g, pick) {
        let o = document.getElementById('ink-dbg');
        if (!o) { o = document.createElement('div'); o.id = 'ink-dbg'; o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482500'; document.body.appendChild(o); }
        o.innerHTML = '';
        const box = (r, col) => {
            const d = document.createElement('div');
            d.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;border:2px solid ${col};box-sizing:border-box;`;
            o.appendChild(d);
        };
        box(g.view, '#39f');
        pick.forEach(l => { const a = g.toScr(l.bbox.x0, l.bbox.y0), b = g.toScr(l.bbox.x1, l.bbox.y1); box({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, '#f33'); });
        clearTimeout(dbgT); dbgT = setTimeout(() => { const e = document.getElementById('ink-dbg'); if (e) e.remove(); }, 4000);
    }
    async function ocrView() {
        for (let i = 0; i < 3; i++) {
            const t = await ocrViewOnce();
            if (t) return t;
            if (i < 2) { if (!running && !cfg.dbg) break; await sleep(550); }
        }
        return '';
    }
    function preprocessBalloon(canvas, C = 10) {
        const w = canvas.width, h = canvas.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const img = ctx.getImageData(0, 0, w, h), d = img.data;
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const W = w + 1, S = new Float64Array(W * (h + 1));
        for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += gray[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; } }
        const r = Math.max(8, Math.round(Math.min(w, h) / 24));
        const bin = new Uint8ClampedArray(w * h);
        for (let y = 0; y < h; y++) {
            const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
            for (let x = 0; x < w; x++) {
                const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
                const sum = S[y1 * W + x1] - S[y0 * W + x1] - S[y1 * W + x0] + S[y0 * W + x0];
                bin[y * w + x] = gray[y * w + x] < sum / ((x1 - x0) * (y1 - y0)) - C ? 0 : 255;
            }
        }
        const pass = (src, max) => {
            const out = Uint8ClampedArray.from(src);
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                let e = max ? 0 : 255;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const v = src[(y + dy) * w + x + dx];
                    e = max ? Math.max(e, v) : Math.min(e, v);
                }
                out[y * w + x] = e;
            }
            return out;
        };
        const clean = pass(pass(bin, false), true);
        for (let i = 0, j = 0; i < d.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = clean[j]; d[i + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return canvas;
    }
    async function ocrViewOnce() {
        const w = await ocrWorker();
        const g = await grabView();
        let src = g.canvas;
        const tryRead = async cv => {
            let cvr = cv;
            if (cfg.bin1) {
                cvr = document.createElement('canvas'); cvr.width = cv.width; cvr.height = cv.height;
                cvr.getContext('2d', { willReadFrequently: true }).drawImage(cv, 0, 0);
                preprocessBalloon(cvr);
            }
            const rr = await w.recognize(cvr, {}, { blocks: true, text: true });
            const raw = linesOf(rr.data);
            for (const relaxed of [false, true]) {
                const ls = raw.map(l => cleanLine(l, relaxed)).filter(Boolean);
                const pk = pickBubble(ls, g.tx, g.ty, cv.width, cv.height);
                if (pk.length) return pk;
            }
            return [];
        };
        let pick = await tryRead(g.canvas);
        if (!pick.length) {
            const inv = document.createElement('canvas'); inv.width = g.canvas.width; inv.height = g.canvas.height;
            const gi = inv.getContext('2d'); gi.drawImage(g.canvas, 0, 0);
            try { const id = gi.getImageData(0, 0, inv.width, inv.height), d = id.data; for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255 - d[i]; } gi.putImageData(id, 0, 0); } catch (e) { }
            pick = await tryRead(inv);
            if (pick.length) src = inv;
        }
        if (!pick.length) { if (cfg.dbg) { drawDbg(g, pick); } return ''; }
        const first = toSpeech(joinLines(pick));
        try {
            const hs = pick.map(l => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b);
            const lh = hs[hs.length >> 1] || 20;
            let bx0 = Math.min(...pick.map(l => l.bbox.x0)), by0 = Math.min(...pick.map(l => l.bbox.y0));
            let bx1 = Math.max(...pick.map(l => l.bbox.x1)), by1 = Math.max(...pick.map(l => l.bbox.y1));
            const mx = Math.max(lh * 1.2, 18), my = Math.max(lh * 2.4, 28);
            bx0 = Math.max(0, bx0 - mx); by0 = Math.max(0, by0 - my);
            bx1 = Math.min(g.canvas.width, bx1 + mx); by1 = Math.min(g.canvas.height, by1 + my);
            const f = Math.min(5, Math.max(1.4, 52 / lh)), pad = 20;
            const c2 = document.createElement('canvas');
            c2.width = Math.round((bx1 - bx0) * f) + pad * 2; c2.height = Math.round((by1 - by0) * f) + pad * 2;
            const g2 = c2.getContext('2d', { willReadFrequently: true });
            g2.fillStyle = '#fff'; g2.fillRect(0, 0, c2.width, c2.height);
            g2.imageSmoothingQuality = 'high';
            g2.drawImage(src, bx0, by0, bx1 - bx0, by1 - by0, pad, pad, (bx1 - bx0) * f, (by1 - by0) * f);
            try {
                const id = g2.getImageData(pad, pad, c2.width - pad * 2, c2.height - pad * 2), d = id.data;
                let sum = 0, n = 0;
                for (let i = 0; i < d.length; i += 16) { sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
                const dark = n && (sum / n) < 120;
                for (let i = 0; i < d.length; i += 4) {
                    let L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                    L = Math.max(0, Math.min(255, (L - 128) * (cfg.bin ? 1.0 : 1.55) + 128));
                    if (dark) L = 255 - L;
                    d[i] = d[i + 1] = d[i + 2] = L;
                }
                g2.putImageData(id, pad, pad);
                if (cfg.bin) preprocessBalloon(c2);
            } catch (e) { }
            await w.setParameters({ tessedit_pageseg_mode: '6' });
            let r2;
            try { r2 = await w.recognize(c2, {}, { blocks: true, text: true }); }
            finally { await w.setParameters({ tessedit_pageseg_mode: '11' }); }
            const raw2 = linesOf(r2.data);
            const cx = ((bx0 + bx1) / 2 - bx0) * f + pad, cy = ((by0 + by1) / 2 - by0) * f + pad;
            let pick2 = [];
            for (const rl of [false, true]) {
                pick2 = pickBubble(raw2.map(l => cleanLine(l, rl)).filter(Boolean), cx, cy, c2.width, c2.height);
                if (pick2.length) break;
            }
            if (!pick2.length) {
                const all = raw2.map(l => cleanLine(l, true)).filter(Boolean);
                if (all.length) pick2 = all;
            }
            const letters = t => (t.match(/\p{L}/gu) || []).length;
            const text2 = pick2.length ? toSpeech(joinLines(pick2)) : '';
            if (cfg.dbg) { drawDbg(g, pick2.length ? pick2 : pick); }
            if (text2 && letters(text2) >= letters(first) * 0.7 && letters(text2) <= letters(first) * 2.2) return text2;
            if (text2 && letters(text2) > letters(first) && letters(text2) <= letters(first) * 2.5) return text2;
        } catch (e) { try { await w.setParameters({ tessedit_pageseg_mode: '11' }); } catch (_) { } }
        return first;
    }

    async function narrate(st, id) {
        try { await narrate0(st, id); }
        finally { if (typeof musDuck === 'function') musDuck(false); }
    }
    async function narrate0(st, id) {
        if (typeof musDuck === 'function') musDuck(true);
        while (alive(id) && paused()) { setSt('⏸ Em pausa…'); await sleep(200); }
        if (!alive(id) || (cfg.auto && findEndBtn())) return;
        await settle(id);
        if (!alive(id)) return;
        setSt(`🔎 ${label(st)} · lendo o balão…`);
        let text = '';
        try { text = await ocrView(); }
        catch (e) {
            if (alive(id)) finish('🎧 Não consegui ler: ' + (e.message || e));
            return;
        }
        if (!alive(id)) return;
        if (!text) { setSt(`🎧 ${label(st)} · sem texto aqui`); await humanWait(Math.max(400, 800 / (cfg.vrate || 1)), st, id); return; }
        setSt(`🎧 ${label(st)} · ${text.length > 70 ? text.slice(0, 67) + '…' : text}`);
        await speak(text, id);
        if (alive(id)) await sleep(250);
    }
    function toggleVoice() {
        cfg.voice = !cfg.voice; save(); refreshBtn();
        if (!cfg.voice) { cancelSpeech(); if (typeof musDuck === 'function') musDuck(false); return; }
        if (!TTS || !ptVoices().length) setSt('⚠ Nenhuma voz em português encontrada.');
        else ocrWorker().then(() => { if (!running) setSt('Audiolivro pronto. Toque em Ler sozinho.' + (cfg.girl ? ' ' + mascot() : '')); }).catch(e => setSt('⚠ OCR: ' + (e.message || e)));
    }

    /* =====================================================================
       UI — ÍCONES E CSS
       ===================================================================== */
    function setSt(t) {
        const s = document.getElementById('ink-auto-st');
        if (s && s.textContent !== t) s.textContent = t;
    }
    const svg = (p, fill) => `<svg viewBox="0 0 24 24" width="16" height="16" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${p}</svg>`;
    const ICO = {
        play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>', true),
        pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>', true),
        book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/>'),
        down: svg('<path d="M6 9l6 6 6-6"/>'),
        up: svg('<path d="M6 15l6-6 6 6"/>'),
        voice: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>')
    };
    const ICO_O = {
        'ink-ord-btn': svg('<path d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5"/>'),
        'ink-ord-clean': svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>'),
        'ink-ord-zero': svg('<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>')
    };

    const INK_CSS = `
#ink-auto-ui{--ia-bg:rgba(255,240,245,.95);--ia-card:rgba(255,182,193,.4);--ia-card2:rgba(255,105,180,.5);--ia-line:rgba(255,192,203,.8);--ia-txt:#5c4a4a;--ia-dim:#a88b8b;--ia-ac:#ff69b4;--ia-ac2:#ffb6c1;
position:fixed;z-index:2147483000;width:min(236px,calc(100vw - 16px));box-sizing:border-box;padding:8px;padding-top:12px;color:var(--ia-txt);
background:var(--ia-bg);-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);
border:2px solid var(--ia-ac2);border-radius:24px;font:12.5px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
box-shadow:0 8px 24px rgba(255,105,180,.3),inset 0 1px 0 rgba(255,255,255,.5);
overscroll-behavior:contain;touch-action:manipulation;-webkit-tap-highlight-color:transparent;pointer-events:auto;
overflow:visible !important;
}
#ink-auto-ui::before,#ink-auto-ui::after{content:"";position:absolute;top:-12px;width:0;height:0;border-left:14px solid transparent;border-right:14px solid transparent;border-bottom:20px solid var(--ia-ac2);z-index:-1}
#ink-auto-ui::before{left:24px;transform:rotate(-15deg)}
#ink-auto-ui::after{right:24px;transform:rotate(15deg)}
#ink-auto-ui.min::before,#ink-auto-ui.min::after{display:none}
#ink-auto-ui.min{padding-top:8px !important}
#ink-auto-body{max-height:calc(100vh - 40px);max-height:calc(100dvh - 40px);overflow:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
#ink-auto-body::-webkit-scrollbar{display:none}
#ink-auto-ui.mob{background:rgba(255,240,245,.98);-webkit-backdrop-filter:none;backdrop-filter:none}
#ink-auto-ui *{box-sizing:border-box}
#ink-auto-ui button{all:unset;box-sizing:border-box;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#ink-auto-ui button:focus-visible{outline:2px solid var(--ia-ac);outline-offset:1px}
#ink-auto-ui .ia-head{display:flex;align-items:center;gap:6px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
#ink-auto-ui .ia-logo{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;color:#fff;flex:none;background:linear-gradient(135deg,var(--ia-ac),var(--ia-ac2))}
#ink-auto-ui .ia-title{flex:1;font-weight:800;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#ff1493;font-family:'Comic Sans MS','Nunito',sans-serif}
#ink-auto-ui .ia-ib{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--ia-card);color:var(--ia-txt);flex:none}
#ink-auto-ui #ink-auto-mini-go{display:none;color:#fff;background:linear-gradient(135deg,var(--ia-ac),var(--ia-ac2))}
#ink-auto-ui.min{width:auto;padding:6px}
#ink-auto-ui.min .ia-title,#ink-auto-ui.min #ink-auto-body{display:none}
#ink-auto-ui.min #ink-auto-mini-go{display:grid}
#ink-auto-ui.mob .ia-ib{width:36px;height:36px;border-radius:11px}
#ink-auto-ui .ia-st{margin:6px 0 0;padding:5px 9px;border-radius:10px;background:var(--ia-card);color:var(--ia-txt);font-size:11.5px;line-height:1.3;word-break:break-word;border:1px solid var(--ia-line);
display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;transition:border-color .2s}
#ink-auto-ui .ia-st:empty{display:none}
#ink-auto-ui.run .ia-st{border-color:var(--ia-ac)}
#ink-auto-ui .ia-main{display:flex;gap:6px;align-items:center;margin-top:6px}
#ink-auto-ui #ink-auto-go{flex:1;height:36px;border-radius:11px;display:flex;align-items:center;justify-content:center;gap:6px;font-weight:800;font-size:12.5px;color:#fff;
background:linear-gradient(135deg,var(--ia-ac),var(--ia-ac2));box-shadow:0 4px 12px rgba(255,105,180,.4);transition:transform .08s,filter .15s}
#ink-auto-ui #ink-auto-go:active{transform:scale(.97)}
#ink-auto-ui.run #ink-auto-go{background:var(--ia-card2);box-shadow:none;color:var(--ia-txt)}
#ink-auto-ui.mob #ink-auto-go{height:44px}
#ink-auto-ui .ia-step{display:flex;align-items:center;border-radius:11px;background:var(--ia-card);flex:none}
#ink-auto-ui .ia-step button{width:26px;height:36px;border-radius:9px;display:grid;place-items:center;font-size:16px;line-height:1}
#ink-auto-ui .ia-step button:active{background:var(--ia-card2)}
#ink-auto-ui.mob .ia-step button{width:32px;height:44px}
#ink-auto-ui .ia-val{min-width:34px;text-align:center;font-weight:600;font-size:12px;font-variant-numeric:tabular-nums}
#ink-auto-ui .ia-chips{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px}
#ink-auto-ui .ia-chip{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:42px;padding:5px 1px 4px;border-radius:11px;
background:var(--ia-card);border:1px solid var(--ia-line);color:var(--ia-txt);font-size:9.5px;font-weight:600;letter-spacing:.1px;transition:background .12s,color .12s,border-color .12s}
#ink-auto-ui.mob .ia-chip{min-height:50px}
#ink-auto-ui .ia-chip:active{background:var(--ia-card2)}
#ink-auto-ui .ia-chip.on{color:#fff;background:var(--ia-ac);border-color:#ff1493}
#ink-auto-ui .ia-chip svg{width:16px;height:16px;color:var(--ia-ac)}
#ink-auto-ui .ia-chip.on svg{color:#fff}
#ink-auto-ui .ia-sub{display:flex;gap:4px;align-items:stretch;margin-top:5px}
#ink-auto-ui .ia-sub .ia-row{flex:1;min-width:0}
#ink-auto-ui .ia-sub .ia-step button{height:32px}
#ink-auto-ui.mob .ia-sub .ia-step button{height:40px}
#ink-auto-ui .ia-sec{margin:9px 2px 4px;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:var(--ia-dim);font-weight:700}
#ink-auto-ui .ia-row{display:flex;align-items:center;gap:7px;width:100%;padding:7px 9px;border-radius:11px;background:var(--ia-card);border:1px solid var(--ia-line);font-size:11.5px;transition:background .12s,border-color .12s;color:var(--ia-txt)}
#ink-auto-ui.mob .ia-row{min-height:40px}
#ink-auto-ui .ia-row:active{background:var(--ia-card2)}
#ink-auto-ui .ia-row.on{border-color:var(--ia-ac);background:var(--ia-ac);color:#fff}
#ink-auto-ui .ia-lbl{flex:1;min-width:0;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ink-auto-ui .ia-ico{display:grid;place-items:center;color:var(--ia-dim);flex:none}
#ink-auto-ui .ia-sub.dim{display:none}
#ink-auto-ui:has(#ink-eye-btn:not(.on)) #ink-eye-sub{display:none}
@media (hover:hover){
#ink-auto-ui .ia-row:hover,#ink-auto-ui .ia-chip:hover{background:var(--ia-card2)}
#ink-auto-ui .ia-ib:hover,#ink-auto-ui .ia-step button:hover{background:var(--ia-card2)}
#ink-auto-ui #ink-auto-go:hover{filter:brightness(1.08)}
}
#ink-auto-ui.boy{--ia-bg:rgba(16,16,20,.84);--ia-card:rgba(255,255,255,.06);--ia-card2:rgba(255,255,255,.12);--ia-line:rgba(255,255,255,.08);--ia-txt:#f4f2ef;--ia-dim:#a19eac;--ia-ac:#e8573f;--ia-ac2:#ff8a4c;
border:1px solid var(--ia-line);border-radius:18px;padding-top:8px;box-shadow:0 10px 30px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05)}
#ink-auto-ui.boy::before,#ink-auto-ui.boy::after{display:none}
#ink-auto-ui.boy.mob{background:rgba(16,16,20,.96)}
#ink-auto-ui.boy .ia-title{color:var(--ia-txt);font-weight:650;font-size:12.5px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#ink-auto-ui.boy .ia-st{color:#d9d6df;border-color:transparent}
#ink-auto-ui.boy.run .ia-st{border-color:rgba(232,87,63,.45)}
#ink-auto-ui.boy #ink-auto-go{font-weight:650;box-shadow:0 4px 12px rgba(232,87,63,.3)}
#ink-auto-ui.boy.run #ink-auto-go{box-shadow:none;color:var(--ia-txt)}
#ink-auto-ui.boy .ia-chip{border-color:transparent;color:var(--ia-dim)}
#ink-auto-ui.boy .ia-chip.on{color:#fff;background:rgba(232,87,63,.2);border-color:rgba(232,87,63,.55)}
#ink-auto-ui.boy .ia-chip svg{color:currentColor}
#ink-auto-ui.boy .ia-row{border-color:transparent}
#ink-auto-ui.boy .ia-row.on{border-color:rgba(232,87,63,.55);background:rgba(232,87,63,.16)}
#ink-auto-ui .ia-skins{margin-top:2px}
#ink-auto-ui .ia-skin-btns{display:flex;gap:4px}
#ink-auto-ui .ia-skin{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;min-height:32px;padding:6px 4px;border-radius:11px;font-size:11.5px;font-weight:600;
background:var(--ia-card);border:1px solid var(--ia-line);color:var(--ia-txt);white-space:nowrap;transition:background .12s,border-color .12s}
#ink-auto-ui.mob .ia-skin{min-height:40px}
#ink-auto-ui .ia-skin:active{background:var(--ia-card2)}
#ink-auto-ui .ia-skin.on{color:#fff;background:var(--ia-ac);border-color:var(--ia-ac2)}
#ink-auto-ui.boy .ia-skins{display:none}
#ink-auto-ui.skin-lobo{--ia-bg:rgba(28,34,48,.95);--ia-card:rgba(150,170,205,.16);--ia-card2:rgba(150,170,205,.30);--ia-line:rgba(170,190,225,.30);--ia-txt:#e9eef7;--ia-dim:#8f9bb5;--ia-ac:#5f8fd0;--ia-ac2:#aebfdc;
box-shadow:0 8px 24px rgba(10,16,32,.55),0 0 18px rgba(120,160,230,.18),inset 0 1px 0 rgba(255,255,255,.12)}
#ink-auto-ui.skin-lobo.mob{background:rgba(28,34,48,.98)}
#ink-auto-ui.skin-lobo::before,#ink-auto-ui.skin-lobo::after{top:-28px;width:30px;height:38px;border:0;clip-path:polygon(50% 0,100% 100%,0 100%);
background:radial-gradient(ellipse 45% 55% at 50% 100%,#3a4666 0 55%,var(--ia-ac2) 58%)}
#ink-auto-ui.skin-lobo::before{left:18px;transform:rotate(-10deg)}
#ink-auto-ui.skin-lobo::after{right:18px;transform:rotate(10deg)}
#ink-auto-ui.skin-lobo .ia-title{color:#cfe0ff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.2px}
#ink-auto-ui.skin-lobo #ink-auto-go{box-shadow:0 4px 12px rgba(95,143,208,.35)}
#ink-auto-ui.skin-lobo.run #ink-auto-go{box-shadow:none}
#ink-auto-ui.skin-lobo .ia-chip.on{border-color:var(--ia-ac2)}
#ink-auto-ui.skin-lobo .ia-row.on{border-color:var(--ia-ac2)}
#ink-ord-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 4px}
#ink-ord-bar .io-pill{display:inline-flex;align-items:center;gap:6px;font:600 12.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;color:#f1efec;
background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:9px 12px;cursor:pointer;white-space:nowrap;
transition:background .12s,transform .06s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#ink-ord-bar .io-pill:hover{background:rgba(255,255,255,.13)}
#ink-ord-bar .io-pill:active{transform:scale(.97)}
#ink-ord-bar .io-pill svg{opacity:.85}
#ink-ord-bar .io-seg{display:flex;gap:2px;margin-left:auto;padding:3px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:14px}
#ink-ord-bar .io-seg button{font:600 12.5px/1 system-ui,-apple-system,"Segoe UI",sans-serif;border:0;border-radius:11px;padding:8px 12px;cursor:pointer;white-space:nowrap;
color:#bdbac6;background:transparent;transition:background .15s,color .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#ink-ord-bar .io-seg button.on{color:#fff;background:linear-gradient(135deg,#e8573f,#ff8a4c);box-shadow:0 2px 10px rgba(232,87,63,.35)}
#ink-ord-st{font:12.5px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;padding:8px 11px;margin:6px 0 2px;border-radius:11px;
background:rgba(90,170,255,.1);border:1px solid rgba(90,170,255,.22);color:#a9d2ff}
#ink-ord-st:empty{display:none}
#ink-ord-bar .io-pill,#ink-ord-bar .io-seg button{-webkit-user-select:none;user-select:none}
@media (pointer:coarse),(max-width:700px){
#ink-ord-bar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0 6px}
#ink-ord-bar .io-pill{justify-content:center;min-height:48px;padding:10px 6px;font-size:13.5px;border-radius:14px}
#ink-ord-bar .io-pill span{overflow:hidden;text-overflow:ellipsis}
#ink-ord-bar .io-seg{grid-column:1/-1;margin:0;width:100%}
#ink-ord-bar .io-seg button{flex:1;min-height:44px;font-size:14px;text-align:center}
#ink-ord-st{font-size:13px;padding:10px 12px}
}
`;
    function injectCSS() {
        const old = document.getElementById('ink-ui-css');
        if (old && old.dataset.v === '3.2') return;
        if (old) old.remove();
        const s = document.createElement('style');
        s.id = 'ink-ui-css'; s.dataset.v = '3.2'; s.textContent = INK_CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    /* =====================================================================
       ORDENADOR DE CAPÍTULOS (mangá / HQ)
       ===================================================================== */
    const ORD = { mode: 'asc', dir: 'west', origOrder: new WeakMap() };
    try {
        const j = JSON.parse(localStorage.getItem('ink_ord_cfg') || '{}');
        if (j.mode) ORD.mode = j.mode;
        if (j.dir) ORD.dir = j.dir;
    } catch (e) { }
    const ordSave = () => { try { localStorage.setItem('ink_ord_cfg', JSON.stringify({ mode: ORD.mode, dir: ORD.dir })); } catch (e) { } };
    const ordStatus = t => { const s = document.getElementById('ink-ord-st'); if (s && s.textContent !== t) s.textContent = t; };
    const RX_CAP_LINK = 'a[href*="/ler/"],a[href*="/capitulo/"],a[href*="/cap/"],a[href*="/chapter/"]';

    function ordList() {
        const links = [...document.querySelectorAll(RX_CAP_LINK)];
        if (links.length < 2) return null;
        const map = new Map();
        for (const a of links) {
            const p = a.parentElement;
            if (!p) continue;
            map.set(p, (map.get(p) || 0) + 1);
        }
        let best = null, n = 1;
        for (const [p, c] of map) if (c > n) { n = c; best = p; }
        return best;
    }
    function ordNum(h) {
        try {
            const u = new URL(h, location.href);
            const m = /(?:capitulo|cap|ch|chapter|ler|ep)[\-\/]?(\d+(?:[.,]\d+)?)/i.exec(u.pathname + u.search);
            if (m) return parseFloat(m[1].replace(',', '.'));
            const nums = (u.pathname + u.search).match(/\d+(?:[.,]\d+)?/g);
            if (nums) return parseFloat(nums[nums.length - 1].replace(',', '.'));
        } catch (e) { }
        return 0;
    }
    function ordItems(box) {
        const links = [...box.querySelectorAll(RX_CAP_LINK)];
        const out = [], seen = new Set();
        for (const a of links) {
            let it = a;
            for (let i = 0; i < 6; i++) {
                if (!it.parentElement || it.parentElement === box || it.parentElement === document.body) break;
                it = it.parentElement;
                if (it.querySelectorAll(RX_CAP_LINK).length > 1) { it = it.firstElementChild || a; break; }
            }
            if (seen.has(it)) continue;
            seen.add(it);
            out.push({ el: it, num: ordNum(a.getAttribute('href') || ''), href: (a.getAttribute('href') || '').split('?')[0] });
        }
        return out;
    }
    function ordApply() {
        const box = ordList();
        if (!box) { ordStatus('⚠ Não achei a lista de capítulos nesta página.'); return false; }
        const items = ordItems(box);
        if (!items.length) { ordStatus('⚠ Lista vazia.'); return false; }
        if (!ORD.origOrder.has(box)) ORD.origOrder.set(box, items.map(x => x.el));
        const list = items.slice();
        if (ORD.mode === 'asc') list.sort((a, b) => a.num - b.num);
        else if (ORD.mode === 'desc') list.sort((a, b) => b.num - a.num);
        else {
            const orig = ORD.origOrder.get(box) || [];
            list.sort((a, b) => orig.indexOf(a.el) - orig.indexOf(b.el));
        }
        const frag = document.createDocumentFragment();
        for (const it of list) frag.appendChild(it.el);
        box.appendChild(frag);
        if (ORD.dir === 'manga') {
            box.style.direction = 'rtl';
            try { box.style.flexDirection = 'row-reverse'; } catch (e) { }
            box.dataset.inkDir = 'manga';
        } else {
            box.style.direction = '';
            box.style.flexDirection = '';
            box.dataset.inkDir = 'west';
        }
        cfg.manga = (ORD.dir === 'manga');
        save();
        ordStatus(`✓ ${ORD.mode === 'asc' ? 'Crescente' : ORD.mode === 'desc' ? 'Decrescente' : 'Original'} · ${ORD.dir === 'manga' ? 'Mangá (dir→esq)' : 'Ocidental (esq→dir)'}`);
        return true;
    }
    function ordClean() {
        const box = ordList();
        if (!box) { ordStatus('⚠ Não achei a lista.'); return false; }
        const items = ordItems(box);
        const seen = new Set();
        let removed = 0;
        for (const it of items) {
            const key = it.href.replace(/\/$/, '');
            if (seen.has(key)) { it.el.remove(); removed++; }
            else seen.add(key);
        }
        ordStatus(`✓ Limpo: ${removed} duplicata(s) removida(s).`);
        return true;
    }
    function ordReset() {
        const box = ordList();
        if (!box) { ordStatus('⚠ Não achei a lista.'); return false; }
        const orig = ORD.origOrder.get(box);
        if (!orig || !orig.length) { ordStatus('⚠ Sem ordem original salva. Recarregue a página.'); return false; }
        for (const el of orig) { try { el.isConnected && box.appendChild(el); } catch (e) { } }
        box.style.direction = '';
        box.style.flexDirection = '';
        ORD.mode = 'orig';
        ordSave();
        ordStatus('✓ Ordem original restaurada.');
        return true;
    }
    function ordCycleMode() {
        ORD.mode = ORD.mode === 'asc' ? 'desc' : ORD.mode === 'desc' ? 'orig' : 'asc';
        ordSave(); ordApply(); ordPaint();
    }
    function ordPaint() {
        const bar = document.getElementById('ink-ord-bar');
        if (!bar) return;
        const map = { asc: 'Ordenar ↑', desc: 'Ordenar ↓', orig: 'Original' };
        const pb = bar.querySelector('[data-ord-pill="sort"] span');
        if (pb) pb.textContent = map[ORD.mode] || 'Ordenar';
        bar.querySelectorAll('[data-ord-dir]').forEach(b => b.classList.toggle('on', b.dataset.ordDir === ORD.dir));
    }
    function buildOrderBar() {
        if (document.getElementById('ink-ord-bar')) return;
        if (!location.pathname.startsWith('/ler/') && !/(manga|manhwa|hq|comic|obra|capitulo)/i.test(location.pathname)) return;
        const box = ordList();
        if (!box) return;
        if (ordItems(box).length < 2) return;

        const bar = document.createElement('div');
        bar.id = 'ink-ord-bar';
        bar.innerHTML = `
            <button type="button" class="io-pill" data-ord-pill="sort" title="Alternar ordem">
                ${ICO_O['ink-ord-btn']}<span>Ordenar</span>
            </button>
            <button type="button" class="io-pill" data-ord-pill="clean" title="Remover duplicados">
                ${ICO_O['ink-ord-clean']}<span>Limpar</span>
            </button>
            <button type="button" class="io-pill" data-ord-pill="zero" title="Restaurar ordem original">
                ${ICO_O['ink-ord-zero']}<span>Zerar</span>
            </button>
            <div class="io-seg" role="group" aria-label="Direção de leitura">
                <button type="button" data-ord-dir="west">Ocidental</button>
                <button type="button" data-ord-dir="manga">Mangá</button>
            </div>`;
        const st = document.createElement('div');
        st.id = 'ink-ord-st';

        try {
            const parent = box.parentElement || document.body;
            parent.insertBefore(bar, box);
            parent.insertBefore(st, box);
        } catch (e) {
            document.body.insertBefore(bar, document.body.firstChild);
            document.body.insertBefore(st, bar.nextSibling);
        }

        bar.querySelector('[data-ord-pill="sort"]').addEventListener('click', ordCycleMode);
        bar.querySelector('[data-ord-pill="clean"]').addEventListener('click', ordClean);
        bar.querySelector('[data-ord-pill="zero"]').addEventListener('click', ordReset);
        bar.querySelectorAll('[data-ord-dir]').forEach(b =>
            b.addEventListener('click', () => { ORD.dir = b.dataset.ordDir; ordSave(); ordApply(); ordPaint(); })
        );
        ordPaint();
        if (ORD.mode !== 'orig' || ORD.dir !== 'west') ordApply();
    }

    /* =====================================================================
       PAINEL PRINCIPAL (ink-auto-ui)
       ===================================================================== */
    const sw = (id, on) => {
        const e = document.getElementById(id);
        if (e) { e.classList.toggle('on', !!on); e.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    };
    const speedTxt = () => String(+(cfg.speed || 1).toFixed(2)) + '×';
    function refreshBtn() {
        const u = document.getElementById('ink-auto-ui');
        if (u) u.classList.toggle('run', running);
        const b = document.getElementById('ink-auto-go');
        if (b) b.innerHTML = running ? ICO.pause + '<span>Pausar</span>' : ICO.play + '<span>Ler sozinho</span>';
        const mg = document.getElementById('ink-auto-mini-go');
        if (mg) { mg.innerHTML = running ? ICO.pause : ICO.play; mg.title = running ? 'Pausar' : 'Ler sozinho'; }
        sw('ink-auto-manga', cfg.manga);
        sw('ink-auto-next', cfg.auto);
        sw('ink-voice-btn', cfg.voice);
        sw('ink-perf-btn', isPerf());
        sw('ink-anx-btn', cfg.anx > 0);
        const ab = document.getElementById('ink-anx-btn');
        if (ab) {
            const sp = ab.querySelector('span'); if (sp) sp.textContent = ANX_LBL[cfg.anx | 0];
            ab.title = 'Toque para alternar: desligado → ansiedade normal → ansiedade crônica';
        }
        const sp = document.getElementById('ink-auto-sp');
        if (sp) sp.textContent = speedTxt();
        const vp = document.getElementById('ink-voice-name');
        if (vp) { const v = currentVoice(); vp.textContent = v ? shortVoice(v.name) : 'sem voz pt'; }
        const vs = document.getElementById('ink-voice-sp');
        if (vs) vs.textContent = String(+(cfg.vrate || 1).toFixed(2)) + '×';
        const vc = document.getElementById('ink-voice-combo');
        if (vc) vc.classList.toggle('dim', !cfg.voice);
        const pb = document.getElementById('ink-perf-btn');
        if (pb) pb.title = isPerf()
            ? 'Modo leve ativo (menos CPU/GPU). Toque para alternar.'
            : 'Modo leve desligado. Toque para alternar (recomendado no celular).';
    }
    function applyTheme() {
        const u = document.getElementById('ink-auto-ui'); if (!u) return;
        u.classList.toggle('boy', !cfg.girl);
        SKINS.forEach(k => u.classList.toggle('skin-' + k.id, cfg.girl && curSkin().id === k.id));
        u.querySelectorAll('[data-skin]').forEach(b => {
            const on = b.dataset.skin === curSkin().id;
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const t = document.getElementById('ink-auto-title');
        if (t) t.textContent = (cfg.girl ? 'Modo Meninas ' + mascot() : 'Leitura automática') + ' ' + INK_VERSION;
        const l = document.getElementById('ink-gender-lbl');
        if (l) l.textContent = cfg.girl ? '👧 Menina · toque p/ menino' : '👦 Menino · toque p/ menina';
    }
    function applyMin() {
        const u = document.getElementById('ink-auto-ui'); if (!u) return;
        const mn = cfg.min == null ? false : !!cfg.min;
        u.classList.toggle('min', mn);
        const m = u.querySelector('#ink-auto-min');
        if (m) { m.innerHTML = mn ? ICO.up : ICO.down; m.title = mn ? 'expandir' : 'minimizar'; }
        applyPos();
    }
    function applyPos() {
        const u = document.getElementById('ink-auto-ui');
        if (!u || !cfg.pos) return;
        const r = u.getBoundingClientRect();
        const x = Math.min(Math.max(0, cfg.pos.x), Math.max(0, innerWidth - r.width));
        const y = Math.min(Math.max(0, cfg.pos.y), Math.max(0, innerHeight - r.height));
        u.style.left = x + 'px'; u.style.top = y + 'px'; u.style.bottom = 'auto';
    }
    function toggle() { if (running) stop('Parado.'); else loop(); }
    function setSpeed(dir) {
        let i = 0, best = 1e9;
        SPEEDS.forEach((v, k) => { const d = Math.abs(v - (cfg.speed || 1)); if (d < best) { best = d; i = k; } });
        cfg.speed = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + dir))];
        save(); refreshBtn();
    }
    function applyEye() {
        let o = document.getElementById('ink-eye');
        if (!cfg.eye || !location.pathname.startsWith('/ler/')) { if (o) o.remove(); }
        else {
            if (!o) {
                o = document.createElement('div');
                o.id = 'ink-eye';
                o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000' + (MOBILE ? '' : ';mix-blend-mode:multiply');
                (document.body || document.documentElement).appendChild(o);
            }
            const a = Math.min(0.6, Math.max(0.05, cfg.eyeLvl || 0.25));
            const bg = MOBILE
                ? `rgba(255,150,40,${(0.04 + a * 0.3).toFixed(3)})`
                : `rgba(255,${Math.round(190 - a * 150)},${Math.round(110 - a * 150)},${(0.35 + a * 0.9).toFixed(2)})`;
            if (o.dataset.bg !== bg) { o.dataset.bg = bg; o.style.background = bg; }
        }
        sw('ink-eye-btn', cfg.eye);
        const l = document.getElementById('ink-eye-lvl');
        if (l) l.textContent = Math.round((cfg.eyeLvl || 0.25) * 100) + '%';
    }
    function toggleEye() { cfg.eye = !cfg.eye; save(); applyEye(); }
    function setEyeLvl(d) {
        cfg.eyeLvl = Math.min(0.6, Math.max(0.05, Math.round(((cfg.eyeLvl || 0.25) + d) * 100) / 100));
        if (!cfg.eye) cfg.eye = true;
        save(); applyEye();
    }

    /* =====================================================================
       MISSÕES
       ===================================================================== */
    const MS_KEY = 'ink_missions';
    function scanMissions() {
        if (document.hidden) return;
        const lis = document.querySelectorAll('li.event-mission');
        if (!lis.length) return;
        const out = [];
        lis.forEach(li => {
            const el = li.querySelector('strong');
            const t = (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
            if (!/^ler\s+\d+\s+p[aá]ginas/i.test(t)) return;
            const fe = li.querySelector('.event-mission__frac');
            const fr = fe ? fe.textContent : '';
            const m = /(\d+)\s*\/\s*(\d+)/.exec(fr);
            const done = li.classList.contains('is-done') || /resgatad/i.test(fr);
            const tot = +/\d+/.exec(t)[0];
            out.push({ t, c: m ? +m[1] : (done ? tot : 0), n: m ? +m[2] : tot, done, rep: !!li.querySelector('.event-mission__repeat'), fac: /fac[cç][aã]o/i.test(t) });
        });
        if (out.length) { try { localStorage.setItem(MS_KEY, JSON.stringify({ ts: Date.now(), list: out })); } catch (e) { } }
    }
    setInterval(scanMissions, 2500);
    const pendingMissions = () => { try { return (JSON.parse(localStorage.getItem(MS_KEY) || '{}').list || []).filter(x => !x.done && x.n > x.c); } catch (e) { return []; } };
    let metaSel = -1;
    const allTargets = L => { const nf = L.filter(x => !x.fac); return (nf.length ? nf : L).slice().sort((a, b) => (a.n - a.c) - (b.n - b.c)); };
    const meta = { on: false, done: 0, seen: new Set(), targets: [] };
    const metaKey = st => { const c = st.p != null ? st.p : st.pg; return c == null ? null : location.pathname + '#' + c; };
    function metaPaint() {
        const l = document.getElementById('ink-meta-lbl'), v = document.getElementById('ink-meta-val');
        if (l) l.textContent = meta.on ? `${meta.done}/${cfg.metaGoal} págs` + (meta.targets.length ? ` · ✓${meta.targets.filter(x => meta.done >= x.r).length}/${meta.targets.length}` : '') : 'Ligar meta';
        if (v) v.textContent = cfg.metaGoal;
        const pl = document.getElementById('ink-meta-pick-lbl');
        if (pl) {
            const L = pendingMissions(), x = L[metaSel];
            const short = t => (t.replace(/^ler\s+\d+\s+p[aá]ginas\s*/i, '').replace(/\s+hoje$/i, '') || 'qualquer HQ');
            const txt = (metaSel >= 0 && metaSel === L.length) ? `Todas (${allTargets(L).length}) · ${cfg.metaGoal} págs` : x ? `${x.fac ? '🏰 ' : ''}Faltam ${x.n - x.c} · ${short(x.t)}` : (L.length ? `Escolher missão (${L.length} pendentes)` : 'Abra o painel do evento p/ ler missões');
            pl.textContent = txt; pl.title = txt;
        }
        sw('ink-meta-btn', meta.on);
    }
    function metaToggle() {
        if (meta.on) { meta.on = false; metaPaint(); setSt('Meta desligada.'); return; }
        meta.on = true; meta.done = 0; meta.seen.clear();
        { const L = pendingMissions(); meta.targets = (metaSel >= 0 && metaSel === L.length) ? allTargets(L).map(x => ({ t: x.t, r: x.n - x.c })) : []; }
        const k = metaKey(readState()); if (k) meta.seen.add(k);
        metaPaint();
        if (!running) loop();
    }
    function metaGoalStep(d) { cfg.metaGoal = Math.max(1, Math.min(300, (cfg.metaGoal || 10) + d)); save(); metaPaint(); }
    function metaTick() {
        if (!meta.on || !running) return;
        const k = metaKey(readState());
        if (!k || meta.seen.has(k)) return;
        meta.seen.add(k); meta.done++;
        if (meta.done >= cfg.metaGoal) {
            meta.on = false;
            const fac = pendingMissions().some(x => x.fac) ? ' Missões de facção: leia HQs do herói da sua facção.' : '';
            finish(`✓ Meta cumprida: ${meta.done} páginas lidas.${fac} Abra o painel do evento para atualizar.`);
        }
        metaPaint();
    }
    setInterval(metaTick, 500);

    /* =====================================================================
       MÚSICA — Drive via Apps Script
       ===================================================================== */
    const MUS = { list: [], cur: -1, a: null, blob: null, shuffle: false, tab: 'read', synced: false };
    const MUS_LS = 'ink_music_list';
    try { MUS.list = JSON.parse(localStorage.getItem(MUS_LS) || '[]'); } catch (e) { }
    const musVolNow = () => cfg.musicVol == null ? 0.6 : cfg.musicVol;
    const musSt = t => { const s = document.getElementById('ink-mus-st'); if (s && s.textContent !== t) s.textContent = t; };
    async function musApi(action, data) {
        if (!cfg.musicUrl) throw new Error('Toque em "Drive" e cole a URL do app da web.');
        const r = await fetch(cfg.musicUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, key: cfg.musicKey || '', ...data })
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.err || 'erro no Drive');
        return j;
    }
    function musSetList(l) {
        MUS.list = l || [];
        try { localStorage.setItem(MUS_LS, JSON.stringify(MUS.list)); } catch (e) { }
        musPaintList();
    }
    async function musSync(full) {
        try {
            musSt('☁ Sincronizando…');
            const j = await musApi(full ? 'sync' : 'list');
            musSetList(j.list);
            musSt('☁ ' + j.list.length + ' faixa(s)' + (j.added ? ' · +' + j.added + ' nova(s)' : ''));
        } catch (e) { musSt('⚠ ' + (e.message || e)); }
    }
    function musAudio() {
        if (!MUS.a) {
            const a = new Audio();
            a.preload = 'auto'; a.volume = musVolNow();
            a.addEventListener('ended', () => musNext(1));
            a.addEventListener('play', musPaintBtn);
            a.addEventListener('pause', musPaintBtn);
            MUS.a = a;
        }
        return MUS.a;
    }
    function musDuck(on) {
        const a = MUS.a;
        if (!a || !a.src || a.paused) return;
        if (on) {
            if (a._ducked) return;
            a._ducked = true;
            a._preVol = a.volume;
            a.volume = Math.min(a.volume, 0.12);
        } else if (a._ducked) {
            a._ducked = false;
            a.volume = a._preVol != null ? a._preVol : musVolNow();
            a._preVol = null;
        }
    }
    const MUS_DB = 'ink_music_cache', MUS_MAX = 8;
    function musIdb() {
        return new Promise((res, rej) => {
            try {
                const r = indexedDB.open(MUS_DB, 1);
                r.onupgradeneeded = () => r.result.createObjectStore('t', { keyPath: 'fid' });
                r.onsuccess = () => res(r.result);
                r.onerror = () => rej(r.error);
            } catch (e) { rej(e); }
        });
    }
    async function musCacheGet(fid) {
        try {
            const db = await musIdb();
            return await new Promise(res => {
                const q = db.transaction('t').objectStore('t').get(fid);
                q.onsuccess = () => res(q.result || null);
                q.onerror = () => res(null);
            });
        } catch (e) { return null; }
    }
    async function musCachePut(fid, blob) {
        try {
            const db = await musIdb();
            const all = await new Promise(res => {
                const q = db.transaction('t').objectStore('t').getAll();
                q.onsuccess = () => res(q.result || []);
                q.onerror = () => res([]);
            });
            const tx = db.transaction('t', 'readwrite'), st = tx.objectStore('t');
            all.filter(x => x.fid !== fid).sort((a, b) => a.at - b.at)
                .slice(0, Math.max(0, all.length - (MUS_MAX - 1))).forEach(x => st.delete(x.fid));
            st.put({ fid, blob, at: Date.now() });
        } catch (e) { }
    }
    function musKeep(fid) { musCacheGet(fid).then(r => { if (r) musCachePut(fid, r.blob); }); }
    async function musPlay(i) {
        const t = MUS.list[i];
        if (!t) return;
        const a = musAudio();
        MUS.cur = i; musPaintList();
        try {
            let src = t.url;
            if (t.fid) {
                let blob = null;
                const hit = await musCacheGet(t.fid);
                if (hit && hit.blob) { blob = hit.blob; musKeep(t.fid); }
                else {
                    musSt('⏳ Baixando do Drive…');
                    const j = await musApi('file', { fid: t.fid });
                    if (MUS.cur !== i) return;
                    const bin = atob(j.b64), u8 = new Uint8Array(bin.length);
                    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
                    blob = new Blob([u8], { type: j.mime || 'audio/mpeg' });
                    musCachePut(t.fid, blob);
                }
                if (MUS.cur !== i) return;
                if (MUS.blob) URL.revokeObjectURL(MUS.blob);
                MUS.blob = URL.createObjectURL(blob);
                src = MUS.blob;
            }
            a.src = src;
            await a.play();
            MUS.fail = 0;
            musSt('🎵 ' + t.title);
        } catch (e) {
            if (MUS.cur !== i) return;
            if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
                MUS.fail = 0; musSt('⚠ Toque em ▶ para tocar (o navegador bloqueou o início automático).'); return;
            }
            MUS.fail = (MUS.fail || 0) + 1;
            if (MUS.list.length > 1 && MUS.fail < MUS.list.length) {
                musSt('⚠ ' + (e.message || e) + ' — pulando…');
                setTimeout(() => { if (MUS.cur === i) musNext(1); }, 1200);
            } else { MUS.fail = 0; musSt('⚠ ' + (e.message || e)); }
        }
    }
    function musNext(d) {
        const n = MUS.list.length;
        if (!n) return;
        if (MUS.shuffle && n > 1) {
            let j;
            do { j = Math.floor(Math.random() * n); } while (j === MUS.cur);
            musPlay(j); return;
        }
        const base = MUS.cur < 0 ? (d > 0 ? -1 : 0) : MUS.cur;
        musPlay(((base + d) % n + n) % n);
    }
    function musToggle() {
        const a = musAudio();
        if (!a.src) {
            if (MUS.list.length) musPlay(Math.max(0, MUS.cur));
            else musSt('Lista vazia. Coloque áudios na pasta do Drive e toque em Sincronizar.');
            return;
        }
        if (a.paused) a.play().catch(() => { }); else a.pause();
    }
    function musVol(d) {
        cfg.musicVol = Math.min(1, Math.max(0, Math.round((musVolNow() + d) * 10) / 10));
        save();
        if (MUS.a) {
            if (MUS.a._ducked) MUS.a._preVol = cfg.musicVol;
            else MUS.a.volume = cfg.musicVol;
        }
        musPaintBtn();
    }
    function musPaintBtn() {
        const playing = !!(MUS.a && !MUS.a.paused && MUS.a.src);
        const p = document.getElementById('ink-mus-play');
        if (p) {
            p.classList.toggle('on', playing);
            p.innerHTML = '<span style="font-size:15px">' + (playing ? '⏸' : '▶') + '</span><span>' + (playing ? 'Pausar' : 'Tocar') + '</span>';
        }
        const s = document.getElementById('ink-mus-shuf');
        if (s) s.classList.toggle('on', MUS.shuffle);
        const v = document.getElementById('ink-mus-vol');
        if (v) v.textContent = Math.round(musVolNow() * 100) + '%';
    }
    function musPaintList() {
        const box = document.getElementById('ink-mus-list');
        if (!box) return;
        box.textContent = '';
        if (!MUS.list.length) { box.textContent = 'Nenhuma faixa ainda.'; return; }
        MUS.list.forEach((t, i) => {
            const row = document.createElement('div');
            row.className = 'ia-trk' + (i === MUS.cur ? ' on' : '');
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'ia-trk-t'; b.textContent = t.title; b.title = t.title;
            b.onclick = () => musPlay(i);
            const x = document.createElement('button');
            x.type = 'button'; x.className = 'ia-trk-x'; x.textContent = '×'; x.title = 'Remover da lista (não apaga do Drive)';
            x.onclick = async () => {
                try {
                    const j = await musApi('del', { id: t.id });
                    if (MUS.cur === i) {
                        MUS.cur = -1;
                        if (MUS.a) { MUS.a.pause(); MUS.a.removeAttribute('src'); MUS.a.load(); musPaintBtn(); }
                    } else if (MUS.cur > i) { MUS.cur--; }
                    musSetList(j.list);
                } catch (e) { musSt('⚠ ' + (e.message || e)); }
            };
            row.append(b, x);
            box.appendChild(row);
        });
    }

    /* =====================================================================
       BUILD PAINEL
       ===================================================================== */
    const PANEL_HTML = `
<div class="ia-head" id="ink-auto-head">
  <div class="ia-logo">${ICO.book}</div>
  <div class="ia-title" id="ink-auto-title">Leitura automática ${INK_VERSION}</div>
  <button class="ia-ib" id="ink-auto-mini-go" type="button" title="Ler sozinho">${ICO.play}</button>
  <button class="ia-ib" id="ink-auto-min" type="button" title="minimizar">${ICO.down}</button>
</div>
<div id="ink-auto-body">
  <div class="ia-st" id="ink-auto-st"></div>
  <div class="ia-main">
    <button id="ink-auto-go" type="button">${ICO.play}<span>Ler sozinho</span></button>
    <div class="ia-step"><button id="ink-auto-spm" type="button">−</button><span class="ia-val" id="ink-auto-sp">1×</span><button id="ink-auto-spp" type="button">+</button></div>
  </div>
  <div class="ia-chips">
    <button class="ia-chip" id="ink-auto-manga" type="button">${ICO.book}<span>Mangá</span></button>
    <button class="ia-chip" id="ink-auto-next" type="button">✓<span>Próximo auto</span></button>
    <button class="ia-chip" id="ink-voice-btn" type="button">${ICO.voice}<span>Voz</span></button>
  </div>
  <div class="ia-sub dim" id="ink-voice-combo">
    <button class="ia-row" id="ink-voice-cycle" type="button"><span class="ia-lbl" id="ink-voice-name">—</span></button>
    <div class="ia-step"><button id="ink-voice-m" type="button">−</button><span class="ia-val" id="ink-voice-sp">1×</span><button id="ink-voice-p" type="button">+</button></div>
  </div>
  <div class="ia-sec">Aparência</div>
  <button class="ia-row" id="ink-gender-btn" type="button"><span class="ia-ico">👧</span><span class="ia-lbl" id="ink-gender-lbl">Menina</span></button>
  <div class="ia-skins">
    <div class="ia-skin-btns">
      ${SKINS.map(k => `<button class="ia-skin" type="button" data-skin="${k.id}">${k.emo}<span>${k.nome}</span></button>`).join('')}
    </div>
  </div>
  <div class="ia-sec">Conforto</div>
  <button class="ia-row" id="ink-eye-btn" type="button"><span class="ia-ico">🌙</span><span class="ia-lbl">Olho descanso</span><span id="ink-eye-lvl" class="ia-ico">25%</span></button>
  <div class="ia-sub" id="ink-eye-sub">
    <div class="ia-step"><button id="ink-eye-m" type="button">−</button><span class="ia-val" id="ink-eye-cur">25%</span><button id="ink-eye-p" type="button">+</button></div>
  </div>
  <div class="ia-sec">Desempenho</div>
  <button class="ia-row" id="ink-perf-btn" type="button"><span class="ia-ico">⚡</span><span class="ia-lbl">Modo leve</span></button>
  <button class="ia-row" id="ink-anx-btn" type="button"><span class="ia-ico">🧠</span><span class="ia-lbl">Ansiedade</span></button>
  <div class="ia-sec">Missão</div>
  <button class="ia-row" id="ink-meta-btn" type="button"><span class="ia-ico">🎯</span><span class="ia-lbl" id="ink-meta-lbl">Ligar meta</span></button>
  <div class="ia-sub">
    <button class="ia-row" id="ink-meta-pick" type="button"><span class="ia-lbl" id="ink-meta-pick-lbl">Escolher missão</span></button>
    <div class="ia-step"><button id="ink-meta-m" type="button">−</button><span class="ia-val" id="ink-meta-val">10</span><button id="ink-meta-p" type="button">+</button></div>
  </div>
</div>`;

    function buildPanel() {
        if (document.getElementById('ink-auto-ui')) return;
        const u = document.createElement('div');
        u.id = 'ink-auto-ui';
        if (MOBILE) u.classList.add('mob');
        if (cfg.min) u.classList.add('min');
        u.innerHTML = PANEL_HTML;
        if (!cfg.pos) {
            u.style.bottom = '12px'; u.style.right = '12px';
        }
        (document.body || document.documentElement).appendChild(u);

        // handlers
        const $ = id => u.querySelector('#' + id);
        $('ink-auto-go').onclick = toggle;
        $('ink-auto-mini-go').onclick = toggle;
        $('ink-auto-min').onclick = () => { cfg.min = !cfg.min; save(); applyMin(); };
        $('ink-auto-spm').onclick = () => setSpeed(-1);
        $('ink-auto-spp').onclick = () => setSpeed(1);
        $('ink-auto-manga').onclick = () => {
            cfg.manga = !cfg.manga;
            ORD.dir = cfg.manga ? 'manga' : 'west';
            ordSave(); save();
            if (document.getElementById('ink-ord-bar')) ordApply();
            refreshBtn(); ordPaint();
        };
        $('ink-auto-next').onclick = () => { cfg.auto = !cfg.auto; save(); refreshBtn(); };
        $('ink-voice-btn').onclick = toggleVoice;
        $('ink-voice-cycle').onclick = cycleVoice;
        $('ink-voice-m').onclick = () => setVRate(-1);
        $('ink-voice-p').onclick = () => setVRate(1);
        $('ink-gender-btn').onclick = () => { cfg.girl = !cfg.girl; save(); applyTheme(); };
        u.querySelectorAll('[data-skin]').forEach(b => {
            b.onclick = () => { cfg.skin = b.dataset.skin; save(); applyTheme(); };
        });
        $('ink-eye-btn').onclick = toggleEye;
        $('ink-eye-m').onclick = () => setEyeLvl(-0.05);
        $('ink-eye-p').onclick = () => setEyeLvl(0.05);
        $('ink-perf-btn').onclick = () => { cfg.perf = !isPerf(); save(); refreshBtn(); };
        $('ink-anx-btn').onclick = () => {
            cfg.anx = ((cfg.anx | 0) + 1) % 3;
            save(); refreshBtn(); setSt(ANX_LBL[cfg.anx]);
        };
        $('ink-meta-btn').onclick = metaToggle;
        $('ink-meta-m').onclick = () => metaGoalStep(-1);
        $('ink-meta-p').onclick = () => metaGoalStep(1);
        $('ink-meta-pick').onclick = () => {
            const L = pendingMissions();
            if (!L.length) { setSt('Sem missões pendentes. Abra o painel do evento uma vez.'); return; }
            metaSel = (metaSel + 1) % (L.length + 1);
            if (metaSel === L.length) cfg.metaGoal = Math.max(1, ...allTargets(L).map(x => x.n - x.c));
            else cfg.metaGoal = Math.max(1, L[metaSel].n - L[metaSel].c);
            save(); metaPaint();
        };

        // arrastar cabeçalho
        const head = $('ink-auto-head');
        let drag = null;
        const onDown = e => {
            if (e.target.closest('button')) return;
            const p = e.touches ? e.touches[0] : e;
            const r = u.getBoundingClientRect();
            drag = { ox: p.clientX - r.left, oy: p.clientY - r.top };
            e.preventDefault();
        };
        const onMove = e => {
            if (!drag) return;
            const p = e.touches ? e.touches[0] : e;
            const x = Math.max(0, Math.min(innerWidth - u.offsetWidth, p.clientX - drag.ox));
            const y = Math.max(0, Math.min(innerHeight - u.offsetHeight, p.clientY - drag.oy));
            u.style.left = x + 'px'; u.style.top = y + 'px'; u.style.bottom = 'auto'; u.style.right = 'auto';
            cfg.pos = { x, y };
        };
        const onUp = () => { if (drag) { drag = null; save(); } };
        head.addEventListener('mousedown', onDown);
        head.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);

        // marcar interação do usuário (pausa leitura)
        u.addEventListener('pointerdown', () => { lastUser = Date.now(); });
        document.addEventListener('keydown', () => { lastUser = Date.now(); });

        refreshBtn(); applyTheme(); applyMin(); applyEye(); metaPaint();
    }

    /* =====================================================================
       INIT
       ===================================================================== */
    function init() {
        injectCSS();
        buildPanel();
        applyPos();
        buildOrderBar();
        // SPA: tenta de novo nos primeiros ~15s
        let ordTries = 0;
        const ordWatch = setInterval(() => {
            if (document.getElementById('ink-ord-bar')) { clearInterval(ordWatch); return; }
            if (++ordTries > 30) { clearInterval(ordWatch); return; }
            buildOrderBar();
        }, 500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
