(() => {
    if (window.__inkLeitorV2) return;
    window.__inkLeitorV2 = true;

    // 1. Injeta CSS para forçar a liberação da tela e do toque
    const style = document.createElement('style');
    style.innerHTML = `
        html, body {
            overflow: auto !important;
            pointer-events: auto !important;
            touch-action: auto !important;
            position: static !important;
        }
        /* Garante que o quadrinho não seja bloqueado por camadas invisíveis */
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
                    // Sobe na árvore para pegar o container do modal inteiro
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

        // 3. Força bruta: Remove overlays (telas pretas/invisíveis) que bloqueiam o quadrinho
        document.querySelectorAll('div, section, dialog, overlay, [class*="modal"], [class*="popup"]').forEach(el => {
            if (el === document.body || el === document.documentElement) return;
            
            const cs = window.getComputedStyle(el);
            const zIndex = parseInt(cs.zIndex || '0', 10);
            
            // Verifica se é uma tela cheia (position fixed/absolute, cobrindo a tela)
            const isFullScreen = (cs.position === 'fixed' || cs.position === 'absolute') && 
                                 (cs.inset === '0px' || (cs.width === '100%' && cs.height === '100%') || zIndex > 999);

            // Se for tela cheia e tiver fundo escuro ou for um bloqueador invisível
            if (isFullScreen && zIndex > 100) {
                // Não remove se for a imagem do quadrinho (geralmente tem 'img' ou 'canvas' dentro)
                if (!el.querySelector('img, canvas') || cs.backgroundColor.includes('0, 0, 0')) {
                    el.remove();
                }
            }
        });

        // 4. Desbloqueia o body e html (remove classes de modal aberto e estilos travados)
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('pointer-events', 'auto', 'important');
        document.documentElement.style.setProperty('touch-action', 'auto', 'important');
        
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('pointer-events', 'auto', 'important');
        document.body.style.setProperty('touch-action', 'auto', 'important');
        document.body.style.setProperty('position', 'static', 'important');
        
        // Remove classes comuns que travam a rolagem (ex: modal-open, no-scroll)
        document.body.className = document.body.className.replace(/(modal-open|no-scroll|locked|overflow-hidden|blur)/gi, '').trim();
    };

    // 5. Executa imediatamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', destruirBloqueios);
    } else {
        destruirBloqueios();
    }

    // 6. Vigia a página (se o site recriar a tela preta ou o popup, ele apaga na hora)
    const observer = new MutationObserver(() => {
        destruirBloqueios();
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
    });

    // 7. Backup de segurança: roda a cada 1 segundo por 15 segundos
    let tentativas = 0;
    const interval = setInterval(() => {
        destruirBloqueios();
        tentativas++;
        if (tentativas > 15) clearInterval(interval);
    }, 1000);

})();