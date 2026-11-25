(() => {
    if (window.__inkLeitorV2) return;
    window.__inkLeitorV2 = true;

    (function androidFixes() {
        const KEY = 'serei sempre legal';
        
        const matarPopup = () => {
            const body = document.body;
            if (!body) return;

            // 1. Tenta achar pelo texto exato
            if ((body.textContent || '').toLowerCase().includes(KEY)) {
                const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
                let n;
                while ((n = w.nextNode())) {
                    if (!n.nodeValue || !n.nodeValue.toLowerCase().includes(KEY)) continue;
                    let modal = n.parentElement;
                    // Sobe na árvore até achar o container principal (evita deletar só o texto)
                    for (let i = 0; i < 6; i++) {
                        if (modal.parentElement && modal.parentElement !== body) {
                            modal = modal.parentElement;
                        } else {
                            break;
                        }
                    }
                    if (modal && modal !== body) {
                        modal.remove();
                    }
                }
            }

            // 2. Força bruta: Remove qualquer tela preta/overlay que esteja cobrindo a tela inteira
            const todosElementos = document.querySelectorAll('div, section, overlay, dialog');
            todosElementos.forEach(el => {
                if (el === body) return;
                const style = window.getComputedStyle(el);
                
                // Se for tela cheia, fixa, com z-index alto e fundo escuro
                if (
                    (style.position === 'fixed' || style.position === 'absolute') &&
                    (parseInt(style.zIndex) > 100 || style.zIndex === 'auto') &&
                    (style.inset === '0px' || (style.width === '100%' && style.height === '100%')) &&
                    (style.backgroundColor.includes('0, 0, 0') || style.backgroundColor.includes('rgba(0, 0, 0'))
                ) {
                    el.remove();
                }
                
                // Se o elemento tem o texto do popup bloqueando, tira o evento de clique e destrói
                if ((el.textContent || '').toLowerCase().includes(KEY) && el.children.length < 5) {
                    el.remove();
                }
            });

            // 3. Desbloqueia a rolagem e o toque na página
            document.documentElement.style.overflow = 'auto';
            document.documentElement.style.pointerEvents = 'auto';
            body.style.overflow = 'auto';
            body.style.pointerEvents = 'auto';
            body.style.position = 'static';
            
            // Remove classes de bloqueio do body
            body.className = body.className.replace(/(modal-open|no-scroll|locked|overflow-hidden)/gi, '');
        };

        // Executa assim que a página carregar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', matarPopup);
        } else {
            matarPopup();
        }

        // Fica vigiando se o site recriar o bloqueio (MutationObserver)
        const observer = new MutationObserver(() => {
            matarPopup();
        });
        
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        // Backup: tenta matar a cada 1 segundo nos primeiros 10 segundos (caso demore a carregar)
        let tentativas = 0;
        const interval = setInterval(() => {
            matarPopup();
            tentativas++;
            if (tentativas > 10) clearInterval(interval);
        }, 1000);

    })();
})();