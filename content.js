// ==UserScript==
// @name         Ink Leitor
// @namespace    ink-leitor
// @version      4.13.18
// @description  Leitor automático, OCR, TTS, música, ordenador de capítulos, auto-arrumar bolhas, timer de sono, estatísticas e mais
// @match        https://www.ink.app.br/*
// @match        https://ink.app.br/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// @downloadURL  https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js
// ==/UserScript==

/* ====================================================================
 *  REGRAS OBRIGATÓRIAS PARA QUALQUER IA QUE EDITAR ESTE ARQUIVO
 *  1. O arquivo entregue deve SEMPRE se chamar exatamente: content.js
 *     (nunca content_v2.js, ink.js, novo.js etc.).
 *  2. Entregar o arquivo COMPLETO, nunca só trechos ou "diffs".
 *  3. Aumentar a versão em AMBOS os lugares: "@version" (cabeçalho)
 *     e "const VERSION = '…'" (logo abaixo). O atualizador lê a segunda.
 *  4. Manter o formato exato: const VERSION = 'X.Y.Z';
 *  5. NÃO apagar nem mover a ÚLTIMA linha do arquivo: o comentário de uma linha só com
 *     a palavra INK_EOF entre barra-asterisco e asterisco-barra, como já está no final.
 *     (o painel recusa atualizar se o arquivo do GitHub vier cortado, sem esse marcador).
 * ==================================================================== */
