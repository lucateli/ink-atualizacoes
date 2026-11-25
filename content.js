// ==UserScript==
// @name         Ink Leitor
// @namespace    ink-leitor
// @version      4.0.0
// @description  Leitor automático, OCR, TTS e ordenador mangá/HQ para ink.app.br
// @match        https://www.ink.app.br/*
// @match        https://ink.app.br/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// @downloadURL  https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// ==/UserScript==
(() => {
    'use strict';
    if (window.__ink) return;
    window.__ink = true;

    const VERSION = '4.0.0';
    const IS_MOBILE = (() => {
        try { return matchMedia('(pointer:coarse)').matches || innerWidth < 700; }
        catch (e) { return innerWidth < 700; }
    })();

    /* ================================================================== *
     *  1. UTILS
     * ================================================================== */
    const $ = id => document.getElementById(id);
    const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

    /* ================================================================== *
     *  2. CONFIG
     * ================================================================== */
    const CFG_KEY = 'ink_cfg_v4';
    const DEFAULTS = {
        speed: 1.5, auto: true, voice: false, vrate: 1, vname: '',
        manga: false, method: '', methodM: '',
        girl: true, skin: 'gato',
        eye: false, eyeLvl: 0.25,
        perf: null, anx: 0, metaGoal: 10,
        pos: null, min: false,
        musicUrl: '', musicKey: '', musicVol: 0.6,
    };
    const cfg = { ...DEFAULTS };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { }

    let _saveT;
    const saveCfg = () => { clearTimeout(_saveT); _saveT = setTimeout(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }, 150); };
    const isPerf = () => cfg.perf == null ? IS_MOBILE : !!cfg.perf;

    const SKINS = [
        { id: 'gato', nome: 'Gatinha', emo: '🐱' },
        { id: 'lobo', nome: 'Lobo', emo: '🐺' },
    ];
    const curSkin = () => SKINS.find(s => s.id === cfg.skin) || SKINS[0];

    const setStatus = msg => { const el = $('ink-status'); if (el && el.textContent !== msg) el.textContent = msg; };

    /* ================================================================== *
     *  3. ANDROID POPUP FIX
     * ================================================================== */
    (() => {
        const KEY = 'serei sempre legal';
        const LOCKS = new Set(['modal-open', 'no-scroll', 'locked', 'overflow-hidden', 'is-locked', 'scroll-lock', 'blur']);
        const MINE = '#ink-panel,#ink-eye,#ink-order,#ink-dbg';
        let popupAt = 0, timer = 0, lastRun = 0;

        const isMine = el => !!(el && el.closest && el.closest(MINE));

        const findPopup = () => {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: n => {
                    const p = n.parentElement;
                    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = w.nextNode())) {
                if (n.nodeValue && n.nodeValue.toLowerCase().includes(KEY) && !isMine(n.parentElement)) return n.parentElement;
            }
            return null;
        };

        const containerOf = hit => {
            const ui = $('ink-panel');
            let best = null, el = hit;
            for (let i = 0; el && el !== document.body && i < 12; i++, el = el.parentElement) {
                if (ui && el.contains(ui)) break;
                if (el.querySelector && el.querySelector('canvas,video,.comic-page,.bz-order')) break;
                if (el.querySelectorAll && el.querySelectorAll('img').length > 3) break;
                let pos = '';
                try { pos = getComputedStyle(el).position; } catch (e) { }
                if (el.tagName === 'DIALOG' || el.getAttribute('role') === 'dialog' || el.getAttribute('aria-modal') === 'true' || pos === 'fixed') best = el;
            }
            if (best) return best;
            for (el = hit; el && el !== document.body; el = el.parentElement) {
                if (el.tagName === 'DIV' || el.tagName === 'SECTION') return el;
            }
            return null;
        };

        const isDark = c => {
            const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || '');
            if (!m) return false;
            const a = m[4] == null ? 1 : parseFloat(m[4]);
            return a >= 0.3 && (+m[1] + +m[2] + +m[3]) < 120;
        };

        const killBackdrops = () => {
            $$('body > *, body > * > *').forEach(el => {
                if (isMine(el) || el.childElementCount > 0 || (el.textContent || '').trim()) return;
                let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
                if (cs.position !== 'fixed' || !isDark(cs.backgroundColor)) return;
                const r = el.getBoundingClientRect();
                if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) el.remove();
            });
        };

        const unlock = () => {
            [document.documentElement, document.body].forEach(el => {
                const s = el.style;
                if (/hidden|clip/.test(s.overflow + ' ' + s.overflowY)) { s.removeProperty('overflow'); s.removeProperty('overflow-y'); }
                if (s.pointerEvents === 'none') s.removeProperty('pointer-events');
                if (s.touchAction === 'none') s.removeProperty('touch-action');
                if (s.filter && /blur/.test(s.filter)) s.removeProperty('filter');
                if (typeof el.className === 'string' && el.className) {
                    const keep = el.className.split(/\s+/).filter(t => t && !LOCKS.has(t.toLowerCase()));
                    const nc = keep.join(' ');
                    if (nc !== el.className.trim()) el.className = nc;
                }
            });
            if (document.body.style.position === 'fixed') {
                const top = parseInt(document.body.style.top || '0', 10) || 0;
                ['position', 'top', 'width', 'left', 'right'].forEach(p => document.body.style.removeProperty(p));
                try { scrollTo(0, -top); } catch (e) { }
            }
        };

        const tick = () => {
            const hit = findPopup();
            if (hit) {
                const box = containerOf(hit);
                if (box) { box.remove(); popupAt = Date.now(); }
            }
            if (Date.now() - popupAt < 6000) { killBackdrops(); unlock(); }
        };

        const schedule = () => {
            if (timer) return;
            timer = setTimeout(() => { timer = 0; lastRun = Date.now(); try { tick(); } catch (e) { } },
                Math.max(50, 600 - (Date.now() - lastRun)));
        };

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

    /* ================================================================== *
     *  4. DETECÇÃO DE ESTADO (balão/página)
     * ================================================================== */
    const RX_CTR = /^\s*(\d+)\s*\/\s*(\d+)\s*[·•|-]\s*(\d+)\s*\/\s*(\d+)\s*$/;
    const RX_PG = /^\s*(\d+)\s*\/\s*(\d+)\s*$/;
    const RX_PCT = /^\s*(\d{1,3})\s*%\s*$/;
    const _cache = { ctr: null, pg: null, pct: null, t: 0 };
    const _bad = new WeakSet();
    let _frozen = 0;

    const visible = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 120 && r.width < 320; };
    const sane = {
        ctr: m => +m[1] >= 1 && +m[1] <= +m[2] && +m[3] >= 1 && +m[3] <= +m[4],
        pg: m => +m[2] > 1 && +m[1] >= 1 && +m[1] <= +m[2],
        pct: m => +m[1] >= 0 && +m[1] <= 100
    };

    const scanState = () => {
        const mine = $('ink-panel');
        let c = null, g = null, p = null;
        for (const n of $$('div,span,p,button')) {
            if (n.childElementCount > 3 || (mine && mine.contains(n)) || _bad.has(n) || !visible(n)) continue;
            const t = n.textContent;
            if (!t || t.length > 30) continue;
            let m;
            if ((m = RX_CTR.exec(t)) && sane.ctr(m)) { if (!c || c.contains(n)) c = n; }
            else if ((m = RX_PG.exec(t)) && sane.pg(m)) { if (!g || g.contains(n)) g = n; }
            else if ((m = RX_PCT.exec(t)) && sane.pct(m)) { if (!p || p.contains(n)) p = n; }
        }
        if (c && g && c.contains(g)) g = null;
        _cache.ctr = c; _cache.pg = g; _cache.pct = p;
    };

    const stale = (el, rx) => !el || !el.isConnected || !rx.test(el.textContent || '') || !visible(el);

    const camSig = () => {
        let list;
        try { list = document.elementsFromPoint(innerWidth / 2, innerHeight * 0.45); } catch (e) { return ''; }
        const out = [];
        const maxN = isPerf() ? 2 : 5;
        for (const e of list) {
            if (e === document.documentElement || e === document.body || e.closest('#ink-panel,#ink-eye')) continue;
            const r = e.getBoundingClientRect();
            if (isPerf()) out.push(`${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}`);
            else {
                const cs = getComputedStyle(e);
                out.push(`${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0},${cs.transform},${cs.backgroundPosition},${cs.objectPosition}`);
            }
            if (out.length >= maxN) break;
        }
        return out.join(';') + `|${scrollX | 0},${scrollY | 0}`;
    };

    const readState = () => {
        const now = performance.now();
        const reScanMs = isPerf() ? 2800 : 1500;
        const bad = (_cache.ctr && stale(_cache.ctr, RX_CTR)) || (_cache.pg && stale(_cache.pg, RX_PG)) || (_cache.pct && stale(_cache.pct, RX_PCT));
        const none = !_cache.ctr && !_cache.pg && !_cache.pct;
        if ((bad && now - _cache.t > reScanMs) || (none && now - _cache.t > reScanMs * 3) || now - _cache.t > 8000) {
            scanState(); _cache.t = now;
        }
        const o = {};
        let m;
        if (_cache.ctr && (m = RX_CTR.exec(_cache.ctr.textContent)) && sane.ctr(m)) { o.b = +m[1]; o.bt = +m[2]; o.p = +m[3]; o.pt = +m[4]; }
        if (_cache.pg && (m = RX_PG.exec(_cache.pg.textContent)) && sane.pg(m)) { o.pg = +m[1]; o.pgt = +m[2]; }
        if (_cache.pct && (m = RX_PCT.exec(_cache.pct.textContent)) && sane.pct(m)) { o.pct = +m[1]; }
        o.cam = camSig();
        o.sig = [o.b, o.bt, o.p, o.pt, o.pg, o.pgt, o.pct, o.cam].join('|');
        return o;
    };
    const atEnd = st => st.p != null && st.p === st.pt && st.b === st.bt;
    const nearEnd = st => atEnd(st) || (st.pg != null && st.pg === st.pgt) || (st.pct != null && st.pct >= 98);
    const stateLabel = st => st.b != null ? `balão ${st.b}/${st.bt} · pág ${st.p}/${st.pt}` : (st.pg != null ? `pág ${st.pg}/${st.pgt}` : (st.pct != null ? `${st.pct}%` : 'lendo'));

    /* ================================================================== *
     *  5. NAVEGAÇÃO (métodos de avançar)
     * ================================================================== */
    const sendKey = (k, code, kc) => {
        const t = document.activeElement || document.body;
        const o = { key: k, code, keyCode: kc, which: kc, bubbles: true, cancelable: true };
        t.dispatchEvent(new KeyboardEvent('keydown', o));
        t.dispatchEvent(new KeyboardEvent('keyup', o));
        return true;
    };

    const stageRect = () => {
        let e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.45);
        while (e && e !== document.body) {
            const r = e.getBoundingClientRect();
            if (r.width > 300 && r.width < innerWidth * 0.9 && r.height > 300) return r;
            e = e.parentElement;
        }
        return { left: innerWidth * .05, width: innerWidth * .9, top: innerHeight * .2, height: innerHeight * .5 };
    };

    const clickAt = (x, y) => {
        const t = document.elementFromPoint(x, y) || document.body;
        const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window, button: 0 };
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(tp => {
            t.dispatchEvent(tp.startsWith('pointer') ? new PointerEvent(tp, { ...o, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(tp, o));
        });
        return true;
    };

    const swipe = dir => {
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
    };

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
            const b = $$('button,[role=button]').find(x =>
                /pr[oó]xim|avan[cç]|next|seguinte/i.test((x.getAttribute('aria-label') || '') + ' ' + (x.title || '')) && !x.closest('#ink-panel'));
            if (b) { b.click(); return true; }
            return false;
        }
    };
    const WEST = ['ArrowRight', 'clickDir', 'swipeL'];
    const MANGA = ['ArrowLeft', 'clickEsq', 'swipeR'];

    /* ================================================================== *
     *  6. ORDER BAR — ordenação de mangá/HQ
     * ================================================================== */
    const OrderBar = (() => {
        const KEY = 'ink_ord_cfg';
        const CAP_LINK = 'a[href*="/ler/"],a[href*="/capitulo/"],a[href*="/cap/"],a[href*="/chapter/"]';
        const RX_NUM = /(?:capitulo|cap|ch|chapter|ler|ep)[\-\/]?(\d+(?:[.,]\d+)?)/i;
        const state = { mode: 'asc', dir: 'west', orig: new WeakMap() };
        try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); if (j.mode) state.mode = j.mode; if (j.dir) state.dir = j.dir; } catch (e) { }

        const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode: state.mode, dir: state.dir })); } catch (e) { } };
        const status = t => { const el = $('ink-order-status'); if (el && el.textContent !== t) el.textContent = t; };

        function findContainer() {
            const links = $$(CAP_LINK);
            if (links.length < 2) return null;
            const counts = new Map();
            links.forEach(a => { if (a.parentElement) counts.set(a.parentElement, (counts.get(a.parentElement) || 0) + 1); });
            let best = null, max = 1;
            counts.forEach((n, p) => { if (n > max) { max = n; best = p; } });
            return best;
        }

        function chapterNum(href) {
            try {
                const u = new URL(href, location.href);
                const m = RX_NUM.exec(u.pathname + u.search);
                if (m) return parseFloat(m[1].replace(',', '.'));
                const nums = (u.pathname + u.search).match(/\d+(?:[.,]\d+)?/g);
                if (nums) return parseFloat(nums[nums.length - 1].replace(',', '.'));
            } catch (e) { }
            return 0;
        }

        function collectItems(box) {
            const links = $$(CAP_LINK, box);
            const out = [], seen = new Set();
            links.forEach(a => {
                let item = a;
                for (let i = 0; i < 5; i++) {
                    if (!item.parentElement || item.parentElement === box || item.parentElement === document.body) break;
                    item = item.parentElement;
                    if ($$(CAP_LINK, item).length > 1) { item = item.firstElementChild || a; break; }
                }
                if (seen.has(item)) return;
                seen.add(item);
                out.push({ el: item, num: chapterNum(a.getAttribute('href') || ''), href: (a.getAttribute('href') || '').split('?')[0] });
            });
            return out;
        }

        function apply() {
            const box = findContainer();
            if (!box) { status('⚠ Lista de capítulos não encontrada'); return false; }
            const items = collectItems(box);
            if (!items.length) { status('⚠ Lista vazia'); return false; }
            if (!state.orig.has(box)) state.orig.set(box, items.map(x => x.el));

            const sorted = items.slice();
            if (state.mode === 'asc') sorted.sort((a, b) => a.num - b.num);
            else if (state.mode === 'desc') sorted.sort((a, b) => b.num - a.num);
            else { const o = state.orig.get(box); sorted.sort((a, b) => o.indexOf(a.el) - o.indexOf(b.el)); }

            const frag = document.createDocumentFragment();
            sorted.forEach(it => frag.appendChild(it.el));
            box.appendChild(frag);

            if (state.dir === 'manga') { box.style.direction = 'rtl'; box.style.flexDirection = 'row-reverse'; }
            else { box.style.direction = ''; box.style.flexDirection = ''; }

            cfg.manga = state.dir === 'manga';
            saveCfg();
            status(`✓ ${modeLabel()} · ${dirLabel()}`);
            paint();
            return true;
        }

        function clean() {
            const box = findContainer();
            if (!box) { status('⚠ Lista não encontrada'); return false; }
            const items = collectItems(box);
            const seen = new Set();
            let removed = 0;
            for (const it of items) {
                const k = it.href.replace(/\/$/, '');
                if (seen.has(k)) { it.el.remove(); removed++; } else seen.add(k);
            }
            status(`✓ ${removed} duplicata(s) removida(s)`);
            return true;
        }

        function reset() {
            const box = findContainer();
            if (!box) { status('⚠ Lista não encontrada'); return false; }
            const o = state.orig.get(box);
            if (!o || !o.length) { status('⚠ Sem ordem salva — recarregue a página'); return false; }
            for (const el of o) { try { el.isConnected && box.appendChild(el); } catch (e) { } }
            box.style.direction = ''; box.style.flexDirection = '';
            state.mode = 'orig';
            save();
            status('✓ Ordem original restaurada');
            return true;
        }

        function cycleMode() {
            state.mode = state.mode === 'asc' ? 'desc' : state.mode === 'desc' ? 'orig' : 'asc';
            save(); apply(); paint();
        }

        const modeLabel = () => ({ asc: 'Crescente', desc: 'Decrescente', orig: 'Original' }[state.mode] || 'Ordenar');
        const dirLabel = () => state.dir === 'manga' ? 'Mangá (dir→esq)' : 'Ocidental (esq→dir)';

        function paint() {
            const bar = $('ink-order');
            if (!bar) return;
            const pb = bar.querySelector('[data-ord="sort"] span');
            if (pb) pb.textContent = modeLabel();
            bar.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('on', b.dataset.dir === state.dir));
        }

        function build() {
            if ($('ink-order')) return;
            if (!location.pathname.startsWith('/ler/') && !/(manga|manhwa|hq|comic|obra|capitulo)/i.test(location.pathname)) return;
            const box = findContainer();
            if (!box || collectItems(box).length < 2) return;

            const bar = document.createElement('div');
            bar.id = 'ink-order';
            bar.innerHTML = `
                <button class="io-pill" data-ord="sort" title="Alternar ordem">${ICO.sort}<span>Ordenar</span></button>
                <button class="io-pill" data-ord="clean" title="Remover duplicatas">${ICO.clean}<span>Limpar</span></button>
                <button class="io-pill" data-ord="reset" title="Ordem original">${ICO.reset}<span>Zerar</span></button>
                <div class="io-seg">
                    <button data-dir="west">Ocidental</button>
                    <button data-dir="manga">Mangá</button>
                </div>`;
            const st = document.createElement('div');
            st.id = 'ink-order-status';

            const parent = box.parentElement || document.body;
            parent.insertBefore(bar, box);
            parent.insertBefore(st, box);

            bar.querySelector('[data-ord="sort"]').onclick = cycleMode;
            bar.querySelector('[data-ord="clean"]').onclick = clean;
            bar.querySelector('[data-ord="reset"]').onclick = reset;
            bar.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => { state.dir = b.dataset.dir; save(); apply(); paint(); });

            paint();
            if (state.mode !== 'orig' || state.dir !== 'west') apply();
        }

        return { build, apply, paint };
    })();

    /* ================================================================== *
     *  7. READER LOOP (motor)
     * ================================================================== */
    let running = false, runId = 0, lastUser = 0;
    const alive = id => running && id === runId;

    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];
    const prog = s => s.b != null ? s.p * 100000 + s.b : (s.pg != null ? s.pg : (s.pct != null ? s.pct : null));

    async function waitChange(before, id, maxMs) {
        const t0 = performance.now(), p0 = prog(before);
        while (performance.now() - t0 < maxMs) {
            await sleep(isPerf() ? 70 : 40);
            if (!alive(id)) return false;
            const s = readState(), pn = prog(s);
            if (p0 != null && pn != null) {
                if (pn > p0) { _frozen = 0; return true; }
                if (s.cam !== before.cam && performance.now() - t0 > 450) {
                    if (++_frozen >= 2) {
                        [_cache.ctr, _cache.pg, _cache.pct].forEach(e => { if (e) _bad.add(e); });
                        _cache.ctr = _cache.pg = _cache.pct = null; _cache.t = 0; _frozen = 0;
                    }
                    return true;
                }
            } else if (s.sig !== before.sig) return true;
        }
        return false;
    }

    async function advancePage(before, onlyLearned, id) {
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
                if (cfg[k] !== name) { cfg[k] = name; saveCfg(); }
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
            if (paused()) { setStatus('⏸ Em pausa…'); continue; }
            if (cfg.auto && now - chk > chkEvery) { chk = now; if (findEndBtn()) return; }
            left -= dt;
            if (now - ui > uiEvery) { ui = now; setStatus(`📖 ${stateLabel(st)} · próximo em ${Math.max(0, left / 1000).toFixed(1)}s`); }
        }
    }

    const visited = new Set();
    const pathOf = h => { try { return new URL(h, location.href).pathname; } catch (e) { return ''; } };
    const RX_END_BTN = /^pr[oó]xima\s+em\s+\d+\s*s$|^pr[oó]ximo\s+cap[ií]tulo$/i;

    function findEndBtn() {
        const mine = $('ink-panel');
        for (const el of $$('button,a,[role=button]')) {
            if (mine && mine.contains(el)) continue;
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length < 40 && RX_END_BTN.test(t) && el.getBoundingClientRect().width > 0) return el;
        }
        return null;
    }

    function findNextEl() {
        const eb = findEndBtn();
        if (eb) return eb;
        const mine = $('ink-panel');
        const ok = el => el && !(mine && mine.contains(el)) && el.getBoundingClientRect().width > 0;
        const usable = a => { const p = pathOf(a.getAttribute('href') || ''); return p !== location.pathname && !visited.has(p); };
        for (const el of $$('a,button,[role=button]')) {
            if (!ok(el)) continue;
            const t = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '');
            if (t.length < 90 && /pr[oó]xim[oa]\s+(cap|edi)|next\s+chapter/i.test(t)) return el;
        }
        let head = null;
        for (const n of $$('div,span,p,h1,h2,h3,h4,section')) {
            if (n.childElementCount > 2) continue;
            if (/^\s*pr[oó]ximas?\s+leituras?\s*$/i.test(n.textContent || '')) { head = n; break; }
        }
        if (!head) return null;
        let box = head.parentElement;
        for (let i = 0; i < 5 && box; i++, box = box.parentElement) {
            const link = $$('a[href*="/ler/"]', box).find(a => ok(a) && usable(a));
            if (link) return link;
            const img = $$('img', box).find(ok);
            if (img) return img.closest('a,button,[role=button]') || img;
        }
        return null;
    }

    async function nextChapter(id, pre) {
        const from = location.pathname;
        visited.add(from);
        await sleep(700);
        const el = pre || findNextEl();
        if (!el) { console.info('[Ink] próximo capítulo não encontrado'); return false; }
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
            if (e === document.documentElement || e === document.body || e.closest('#ink-panel,#ink-eye')) continue;
            const r = e.getBoundingClientRect();
            let tf = ''; try { tf = getComputedStyle(e).transform; } catch (x) { }
            out.push(`${r.top | 0},${r.height | 0},${tf}`);
            if (out.length >= 4) break;
        }
        return out.join(';') + `|${scrollY | 0}`;
    }

    function wheelAt(dy) {
        const r = stageRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        const t = document.elementFromPoint(x, y) || document.body;
        t.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: 0, bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, view: window }));
    }

    const anx = { until: 0, mul: 1, phase: 'calm', phaseUntil: 0, t0: 0, lvl: 0 };
    function anxMul(now) {
        const lvl = cfg.anx | 0;
        if (!lvl) { anx.until = 0; anx.t0 = 0; anx.lvl = 0; return 1; }
        if (anx.lvl !== lvl || !anx.t0) { anx.lvl = lvl; anx.t0 = now; anx.until = 0; anx.phase = 'calm'; anx.phaseUntil = now + rnd(8000, 18000); }
        if (lvl === 1) {
            if (now > anx.phaseUntil) {
                if (anx.phase === 'calm') { anx.phase = 'tense'; anx.phaseUntil = now + rnd(6000, 14000); }
                else { anx.phase = 'calm'; anx.phaseUntil = now + rnd(20000, 45000); }
                anx.until = 0;
            }
            if (now > anx.until) {
                if (anx.phase === 'calm') { anx.mul = rnd(0.92, 1.08); anx.until = now + rnd(1500, 3000); }
                else {
                    const r = Math.random();
                    if (r < 0.5) { anx.mul = rnd(1.4, 1.9); anx.until = now + rnd(800, 2000); }
                    else if (r < 0.8) { anx.mul = rnd(0.3, 0.6); anx.until = now + rnd(400, 900); }
                    else { anx.mul = -rnd(0.6, 1.0); anx.until = now + rnd(250, 450); }
                }
            }
            return anx.mul;
        }
        if (now > anx.until) {
            const r = Math.random();
            if (r < 0.30) { anx.mul = rnd(1.5, 2.3); anx.until = now + rnd(700, 2200); }
            else if (r < 0.58) { anx.mul = rnd(0, 0.12); anx.until = now + rnd(600, 1800); }
            else if (r < 0.78) { anx.mul = -rnd(0.8, 1.6); anx.until = now + rnd(300, 700); }
            else { anx.mul = rnd(0.55, 1.25); anx.until = now + rnd(300, 800); }
        }
        const fadiga = 1 - Math.min(0.3, (now - anx.t0) / 600000);
        return anx.mul * (anx.mul > 0 ? fadiga : 1);
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
                if (now - lastUi > 400) { lastUi = now; setStatus('⏸ Em pausa…'); }
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
                if (mode === 'scroll' && !triedWheel) { triedWheel = true; mode = 'wheel'; lastMove = now; wacc = 0; continue; }
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
            if (now - lastUi > 500) { lastUi = now; setStatus(`${cfg.anx === 2 ? '😰' : cfg.anx === 1 ? '😬' : '📖'} ${stateLabel(readState())} · rolando (${mode})`); }
        }
        return 'cont';
    }

    async function mainLoop() {
        const id = ++runId;
        running = true; refreshPanel(); keepAwake(true);
        let stuck = 0, endFails = 0;
        visited.clear();
        try {
            while (alive(id)) {
                if (cfg.auto) {
                    const eb = findEndBtn();
                    if (eb) {
                        setStatus('✓ Fim do capítulo. Próximo…');
                        if (await nextChapter(id, eb)) { stuck = 0; endFails = 0; continue; }
                        if (!alive(id)) break;
                        if (++endFails >= 3) { finish('✓ Fim, mas "Próxima" não respondeu.'); return; }
                        await sleep(1000); continue;
                    }
                }
                if (!cfg.voice && !smoothOff) {
                    const r = await smoothRun(id);
                    if (!alive(id)) break;
                    if (r === 'cont') continue;
                    if (r === 'end') {
                        for (let i = 0; i < 15 && alive(id) && !(cfg.auto && findEndBtn()); i++) await sleep(200);
                        if (!alive(id)) break;
                        if (cfg.auto && findEndBtn()) continue;
                        if (cfg.auto) {
                            setStatus('✓ Fim. Próximo…');
                            if (await nextChapter(id)) { stuck = 0; continue; }
                            if (!alive(id)) break;
                            finish('✓ Fim, mas próximo cap. não encontrado.'); return;
                        }
                        finish('✓ Chegou ao fim.'); return;
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
                const ok = await advancePage(before, end, id);
                if (!alive(id)) break;
                if (ok) { stuck = 0; continue; }
                if (end) {
                    await sleep(900);
                    if (alive(id) && await advancePage(readState(), true, id)) { stuck = 0; continue; }
                    if (!alive(id)) break;
                    if (cfg.auto) {
                        setStatus('✓ Fim. Próximo…');
                        if (await nextChapter(id)) { stuck = 0; continue; }
                        if (!alive(id)) break;
                        finish('✓ Fim, mas próximo cap. não encontrado.'); return;
                    }
                    finish('✓ Chegou ao fim.'); return;
                }
                if (++stuck >= 3) { finish('Não consegui avançar.'); return; }
            }
        } finally {
            if (id === runId) { running = false; refreshPanel(); keepAwake(false); }
        }
    }

    const finish = msg => { running = false; runId++; cancelSpeech(); musDuck(false); setStatus(msg); refreshPanel(); keepAwake(false); };
    const stop = msg => { if (!running) return; running = false; runId++; cancelSpeech(); musDuck(false); setStatus(msg || 'Parado.'); refreshPanel(); keepAwake(false); };

    let wakeLock = null;
    async function keepAwake(on) {
        try {
            if (on) {
                if (!wakeLock && navigator.wakeLock && !document.hidden) {
                    wakeLock = await navigator.wakeLock.request('screen');
                    wakeLock.addEventListener('release', () => { wakeLock = null; });
                }
            } else if (wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
        } catch (e) { wakeLock = null; }
    }
    document.addEventListener('visibilitychange', () => { if (running && !document.hidden) keepAwake(true); });

    /* ================================================================== *
     *  8. VOZ / TTS
     * ================================================================== */
    const TTS = window.speechSynthesis || null;
    let voices = [];
    const loadVoices = () => { try { voices = TTS ? TTS.getVoices() : []; } catch (e) { voices = []; } };
    if (TTS) { loadVoices(); try { TTS.addEventListener('voiceschanged', () => { loadVoices(); refreshPanel(); }); } catch (e) { } }

    const VRATES = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2];
    const isNatural = v => /natural|neural|online/i.test(v.name);
    function ptVoices() {
        const pt = voices.filter(v => /^pt([-]|$)/i.test(v.lang));
        const br = pt.filter(v => /^pt[-]BR$/i.test(v.lang));
        return (br.length ? br : pt).slice().sort((a, b) => isNatural(b) - isNatural(a));
    }
    const currentVoice = () => { const l = ptVoices(); return l.find(v => v.name === cfg.vname) || l[0] || null; };
    const shortVoice = n => n.replace(/^Microsoft\s+|^Google\s+/i, '').replace(/\s*[-–(].*$/, '').trim() || n;

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

    /* ================================================================== *
     *  9. OCR
     * ================================================================== */
    const OCR = { worker: null, promise: null };
    const ocrBase = () => {
        let b = window.__inkOcrBase || (document.documentElement.dataset && document.documentElement.dataset.inkOcr) || '';
        if (!b) { try { if (chrome && chrome.runtime && chrome.runtime.getURL) b = chrome.runtime.getURL('ocr'); } catch (e) { } }
        return b.replace(/\/$/, '');
    };
    function ocrWorker() {
        if (OCR.worker) return Promise.resolve(OCR.worker);
        if (OCR.promise) return OCR.promise;
        OCR.promise = (async () => {
            if (typeof Tesseract === 'undefined') throw new Error('Tesseract não carregou.');
            setStatus('⏳ Carregando OCR…');
            const base = ocrBase();
            const opts = { logger: () => { }, errorHandler: e => console.warn('[Ink-OCR]', e) };
            if (base) { opts.workerPath = base + '/worker.min.js'; opts.corePath = base; opts.langPath = base; opts.gzip = true; }
            const w = await Tesseract.createWorker('por', 1, opts);
            await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            OCR.worker = w;
            return w;
        })();
        OCR.promise.catch(() => { OCR.promise = null; });
        return OCR.promise;
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
            const t = setTimeout(() => { capWait.delete(id); rej(new Error('captura não respondeu')); }, 5000);
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

    const RX_UI = /leitura\s*autom[aá]tica|modo\s*meninas|audiolivro|pr[oó]ximo\s*cap|conforto|desempenho|mang[aá]\s*:|pausar|ler\s*sozinho|em\s*pausa\s*|aba\s*oculta|voc[eê]\s*mexendo/i;

    function cleanLine(l, relaxed) {
        if (!l || !l.bbox) return null;
        const t = (l.text || '').replace(/[^\p{L}\p{N}\s.,!?…:;'"’“”()–—%-]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (RX_UI.test(t)) return null;
        const letters = (t.match(/\p{L}/gu) || []).length;
        const conf = l.confidence != null ? l.confidence : 100;
        if (letters < 2 || letters < t.length * 0.45 || conf < (relaxed ? 28 : 35)) return null;
        const ws = t.split(' ').filter(w => /\p{L}/u.test(w));
        if (!ws.some(w => w.length >= 2)) return null;
        return { bbox: l.bbox, text: t };
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
        if (up >= 3 && up > 3 * lo) t = t.toLowerCase().replace(/(^|[.!?…]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
        return t.replace(/\.{3,}/g, '…').replace(/([!?])[!?]+/g, '$1');
    }

    async function ocrView() {
        for (let i = 0; i < 3; i++) {
            const t = await ocrOnce();
            if (t) return t;
            if (i < 2) { if (!running) break; await sleep(550); }
        }
        return '';
    }

    async function ocrOnce() {
        const w = await ocrWorker();
        const pe = (() => {
            let list = [];
            try { list = document.elementsFromPoint(innerWidth / 2, innerHeight * 0.45); } catch (e) { }
            for (const e of list) {
                if (e === document.documentElement || e === document.body) break;
                if (e.closest && e.closest('#ink-panel,#ink-eye,#ink-dbg')) continue;
                if (e.tagName === 'IMG' || e.tagName === 'CANVAS') return e;
            }
            return null;
        })();
        const panel = $('ink-panel');
        const eye = $('ink-eye');
        const hidden = [];
        [panel, eye].forEach(el => { if (!el) return; hidden.push({ el, vis: el.style.visibility }); el.style.visibility = 'hidden'; });
        let shot;
        try {
            if (hidden.length) await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            shot = await captureRetry();
        } finally {
            hidden.forEach(({ el, vis }) => { el.style.visibility = vis; });
        }
        const img = new Image(); img.src = shot; await img.decode();
        const kx = img.naturalWidth / innerWidth, ky = img.naturalHeight / innerHeight;
        let x0 = 0, y0 = 0, x1 = innerWidth, y1 = innerHeight;
        if (pe) {
            const r = pe.getBoundingClientRect();
            x0 = Math.max(r.left, 0); y0 = Math.max(r.top, 0); x1 = Math.min(r.right, innerWidth); y1 = Math.min(r.bottom, innerHeight);
        }
        const sx = x0 * kx, sy = y0 * ky, sw = (x1 - x0) * kx, sh = (y1 - y0) * ky;
        const sc = Math.min(4, Math.max(2, 2000 / sw));
        const pad = 16;
        const c = document.createElement('canvas');
        c.width = Math.round(sw * sc) + pad * 2; c.height = Math.round(sh * sc) + pad * 2;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, sx, sy, sw, sh, pad, pad, sw * sc, sh * sc);
        const rr = await w.recognize(c, {}, { blocks: true, text: true });
        const lines = (rr.data.lines || []).map(l => cleanLine(l, true)).filter(Boolean);
        if (!lines.length) return '';
        const cx = (innerWidth / 2 - x0) * kx * sc + pad, cy = (innerHeight * 0.45 - y0) * ky * sc + pad;
        const dist = l => { const b = l.bbox; return Math.hypot(Math.max(b.x0 - cx, 0, cx - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1)); };
        const sorted = lines.slice().sort((a, b) => dist(a) - dist(b));
        const seed = sorted[0];
        const lh = seed.bbox.y1 - seed.bbox.y0;
        const sel = lines.filter(l => {
            const a = l.bbox, b = seed.bbox;
            return Math.abs(a.y0 - b.y0) < lh * 2 || Math.abs(a.y1 - b.y1) < lh * 2;
        });
        return toSpeech(joinLines(sel));
    }

    async function narrate(st, id) {
        try { await narrate0(st, id); }
        finally { musDuck(false); }
    }
    async function narrate0(st, id) {
        musDuck(true);
        while (alive(id) && paused()) { setStatus('⏸ Em pausa…'); await sleep(200); }
        if (!alive(id) || (cfg.auto && findEndBtn())) return;
        await settle(id);
        if (!alive(id)) return;
        setStatus(`🔎 ${stateLabel(st)} · lendo…`);
        let text = '';
        try { text = await ocrView(); }
        catch (e) { if (alive(id)) finish('🎧 Erro: ' + (e.message || e)); return; }
        if (!alive(id)) return;
        if (!text) { setStatus(`🎧 ${stateLabel(st)} · sem texto`); await humanWait(600, st, id); return; }
        setStatus(`🎧 ${text.length > 70 ? text.slice(0, 67) + '…' : text}`);
        await speak(text, id);
        if (alive(id)) await sleep(250);
    }

    /* ================================================================== *
     * 10. MÚSICA (Drive via Apps Script)
     * ================================================================== */
    const MUS = { list: [], cur: -1, audio: null, blob: null, shuffle: false };
    try { MUS.list = JSON.parse(localStorage.getItem('ink_music_list') || '[]'); } catch (e) { }
    const musVol = () => cfg.musicVol == null ? 0.6 : cfg.musicVol;
    const musStatus = t => { const el = $('ink-music-status'); if (el && el.textContent !== t) el.textContent = t; };

    async function musApi(action, data) {
        if (!cfg.musicUrl) throw new Error('URL do app da web não configurada');
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
        try { localStorage.setItem('ink_music_list', JSON.stringify(MUS.list)); } catch (e) { }
        musPaintList();
    }
    async function musSync() {
        try { musStatus('☁ Sincronizando…'); const j = await musApi('sync'); musSetList(j.list); musStatus(`☁ ${j.list.length} faixa(s)`); }
        catch (e) { musStatus('⚠ ' + (e.message || e)); }
    }
    function musAudio() {
        if (!MUS.audio) {
            const a = new Audio();
            a.preload = 'auto'; a.volume = musVol();
            a.addEventListener('ended', () => musNext(1));
            a.addEventListener('play', musPaintBtn);
            a.addEventListener('pause', musPaintBtn);
            MUS.audio = a;
        }
        return MUS.audio;
    }
    function musDuck(on) {
        const a = MUS.audio;
        if (!a || !a.src || a.paused) return;
        if (on) { if (a._ducked) return; a._ducked = true; a._preVol = a.volume; a.volume = Math.min(a.volume, 0.12); }
        else if (a._ducked) { a._ducked = false; a.volume = a._preVol != null ? a._preVol : musVol(); a._preVol = null; }
    }
    async function musPlay(i) {
        const t = MUS.list[i];
        if (!t) return;
        const a = musAudio();
        MUS.cur = i; musPaintList();
        try {
            let src = t.url;
            if (t.fid) {
                musStatus('⏳ Baixando…');
                const j = await musApi('file', { fid: t.fid });
                if (MUS.cur !== i) return;
                const bin = atob(j.b64), u8 = new Uint8Array(bin.length);
                for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
                if (MUS.blob) URL.revokeObjectURL(MUS.blob);
                MUS.blob = URL.createObjectURL(new Blob([u8], { type: j.mime || 'audio/mpeg' }));
                src = MUS.blob;
            }
            a.src = src;
            await a.play();
            musStatus('🎵 ' + t.title);
        } catch (e) {
            if (MUS.cur !== i) return;
            if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) { musStatus('⚠ Toque ▶ para tocar'); return; }
            musStatus('⚠ ' + (e.message || e));
        }
    }
    function musNext(d) {
        const n = MUS.list.length;
        if (!n) return;
        if (MUS.shuffle && n > 1) { let j; do { j = Math.floor(Math.random() * n); } while (j === MUS.cur); musPlay(j); return; }
        const base = MUS.cur < 0 ? (d > 0 ? -1 : 0) : MUS.cur;
        musPlay(((base + d) % n + n) % n);
    }
    function musToggle() {
        const a = musAudio();
        if (!a.src) { if (MUS.list.length) musPlay(Math.max(0, MUS.cur)); else musStatus('Lista vazia'); return; }
        if (a.paused) a.play().catch(() => { }); else a.pause();
    }
    function musVolStep(d) {
        cfg.musicVol = Math.min(1, Math.max(0, Math.round((musVol() + d) * 10) / 10));
        saveCfg();
        if (MUS.audio) { if (MUS.audio._ducked) MUS.audio._preVol = cfg.musicVol; else MUS.audio.volume = cfg.musicVol; }
        musPaintBtn();
    }
    function musPaintBtn() {
        const playing = !!(MUS.audio && !MUS.audio.paused && MUS.audio.src);
        const p = $('ink-music-play');
        if (p) p.textContent = playing ? '⏸' : '▶';
        const v = $('ink-music-vol');
        if (v) v.textContent = Math.round(musVol() * 100) + '%';
    }
    function musPaintList() {
        const box = $('ink-music-list');
        if (!box) return;
        box.textContent = MUS.list.length ? '' : 'Sem faixas';
        MUS.list.forEach((t, i) => {
            const row = document.createElement('div');
            row.className = 'ia-trk' + (i === MUS.cur ? ' on' : '');
            const b = document.createElement('button');
            b.className = 'ia-trk-t'; b.textContent = t.title; b.title = t.title;
            b.onclick = () => musPlay(i);
            row.appendChild(b);
            box.appendChild(row);
        });
    }

    /* ================================================================== *
     * 11. MISSÕES
     * ================================================================== */
    const meta = { on: false, done: 0, seen: new Set() };
    const metaKey = st => { const c = st.p != null ? st.p : st.pg; return c == null ? null : location.pathname + '#' + c; };
    const pendingMissions = () => { try { return (JSON.parse(localStorage.getItem('ink_missions') || '{}').list || []).filter(x => !x.done && x.n > x.c); } catch (e) { return []; } };

    function metaToggle() {
        if (meta.on) { meta.on = false; metaPaint(); setStatus('Meta desligada'); return; }
        meta.on = true; meta.done = 0; meta.seen.clear();
        const k = metaKey(readState()); if (k) meta.seen.add(k);
        metaPaint();
        if (!running) mainLoop();
    }
    function metaTick() {
        if (!meta.on || !running) return;
        const k = metaKey(readState());
        if (!k || meta.seen.has(k)) return;
        meta.seen.add(k); meta.done++;
        if (meta.done >= cfg.metaGoal) { meta.on = false; finish(`✓ Meta cumprida: ${meta.done} págs`); }
        metaPaint();
    }
    setInterval(metaTick, 500);
    function metaPaint() {
        const l = $('ink-meta-lbl');
        if (l) l.textContent = meta.on ? `${meta.done}/${cfg.metaGoal}` : 'Ligar meta';
        const b = $('ink-meta-btn');
        if (b) b.classList.toggle('on', meta.on);
    }

    /* ================================================================== *
     * 12. ÍCONES + CSS
     * ================================================================== */
    const svg = (p, fill) => `<svg viewBox="0 0 24 24" width="16" height="16" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'} aria-hidden="true">${p}</svg>`;
    const ICO = {
        play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>', true),
        pause: svg('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>', true),
        sort: svg('<path d="M7 4v16M7 4L3.5 7.5M7 4l3.5 3.5M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5"/>'),
        clean: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>'),
        reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>'),
        book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5v16"/>'),
        min: svg('<path d="M6 9l6 6 6-6"/>'),
        max: svg('<path d="M6 15l6-6 6 6"/>'),
        voice: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    };

    const CSS = `
#ink-panel{position:fixed;bottom:12px;right:12px;z-index:2147483000;width:min(248px,calc(100vw - 16px));font:12.5px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
box-sizing:border-box;padding:8px;border:2px solid var(--ib-line);border-radius:20px;background:var(--ib-bg);color:var(--ib-txt);
--ib-bg:rgba(255,240,245,.96);--ib-card:rgba(255,182,193,.42);--ib-card2:rgba(255,105,180,.55);--ib-line:rgba(255,192,203,.85);--ib-txt:#5c4a4a;--ib-dim:#a88b8b;--ib-ac:#ff69b4;
box-shadow:0 8px 24px rgba(255,105,180,.28),inset 0 1px 0 rgba(255,255,255,.5);-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);}
#ink-panel.mob{background:rgba(255,240,245,.99)}
#ink-panel.boy{--ib-bg:rgba(16,16,20,.9);--ib-card:rgba(255,255,255,.06);--ib-card2:rgba(255,255,255,.14);--ib-line:rgba(255,255,255,.1);--ib-txt:#f4f2ef;--ib-dim:#a19eac;--ib-ac:#e8573f;border-radius:16px}
#ink-panel.skin-lobo{--ib-bg:rgba(28,34,48,.95);--ib-card:rgba(150,170,205,.16);--ib-card2:rgba(150,170,205,.3);--ib-line:rgba(170,190,225,.32);--ib-txt:#e9eef7;--ib-dim:#8f9bb5;--ib-ac:#5f8fd0}
#ink-panel *{box-sizing:border-box}
#ink-panel button{all:unset;box-sizing:border-box;cursor:pointer;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;justify-content:center;gap:5px}
#ink-panel .ia-head{display:flex;align-items:center;gap:6px;cursor:grab;touch-action:none;padding-bottom:6px}
#ink-panel .ia-title{flex:1;font-weight:800;font-size:13px;color:var(--ib-ac);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ink-panel .ia-ib{width:26px;height:26px;border-radius:8px;background:var(--ib-card);color:var(--ib-txt);flex:none}
#ink-panel.mob .ia-ib{width:36px;height:36px;border-radius:11px}
#ink-panel .ia-go{width:100%;height:38px;border-radius:12px;font-weight:800;font-size:13px;color:#fff;background:linear-gradient(135deg,var(--ib-ac),#ffb6c1);box-shadow:0 4px 12px rgba(255,105,180,.4);margin-top:4px}
#ink-panel.mob .ia-go{height:46px}
#ink-panel.run .ia-go{background:var(--ib-card2);box-shadow:none;color:var(--ib-txt)}
#ink-panel .ia-row{display:flex;gap:4px;margin-top:6px;align-items:stretch}
#ink-panel .ia-step{display:flex;align-items:center;border-radius:11px;background:var(--ib-card);flex:none}
#ink-panel .ia-step button{width:28px;height:32px;font-size:16px;line-height:1;color:var(--ib-txt)}
#ink-panel.mob .ia-step button{width:34px;height:42px}
#ink-panel .ia-val{min-width:34px;text-align:center;font-weight:600;font-size:12px;align-self:center;color:var(--ib-txt)}
#ink-panel .ia-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:6px}
#ink-panel .ia-chip{flex-direction:column;min-height:42px;padding:4px;border-radius:11px;background:var(--ib-card);border:1px solid var(--ib-line);color:var(--ib-txt);font-size:9.5px;font-weight:600;gap:2px}
#ink-panel.mob .ia-chip{min-height:50px}
#ink-panel .ia-chip.on{background:var(--ib-ac);color:#fff;border-color:var(--ib-ac)}
#ink-panel .ia-chip svg{width:15px;height:15px}
#ink-panel .ia-status{margin-top:6px;padding:5px 8px;border-radius:9px;background:var(--ib-card);color:var(--ib-txt);font-size:11.5px;line-height:1.3;word-break:break-word;min-height:20px;border:1px solid var(--ib-line)}
#ink-panel.run .ia-status{border-color:var(--ib-ac)}
#ink-panel .ia-sec{margin:8px 2px 4px;font-size:9.5px;letter-spacing:.9px;text-transform:uppercase;color:var(--ib-dim);font-weight:700}
#ink-panel .ia-skins{display:flex;gap:4px}
#ink-panel .ia-skin{flex:1;min-height:30px;border-radius:10px;background:var(--ib-card);border:1px solid var(--ib-line);color:var(--ib-txt);font-size:11.5px;font-weight:600}
#ink-panel .ia-skin.on{background:var(--ib-ac);color:#fff;border-color:var(--ib-ac)}
#ink-panel.min{width:auto;padding:6px;border-radius:14px}
#ink-panel.min .ia-title,#ink-panel.min #ink-body{display:none}
#ink-panel.min #ink-mini-go{display:inline-flex}
#ink-panel #ink-mini-go{display:none;width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,var(--ib-ac),#ffb6c1);color:#fff}
#ink-panel .ia-trk{display:flex;align-items:center;padding:4px;border-radius:6px;font-size:11px;color:var(--ib-dim)}
#ink-panel .ia-trk.on{background:var(--ib-ac);color:#fff}
#ink-panel .ia-trk-t{flex:1;text-align:left;padding:3px 5px;border-radius:4px;color:inherit;font-size:11px}
#ink-panel .ia-music-list{max-height:100px;overflow:auto;margin-top:4px;padding:2px;background:var(--ib-card);border-radius:8px;border:1px solid var(--ib-line)}

#ink-order{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 4px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
#ink-order .io-pill{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#f1efec;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:11px;padding:8px 12px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#ink-order .io-pill:hover{background:rgba(255,255,255,.14)}
#ink-order .io-seg{display:flex;gap:2px;margin-left:auto;padding:3px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.1);border-radius:13px}
#ink-order .io-seg button{font-size:12.5px;font-weight:600;border:0;border-radius:10px;padding:7px 12px;cursor:pointer;color:#bdbac6;background:transparent;touch-action:manipulation}
#ink-order .io-seg button.on{color:#fff;background:linear-gradient(135deg,#e8573f,#ff8a4c)}
#ink-order-status{font:12.5px/1.4 system-ui,-apple-system,sans-serif;padding:8px 11px;margin:6px 0 2px;border-radius:10px;background:rgba(90,170,255,.1);border:1px solid rgba(90,170,255,.22);color:#a9d2ff}
#ink-order-status:empty{display:none}
@media (pointer:coarse),(max-width:700px){
#ink-order{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
#ink-order .io-pill{justify-content:center;min-height:48px;font-size:13.5px}
#ink-order .io-seg{grid-column:1/-1;margin:0;width:100%}
#ink-order .io-seg button{flex:1;min-height:44px;font-size:14px}
}
`;

    function injectCSS() {
        if ($('ink-css') && $('ink-css').dataset.v === '4.0.0') return;
        const old = $('ink-css'); if (old) old.remove();
        const s = document.createElement('style');
        s.id = 'ink-css'; s.dataset.v = '4.0.0'; s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    /* ================================================================== *
     * 13. PAINEL
     * ================================================================== */
    function buildPanel() {
        if ($('ink-panel')) return;
        const u = document.createElement('div');
        u.id = 'ink-panel';
        if (IS_MOBILE) u.classList.add('mob');
        if (cfg.min) u.classList.add('min');
        u.innerHTML = `
<div class="ia-head" id="ink-head">
  <div class="ia-title" id="ink-title">Ink ${VERSION}</div>
  <button class="ia-ib" id="ink-mini-go" title="Ler">${ICO.play}</button>
  <button class="ia-ib" id="ink-min" title="minimizar">${ICO.min}</button>
</div>
<div id="ink-body">
  <button class="ia-go" id="ink-go">${ICO.play}<span>Ler sozinho</span></button>
  <div class="ia-row">
    <button class="ia-chip" id="ink-spd-">−</button>
    <span class="ia-val" id="ink-spd">1.5×</span>
    <button class="ia-chip" id="ink-spd+">+</button>
  </div>
  <div class="ia-grid">
    <button class="ia-chip" id="ink-manga">${ICO.book}<span>Mangá</span></button>
    <button class="ia-chip" id="ink-auto">✓<span>Auto-próx</span></button>
    <button class="ia-chip" id="ink-voice">${ICO.voice}<span>Voz</span></button>
    <button class="ia-chip" id="ink-eye">🌙<span>Olho</span></button>
    <button class="ia-chip" id="ink-girl">👧<span>Menina</span></button>
    <button class="ia-chip" id="ink-perf">⚡<span>Leve</span></button>
  </div>
  <div class="ia-sec">Skins</div>
  <div class="ia-skins">
    ${SKINS.map(k => `<button class="ia-skin" data-skin="${k.id}">${k.emo} ${k.nome}</button>`).join('')}
  </div>
  <div class="ia-sec">Missão</div>
  <div class="ia-row">
    <button class="ia-chip" id="ink-meta-btn" style="flex:1">🎯 <span id="ink-meta-lbl">Ligar meta</span></button>
    <button class="ia-chip" id="ink-meta-">−</button>
    <span class="ia-val" id="ink-meta-val">10</span>
    <button class="ia-chip" id="ink-meta+">+</button>
  </div>
  <div class="ia-status" id="ink-status"></div>
</div>`;
        (document.body || document.documentElement).appendChild(u);

        // Handlers
        $('ink-go').onclick = () => { if (running) stop('Parado.'); else mainLoop(); };
        $('ink-mini-go').onclick = $('ink-go').onclick;
        $('ink-min').onclick = () => { cfg.min = !cfg.min; saveCfg(); applyMin(); };
        $('ink-spd-').onclick = () => setSpeed(-1);
        $('ink-spd+').onclick = () => setSpeed(1);
        $('ink-manga').onclick = () => {
            cfg.manga = !cfg.manga;
            OrderBar.apply();
            refreshPanel();
        };
        $('ink-auto').onclick = () => { cfg.auto = !cfg.auto; saveCfg(); refreshPanel(); };
        $('ink-voice').onclick = toggleVoice;
        $('ink-eye').onclick = toggleEye;
        $('ink-girl').onclick = () => { cfg.girl = !cfg.girl; saveCfg(); applyTheme(); };
        $('ink-perf').onclick = () => { cfg.perf = !isPerf(); saveCfg(); refreshPanel(); };
        $$('[data-skin]', u).forEach(b => b.onclick = () => { cfg.skin = b.dataset.skin; saveCfg(); applyTheme(); });
        $('ink-meta-btn').onclick = metaToggle;
        $('ink-meta-').onclick = () => { cfg.metaGoal = Math.max(1, cfg.metaGoal - 1); saveCfg(); metaPaint(); };
        $('ink-meta+').onclick = () => { cfg.metaGoal = Math.min(300, cfg.metaGoal + 1); saveCfg(); metaPaint(); };

        // Drag
        const head = $('ink-head');
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
        const onUp = () => { if (drag) { drag = null; saveCfg(); } };
        head.addEventListener('mousedown', onDown);
        head.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchend', onUp);

        u.addEventListener('pointerdown', () => { lastUser = Date.now(); });
        document.addEventListener('keydown', () => { lastUser = Date.now(); });

        refreshPanel(); applyTheme(); applyMin(); applyEye(); metaPaint();
    }

    function applyMin() {
        const u = $('ink-panel'); if (!u) return;
        u.classList.toggle('min', !!cfg.min);
        const b = $('ink-min');
        if (b) b.innerHTML = cfg.min ? ICO.max : ICO.min;
        applyPos();
    }
    function applyPos() {
        const u = $('ink-panel'); if (!u || !cfg.pos) return;
        const r = u.getBoundingClientRect();
        const x = Math.min(Math.max(0, cfg.pos.x), Math.max(0, innerWidth - r.width));
        const y = Math.min(Math.max(0, cfg.pos.y), Math.max(0, innerHeight - r.height));
        u.style.left = x + 'px'; u.style.top = y + 'px'; u.style.bottom = 'auto'; u.style.right = 'auto';
    }
    function applyTheme() {
        const u = $('ink-panel'); if (!u) return;
        u.classList.toggle('boy', !cfg.girl);
        SKINS.forEach(k => u.classList.toggle('skin-' + k.id, cfg.girl && curSkin().id === k.id));
        $$('[data-skin]', u).forEach(b => b.classList.toggle('on', b.dataset.skin === curSkin().id));
        const t = $('ink-title');
        if (t) t.textContent = (cfg.girl ? curSkin().nome : 'Ink') + ' ' + VERSION;
        const g = $('ink-girl');
        if (g) g.classList.toggle('on', cfg.girl);
    }
    function applyEye() {
        let o = $('ink-eye-el');
        if (!cfg.eye || !location.pathname.startsWith('/ler/')) { if (o) o.remove(); }
        else {
            if (!o) {
                o = document.createElement('div');
                o.id = 'ink-eye-el';
                o.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000' + (IS_MOBILE ? '' : ';mix-blend-mode:multiply');
                document.body.appendChild(o);
            }
            const a = Math.min(0.6, Math.max(0.05, cfg.eyeLvl));
            o.style.background = IS_MOBILE ? `rgba(255,150,40,${0.04 + a * 0.3})` : `rgba(255,${Math.round(190 - a * 150)},${Math.round(110 - a * 150)},${0.35 + a * 0.9})`;
        }
        const b = $('ink-eye'); if (b) b.classList.toggle('on', cfg.eye);
    }
    function toggleEye() { cfg.eye = !cfg.eye; saveCfg(); applyEye(); }
    function toggleVoice() {
        cfg.voice = !cfg.voice; saveCfg(); refreshPanel();
        if (!cfg.voice) { cancelSpeech(); musDuck(false); return; }
        if (!TTS || !ptVoices().length) setStatus('⚠ Nenhuma voz pt encontrada');
        else ocrWorker().then(() => { if (!running) setStatus('Audiolivro pronto'); }).catch(e => setStatus('⚠ OCR: ' + (e.message || e)));
    }
    function setSpeed(d) {
        let i = 0, best = 1e9;
        SPEEDS.forEach((v, k) => { const dd = Math.abs(v - cfg.speed); if (dd < best) { best = dd; i = k; } });
        cfg.speed = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + d))];
        saveCfg(); refreshPanel();
    }
    function refreshPanel() {
        const u = $('ink-panel'); if (!u) return;
        u.classList.toggle('run', running);
        const g = $('ink-go');
        if (g) g.innerHTML = running ? ICO.pause + '<span>Pausar</span>' : ICO.play + '<span>Ler sozinho</span>';
        const mg = $('ink-mini-go');
        if (mg) mg.innerHTML = running ? ICO.pause : ICO.play;
        const sp = $('ink-spd'); if (sp) sp.textContent = String(+(cfg.speed).toFixed(2)) + '×';
        const ma = $('ink-manga'); if (ma) ma.classList.toggle('on', cfg.manga);
        const au = $('ink-auto'); if (au) au.classList.toggle('on', cfg.auto);
        const vo = $('ink-voice'); if (vo) vo.classList.toggle('on', cfg.voice);
        const pe = $('ink-perf'); if (pe) pe.classList.toggle('on', isPerf());
        const ey = $('ink-eye'); if (ey) ey.classList.toggle('on', cfg.eye);
        const mv = $('ink-meta-val'); if (mv) mv.textContent = cfg.metaGoal;
    }

    /* ================================================================== *
     * 14. INIT
     * ================================================================== */
    function init() {
        injectCSS();
        buildPanel();
        applyPos();
        OrderBar.build();
        let tries = 0;
        const w = setInterval(() => {
            if ($('ink-order')) { clearInterval(w); return; }
            if (++tries > 30) { clearInterval(w); return; }
            OrderBar.build();
        }, 500);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    console.info(`[Ink] v${VERSION} carregado`);
})();
