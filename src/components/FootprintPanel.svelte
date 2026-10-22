<script lang="ts">
  import { t, tx } from '../lib/i18n';
  import { lang, footprint, siteUrl, openSite, displayName, setDisplayName, NAME_MAX } from '../lib/stores';
  import { siteById, speciesById, spriteUrl } from '../lib/data';
  import { copyText } from '../lib/clipboard';
  import { footprintStats, rankTitle } from '../lib/ranks';
  import type { DiveSite } from '../lib/types';

  let { onclose }: { onclose: () => void } = $props();

  /** The QR and the copied link both lead to the plain site (SPEC §3.4): no footprint in any URL. */
  const url = $derived(siteUrl($lang));
  const list = (ids: string[]) => ids.map((id) => siteById.get(id)).filter((s): s is DiveSite => !!s);
  const dived = $derived(list($footprint.dived));
  const wish = $derived(list($footprint.wish));
  const stats = $derived(footprintStats(dived));
  const title = $derived(rankTitle(stats, $lang));
  /** Lead-species sticker as the row thumbnail. */
  function thumb(site: DiveSite): string | undefined {
    const sp = speciesById.get(site.species[0] ?? '');
    return sp ? spriteUrl(sp.sprite, 192) : undefined;
  }

  let busy = $state(false);
  let failed = $state(false);
  let img: string | null = $state(null);
  let copied = $state(false);
  let copyFailed = $state(false);
  let shareBtn: HTMLButtonElement | undefined = $state();
  let sheetClose: HTMLButtonElement | undefined = $state();

  // Move focus into the share sheet when it opens and back to the trigger when it closes.
  $effect(() => {
    if (img) sheetClose?.focus({ preventScroll: true });
    else shareBtn?.focus({ preventScroll: true });
  });

  /** Name form: 'share' = asked before the first poster (生成 / 跳过), 'edit' = from the name chip (保存 / 取消). */
  let nameForm: 'share' | 'edit' | null = $state(null);
  let draft = $state('');
  let nameInput: HTMLInputElement | undefined = $state();
  $effect(() => {
    if (nameForm) nameInput?.focus();
  });

  function share() {
    if ($displayName) render();
    else {
      draft = '';
      nameForm = 'share';
    }
  }
  /** Submit saves the draft (empty clears the name); either way a 'share' form goes on to render. */
  function closeName(save: boolean) {
    if (save) setDisplayName(draft);
    const go = nameForm === 'share';
    nameForm = null;
    if (go) render();
  }

  async function render() {
    busy = true;
    failed = false;
    // let the "rendering…" label paint before the canvas work blocks the thread
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      // lazy: lean-qr and the poster code stay out of the main bundle
      const { renderShareImage } = await import('../lib/share-image');
      img = await renderShareImage($footprint, $lang, url, $displayName);
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
</script>

<!-- The sheet is the top layer: it takes Escape before App closes the whole panel. -->
<svelte:window
  onkeydowncapture={(e) => {
    if ((img || nameForm) && e.key === 'Escape') {
      if (img) img = null;
      else nameForm = null;
      e.stopPropagation();
    }
  }}
/>

{#snippet nameEditor(mode: 'share' | 'edit')}
  {#if nameForm === mode}
    <form class="name-form" onsubmit={(e) => (e.preventDefault(), closeName(true))}>
      <label for="fp-name">{$t('footprint.namePrompt')}</label>
      <input
        id="fp-name"
        bind:this={nameInput}
        bind:value={draft}
        maxlength={NAME_MAX}
        placeholder={$t('footprint.namePlaceholder')}
        autocomplete="nickname"
        enterkeyhint="done"
      />
      <div class="row">
        <button class="primary" type="submit">{$t(mode === 'share' ? 'footprint.nameGenerate' : 'footprint.nameSave')}</button>
        <button class="secondary" type="button" onclick={() => closeName(false)}>
          {$t(mode === 'share' ? 'footprint.nameSkip' : 'footprint.nameCancel')}
        </button>
      </div>
    </form>
  {/if}
{/snippet}

{#snippet rows(items: DiveSite[], kind: 'dived' | 'wish')}
  {#if items.length}
    <h3 class={kind}>{$t(kind === 'dived' ? 'footprint.dived' : 'footprint.wish')}</h3>
    <ul class="sites">
      {#each items as site (site.id)}
        {@const src = thumb(site)}
        <li>
          <button class="site {kind}" onclick={() => openSite(site.id)}>
            <span class="thumb">{#if src}<img {src} alt="" loading="lazy" />{/if}</span>
            <span class="name">{$tx(site.name)}<small>{$tx(site.country)}</small></span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<aside class="card" aria-label={$t('footprint.title')}>
  <button class="close" onclick={onclose} aria-label={$t('card.close')}>×</button>
  <h2>{$t('footprint.title')}</h2>

  <div class="stats">
    <div><strong class="dived">{dived.length}</strong><span>{$t('footprint.dived')}</span></div>
    <div><strong class="wish">{wish.length}</strong><span>{$t('footprint.wish')}</span></div>
    <div><strong>{stats.countries}</strong><span>{$t('footprint.countries')}</span></div>
    <div><strong>{stats.species}</strong><span>{$t('footprint.species')}</span></div>
    <div><strong>{$footprint.seen.length}</strong><span>{$t('footprint.seen')}</span></div>
  </div>
  <div class="rank">
    <span class="lv">{$t('rank.level').replace('{n}', String(stats.level))}</span>
    <span class="title">{title.prefix} <b>{title.noun}</b></span>
    {#if $displayName && nameForm !== 'edit'}
      <button
        class="name"
        onclick={() => ((draft = $displayName), (nameForm = 'edit'))}
        aria-label="{$t('footprint.nameEdit')} @{$displayName}"
      >
        @{$displayName}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
      </button>
    {/if}
  </div>
  {@render nameEditor('edit')}

  {#if dived.length + wish.length === 0}
    <p class="muted">{$t('footprint.none')}</p>
  {/if}
  {@render rows(dived, 'dived')}
  {@render rows(wish, 'wish')}

  <footer>
    {#if nameForm === 'share'}
      {@render nameEditor('share')}
    {:else}
      <button class="primary" bind:this={shareBtn} onclick={share} disabled={busy}>
        {busy ? $t('footprint.rendering') : $t('footprint.share')}
      </button>
    {/if}
    <button class="secondary wide" onclick={copy}>{copied ? $t('card.copied') : $t('card.copyLink')}</button>
    {#if copyFailed}
      <p class="muted">{$t('card.longPressCopy')}</p>
      <input class="url" readonly value={url} onclick={(e) => e.currentTarget.setSelectionRange(0, 9999)} />
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
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px 0 2px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--ink-soft);
  }
  h3::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--coral);
  }
  h3.wish::before {
    background: none;
    box-shadow: inset 0 0 0 2px var(--sun);
  }
  /* the share poster's palette in miniature (share-image.ts literals): charcoal band, gold */
  .stats {
    display: flex;
    gap: 8px;
    margin: 4px 0 0;
    padding: 12px 14px 10px;
    border-radius: 12px;
    background: #101113;
  }
  .stats > div {
    flex: 1;
    min-width: 0;
  }
  .stats strong {
    display: block;
    color: #f3f1ec;
    font-size: 28px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .stats span {
    display: block;
    font-size: 11px;
    line-height: 1.25;
    color: #8b8e94;
  }
  strong.dived {
    color: #d4a74a;
  }
  .rank {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    margin: 8px 0 4px;
    font-size: 13px;
  }
  .rank .lv {
    color: var(--ink-soft);
    font-size: 12px;
  }
  .rank b {
    color: #a77b25; /* poster gold, darkened for contrast on paper */
  }
  .rank .name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    min-height: 32px;
    padding: 0 10px;
    border-radius: 999px;
    background: var(--paper-2);
    font-size: 12px;
    font-weight: 600;
  }
  .name-form {
    margin: 8px 0;
    padding: 12px;
    border-radius: 12px;
    background: var(--paper-2);
  }
  .name-form label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .name-form input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 16px; /* < 16 px makes iOS zoom the page on focus */
  }
  .name-form .row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .name-form .primary {
    flex: 1;
  }
  .name-form .secondary {
    background: var(--paper);
  }
  .sites {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .site {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 52px;
    padding: 4px 0;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }
  li:last-child .site {
    border-bottom: 0;
  }
  .thumb {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: rgba(242, 121, 91, 0.14);
  }
  .site.wish .thumb {
    background: rgba(246, 196, 83, 0.22);
  }
  .thumb img {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
  .name {
    min-width: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }
  .name small {
    display: block;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-soft);
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
    background: rgba(16, 17, 19, 0.92); /* the poster charcoal */
    color: #f3f1ec;
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
