<script lang="ts">
  import MapView from './components/MapView.svelte';
  import SiteCard from './components/SiteCard.svelte';
  import MonthPicker from './components/MonthPicker.svelte';
  import LangToggle from './components/LangToggle.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';
  import { t } from './lib/i18n';
  import { selectedSiteId } from './lib/stores';
  import { siteById } from './lib/data';

  const site = $derived($selectedSiteId ? (siteById.get($selectedSiteId) ?? null) : null);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && selectedSiteId.set(null)} />

<div class="app">
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true"></span>
      <div>
        <h1>{$t('app.title')}<span class="dot">·</span>{$t('app.subtitle')}</h1>
        <p>{$t('app.tagline')}</p>
      </div>
    </div>
    <div class="controls">
      <ThemeToggle />
      <LangToggle />
    </div>
  </header>

  <div class="toolbar">
    <MonthPicker />
  </div>

  <main class="stage">
    <MapView />
  </main>

  {#if site}
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
    justify-content: center;
    pointer-events: none;
  }
  .toolbar > :global(*) {
    pointer-events: auto;
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
    }
    .panel :global(.card) {
      border-radius: 18px 18px var(--radius) var(--radius);
    }
    .brand p {
      display: none;
    }
    .toolbar {
      left: 8px;
      right: 8px;
      justify-content: flex-start;
    }
    .bottom {
      display: none;
    }
  }
</style>
