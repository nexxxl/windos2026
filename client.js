/**
 * NexlOS client integration: sidebar, branding, navigation and a WebOS panel
 * at `/nexlos/`. The Host serves the bundled desktop and application assets.
 * The health probe provides a reload/restart fallback during Host activation.
 *
 * @module @nexlos/os/client
 */
window.__ModuleLoader__.load({
  id: '@nexlos/os',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'nexlos';
    const NS = 'nexlos';

    const ZH = {
      'panel.title': 'NexlOS 桌面',
      'panel.fallback.title': 'NexlOS 内核等待重启',
      'panel.fallback.body': '桌面文件已经就位。DSH 的 Host 进程还带着上一代插件，重启 dsh web 后这里会加载完整的 NexlOS 桌面。',
      'panel.fallback.reload': '重新载入',
      'panel.fallback.check': '重新检测',
    };
    const EN = {
      'panel.title': 'NexlOS Desktop',
      'panel.fallback.title': 'NexlOS kernel awaits a restart',
      'panel.fallback.body': 'The desktop files are in place. This DSH Host process still carries the previous plugin generation; restart dsh web and this panel will load the full NexlOS desktop.',
      'panel.fallback.reload': 'Reload',
      'panel.fallback.check': 'Check again',
    };

    /** The current NexlOS mark (`ui/nexlos-mark.svg`, compact B), byte-for-byte. */
    function Mark({ size }) {
      const edge = size || 18;
      return h('svg', {
        viewBox: '0 0 256 256',
        width: edge,
        height: edge,
        role: 'img',
        'aria-label': 'NexlOS',
        shapeRendering: 'crispEdges',
      },
        h('path', { fill: '#EF4B23', d: 'M33.92,16 105.6,16 105.6,33.92 123.52,33.92 123.52,51.84 141.44,51.84 141.44,87.68 105.6,87.68 105.6,69.76 87.68,69.76 87.68,51.84 51.84,51.84 51.84,98.56 16,98.56 16,33.92 33.92,33.92Z' }),
        h('path', { fill: '#73B534', d: 'M240,33.92 240,105.6 222.08,105.6 222.08,123.52 204.16,123.52 204.16,141.44 168.32,141.44 168.32,105.6 186.24,105.6 186.24,87.68 204.16,87.68 204.16,51.84 157.44,51.84 157.44,16 222.08,16 222.08,33.92Z' }),
        h('path', { fill: '#F4D632', d: 'M222.08,240 150.4,240 150.4,222.08 132.48,222.08 132.48,204.16 114.56,204.16 114.56,168.32 150.4,168.32 150.4,186.24 168.32,186.24 168.32,204.16 204.16,204.16 204.16,157.44 240,157.44 240,222.08 222.08,222.08Z' }),
        h('path', { fill: '#438FD2', d: 'M16,222.08 16,150.4 33.92,150.4 33.92,132.48 51.84,132.48 51.84,114.56 87.68,114.56 87.68,150.4 69.76,150.4 69.76,168.32 51.84,168.32 51.84,204.16 98.56,204.16 98.56,240 33.92,240 33.92,222.08Z' }),
      );
    }

    /** Probe the Host half without trusting a generic SPA fallback response. */
    function probeHost() {
      return fetch('/nexlos/health', { headers: { accept: 'application/json' }, cache: 'no-store' })
        .then((response) => {
          const type = response.headers.get('content-type') || '';
          return response.ok && type.indexOf('application/json') !== -1;
        })
        .catch(() => false);
    }

    function Desktop({ t }) {
      const [state, setState] = React.useState('loading');
      const check = React.useCallback(() => {
        setState('loading');
        probeHost().then((ok) => setState(ok ? 'ready' : 'missing'));
      }, []);
      React.useEffect(() => { check(); }, [check]);

      if (state === 'ready') {
        return h('iframe', {
          src: '/nexlos/',
          title: t('panel.title'),
          style: { width: '100%', height: '100%', border: 0, display: 'block', background: '#f5efe4' },
          allow: 'clipboard-read; clipboard-write; fullscreen; microphone; camera; autoplay; display-capture',
          allowFullScreen: true,
        });
      }

      const style = {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
      };
      const card = {
        width: 'min(420px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'center',
      };
      const button = {
        height: '30px',
        padding: '0 14px',
        borderRadius: '7px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
        font: 'inherit',
      };
      return h('div', { style },
        h('div', { style: card },
          h(Mark, { size: 52 }),
          h('strong', { style: { fontSize: '15px' } }, state === 'missing' ? t('panel.fallback.title') : 'NexlOS'),
          h('p', { style: { margin: 0, fontSize: '12px', lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' } },
            state === 'missing' ? t('panel.fallback.body') : 'NEXLOS · AI-native operating system'),
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '4px' } },
            h('button', { type: 'button', style: button, onClick: check }, t('panel.fallback.check')),
            state === 'missing' ? h('button', { type: 'button', style: button, onClick: () => window.location.reload() }, t('panel.fallback.reload')) : null,
          ),
        ),
      );
    }

    return {
      inject: ['slots', 'locale', 'layout', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'nexlos: locale');
        const t = ctx.locale.bind(NS);

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
        }, () => h(Desktop, { t })));

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: -20,
          label: () => t('panel.title'),
        }, ({ size }) => h(Mark, { size: size || 18 })));

        // priority -10 shadows the bundled brand mark; equal priority would throw.
        ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({
          name: 'sidebar.brand.mark',
          priority: -10,
        }, ({ size }) => h(Mark, { size: size || 18 })));

        ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({
          name: 'sidebar.brand.name',
          priority: -10,
        }, () => h('span', {
          style: {
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.26em',
            color: 'var(--dsw-alias-label-primary)',
            whiteSpace: 'nowrap',
          },
        }, 'NEXLOS')));

        // The Agent Cluster floater lives inside the WebOS iframe; a click on a
        // member or the captain asks the DSH shell to reveal that real session.
        ctx.effect(() => {
          const uiWorkspace = ctx.get('uiWorkspace');
          const onMessage = (event) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.type !== 'nexlos.open-session') return;
            const target = data.target !== undefined && typeof data.target === 'object'
              ? data.target
              : (typeof data.sessionId === 'string' ? data.sessionId : undefined);
            if (target === undefined) return;
            if (uiWorkspace === undefined || typeof uiWorkspace.openSession !== 'function') return;
            try {
              uiWorkspace.openSession(target);
            } catch (error) {
              console.warn('nexlos: open session failed', error);
            }
          };
          window.addEventListener('message', onMessage);
          return () => window.removeEventListener('message', onMessage);
        }, 'nexlos: agent cluster navigation');

        // Global shortcut stays on the DSH page; the OS iframe is often not the
        // focused document. Forward it to the cluster floater.
        ctx.effect(() => {
          const onKeyDown = (event) => {
            if (!(event.shiftKey && (event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k')) return;
            event.preventDefault();
            const frame = document.querySelector('iframe[src="/nexlos/"]');
            if (frame === null || frame.contentWindow === null) return;
            frame.contentWindow.postMessage({ type: 'nexlos.cluster-show' }, window.location.origin);
          };
          window.addEventListener('keydown', onKeyDown, true);
          return () => window.removeEventListener('keydown', onKeyDown, true);
        }, 'nexlos: agent cluster shortcut');

        // Feed the real DSH session/workspace workbench into the NexlOS state
        // console. The data comes from the DSH client's own session list; the
        // desktop never invents a second session inventory.
        ctx.effect(() => {
          const sessions = ctx.get('sessions')
          let timer = 0
          const snapshot = () => {
            try {
              const list = sessions && sessions.list && typeof sessions.list.getSnapshot === 'function'
                ? sessions.list.getSnapshot()
                : null
              if (!list || !Array.isArray(list.ids)) return null
              const rows = []
              for (const id of list.ids) {
                const item = list.byId ? list.byId[id] : null
                if (!item) continue
                rows.push({
                  id: String(id),
                  title: String(item.displayTitle || item.title || item.name || id),
                  cwd: typeof item.cwd === 'string' ? item.cwd : '',
                  createdAt: item.createdAt || '',
                  updatedAt: item.updatedAt || item.createdAt || '',
                  blank: item.blank === true,
                })
              }
              const groups = new Map()
              for (const row of rows) {
                const normalized = typeof row.cwd === 'string' ? row.cwd.replace(/\/+$/u, '') : ''
                const key = normalized
                if (!groups.has(key)) groups.set(key, { cwd: normalized, label: normalized ? normalized.split(/[\\/]/).filter(Boolean).pop() || normalized : '未分组', sessions: [] })
                groups.get(key).sessions.push(row)
              }
              const workspaces = [...groups.values()].sort((a, b) => b.sessions.length - a.sessions.length)
              return { sessions: rows, workspaces }
            } catch (_error) { return null }
          }
          const send = () => {
            const data = snapshot()
            if (!data) return
            const panel = document.querySelector('iframe[src="/nexlos/"]')
            if (!panel || !panel.contentWindow) return
            try { panel.contentWindow.postMessage({ type: 'nexlos.dsh-workbench', data }, window.location.origin) } catch (_error) { /* iframe detached */ }
          }
          const onMessage = (event) => {
            if (event.origin !== window.location.origin) return
            if (event.data && event.data.type === 'nexlos.dsh-workbench.request') send()
          }
          window.addEventListener('message', onMessage)
          // Pull-based: the WebOS workbench asks for a snapshot only while it
          // is visible. Avoid a background timer when the desktop is idle.
          window.setTimeout(send, 900)
          return () => {
            clearInterval(timer)
            window.removeEventListener('message', onMessage)
          }
        }, 'nexlos: DSH workbench bridge')

        // Enter the desktop on load only when the Host half is really serving
        // the WebOS. A previous-generation Host (before restart) answers with
        // the DSH SPA, so the page keeps the conversation instead of nesting it.
        ctx.effect(() => {
          let alive = true;
          probeHost().then((ok) => {
            if (!alive || !ok) return;
            const enter = () => {
              try {
                ctx.layout.selectPanel(PANEL_ID);
              } catch (_error) {
                /* the panel registry settles on the next frame */
              }
            };
            window.setTimeout(enter, 60);
          });
          return () => { alive = false; };
        }, 'nexlos: enter desktop');
      },
    };
  },
});