(() => {
    'use strict';
    if (window.__ink) return;
    window.__ink = true;
    const VERSION = '4.13.18';

    /* 4.13.10: programa de PC — "Atualizar" sem fechar o programa.
       O botão Atualizar guarda o arquivo novo no navegador do programa e recarrega a página;
       aqui, se o guardado for MAIS NOVO que este, roda ele no lugar. Quando o programa baixar
       uma versão igual ou mais nova sozinho (ao abrir), o guardado é descartado. */
    if (window.__INK_PC__ && !window.__inkHot) {
        try {
            const j = JSON.parse(localStorage.getItem('ink_pc_hot') || 'null');
            if (j && typeof j.text === 'string' && j.ver) {
                const a = String(j.ver).split('.').map(Number), b = VERSION.split('.').map(Number);
                let newer = false;
                for (let i = 0; i < 4; i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) { newer = d > 0; break; } }
                if (!newer) localStorage.removeItem('ink_pc_hot');
                else if (j.text.trimEnd().endsWith('/*' + 'INK_EOF' + '*/')) {
                    window.__inkHot = true;
                    window.__ink = false;
                    try { new Function(j.text)(); return; }
                    catch (e) { console.warn('[Ink] não consegui rodar a versão nova guardada', e); window.__ink = true; }
                }
            }
        } catch (e) { }
    }

    /* ---- 4.8.3: erro do script não pode chegar no tratador de erros do site ---- */
    const ERRS = [];
    const logErr = (onde, e) => {
        try {
            ERRS.push({ onde, msg: String((e && (e.stack || e.message)) || e).slice(0, 300), t: Date.now() });
            if (ERRS.length > 20) ERRS.shift();
            console.warn('[Ink] erro em ' + onde, e);
        } catch (x) { }
    };
    window.__inkErrs = ERRS;
    const guard = (onde, f) => function () {
        try {
            const r = f.apply(this, arguments);
            if (r && typeof r.catch === 'function') r.catch(e => logErr(onde, e));
            return r;
        } catch (e) { logErr(onde, e); }
    };
    const _st = window.setTimeout.bind(window), _si = window.setInterval.bind(window);
    const setTimeout = (f, ms, ...a) => typeof f === 'function' ? _st(guard('timeout', f), ms, ...a) : _st(f, ms);
    const setInterval = (f, ms, ...a) => typeof f === 'function' ? _si(guard('interval', f), ms, ...a) : _si(f, ms);
    const MutationObserver = class extends window.MutationObserver { constructor(cb) { super(guard('observer', cb)); } };

    /* modo seguro: dura 30 min e desliga o que mexe no DOM do site (PopupFix, Pular telas, Ordenar capítulos, Arrumar bolhas) */
    const SAFE = (() => { try { return Date.now() - (+sessionStorage.getItem('ink_safe') || 0) < 30 * 60000; } catch (e) { return false; } })();
    if (SAFE) console.info('[Ink] modo seguro ativo');

    /* se o SITE mostrar a tela de erro: 1ª vez recarrega; 2ª vez recarrega em modo seguro; depois desiste (sem loop) */
    (() => {
        const RX = /O Ink n[aã]o abriu neste aparelho/i;
        const t0 = Date.now();
        const tick = () => {
            if (!document.body) return;
            const t = document.body.textContent || '';
            const bad = t.length < 4000 && RX.test(t);
            if (!bad) {
                if (Date.now() - t0 > 20000) { try { sessionStorage.removeItem('ink_retry'); } catch (e) { } }
                if (Date.now() - t0 > 60000) clearInterval(iv);
                return;
            }
            let n = 0; try { n = +sessionStorage.getItem('ink_retry') || 0; } catch (e) { }
            if (n >= 2) { try { setStatus('⚠ O site não abriu (tentei 2x). Veja o console: [Ink]'); } catch (e) { } return; }
            try {
                sessionStorage.setItem('ink_retry', String(n + 1));
                if (n >= 1) sessionStorage.setItem('ink_safe', String(Date.now()));
            } catch (e) { }
            location.reload();
        };
        const iv = setInterval(tick, 1500);
    })();

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
    const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    // 4.13.3: só mexe no DOM quando o texto realmente mudou (evita redesenhar e o painel pular)
    const setText = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };

    /* ================================================================== *
     *  2. CONFIG
     * ================================================================== */
    const CFG_KEY = 'ink_cfg_v4';
    const DEFAULTS = {
        speed: 1.5, auto: true, voice: false, vrate: 1, vname: '',
        dict: '', favs: [], prep: null, prepDone: {}, tintaStop: false,               // 4.10.0: pronúncia e favoritos
        manga: false, method: '', methodM: '',
        girl: true, skin: 'gato',
        eye: false, eyeLvl: 0.25,
        perf: null, anx: 0, metaGoal: 10,
        pos: null, min: false, tab: 'read',
        musicUrl: '', musicKey: '', musicVol: 0.6,
        ytUrl: '', ytShow: true, duck: true, updSkip: '',
        // novidades 4.5.0
        last: null,                       // onde parou: { path, label, t }
        perWork: true, works: {},         // velocidade/direção lembradas por obra
        sleepMin: 0, sleepCaps: 0,        // timer de sono (minutos / capítulos)
        eyeAuto: false, eyeFrom: 20, eyeTo: 7,
        media: true,                      // controles na tela de bloqueio
        skipJunk: true,                   // pular balões sem sentido no audiolivro
        ocrLang: 'por',
        stats: { days: {} },
        full: false,
        seenVer: '',                      // última versão cujas novidades você já viu
        skipIntro: true,                  // fecha sozinho avisos/novidades que o site abre ao entrar
    };
    const cfg = { ...DEFAULTS };
    try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { }
    if (!cfg.works || typeof cfg.works !== 'object') cfg.works = {};
    if (!cfg.stats || typeof cfg.stats !== 'object' || !cfg.stats.days) cfg.stats = { days: {} };

    let _saveT;
    const saveCfg = () => { clearTimeout(_saveT); _saveT = setTimeout(() => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }, 150); };
    const isPerf = () => cfg.perf == null ? IS_MOBILE : !!cfg.perf;

    const SKINS = [
        { id: 'gato', nome: 'Gatinha', emo: '🐱' },
        { id: 'lobo', nome: 'Lobo', emo: '🐺' },
    ];
    const curSkin = () => SKINS.find(s => s.id === cfg.skin) || SKINS[0];

    const OCR_LANGS = [
        { id: 'por', nome: 'Português', vl: 'pt' },
        { id: 'por+eng', nome: 'Português + Inglês', vl: 'pt' },
        { id: 'eng', nome: 'Inglês', vl: 'en' },
        { id: 'jpn', nome: 'Japonês', vl: 'ja' },
    ];
    const curLang = () => OCR_LANGS.find(l => l.id === cfg.ocrLang) || OCR_LANGS[0];

    // 4.13.3: a caixa de status tem altura fixa; só reescreve quando a mensagem muda e volta ao início do texto
    const setStatus = msg => { const el = $('ink-status'); if (el && el.textContent !== msg) { el.textContent = msg; el.scrollTop = 0; } };

    /* ---- Por obra: lembra velocidade e direção de cada obra ---- */
    const RX_OBRA = /(manga|manhwa|hq|comic|obra|capitulo|titulo|series)/i;
    function workKey() {
        try { const s = sessionStorage.getItem('ink_work'); if (s) return s; } catch (e) { }
        const seg = location.pathname.split('/').filter(Boolean);
        return seg.length >= 3 ? '/' + seg.slice(0, -1).join('/') : '';
    }
    function workSave() {
        if (!cfg.perWork) return;
        const k = workKey(); if (!k) return;
        cfg.works[k] = { speed: cfg.speed, manga: !!cfg.manga, t: Date.now() };
        const ks = Object.keys(cfg.works);
        if (ks.length > 200) ks.sort((a, b) => (cfg.works[a].t || 0) - (cfg.works[b].t || 0)).slice(0, ks.length - 200).forEach(x => delete cfg.works[x]);
        saveCfg();
    }

    /* ================================================================== *
     *  3. ANDROID POPUP FIX
     * ================================================================== */
    const PopupFix = (() => {
        const KEY = 'serei sempre legal';
        const LOCKS = new Set(['modal-open', 'no-scroll', 'locked', 'overflow-hidden', 'is-locked', 'scroll-lock', 'blur']);
        const MINE = '#ink-panel,#ink-news,#ink-eye-el,#ink-order,#ink-dbg,#ink-auto-row';
        let popupAt = 0, timer = 0, lastRun = 0;

        const isMine = el => !!(el && el.closest && el.closest(MINE));

        const findPopup = () => {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: n => {
                    const p = n.parentElement;
                    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            let n;
            while ((n = w.nextNode())) {
                if (n.nodeValue && n.nodeValue.toLowerCase().includes(KEY) && !isMine(n.parentElement) && !n.parentElement.closest('[data-ink-hid]')) return n.parentElement;
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
                if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9) el.style.setProperty('display', 'none', 'important');
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
                if (box && !box.dataset.inkHid) { box.dataset.inkHid = '1'; box.style.setProperty('display', 'none', 'important'); popupAt = Date.now(); }
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
            try { tick(); } catch (e) { logErr('popup', e); }
            new MutationObserver(muts => {
                if (Date.now() - popupAt < 6000) { schedule(); return; }
                for (const m of muts) for (const n of m.addedNodes) if (hasKey(n)) { schedule(); return; }
            }).observe(document.documentElement, { childList: true, subtree: true });
            setInterval(schedule, 3000);
        };
        if (SAFE) { /* modo seguro: não mexe no site */ }
        else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
        // usado pelo "Pular telas iniciais": destrava a rolagem e tira cortinas que sobraram
        return { boost: () => { popupAt = Date.now(); try { killBackdrops(); unlock(); } catch (e) { } } };
    })();

    /* ================================================================== *
     *  3b. PULAR TELAS INICIAIS
     *  Fecha os avisos / novidades / boas-vindas que o site abre sozinho
     *  (ex.: "NOVIDADE — As Tirinhas chegaram na comunidade!").
     *  - Botão ⏭ do painel: pula agora, mesmo que venha mais de uma tela seguida.
     *  - Automático (cfg.skipIntro): só nos primeiros 25 s depois de abrir ou trocar
     *    de página, e só em telas que apareceram SOZINHAS (nunca logo após um toque seu).
     *  Só clica em botões de fechar / pular / "agora não"; nunca em "Ver agora",
     *  "Aceitar" e afins. O leitor (imagens, canvas, ordenador de balões) é ignorado.
     * ================================================================== */
    const SkipIntro = (() => {
        const MINE = '#ink-panel,#ink-news,#ink-eye-el,#ink-order,#ink-dbg,#ink-auto-row';
        const RX_TXT = /^(fechar|close|dismiss|pular|skip|pular\s+tudo|pular\s+tutorial|agora\s+n[aã]o|n[aã]o\s+agora|depois|mais\s+tarde|talvez\s+depois|n[aã]o,?\s+obrigad[oa]|cancelar|entendi|x|×|✕|✖|╳)$/i;
        const RX_ATTR = /(fechar|close|dismiss|pular|skip)/i;
        const RX_NOT = /(compartilh|share|curti|like|play|voltar|back|menu|search|busca)/i;
        const WINDOW_MS = 25000;
        let tapAt = 0, bornAt = Date.now(), path = location.pathname, busy = false;
        const tries = new WeakMap();

        const mine = el => !!(el && el.closest && el.closest(MINE));
        const vis = el => {
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return false;
            let cs; try { cs = getComputedStyle(el); } catch (e) { return false; }
            return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') > 0.05;
        };
        // conteúdo do app (leitor, lista grande, ordenador) não é "tela inicial"
        const isApp = el => !!el.querySelector('canvas,video,.comic-page,.bz-order') || el.querySelectorAll('img').length > 3 || el.querySelectorAll('button,a').length > 12;

        function overlays() {
            const out = [], seen = new Set();
            const add = el => { if (!seen.has(el)) { seen.add(el); out.push(el); } };
            $$('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"]').forEach(add);
            $$('body > *, body > * > *, body > * > * > *').forEach(el => {
                if (seen.has(el)) return;
                let cs; try { cs = getComputedStyle(el); } catch (e) { return; }
                if (cs.position !== 'fixed') return;
                const r = el.getBoundingClientRect();
                if (r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.2) add(el);
            });
            const panel = $('ink-panel');
            return out.filter(el => !mine(el) && !(panel && el.contains(panel)) && vis(el) && !isApp(el));
        }

        function findClose(box) {
            const cands = $$('button,[role="button"],a,[tabindex]', box).filter(b => !mine(b) && vis(b));
            // 1) botão com texto/rótulo de fechar ou pular
            for (const b of cands) {
                const t = txt(b), at = ((b.getAttribute('aria-label') || '') + ' ' + (b.title || '')).trim();
                if (t && RX_TXT.test(t)) return b;
                if (at && RX_ATTR.test(at) && t.length < 25) return b;
            }
            // 2) só um ícone pequeno (o "X" redondo do canto) — escolhe o mais alto e mais à direita
            if (cands.length > 4) return null;
            const icons = cands.filter(b => {
                if (txt(b).length > 1 || !b.querySelector('svg,img,i')) return false;
                const r = b.getBoundingClientRect();
                if (r.width > 64 || r.height > 64) return false;
                return !RX_NOT.test((b.getAttribute('aria-label') || '') + ' ' + (b.title || ''));
            });
            icons.sort((a, b) => {
                const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
                return (ra.top - rb.top) || (rb.right - ra.right);
            });
            return icons[0] || null;
        }

        // última opção do botão manual: esconde (sem apagar do DOM, p/ não quebrar o site)
        function canHide(box) {
            if (location.pathname.startsWith('/ler/')) return false;   // no leitor nunca esconde nada
            const dlg = box.matches('dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"]');
            if (dlg) return true;
            return (box.textContent || '').trim().length >= 20 && box.querySelectorAll('button,a').length <= 4 && box.querySelectorAll('img').length <= 1;
        }

        async function dismiss(box, manual) {
            const n = (tries.get(box) || 0) + 1; tries.set(box, n);
            if (!manual && n > 3) return false;
            const b = findClose(box);
            if (b) {
                try { b.click(); } catch (e) { }
                for (let i = 0; i < 6; i++) { await sleep(120); if (!box.isConnected || !vis(box)) return true; }
            }
            if (manual && canHide(box)) { box.style.setProperty('display', 'none', 'important'); return true; }
            return false;
        }

        async function run(manual) {
            if (busy) return 0;
            busy = true;
            let n = 0;
            try {
                for (let pass = 0; pass < 5; pass++) {
                    let did = false;
                    for (const box of overlays()) { if (await dismiss(box, manual)) { n++; did = true; break; } }
                    if (!did) break;
                    await sleep(350);   // dá tempo da próxima tela (se houver) aparecer
                }
                if (n) PopupFix.boost();
            } finally { busy = false; }
            return n;
        }

        const msg = n => n === 1 ? '⏭ 1 tela pulada' : `⏭ ${n} telas puladas`;

        function auto() {
            if (!cfg.skipIntro || busy || document.hidden) return;
            if (location.pathname !== path) { path = location.pathname; bornAt = Date.now(); }   // site é SPA
            if (Date.now() - bornAt > WINDOW_MS) return;
            if (Date.now() - tapAt < 1500) return;                                              // acabou de tocar: não mexe
            run(false).then(n => { if (n) setStatus(msg(n)); }).catch(() => { });
        }

        async function now() {
            setStatus('⏭ Procurando telas…');
            const n = await run(true);
            setStatus(n ? msg(n) : 'Nenhuma tela para pular');
            return n;
        }

        function start() {
            if (SAFE) return;
            const tap = () => { tapAt = Date.now(); };
            document.addEventListener('pointerdown', tap, true);
            document.addEventListener('keydown', tap, true);
            setTimeout(auto, 400);
            setInterval(auto, 900);
        }
        return { now, start };
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
            if (e === document.documentElement || e === document.body || e.closest('#ink-panel,#ink-eye-el')) continue;
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

    const _camCache = { value: '', at: 0 };
    const readCamSig = () => {
        const now = performance.now();
        if (now - _camCache.at >= 90) {
            _camCache.value = camSig();
            _camCache.at = now;
        }
        return _camCache.value;
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
        o.cam = readCamSig();
        o.sig = [o.b, o.bt, o.p, o.pt, o.pg, o.pgt, o.pct, o.cam].join('|');
        return o;
    };
    const atEnd = st => st.p != null && st.p === st.pt && st.b === st.bt;
    const nearEnd = st => atEnd(st) || (st.pg != null && st.pg === st.pgt) || (st.pct != null && st.pct >= 98);
    const stateLabel = st => st.b != null ? `balão ${st.b}/${st.bt} · pág ${st.p}/${st.pt}` : (st.pg != null ? `pág ${st.pg}/${st.pgt}` : (st.pct != null ? `${st.pct}%` : 'lendo'));

    /* ================================================================== *
     *  5. NAVEGAÇÃO
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
     *  6. BUBBLE SORTER (Auto-Arrumar Mangá/HQ)
     *   - cada bolha é um <div class="bz-order__tile"> dentro de .bz-order__track
     *   - o arraste usa EVENTOS DE PONTEIRO (não o drag-and-drop nativo)
     *   - plano A: a miniatura (.bz-order__thumb) é um recorte da página via
     *     background-image/-size/-position → dá pra calcular onde a bolha está
     *   - plano B (4.9.1): quando a miniatura NÃO é um recorte (size="auto"),
     *     lê a posição pelas caixas numeradas desenhadas sobre a página
     *   - 4.13.2: arraste rápido (poucos passos, sem esperas fixas, tenta mover
     *     direto para o lugar certo); se falhar, volta sozinho ao modo lento
     *   - 4.13.4: esperas do arraste ainda menores (menos passos, sem pausas longas)
     * ================================================================== */
    const BubbleSorter = (() => {
        let isOpen = false;
        const TILE = '.bz-order__tile';

        let fallbackScanAt = 0;
        function findModal() {
            const m = document.querySelector('.bz-order');
            if (m) return m;
            // A busca alternativa percorre os botões do site; limita a frequência sem atrasar
            // a detecção normal do modal .bz-order.
            const now = performance.now();
            if (now - fallbackScanAt < 350) return null;
            fallbackScanAt = now;
            for (const b of $$('button')) {
                if (!/^reescanear$/i.test(txt(b)) || b.closest('#ink-panel')) continue;
                let el = b.parentElement;
                for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
                    if (/arrumar as bolhas/i.test(el.textContent || '') && $$('button', el).some(x => /^salvar$/i.test(txt(x)))) return el;
                }
            }
            return null;
        }

        function getTiles() {
            const modal = findModal();
            let t = $$(TILE, modal || document);
            if (!t.length) {
                const tr = (modal || document).querySelector('.bz-order__track');
                if (tr) t = [...tr.children];
            }
            // o quadrado "+" (adicionar) não tem miniatura e não pode contar como bolha
            const comThumb = t.filter(k => k.querySelector('.bz-order__thumb'));
            if (comThumb.length) return comThumb;
            return t.filter(k => /bolha/i.test(k.getAttribute('aria-label') || ''));
        }

        // plano A: posição da bolha na página (frações 0..1), lida do recorte da miniatura
        let lastWhy = '';
        function boxOf(tile) {
            const th = tile.querySelector('.bz-order__thumb') || tile.firstElementChild;
            if (!th) { lastWhy = 'sem .bz-order__thumb'; return null; }
            let cs; try { cs = getComputedStyle(th); } catch (e) { lastWhy = 'sem estilo'; return null; }
            const bsRaw = th.style.backgroundSize || cs.backgroundSize || '';
            const bpRaw = th.style.backgroundPosition || cs.backgroundPosition || '';
            const w = parseFloat(th.style.width) || parseFloat(cs.width);
            const h = parseFloat(th.style.height) || parseFloat(cs.height);
            const bs = bsRaw.match(/-?[\d.]+(?:px|%)?/g), bp = bpRaw.match(/-?[\d.]+(?:px|%)?/g);
            lastWhy = `size="${bsRaw}" pos="${bpRaw}" w=${w} h=${h}`;
            if (!bs || bs.length < 2 || !bp || bp.length < 2 || !(w > 0 && h > 0)) return null;
            const bw = /%$/.test(bs[0]) ? w * parseFloat(bs[0]) / 100 : parseFloat(bs[0]);
            const bh = /%$/.test(bs[1]) ? h * parseFloat(bs[1]) / 100 : parseFloat(bs[1]);
            if (!(bw > 0 && bh > 0)) return null;
            const px = /%$/.test(bp[0]) ? (w - bw) * parseFloat(bp[0]) / 100 : parseFloat(bp[0]);
            const py = /%$/.test(bp[1]) ? (h - bh) * parseFloat(bp[1]) / 100 : parseFloat(bp[1]);
            if (!isFinite(px) || !isFinite(py)) return null;
            return { l: -px / bw, t: -py / bh, r: (-px + w) / bw, b: (-py + h) / bh };
        }

        // plano B: as caixas numeradas (1, 2, 3…) desenhadas sobre a página, acima da fileira de bolhas.
        // Devolve { numero: {l,t,r,b} } em pixels da tela, ou null se não achar todas.
        function overlayBoxes(count) {
            const modal = findModal();
            const track = (modal || document).querySelector('.bz-order__track') || (getTiles()[0] || {}).parentElement || null;
            const limit = track ? track.getBoundingClientRect().top : innerHeight;
            const badges = new Map();
            for (const el of $$('*', document.body)) {
                if (el.childElementCount !== 0) continue;
                const t = (el.textContent || '').trim();
                if (!/^\d{1,2}$/.test(t)) continue;
                const n = +t;
                if (n < 1 || n > count || badges.has(n)) continue;
                if (el.closest('#ink-panel,#ink-auto-row,#ink-news')) continue;
                if (el.closest(TILE) || (track && track.contains(el))) continue;
                let r; try { r = el.getBoundingClientRect(); } catch (e) { continue; }
                if (r.width < 4 || r.height < 4 || r.width > 80 || r.height > 80) continue;
                if (r.top < 0 || r.bottom > limit + 4) continue;
                badges.set(n, { el, r });
            }
            if (badges.size < count) { lastWhy = `achei ${badges.size} de ${count} números sobre a página`; return null; }
            const out = {};
            badges.forEach(({ el, r }, n) => {
                let best = r, p = el.parentElement;
                for (let i = 0; i < 3 && p && p !== document.body; i++, p = p.parentElement) {
                    let pr; try { pr = p.getBoundingClientRect(); } catch (e) { break; }
                    if (pr.width > innerWidth * 0.6 || pr.height > innerHeight * 0.35) break;
                    if (pr.width < r.width * 0.9 || pr.height < r.height * 0.9) break;
                    let outro = false;
                    badges.forEach(o => { if (o.el !== el && p.contains(o.el)) outro = true; });
                    if (outro) break;
                    best = pr;
                }
                out[n] = { l: best.left, t: best.top, r: best.right, b: best.bottom };
            });
            return out;
        }

        // 4.13.17: no mangá, forma faixas pela posição SUPERIOR dos balões.
        // Isso evita que um balão/quadro alto expanda a faixa e misture linhas
        // diferentes. Dentro de cada faixa, a leitura segue da direita para a esquerda.
        // A lógica antiga do modo HQ é mantida para não alterar seu comportamento.
        function orderBoxes(pts, mode) {
            if (mode === 'manga') {
                const left = Math.min(...pts.map(p => p.bx.l));
                const right = Math.max(...pts.map(p => p.bx.r));
                const top = Math.min(...pts.map(p => p.bx.t));
                const bottom = Math.max(...pts.map(p => p.bx.b));
                const pageW = Math.max(right - left, 0.0001);
                const pageH = Math.max(bottom - top, 0.0001);
                const median = values => {
                    const a = values.slice().sort((x, y) => x - y);
                    return a[Math.floor(a.length / 2)] || 0;
                };
                const byTop = pts.slice().sort((a, b) =>
                    (a.bx.t - b.bx.t) || (b.bx.r - a.bx.r)
                );
                const rows = [];

                for (const item of byTop) {
                    const h = Math.max(item.bx.b - item.bx.t, pageH * 0.01);
                    let chosen = null;
                    let bestScore = Infinity;

                    for (const row of rows) {
                        const rowTop = median(row.items.map(p => p.bx.t));
                        const rowH = median(row.items.map(p => Math.max(p.bx.b - p.bx.t, pageH * 0.01)));
                        const tolerance = Math.max(pageH * 0.025, Math.min(h, rowH) * 0.42);
                        const delta = Math.abs(item.bx.t - rowTop);
                        if (delta <= tolerance) {
                            const score = delta / tolerance;
                            if (score < bestScore) {
                                bestScore = score;
                                chosen = row;
                            }
                        }
                    }

                    if (chosen) chosen.items.push(item);
                    else rows.push({ items: [item] });
                }

                rows.sort((a, b) =>
                    median(a.items.map(p => p.bx.t)) - median(b.items.map(p => p.bx.t))
                );

                const ordered = [];
                for (const row of rows) {
                    row.items.sort((a, b) => {
                        const ax = (a.bx.l + a.bx.r) / 2;
                        const bx = (b.bx.l + b.bx.r) / 2;
                        const dx = ax - bx;
                        // Balões praticamente na mesma coluna: mantém o de cima primeiro.
                        if (Math.abs(dx) <= pageW * 0.025) {
                            return (a.bx.t - b.bx.t) || (b.bx.r - a.bx.r);
                        }
                        return -dx; // mangá: direita → esquerda
                    });
                    ordered.push(...row.items.map(p => p.el));
                }
                return ordered;
            }

            // Modo HQ: comportamento original (esquerda → direita por faixa).
            const byTop = pts.slice().sort((a, b) => a.bx.t - b.bx.t);
            const rows = [];
            for (const it of byTop) {
                const row = rows[rows.length - 1];
                if (row) {
                    const ov = Math.min(row.b, it.bx.b) - Math.max(row.t, it.bx.t);
                    const minH = Math.min(row.b - row.t, it.bx.b - it.bx.t);
                    if (ov > minH * 0.4) {
                        row.items.push(it);
                        row.t = Math.min(row.t, it.bx.t); row.b = Math.max(row.b, it.bx.b);
                        continue;
                    }
                }
                rows.push({ t: it.bx.t, b: it.bx.b, items: [it] });
            }
            const cx = p => (p.bx.l + p.bx.r) / 2;
            const dir = (a, b) => cx(a) - cx(b);
            const empilhadas = (a, b) => Math.min(a.bx.r, b.bx.r) - Math.max(a.bx.l, b.bx.l) > Math.min(a.bx.r - a.bx.l, b.bx.r - b.bx.l) * 0.5;
            return rows.flatMap(r => {
                const cols = [];
                for (const it of r.items.sort(dir)) {
                    const col = cols.find(c => c.some(o => empilhadas(o, it)));
                    if (col) col.push(it); else cols.push([it]);
                }
                return cols.flatMap(c => c.sort((a, b) => a.bx.t - b.bx.t));
            }).map(p => p.el);
        }

        const curOrder = () => getTiles().slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

        const pev = (type, x, y) => new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: x, clientY: y, screenX: x, screenY: y,
            pointerId: 1, pointerType: 'mouse', isPrimary: true,
            button: type === 'pointermove' ? -1 : 0,
            buttons: type === 'pointerup' ? 0 : 1
        });

        /* ritmos do arraste: 0 = rápido, 1 = médio, 2 = lento (segura antes de arrastar).
           hold = espera depois de apertar · steps/gap = passos do movimento · pre = espera antes de soltar
           wait = quanto esperar a bolha mudar de lugar · settle = espera a animação assentar
           4.13.4: valores menores em todos os ritmos */
        const PACE = [
            { hold: 0, steps: 1, gap: 0, pre: 0, wait: 250, settle: 6 },
            { hold: 12, steps: 4, gap: 3, pre: 12, wait: 400, settle: 40 },
            { hold: 200, steps: 6, gap: 6, pre: 25, wait: 650, settle: 100 }
        ];
        let slow = 0, okRun = 0, jumpBad = false;   // aprendem durante o uso: se o rápido falha, sobe o nível

        async function dragBy(el, dx, P) {
            const r = el.getBoundingClientRect();
            const x0 = r.left + r.width / 2, y = r.top + r.height / 2;
            // o toque real cai no elemento de dentro (miniatura); o evento sobe até o quadrado
            const hit = document.elementFromPoint(x0, y);
            const t = hit && el.contains(hit) ? hit : el;
            t.dispatchEvent(pev('pointerdown', x0, y));
            await sleep(P.hold);
            for (let i = 1; i <= P.steps; i++) {
                t.dispatchEvent(pev('pointermove', x0 + dx * i / P.steps, y));
                await sleep(P.gap);
            }
            await sleep(P.pre);
            t.dispatchEvent(pev('pointerup', x0 + dx, y));
        }

        // depois de soltar: espera a bolha mudar de posição (sem tempo fixo) e a animação assentar
        async function waitMoved(el, from, P) {
            const t0 = performance.now();
            while (performance.now() - t0 < P.wait) {
                await sleep(1);
                if (curOrder().indexOf(el) !== from) {
                    await sleep(P.settle);
                    const now = curOrder().indexOf(el);
                    if (now !== from) return now;     // se voltou ao lugar, o toque não pegou: continua esperando
                }
            }
            return curOrder().indexOf(el);
        }

        const inView = r => r.left >= 4 && r.right <= innerWidth - 4;

        // move a bolha em direção à posição `target`. Tenta ir direto; se não der, anda uma casa.
        // Devolve a posição onde ela ficou, ou -1 se não saiu do lugar.
        async function moveTo(el, target) {
            const from = curOrder().indexOf(el);
            if (from < 0) return -1;
            if (from === target) return from;
            const dir = target < from ? -1 : 1;
            for (let tryN = 0; tryN < 3; tryN++) {
                const lvl = Math.min(2, tryN + slow), P = PACE[lvl];
                el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
                await sleep(lvl ? 15 : 0);
                const ord = curOrder();
                const me = el.getBoundingClientRect();
                let to = from + dir;
                if (tryN === 0 && !jumpBad && Math.abs(target - from) > 1 && ord[target]) {
                    const far = ord[target].getBoundingClientRect();
                    if (inView(far) && inView(me)) to = target;      // as duas estão na tela: vai direto
                }
                if (!ord[to]) return -1;
                const tg = ord[to].getBoundingClientRect();
                const dx = (tg.left + tg.width / 2) - (me.left + me.width / 2) + dir * (6 + tryN * 16);
                await dragBy(el, dx, P);
                const now = await waitMoved(el, from, P);
                if (now === to) {
                    if (lvl > slow) { slow = lvl; okRun = 0; }
                    else if (slow > 0 && ++okRun >= 10) { slow--; okRun = 0; }   // 10 acertos seguidos: tenta mais rápido de novo
                    return now;
                }
                if (now >= 0 && now !== from) {
                    if (to !== from + dir) jumpBad = true;     // o pulo direto não caiu certo: só uma casa por vez daqui pra frente
                    return now;
                }
                if (tryN === 0 && slow === 0) okRun = 0;
            }
            console.warn('[Ink] a bolha na posição', from + 1, 'não se mexeu');
            return -1;
        }

        let stopAsked = false, working = false, undoOrder = null;
        const clearPreview = () => $$('.ink-prev').forEach(e => e.remove());

        // põe a bolha na posição i (pode precisar de mais de um arraste)
        async function place(el, i) {
            for (let guard = 0; guard < 30; guard++) {
                if (stopAsked) return false;
                if (curOrder().indexOf(el) === i) return true;
                if (await moveTo(el, i) < 0) return false;
            }
            return curOrder().indexOf(el) === i;
        }

        async function reorder(sorted, onStep) {
            // pointer capture com ponteiro sintético dá erro; engole só durante o arraste
            const oSet = Element.prototype.setPointerCapture, oRel = Element.prototype.releasePointerCapture;
            Element.prototype.setPointerCapture = function (id) { try { return oSet.call(this, id); } catch (e) { } };
            Element.prototype.releasePointerCapture = function (id) { try { return oRel.call(this, id); } catch (e) { } };
            try {
                // 4.13.9: menos arrastes. Deixa parada a maior sequência que já está na ordem certa
                // e só move as outras (antes: até 1 arraste por posição, mesmo sem precisar)
                const seq = curOrder().map(e => sorted.indexOf(e)), n = seq.length;
                const len = new Array(n).fill(1), prev = new Array(n).fill(-1);
                for (let a = 0; a < n; a++) for (let b = 0; b < a; b++) if (seq[b] < seq[a] && len[b] + 1 > len[a]) { len[a] = len[b] + 1; prev[a] = b; }
                let end = 0; for (let a = 1; a < n; a++) if (len[a] > len[end]) end = a;
                const stay = new Set();
                for (let a = end; a >= 0; a = prev[a]) stay.add(seq[a]);
                const todo = sorted.map((_, k) => k).filter(k => !stay.has(k));
                for (let c = 0; c < todo.length; c++) {
                    const k = todo[c], el = sorted[k];
                    if (stopAsked) return false;
                    const ord = curOrder(), from = ord.indexOf(el);
                    let want = 0;
                    if (k > 0) { const pi = ord.indexOf(sorted[k - 1]); want = from < pi ? pi : pi + 1; }
                    if (onStep) onStep(c + 1, todo.length);
                    if (!await place(el, want)) break;
                }
                if (curOrder().every((e, i) => e === sorted[i])) return true;
                // garantia: se algo saiu diferente, arruma posição por posição como antes
                for (let i = 0; i < sorted.length; i++) {
                    const el = sorted[i];
                    if (stopAsked) return false;
                    if (!await place(el, i)) return false;
                }
                return curOrder().every((e, i) => e === sorted[i]);
            } finally {
                Element.prototype.setPointerCapture = oSet;
                Element.prototype.releasePointerCapture = oRel;
            }
        }

        async function run(mode, say, preview) {
            const tiles = getTiles();
            if (tiles.length < 2) { say(tiles.length ? '⚠ Só 1 balão, nada pra ordenar' : '⚠ Não achei os balões nesta tela'); return tiles.length === 1; }

            // plano A: recorte da miniatura
            let pts = [], failA = '';
            for (let i = 0; i < tiles.length; i++) {
                const bx = boxOf(tiles[i]);
                if (!bx) { failA = `bolha ${i + 1}: ${lastWhy}`; console.warn('[Ink] bolha', i + 1, lastWhy, tiles[i].outerHTML.slice(0, 400)); pts = null; break; }
                pts.push({ el: tiles[i], bx });
            }

            // plano B: caixas numeradas sobre a página (número = posição atual da bolha na fileira)
            if (!pts) {
                const cur = curOrder();
                const ov = overlayBoxes(cur.length);
                if (!ov) { say(`⚠ Não li a posição das bolhas (${failA}; ${lastWhy})`); return; }
                pts = cur.map((el, i) => ({ el, bx: ov[i + 1] }));
                console.info('[Ink] usei as caixas numeradas da página (plano B)');
            }

            const sorted = orderBoxes(pts, mode);
            if (preview) { showPreview(sorted, say); return; }
            const lbl = e => (e.getAttribute('aria-label') || '?').replace(/\D+/g, '');
            console.info('[Ink] ordem atual:', curOrder().map(lbl).join(','), '→ alvo:', sorted.map(lbl).join(','));
            if (curOrder().every((e, i) => e === sorted[i])) { say(`✓ Já estava na ordem certa (${mode === 'manga' ? 'mangá' : 'HQ'})`); return true; }
            say('⏳ Arrumando…');
            undoOrder = curOrder();
            const ok = await reorder(sorted, (n, t) => say(`⏳ Movendo ${n} de ${t} · as outras ${tiles.length - t} já estão no lugar`));
            if (stopAsked) say('⏹ Parado. Toque em Desfazer para voltar à ordem anterior.');
            else if (ok) say(`✓ ${tiles.length} balões arrumados (${mode === 'manga' ? 'mangá' : 'HQ'}). Confira e toque em Salvar.`);
            else say('⚠ Não consegui arrastar tudo. Confira os números antes de Salvar.');
            return ok && !stopAsked;
        }

        // mostra, ao lado de cada número atual, o número que a bolha vai receber (não move nada)
        function showPreview(sorted, say) {
            const cur = curOrder(), ov = overlayBoxes(cur.length);
            if (!ov) { say('⚠ Não achei os números na página para mostrar a prévia'); return; }
            cur.forEach((el, i) => {
                const b = ov[i + 1], d = document.createElement('div');
                d.className = 'ink-prev';
                d.textContent = '→' + (sorted.indexOf(el) + 1);
                d.style.cssText = `position:fixed;left:${(b.l + b.r) / 2}px;top:${b.t}px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;background:#1565c0;color:#fff;border-radius:8px;padding:1px 5px;font:700 12px sans-serif;`;
                document.body.appendChild(d);
            });
            say('👁 Prévia em azul (nada foi movido). Toque em Prévia de novo para esconder.');
        }

        async function undo(say) {
            const back = undoOrder;
            if (!back) { say('Nada para desfazer'); return; }
            const now = curOrder();
            if (back.length !== now.length || !back.every(e => now.includes(e))) { undoOrder = null; say('⚠ As bolhas mudaram, não dá para desfazer. Use Cancelar.'); return; }
            say('⏳ Desfazendo…');
            const ok = await reorder(back, (n, t) => say(`⏳ Desfazendo: posição ${n} de ${t}…`));
            if (ok) { undoOrder = null; say('↶ Ordem anterior de volta'); }
            else say('⚠ Não terminei de desfazer. Toque de novo ou use Cancelar.');
        }

        function injectUI() {
            const modal = findModal();
            if (!modal || modal.querySelector('#ink-auto-row')) return;
            const row = document.createElement('div');
            row.id = 'ink-auto-row';
            row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:8px 0;align-items:center;';
            const css = 'color:#fff;border:none;border-radius:10px;padding:9px 14px;font-weight:700;cursor:pointer;font-size:13px;font-family:inherit;';
            const btn = document.createElement('button');
            const tog = document.createElement('button');
            const msg = document.createElement('div');
            btn.type = tog.type = 'button';
            btn.style.cssText = css + 'flex:1;';
            tog.style.cssText = css + 'background:rgba(255,255,255,.14);';
            msg.style.cssText = 'flex:1 1 100%;font-size:12.5px;line-height:1.35;color:#a9d2ff;min-height:0;';
            tog.textContent = '⇄';
            tog.title = 'Trocar entre HQ (← →) e Mangá (→ ←)';
            const say = t => { msg.textContent = t; setStatus(t); };
            const paint = () => { btn.textContent = cfg.manga ? '↔ Auto Mangá (→ ←)' : '↔ Auto HQ (← →)'; btn.style.background = cfg.manga ? '#e8573f' : '#ff69b4'; };
            paint();
            tog.onclick = e => { e.preventDefault(); cfg.manga = !cfg.manga; saveCfg(); workSave(); paint(); refreshPanel(); };
            const mk = (label, title) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.style.cssText = css + 'flex:1;background:rgba(255,255,255,.14);'; return b; };
            const prev = mk('👁 Prévia', 'Mostra a nova ordem sem mover nada');
            const und = mk('↶ Desfazer', 'Volta à ordem de antes do último Auto');
            const halt = mk('⏹ Parar', 'Interrompe o arraste');
            halt.hidden = true;
            // só uma operação por vez
            const job = async fn => {
                if (working) return;
                working = true; stopAsked = false; clearPreview();
                [btn, tog, prev, und].forEach(b => b.disabled = true);
                halt.hidden = false;
                try { await fn(); } catch (err) { say('⚠ ' + (err.message || err)); }
                working = false; stopAsked = false;
                [btn, tog, prev, und].forEach(b => b.disabled = false);
                halt.hidden = true;
                paint();
            };
            const mode = () => cfg.manga ? 'manga' : 'hq';
            btn.onclick = e => { e.preventDefault(); job(() => { btn.textContent = '⏳ Arrumando…'; return run(mode(), say); }); };
            prev.onclick = e => { e.preventDefault(); if ($$('.ink-prev').length) { clearPreview(); say(''); } else job(() => run(mode(), say, true)); };
            und.onclick = e => { e.preventDefault(); job(() => undo(say)); };
            halt.onclick = e => { e.preventDefault(); stopAsked = true; say('⏹ Parando…'); };
            tog.addEventListener('click', clearPreview);
            const extra = document.createElement('div');
            extra.style.cssText = 'display:flex;gap:8px;flex:1 1 100%;';
            extra.append(prev, und, halt);
            row.append(btn, tog, extra, msg);
            const hint = $$('p,div,span', modal).find(e => e.childElementCount === 0 && /arraste pra mudar/i.test(e.textContent || ''));
            const re = $$('button', modal).find(b => /^reescanear$/i.test(txt(b)));
            if (hint) hint.insertAdjacentElement('afterend', row);
            else if (re && re.parentElement) re.parentElement.insertAdjacentElement('afterend', row);
            else modal.prepend(row);
        }

        function start() {
            if (SAFE) return;
            setInterval(() => {
                isOpen = !!findModal();
                if (isOpen) injectUI();
                else { clearPreview(); undoOrder = null; }
            }, isPerf() ? 1200 : 700);
        }

        // usado pelo modo "Preparar capítulo"
        async function arrange(mode, say) {
            if (working) return false;
            working = true; stopAsked = false; clearPreview();
            try { return await run(mode, say) === true; }
            finally { working = false; }
        }
        const halt = () => { if (working) stopAsked = true; };

        return { start, findModal, getTiles, arrange, halt, get isOpen() { return isOpen; } };
    })();

    /* ================================================================== *
     *  6b. PREPARAR CAPÍTULO: arruma e salva as bolhas página por página
     *  4.13.2: esperas fixas menores (o que ainda espera, espera só até o site responder)
     *  4.13.3: o painel não pula durante o preparo (caixas de texto com altura fixa,
     *          a linha "Continuar" guarda o lugar e o detalhe de cada posição vai só no status do topo)
     *  4.13.4: ainda mais rápido: consulta o site com mais frequência, esperas menores
     *          ao trocar de página, ao carregar as bolhas e ao fechar a tela de arrumar
     * ================================================================== */
    const Prep = (() => {
        let on = false, stText = '';
        const RX = /^(?:(\d+)\s*\/\s*(\d+)\s*[·•|-]\s*)?(\d+)\s*\/\s*(\d+)$/;
        const STOP = new Error('parado'), TINTA = new Error('tintas');
        const check = () => { if (!on) throw STOP; };
        const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const mine = e => e.closest('#ink-panel,#ink-news,#ink-auto-row,[data-ink-freeze]');

        // contador do site, lido na hora: "4/24" ou "1/6 · 4/24"
        let ctrEl = null;
        function counter() {
            const read = e => { const m = e && e.isConnected && RX.exec(txt(e)); return m && +m[3] >= 1 && +m[3] <= +m[4] ? { b: m[1] ? +m[1] : null, bt: m[2] ? +m[2] : null, p: +m[3], pt: +m[4] } : null; };
            const c = read(ctrEl);
            if (c && visible(ctrEl)) return c;
            ctrEl = $$('body *').find(e => e.childElementCount <= 3 && !mine(e) && read(e) && visible(e)) || null;
            return read(ctrEl);
        }
        // 4.13.8: a barra de páginas do site (ex.: 109/178) fica parada enquanto o preparo roda.
        // Põe uma cópia parada por cima e esconde a original (que continua no lugar e continua sendo lida pelo script).
        let ghost = null, frozenBar = null, freezeTimer = 0, snap = null;
        // 4.13.15: avisa quando o site mostra "as Tintas de hoje já caíram" (só olha o que aparece DEPOIS de começar)
        const RX_TINTA = /tintas?\s+de\s+hoje\s+j[aá]\s+ca[ií]ram/i;
        let tintaOut = false, tintaObs = null;
        function watchTinta() {
            stopTinta(); tintaOut = false;
            try {
                tintaObs = new MutationObserver(ms => {
                    for (const m of ms) {
                        const nodes = m.type === 'characterData' ? [m.target] : m.addedNodes;
                        for (const n of nodes) {
                            const t = n.nodeType === 1 ? n.textContent : n.nodeType === 3 ? n.nodeValue : '';
                            if (!t || t.length > 600 || !RX_TINTA.test(t)) continue;
                            const el = n.nodeType === 1 ? n : n.parentElement;
                            if (el && mine(el)) continue;
                            tintaOut = true;
                        }
                    }
                });
                tintaObs.observe(document.body, { childList: true, subtree: true, characterData: true });
            } catch (e) { }
        }
        function stopTinta() { if (tintaObs) { try { tintaObs.disconnect(); } catch (e) { } tintaObs = null; } }

        let warned = false;
        function findBar() {
            if (!ctrEl || !ctrEl.isConnected) counter();
            const c = ctrEl;
            if (!c || !c.isConnected) return null;
            const cw = c.getBoundingClientRect().width || 1;
            // 4.13.14: sobe pelos pais e fica com o MAIOR que ainda é só a faixa da barra
            // (baixa, mais larga que o contador, com poucos botões); o contador sozinho é o plano B
            let e = c, best = null;
            for (let i = 0; i < 8 && e.parentElement && e.parentElement !== document.body; i++) {
                e = e.parentElement;
                if (mine(e)) break;
                const r = e.getBoundingClientRect();
                if (r.height > 90) break;
                if ($$('button,[role=button]', e).filter(visible).length > 2) break;
                if (r.width >= cw * 4 || e.querySelector('input[type=range],[role=slider]')) best = e;
            }
            if (!best) {
                best = c.parentElement && c.parentElement !== document.body ? c.parentElement : c;
                if (!warned) { warned = true; console.warn('[Ink] não achei a faixa da barra de páginas; congelando só o contador', c.outerHTML.slice(0, 200)); }
            }
            return best;
        }
        function placeGhost(bar) {
            // 4.13.13: a posição é gravada UMA vez (só refaz se a janela mudar de tamanho);
            // antes a cópia seguia a barra original e subia junto com ela
            if (snap && (snap.w !== innerWidth || snap.h !== innerHeight)) snap = null;
            if (!snap) { const b = bar.getBoundingClientRect(); snap = { left: b.left, top: b.top, width: b.width, height: b.height, w: innerWidth, h: innerHeight }; }
            const r = snap;
            const st = ghost.style;
            st.left = r.left + 'px'; st.top = r.top + 'px'; st.width = r.width + 'px'; st.height = r.height + 'px';
            const g = ghost.getBoundingClientRect();     // se algum pai tiver transform, corrige o desvio
            if (Math.abs(g.left - r.left) > 0.5) st.left = (r.left - (g.left - r.left)) + 'px';
            if (Math.abs(g.top - r.top) > 0.5) st.top = (r.top - (g.top - r.top)) + 'px';
            if (bar.style.opacity !== '0') bar.style.opacity = '0';
            if (bar.style.pointerEvents !== 'none') bar.style.pointerEvents = 'none';
        }
        function freezeTick() {
            if (!on) { unfreezeBar(); return; }
            if (!ghost) {
                const bar = findBar();
                if (!bar) return;
                ghost = bar.cloneNode(true);
                // cloneNode não copia o valor atual de campos (barra deslizante): copia na mão
                const oi = bar.querySelectorAll('input'), ci = ghost.querySelectorAll('input');
                oi.forEach((n, k) => { try { if (ci[k]) ci[k].value = n.value; } catch (x) { } });
                if (bar.matches('input')) { try { ghost.value = bar.value; } catch (x) { } }
                ghost.setAttribute('data-ink-freeze', '1');
                ghost.setAttribute('aria-hidden', 'true');
                ghost.removeAttribute('id');
                ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
                ghost.querySelectorAll('input,button,a,[tabindex]').forEach(n => n.setAttribute('tabindex', '-1'));
                Object.assign(ghost.style, { position: 'fixed', margin: '0', pointerEvents: 'none', zIndex: '2147481000', transform: 'none', transition: 'none', animation: 'none', opacity: '1', visibility: 'visible', right: 'auto', bottom: 'auto' });
                frozenBar = { el: bar, op: bar.style.opacity, pe: bar.style.pointerEvents };
                bar.parentElement.insertBefore(ghost, bar.nextSibling);
                placeGhost(bar);
                return;
            }
            // o site pode ter redesenhado a barra: acha a nova, esconde ela e põe a cópia parada ao lado
            if (!frozenBar.el.isConnected || !ghost.isConnected) {
                const bar = findBar();
                if (!bar) return;
                if (frozenBar.el !== bar) { frozenBar = { el: bar, op: bar.style.opacity, pe: bar.style.pointerEvents }; }
                if (!ghost.isConnected) bar.parentElement.insertBefore(ghost, bar.nextSibling);
            }
            placeGhost(frozenBar.el);
        }
        function freezeBar() { unfreezeBar(); freezeTimer = setInterval(freezeTick, 120); freezeTick(); }
        function unfreezeBar() {
            if (freezeTimer) { clearInterval(freezeTimer); freezeTimer = 0; }
            if (frozenBar && frozenBar.el) { frozenBar.el.style.opacity = frozenBar.op; frozenBar.el.style.pointerEvents = frozenBar.pe; }
            if (ghost) ghost.remove();
            ghost = frozenBar = snap = null;
        }

        async function waitFor(fn, ms) {
            const t0 = Date.now();
            for (;;) {
                check();
                while (document.hidden) { await sleep(500); check(); }
                const v = fn();
                if (v) return v;
                if (Date.now() - t0 >= ms) return null;
                await sleep(2);
            }
        }

        const zoomBtn = () => $$('button,[role=button]').find(b => !mine(b) && /bubble\s*zoom/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''}`));
        const zoomIsOn = () => { const b = zoomBtn(); return !!b && /desligar/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''}`); };
        async function setZoom(want) {
            if (zoomIsOn() === want) return;
            const b = zoomBtn();
            if (!b) throw new Error('não achei o botão do Bubble Zoom (mostre os controles da leitura)');
            b.click();
            if (!await waitFor(() => zoomIsOn() === want, 3000)) throw new Error('o Bubble Zoom não respondeu');
        }

        // a engrenagem fica na mesma barra do "4×", depois do − e do +
        function gearBtn() {
            const named = $$('button').find(b => !mine(b) && visible(b) && /arrumar.*bolha|ajustar.*bolha|editar.*bolha/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''}`));
            if (named) return named;
            for (const z of $$('body *')) {
                if (z.childElementCount || mine(z) || !/^\d+(?:[.,]\d+)?\s*[×x]$/.test(txt(z)) || !visible(z)) continue;
                let box = z.parentElement;
                for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
                    const bs = $$('button', box).filter(visible);
                    if (bs.length >= 3 && bs.length <= 4) return bs[bs.length - 1];
                }
            }
            return null;
        }

        // anda UMA página (dir = 1 próxima, -1 anterior), com o zoom desligado
        // 4.13.7: tenta trocar de página com o zoom ligado (sem ligar/desligar a cada página).
        // Se o site não trocar assim, aprende (zoomBad) e volta a desligar o zoom antes de trocar.
        let learned = {}, zoomBad = false;
        async function step(dir) {
            if (zoomBad || !zoomIsOn()) {
                await setZoom(false);
                return stepRun(dir, 1200);
            }
            try { return await stepRun(dir, 500); }
            catch (e) {
                if (e === STOP) throw e;
                zoomBad = true;
                await setZoom(false);
                return stepRun(dir, 1200);
            }
        }
        async function stepRun(dir, ms) {
            const from = await waitFor(counter, 4000);
            if (!from) throw new Error('não li o número da página');
            const fwd = cfg.manga ? MANGA : WEST, bwd = cfg.manga ? WEST : MANGA;
            const list = [...(dir > 0 ? fwd : bwd), 'PageDown', 'botao'].filter(n => dir > 0 || (n !== 'PageDown' && n !== 'botao'));
            if (learned[dir]) list.unshift(learned[dir]);
            for (const name of list) {
                check();
                try { if (!METHODS[name]()) continue; } catch (e) { continue; }
                const now = await waitFor(() => { const c = counter(); return c && c.p !== from.p ? c : null; }, ms);
                if (!now) continue;
                if (now.p === from.p + dir) { learned[dir] = name; return; }
                throw new Error(`a página pulou de ${from.p} para ${now.p}`);
            }
            throw new Error(`não consegui sair da página ${from.p}`);
        }
        async function goTo(target, say) {
            for (let n = 0; n < 600; n++) {
                const c = await waitFor(counter, 4000);
                if (!c) throw new Error('não li o número da página');
                if (c.p === target) return;
                say(`↩ Voltando: página ${c.p} → ${target}`);
                await step(c.p < target ? 1 : -1);
            }
            throw new Error('não cheguei na página ' + target);
        }

        const modalBtn = (m, rx) => $$('button', m).find(b => rx.test(txt(b)));
        async function closeModal(rx) {
            const m = BubbleSorter.findModal();
            if (!m) return;
            const b = modalBtn(m, rx);
            if (!b) throw new Error('não achei o botão para fechar as bolhas');
            b.click();
            if (!await waitFor(() => !BubbleSorter.findModal(), 8000)) throw new Error('a tela das bolhas não fechou');
        }

        // devolve 'ok', 'vazia' (sem balões) ou 'falhou'
        async function doPage(page, say) {
            await setZoom(true);
            const c = await waitFor(() => { const x = counter(); return x && x.p === page && x.b != null ? x : null; }, 1000);
            if (!c) return 'vazia';
            const gear = await waitFor(gearBtn, 3000);
            if (!gear) throw new Error('não achei a engrenagem das bolhas');
            gear.click();
            if (!await waitFor(() => BubbleSorter.findModal(), 5000)) throw new Error('a engrenagem não abriu Arrumar as bolhas');
            // espera as bolhas terminarem de carregar (mesma quantidade por um tempinho)
            let last = -1, since = 0;
            await waitFor(() => {
                const n = BubbleSorter.getTiles().length;
                if (n !== last) { last = n; since = Date.now(); }
                return n > 0 && Date.now() - since > 16;
            }, 8000);
            const ok = await BubbleSorter.arrange(cfg.manga ? 'manga' : 'hq', m => say(`Pág ${page}: ${m}`));
            check();
            if (!ok) { await closeModal(/^cancelar$/i); return 'falhou'; }
            await closeModal(/^salvar$/i);
            return 'ok';
        }

        // progresso salvo deste capítulo (continua valendo mesmo recarregando a página)
        const pending = () => cfg.prep && cfg.prep.path === location.pathname ? cfg.prep : null;
        let confirmUntil = 0;
        function paint() {
            const b = $('ink-prep'), r = $('ink-prep-go'), st = $('ink-prep-st');
            const s = on ? null : pending();
            const label = on ? '⏹ Parar preparo' : (s ? (Date.now() < confirmUntil ? '⚠ Toque de novo pra recomeçar' : '↺ Recomeçar do zero') : '🧰 Preparar capítulo');
            setText(b, label);
            // a caixa de progresso tem altura fixa; só aparece durante o preparo ou com o resumo do último
            if (st) { const show = on || !!stText; if (st.hidden !== !show) st.hidden = !show; }
            if (!r) return;
            const row = r.parentElement;
            if (on) {
                // preparo rodando: a linha "Continuar" não some (senão o painel dá um pulo), só fica invisível
                if (!row.hidden && row.style.visibility !== 'hidden') row.style.visibility = 'hidden';
                return;
            }
            if (row.style.visibility) row.style.visibility = '';
            if (row.hidden !== !s) row.hidden = !s;
            if (!s) return;
            const go = s.next > s.total ? '▶ Terminar: voltar à página 1' : `▶ Continuar da página ${s.next} de ${s.total}`;
            setText(r, go);
        }
        // página a página: vai no status do topo e na caixa de progresso
        function report(t) {
            setStatus(t);
            stText = t;
            const e = $('ink-prep-st');
            if (e) { setText(e, t); if (e.hidden) e.hidden = false; }
        }
        // detalhe de cada posição das bolhas: só no status do topo (a caixa de progresso fica parada)
        const detail = t => setStatus(t);
        async function start(resume) {
            if (on) { on = false; BubbleSorter.halt(); report('⏹ Parando…'); return; }
            if (!location.pathname.startsWith('/ler/')) { report('⚠ Abra um capítulo primeiro'); return; }
            if (BubbleSorter.findModal()) { report('⚠ Feche Arrumar as bolhas antes de começar'); return; }
            const from = resume ? pending() : null;
            if (resume && !from) { paint(); return; }
            // recomeçar com progresso salvo pede um segundo toque
            if (!resume && pending()) {
                const wait = confirmUntil - Date.now();
                if (wait <= 0) { confirmUntil = Date.now() + 4000; paint(); setTimeout(paint, 4100); return; }
                if (wait > 3400) return;      // toque duplo sem querer não conta
            }
            confirmUntil = 0;
            // "Recomeçar do zero" (havia progresso salvo e o toque foi confirmado) refaz tudo: esquece as páginas já salvas
            const restartZero = !resume && !!pending();
            if (restartZero && cfg.prepDone && cfg.prepDone[location.pathname]) { const d = { ...cfg.prepDone }; delete d[location.pathname]; cfg.prepDone = d; saveCfg(); }
            if (!from) cfg.prep = null;
            if (running) stop('Leitura parada para preparar o capítulo');
            on = true; learned = {}; zoomBad = false; ctrEl = null;
            stText = ''; setText($('ink-prep-st'), '');
            paint();
            freezeBar();
            watchTinta();
            const path = location.pathname;
            const saved = from ? [...from.saved] : [], empty = from ? [...from.empty] : [], failed = from ? [...from.failed] : [];
            let manga = from ? from.manga : !!cfg.manga;
            let total = 0, page = 0, end = '', skip = new Set(), skipped = 0;
            const keep = next => { cfg.prep = { path, next, total, manga, saved: [...saved], empty: [...empty], failed: [...failed] }; saveCfg(); };
            try {
                if (!await waitFor(counter, 5000)) throw new Error('não achei o contador de páginas (mostre os controles da leitura)');
                await setZoom(false);
                // com o zoom desligado o botão MANGÁ do site aparece: usa ele
                const found = await waitFor(siteMode, 2000);
                if (from && found && (found === 'manga') !== from.manga) throw new Error(`o site está em ${found === 'manga' ? 'mangá' : 'HQ'}, mas o preparo salvo usou ${from.manga ? 'mangá' : 'HQ'}; use Recomeçar do zero`);
                if (!from && found) manga = found === 'manga';
                setMode(manga ? 'manga' : 'hq');
                const first = from ? from.next : 1;
                total = counter().pt;
                if (from && from.total !== total) { cfg.prep = null; throw new Error('o total de páginas mudou; comece de novo'); }
                // 4.13.15: páginas que já ficaram salvas num preparo anterior (ex.: só sobraram as que falharam) são puladas
                const rec = cfg.prepDone && cfg.prepDone[path];
                if (rec && rec.total === total && Array.isArray(rec.pages) && rec.pages.length < total) skip = new Set(rec.pages);
                if (skip.size) report(`↷ ${skip.size} páginas já salvas serão puladas`);
                if (first <= total) await goTo(first, report);
                keep(first);
                for (page = first; page <= total; page++) {
                    if (location.pathname !== path) throw new Error('o capítulo mudou');
                    if (skip.has(page)) {
                        skipped++;
                        report(`↷ Página ${page} de ${total} já salva · pulando`);
                        keep(page + 1);
                        if (page < total) await step(1);
                        continue;
                    }
                    report(`🧰 Página ${page} de ${total} (${Math.round((page - 1) / total * 100)}%) · ${cfg.manga ? 'mangá' : 'HQ'}`);
                    const r = await doPage(page, detail);
                    (r === 'ok' ? saved : r === 'vazia' ? empty : failed).push(page);
                    keep(page + 1);
                    if (cfg.tintaStop && tintaOut) throw TINTA;
                    if (page < total) await step(1);
                }
                await setZoom(false);
                await goTo(1, report);
                await setZoom(true);
                cfg.prep = null;
                // guarda o que ficou salvo: se sobraram pendências, a próxima vez só refaz as que faltam
                const d = { ...cfg.prepDone };
                if (failed.length) d[path] = { total, pages: [...new Set([...skip, ...saved, ...empty])] }; else delete d[path];
                const ks = Object.keys(d); while (ks.length > 40) delete d[ks.shift()];
                cfg.prepDone = d; saveCfg();
                end = failed.length ? '⚠ Preparo terminou com pendências' : '✓ Preparo terminou';
            } catch (e) {
                end = e === TINTA ? `⏸ As Tintas de hoje acabaram; parei depois da página ${page}. Continue amanhã em ▶ Continuar`
                    : e === STOP ? `⏹ Parado na página ${page || '?'}` : `⚠ Parei${page ? ' na página ' + page : ''}: ${e.message || e}`;
                if (e !== STOP) console.warn('[Ink] preparo:', e);
            }
            // se parou com a tela das bolhas aberta, fecha sem salvar a página incompleta
            const m = cfg.prep && BubbleSorter.findModal();
            if (m) { const c = modalBtn(m, /^cancelar$/i); if (c) c.click(); }
            on = false; unfreezeBar(); stopTinta(); paint();
            report(`${end}. Salvas: ${saved.length}${total ? ' de ' + total : ''}`
                + (skipped ? ` · já salvas (puladas): ${skipped}` : '')
                + (empty.length ? ` · sem balões detectados: ${empty.join(', ')}` : '')
                + (failed.length ? ` · revisar: ${failed.join(', ')}` : ''));
        }
        // Esc também para o preparo
        document.addEventListener('keydown', e => { if (on && e.key === 'Escape') { on = false; BubbleSorter.halt(); } }, true);

        return { start, paint, get on() { return on; } };
    })();

    /* ================================================================== *
     *  7. ORDER BAR — Ordenar Capítulos (na página da obra)
     * ================================================================== */
    const OrderBar = (() => {
        const KEY = 'ink_ord_cfg';
        const CAP_LINK = 'a[href*="/ler/"],a[href*="/capitulo/"],a[href*="/cap/"],a[href*="/chapter/"]';
        const RX_NUM = /(?:capitulo|cap|ch|chapter|ler|ep)[\-\/]?(\d+(?:[.,]\d+)?)/i;
        const state = { mode: 'asc', dir: cfg.manga ? 'manga' : 'west', orig: new WeakMap() };
        try { const j = JSON.parse(localStorage.getItem(KEY) || '{}'); if (j.mode) state.mode = j.mode; } catch (e) { }

        const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ mode: state.mode })); } catch (e) { } };
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

        const modeLabel = () => ({ asc: 'Crescente', desc: 'Decrescente', orig: 'Original' }[state.mode] || 'Ordenar');
        const dirLabel = () => state.dir === 'manga' ? 'Mangá' : 'Ocidental';

        function apply() {
            const box = findContainer();
            if (!box) { status('⚠ Lista não encontrada'); return false; }
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
            if (!o || !o.length) { status('⚠ Sem ordem salva'); return false; }
            for (const el of o) { try { el.isConnected && box.appendChild(el); } catch (e) { } }
            box.style.direction = ''; box.style.flexDirection = '';
            state.mode = 'orig';
            save();
            status('✓ Ordem original restaurada');
            paint();
            return true;
        }

        function cycleMode() {
            state.mode = state.mode === 'asc' ? 'desc' : state.mode === 'desc' ? 'orig' : 'asc';
            save(); apply();
        }

        function paint() {
            const bar = $('ink-order');
            if (!bar) return;
            const pb = bar.querySelector('[data-ord="sort"] span');
            if (pb) pb.textContent = modeLabel();
            bar.querySelectorAll('[data-dir]').forEach(b => b.classList.toggle('on', b.dataset.dir === state.dir));
        }

        // chamado pelo chip "Mangá" do painel
        function sync() {
            state.dir = cfg.manga ? 'manga' : 'west';
            if ($('ink-order')) apply();
        }

        let lastBuildPath = '', lastBuildAt = 0;
        function build() {
            if (SAFE || $('ink-order')) return;
            // A lista pode carregar depois da navegação, mas não precisa ser varrida a cada 1,5 s.
            const path = location.pathname, now = Date.now();
            if (path === lastBuildPath && now - lastBuildAt < 1800) return;
            lastBuildPath = path; lastBuildAt = now;
            // NÃO monta na tela de leitura: lá os links /ler/ são o carrossel "Próximas leituras"
            if (path.startsWith('/ler/')) return;
            if (!RX_OBRA.test(location.pathname)) return;
            const box = findContainer();
            if (!box || collectItems(box).length < 2) return;

            state.dir = cfg.manga ? 'manga' : 'west';
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
            bar.querySelectorAll('[data-dir]').forEach(b => b.onclick = () => {
                state.dir = b.dataset.dir;
                cfg.manga = state.dir === 'manga'; saveCfg(); workSave(); refreshPanel();
                apply();
            });

            paint();
            if (state.mode !== 'orig' || state.dir !== 'west') apply();
        }

        return { build, apply, paint, sync };
    })();

    /* ================================================================== *
     *  8. READER LOOP (Motor)
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
    const paused = () => document.hidden || BubbleSorter.isOpen || !!document.querySelector('.bz-order') || !userIdle();

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
    let endBtnCache = null, endBtnScanAt = 0, endBtnScanPath = '';

    function findEndBtn() {
        const path = location.pathname;
        if (path !== endBtnScanPath) {
            endBtnScanPath = path;
            endBtnScanAt = 0;
            endBtnCache = null;
        }
        const now = performance.now();
        if (now - endBtnScanAt < 180) return endBtnCache && endBtnCache.isConnected ? endBtnCache : null;
        endBtnScanAt = now;
        endBtnCache = null;
        const mine = $('ink-panel');
        for (const el of $$('button,a,[role=button]')) {
            if (mine && mine.contains(el)) continue;
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length < 40 && RX_END_BTN.test(t) && el.getBoundingClientRect().width > 0) {
                endBtnCache = el;
                break;
            }
        }
        return endBtnCache;
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
        sleepChapter();
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
            if (e === document.documentElement || e === document.body || e.closest('#ink-panel,#ink-eye-el')) continue;
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
        let wacc = 0, sig0 = moveSig(), lastMove = performance.now(), lastMoveCheck = lastMove, triedWheel = !el;
        while (alive(id)) {
            await new Promise(r => requestAnimationFrame(r));
            const now = performance.now(), dt = Math.min(100, now - last); last = now;
            if (paused()) {
                ramp = 0;
                if (el && mode === 'scroll') pos = el.scrollTop;
                lastMove = now;
                if (now - lastMoveCheck >= 100) { sig0 = moveSig(); lastMoveCheck = now; }
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
            if (now - lastMoveCheck >= 100) {
                lastMoveCheck = now;
                const sg = moveSig();
                if (sg !== sig0) { sig0 = sg; lastMove = now; }
            }
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
        running = true; refreshPanel(); keepAwake(true); sleepArm(); kaStart();
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
        } catch (e) {
            logErr('mainLoop', e);
            finish('⚠ Erro interno na leitura (veja o console: [Ink])');
        } finally {
            if (id === runId) { running = false; refreshPanel(); keepAwake(false); kaStop(); }
        }
    }

    const finish = msg => { running = false; runId++; cancelSpeech(); musDuck(false); setStatus(msg); refreshPanel(); keepAwake(false); kaStop(); };
    const stop = msg => { if (!running) return; running = false; runId++; cancelSpeech(); musDuck(false); setStatus(msg || 'Parado.'); refreshPanel(); keepAwake(false); kaStop(); };

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
     *  9. VOZ / TTS
     * ================================================================== */
    const TTS = window.speechSynthesis || null;
    let voices = [];
    const loadVoices = () => { try { voices = TTS ? TTS.getVoices() : []; } catch (e) { voices = []; } };
    if (TTS) { loadVoices(); try { TTS.addEventListener('voiceschanged', () => { loadVoices(); fillVoices(); }); } catch (e) { } }

    const VRATES = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2];
    const isNatural = v => /natural|neural|online/i.test(v.name);
    // vozes do idioma escolhido no OCR (pt / en / ja)
    function ptVoices() {
        const vl = curLang().vl;
        const all = voices.filter(v => new RegExp('^' + vl + '([-_]|$)', 'i').test(v.lang));
        const pref = vl === 'pt' ? all.filter(v => /^pt[-_]BR$/i.test(v.lang)) : (vl === 'en' ? all.filter(v => /^en[-_]US$/i.test(v.lang)) : []);
        return (pref.length ? pref : all).slice().sort((a, b) => isNatural(b) - isNatural(a));
    }
    const currentVoice = () => { const l = ptVoices(); return l.find(v => v.name === cfg.vname) || l[0] || null; };
    const ttsLang = () => ({ pt: 'pt-BR', en: 'en-US', ja: 'ja-JP' }[curLang().vl] || 'pt-BR');

    function mkUtt(text) {
        const u = new SpeechSynthesisUtterance(text);
        const v = currentVoice();
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = ttsLang();
        u.rate = cfg.vrate || 1; u.pitch = 1;
        return u;
    }
    function chunk(t) {
        const out = []; let cur = '';
        for (const x of t.split(/(?<=[.!?…。！？])\s*/)) {
            if (!x) continue;
            if (cur && (cur + ' ' + x).length > 200) { out.push(cur); cur = x; }
            else cur = cur ? cur + ' ' + x : x;
        }
        if (cur) out.push(cur);
        return out;
    }
    // dicionário de pronúncia: uma regra por linha, no formato palavra=como falar
    function applyDict(text) {
        const map = new Map();
        for (const line of String(cfg.dict || '').split('\n')) {
            const i = line.indexOf('=');
            const k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
            if (i > 0 && k && v) map.set(k.toLowerCase(), v);
        }
        if (!map.size) return text;
        const alt = [...map.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        return text.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu'), m => map.get(m.toLowerCase()) || m);
    }
    let lastSpoken = '';
    function repeatLine() {
        if (!TTS || !lastSpoken) { setStatus('Ainda não há fala para repetir'); return; }
        if (running) stop('🔁 Leitura pausada para repetir a fala');
        cancelSpeech();
        for (const p of chunk(applyDict(lastSpoken))) { try { TTS.speak(mkUtt(p)); } catch (e) { } }
    }
    async function speak(text, id) {
        if (!TTS) return;
        lastSpoken = text;
        for (const p of chunk(applyDict(text))) {
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
     * 10. OCR  (a captura de tela depende da extensão/app: window.postMessage inkCap)
     * ================================================================== */
    const OCR = { worker: null, promise: null, lang: '' };
    const ocrBase = () => {
        let b = window.__inkOcrBase || (document.documentElement.dataset && document.documentElement.dataset.inkOcr) || '';
        if (!b) { try { if (chrome && chrome.runtime && chrome.runtime.getURL) b = chrome.runtime.getURL('ocr'); } catch (e) { } }
        return b.replace(/\/$/, '');
    };
    function ocrWorker() {
        const lang = cfg.ocrLang || 'por';
        if (OCR.lang && OCR.lang !== lang) {          // trocou o idioma: descarta o worker antigo
            const old = OCR.worker; OCR.worker = null; OCR.promise = null;
            if (old) { try { old.terminate(); } catch (e) { } }
        }
        if (OCR.worker) return Promise.resolve(OCR.worker);
        if (OCR.promise) return OCR.promise;
        OCR.lang = lang;
        OCR.promise = (async () => {
            if (typeof Tesseract === 'undefined') throw new Error('Tesseract não carregou (precisa da extensão).');
            setStatus('⏳ Carregando OCR…');
            const base = ocrBase();
            const opts = { logger: () => { }, errorHandler: e => console.warn('[Ink-OCR]', e) };
            if (base) { opts.workerPath = base + '/worker.min.js'; opts.corePath = base; opts.langPath = base; opts.gzip = true; }
            const w = await Tesseract.createWorker(lang, 1, opts);
            await w.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1', user_defined_dpi: '300' });
            OCR.worker = w;
            return w;
        })();
        OCR.promise.catch(() => { OCR.promise = null; OCR.lang = ''; });
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
            const t = setTimeout(() => { capWait.delete(id); rej(new Error('captura não respondeu (precisa da extensão)')); }, 5000);
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
    const isJpn = () => cfg.ocrLang === 'jpn';

    function cleanLine(l, relaxed) {
        if (!l || !l.bbox) return null;
        const t = (l.text || '').replace(/[^\p{L}\p{N}\s.,!?…:;'"’“”()–—%。、！？「」ー-]/gu, ' ').replace(/\s+/g, ' ').trim();
        if (RX_UI.test(t)) return null;
        const letters = (t.match(/\p{L}/gu) || []).length;
        const conf = l.confidence != null ? l.confidence : 100;
        if (letters < 2 || letters < t.length * 0.45 || conf < (relaxed ? 28 : 35)) return null;
        const ws = t.split(' ').filter(w => /\p{L}/u.test(w));
        if (!isJpn() && !ws.some(w => w.length >= 2)) return null;
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
            else out += (isJpn() ? '' : ' ') + l.text;
        }
        return out;
    }
    function toSpeech(t) {
        t = t.replace(/\s+/g, ' ').trim();
        if (RX_UI.test(t)) return '';
        if (isJpn()) t = t.replace(/(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー、。！？])\s+(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー、。！？])/gu, '');
        const up = (t.match(/\p{Lu}/gu) || []).length, lo = (t.match(/\p{Ll}/gu) || []).length;
        if (up >= 3 && up > 3 * lo) t = t.toLowerCase().replace(/(^|[.!?…]\s+)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
        return t.replace(/\.{3,}/g, '…').replace(/([!?])[!?]+/g, '$1');
    }

    // balão "sem sentido": só onomatopeia, letras soltas ou lixo do OCR
    const RX_ONO = /^(b+o+m+|k+r+a+|s+p+l+a+s+h+|t+h+u+d+|g+r+r+|h+m+p+h*|a+r+g+h+|z+z+z+|b+a+n+g+|c+r+a+s+h+|p+o+w+|s+m+a+c+k+|w+h+a+m+)$/i;
    function isJunk(t) {
        if (isJpn()) return (t.match(/\p{L}/gu) || []).length < 1;
        const toks = t.split(/\s+/).map(w => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
        if (!toks.length) return true;
        const letters = toks.join('').length;
        if (letters < 2) return true;
        const bad = w => w.length <= 1 || RX_ONO.test(w) || /^(\p{L})\1{2,}$/iu.test(w) || (w.length >= 3 && !/[aeiouyáéíóúâêôãõà]/i.test(w));
        return toks.filter(bad).length / toks.length >= 0.7;
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
                if (e.closest && e.closest('#ink-panel,#ink-eye-el,#ink-dbg')) continue;
                if (e.tagName === 'IMG' || e.tagName === 'CANVAS') return e;
            }
            return null;
        })();
        const panel = $('ink-panel');
        const eye = $('ink-eye-el');
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
        if (cfg.skipJunk && isJunk(text)) { setStatus(`🧹 ${stateLabel(st)} · pulei (sem sentido)`); await humanWait(500, st, id); return; }
        setStatus(`🎧 ${text.length > 70 ? text.slice(0, 67) + '…' : text}`);
        await speak(text, id);
        if (alive(id)) await sleep(250);
    }

    /* ================================================================== *
     * 11. MÚSICA — YouTube (iframe embed) + Drive (Apps Script)
     * ================================================================== */
    const MUS = { list: [], cur: -1, audio: null, blob: null, shuffle: false };
    try { MUS.list = JSON.parse(localStorage.getItem('ink_music_list') || '[]'); } catch (e) { }
    const musVol = () => cfg.musicVol == null ? 0.6 : cfg.musicVol;
    const musStatus = t => { const el = $('ink-music-status'); if (el && el.textContent !== t) el.textContent = t; };
    const DUCK_PCT = 12;

    /* ---- YouTube: player oficial embutido, controlado por postMessage (sem baixar nada) ---- */
    const YT = { active: false, ready: false, playing: false, ducked: false, frame: null, timer: 0 };
    const ytPct = () => YT.ducked ? Math.min(DUCK_PCT, Math.round(musVol() * 100)) : Math.round(musVol() * 100);

    function ytCmd(func, args) {
        try {
            if (YT.frame && YT.frame.contentWindow)
                YT.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*');
        } catch (e) { }
    }

    function ytParse(u) {
        u = (u || '').trim();
        if (!u) return null;
        if (/^[\w-]{11}$/.test(u)) return { id: u, list: '' };
        if (/^(PL|UU|OL|FL|RD)[\w-]{10,}$/.test(u)) return { id: '', list: u };
        try {
            const x = new URL(/^https?:/i.test(u) ? u : 'https://' + u);
            const list = x.searchParams.get('list') || '';
            let id = '';
            if (/(^|\.)youtu\.be$/.test(x.hostname)) id = x.pathname.slice(1).split('/')[0];
            else if (/(^|\.)youtube(-nocookie)?\.com$/.test(x.hostname)) {
                id = x.searchParams.get('v') || '';
                const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(x.pathname);
                if (!id && m) id = m[1];
            } else return null;
            if (id && !/^[\w-]{11}$/.test(id)) id = '';
            return (id || list) ? { id, list } : null;
        } catch (e) { return null; }
    }

    function ytStop() {
        clearTimeout(YT.timer);
        const box = $('ink-yt-box');
        if (box) box.textContent = '';
        YT.active = false; YT.ready = false; YT.playing = false; YT.ducked = false; YT.frame = null;
        musPaintBtn();
    }

    function ytLoad() {
        const inp = $('ink-yt-url');
        const p = ytParse(inp ? inp.value : cfg.ytUrl);
        if (!p) { musStatus('⚠ Link do YouTube inválido'); return; }
        cfg.ytUrl = inp ? inp.value.trim() : cfg.ytUrl; saveCfg();
        if (MUS.audio && !MUS.audio.paused) MUS.audio.pause();
        ytStop();
        const q = new URLSearchParams({ enablejsapi: '1', autoplay: '1', playsinline: '1', rel: '0', origin: location.origin });
        if (p.list) q.set('list', p.list);
        const f = document.createElement('iframe');
        f.src = `https://www.youtube.com/embed/${p.id || 'videoseries'}?${q}`;
        f.allow = 'autoplay; encrypted-media; picture-in-picture';
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        f.title = 'YouTube';
        f.addEventListener('load', () => {
            try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch (e) { }
            setTimeout(() => ytCmd('setVolume', [ytPct()]), 900);
        });
        $('ink-yt-box').appendChild(f);
        YT.frame = f; YT.active = true; YT.playing = true;
        musStatus('⏳ Carregando YouTube…');
        musPaintBtn();
        YT.timer = setTimeout(() => { if (!YT.ready) musStatus('⚠ O player não respondeu. O site pode estar bloqueando o YouTube.'); }, 8000);
    }

    window.addEventListener('message', e => {
        if (!YT.frame || e.source !== YT.frame.contentWindow) return;
        let d = e.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (x) { return; } }
        if (!d || typeof d !== 'object') return;
        if (!YT.ready) { YT.ready = true; clearTimeout(YT.timer); ytCmd('setVolume', [ytPct()]); musStatus('🎵 YouTube'); }
        const s = d.event === 'onStateChange' ? d.info : (d.info && d.info.playerState);
        if (typeof s === 'number') { YT.playing = s === 1 || s === 3; musPaintBtn(); }
        const vd = d.info && d.info.videoData;
        if (vd && vd.title) musStatus('🎵 ' + vd.title);
    });

    // avisa se o CSP do site bloquear o iframe do YouTube
    document.addEventListener('securitypolicyviolation', e => {
        if (/youtube/i.test(e.blockedURI || '')) musStatus('⚠ O site bloqueou o player do YouTube (CSP).');
    });

    /* ---- Drive ---- */
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
    // Baixa o volume da música (YouTube ou Drive) enquanto o audiolivro fala
    function musDuck(on) {
        if (on && cfg.duck === false) return;
        if (YT.active) {
            if (on && !YT.ducked) { YT.ducked = true; ytCmd('setVolume', [ytPct()]); }
            else if (!on && YT.ducked) { YT.ducked = false; ytCmd('setVolume', [ytPct()]); }
        }
        const a = MUS.audio;
        if (!a || !a.src || a.paused) return;
        if (on) { if (a._ducked) return; a._ducked = true; a._preVol = a.volume; a.volume = Math.min(a.volume, 0.12); }
        else if (a._ducked) { a._ducked = false; a.volume = a._preVol != null ? a._preVol : musVol(); a._preVol = null; }
    }
    // fade do timer de sono: f vai de 1 (volume normal) até 0
    function musFade(f) {
        f = Math.min(1, Math.max(0, f));
        if (YT.active) ytCmd('setVolume', [Math.round(ytPct() * f)]);
        const a = MUS.audio;
        if (a && a.src && !a._ducked) a.volume = Math.min(1, Math.max(0, musVol() * f));
    }
    function musPauseAll() {
        if (YT.active) { ytCmd('pauseVideo'); YT.playing = false; }
        if (MUS.audio && !MUS.audio.paused) MUS.audio.pause();
        musPaintBtn();
    }
    async function musPlay(i) {
        const t = MUS.list[i];
        if (!t) return;
        if (YT.active) ytStop();
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
        if (YT.active) { ytCmd(d > 0 ? 'nextVideo' : 'previousVideo'); return; }
        const n = MUS.list.length;
        if (!n) return;
        if (MUS.shuffle && n > 1) { let j; do { j = Math.floor(Math.random() * n); } while (j === MUS.cur); musPlay(j); return; }
        const base = MUS.cur < 0 ? (d > 0 ? -1 : 0) : MUS.cur;
        musPlay(((base + d) % n + n) % n);
    }
    function musToggle() {
        if (YT.active) {
            ytCmd(YT.playing ? 'pauseVideo' : 'playVideo');
            YT.playing = !YT.playing; musPaintBtn(); return;
        }
        const a = musAudio();
        if (!a.src) { if (MUS.list.length) musPlay(Math.max(0, MUS.cur)); else musStatus('Cole um link do YouTube ou sincronize o Drive'); return; }
        if (a.paused) a.play().catch(() => { }); else a.pause();
    }
    function musVolStep(d) {
        cfg.musicVol = Math.min(1, Math.max(0, Math.round((musVol() + d) * 10) / 10));
        saveCfg();
        if (YT.active) ytCmd('setVolume', [ytPct()]);
        if (MUS.audio) { if (MUS.audio._ducked) MUS.audio._preVol = cfg.musicVol; else MUS.audio.volume = cfg.musicVol; }
        musPaintBtn();
    }
    function musPaintBtn() {
        const playing = YT.active ? YT.playing : !!(MUS.audio && !MUS.audio.paused && MUS.audio.src);
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
     * 12. MISSÕES
     * ================================================================== */
    const meta = { on: false, done: 0, seen: new Set() };
    const metaKey = st => { const c = st.p != null ? st.p : st.pg; return c == null ? null : location.pathname + '#' + c; };

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
        setText($('ink-meta-lbl'), meta.on ? `${meta.done}/${cfg.metaGoal}` : 'Ligar meta');
        const b = $('ink-meta-btn');
        if (b) b.classList.toggle('on', meta.on);
    }

    /* ================================================================== *
     * 12a. NOVIDADES 4.5.0
     * ================================================================== */

    /* ---- Copiar / compartilhar (no app usa o menu "Compartilhar" do Android) ---- */
    async function copyText(t) {
        try { await navigator.clipboard.writeText(t); return true; } catch (e) { }
        try {
            const ta = document.createElement('textarea');
            ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            const ok = document.execCommand('copy'); ta.remove();
            return !!ok;
        } catch (e) { return false; }
    }
    const nativeApp = () => !!(window.InkNative && typeof window.InkNative.share === 'function');
    async function shareText(t) {
        if (!t) return;
        if (nativeApp()) { try { window.InkNative.share(t); return; } catch (e) { } }
        if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
        setStatus(await copyText(t) ? '📋 Copiado (compartilhar não disponível aqui)' : '⚠ Não consegui compartilhar');
    }
    const shareChapter = () => shareText(`${(document.title || 'Ink').trim()}\n${location.href}`);
    const copyCantada = async () => {
        if (!cfg.girl || !TICK.cur) return;
        setStatus(await copyText(TICK.cur) ? '💘 Cantada copiada! (💬 envia pra alguém)' : '⚠ Não consegui copiar');
    };

    /* ---- Continuar de onde parou ---- */
    let _lastRec = '';
    function trackRead() {
        if (document.hidden || !location.pathname.startsWith('/ler/')) return;
        const label = stateLabel(readState());
        const path = location.pathname + location.search;
        const sig = path + '|' + label;
        if (sig === _lastRec) return;
        _lastRec = sig;
        let wt = ''; try { wt = sessionStorage.getItem('ink_work_title') || ''; } catch (e) { }
        cfg.last = { path, label: `${(wt || document.title || 'Ink').trim().slice(0, 40)} · ${label}`, t: Date.now() };
        saveCfg(); contPaint();
    }
    function contPaint() {
        Prep.paint();
        const b = $('ink-cont'); if (!b) return;
        const l = cfg.last;
        const here = location.pathname + location.search;
        const hide = !l || !l.path || l.path === here;
        if (b.hidden !== hide) b.hidden = hide;
        if (hide) return;
        const s = b.querySelector('span'), v = '↩ Continuar: ' + l.label;
        if (s && s.textContent !== v) { s.textContent = v; b.title = l.label; }
    }
    function goContinue() {
        if (!cfg.last || !cfg.last.path) return;
        try { sessionStorage.setItem('ink_resume', JSON.stringify(cfg.last)); } catch (e) { }
        location.href = cfg.last.path;
    }

    /* ---- Favoritos ---- */
    function favAdd() {
        if (!location.pathname.startsWith('/ler/')) { setStatus('⚠ Abra uma página de leitura para favoritar'); return; }
        const path = location.pathname + location.search;
        const page = stateLabel(readState());
        let wt = ''; try { wt = sessionStorage.getItem('ink_work_title') || ''; } catch (e) { }
        const inp = $('ink-fav-note'), note = inp ? inp.value.trim().slice(0, 80) : '';
        const fav = { path, label: `${(wt || document.title || 'Ink').trim().slice(0, 40)} · ${page}`, note, t: Date.now() };
        cfg.favs = [fav, ...(cfg.favs || []).filter(f => !(f.path === path && f.label === fav.label))].slice(0, 50);
        if (inp) inp.value = '';
        saveCfg(); favPaint(); setStatus('⭐ Favorito salvo');
    }
    function favPaint() {
        const box = $('ink-fav-list'); if (!box) return;
        box.textContent = '';
        (cfg.favs || []).forEach(f => {
            const row = document.createElement('div'); row.className = 'ia-row';
            const go = document.createElement('button'), del = document.createElement('button');
            go.className = del.className = 'ia-chip'; go.style.flex = '4';
            go.textContent = f.label + (f.note ? ' — ' + f.note : ''); go.title = go.textContent;
            del.textContent = '✕'; del.title = 'Apagar favorito';
            go.onclick = () => { try { sessionStorage.setItem('ink_resume', JSON.stringify(f)); } catch (e) { } location.href = f.path; };
            del.onclick = () => { cfg.favs = cfg.favs.filter(x => x !== f); saveCfg(); favPaint(); };
            row.append(go, del); box.appendChild(row);
        });
    }

    /* ---- Atalhos de teclado (Alt+Shift+tecla) ---- */
    function hotkeys(e) {
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey || e.repeat) return;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
        const f = {
            KeyP: () => $('ink-go') && $('ink-go').click(),
            KeyV: () => toggleVoice(),
            KeyR: () => repeatLine(),
            KeyS: () => favAdd(),
            Period: () => setSpeed(1),
            Comma: () => setSpeed(-1)
        }[e.code];
        if (!f) return;
        e.preventDefault(); e.stopPropagation(); f();
    }

    /* ---- Mangá automático: segue o botão MANGÁ do próprio leitor do Ink ---- */
    const SITE = { sig: '', noBtn: 0 };
    const siteShown = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('#ink-panel,#ink-news,#ink-auto-row,#ink-order-bar,.bz-order'); };
    const siteLabel = b => `${b.getAttribute('aria-label') || ''} ${b.title || ''}`;
    function siteBtnOn(b) {
        for (const a of ['aria-pressed', 'aria-checked', 'aria-selected']) { const v = b.getAttribute(a); if (v === 'true') return true; if (v === 'false') return false; }
        if (/(^|\s|--|__)(is-)?(active|on|selected|ativo)(\s|$)/i.test(b.getAttribute('class') || '')) return true;
        // sem marcação: o botão aceso tem fundo; compara com os vizinhos
        const fundo = e => { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(e).backgroundColor); if (!m) return 0; const v = m[1].split(/[,\s/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
        const eu = fundo(b), outros = [...b.parentElement.children].filter(x => x !== b).map(fundo);
        if (outros.length) {
            if (eu > Math.min(...outros) + 0.03) return true;
            if (eu + 0.03 < Math.max(...outros)) return false;
        }
        return null;
    }
    // 'manga', 'hq' ou null (não dá pra saber agora, ex.: controles escondidos)
    function siteMode() {
        if (!location.pathname.startsWith('/ler/')) return null;
        const btns = $$('button,[role=button],[role=radio],[role=tab]').filter(siteShown);
        const mb = btns.find(b => /^[^\p{L}]*mang[aá][^\p{L}]*$/iu.test(txt(b)) || /(modo|leitura|dire[cç][aã]o)[^|]{0,20}mang[aá]/i.test(siteLabel(b)));
        if (mb) { const on = siteBtnOn(mb); return on === false ? 'hq' : 'manga'; }
        // sem botão MANGÁ: só conclui que é HQ se a barra de modos de página estiver na tela
        const zoom = btns.find(b => /ligar\s*bubble\s*zoom/i.test(siteLabel(b)) && !/desligar/i.test(siteLabel(b)));
        const group = zoom && zoom.parentElement, next = group && group.nextElementSibling;
        return next && $$('button', next).filter(siteShown).length >= 2 ? 'hq' : null;
    }
    function setMode(m) {
        const manga = m === 'manga';
        if (cfg.manga === manga) return;
        cfg.manga = manga; saveCfg(); workSave();
        try { OrderBar.sync(); } catch (e) { }
        refreshPanel();
        setStatus(manga ? '📖 Mangá ativado automaticamente' : '📚 HQ ativado automaticamente');
    }
    // só age quando o site muda, para o botão do painel continuar valendo se você trocar na mão
    function siteTick() {
        if (Prep.on) return;
        const m = siteMode();
        if (!m) { SITE.noBtn = 0; return; }
        // a barra pode aparecer aos poucos: HQ só vale depois de confirmado duas vezes
        if (m === 'hq' && ++SITE.noBtn < 2) return;
        if (m === 'manga') SITE.noBtn = 0;
        const sig = location.pathname + '|' + m;
        if (sig === SITE.sig) return;
        SITE.sig = sig;
        setMode(m);
    }

    /* ---- Por obra ---- */
    const WORK = { path: '', key: '' };
    function applyWork(k) {
        if (!cfg.perWork || !k) return;
        const w = cfg.works[k]; if (!w) return;
        if (w.speed) cfg.speed = w.speed;
        if (typeof w.manga === 'boolean' && w.manga !== cfg.manga) { cfg.manga = w.manga; try { OrderBar.sync(); } catch (e) { } }
        saveCfg(); refreshPanel();
    }
    function workTick() {
        if (location.pathname === WORK.path) return;
        WORK.path = location.pathname;
        if (!location.pathname.startsWith('/ler/') && RX_OBRA.test(location.pathname)) {
            try { sessionStorage.setItem('ink_work', location.pathname); sessionStorage.setItem('ink_work_title', (document.title || '').trim().slice(0, 60)); } catch (e) { }
        }
        const k = workKey();
        if (k !== WORK.key) { WORK.key = k; applyWork(k); }
    }

    /* ---- Timer de sono ---- */
    const SLEEP_MIN = [0, 15, 30, 45, 60, 90];
    const SLEEP_CAP = [0, 1, 2, 3, 5];
    const SLEEP = { endAt: 0, caps: 0, fading: false, t0: 0 };
    const FADE_MS = 20000;
    function sleepArm() {
        SLEEP.fading = false;
        SLEEP.endAt = cfg.sleepMin ? Date.now() + cfg.sleepMin * 60000 : 0;
        SLEEP.caps = cfg.sleepCaps | 0;
    }
    function sleepChapter() {
        if (SLEEP.caps > 0 && --SLEEP.caps === 0 && !SLEEP.fading) { SLEEP.fading = true; SLEEP.t0 = Date.now(); }
    }
    function sleepTick() {
        const st = $('ink-sl-st');
        const now = Date.now();
        if (!running) {
            if (SLEEP.fading) { SLEEP.fading = false; musFade(1); }
            if (st && st.textContent) st.textContent = '';
            return;
        }
        if (!SLEEP.fading && SLEEP.endAt && now >= SLEEP.endAt) { SLEEP.fading = true; SLEEP.t0 = now; }
        if (SLEEP.fading) {
            const f = 1 - (now - SLEEP.t0) / FADE_MS;
            setText(st, '😴 Apagando o som…');
            if (f <= 0) {
                SLEEP.fading = false; SLEEP.endAt = 0; SLEEP.caps = 0;
                stop('😴 Timer de sono: boa noite!');
                musPauseAll(); musFade(1);
            } else musFade(f);
            return;
        }
        if (!st) return;
        const parts = [];
        if (SLEEP.endAt) { const s = Math.max(0, Math.round((SLEEP.endAt - now) / 1000)); parts.push(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`); }
        if (SLEEP.caps > 0) parts.push(`${SLEEP.caps} cap.`);
        setText(st, parts.length ? '😴 Restam ' + parts.join(' · ') : '');
    }
    setInterval(sleepTick, 1000);
    const stepIn = (arr, cur, d) => { const i = Math.max(0, arr.indexOf(cur)); return arr[Math.min(arr.length - 1, Math.max(0, i + d))]; };

    /* ---- Filtro de olho automático por horário ---- */
    const EYEA = { last: null };
    function eyeWant() {
        const h = new Date().getHours(), a = cfg.eyeFrom | 0, b = cfg.eyeTo | 0;
        if (a === b) return false;
        return a < b ? (h >= a && h < b) : (h >= a || h < b);
    }
    function eyeAutoTick() {
        if (!cfg.eyeAuto) { EYEA.last = null; return; }
        const w = eyeWant();
        if (EYEA.last !== w) {
            EYEA.last = w;
            if (cfg.eye !== w) { cfg.eye = w; saveCfg(); applyEye(); refreshPanel(); }
        }
    }

    /* ---- Tela de bloqueio (Media Session + áudio silencioso) ---- */
    const KA = { a: null };
    function silentUrl() {
        const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
        w(36, 'data'); v.setUint32(40, n, true);
        for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
        return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }
    function mediaMeta() {
        const ms = navigator.mediaSession; if (!ms) return;
        try {
            ms.playbackState = running ? 'playing' : 'paused';
            if (typeof MediaMetadata !== 'undefined') ms.metadata = new MediaMetadata({
                title: (document.title || 'Ink').trim().slice(0, 80), artist: 'Ink Leitor', album: running ? stateLabel(readState()) : 'Parado'
            });
        } catch (e) { }
    }
    function kaStart() {
        if (cfg.media === false) return;
        try {
            if (!KA.a) { KA.a = new Audio(silentUrl()); KA.a.loop = true; KA.a.volume = 0.02; }
            KA.a.play().catch(() => { });
        } catch (e) { }
        mediaMeta();
    }
    function kaStop() {
        try { if (KA.a) KA.a.pause(); } catch (e) { }
        mediaMeta();
    }
    function mediaInit() {
        const ms = navigator.mediaSession; if (!ms) return;
        const set = (a, f) => { try { ms.setActionHandler(a, f); } catch (e) { } };
        set('play', () => { if (!running) mainLoop(); });
        set('pause', () => stop('Parado.'));
        set('stop', () => stop('Parado.'));
        set('nexttrack', () => musNext(1));
        set('previoustrack', () => musNext(-1));
        set('seekforward', () => setSpeed(1));
        set('seekbackward', () => setSpeed(-1));
    }

    /* ---- Estatísticas e sequência ---- */
    const STAT = { seen: new Set(), n: 0 };
    const dkey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dayOf = k => cfg.stats.days[k] || (cfg.stats.days[k] = { pages: 0, secs: 0 });
    const activeDay = x => !!x && ((x.secs || 0) >= 60 || (x.pages || 0) >= 3);
    function fmtT(s) { s = s | 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : (m ? `${m} min` : `${s}s`); }
    function streakN() {
        const D = cfg.stats.days; const d = new Date();
        if (!activeDay(D[dkey(d)])) d.setDate(d.getDate() - 1);
        let n = 0;
        while (activeDay(D[dkey(d)]) && n < 4000) { n++; d.setDate(d.getDate() - 1); }
        return n;
    }
    function pruneStats() {
        const ks = Object.keys(cfg.stats.days).sort();
        if (ks.length > 120) ks.slice(0, ks.length - 120).forEach(k => delete cfg.stats.days[k]);
    }
    function statsPaint() {
        const box = $('ink-stats'); if (!box) return;
        const D = cfg.stats.days, t = D[dkey()] || { pages: 0, secs: 0 };
        let tp = 0, ts = 0;
        for (const k in D) { tp += D[k].pages || 0; ts += D[k].secs || 0; }
        const sr = streakN();
        const lines = [
            `Hoje: ${t.pages} págs · ${fmtT(t.secs)}`,
            `Total: ${tp} págs · ${fmtT(ts)}`,
            `🔥 Sequência: ${sr} dia${sr === 1 ? '' : 's'}`
        ];
        const vals = [];
        for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); vals.push((D[dkey(d)] || {}).secs || 0); }
        const mx = Math.max(60, ...vals);
        // só redesenha quando algum número mudou de verdade
        const sig = lines.join('|') + '|' + vals.map(v => Math.max(6, Math.round(v / mx * 100)) + fmtT(v)).join(',');
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        box.textContent = '';
        lines.forEach(s => { const d = document.createElement('div'); d.textContent = s; box.appendChild(d); });
        const bars = document.createElement('div'); bars.className = 'ia-bars';
        vals.forEach(v => { const s = document.createElement('span'); s.style.height = Math.max(6, Math.round(v / mx * 100)) + '%'; s.title = fmtT(v); bars.appendChild(s); });
        box.appendChild(bars);
    }
    function statTick() {
        STAT.n++;
        if (running && !paused()) {
            const t = dayOf(dkey()); t.secs++;
            const k = metaKey(readState());
            if (k && !STAT.seen.has(k)) { STAT.seen.add(k); if (STAT.seen.size > 1) t.pages++; }
            if (STAT.n % 5 === 0) mediaMeta();
        }
        if (running && STAT.n % 10 === 0) { pruneStats(); saveCfg(); }
        if (running && cfg.tab === 'more' && !cfg.min && !document.hidden && STAT.n % 3 === 0) statsPaint();
    }
    setInterval(statTick, 1000);

    /* ---- Backup das configurações ---- */
    async function backupExport() {
        const ta = $('ink-bk'); if (!ta) return;
        const text = JSON.stringify({ app: 'ink-leitor', v: VERSION, cfg, music: MUS.list });
        ta.value = text;
        const ok = await copyText(text);
        if (nativeApp()) { try { window.InkNative.share(text); } catch (e) { } }
        else if (!ok) {
            try {
                const u = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                const a = document.createElement('a'); a.href = u; a.download = 'ink-backup.json';
                document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
            } catch (e) { }
        }
        setStatus(ok ? '💾 Backup copiado! Cole em um lugar seguro.' : '💾 Backup gerado na caixa acima.');
    }
    function backupImport() {
        const ta = $('ink-bk'); if (!ta) return;
        try {
            const j = JSON.parse(ta.value.trim());
            if (!j || j.app !== 'ink-leitor' || !j.cfg || typeof j.cfg !== 'object') throw new Error('não parece um backup do Ink');
            Object.assign(cfg, DEFAULTS, j.cfg);
            if (!cfg.works || typeof cfg.works !== 'object') cfg.works = {};
            if (!cfg.stats || !cfg.stats.days) cfg.stats = { days: {} };
            if (Array.isArray(j.music)) { try { localStorage.setItem('ink_music_list', JSON.stringify(j.music)); } catch (e) { } }
            try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
            setStatus('✓ Backup restaurado. Recarregando…');
            setTimeout(() => location.reload(), 700);
        } catch (e) { setStatus('⚠ Backup inválido: ' + (e.message || e)); }
    }

    /* ---- Tela cheia (app: esconde as barras do Android; navegador: Fullscreen API) ---- */
    function applyFull() {
        if (window.InkNative && typeof window.InkNative.fullscreen === 'function') {
            try { window.InkNative.fullscreen(!!cfg.full); } catch (e) { }
            return;
        }
        try {
            if (cfg.full && !document.fullscreenElement) document.documentElement.requestFullscreen();
            else if (!cfg.full && document.fullscreenElement) document.exitFullscreen();
        } catch (e) { }
    }
    function toggleFull() { cfg.full = !cfg.full; saveCfg(); applyFull(); refreshPanel(); }

    /* ================================================================== *
     * 12b. ATUALIZAÇÃO (compara com o content.js do GitHub)
     *  Extensão: o botão "Atualizar" pede ao bg.js para baixar o arquivo novo; depois F5.
     *  App (APK): a ponte nativa baixa e recarrega a página sozinha.
     *  Sem nenhum dos dois (Tampermonkey): baixa o arquivo como fallback.
     * ================================================================== */
    const UPD_URL = 'https://raw.githubusercontent.com/lucateli/ink-atualizacoes/main/content.js';
    const UPD = { text: '', ver: '', log: null };
    const vnum = v => String(v).split('.').map(n => parseInt(n, 10) || 0);
    const vGt = (a, b) => {
        const x = vnum(a), y = vnum(b);
        for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
        return false;
    };

    let updSeq = 0;
    const updWait = new Map();
    window.addEventListener('message', e => {
        const d = e.data;
        if (e.source !== window || !d || !d.inkUpdRes) return;
        const f = updWait.get(d.inkUpdRes);
        if (f) { updWait.delete(d.inkUpdRes); f(d); }
    });
    function extSync() {   // pede ao bg.js / app para baixar e registrar o script novo
        return new Promise((res, rej) => {
            const id = ++updSeq;
            const t = setTimeout(() => { updWait.delete(id); rej(new Error('sem extensão')); }, 12000);
            updWait.set(id, d => { clearTimeout(t); d.err ? rej(new Error(d.err)) : res(d.data); });
            window.postMessage({ inkUpd: id }, '*');
        });
    }
    function downloadNew() {
        const url = URL.createObjectURL(new Blob([UPD.text], { type: 'text/javascript' }));
        const a = document.createElement('a'); a.href = url; a.download = 'content.js';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        setStatus('Baixado como content.js. Troque o arquivo e recarregue.');
    }
    async function applyUpdate() {
        // programa de PC: quem baixa é o próprio .exe, ao abrir; aqui não baixa arquivo nenhum
        // 4.13.10: guarda a versão nova e recarrega a página; no recarregamento ela roda no lugar desta
        if (window.__INK_PC__) {
            if (!UPD.text || !UPD.ver) { setStatus('⚠ Toque em verificar atualização e tente de novo.'); return; }
            try { localStorage.setItem('ink_pc_hot', JSON.stringify({ ver: UPD.ver, text: UPD.text })); }
            catch (e) { setStatus('⚠ Não consegui guardar a atualização. Feche e abra o programa.'); return; }
            setStatus('✓ Atualizado! Reiniciando…');
            setTimeout(() => location.reload(), 600);
            return;
        }
        setStatus('⏳ Atualizando…');
        try {
            const r = await extSync();
            if (r && r.ok) setStatus(r.src === 'app' ? '✓ Atualizado! Recarregando…' : `✓ Atualizado (${r.src}). Aperte F5 para aplicar.`);
            else setStatus('⚠ Ative "Permitir scripts de usuário" nos Detalhes da extensão e tente de novo.');
        } catch (e) {
            if (UPD.text && !window.InkNative) downloadNew(); else setStatus('⚠ ' + (e.message || e));
        }
    }

    const hideUpd = () => { const b = $('ink-upd'); if (b) b.hidden = true; };
    function showUpd() {
        const b = $('ink-upd'); if (!b) return;
        b.textContent = '';
        const s = document.createElement('span'); s.textContent = `⬆ Nova versão ${UPD.ver} · ver novidades`; s.style.cursor = 'pointer'; s.onclick = () => openNews();
        const dl = document.createElement('button'); dl.className = 'ia-upd-b'; dl.textContent = 'Atualizar';
        dl.onclick = applyUpdate;
        const x = document.createElement('button'); x.className = 'ia-upd-b'; x.textContent = '✕'; x.title = 'Ignorar esta versão';
        x.onclick = () => { cfg.updSkip = UPD.ver; saveCfg(); hideUpd(); };
        b.append(s, dl, x);
        b.hidden = false;
    }
    // O arquivo precisa terminar com o marcador de fim e compilar. Evita instalar uma cópia cortada.
    function validScript(t) {
        if (typeof t !== 'string' || t.length < 20000) return false;
        if (!t.trimEnd().endsWith('/*' + 'INK_EOF' + '*/')) return false;
        try { new Function(t); } catch (e) { if (e instanceof SyntaxError) return false; }   // CSP pode bloquear Function: aí só vale o marcador
        return true;
    }
    async function checkUpdate(manual) {
        try {
            if (manual) setStatus('🔄 Verificando atualização…');
            const r = await fetch(UPD_URL + '?t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const t = await r.text();
            if (!validScript(t)) throw new Error('arquivo do GitHub incompleto/cortado, não vou atualizar');
            const m = /const VERSION = '([\d.]+)'/.exec(t);
            if (!m) throw new Error('versão não encontrada no arquivo');
            UPD.text = t; UPD.ver = m[1]; UPD.log = parseCL(t);
            newsDot(); if ($('ink-news')) renderNews();
            if (vGt(m[1], VERSION)) {
                if (manual || cfg.updSkip !== m[1]) showUpd();
                if (manual) setStatus(`⬆ Nova versão ${m[1]} disponível`);
            } else {
                hideUpd();
                if (manual) setStatus(`✓ Já está na versão mais recente (${VERSION})`);
            }
        } catch (e) { if (manual) setStatus('⚠ Não consegui verificar: ' + (e.message || e)); }
    }


    /* ================================================================== *
     * 12b. NOVIDADES (o que veio de novo)
     *  A lista abaixo é lida também do arquivo NOVO no GitHub, então o painel
     *  mostra as novidades ANTES de você atualizar.
     *  REGRA: ao subir a versão, adicione uma entrada NO TOPO e mantenha JSON válido
     *  (aspas duplas, sem vírgula sobrando) entre os marcadores CL_START e CL_END.
     * ================================================================== */
    /*CL_START*/
    const CHANGELOG = [
        { "v": "4.13.18", "d": "2026-11-27", "t": [
            "Corrigido o histórico do painel de novidades: a lista agora inclui a nota da versão 4.13.17, que estava ausente",
            "A versão 4.13.18 também registra esta correção para que o programa detecte a atualização e mostre a novidade"
        ] },
        { "v": "4.13.17", "d": "2026-11-27", "t": [
            "Auto Mangá: organiza os quadros por faixas, de cima para baixo e da direita para a esquerda, considerando quadros de tamanhos diferentes",
            "Modo HQ mantém a lógica anterior; prévia, desfazer e controles do ordenador continuam disponíveis"
        ] },
        { "v": "4.13.16", "d": "2026-11-27", "t": [
            "Leitura automática mais leve: assinatura visual e verificação do botão de próximo capítulo agora usam caches curtos",
            "Menos varreduras repetidas da página ao procurar o modal de bolhas e a lista de capítulos"
        ] },
        { "v": "4.13.15", "d": "2026-11-27", "t": [
            "Preparar capítulo pula as páginas que já ficaram salvas num preparo anterior (se sobraram só algumas, refaz só elas). \"Recomeçar do zero\" continua refazendo tudo",
            "Novo botão \"Parar se as Tintas acabarem\" (desligado por padrão): quando o site avisa que as Tintas de hoje caíram, o preparo para depois de salvar a página e você continua depois em Continuar"
        ] },
        { "v": "4.13.14", "d": "2026-11-27", "t": [
            "A barra de páginas do site não avança mais com o Preparar capítulo ligado: acha a faixa inteira (número + barra deslizante), copia o valor da barra e, se não achar, congela pelo menos o número"
        ] },
        { "v": "4.13.13", "d": "2026-11-27", "t": [
            "A barra de páginas congelada durante o preparo agora fica mesmo parada na tela: antes a cópia seguia a barra original e subia quando o site mudava o layout (ex.: ao aparecer 2/8 · 158/178)"
        ] },
        { "v": "4.13.12", "d": "2026-11-27", "t": [
            "Arrumar bolhas agora mostra quantas bolhas precisam mesmo ser movidas (\"Movendo 2 de 7 · as outras 5 já estão no lugar\"); as que já estão na ordem certa não são tocadas"
        ] },
        { "v": "4.13.11", "d": "2026-11-27", "t": [
            "Preparar capítulo no máximo: arraste rápido em 1 passo, conferências do site a cada ~2 ms e esperas mínimas ao carregar as bolhas e ao assentar a animação",
            "Se o arraste de 1 passo falhar, ele sobe sozinho para o ritmo médio/lento e volta ao rápido depois de acertar 10 vezes seguidas"
        ] },
        { "v": "4.13.10", "d": "2026-11-27", "t": [
            "No programa de PC, o botão Atualizar agora aplica a versão nova e reinicia a página sozinho, sem precisar fechar e abrir o programa"
        ] },
        { "v": "4.13.9", "d": "2026-11-27", "t": [
            "Arrumar bolhas mais rápido: move só as bolhas que estão fora do lugar (a maior sequência já certa fica parada), com bem menos arrastes por página",
            "Espera um pouco menos as bolhas carregarem ao abrir cada página"
        ] },
        { "v": "4.13.8", "d": "2026-11-27", "t": [
            "A barra de páginas do site (ex.: 109/178) fica parada enquanto o Preparar capítulo está ligado; o preparo segue arrumando as páginas normalmente e a barra volta ao normal quando ele termina"
        ] },
        { "v": "4.13.7", "d": "2026-11-27", "t": [
            "Preparar capítulo tenta trocar de página sem desligar e ligar o Bubble Zoom a cada página (mais rápido); se o site não aceitar, volta sozinho ao jeito anterior"
        ] },
        { "v": "4.13.6", "d": "2026-11-27", "t": [
            "Preparar capítulo e Auto Mangá/HQ no limite: arraste em 2 passos quase sem pausa e sem esperas fixas ao trocar de página e ao salvar",
            "Páginas sem balões esperam até 1 s (antes 1,5 s)"
        ] },
        { "v": "4.13.5", "d": "2026-11-27", "t": [
            "Preparar capítulo e Auto Mangá/HQ de novo mais rápidos: arraste com ainda menos passos e quase sem pausas, e conferências mais frequentes do site",
            "Páginas sem balões esperam até 1,5 s (antes 2,5 s) e as pausas ao trocar de página e ao salvar quase sumiram"
        ] },
        { "v": "4.13.4", "d": "2026-11-26", "t": [
            "Preparar capítulo e Auto Mangá/HQ ainda mais rápidos: o arraste das bolhas usa menos passos e esperas bem menores em todos os ritmos",
            "O preparo confere o site com mais frequência e espera menos ao trocar de página, ao carregar as bolhas e ao fechar a tela de arrumar",
            "Páginas sem balões agora esperam até 2,5 s (antes eram 4 s)"
        ] },
        { "v": "4.13.3", "d": "2026-11-26", "t": [
            "O painel não pula mais durante o Preparar capítulo: o status e a linha de progresso têm altura fixa (texto longo rola dentro da caixa)",
            "A linha Continuar não some quando o preparo começa, então nada se mexe de lugar",
            "O detalhe de cada posição das bolhas aparece só no status do topo; o painel só reescreve um texto quando ele realmente mudou"
        ] },
        { "v": "4.13.2", "d": "2026-11-26", "t": [
            "Preparar capítulo e Auto Mangá/HQ bem mais rápidos: o arraste das bolhas ficou mais curto, sem esperas fixas, e quando dá move a bolha direto para o lugar certo",
            "Se o arraste rápido falhar, ele volta sozinho para o modo lento e seguro, e depois de acertar várias vezes tenta o rápido de novo",
            "Páginas sem balões agora esperam até 4 s (antes eram 7 s) e as pausas entre as páginas ficaram menores"
        ] },
        { "v": "4.13.1", "d": "2026-11-26", "t": [
            "No programa de PC, o botão Atualizar não baixa mais arquivos: avisa para fechar e abrir"
        ] },
        { "v": "4.13.0", "d": "2026-11-26", "t": [
            "Mangá automático: o painel segue o botão MANGÁ do leitor do Ink",
            "Preparar capítulo confere o modo do site antes de começar"
        ] },
        { "v": "4.12.0", "d": "2026-11-26", "t": [
            "Novo botão Continuar: o preparo volta da página onde parou",
            "Recomeçar do zero agora pede um segundo toque, para evitar toque por engano"
        ] },
        { "v": "4.11.0", "d": "2026-11-26", "t": [
            "Novo botão Preparar capítulo: arruma e salva as bolhas página por página e volta para a página 1",
            "Páginas que não derem certo não são salvas e aparecem na lista para revisar"
        ] },
        { "v": "4.10.0", "d": "2026-11-26", "t": [
            "Arrumar as bolhas: novos botões Prévia, Desfazer e Parar, e andamento durante o arraste",
            "Dicionário de pronúncia e botão para repetir a última fala",
            "Páginas favoritas com anotação",
            "Atalhos de teclado no PC com Alt+Shift"
        ] },
        { "v": "4.9.3", "d": "2026-11-26", "t": [
            "Arraste das bolhas ajustado: move uma posição por vez, rolando a fileira para a bolha ficar visível",
            "Bolhas empilhadas agora são lidas de cima para baixo"
        ] },
        { "v": "4.9.2", "d": "2026-11-26", "t": [
            "Auto Mangá/HQ: o quadrado + não é mais contado como bolha, o que causava o erro de não ler a posição das bolhas"
        ] },
        { "v": "4.9.1", "d": "2026-11-26", "t": [
            "Auto Mangá/HQ corrigido: quando as miniaturas das bolhas não permitem calcular a posição, o painel agora lê pelas caixas numeradas desenhadas sobre a página",
            "A mensagem de erro agora diz o que tentou, para facilitar achar o problema"
        ] },
        { "v": "4.9.0", "d": "2026-11-26", "t": [
            "Interface refeita: botões principais na aba Ler e o resto em seções que abrem e fecham",
            "Controles de − e + maiores e padronizados; o status agora fica no topo",
            "Arrastar o painel não vigia mais os toques da página inteira",
            "No modo leve o título fica parado e o painel não usa sombra",
            "Menos atualizações da tela quando nada muda ou o app está em segundo plano"
        ] },
        { "v": "4.8.3", "d": "2026-11-26", "t": [
            "Erros do próprio script não chegam mais no tratador de erros do site (timers, observadores, leitura e início protegidos)",
            "Popups e cortinas escuras agora são escondidos em vez de removidos, para não quebrar o app do site",
            "Se o site mostrar \"O Ink não abriu neste aparelho\", o painel recarrega 1x e, se repetir, entra em modo seguro por 30 min",
            "Erros do script ficam registrados no console como [Ink] erro em… (e em window.__inkErrs)"
        ] },
        { "v": "4.8.2", "d": "2026-11-25", "t": [
            "Versão completa reenviada (a cópia anterior no GitHub tinha vindo cortada) e novo build do APK",
            "Regra nova no cabeçalho: o arquivo sempre termina com o marcador de fim"
        ] },
        { "v": "4.8.1", "d": "2026-11-25", "t": [
            "Proteção contra arquivo cortado: o painel só oferece atualizar se o arquivo do GitHub estiver completo e sem erro",
            "Se o arquivo do GitHub vier incompleto, o painel avisa em vez de instalar uma versão quebrada"
        ] },
        { "v": "4.8.0", "d": "2026-11-25", "t": [
            "Novo botão ⏭ Pular telas iniciais na aba Ler: fecha os avisos e novidades que o site abre ao entrar",
            "Pula sozinho nos primeiros segundos depois de abrir (liga/desliga em Mais → Pular telas sozinho)",
            "Só clica em fechar / agora não / pular; nunca em Ver agora ou Aceitar"
        ] },
        { "v": "4.7.0", "d": "2026-11-25", "t": [
            "Painel bem menor e compacto, escuro em todos os temas (inclusive no PC)",
            "Nova aba Ajustes: voz, filtro de olho, skins e missão saíram da aba Ler",
            "A aba Ler agora cabe sem rolar: só o botão de ler, velocidade e os atalhos"
        ] },
        { "v": "4.6.0", "d": "2026-11-25", "t": [
            "Painel de novidades: toque no botão 🆕 do topo para ver o que mudou",
            "Mostra as novidades da versão nova antes de você atualizar, com botão Atualizar agora",
            "Abre sozinho uma vez depois que o app atualiza; bolinha vermelha avisa quando há novidade"
        ] },
        { "v": "4.5.1", "d": "2026-11-25", "t": [
            "Interface mobile nova: escura, opaca e com botões maiores",
            "Corrigido o painel claro demais no modo menina (texto sumia nos botões)",
            "A versão do APK agora é sempre igual à do content.js"
        ] },
        { "v": "4.5.0", "d": "", "t": [
            "Continuar de onde parou, com botão no painel",
            "Velocidade e direção lembradas por obra",
            "Timer de sono por minutos ou capítulos",
            "Filtro de olho automático por horário",
            "Controles na tela de bloqueio e opção de pular balões sem sentido",
            "OCR em português, inglês e japonês",
            "Estatísticas de leitura, tela cheia, backup e compartilhar"
        ] }
    ];
    /*CL_END*/

    function parseCL(text) {
        try {
            const m = /\/\*CL_START\*\/\s*const CHANGELOG = (\[[\s\S]*?\]);?\s*\/\*CL_END\*\//.exec(text);
            if (!m) return null;
            const a = JSON.parse(m[1]);
            return Array.isArray(a) ? a : null;
        } catch (e) { return null; }
    }
    function newsEntries() {
        const map = new Map();
        (UPD.log || []).forEach(e => { if (e && e.v) map.set(e.v, e); });
        CHANGELOG.forEach(e => map.set(e.v, e));
        return [...map.values()].sort((a, b) => (vGt(a.v, b.v) ? -1 : vGt(b.v, a.v) ? 1 : 0));
    }
    const hasNewer = () => !!(UPD.ver && vGt(UPD.ver, VERSION));
    function newsDot() {
        const d = $('ink-news-dot'); if (!d) return;
        d.hidden = !(cfg.seenVer !== VERSION || hasNewer());
    }
    function newsTheme() {
        const n = $('ink-news'); if (!n) return;
        n.classList.toggle('boy', !cfg.girl);
        SKINS.forEach(k => n.classList.toggle('skin-' + k.id, cfg.girl && curSkin().id === k.id));
    }
    function closeNews() {
        const n = $('ink-news'); if (n) n.remove();
        document.removeEventListener('keydown', newsKey, true);
    }
    function newsKey(e) { if (e.key === 'Escape') closeNews(); }
    function renderNews() {
        const box = $('ink-news-body'); if (!box) return;
        box.textContent = '';
        const el = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };

        const ban = el('div', 'nw-ban' + (hasNewer() ? ' up' : ''));
        if (hasNewer()) {
            ban.append(el('div', 'nw-ban-t', `⬆ Nova versão ${UPD.ver} disponível`), el('div', 'nw-ban-s', `Você está na ${VERSION}.`));
            const b = el('button', 'nw-btn', 'Atualizar agora');
            b.onclick = async () => { b.disabled = true; b.textContent = '⏳ Atualizando…'; await applyUpdate(); b.textContent = window.__INK_PC__ ? '⏳ Reiniciando…' : '✓ Pedido enviado'; };
            ban.append(b);
        } else {
            ban.append(el('div', 'nw-ban-t', `✓ Versão ${VERSION} (mais recente conhecida)`));
            const b = el('button', 'nw-btn', 'Verificar agora');
            b.onclick = async () => { b.disabled = true; b.textContent = '🔄 Verificando…'; await checkUpdate(true); if ($('ink-news')) renderNews(); };
            ban.append(b);
        }
        box.append(ban);

        if (hasNewer() && !newsEntries().some(e => e.v === UPD.ver)) {
            box.append(el('div', 'nw-card new', 'Esta versão ainda não tem notas de novidades.'));
        }
        newsEntries().forEach(e => {
            const isNew = vGt(e.v, VERSION), cur = e.v === VERSION;
            const c = el('div', 'nw-card' + (isNew ? ' new' : ''));
            const h = el('div', 'nw-ch');
            h.append(el('span', 'nw-v', 'v' + e.v));
            if (isNew) h.append(el('span', 'nw-tag', 'NOVA'));
            else if (cur) h.append(el('span', 'nw-tag cur', 'INSTALADA'));
            if (e.d) h.append(el('span', 'nw-d', e.d.split('-').reverse().join('/')));
            c.append(h);
            const ul = el('ul');
            (Array.isArray(e.t) ? e.t : []).forEach(x => ul.append(el('li', null, String(x))));
            c.append(ul);
            box.append(c);
        });
    }
    function openNews() {
        if ($('ink-news')) { closeNews(); return; }
        const n = document.createElement('div');
        n.id = 'ink-news';
        n.innerHTML = `<div class="nw-box" role="dialog" aria-label="Novidades">
  <div class="nw-head"><div class="nw-title">🆕 O que há de novo</div><button class="nw-x" id="ink-news-x" aria-label="Fechar">✕</button></div>
  <div class="nw-body" id="ink-news-body"></div></div>`;
        n.addEventListener('click', e => { if (e.target === n) closeNews(); });
        document.body.appendChild(n);
        $('ink-news-x').onclick = closeNews;
        document.addEventListener('keydown', newsKey, true);
        newsTheme(); renderNews();
        cfg.seenVer = VERSION; saveCfg(); newsDot();
        if (!UPD.ver) checkUpdate(false).then(() => { if ($('ink-news')) renderNews(); });
    }

    /* ================================================================== *
     * 13. ÍCONES + CSS
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
/* interface 4.9.0: um bloco só, sem desfoque; tamanhos por variável (.mob = celular) */
#ink-panel{--ib-bg:#2a1622;--ib-card:#43233a;--ib-line:#6d3654;--ib-txt:#ffeef5;--ib-dim:#e2b0c7;--ib-ac:#ff4f9a;
--h:30px;--hgo:36px;--r:9px;--g:4px;--fs:11.5px;
position:fixed;bottom:12px;right:12px;z-index:2147483000;box-sizing:border-box;width:min(224px,calc(100vw - 16px));max-height:calc(100dvh - 24px);overflow:hidden auto;overscroll-behavior:contain;
padding:8px;border:1px solid var(--ib-line);border-radius:16px;background:var(--ib-bg);color:var(--ib-txt);font:var(--fs)/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.45)}
#ink-panel.mob{--h:44px;--hgo:50px;--r:12px;--g:6px;--fs:13px;width:min(320px,calc(100vw - 16px));max-height:min(76dvh,calc(100dvh - 24px));padding:10px;border-radius:20px}
#ink-panel.skin-lobo{--ib-bg:#161c2a;--ib-card:#252e43;--ib-line:#3f4c6b;--ib-txt:#eef2fa;--ib-dim:#a3afc8;--ib-ac:#5f8fd0}
#ink-panel.boy{--ib-bg:#121216;--ib-card:#222228;--ib-line:#393942;--ib-txt:#f4f2ef;--ib-dim:#b0adba;--ib-ac:#e8573f}
#ink-panel.lite{box-shadow:none}
#ink-panel *{box-sizing:border-box}
#ink-panel button{all:unset;box-sizing:border-box;cursor:pointer;user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;display:inline-flex;align-items:center;justify-content:center;gap:5px}
#ink-panel button:active{filter:brightness(1.3)}
#ink-panel button:focus-visible{outline:2px solid var(--ib-txt);outline-offset:-2px}
#ink-panel [hidden]{display:none!important}

#ink-panel .ia-head{display:flex;align-items:center;gap:var(--g);cursor:grab;touch-action:none}
#ink-panel .ia-title{flex:1;min-width:0;font-weight:800;color:var(--ib-ac);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ink-panel .ia-title.tick:not(.still){text-overflow:clip}
#ink-panel .ia-tick-in{display:inline-block;padding-left:100%;white-space:nowrap}
@keyframes ink-tick{from{transform:translateX(0)}to{transform:translateX(-100%)}}
#ink-panel .ia-ib{position:relative;flex:none;width:calc(var(--h) - 4px);height:calc(var(--h) - 4px);border-radius:var(--r);background:var(--ib-card)}
#ink-panel .ia-dot{position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:#ff3b3b}

/* 4.13.3: status com altura FIXA (2 linhas, o que passar rola dentro da caixa): o painel não cresce nem encolhe quando a mensagem muda */
#ink-panel .ia-status{height:calc(2.6em + 8px);margin-top:var(--g);padding:4px 2px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--ib-line) transparent;color:var(--ib-dim);overflow-wrap:anywhere}
#ink-panel.run .ia-status{color:var(--ib-txt)}
/* 4.13.3: progresso do "Preparar capítulo", também com altura fixa */
#ink-panel .ia-pst{height:calc(2 * 1.35em + 2px);margin-top:var(--g);padding:0 2px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--ib-line) transparent;font-size:.85em;line-height:1.35;color:var(--ib-dim);overflow-wrap:anywhere}

#ink-panel .ia-tabs{display:flex;gap:2px;margin-top:var(--g);padding:2px;border-radius:calc(var(--r) + 2px);background:var(--ib-card)}
#ink-panel .ia-tab{flex:1;min-width:0;min-height:calc(var(--h) - 4px);flex-direction:column;gap:0;border-radius:var(--r);color:var(--ib-dim);font-size:.85em;font-weight:700;white-space:nowrap;overflow:hidden}
#ink-panel .ia-tab.on{background:var(--ib-ac);color:#fff}
#ink-panel .ia-pane.hide{display:none}
/* fora da tela (não display:none) para o YouTube continuar tocando */
#ink-panel .ia-pane.ghost,#ink-panel.min #ink-body{position:absolute;left:-9999px;top:0;width:220px;visibility:hidden}
#ink-panel .ia-pane.ghost #ink-yt-box,#ink-panel.min #ink-yt-box{visibility:visible}

#ink-panel .ia-go{width:100%;height:var(--hgo);margin-top:var(--g);border-radius:var(--r);background:var(--ib-ac);color:#fff;font-size:1.15em;font-weight:800}
#ink-panel.run .ia-go{background:var(--ib-card);box-shadow:inset 0 0 0 2px var(--ib-ac);color:var(--ib-txt)}
#ink-panel .ia-cont{display:flex;justify-content:flex-start;width:100%;min-height:var(--h);margin-top:var(--g);padding:4px 10px;border-radius:var(--r);box-shadow:inset 0 0 0 1px var(--ib-ac);font-weight:700}
#ink-panel .ia-cont span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

#ink-panel .ia-row{display:flex;gap:var(--g);margin-top:var(--g);align-items:stretch}
#ink-panel .ia-chip{flex-direction:column;gap:2px;min-height:var(--h);padding:3px;border-radius:var(--r);background:var(--ib-card);color:var(--ib-txt);font-size:.88em;font-weight:600;text-align:center}
#ink-panel .ia-row>.ia-chip{flex:1;flex-direction:row;gap:4px;font-size:1em}
#ink-panel .ia-chip.on,#ink-panel .ia-skin.on,#ink-panel .ia-trk.on{background:var(--ib-ac);color:#fff}
#ink-panel .ia-chip svg{width:1.35em;height:1.35em}
#ink-panel .ia-step>.ia-chip{flex:0 0 calc(var(--h) + 10px);font-size:1.35em}
#ink-panel .ia-val{flex:1;min-width:0;align-self:center;text-align:center;font-weight:700}
#ink-panel .ia-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--g);margin-top:var(--g)}
#ink-panel .ia-grid.four{grid-template-columns:repeat(4,1fr)}
#ink-panel .ia-grid>.ia-chip{min-height:calc(var(--h) + 8px)}

#ink-panel .ia-fold{margin-top:var(--g);border-top:1px solid var(--ib-line)}
#ink-panel .ia-fold>summary{display:flex;align-items:center;justify-content:space-between;min-height:var(--h);padding:0 2px;cursor:pointer;list-style:none;font-weight:700;user-select:none;-webkit-tap-highlight-color:transparent}
#ink-panel .ia-fold>summary::-webkit-details-marker{display:none}
#ink-panel .ia-fold>summary::after{content:"+";color:var(--ib-ac);font-size:1.3em}
#ink-panel .ia-fold[open]>summary::after{content:"−"}
#ink-panel .ia-fold>:last-child{margin-bottom:var(--g)}

#ink-panel .ia-sec{margin:calc(var(--g)*2) 2px 2px;font-size:.82em;letter-spacing:.6px;text-transform:uppercase;color:var(--ib-dim);font-weight:700}
#ink-panel .ia-skins{display:flex;gap:var(--g)}
#ink-panel .ia-skin{flex:1;min-height:var(--h);border-radius:var(--r);background:var(--ib-card);font-weight:600}
#ink-panel .ia-inp{display:block;width:100%;min-height:var(--h);margin-top:var(--g);padding:5px 8px;border-radius:var(--r);border:1px solid var(--ib-line);background:var(--ib-card);color:var(--ib-txt);font:inherit;outline:none}
#ink-panel .ia-inp:focus{border-color:var(--ib-ac)}
#ink-panel .ia-inp::placeholder{color:var(--ib-dim)}
#ink-panel textarea.ia-inp{min-height:54px;resize:none;font-size:.9em}
#ink-panel .ia-statbox{margin-top:var(--g);padding:7px 10px;border-radius:var(--r);background:var(--ib-card);line-height:1.55}
#ink-panel .ia-bars{display:flex;align-items:flex-end;gap:3px;height:30px;margin-top:5px}
#ink-panel .ia-bars span{flex:1;background:var(--ib-ac);border-radius:3px 3px 0 0}

#ink-panel #ink-upd{display:flex;align-items:center;gap:6px;margin-top:var(--g);padding:5px 8px;border-radius:var(--r);background:var(--ib-ac);color:#fff;font-weight:700}
#ink-panel #ink-upd span{flex:1}
#ink-panel .ia-upd-b{min-height:calc(var(--h) - 8px);padding:3px 9px;border-radius:7px;background:rgba(0,0,0,.25);color:#fff;font-weight:700}

#ink-panel.min{width:auto;padding:5px;border-radius:14px;overflow:visible}
#ink-panel.min .ia-title,#ink-panel.min #ink-upd-chk,#ink-panel.min #ink-news-btn{display:none}
#ink-panel #ink-mini-go{display:none;background:var(--ib-ac);color:#fff}
#ink-panel.min #ink-mini-go{display:inline-flex}

#ink-panel #ink-yt-box{margin-top:var(--g);border-radius:var(--r);overflow:hidden;aspect-ratio:16/9;background:#000}
#ink-panel #ink-yt-box:empty{display:none}
#ink-panel #ink-yt-box.off{position:absolute;left:-9999px;top:0;width:200px;height:113px;margin:0}
#ink-panel #ink-yt-box iframe{width:100%;height:100%;border:0;display:block}
#ink-panel .ia-mstat{margin-top:var(--g);color:var(--ib-dim);overflow-wrap:anywhere}
#ink-panel .ia-mstat:empty{display:none}
#ink-panel .ia-music-list{max-height:140px;overflow:auto;overscroll-behavior:contain;margin-top:var(--g);padding:3px;border-radius:var(--r);background:var(--ib-card);color:var(--ib-dim)}
#ink-panel .ia-trk{display:flex;border-radius:6px;content-visibility:auto;contain-intrinsic-size:auto 36px}
#ink-panel .ia-trk-t{flex:1;justify-content:flex-start;min-height:calc(var(--h) - 8px);padding:3px 6px;color:inherit;text-align:left}

/* ---------- painel de novidades ---------- */
#ink-news{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
--n-bg:#2a1622;--n-card:rgba(255,130,180,.14);--n-line:rgba(255,150,195,.38);--n-txt:#ffeef5;--n-dim:#e2b0c7;--n-ac:#ff4f9a}
#ink-news.skin-lobo{--n-bg:#161c2a;--n-card:rgba(150,170,205,.16);--n-line:rgba(170,190,225,.34);--n-txt:#eef2fa;--n-dim:#a3afc8;--n-ac:#5f8fd0}
#ink-news.boy{--n-bg:#121216;--n-card:rgba(255,255,255,.08);--n-line:rgba(255,255,255,.16);--n-txt:#f4f2ef;--n-dim:#b0adba;--n-ac:#e8573f}
#ink-news *{box-sizing:border-box}
#ink-news .nw-box{width:min(480px,100%);max-height:84dvh;display:flex;flex-direction:column;background:var(--n-bg);color:var(--n-txt);border:1.5px solid var(--n-line);border-bottom:0;border-radius:22px 22px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.5)}
@media (min-width:700px){#ink-news{align-items:center}#ink-news .nw-box{border-bottom:1.5px solid var(--n-line);border-radius:22px}}
#ink-news .nw-head{display:flex;align-items:center;gap:8px;padding:14px 16px 8px}
#ink-news .nw-title{flex:1;font-weight:800;font-size:18px;color:var(--n-ac)}
#ink-news .nw-x{width:38px;height:38px;border-radius:12px;border:1px solid var(--n-line);background:var(--n-card);color:var(--n-txt);font:inherit;font-size:16px;cursor:pointer;touch-action:manipulation}
#ink-news .nw-body{overflow-y:auto;overscroll-behavior:contain;padding:4px 16px max(18px,env(safe-area-inset-bottom))}
#ink-news .nw-ban{padding:12px;border-radius:14px;background:var(--n-card);border:1px solid var(--n-line)}
#ink-news .nw-ban.up{border-color:var(--n-ac)}
#ink-news .nw-ban-t{font-weight:800}
#ink-news .nw-ban-s{color:var(--n-dim);font-size:12.5px;margin-top:2px}
#ink-news .nw-btn{display:block;width:100%;min-height:44px;margin-top:10px;border:0;border-radius:12px;background:var(--n-ac);color:#fff;font:inherit;font-weight:800;cursor:pointer;touch-action:manipulation}
#ink-news .nw-btn:disabled{opacity:.6}
#ink-news .nw-card{margin-top:10px;padding:10px 12px;border-radius:14px;background:var(--n-card);border:1px solid var(--n-line)}
#ink-news .nw-card.new{border-color:var(--n-ac)}
#ink-news .nw-ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#ink-news .nw-v{font-weight:800;font-size:15px}
#ink-news .nw-tag{padding:2px 8px;border-radius:99px;background:var(--n-ac);color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.5px}
#ink-news .nw-tag.cur{background:transparent;border:1px solid var(--n-ac);color:var(--n-ac)}
#ink-news .nw-d{margin-left:auto;color:var(--n-dim);font-size:12px}
#ink-news ul{margin:7px 0 0;padding-left:18px}
#ink-news li{margin:4px 0}

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
        if ($('ink-css') && $('ink-css').dataset.v === VERSION) return;
        const old = $('ink-css'); if (old) old.remove();
        const s = document.createElement('style');
        s.id = 'ink-css'; s.dataset.v = VERSION; s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    /* ================================================================== *
     * 14. PAINEL
     * ================================================================== */
    function buildPanel() {
        if ($('ink-panel')) return;
        const u = document.createElement('div');
        u.id = 'ink-panel';
        u.classList.add(innerWidth < 700 ? 'mob' : 'cmp');   // mob = celular (toque grande) · cmp = PC/tablet (compacto)
        if (cfg.min) u.classList.add('min');
        u.innerHTML = `
<div class="ia-head" id="ink-head">
  <div class="ia-title" id="ink-title">Ink ${VERSION}</div>
  <button class="ia-ib" id="ink-news-btn" title="Novidades">🆕<i class="ia-dot" id="ink-news-dot" hidden></i></button>
  <button class="ia-ib" id="ink-upd-chk" title="Verificar atualização">🔄</button>
  <button class="ia-ib" id="ink-mini-go" title="Ler">${ICO.play}</button>
  <button class="ia-ib" id="ink-min" title="minimizar">${ICO.min}</button>
</div>
<div id="ink-body">
  <div id="ink-upd" hidden></div>
  <div class="ia-status" id="ink-status" role="status"></div>
  <div class="ia-tabs">
    <button class="ia-tab" data-tab="read">📖 Ler</button>
    <button class="ia-tab" data-tab="music">🎵 Música</button>
    <button class="ia-tab" data-tab="tune">🎚 Ajustes</button>
    <button class="ia-tab" data-tab="more">⚙ Mais</button>
  </div>

  <div class="ia-pane" data-pane="read">
    <button class="ia-cont" id="ink-cont" hidden><span></span></button>
    <button class="ia-go" id="ink-go">${ICO.play}<span>Ler sozinho</span></button>
    <div class="ia-row"><button class="ia-chip" id="ink-prep" title="Arruma e salva as bolhas de todas as páginas">🧰 Preparar capítulo</button></div>
    <div class="ia-row"><button class="ia-chip" id="ink-tinta" title="Para o preparo quando o site avisar que as Tintas de hoje acabaram; continue depois em Continuar">⏸ Parar se as Tintas acabarem</button></div>
    <div class="ia-row" hidden><button class="ia-chip" id="ink-prep-go">▶ Continuar</button></div>
    <div class="ia-pst" id="ink-prep-st" hidden></div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-spd-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-spd">1.5×</span>
      <button class="ia-chip" id="ink-spd+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-grid four">
      <button class="ia-chip" id="ink-manga">${ICO.book}<span>Mangá</span></button>
      <button class="ia-chip" id="ink-auto">✓<span>Auto-próx</span></button>
      <button class="ia-chip" id="ink-voice">${ICO.voice}<span>Voz</span></button>
      <button class="ia-chip" id="ink-eye">🌙<span>Olho</span></button>
    </div>
    <details class="ia-fold">
      <summary>Mais atalhos</summary>
      <div class="ia-grid">
        <button class="ia-chip" id="ink-perf">⚡<span>Leve</span></button>
        <button class="ia-chip" id="ink-anx">😬<span id="ink-anx-l">Ansiedade</span></button>
        <button class="ia-chip" id="ink-full">⛶<span>Tela cheia</span></button>
        <button class="ia-chip" id="ink-girl">👧<span>Menina</span></button>
        <button class="ia-chip" id="ink-sharec">🔗<span>Compartilhar</span></button>
        <button class="ia-chip" id="ink-skipintro" title="Fecha avisos e novidades que o site abre ao entrar">⏭<span>Pular telas</span></button>
      </div>
    </details>
  </div>

  <div class="ia-pane hide" data-pane="tune">
    <div class="ia-sec">Voz do audiolivro</div>
    <select class="ia-inp" id="ink-vsel"></select>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-vr-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-vr">1×</span>
      <button class="ia-chip" id="ink-vr+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-sec">Filtro de olho</div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-eyel-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-eyel">25%</span>
      <button class="ia-chip" id="ink-eyel+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-sec">Skins</div>
    <div class="ia-skins">
      ${SKINS.map(k => `<button class="ia-skin" data-skin="${k.id}">${k.emo} ${k.nome}</button>`).join('')}
    </div>
    <div class="ia-sec">Missão: meta de páginas</div>
    <div class="ia-row">
      <button class="ia-chip" id="ink-meta-btn">🎯 <span id="ink-meta-lbl">Ligar meta</span></button>
    </div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-meta-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-meta-val">10</span>
      <button class="ia-chip" id="ink-meta+" aria-label="Aumentar">+</button>
    </div>
  </div>

  <div class="ia-pane" data-pane="music">
    <div class="ia-sec">YouTube</div>
    <input class="ia-inp" id="ink-yt-url" type="text" inputmode="url" autocomplete="off" placeholder="Cole o link (vídeo ou playlist)">
    <div class="ia-row">
      <button class="ia-chip" id="ink-yt-go" style="flex:2">▶ Tocar link</button>
      <button class="ia-chip" id="ink-yt-show" title="Mostrar/ocultar vídeo">🎬</button>
      <button class="ia-chip" id="ink-yt-x" title="Fechar player">✖</button>
    </div>
    <div id="ink-yt-box"></div>
    <div class="ia-sec">Controles</div>
    <div class="ia-row">
      <button class="ia-chip" id="ink-music-prev">⏮</button>
      <button class="ia-chip" id="ink-music-play">▶</button>
      <button class="ia-chip" id="ink-music-next">⏭</button>
    </div>
    <div class="ia-row">
      <button class="ia-chip" id="ink-music-vol-">🔉 −</button>
      <span class="ia-val" id="ink-music-vol">60%</span>
      <button class="ia-chip" id="ink-music-vol+">🔊 +</button>
    </div>
    <div class="ia-row">
      <button class="ia-chip" id="ink-duck">🎧 Baixar volume na fala</button>
    </div>
    <div class="ia-mstat" id="ink-music-status"></div>
    <details class="ia-fold">
      <summary>☁ Drive (opcional)</summary>
    <input class="ia-inp" id="ink-mus-url" type="text" autocomplete="off" placeholder="URL do app da web (Apps Script)">
    <input class="ia-inp" id="ink-mus-key" type="password" autocomplete="off" placeholder="Chave">
    <div class="ia-row">
      <button class="ia-chip" id="ink-mus-sync">☁ Sincronizar</button>
      <button class="ia-chip" id="ink-mus-shuf">🔀</button>
    </div>
    <div class="ia-music-list" id="ink-music-list"></div>
    </details>
  </div>

  <div class="ia-pane hide" data-pane="more">
    <div class="ia-statbox" id="ink-stats"></div>
    <details class="ia-fold">
      <summary>😴 Timer de sono</summary>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-slm-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-slm">Desligado</span>
      <button class="ia-chip" id="ink-slm+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-slc-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-slc">Sem limite de cap.</span>
      <button class="ia-chip" id="ink-slc+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-mstat" id="ink-sl-st"></div>
    </details>
    <details class="ia-fold">
      <summary>🌙 Filtro automático</summary>
    <div class="ia-row"><button class="ia-chip" id="ink-eyeauto">Auto por horário</button></div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-eyef-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-eyef">das 20h</span>
      <button class="ia-chip" id="ink-eyef+" aria-label="Aumentar">+</button>
    </div>
    <div class="ia-row ia-step">
      <button class="ia-chip" id="ink-eyet-" aria-label="Diminuir">−</button>
      <span class="ia-val" id="ink-eyet">às 7h</span>
      <button class="ia-chip" id="ink-eyet+" aria-label="Aumentar">+</button>
    </div>
    </details>
    <details class="ia-fold">
      <summary>📖 Leitura e idioma</summary>
    <div class="ia-grid">
      <button class="ia-chip" id="ink-perwork">📌<span>Por obra</span></button>
      <button class="ia-chip" id="ink-skip">🧹<span>Pular lixo</span></button>
      <button class="ia-chip" id="ink-media">🔒<span>Tela bloq.</span></button>
    </div>
    <div class="ia-row"><button class="ia-chip" id="ink-skipauto">⏭ Pular telas sozinho</button></div>
    <div class="ia-sec">Idioma do OCR / voz</div>
    <select class="ia-inp" id="ink-ocrl"></select>
    </details>
    <details class="ia-fold">
      <summary>💘 Cantada</summary>
    <div class="ia-row">
      <button class="ia-chip" id="ink-cp">📋 Copiar</button>
      <button class="ia-chip" id="ink-sharep">💬 Enviar</button>
    </div>
    </details>
    <details class="ia-fold">
      <summary>🔁 Pronúncia e fala</summary>
    <div class="ia-row"><button class="ia-chip" id="ink-repeat">🔁 Repetir última fala</button></div>
    <textarea class="ia-inp" id="ink-dict" spellcheck="false" placeholder="Uma por linha: Luffy=Lúfi"></textarea>
    </details>
    <details class="ia-fold">
      <summary>⭐ Favoritos</summary>
    <input class="ia-inp" id="ink-fav-note" maxlength="80" placeholder="Anotação (opcional)">
    <div class="ia-row"><button class="ia-chip" id="ink-fav-add">⭐ Salvar esta página</button></div>
    <div id="ink-fav-list"></div>
    </details>
    <details class="ia-fold">
      <summary>⌨ Atalhos (PC)</summary>
    <div style="white-space:pre-line">Alt+Shift+P: ler / pausar
Alt+Shift+V: voz
Alt+Shift+R: repetir fala
Alt+Shift+S: salvar favorito
Alt+Shift+ponto / vírgula: mais / menos velocidade</div>
    </details>
    <details class="ia-fold">
      <summary>💾 Backup</summary>
    <textarea class="ia-inp" id="ink-bk" spellcheck="false" placeholder="Exporte aqui, ou cole um backup e toque em Importar"></textarea>
    <div class="ia-row">
      <button class="ia-chip" id="ink-bk-ex">💾 Exportar</button>
      <button class="ia-chip" id="ink-bk-im">📥 Importar</button>
    </div>
    </details>
  </div>
</div>`;
        (document.body || document.documentElement).appendChild(u);

        // ---- Handlers ----
        $('ink-go').onclick = () => { if (Prep.on) setStatus('⚠ Espere o preparo terminar ou pare-o'); else if (running) stop('Parado.'); else mainLoop(); };
        $('ink-mini-go').onclick = $('ink-go').onclick;
        $('ink-prep').onclick = () => Prep.start();
        $('ink-prep-go').onclick = () => Prep.start(true);
        $('ink-tinta').classList.toggle('on', !!cfg.tintaStop);
        $('ink-tinta').onclick = () => { cfg.tintaStop = !cfg.tintaStop; saveCfg(); $('ink-tinta').classList.toggle('on', cfg.tintaStop); setStatus(cfg.tintaStop ? '⏸ O preparo vai parar quando as Tintas de hoje acabarem' : '▶ O preparo segue mesmo com as Tintas acabadas'); };
        $('ink-upd-chk').onclick = () => checkUpdate(true);
        $('ink-news-btn').onclick = () => openNews();
        $('ink-min').onclick = () => { cfg.min = !cfg.min; saveCfg(); applyMin(); };
        $$('[data-tab]', u).forEach(b => b.onclick = () => { cfg.tab = b.dataset.tab; saveCfg(); applyTab(); });
        $('ink-cont').onclick = goContinue;
        $('ink-spd-').onclick = () => setSpeed(-1);
        $('ink-spd+').onclick = () => setSpeed(1);
        $('ink-manga').onclick = () => { cfg.manga = !cfg.manga; saveCfg(); workSave(); OrderBar.sync(); refreshPanel(); };
        $('ink-auto').onclick = () => { cfg.auto = !cfg.auto; saveCfg(); refreshPanel(); };
        $('ink-voice').onclick = toggleVoice;
        $('ink-eye').onclick = toggleEye;
        $('ink-girl').onclick = () => { cfg.girl = !cfg.girl; saveCfg(); applyTheme(); };
        $('ink-perf').onclick = () => { cfg.perf = !isPerf(); saveCfg(); tickStop(); applyTheme(); refreshPanel(); };
        $('ink-anx').onclick = () => { cfg.anx = ((cfg.anx | 0) + 1) % 3; saveCfg(); refreshPanel(); };
        $('ink-full').onclick = toggleFull;
        $('ink-sharec').onclick = shareChapter;
        $('ink-skipintro').onclick = () => { SkipIntro.now(); };
        $$('[data-skin]', u).forEach(b => b.onclick = () => { cfg.skin = b.dataset.skin; saveCfg(); applyTheme(); });
        $('ink-meta-btn').onclick = metaToggle;
        $('ink-meta-').onclick = () => { cfg.metaGoal = Math.max(1, cfg.metaGoal - 1); saveCfg(); metaPaint(); refreshPanel(); };
        $('ink-meta+').onclick = () => { cfg.metaGoal = Math.min(300, cfg.metaGoal + 1); saveCfg(); metaPaint(); refreshPanel(); };

        // voz
        $('ink-vsel').onchange = e => { cfg.vname = e.target.value; saveCfg(); };
        const stepRate = d => {
            let i = 0, best = 1e9;
            VRATES.forEach((v, k) => { const dd = Math.abs(v - cfg.vrate); if (dd < best) { best = dd; i = k; } });
            cfg.vrate = VRATES[Math.min(VRATES.length - 1, Math.max(0, i + d))];
            saveCfg(); refreshPanel();
        };
        $('ink-vr-').onclick = () => stepRate(-1);
        $('ink-vr+').onclick = () => stepRate(1);

        // olho
        const stepEye = d => { cfg.eyeLvl = Math.min(0.6, Math.max(0.05, Math.round((cfg.eyeLvl + d) * 100) / 100)); saveCfg(); applyEye(); refreshPanel(); };
        $('ink-eyel-').onclick = () => stepEye(-0.05);
        $('ink-eyel+').onclick = () => stepEye(0.05);

        // música
        $('ink-yt-url').value = cfg.ytUrl || '';
        $('ink-yt-url').addEventListener('keydown', e => { if (e.key === 'Enter') ytLoad(); });
        $('ink-yt-go').onclick = ytLoad;
        $('ink-yt-x').onclick = () => { ytStop(); musStatus('Player fechado'); };
        $('ink-yt-show').onclick = () => { cfg.ytShow = !cfg.ytShow; saveCfg(); refreshPanel(); };
        $('ink-music-play').onclick = musToggle;
        $('ink-music-prev').onclick = () => musNext(-1);
        $('ink-music-next').onclick = () => musNext(1);
        $('ink-music-vol-').onclick = () => musVolStep(-0.1);
        $('ink-music-vol+').onclick = () => musVolStep(0.1);
        $('ink-duck').onclick = () => { cfg.duck = cfg.duck === false; saveCfg(); if (cfg.duck === false) musDuck(false); refreshPanel(); };
        $('ink-mus-url').value = cfg.musicUrl || '';
        $('ink-mus-key').value = cfg.musicKey || '';
        $('ink-mus-url').onchange = e => { cfg.musicUrl = e.target.value.trim(); saveCfg(); };
        $('ink-mus-key').onchange = e => { cfg.musicKey = e.target.value.trim(); saveCfg(); };
        $('ink-mus-sync').onclick = musSync;
        $('ink-mus-shuf').onclick = () => { MUS.shuffle = !MUS.shuffle; $('ink-mus-shuf').classList.toggle('on', MUS.shuffle); };

        // mais
        $('ink-slm-').onclick = () => { cfg.sleepMin = stepIn(SLEEP_MIN, cfg.sleepMin | 0, -1); saveCfg(); refreshPanel(); if (running) sleepArm(); };
        $('ink-slm+').onclick = () => { cfg.sleepMin = stepIn(SLEEP_MIN, cfg.sleepMin | 0, 1); saveCfg(); refreshPanel(); if (running) sleepArm(); };
        $('ink-slc-').onclick = () => { cfg.sleepCaps = stepIn(SLEEP_CAP, cfg.sleepCaps | 0, -1); saveCfg(); refreshPanel(); if (running) sleepArm(); };
        $('ink-slc+').onclick = () => { cfg.sleepCaps = stepIn(SLEEP_CAP, cfg.sleepCaps | 0, 1); saveCfg(); refreshPanel(); if (running) sleepArm(); };
        $('ink-eyeauto').onclick = () => { cfg.eyeAuto = !cfg.eyeAuto; EYEA.last = null; saveCfg(); eyeAutoTick(); refreshPanel(); };
        const hr = (k, d) => { cfg[k] = ((cfg[k] | 0) + d + 24) % 24; EYEA.last = null; saveCfg(); eyeAutoTick(); refreshPanel(); };
        $('ink-eyef-').onclick = () => hr('eyeFrom', -1);
        $('ink-eyef+').onclick = () => hr('eyeFrom', 1);
        $('ink-eyet-').onclick = () => hr('eyeTo', -1);
        $('ink-eyet+').onclick = () => hr('eyeTo', 1);
        $('ink-perwork').onclick = () => { cfg.perWork = !cfg.perWork; saveCfg(); if (cfg.perWork) workSave(); refreshPanel(); };
        $('ink-skip').onclick = () => { cfg.skipJunk = !cfg.skipJunk; saveCfg(); refreshPanel(); };
        $('ink-skipauto').onclick = () => { cfg.skipIntro = !cfg.skipIntro; saveCfg(); refreshPanel(); };
        $('ink-media').onclick = () => { cfg.media = cfg.media === false; saveCfg(); if (cfg.media === false) kaStop(); else if (running) kaStart(); refreshPanel(); };
        const sel = $('ink-ocrl');
        OCR_LANGS.forEach(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.nome; sel.appendChild(o); });
        sel.onchange = e => {
            cfg.ocrLang = e.target.value; cfg.vname = ''; saveCfg(); fillVoices(); refreshPanel();
            if (cfg.voice) ocrWorker().catch(x => setStatus('⚠ OCR: ' + (x.message || x)));
        };
        $('ink-cp').onclick = copyCantada;
        $('ink-sharep').onclick = () => shareText(TICK.cur || '');
        $('ink-bk-ex').onclick = backupExport;
        $('ink-bk-im').onclick = backupImport;
        $('ink-repeat').onclick = repeatLine;
        $('ink-dict').value = cfg.dict || '';
        $('ink-dict').oninput = e => { cfg.dict = e.target.value; saveCfg(); };
        $('ink-fav-add').onclick = favAdd;
        favPaint();
        document.addEventListener('keydown', hotkeys, true);

        // campos de texto: não deixa as teclas vazarem pros atalhos do site
        ['keydown', 'keyup', 'keypress'].forEach(t => u.addEventListener(t, e => {
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) e.stopPropagation();
        }));

        // Drag (e toque no título = copiar a cantada)
        const head = $('ink-head');
        let drag = null;
        const onDown = e => {
            if (e.button > 0 || e.target.closest('button')) return;
            const r = u.getBoundingClientRect();
            drag = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, w: r.width, h: r.height, moved: false, title: !!e.target.closest('#ink-title') };
            try { head.setPointerCapture(e.pointerId); } catch (x) { }
            e.preventDefault();
        };
        const onMove = e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (!drag.moved) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return; drag.moved = true; }
            const x = Math.max(0, Math.min(innerWidth - drag.w, e.clientX - drag.ox));
            const y = Math.max(0, Math.min(innerHeight - drag.h, e.clientY - drag.oy));
            u.style.left = x + 'px'; u.style.top = y + 'px'; u.style.bottom = 'auto'; u.style.right = 'auto';
            cfg.pos = { x, y };
        };
        const onUp = e => {
            if (!drag || e.pointerId !== drag.id) return;
            const d = drag; drag = null;
            if (d.moved) saveCfg();
            else if (d.title && e.type === 'pointerup') copyCantada();
        };
        head.addEventListener('pointerdown', onDown);
        head.addEventListener('pointermove', onMove);
        head.addEventListener('pointerup', onUp);
        head.addEventListener('pointercancel', onUp);
        // abrir/fechar uma seção muda a altura: mantém o painel dentro da tela
        u.addEventListener('toggle', applyPos, true);

        u.addEventListener('pointerdown', () => { lastUser = Date.now(); });
        document.addEventListener('keydown', () => { lastUser = Date.now(); });

        fillVoices(); musPaintList(); musPaintBtn();
        refreshPanel(); applyTheme(); applyTab(); applyMin(); applyEye(); metaPaint(); contPaint(); statsPaint();
    }

    function applyTab() {
        const u = $('ink-panel'); if (!u) return;
        const t = ['music', 'tune', 'more'].includes(cfg.tab) ? cfg.tab : 'read';
        $$('[data-tab]', u).forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        const r = u.querySelector('[data-pane="read"]'), m = u.querySelector('[data-pane="music"]'), x = u.querySelector('[data-pane="more"]'), tu = u.querySelector('[data-pane="tune"]');
        if (r) r.classList.toggle('hide', t !== 'read');
        if (tu) tu.classList.toggle('hide', t !== 'tune');
        if (x) x.classList.toggle('hide', t !== 'more');
        if (m) m.classList.toggle('ghost', t !== 'music'); // fica fora da tela (não some) p/ o YouTube continuar tocando
        if (t === 'more') statsPaint();
        applyPos();
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
    /* ---- Modo menina: cantadas rolando no lugar do título/versão ---- */
    const CANTADAS = [
        "Você tem um mapa? Porque eu me perdi no brilho dos seus olhos.",
        "Você não é pescoço, mas mexeu com a minha cabeça.",
        "Se você fosse um sanduíche, seu nome seria x-princesa!",
        "Me chama de espírito obsessor e me deixa te possuir.",
        "Eu perdi meu número de telefone, me empresta o seu?",
        "Você não usa calcinha, você usa um porta-joias",
        "Havia dois ursos o Beijaeu e o Mebeija, então, o Beijaeu morreu. Quem sobrou?",
        "Seu nome é Tamara, né? Por que você TAMARAvilhosa.",
        "Estou fazendo uma campanha de doação de órgãos! Então, não quer doar seu coração pra mim?",
        "Você é o ovo que faltava na minha marmita.",
        "Você não foi feita com velas, fitinhas vermelhas, mel e rosas, mas é uma simpatia!",
        "Eu vou te dar um beijo. Se você não gostar, me devolve, tá?",
        "Não me formei em cardiologia, mas quero cuidar do seu coração.",
        "Você achou a minha chave, porque só ela abre o cadeado do seu coração.",
        "Se te fizer sorrir e com o olhar te conquistar, não a deixa partir, chegou a hora de amar.",
        "Nos detalhes da vida, você é o arco-íris que sempre enfeita o meu céu.",
        "Fazer Enem, só se for pra entrar no seu coração.",
        "No Whatsapp é ruim, deixa eu falar no seu ouvidinho.",
        "Se nada é para sempre, então, vem ser meu nada.",
        "Você é linda, mas está um pouco pálida: talvez seja cansaço de estar sempre passando no meu pensamento.",
        "Se beleza brotasse em ovos você seria dona da granja inteira!",
        "Você é o doce de leite que falta no meu churros.",
        "Seu pai é dono da Tam? — Não, por quê? — Porque queria saber como é que faz pra ter um avião desse em casa!",
        "Papo de urubu, pena de galinha, se você quer um beijinho dê uma risadinha.",
        "Eu não sou o Luciano Huck, mas eu quero você no meu lar doce lar, sua linda!",
        "Em cima da colina passa boi passa boiada, só saio da sua frente quando for minha namorada.",
        "Você não é piso molhado, mas eu já tô pronto, pra te passar o rodo, sua linda!",
        "Gata, eu rezo 1/3, para achar 1/2 De te levar pra 1/4!",
        "Me chama de previsão do tempo e diz que tá rolando um clima.",
        "Não sou traficante, mas eu quero a sua boca.",
        "Meu nome é Arnaldo, mas pode me chamar de Naldo, pois quando eu te vi perdi o ar.",
        "Seu pai é mecânico? Porque você é uma graxinha!",
        "Meu nome é muito grande. Melhor você me chamar de “Amor”.",
        "Você acredita em amor à primeira vista ou devo passar por aqui mais uma vez?",
        "Gata, você não é semáforo, mas é de parar o trânsito.",
        "Não sou o Papai Noel, mas eu poderia te proporcionar uma noite feliz.",
        "Você não é GPS quebrado, mas me deixa sem rumo.",
        "Você não é colesterol, mas afetou meu coração.",
        "Fica comigo que eu faço esquecer o João. — Que João? — Viu só, já está esquecendo…",
        "A pressa é sua inimiga? Porque eu ouvi dizer que a pressa é inimiga da perfeição.",
        "Pode até ter muita gente interessada, mas só consigo achar você interessante.",
        "Com você, parei de entender matemática. Sinto que somos sempre 1, apesar de sermos 2.",
        "Você é tão desejada quanto uma sexta-feira!",
        "Me perdi dentro de mim mesmo. E, quando me encontrei, foi com saudades de você.",
        "Aquele chocolate que faz declaração: Serenata de Amor.",
        "Black Friday do meu beijo: pede um e leva dois.",
        "Pessoas tentam agradar pessoas com coisas de valores. Eu tento te agradar com tudo que sou. Tem algo mais valioso do que isso?",
        "Você é poesia personificada.",
        "Agora, eu entendo qual a razão de chamarem de borboletas no estômago.",
        "Não existe amor à primeira vista. O que existe é a pessoa certa, no momento certo. Você por acaso estava lá!",
        "Casando comigo você nunca vai pegar na enxada! Só vai ter que fazer amor desde a manhã até a madrugada!",
        "Primeiramente, você é tão linda que não caga, lança bombom!",
        "Eu não sou plano de saúde, mas, se você quiser, eu acabo com a sua carência, sua linda.",
        "“Pulei na água até o umbigo, então, quer ficar comigo?”",
        "Gata, me pega no colo? É que minha mãe vem vindo e eu queria contar que andei de avião.",
        "Será que desligaram o wi-fi da horta? Meu chuchuzinho não está online.",
        "Tem certeza de que você não é um extraterrestre? Porque você abduziu o meu coração.",
        "Gata, seu nome é Camila? — Sim, por quê? — Então, vem “camilamber”!",
        "Você tem um band-aid? Porque ralei meu joelho caindo de amores por você.",
        "Se você está aqui, quem está gerenciando o céu?",
        "Você é tão gata que se eu te matar de amor ainda sobram mais 6 vidas.",
        "A economia grega anda tão ruim assim? — Por quê? — Porque até uma deusa grega como você veio morar aqui!",
        "Se felicidade fosse dinheiro, você seria o Banco Central e eu seria o maior investidor.",
        "Me passa o seu Twitter? O meu pai disse que eu devo seguir o meu sonho.",
        "Gata, você deve comer Photoshop no café da manhã! Pra ser tão linda assim!",
        "Desculpe, eu não já fiquei com você antes? Não? Vamos dar um jeito nisso.",
        "Não sou manteiga de cacau, mas adoraria amaciar seus lábios.",
        "Gata, que roupa feia, tira isso agora, sua linda!",
        "Sabe qual a diferença entre você e um milhão de reais? É que um milhão de reais eu tenho na minha casa.",
        "Vamos viajar o mundo usando meus créditos de desconto no Airbnb?",
        "Você é sempre gostosa assim ou hoje tá fantasiada de lasanha?",
        "Gata, você é uma paçoca? Porque só de sentir o cheiro já dá vontade de comer, sua linda!",
        "Você tem brigadeiro? — Não. — Então, me dá um beijinho.",
        "Você gosta de Toddy? Se você quiser, eu posso ser Toddynho seu.",
        "Você é como um bom café da manhã… Dá energia para um novo dia.",
        "Me chama de demaquilante e me deixa tirar seu batom.",
        "Gata, por você eu dou até um stop no jogo online, bebê.",
        "Eu até ficaria comigo mesmo, mas vou deixar essa oportunidade para você.",
        "Você não é Receita Federal, mas poderia se declarar pra mim.",
        "É melhor você controlar sua língua. Guarde ela aqui, junto da minha.",
        "Gata, queria saber se doeu quando você caiu do céu.",
        "O Natal está chegando, e eu não acredito em Papai Noel, mas queria que ele me desse você de presente de fim de ano.",
        "O único mal que eu quero para você, é que a sua mãe seja minha sogra.",
        "Eu só posso estar com problema de visão, porque eu não vejo a hora de te dar uns pega.",
        "Você não é horário de verão, mas eu gostaria de perder uma hora com você.",
        "Você não é GPS, mas queria encontrar o caminho das curvas do seu corpo.",
        "Nessa brincadeira de dizer que te amei, muitas vezes já fui campeão. Agora, me dê a recompensa e deixe eu entrar no teu coração.",
        "Quer saber uma verdade constrangedora? Eu nunca fui beijado por um anjo. Então, quer ser a primeira?",
        "Soube que você é a chave perfeita para abrir a porta do meu coração.",
        "Alguém sabe me dizer se Cicatricure já está curando as feridas do coração?",
        "Eu não sou o Yoshi, mas daria minha vida por você.",
        "Você não é o Pikachu, mas é sempre a minha primeira escolha.",
        "Meu amor é igual level no Tibia, infinito.",
        "Gata, desliga esse firewall e me deixa entrar em você.",
        "Você não é o Death Note, mas também causa ataque cardíaco.",
        "Quando eu te vi até joguei fora o meu Memory Card, você é inesquecível.",
        "Você vai receber a carta de Hogwarts, porque o que você faz com o meu coração só pode ser bruxaria.",
        "Meu sonho era ser o Batman para que você me chamasse sempre que precisasse de alguém. Como não tenho bat-sinal, vem de zap!",
        "Você conhece o Mario? Então, vem ser minha Peach!",
        "Eu sei que não sou herói da DC, mas você, com certeza, é, porque olha… que Maravilha.",
        "Não sou o Stephen King, mas meu coração fica iluminado quando você olha pra mim.",
        "Você não é Tesseract, entretanto, é a única pessoa capaz de abrir as portas do meu coração.",
        "Quando eu te vi deu tela azul…",
        "Me chama de Ash Ketchum, que eu te mostro meu Pikachu.",
        "Não sei sua composição corporal, mas chutaria lítio, neodímio, oxigênio e carbono. Sabe por quê? Porque você é Li-Nd-O-NA.",
        "Nosso amor é de outro mundo, porque mesmo fora da gravidade da Terra, eu ainda ficaria caidinho por você.",
        "Gata, entre Star Wars e Star Trek, eu queria mesmo era star com você.",
        "Se você fosse um algoritmo, seria o mais eficiente em roubar meu coração",
        "Gata, você é a senha do meu wi-fi, porque, sempre que te vejo, minha conexão fica mais forte.",
        "Você não é o Google, mas tem tudo o que eu procuro, sua linda!",
        "Desculpa, não te ouvi. Ah, você não falou nada? E não quer começar a falar comigo agora?",
        "Sempre fui bom em língua portuguesa, mas depois que te conheci notei que o dicionário ainda não tem uma palavra que defina com exatidão a tua perfeição.",
        "A previsão do meu horóscopo acertou em cheio. Ela dizia que hoje seria um dia de grandes emoções por causa da entrada de um novo amor na minha vida.",
        "Vou guardar para sempre esse dia na memória, porque foi o dia que eu conheci você, o amor da minha vida.",
        "Baixou a temperatura? Não? É que desde que você se aproximou de mim senti tantos arrepios.",
        "Hoje escutei uma música que me lembrou a que vai tocar no nosso casamento.",
        "Ei, o cupido te ligou? Ele queria pedir para você devolver o meu coração.",
        "Eu não sou dinheiro, mas posso te fazer feliz!",
        "Meu amor por você é igual à obra do governo: nunca acaba.",
        "Você é muito fofo(a), mas temos um problema: você gosta ou não de passas?",
        "O meu telefone continua corrigindo automaticamente seu nome para “Amor”. Acredito que seja um sinal.",
        "Você não é massagem cardíaca, mas reanima o meu coração!",
        "Eu queria ser grego, mas grego eu não posso ser, porque grego tem várias deusas e minha única deusa é você.",
        "Vontade de fazer aquilo que começa com s: ser o amor da sua vida.",
        "Com licença, você teria um amigo em comum que pudesse nos apresentar?",
        "Está vendo este meu amigo? Então, ele quer saber se você me acha fofo(a).",
        "Existe um vazio no meu coração que tem as suas medidas.",
        "Se preto fosse paixão e branco fosse carinho, o que eu sinto por você seria xadrezinho.",
        "Posso tirar uma foto sua? É para mostrar ao Papai Noel o que eu quero de presente.",
        "Da próxima vez que alguém me perguntar qual é meu tipo, irei mostrar a sua foto de perfil.",
        "Está calor, né? Mas não é de hoje que eu me derreto por você.",
        "Eu tenho uma memória terrível. Felizmente, você é inesquecível.",
        "Não sou poeta, mas seus olhos são a inspiração que eu precisava.",
        "Quando estou ao seu lado, sinto como se estivesse flutuando nas nuvens.",
        "Você é a definição perfeita de fofura. Não consigo resistir!",
        "Seu sorriso é como um raio de sol em um dia chuvoso. Não consigo evitar sorrir quando estou perto de você.",
        "Sua mãe é uma rosa e seu pai um jasmim, admiro os dois porque fizeram você especialmente para mim.",
        "Você pode não ser o meu primeiro/minha primeira, mas pode ser meu último/minha última.",
        "Estou escrevendo um artigo sobre as coisas boas da vida. Posso te incluir nele?",
        "Sua presença é tão cativante que o tempo parece parar quando você entra em uma sala.",
        "A sua companhia ilumina qualquer ambiente.",
        "Em um mundo repleto de imitações, você é uma obra-prima original que impressiona a todos ao redor.",
        "Seu charme e graça são como uma dança delicada que encanta a todos que têm o privilégio de testemunhar.",
        "Seus olhos brilham como safiras preciosas, e sua voz é como um suave acorde de violino.",
        "Você é uma poesia em movimento, sua delicadeza encanta a todos ao seu redor.",
        "Em um mundo ruidoso, sua elegância se destaca em um sussurro suave, conquistando corações sem esforço.",
        "Nada na vida é perfeito, mas você é o que mais se aproxima da perfeição.",
        "Seu pai é astronauta? Porque você é uma estrela.",
        "Você é de Brasília? Porque é um tesouro nacional.",
        "Ei, acabei de notar que você me notou. Então só queria avisar que notei você também.",
        "Onde é que eu deixo meu currículo para concorrer à vaga de amor da sua vida?",
        "Seu nome é VIVO? Porque você é tudo o que eu mais quero.",
        "Você acredita em amor à primeira vista? Nem eu. Espera, deixa eu te olhar de novo.",
        "Gata, você não é enquete do Datafolha, mas me deixa com a curiosidade de saber o resultado.",
        "Você é a tradução da palavra perfeição no dicionário.",
        "Eu não sou jardineiro, mas eu quero cuidar do seu jardim.",
        "Você é o arco-íris da minha vida.",
        "Me chama de outdoor e deixa eu fazer propaganda da sua beleza.",
        "Você é o meu mundo, mas eu quero ser o seu universo.",
        "Seu sorriso é a chave para o meu coração.",
        "Você é tão linda que até as flores invejam você.",
        "Me dê uma chance de te fazer feliz.",
        "Você é a música que eu mais gosto de ouvir.",
        "Você é a molécula de hidrogênio? Porque sem você não posso existir.",
        "Gata, eu sou um elétron e você é um próton. Nós dois juntos formamos um átomo de amor.",
        "Se eu fosse um ácido nucleico, você seria a minha hélice complementar.",
        "Você é uma equação matemática? Porque sem você não faz sentido.",
        "Querida, eu sou como o DNA helicase, eu quero desembrulhar seu código genético.",
        "Gato, você é um neutrino? Porque você é extremamente rápido e passa por mim sem nenhum impedimento.",
        "Você é um exoplaneta? Porque eu quero estudar tudo sobre você.",
        "Você é a minha constante de Planck. Sem você, nada faz sentido.",
        "Você é a hipótese de Riemann? Porque eu não posso deixar de pensar em você.",
        "Você é como um campo magnético, eu sou a carga elétrica e juntos nós podemos criar algo incrível.",
        "Gato, eu sou um químico e você é meu experimento favorito.",
        "Você é como uma molécula de hidrocarboneto, simples, mas com um potencial ilimitado.",
        "Você é uma força fundamental da natureza? Porque eu não posso resistir a você.",
        "Você é uma molécula aromática? Porque você é excepcionalmente bonita e única.",
        "Gata, você é um fóton? Porque você ilumina meu mundo.",
        "Você é tão linda(o) que acelera meu batimento cardíaco mais rápido do que um reator nuclear.",
        "Você é o carbono? Porque eu sinto uma ligação especial entre nós.",
        "Meu amor por você é como a entropia, sempre aumentando e nunca diminuindo.",
        "Você é o potencial de ação do meu neurônio, porque me deixa eletrizado(a) sempre que te vejo.",
        "Se você fosse um fóssil, eu te desenterraria e te chamaria de tesouro, sua linda.",
        "Se eu fosse uma enzima, seria helicase para despir seu DNA e replicar nosso amor.",
        "Você deve ser a força gravitacional, porque você atrai meu olhar onde quer que esteja.",
        "Meu amor por você é como pi: irracional, infinito e impossível de ser calculado.",
        "Eu só quero que você saiba, que eu estou pensando em você agora mesmo.",
        "Se você me der um beijo eu te dou um doce, um doce, um doce",
        "Você é a luz que ilumina o meu caminho, é o amor que eu sinto todo dia",
        "Você é como uma canção de amor, que não sai da minha cabeça",
        "Você é a música que eu quero tocar, a razão do meu cantar",
        "Você é a minha melodia preferida, não consigo tirar você da minha mente",
        "Você é como uma música que eu não consigo parar de ouvir, sempre presente em minha mente",
        "Você é a letra mais bonita que eu já escrevi, a canção que eu sempre quis ouvir",
        "Você é o meu ritmo, a batida do meu coração, a música que me faz feliz",
        "Você é como uma sinfonia perfeita, cada nota, cada acorde, é como música para os meus ouvidos",
        "Você é como uma música que toca no meu coração, que me faz sorrir, que me faz sonhar",
        "Você é a trilha sonora da minha vida, a melodia que eu quero cantar para sempre",
        "Você é como uma música que eu não consigo parar de ouvir, que me faz dançar, que me faz feliz",
        "Você é a música que eu sempre quis escrever, a canção que eu sempre quis cantar",
        "Você é como uma música que me faz sentir vivo, que me faz sonhar, que me faz amar",
        "Você é o meu filme favorito, não consigo parar de assistir a você.",
        "Você é o meu par perfeito para assistir ao filme ‘Um Amor Para Recordar’",
        "Eu gostaria de convidá-lo para assistir a um filme comigo. Qualquer um, desde que você esteja lá.",
        "Você é a minha cena favorita em cada filme",
        "Você é tão incrível que eu me sinto como se estivesse em um filme de ação toda vez que estou com você",
        "Eu queria ser a sua mocinha em um filme de aventura",
        "Você é o meu final feliz em cada filme romântico",
        "Você é a minha ‘Era Uma Vez’ preferida. E eu adoraria ser o seu ‘Felizes Para Sempre’",
        "Gato, você é tão lindo que poderia ser o protagonista de qualquer filme",
        "Você é o meu filme de terror favorito, porque eu sempre tenho um susto quando você chega perto.",
        "Eu poderia passar o dia inteiro assistindo a filmes com você. Vamos tentar isso?",
        "Gato, eu adoraria ser a protagonista do seu filme de amor",
        "Você é o meu ator favorito, e eu adoraria ter uma cena romântica com você",
        "Gata, você é tão incrível que eu sinto como se estivesse em um filme de comédia romântica toda vez que estou com você",
        "Você é o meu herói de ação preferido, e eu adoraria ser a sua parceira em qualquer missão",
        "Você é um sol em um dia de chuva.",
        "Com você, o meu clima interno está sempre ensolarado.",
        "Não precisa chover, só quero você molhada(o) de suor.",
        "Você é como um arco-íris em um dia cinzento.",
        "Você me faz sentir como se estivesse em um dia ensolarado mesmo quando está chovendo.",
        "Com você, o clima sempre fica quente.",
        "Você é a brisa fresca que eu preciso em um dia quente.",
        "Você é como uma tempestade de verão, intensa e inesquecível.",
        "Você é o meu clima ideal para qualquer dia.",
        "Com você, eu não preciso de sol para me aquecer.",
        "Você é como uma nevasca, linda e mágica.",
        "Com você, o inverno se torna a minha estação favorita.",
        "Você é a brisa suave que me acalma em um dia quente.",
        "Com você, até mesmo uma tempestade fica tranquila.",
        "Você é como um raio de sol em um dia nublado.",
        "Seu sorriso é como a resposta certa na prova, me faz sentir um verdadeiro vencedor.",
        "Você é como o lápis HB, sempre presente nas minhas anotações.",
        "Com você, eu me sinto como em uma aula de química, atraído pela sua química pessoal.",
        "Com você, eu sinto que posso conquistar qualquer coisa, assim como conquistei minha formatura.",
        "Com você, eu me sinto como em uma aula de matemática, encontrando a solução perfeita.",
        "Com você, eu me sinto como em uma aula de artes, apreciando a beleza de cada detalhe.",
        "Você é a luz do meu palco, iluminando todos os meus passos.",
        "Com você, eu me sinto como em uma peça de Shakespeare, vivendo um amor proibido.",
        "Você é como um ator de primeira classe, me fazendo querer aplaudir cada gesto seu.",
        "Você é como uma obra-prima teatral, capaz de me fazer sentir emoções intensas.",
        "Você é como uma trilha sonora emocionante, capaz de me fazer sentir cada nota.",
        "Seu sorriso é como o motor de um carro, me faz acelerar o coração.",
        "Você é como uma Harley Davidson, intensa e cheia de estilo.",
        "Você é como uma Lamborghini, exótica e fascinante.",
        "Se eu tivesse que escolher entre ter uma Ferrari e passar um tempo com você, escolheria você. Porque a única coisa melhor do que uma Ferrari é uma companhia maravilhosa."
    ];
    const TICK = { order: [], i: 0, on: false, t: 0, cur: '' };
    const tickNext = () => {
        if (TICK.i >= TICK.order.length) {
            TICK.order = CANTADAS.map((_, k) => k);
            for (let k = TICK.order.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [TICK.order[k], TICK.order[j]] = [TICK.order[j], TICK.order[k]]; }
            TICK.i = 0;
        }
        return CANTADAS[TICK.order[TICK.i++]];
    };
    function tickStart() {
        const t = $('ink-title'); if (!t) return;
        if (TICK.on && t.querySelector('.ia-tick-in')) return;
        clearTimeout(TICK.t);
        TICK.on = true;
        t.textContent = '';
        t.classList.add('tick');
        const sp = document.createElement('span');
        sp.className = 'ia-tick-in';
        t.appendChild(sp);
        let reduce = false; try { reduce = matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { }
        const still = reduce || isPerf();   // modo leve: texto parado, sem redesenhar a tela o tempo todo
        t.classList.toggle('still', still);
        if (still) sp.style.paddingLeft = '0';
        const show = () => {
            if (!TICK.on || !sp.isConnected) return;
            if (still && TICK.cur && (document.hidden || cfg.min)) { TICK.t = setTimeout(show, 20000); return; }
            const s = tickNext();
            TICK.cur = s;
            sp.textContent = s;
            if (still) { sp.style.display = 'inline'; TICK.t = setTimeout(show, 20000); return; }
            sp.style.animation = 'none'; void sp.offsetWidth;
            sp.style.animation = `ink-tick ${Math.max(9, (s.length * 5.5 + 170) / 38).toFixed(1)}s linear 1`;
        };
        sp.addEventListener('animationend', show);
        show();
    }
    function tickStop() {
        TICK.on = false; clearTimeout(TICK.t);
        const t = $('ink-title'); if (!t) return;
        t.classList.remove('tick');
        t.textContent = '';
    }

    function applyTheme() {
        const u = $('ink-panel'); if (!u) return;
        u.classList.toggle('boy', !cfg.girl);
        SKINS.forEach(k => u.classList.toggle('skin-' + k.id, cfg.girl && curSkin().id === k.id));
        $$('[data-skin]', u).forEach(b => b.classList.toggle('on', b.dataset.skin === curSkin().id));
        const t = $('ink-title');
        if (t) {
            t.title = (cfg.girl ? curSkin().nome : 'Ink') + ' ' + VERSION;
            if (cfg.girl) tickStart();
            else { tickStop(); t.textContent = (cfg.girl ? curSkin().nome : 'Ink') + ' ' + VERSION; }
        }
        const g = $('ink-girl');
        if (g) g.classList.toggle('on', cfg.girl);
        newsTheme();
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
        if (!TTS || !ptVoices().length) setStatus('⚠ Nenhuma voz encontrada para este idioma');
        else ocrWorker().then(() => { if (!running) setStatus('Audiolivro pronto'); }).catch(e => setStatus('⚠ OCR: ' + (e.message || e)));
    }
    function setSpeed(d) {
        let i = 0, best = 1e9;
        SPEEDS.forEach((v, k) => { const dd = Math.abs(v - cfg.speed); if (dd < best) { best = dd; i = k; } });
        cfg.speed = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + d))];
        saveCfg(); workSave(); refreshPanel();
    }
    function fillVoices() {
        const sel = $('ink-vsel'); if (!sel) return;
        const list = ptVoices();
        const cur = currentVoice();
        sel.textContent = '';
        if (!list.length) { const o = document.createElement('option'); o.textContent = 'Nenhuma voz para este idioma'; sel.appendChild(o); return; }
        list.forEach(v => {
            const o = document.createElement('option');
            o.value = v.name; o.textContent = (isNatural(v) ? '★ ' : '') + v.name.replace(/^Microsoft\s+/, '');
            if (cur && v.name === cur.name) o.selected = true;
            sel.appendChild(o);
        });
    }
    function refreshPanel() {
        const u = $('ink-panel'); if (!u) return;
        u.classList.toggle('run', running);
        u.classList.toggle('lite', isPerf());
        const g = $('ink-go');
        const mg = $('ink-mini-go');
        // só recria os ícones quando o estado muda
        if (g && g.dataset.run !== String(running)) {
            g.dataset.run = String(running);
            g.innerHTML = running ? ICO.pause + '<span>Pausar</span>' : ICO.play + '<span>Ler sozinho</span>';
            if (mg) mg.innerHTML = running ? ICO.pause : ICO.play;
        }
        // 4.13.3: cada texto só é reescrito se mudou (setText)
        setText($('ink-spd'), String(+(cfg.speed).toFixed(2)) + '×');
        const ma = $('ink-manga'); if (ma) ma.classList.toggle('on', cfg.manga);
        const au = $('ink-auto'); if (au) au.classList.toggle('on', cfg.auto);
        const vo = $('ink-voice'); if (vo) vo.classList.toggle('on', cfg.voice);
        const pe = $('ink-perf'); if (pe) pe.classList.toggle('on', isPerf());
        const ey = $('ink-eye'); if (ey) ey.classList.toggle('on', cfg.eye);
        const ax = $('ink-anx'); if (ax) ax.classList.toggle('on', (cfg.anx | 0) > 0);
        setText($('ink-anx-l'), ANX_LBL[cfg.anx | 0] || ANX_LBL[0]);
        setText($('ink-vr'), String(cfg.vrate) + '×');
        setText($('ink-eyel'), Math.round(cfg.eyeLvl * 100) + '%');
        setText($('ink-meta-val'), String(cfg.metaGoal));
        const dk = $('ink-duck'); if (dk) dk.classList.toggle('on', cfg.duck !== false);
        const ys = $('ink-yt-show'); if (ys) ys.classList.toggle('on', cfg.ytShow !== false);
        const yb = $('ink-yt-box'); if (yb) yb.classList.toggle('off', cfg.ytShow === false);
        // novidades 4.5.0
        const fu = $('ink-full'); if (fu) fu.classList.toggle('on', !!cfg.full);
        setText($('ink-slm'), cfg.sleepMin ? cfg.sleepMin + ' min' : 'Desligado');
        setText($('ink-slc'), cfg.sleepCaps ? cfg.sleepCaps + (cfg.sleepCaps === 1 ? ' capítulo' : ' capítulos') : 'Sem limite de cap.');
        const ea = $('ink-eyeauto'); if (ea) ea.classList.toggle('on', !!cfg.eyeAuto);
        setText($('ink-eyef'), 'das ' + (cfg.eyeFrom | 0) + 'h');
        setText($('ink-eyet'), 'às ' + (cfg.eyeTo | 0) + 'h');
        const pw = $('ink-perwork'); if (pw) pw.classList.toggle('on', !!cfg.perWork);
        const sk = $('ink-skip'); if (sk) sk.classList.toggle('on', !!cfg.skipJunk);
        const me = $('ink-media'); if (me) me.classList.toggle('on', cfg.media !== false);
        const sa = $('ink-skipauto'); if (sa) sa.classList.toggle('on', cfg.skipIntro !== false);
        const ol = $('ink-ocrl'); if (ol && ol.value !== curLang().id) ol.value = curLang().id;
        contPaint();
        musPaintBtn();
    }

    /* ================================================================== *
     * 15. INIT
     * ================================================================== */
    function init() {
        injectCSS();
        buildPanel();
        applyPos();
        BubbleSorter.start();
        OrderBar.build();
        mediaInit();
        SkipIntro.start();
        if (window.InkNative && cfg.full) applyFull();
        // voltou do botão "Continuar": avisa onde você tinha parado
        try {
            const rs = JSON.parse(sessionStorage.getItem('ink_resume') || 'null');
            if (rs) { sessionStorage.removeItem('ink_resume'); setTimeout(() => setStatus('↩ Você parou em: ' + rs.label), 1800); }
        } catch (e) { }
        // novidades: na 1ª instalação só marca como vista; depois de atualizar, abre sozinho uma vez
        if (!cfg.seenVer) { cfg.seenVer = VERSION; saveCfg(); }
        else if (cfg.seenVer !== VERSION) setTimeout(() => { if (!$('ink-news')) openNews(); }, 2500);
        newsDot();
        setTimeout(() => checkUpdate(false), 4000);
        setInterval(() => checkUpdate(false), 6 * 3600 * 1000);
        // o site é SPA: reavalia a barra de capítulos, o filtro de olho, a obra atual e o "continuar" ao navegar
        setInterval(() => { try { workTick(); eyeAutoTick(); if (document.hidden) return; siteTick(); OrderBar.build(); applyEye(); contPaint(); } catch (e) { } }, 1500);
        // grava onde você está lendo (mais espaçado no modo leve)
        setInterval(() => { try { trackRead(); } catch (e) { } }, isPerf() ? 4000 : 2500);
        eyeAutoTick();
    }
    const safeInit = guard('init', init);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
    else safeInit();

    console.info(`[Ink] v${VERSION} carregado`);
})();
/*INK_EOF*/
