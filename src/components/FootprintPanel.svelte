<script lang="ts">
  import { t, tx } from '../lib/i18n';
  import { lang, footprint, viewing, adoptViewing, footprintShareUrl } from '../lib/stores';
  import { siteById } from '../lib/data';
  import { copyText } from '../lib/clipboard';
  import { renderShareImage } from '../lib/share-image';

  let { onclose }: { onclose: () => void } = $props();

  const fp = $derived($viewing ?? $footprint);
  const url = $derived(footprintShareUrl(fp, $lang));

  let busy = $state(false);
  let failed = $state(false);
  let img: string | null = $state(null);
  let copied = $state(false);
  let copyFailed = $state(false);
  let shareBtn: HTMLButtonElement | undefined = $state();
  let sheetClose: HTMLButtonElement | undefined = $state();

  // Move focus into the share sheet when it opens and back to the trigger when it closes.
  $effect(() => {
    if (img) sheetClose?.focus();
    else shareBtn?.focus();
  });

  async function share() {
    busy = true;
    failed = false;
    // let the "rendering…" label paint before the canvas work blocks the thread
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      img = await renderShareImage(fp, $lang, {
        title: $t('footprint.shareTitle'),
        dived: $t('footprint.dived'),
        wish: $t('footprint.wish'),
        scan: $t('footprint.scanHint'),
        brand: `${$t('app.title')} · ${$t('app.subtitle')}`,
      }, url);
    } catch {
      failed = true;
    } finally {
      busy = false;
    }
  }

  async function copy() {
    const ok = await copyText(url);
    copied = ok;
    copyFailed = !ok;
    if (ok) setTimeout(() => (copied = false), 1600);
  }

  function adopt() {
    if (confirm($t('footprint.adoptConfirm'))) adoptViewing();
  }
</script>

<!-- The sheet is the top layer: it takes Escape before App closes the whole panel. -->
<svelte:window
  onkeydowncapture={(e) => {
    if (img && e.key === 'Escape') {
      img = null;
      e.stopPropagation();
    }
  }}
/>

<aside class="card" aria-label={$t('footprint.title')}>
  <button class="close" onclick={onclose} aria-label={$t('card.close')}>×</button>
  <h2>{$viewing ? $t('footprint.viewingBanner') : $t('footprint.title')}</h2>

  {#if $viewing}
    <div class="row">
      <button class="secondary" onclick={() => viewing.set(null)}>{$t('footprint.viewMine')}</button>
      <button class="secondary" onclick={adopt}>{$t('footprint.adopt')}</button>
    </div>
  {/if}

  <div class="stats">
    <div><strong class="dived">{fp.dived.length}</strong><span>{$t('footprint.dived')}</span></div>
    <div><strong class="wish">{fp.wish.length}</strong><span>{$t('footprint.wish')}</span></div>
  </div>

  {#if fp.dived.length + fp.wish.length === 0}
    <p class="muted">{$t('footprint.none')}</p>
  {:else}
    {#if fp.dived.length}
      <h3>{$t('footprint.dived')}</h3>
      <div class="chips">{#each fp.dived as id (id)}<span class="chip dived">{$tx(siteById.get(id)?.name)}</span>{/each}</div>
    {/if}
    {#if fp.wish.length}
      <h3>{$t('footprint.wish')}</h3>
      <div class="chips">{#each fp.wish as id (id)}<span class="chip wish">{$tx(siteById.get(id)?.name)}</span>{/each}</div>
    {/if}
  {/if}

  <footer>
    <button class="primary" bind:this={shareBtn} onclick={share} disabled={busy}>
      {busy ? $t('footprint.rendering') : $t('footprint.share')}
    </button>
    <button class="secondary wide" onclick={copy}>{copied ? $t('card.copied') : $t('footprint.copyLink')}</button>
    {#if copyFailed}
      <p class="muted">{$t('card.longPressCopy')}</p>
      <input class="url" readonly value={url} onfocus={(e) => e.currentTarget.select()} />
    {/if}
    {#if failed}<p class="muted">{$t('footprint.shareFailed')}</p>{/if}
    <p class="muted">{$t('footprint.privacy')}</p>
  </footer>
</aside>

{#if img}
  <div class="sheet" role="dialog" aria-modal="true" aria-label={$t('footprint.share')}>
    <img src={img} alt={$t('footprint.shareTitle')} />
    <p>{$t('footprint.saveHint')}</p>
    <button class="secondary" bind:this={sheetClose} onclick={() => (img = null)}>{$t('card.close')}</button>
  </div>
{/if}

<style>
  .card {
    position: relative;
    background: var(--paper);
    color: var(--ink);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px 20px 16px;
    overflow-y: auto;
    max-height: 100%;
  }
  .close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 24px;
    line-height: 1;
    color: var(--ink-soft);
    background: var(--paper-2);
  }
  h2 {
    margin: 0 44px 12px 0;
    font-size: 22px;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .stats {
    display: flex;
    gap: 24px;
    margin: 4px 0 8px;
  }
  .stats strong {
    display: block;
    font-size: 34px;
    line-height: 1.1;
  }
  .stats span {
    font-size: 12px;
    color: var(--ink-soft);
  }
  strong.dived {
    color: var(--coral);
  }
  strong.wish {
    color: var(--sun);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--paper-2);
    font-size: 13px;
  }
  .chip.dived {
    background: var(--coral);
    color: #fff;
  }
  .chip.wish {
    background: var(--sun);
    color: var(--ocean-deep);
  }
  .muted {
    color: var(--ink-soft);
    font-size: 12px;
    margin: 8px 0 0;
  }
  footer {
    margin-top: 16px;
  }
  .primary {
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    background: var(--coral);
    color: #fff;
    font-weight: 600;
  }
  .primary:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .secondary {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    background: var(--paper-2);
    color: var(--ink);
    font-weight: 600;
  }
  .secondary.wide {
    display: block;
    width: 100%;
    margin-top: 8px;
  }
  .url {
    width: 100%;
    margin-top: 6px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper-2);
    color: var(--ink);
    font: inherit;
    font-size: 12px;
  }

  /* Share sheet: a real <img> so WeChat offers 长按保存 / 识别二维码. */
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
    background: rgba(14, 42, 71, 0.9);
    color: var(--map-line);
  }
  .sheet img {
    max-width: min(100%, 420px);
    max-height: 72vh;
    max-height: 72dvh;
    border-radius: 12px;
    box-shadow: var(--shadow);
  }
  .sheet p {
    margin: 0;
    font-size: 14px;
  }
  .sheet .secondary {
    flex: none;
    min-width: 120px;
  }
</style>
