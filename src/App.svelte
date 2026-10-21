<script lang="ts">
  import MapView from './components/MapView.svelte';
  import SiteCard from './components/SiteCard.svelte';
  import MonthPicker from './components/MonthPicker.svelte';
  import LangToggle from './components/LangToggle.svelte';
  import FootprintPanel from './components/FootprintPanel.svelte';
  import SearchPanel from './components/SearchPanel.svelte';
  import { t, tx } from './lib/i18n';
  import { selectedSiteId, speciesFilter, footprint, mapView, toggleMapView } from './lib/stores';
  import { siteById, speciesById } from './lib/data';

  const site = $derived($selectedSiteId ? (siteById.get($selectedSiteId) ?? null) : null);
  const markCount = $derived($footprint.dived.length + $footprint.wish.length);
  const filterSpecies = $derived($speciesFilter ? speciesById.get($speciesFilter) : undefined);

  // The side panel shows one thing at a time: a search, the footprint, or the selected site.
  type Panel = 'search' | 'footprint' | null;
  let panel: Panel = $state(null);
  const openers: Partial<Record<'search' | 'footprint', HTMLButtonElement>> = {};
  $effect(() => {
    if ($selectedSiteId) panel = null;
  });
  function toggle(p: Panel) {
    panel = panel === p ? null : p;
    if (panel) selectedSiteId.set(null);
  }
  /** Close a panel and hand keyboard focus back to the pill that opened it. */
  function closePanel() {
    const opener = panel ? openers[panel] : undefined;
    panel = null;
    opener?.focus({ preventScroll: true });
  }

  // The Android back button / iOS edge swipe should close the open layer, not leave the page:
  // push one history entry while something is open and close on popstate.
  const overlayOpen = $derived(!!$selectedSiteId || panel !== null);
  $effect(() => {
    if (overlayOpen && !history.state?.overlay) {
      try {
        history.pushState({ overlay: true }, '', location.href);
      } catch {
        /* ignore */
      }
    }
  });
  function closeAll() {
    selectedSiteId.set(null);
    panel = null;
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') closeAll();
  }}
  onpopstate={closeAll}
/>

<div class="app">
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true"></span>
      <div>
        <h1>{$t('app.title')}<span class="sub"><span class="dot">·</span>{$t('app.subtitle')}</span></h1>
        <p>{$t('app.tagline')}</p>
      </div>
    </div>
    <div class="controls">
      <button class="pill" bind:this={openers.footprint} onclick={() => toggle('footprint')} aria-pressed={panel === 'footprint'}>
        {$t('footprint.open')}{#if markCount}<span class="n">{markCount}</span>{/if}
      </button>
      <LangToggle />
    </div>
  </header>

  <div class="toolbar">
    <button class="pill round" bind:this={openers.search} onclick={() => toggle('search')} aria-pressed={panel === 'search'} aria-label={$t('nav.search')}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
        <path d="M15.5 15.5 L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
    <button class="pill round globe" onclick={toggleMapView} aria-pressed={$mapView === 'globe'} aria-label={$t('view.globe')}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="8.5" stroke-width="2" />
        <ellipse cx="12" cy="12" rx="3.6" ry="8.5" stroke-width="1.6" />
        <path d="M3.5 12 H20.5" stroke-width="1.6" />
      </svg>
    </button>
    <MonthPicker />
    {#if filterSpecies}
      <button class="pill chip" onclick={() => speciesFilter.set(null)} aria-label={`${$tx(filterSpecies.name)} · ${$t('filter.clear')}`}>
        {$tx(filterSpecies.name)} <span aria-hidden="true">×</span>
      </button>
    {/if}
  </div>

  <main class="stage">
    <MapView />
  </main>

  {#if panel === 'search'}
    <div class="panel">
      <SearchPanel onclose={closePanel} />
    </div>
  {:else if panel === 'footprint'}
    <div class="panel">
      <FootprintPanel onclose={closePanel} />
    </div>
  {:else if site}
    <div class="panel">
      {#key site.id}
        <SiteCard {site} onclose={() => selectedSiteId.set(null)} />
      {/key}
    </div>
  {/if}

  <footer class="bottom">{$t('footer.data')}</footer>
</div>

<style>
  .app {
    position: relative;
    height: 100%;
    overflow: hidden;
  }
  .stage {
    position: absolute;
    inset: 0;
  }

  .top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    pointer-events: none;
  }
  .top > * {
    pointer-events: auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--map-line);
    text-shadow: 0 1px 2px rgba(14, 42, 71, 0.4);
  }
  .controls {
    display: flex;
    gap: 8px;
    flex: none;
  }
  .controls :global(.pill),
  .controls :global(button) {
    white-space: nowrap;
  }
  .pill .n {
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--coral);
    color: #fff;
    font-size: 11px;
  }
  .logo {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, var(--sun), var(--coral) 70%);
    box-shadow: 0 2px 8px rgba(14, 42, 71, 0.3);
    flex: none;
  }
  h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0.02em;
  }
  .dot {
    margin: 0 6px;
    opacity: 0.7;
  }
  .brand p {
    margin: 0;
    font-size: 12px;
    opacity: 0.85;
  }

  .toolbar {
    position: absolute;
    top: 64px;
    left: 16px;
    right: 16px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    pointer-events: none;
  }
  .toolbar > :global(*) {
    pointer-events: auto;
  }
  .pill.round {
    width: 40px;
    height: 40px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
  }
  .pill.globe[aria-pressed='true'] {
    box-shadow: inset 0 0 0 2px var(--coral);
  }
  .pill.chip {
    height: 40px;
    background: var(--coral);
    color: #fff;
    flex: none;
  }

  .panel {
    position: absolute;
    z-index: 3;
    right: 16px;
    top: 112px;
    bottom: 40px;
    width: var(--card-w);
    max-width: calc(100% - 32px);
  }

  .bottom {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    padding: 6px 16px;
    font-size: 11px;
    color: var(--map-line);
    opacity: 0.7;
    text-align: center;
    pointer-events: none;
  }

  /* Phone: card becomes a bottom drawer. */
  @media (max-width: 899px) {
    .panel {
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: auto;
      max-width: none;
      max-height: 70vh;
      max-height: 70dvh;
      padding: 0 8px calc(8px + env(safe-area-inset-bottom));
      /* definite height for the card's max-height:100%, otherwise the drawer never scrolls */
      display: flex;
      flex-direction: column;
    }
    .panel :global(.card) {
      overscroll-behavior: contain;
    }
    .panel :global(.card) {
      border-radius: 18px 18px var(--radius) var(--radius);
    }
    .brand p,
    .sub {
      display: none;
    }
    .logo {
      width: 28px;
      height: 28px;
    }
    .controls {
      gap: 6px;
    }
    .controls :global(.pill),
    .controls :global(button) {
      padding: 0 10px;
    }
    .toolbar {
      left: 8px;
      right: 8px;
      justify-content: flex-start;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .toolbar::-webkit-scrollbar {
      display: none;
    }
    .bottom {
      display: none;
    }
  }
</style>
