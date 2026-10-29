/**
 * The page before the editor's code has run, shared by the three apps' vite configs (dev and build): the theme set
 * inline, so a dark page is dark from the first frame, and the pending editor in `#root` (the top bar's place with
 * grey buttons, a spinner where the map comes) until React replaces it (mount.tsx). Here once, not in each index.html.
 *
 * The theme script reads what packages/ui/src/theme.ts reads: a link's `theme`, else the stored choice (the settings
 * store of packages/ui/src/settings.ts, `maid:settings` with `state.theme`), else the system's. A change of that key or
 * shape is a change here too.
 */

/** The end of `<head>`: the theme script and the pending editor's styles */
export const BOOT_HEAD = `
<script>
  // the theme before the first paint, as packages/ui/src/theme.ts will set it: a link's \`theme\`, else the stored
  // choice (the settings store, packages/ui/src/settings.ts), else the system's. Without it a dark page is white
  // until the code has loaded.
  try {
    var choice = new URLSearchParams(location.search).get('theme')
    if (choice !== 'light' && choice !== 'dark') {
      var stored = JSON.parse(localStorage.getItem('maid:settings') || '{}')
      choice = (stored.state && stored.state.theme) || 'system'
    }
    var dark =
      choice === 'dark' ||
      (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  } catch (error) {}
</script>
<style>
  /* shown from the first byte until the editor's code has loaded and React replaces #root's content (mount.tsx) */
  html,
  body,
  #root {
    margin: 0;
    height: 100%;
    background: #fff;
  }
  html.dark,
  html.dark body,
  html.dark .boot {
    background: #18181b;
  }
  /* the pending editor: the top bar's place with grey buttons, and a spinner where the map comes. The bar is one row
     of 48px on a wide window and two rows on a narrow one (packages/ui/src/TopBar.tsx measures it; ~1040px) */
  .boot {
    display: flex;
    height: 100%;
    background: #fff;
    flex-direction: column;
  }
  .boot-bar {
    display: flex;
    flex-wrap: wrap;
    align-content: center;
    gap: 6px 8px;
    min-height: 48px;
    padding: 6px 12px;
    box-sizing: border-box;
    border-bottom: 1px solid rgb(9 9 11 / 0.1);
  }
  html.dark .boot-bar {
    border-color: rgb(255 255 255 / 0.1);
  }
  .boot-bar i {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    background: rgb(113 113 122 / 0.15);
  }
  .boot-bar i:first-child {
    margin-right: auto;
    background: none;
  }
  .boot-map {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
  }
  @media (max-width: 1040px) {
    .boot-bar {
      padding: 6px 12px 50px;
    }
  }
  .boot-map::after {
    content: '';
    width: 2rem;
    height: 2rem;
    border: 3px solid rgb(113 113 122 / 0.3);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: boot-spin 0.8s linear infinite;
  }
  @keyframes boot-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .boot-map::after {
      animation-duration: 2.4s;
    }
  }
</style>
`

/** The pending editor: the content of `#root` until React draws */
export const BOOT_ROOT = `
<div class="boot" role="status" aria-label="Loading">
  <div class="boot-bar"><i></i><i></i><i></i><i></i><i></i><i></i></div>
  <div class="boot-map"></div>
</div>
`

/** The part of Vite's plugin API used here (the apps' own `vite` is not a dependency of the root project) */
type Plugin = {
  name: string
  transformIndexHtml: { order: 'pre'; handler(html: string): string }
}

/** Puts the theme script and the styles at the end of `<head>`, and the pending editor into the empty `#root` */
export function bootPage(): Plugin {
  return {
    name: 'maid-boot-page',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('<div id="root"></div>'))
          throw new Error('index.html needs an empty <div id="root"></div> for the pending editor')
        return html
          .replace('</head>', `${BOOT_HEAD}</head>`)
          .replace('<div id="root"></div>', `<div id="root">${BOOT_ROOT}</div>`)
      },
    },
  }
}
