(() => {
    if (window.__inkLeitorV2) return;
    window.__inkLeitorV2 = true;

    /* =====================================================================
       PATCH ANDROID (DESTRUIR TELA PRETA E FORÇAR TOQUE)
       ===================================================================== */
    (function androidFixes() {
        // 1. Injeta CSS para forçar a liberação da tela e do toque
        const style = document.createElement('style');
        style.innerHTML = `
            html, body {
                overflow: auto !important;
                pointer-events: auto !important;
                touch-action: auto !important;
                position: static !important;
            }
            .reader-container, .comic-image, canvas {
                pointer-events: auto !important;
            }
        `;
        if (document.head) document.head.appendChild(style);
        else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));

        const KEY = 'serei sempre legal';

        const destruirBloqueios = () => {
            if (!document.body) return;

            // 2. Destrói o popup procurando pelo texto exato
            if ((document.body.textContent || '').toLowerCase().includes(KEY)) {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let node;
                while ((node = walker.nextNode())) {
                    if (node.nodeValue && node.nodeValue.toLowerCase().includes(KEY)) {
                        let el = node.parentElement;
                        for (let i = 0; i < 10 && el && el !== document.body; i++) {
                            if (el.tagName === 'DIV' || el.tagName === 'SECTION' || el.getAttribute('role') === 'dialog') {
                                el.remove();
                                break;
                            }
                            el = el.parentElement;
                        }
                    }
                }
            }

            // 3. Força bruta: Remove a TELA PRETA (Overlays) que bloqueiam o quadrinho
            document.querySelectorAll('div, section, dialog, overlay, [class*="modal"], [class*="popup"]').forEach(el => {
                if (el === document.body || el === document.documentElement) return;
                
                const cs = window.getComputedStyle(el);
                const zIndex = parseInt(cs.zIndex || '0', 10);
                
                const isFullScreen = (cs.position === 'fixed' || cs.position === 'absolute') && 
                                     (cs.inset === '0px' || (cs.width === '100%' && cs.height === '100%') || zIndex > 50);

                const isPreto = cs.backgroundColor.includes('0, 0, 0') || 
                                cs.backgroundColor === 'black' || 
                                cs.backgroundColor.includes('rgba(0, 0, 0');

                if (isFullScreen && isPreto) {
                    // Não remove se for o quadrinho em si
                    if (!el.querySelector('.comic-page') && !el.querySelector('canvas')) {
                        el.remove();
                    }
                }
            });

            // 4. Desbloqueia o body e html
            document.documentElement.style.setProperty('overflow', 'auto', 'important');
            document.documentElement.style.setProperty('pointer-events', 'auto', 'important');
            document.documentElement.style.setProperty('touch-action', 'auto', 'important');
            
            document.body.style.setProperty('overflow', 'auto', 'important');
            document.body.style.setProperty('pointer-events', 'auto', 'important');
            document.body.style.setProperty('touch-action', 'auto', 'important');
            document.body.style.setProperty('position', 'static', 'important');
            
            document.body.className = document.body.className.replace(/(modal-open|no-scroll|locked|overflow-hidden|blur)/gi, '').trim();
        };

        // Executa assim que a página carregar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', destruirBloqueios);
        } else {
            destruirBloqueios();
        }

        // Vigia a página (se o site recriar a tela preta, ele apaga na hora)
        const observer = new MutationObserver(() => {
            destruirBloqueios();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });

        // Backup de segurança
        let tentativas = 0;
        const interval = setInterval(() => {
            destruirBloqueios();
            tentativas++;
            if (tentativas > 15) clearInterval(interval);
        }, 1000);
    })();

    /* =====================================================================
       COMUM
       ===================================================================== */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const MOBILE = (() => { try { return matchMedia('(pointer:coarse)').matches || innerWidth < 700; } catch (e) { return innerWidth < 700; } })();

    /* =====================================================================
       PARTE A — LEITURA AUTOMÁTICA (só em /ler/...)
       ===================================================================== */
    const LS = 'ink_autoread_cfg';
    let cfg = { speed: 1.5, method: '', methodM: '', manga: false, min: null, eye: false, eyeLvl: 0.25, pos: null, auto: true, voice: false, vrate: 1, vname: '', dbg: false, perf: null, bin: false, bin1: false, smooth: true, metaGoal: 10, girl: true, anx: 0 };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { }
    cfg.smooth = true;
    cfg.anx = cfg.anx === true ? 1 : (+cfg.anx === 1 || +cfg.anx === 2 ? +cfg.anx : 0);
    const isPerf = () => cfg.perf == null ? MOBILE : !!cfg.perf;
    let saveT = 0;
    const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch (e) { } }, 150); };

    let running = false, runId = 0, lastUser = 0;
    const alive = id => running && id === runId;
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

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
            if (isPerf()) {
                out.push((r.left | 0) + ',' + (r.top | 0) + ',' + (r.width | 0) + ',' + (r.height | 0));
            } else {
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
                t.dispatchEvent(new TouchEvent(type, {
                    bubbles: true, cancelable: true, composed: true,
                    touches: end ? [] : [tc], targetTouches: end ? [] : [tc], changedTouches: [tc]
                }));
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
            t.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); return true;
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
            }
            else if (s.sig !== before.sig) return true;
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
            try { if (!METHODS[name]) continue; } catch (e) { continue; }
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
    const ANX_MSG = [
        'Modo ansiedade desligado.',
        '😬 Ansiedade normal: tensão em episódios curtos, depois passa.',
        '😰 Ansiedade crônica: inquieta o tempo todo, perde o foco, relê e cansa.'
    ];
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
    function finish(msg) { running = false; runId++; cancelSpeech(); setSt(msg); refreshBtn(); keepAwake(false); }
    function stop(msg) { if (!running) return; running = false; runId++; cancelSpeech(); setSt(msg || 'Parado.'); refreshBtn(); keepAwake(false); }

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
       PATCH 2: OCR COM FALLBACK
       ===================================================================== */
    const OCR = { w: null, p: null };
    function ocrBase() {
        let b = window.__inkOcrBase || (document.documentElement.dataset && document.documentElement.dataset.inkOcr) || '';
        if (!b) { try { if (chrome && chrome.runtime && chrome.runtime.getURL) b = chrome.runtime.getURL('ocr'); } catch (e) { } }
        if (!b || b === 'file:///android_asset/ocr') {
            console.log("[Ink-OCR] Usando caminho local ou fallback CDN");
        }
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

    const descEl = e => e.tagName + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
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
        for (let y = 0; y < h; y++) {
            let row = 0;
            for (let x = 0; x < w; x++) { row += gray[y * w + x]; S[(y + 1) * W + x + 1] = S[y * W + x + 1] + row; }
        }
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
            try {
                r2 = await w.recognize(c2, {}, { blocks: true, text: true });
            } finally {
                await w.setParameters({ tessedit_pageseg_mode: '11' });
            }
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
        if (!cfg.voice) { cancelSpeech(); return; }
        if (!TTS || !ptVoices().length) setSt('⚠ Nenhuma voz em português encontrada.');
        else ocrWorker().then(() => { if (!running) setSt('Audiolivro pronto. Toque em Ler sozinho.' + (cfg.girl ? ' 🐾' : '')); }).catch(e => setSt('⚠ OCR: ' + (e.message || e)));
    }

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
#ink-auto-body{max-height:calc(100vh - 40px);overflow:auto;scrollbar-width:none}
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
        if (document.getElementById('ink-ui-css')) return;
        const s = document.createElement('style');
        s.id = 'ink-ui-css'; s.textContent = INK_CSS;
        (document.head || document.documentElement).appendChild(s);
    }

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
        const t = document.getElementById('ink-auto-title');
        if (t) t.textContent = cfg.girl ? 'Modo Meninas 🐾' : 'Leitura automática';
        const l = document.getElementById('ink-gender-lbl');
        if (l) l.textContent = cfg.girl ? '👧 Menina · toque p/ menino' : '👦 Menino · toque p/ menina';
    }
    function applyMin() {
        const u = document.getElementById('ink-auto-ui'); if (!u) return;
        const mn = cfg.min == null ? MOBILE : !!cfg.min;
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
    function toggle() {
        if (running) stop('Parado.');
        else loop();
    }
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
    function metaPick() {
        const L = pendingMissions();
        if (!L.length) { setSt('Sem missões de leitura pendentes. Abra o painel do evento uma vez e volte.'); return; }
        metaSel = (metaSel + 1) % (L.length + 1);
        if (metaSel === L.length) {
            cfg.metaGoal = Math.max(1, ...allTargets(L).map(x => x.n - x.c));
        } else {
            cfg.metaGoal = Math.max(1, L[metaSel].n - L[metaSel].c);
            if (L[metaSel].fac) setSt('Missão de facção: leia uma HQ do herói da sua facção.');
        }
        save(); metaPaint();
    }
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
        const hit = meta.targets.filter(x => x.r === meta.done).map(x => x.t);
        if (hit.length) console.info('[Ink] missão completa:', hit.join(' | '));
        if (meta.done >= cfg.metaGoal) {
            meta.on = false;
            const fac = pendingMissions().some(x => x.fac) ? ' Missões de facção: leia HQs do herói da sua facção.' : '';
            finish(`✓ Meta cumprida: ${meta.done} páginas lidas.${fac} Abra o painel do evento para atualizar.`);
        }
        metaPaint();
    }
    setInterval(metaTick, 500);

    function mount() {
        if (document.getElementById('ink-auto-ui') || !document.body) return;
        injectCSS();
        const d = document.createElement('div');
        d.id = 'ink-auto-ui';
        if (MOBILE) d.classList.add('mob');
        d.style.left = (MOBILE ? 8 : 24) + 'px';
        d.style.bottom = `calc(${MOBILE ? 96 : 120}px + env(safe-area-inset-bottom,0px))`;
        const moon = svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>');
        const bolt = svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>');
        const IC = {
            manga: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
            next: svg('<path d="M5 5l9 7-9 7zM18 5v14"/>'),
            voice: ICO.voice,
            eye: moon,
            perf: bolt,
            anx: svg('<path d="M3 12h4l2-6 4 12 2-6h6"/>')
        };
        const chip = (id, ico, txt, tip) => `<button id="${id}" class="ia-chip" type="button" title="${tip}">${ico}<span>${txt}</span></button>`;
        
        d.innerHTML =
            `<div id="ink-auto-head" class="ia-head">
                <span class="ia-logo">${ICO.book}</span>
                <span class="ia-title" id="ink-auto-title"></span>
                <button id="ink-auto-mini-go" class="ia-ib" type="button"></button>
                <button id="ink-auto-min" class="ia-ib" type="button"></button>
            </div>
            <div id="ink-auto-body">
                <div id="ink-auto-st" class="ia-st">${MOBILE ? 'Parado. Toque em Ler sozinho.' : 'Parado. Alt+L liga/desliga.'}${cfg.girl ? ' 🐾' : ''}</div>
                <div class="ia-main">
                    <button id="ink-auto-go" type="button"></button>
                    <div class="ia-step"><button id="ink-auto-slow" type="button" title="mais devagar">−</button><span id="ink-auto-sp" class="ia-val"></span><button id="ink-auto-fast" type="button" title="mais rápido">+</button></div>
                </div>
                <div class="ia-chips">
                    ${chip('ink-auto-manga', IC.manga, 'Mangá', 'Modo mangá: leitura da direita para a esquerda')}
                    ${chip('ink-auto-next', IC.next, 'Auto', 'Ao terminar o capítulo, abre o próximo e continua')}
                    ${chip('ink-voice-btn', IC.voice, 'Voz', 'Lê os balões em voz alta (OCR + voz do navegador)')}
                    ${chip('ink-eye-btn', IC.eye, 'Olhos', 'Filtro quente que reduz a luz azul (Alt+C)')}
                    ${chip('ink-perf-btn', IC.perf, 'Leve', 'Modo desempenho (menos CPU/GPU)')}
                    ${chip('ink-anx-btn', IC.anx, 'Ansiedade', 'Modo ansiedade: lê nervoso, em rajadas, com travadinhas e voltinhas')}
                </div>
                <div id="ink-voice-combo" class="ia-sub">
                    <button id="ink-voice-pick" class="ia-row" type="button" title="Trocar a voz"><span class="ia-lbl" id="ink-voice-name"></span></button>
                    <div class="ia-step"><button id="ink-voice-slow" type="button" title="voz mais devagar">−</button><span id="ink-voice-sp" class="ia-val"></span><button id="ink-voice-fast" type="button" title="voz mais rápida">+</button></div>
                </div>
                <div id="ink-eye-sub" class="ia-sub">
                    <span class="ia-row" style="cursor:default"><span class="ia-lbl">Intensidade do filtro</span></span>
                    <div class="ia-step"><button id="ink-eye-less" type="button" title="menos intenso">−</button><span id="ink-eye-lvl" class="ia-val"></span><button id="ink-eye-more" type="button" title="mais intenso">+</button></div>
                </div>
                <button id="ink-gender-btn" class="ia-row" type="button" title="Trocar entre menina e menino"><span class="ia-lbl" id="ink-gender-lbl"></span></button>
                <div class="ia-sec">Missão</div>
                <button id="ink-meta-pick" class="ia-row" type="button"><span class="ia-lbl" id="ink-meta-pick-lbl"></span></button>
                <div class="ia-sub">
                    <button id="ink-meta-btn" class="ia-row" type="button" title="Lê sozinho até completar a meta de páginas e para"><span class="ia-lbl" id="ink-meta-lbl"></span></button>
                    <div class="ia-step"><button id="ink-meta-less" type="button" title="−1 página">−</button><span id="ink-meta-val" class="ia-val"></span><button id="ink-meta-more" type="button" title="+1 página">+</button></div>
                </div>
            </div>`;
        document.body.appendChild(d);

        const halt = e => { e.stopPropagation(); };
        ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup', 'click'].forEach(ev => {
            d.addEventListener(ev, halt, { passive: true });
        });

        d.querySelector('#ink-meta-pick').onclick = metaPick;
        d.querySelector('#ink-meta-btn').onclick = metaToggle;
        d.querySelector('#ink-meta-less').onclick = () => metaGoalStep(-1);
        d.querySelector('#ink-meta-more').onclick = () => metaGoalStep(1);
        metaPaint();
        d.querySelector('#ink-auto-go').onclick = toggle;
        d.querySelector('#ink-auto-mini-go').onclick = toggle;
        d.querySelector('#ink-auto-slow').onclick = () => setSpeed(-1);
        d.querySelector('#ink-auto-fast').onclick = () => setSpeed(1);
        d.querySelector('#ink-auto-min').onclick = () => { cfg.min = !(cfg.min == null ? MOBILE : cfg.min); save(); applyMin(); };
        d.querySelector('#ink-auto-manga').onclick = () => {
            cfg.manga = !cfg.manga; save(); refreshBtn();
            if (document.getElementById('ink-ord-west')) paintMode();
            setSt(cfg.manga ? 'Modo mangá: avança para a esquerda.' : 'Modo ocidental: avança para a direita.');
        };
        d.querySelector('#ink-voice-btn').onclick = toggleVoice;
        d.querySelector('#ink-voice-pick').onclick = cycleVoice;
        d.querySelector('#ink-voice-slow').onclick = () => setVRate(-1);
        d.querySelector('#ink-voice-fast').onclick = () => setVRate(1);
        d.querySelector('#ink-auto-next').onclick = () => { cfg.auto = !cfg.auto; save(); refreshBtn(); };
        d.querySelector('#ink-eye-btn').onclick = toggleEye;
        d.querySelector('#ink-eye-less').onclick = () => setEyeLvl(-0.05);
        d.querySelector('#ink-eye-more').onclick = () => setEyeLvl(0.05);
        d.querySelector('#ink-perf-btn').onclick = () => {
            if (cfg.perf == null) cfg.perf = true;
            else if (cfg.perf === true) cfg.perf = false;
            else cfg.perf = null;
            save(); refreshBtn();
            setSt(isPerf() ? '⚡ Modo desempenho ligado.' : '⚡ Modo desempenho desligado.');
        };

        d.querySelector('#ink-anx-btn').onclick = () => {
            cfg.anx = ((cfg.anx | 0) + 1) % 3; save(); refreshBtn();
            setSt(ANX_MSG[cfg.anx]);
        };
        d.querySelector('#ink-gender-btn').onclick = () => {
            cfg.girl = !cfg.girl; save(); applyTheme();
            setSt(cfg.girl ? 'Tema menina 🐾' : 'Tema menino.');
        };

        const head = d.querySelector('#ink-auto-head');
        let drag = null;
        head.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            e.stopPropagation();
            const r = d.getBoundingClientRect();
            drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false };
            try { head.setPointerCapture(e.pointerId); } catch (_) { }
            head.style.cursor = 'grabbing';
        });
        head.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (!drag.moved) {
                if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
                drag.moved = true;
            }
            cfg.pos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy };
            applyPos();
        });
        const end = () => { if (!drag) return; drag = null; head.style.cursor = 'grab'; save(); };
        head.addEventListener('pointerup', end);
        head.addEventListener('pointercancel', end);

        applyTheme(); refreshBtn(); applyMin(); applyEye();
    }
    window.addEventListener('resize', () => { if (cfg.pos) applyPos(); }, { passive: true });

    ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach(ev =>
        window.addEventListener(ev, e => { if (e.isTrusted && !(e.target && e.target.closest && e.target.closest('#ink-auto-ui'))) lastUser = Date.now(); }, { capture: true, passive: true }));
    window.addEventListener('keydown', e => {
        if (!e.isTrusted || !e.altKey) return;
        if (e.key === 'l' || e.key === 'L') { e.preventDefault(); if (location.pathname.startsWith('/ler/')) toggle(); }
        else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); if (location.pathname.startsWith('/ler/')) toggleEye(); }
    });

    let lastPath = location.pathname;
    function route() {
        const on = location.pathname.startsWith('/ler/');
        if (location.pathname !== lastPath) { lastPath = location.pathname; cache.ctr = cache.pg = cache.pct = null; cache.t = 0; }
        applyEye();
        if (on) mount();
        else {
            const u = document.getElementById('ink-auto-ui'); if (u) u.remove();
            stop('Parado.');
        }
    }
    ['pushState', 'replaceState'].forEach(k => {
        const o = history[k];
        history[k] = function (...a) { const r = o.apply(this, a); setTimeout(route, 0); return r; };
    });
    window.addEventListener('popstate', route);
    setInterval(route, 2500);
    route();
    window.lerAuto = {
        meta: n => { if (n) cfg.metaGoal = n; if (!meta.on) metaToggle(); return cfg.metaGoal; }, metaStatus: () => ({ ...meta, seen: meta.seen.size, goal: cfg.metaGoal }),
        start: () => { if (!running) loop(); }, stop: () => stop('Parado.'), next: () => { const e = findNextEl(); console.log(e); return e; },
        voices: () => ptVoices().map(v => v.name + ' (' + v.lang + ')'),
        bin1: v => { cfg.bin1 = v !== false; save(); return cfg.bin1; },
        bin: v => { cfg.bin = v !== false; save(); return cfg.bin; },
        debug: v => { cfg.dbg = v !== false; save(); return cfg.dbg; },
        counters: () => { scan(); cache.t = performance.now(); const s = readState(); return s; },
        ocrTest: async () => { const t = await ocrView(); console.log('[Ink-Audio] texto:', t); return t; }
    };

    const AUTO = true;
    const HOLD = MOBILE ? 320 : 240;
    const SCORE_THRESHOLD = 0.30;
    const MAX_REMOVE_RATIO = 0.22;

    const MODES = MOBILE ? ['ptouch', 'touch', 'mouse'] : ['mouse', 'ptouch', 'touch'];
    let busy = false, lastSig = '', tmr = 0, mode = MODES.includes(cfg.dmode) ? cfg.dmode : MODES[0], SYN = false;
    let pgCache = { url: '', pg: null };
    const scoreCache = new Map();

    ['setPointerCapture', 'releasePointerCapture'].forEach(k => {
        const o = Element.prototype[k];
        Element.prototype[k] = function (...a) { try { return o.apply(this, a); } catch (e) { } };
    });
    const hpc = Element.prototype.hasPointerCapture;
    Element.prototype.hasPointerCapture = function (...a) { return SYN ? true : hpc.apply(this, a); };

    function spotBoxes() {
        return [...document.querySelectorAll('.bz-order__spot')].map(e => {
            const s = e.style;
            const l = parseFloat(s.left) / 100, t = parseFloat(s.top) / 100;
            const w = parseFloat(s.width) / 100, h = parseFloat(s.height) / 100;
            if (![l, t, w, h].every(isFinite)) return null;
            return { x0: l, y0: t, x1: l + w, y1: t + h, cx: l + w / 2, cy: t + h / 2 };
        }).filter(Boolean);
    }

    function tiles() {
        const d = document.querySelector('.bz-order');
        if (!d) return [];
        const sp = spotBoxes();
        return [...d.querySelectorAll('.bz-order__tile:not(.bz-order__add)')].map(el => {
            const th = el.querySelector('.bz-order__thumb');
            if (!th) return null;
            const s = th.style;
            const bs = s.backgroundSize.split(' ').map(parseFloat);
            const bp = s.backgroundPosition.split(' ').map(parseFloat);
            const w = parseFloat(s.width), h = parseFloat(s.height);
            const cx = (-bp[0] + w / 2) / bs[0];
            const cy = (-bp[1] + h / 2) / bs[1];
            if (![cx, cy].every(isFinite)) return null;

            let box = null, bd = 0.03;
            sp.forEach(p => {
                const dd = Math.hypot(p.cx - cx, p.cy - cy);
                if (dd < bd) { bd = dd; box = p; }
            });
            if (!box) {
                const hw = w / bs[0] * 0.4, hh = h / bs[1] * 0.4;
                box = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
            }

            const m = /translateX\((-?[\d.]+)px\)/.exec(el.style.transform || '');
            return {
                el, cx, cy,
                x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y1,
                x: m ? +m[1] : el.getBoundingClientRect().left,
                key: cx.toFixed(4) + ',' + cy.toFixed(4),
                n: (el.querySelector('.bz-order__num') || {}).textContent || '?'
            };
        }).filter(Boolean);
    }

    const sig = () => tiles().map(t => t.key).sort().join('|');

    async function getPage() {
        const pe = document.querySelector('.bz-order__page');
        if (!pe) return null;

        const m = /url\(['"]?([^'")]+)['"]?\)/.exec(pe.style.backgroundImage || '');
        if (!m) return null;

        if (pgCache.url === m[1] && pgCache.pg) return pgCache.pg;

        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = m[1];
            await img.decode();

            const s = Math.min(1, 520 / img.naturalWidth);
            const w = Math.max(8, Math.round(img.naturalWidth * s));
            const h = Math.max(8, Math.round(img.naturalHeight * s));

            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, w, h);

            const d = ctx.getImageData(0, 0, w, h).data;
            const L = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
                const g = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
                L[i] = (g > 235 || g < 80) ? 1 : 0;
            }

            pgCache = { url: m[1], pg: { img, w, h, L } };
            return pgCache.pg;
        } catch (e) { return null; }
    }

    function roundMarks(d, tw, th) {
        const N = tw * th;
        const m = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
            m[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) < 140 ? 1 : 0;
        }
        const dl = new Uint8Array(N), cl = new Uint8Array(N);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
            let v = 0;
            for (let dy = -1; dy <= 1 && !v; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && xx < tw && yy >= 0 && yy < th && m[yy * tw + xx]) { v = 1; break; }
            }
            dl[y * tw + x] = v;
        }
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
            let v = 1;
            for (let dy = -1; dy <= 1 && v; dy++) for (let dx = -1; dx <= 1; dx++) {
                const xx = x + dx, yy = y + dy;
                if (xx >= 0 && xx < tw && yy >= 0 && yy < th && !dl[yy * tw + xx]) { v = 0; break; }
            }
            cl[y * tw + x] = v;
        }
        const seen = new Uint8Array(N);
        let n = 0, nr = 0;
        for (let s = 0; s < N; s++) {
            if (!cl[s] || seen[s]) continue;
            const st = [s]; seen[s] = 1;
            let x0 = tw, x1 = 0, y0 = th, y1 = 0;
            while (st.length) {
                const p = st.pop(), px = p % tw, py = (p / tw) | 0;
                if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
                for (const q of [px > 0 ? p - 1 : -1, px < tw - 1 ? p + 1 : -1, py > 0 ? p - tw : -1, py < th - 1 ? p + tw : -1]) {
                    if (q < 0 || seen[q] || !cl[q]) continue;
                    seen[q] = 1; st.push(q);
                }
            }
            const ww = x1 - x0 + 1, hh = y1 - y0 + 1;
            if (x0 === 0 || y0 === 0 || x1 === tw - 1 || y1 === th - 1 || hh < 0.12 * th || ww * hh < 12) continue;
            n++;
            const a = ww / hh;
            if (a > 0.75 && a < 1.5) nr++;
        }
        return { n, rnd: n ? nr / n : 0 };
    }

    function balloonScore(pg, b) {
        if (scoreCache.has(b.key)) return scoreCache.get(b.key);

        try {
            const pad = 0.018;
            const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad);
            const x1 = Math.min(1, b.x1 + pad), y1 = Math.min(1, b.y1 + pad);
            const nw = pg.img.naturalWidth, nh = pg.img.naturalHeight;
            const sw = Math.max(4, (x1 - x0) * nw), sh = Math.max(4, (y1 - y0) * nh);
            const tw = Math.min(110, Math.round(sw));
            const th = Math.max(4, Math.round(tw * sh / sw));

            const c = document.createElement('canvas');
            c.width = tw; c.height = th;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(pg.img, x0 * nw, y0 * nh, sw, sh, 0, 0, tw, th);
            const d = ctx.getImageData(0, 0, tw, th).data;
            const n = tw * th;

            let ink = 0, white = 0, edge = 0;
            const bins = new Uint32Array(512);

            for (let i = 0; i < n; i++) {
                const r = d[i * 4], g = d[i * 4 + 1], bl = d[i * 4 + 2];
                const L = r * 0.299 + g * 0.587 + bl * 0.114;
                bins[(r >> 5) * 64 + (g >> 5) * 8 + (bl >> 5)]++;
                if (L < 90) ink++;
                if (L > 210) white++;
            }

            for (let y = 1; y < th - 1; y++) for (let x = 1; x < tw - 1; x++) {
                const i = (y * tw + x) * 4;
                const L = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                const L2 = d[((y - 1) * tw + x) * 4] * 0.299 + d[((y - 1) * tw + x) * 4 + 1] * 0.587 + d[((y - 1) * tw + x) * 4 + 2] * 0.114;
                if (Math.abs(L - L2) > 40) edge++;
            }

            let m1 = 0, m2 = 0;
            for (let k = 0; k < 512; k++) {
                const v = bins[k];
                if (v > m1) { m2 = m1; m1 = v; } else if (v > m2) m2 = v;
            }

            const fi = ink / n;
            const fw = white / n;
            const top2 = (m1 + m2) / n;
            const edgeRatio = edge / n;

            let score = 0.50;

            if (fi > 0.04) score += 0.18;
            else if (fi > 0.02) score += 0.08;
            else score -= 0.25;

            if (fw > 0.25) score += 0.16;
            else if (fw > 0.12) score += 0.06;
            else score -= 0.12;

            if (top2 > 0.38) score += 0.14;
            else if (top2 > 0.25) score += 0.05;
            else score -= 0.15;

            if (edgeRatio > 0.04 && edgeRatio < 0.22) score += 0.10;

            if (fi < 0.11 && fw > 0.40) {
                const rm = roundMarks(d, tw, th);
                if (rm.n >= 6 && rm.rnd >= 0.60) score -= 0.45;
            }

            const area = (b.x1 - b.x0) * (b.y1 - b.y0);
            if (area < 0.008) score -= 0.15;

            score = Math.max(0, Math.min(1, score));
            scoreCache.set(b.key, score);
            return score;

        } catch (e) {
            scoreCache.set(b.key, 0.6);
            return 0.6;
        }
    }

    function lineMask(pg, list) {
        const { w, h } = pg;
        const M = new Uint8Array(w * h);
        list.forEach(b => {
            const x0 = Math.max(0, Math.floor((b.x0 - 0.01) * w));
            const x1 = Math.min(w, Math.ceil((b.x1 + 0.01) * w));
            const y0 = Math.max(0, Math.floor((b.y0 - 0.01) * h));
            const y1 = Math.min(h, Math.ceil((b.y1 + 0.01) * h));
            for (let y = y0; y < y1; y++) M.fill(1, y * w + x0, y * w + x1);
        });
        return M;
    }

    function sup(pg, M, ax, p, lo, hi) {
        const { w, h, L } = pg;
        const lim = ax === 'y' ? h : w;
        p = Math.min(lim - 1, Math.max(0, p));
        let n = 0, k = 0;
        for (let j = lo; j < hi; j++) {
            const i = ax === 'y' ? p * w + j : j * w + p;
            if (M[i]) continue;
            n++; k += L[i];
        }
        return n >= 0.4 * (hi - lo) && n > 0 ? k / n : 0;
    }

    function bestSup(pg, M, ax, g0, g1, lo, hi) {
        const dim = ax === 'y' ? pg.h : pg.w;
        const d = Math.max(2, Math.round(0.02 * dim));
        let best = 0;
        for (let p = Math.floor(g0); p <= Math.ceil(g1); p++) {
            const s = sup(pg, M, ax, p, lo, hi);
            if (s < 0.55) continue;
            const c = (sup(pg, M, ax, p - d, lo, hi) + sup(pg, M, ax, p + d, lo, hi)) / 2;
            if (s - c > best) best = s - c;
        }
        return best;
    }

    function leaf(bs) {
        const rows = [];
        [...bs].sort((a, b) => a.cy - b.cy).forEach(b => {
            const r = rows[rows.length - 1];
            if (r && Math.abs(b.cy - r.y) < 0.032) {
                r.it.push(b);
                r.y = (r.y * (r.it.length - 1) + b.cy) / r.it.length;
            } else {
                rows.push({ y: b.cy, it: [b] });
            }
        });
        return rows.flatMap(r => r.it.sort((a, b) => cfg.manga ? b.cx - a.cx : a.cx - b.cx));
    }

    function order(list, pg) {
        if (!pg) return leaf(list);
        const M = lineMask(pg, list);

        const gaps = (bs, ax) => {
            const k0 = ax === 'y' ? 'y0' : 'x0';
            const k1 = ax === 'y' ? 'y1' : 'x1';
            const s = [...bs].sort((a, b) => a[k0] - b[k0]);
            let mx = s[0][k1];
            const gs = [];
            for (let i = 1; i < s.length; i++) {
                if (s[i][k0] - mx > 0.002) gs.push({ i, a: mx, b: s[i][k0] });
                mx = Math.max(mx, s[i][k1]);
            }
            return { s, gs };
        };

        const rec = bs => {
            if (bs.length < 2) return bs;
            for (const ax of ['y', 'x']) {
                const { s, gs } = gaps(bs, ax);
                if (!gs.length) continue;
                const dimA = ax === 'y' ? pg.h : pg.w;
                const dimB = ax === 'y' ? pg.w : pg.h;
                const k0 = ax === 'y' ? 'x0' : 'y0';
                const k1 = ax === 'y' ? 'x1' : 'y1';
                const lo = Math.max(0, Math.floor(Math.min(...bs.map(b => b[k0])) * dimB));
                const hi = Math.min(dimB, Math.ceil(Math.max(...bs.map(b => b[k1])) * dimB));
                let best = null;
                gs.forEach(g => {
                    const sc = bestSup(pg, M, ax, g.a * dimA, g.b * dimA, lo, hi);
                    if (sc >= 0.25 && (!best || sc > best.sc)) best = { sc, i: g.i };
                });
                if (best) {
                    const parts = [rec(s.slice(0, best.i)), rec(s.slice(best.i))];
                    if (ax === 'x' && cfg.manga) parts.reverse();
                    return parts.flat();
                }
            }
            return leaf(bs);
        };
        return rec(list);
    }

    function fire(el, type, x, y, pt = 'mouse') {
        const up = type.endsWith('up') || type.endsWith('cancel');
        const o = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, screenX: x, screenY: y, view: window, button: 0, buttons: up ? 0 : 1 };
        const isT = pt === 'touch';
        el.dispatchEvent(
            type.startsWith('pointer')
                ? new PointerEvent(type, { ...o, pointerId: isT ? 7 : 1, pointerType: pt, isPrimary: true, width: isT ? 24 : 1, height: isT ? 24 : 1, pressure: up ? 0 : 0.5 })
                : new MouseEvent(type, o)
        );
    }

    function touch(el, type, x, y) {
        try {
            const t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y, screenX: x, screenY: y, pageX: x, pageY: y, radiusX: 12, radiusY: 12, force: 0.5 });
            const end = type === 'touchend' || type === 'touchcancel';
            el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] }));
        } catch (e) { }
    }

    function gesture(tg, phase, x, y) {
        if (mode === 'mouse') {
            fire(tg, 'pointer' + phase, x, y);
            fire(tg, 'mouse' + phase, x, y);
        } else if (mode === 'ptouch') {
            fire(tg, 'pointer' + phase, x, y, 'touch');
            touch(tg, 'touch' + (phase === 'down' ? 'start' : phase === 'move' ? 'move' : 'end'), x, y);
        } else {
            touch(tg, 'touch' + (phase === 'down' ? 'start' : phase === 'move' ? 'move' : 'end'), x, y);
        }
    }

    async function drag(el, dx) {
        el.scrollIntoView({ inline: 'center', block: 'nearest' });
        await sleep(MOBILE ? 120 : 60);
        const r = el.getBoundingClientRect();
        const x0 = r.left + r.width / 2;
        const y0 = r.top + r.height / 2;
        dx = Math.max(6, Math.min(innerWidth - 6, x0 + dx)) - x0;
        const tg = document.elementFromPoint(x0, y0) || el;

        SYN = true;
        try {
            gesture(tg, 'down', x0, y0);
            await sleep(HOLD);

            const steps = MOBILE ? 14 : 18;
            for (let k = 1; k <= steps; k++) {
                gesture(tg, 'move', x0 + dx * k / steps, y0);
                await sleep(MOBILE ? 16 : 13);
            }
            await sleep(MOBILE ? 120 : 80);
            gesture(tg, 'up', x0 + dx, y0);

        } finally {
            SYN = false;
        }
        await sleep(MOBILE ? 280 : 200);
    }

    function say(t) {
        const s = document.getElementById('ink-ord-st');
        if (s && s.textContent !== t) s.textContent = t;
    }

    function paintMode() {
        const w = document.getElementById('ink-ord-west'), m = document.getElementById('ink-ord-manga');
        if (w) w.classList.toggle('on', !cfg.manga);
        if (m) m.classList.toggle('on', !!cfg.manga);
        refreshBtn();
    }
    function setManga(v) {
        if (!!cfg.manga === v || busy) return;
        cfg.manga = v; save(); paintMode();
        lastSig = ''; run(false);
    }

    function ui(d) {
        const p = d.querySelector('.bz-order__hint');
        if (!p) return;
        injectCSS();

        let bar = document.getElementById('ink-ord-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ink-ord-bar';

            const btn = (id, txt, title, fn) => {
                const b = document.createElement('button');
                b.id = id; b.type = 'button'; b.title = title; b.className = 'io-pill';
                b.innerHTML = (ICO_O[id] || '') + '<span>' + txt + '</span>';
                b.onclick = fn;
                bar.appendChild(b);
                return b;
            };
            btn('ink-ord-btn', 'Ordenar', 'Ordena as bolhas automaticamente', () => { lastSig = ''; run(false); });
            btn('ink-ord-clean', 'Limpar', 'Remove itens que não parecem balões de fala', () => { lastSig = ''; run(true); });
            btn('ink-ord-zero', 'Do zero', 'Reescaneia a página e ordena de novo', fromScratch);

            const seg = document.createElement('div');
            seg.className = 'io-seg';
            const mk = (id, txt, title, v) => {
                const b = document.createElement('button');
                b.id = id; b.type = 'button'; b.textContent = txt; b.title = title;
                b.onclick = () => setManga(v);
                seg.appendChild(b);
            };
            mk('ink-ord-west', '→ Ocidental', 'Leitura da esquerda para a direita', false);
            mk('ink-ord-manga', '← Mangá', 'Leitura da direita para a esquerda', true);
            bar.appendChild(seg);

            p.after(bar);
            paintMode();
        }

        if (!document.getElementById('ink-ord-st')) {
            const s = document.createElement('div');
            s.id = 'ink-ord-st';
            bar.after(s);
        }
    }

    async function fromScratch() {
        if (busy) return;
        const rs = document.querySelector('.bz-order__rescan:not(#ink-ord-btn):not(#ink-ord-zero):not(#ink-ord-clean):not(#ink-ord-manga)');
        if (!rs) { run(false); return; }
        say('Reescaneando do zero…');
        lastSig = 'x';
        rs.click();
        let last = '', same = 0;
        for (let i = 0; i < 50 && same < 5; i++) {
            await sleep(260);
            const s = sig();
            if (s && s === last) same++; else { same = 0; last = s; }
        }
        lastSig = '';
        run(false);
    }

    function manualMoves(T, want) {
        const cur = T.map(t => t.key);
        const out = [];
        for (let k = 0; k < want.length && out.length < 5; k++) {
            const j = cur.indexOf(want[k].key);
            if (j !== k) {
                out.push(`#${T.find(t => t.key === want[k].key).n} → pos ${k + 1}`);
                cur.splice(k, 0, cur.splice(j, 1)[0]);
            }
        }
        return out.join(' · ');
    }

    async function run(doClean = false) {
        if (busy) return;
        busy = true;
        let removed = [];
        scoreCache.clear();

        try {
            let T = tiles();
            if (T.length < 2) { say('Poucos itens encontrados'); return; }

            const pg = await getPage();

            if (doClean && pg) {
                say('Analisando possíveis não-balões…');
                const scored = T.map(t => ({ t, score: balloonScore(pg, t) }));
                const bad = scored.filter(x => x.score < SCORE_THRESHOLD).sort((a, b) => a.score - b.score);
                const maxRemove = Math.max(1, Math.floor(T.length * MAX_REMOVE_RATIO));
                const toRemove = bad.slice(0, maxRemove);

                if (toRemove.length === 0) {
                    say('Nenhum item com score baixo');
                } else {
                    say(`Removendo ${toRemove.length} item(ns)…`);
                    const keys = new Set(toRemove.map(x => x.t.key));
                    for (let g = 0; g < 30; g++) {
                        const t = tiles().find(x => keys.has(x.key));
                        if (!t) break;
                        const rb = t.el.querySelector('.bz-order__remove');
                        if (!rb) break;
                        removed.push(t.n);
                        keys.delete(t.key);
                        rb.click();
                        await sleep(360);
                    }
                }
            }

            T = tiles();
            if (T.length < 2) { say(removed.length ? `Pronto. Removidos: ${removed.join(', ')}` : 'Nada para ordenar'); return; }

            say('Calculando ordem…');
            let fails = 0;
            const tag = removed.length ? ` · removidos: ${removed.join(', ')}` : '';

            for (let g = 0; g < 900; g++) {
                T = tiles().sort((a, b) => a.x - b.x);
                const want = order(T, pg);

                const i = T.findIndex((t, k) => t.key !== want[k].key);
                if (i < 0) {
                    say(`Ordem certa ✓ (${T.length} bolhas · ${cfg.manga ? 'mangá ←' : 'ocidental →'})${tag} — toque em Salvar`);
                    return;
                }

                const tg = want[i];
                const j = T.findIndex(t => t.key === tg.key);
                const xs = T.map(t => t.x);
                const ds = xs.slice(1).map((x, k) => x - xs[k]).filter(d => d > 6);
                const W = ds.length ? Math.min(...ds) : 100;
                const steps = Math.min(j - i, 7);

                say(`Ordenando ${i + 1}/${T.length}  [${mode}]`);
                const beforeX = tg.el.getBoundingClientRect().left;
                await drag(tg.el, -(steps * W) - 4);

                const after = tiles().find(t => t.key === tg.key);
                const afterX = after ? after.el.getBoundingClientRect().left : beforeX;
                const moved = Math.abs(afterX - beforeX) > 10;

                if (!moved) {
                    fails++;
                    if (fails >= 2) {
                        const ci = MODES.indexOf(mode);
                        if (ci < MODES.length - 1) {
                            mode = MODES[ci + 1];
                            fails = 0;
                            say('Trocando para modo ' + mode + '…');
                        } else {
                            mode = MODES[0];
                            say('Não consegui arrastar. Faça à mão: ' + manualMoves(T, want));
                            return;
                        }
                    }
                } else {
                    fails = 0;
                    if (cfg.dmode !== mode) { cfg.dmode = mode; save(); }
                }
            }

        } catch (err) {
            say('Erro: ' + (err.message || err));
        } finally {
            busy = false;
            lastSig = sig();
        }
    }

    const MINE_SEL = '#ink-auto-ui, #ink-eye, #ink-ord-bar, #ink-ord-st';
    const fromOurUI = muts => muts.every(m => {
        const n = m.target && m.target.nodeType === 1 ? m.target : (m.target && m.target.parentElement);
        return n && n.closest && n.closest(MINE_SEL);
    });

    let obsQueued = false;
    function onDomChange() {
        obsQueued = false;
        const d = document.querySelector('.bz-order');
        const ap = document.getElementById('ink-auto-ui');
        if (ap && MOBILE) ap.style.display = d ? 'none' : '';
        if (!d) { lastSig = ''; return; }
        ui(d);
        if (!AUTO || busy) return;
        clearTimeout(tmr);
        tmr = setTimeout(() => {
            const s = sig();
            if (!busy && s && s !== lastSig) run(false);
        }, isPerf() ? 900 : 600);
    }
    new MutationObserver(muts => {
        if (obsQueued || fromOurUI(muts)) return;
        obsQueued = true;
        requestAnimationFrame(onDomChange);
    }).observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
        const d = document.querySelector('.bz-order');
        if (d) ui(d);
    }, 800);
})();