<script lang="ts">
  import { t, tx, MONTH_KEYS } from '../lib/i18n';
  import { lang, month, shareUrl, footprint, setMark, markOf } from '../lib/stores';
  import { speciesById, regionById, spriteUrl, loadSiteDetails } from '../lib/data';
  import { copyText } from '../lib/clipboard';
  import type { DiveSite, SiteDetails, Species, LocalizedText } from '../lib/types';

  // App.svelte wraps this in {#key site.id}, so transient state resets per site for free.
  let { site, onclose }: { site: DiveSite; onclose: () => void } = $props();

  const mark = $derived(markOf($footprint, site.id));
  let copied = $state(false);
  let copyFailed = $state(false);
  let heroBroken = $state(false);
  /** Text block, loaded lazily (one shared chunk for all sites). */
  let details: SiteDetails | undefined = $state();
  $effect(() => {
    const id = site.id;
    loadSiteDetails().then((all) => {
      if (id === site.id) details = all[id];
    });
  });

  const heroSprite = $derived.by(() => {
    const first = site.species[0];
    const sp = first ? speciesById.get(first) : undefined;
    return sp ? spriteUrl(sp.sprite, 512) : undefined;
  });

  // Species chips open one inline panel at a time. `blurb` may not be in the data yet.
  type SpeciesInfo = Species & { blurb?: LocalizedText };
  /** lengthM of a school, a reef or a kelp stand is not a body length, so it is not shown. */
  const NO_LENGTH = new Set(['school', 'coral', 'kelp']);
  let openSp: string | null = $state(null);
  const chipEls: Record<string, HTMLButtonElement> = {};
  const openInfo = $derived(openSp ? (speciesById.get(openSp) as SpeciesInfo | undefined) : undefined);
  const lengthText = (m: number) => (m >= 1 ? `${+m.toFixed(1)} m` : `${Math.round(m * 100)} cm`);
  /** Collapse from the panel's × and hand focus back to the chip that opened it. */
  function collapse() {
    const id = openSp;
    openSp = null;
    if (id) chipEls[id]?.focus();
  }

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  async function copyLink() {
    const ok = await copyText(shareUrl());
    copied = ok;
    copyFailed = !ok;
    if (ok) setTimeout(() => (copied = false), 1600);
  }
</script>

<aside class="card" aria-label={$tx(site.name)}>
  <button class="close" onclick={onclose} aria-label={$t('card.close')}>×</button>

  <header>
    {#if heroSprite && !heroBroken}
      <img
        class="hero"
        src={heroSprite}
        alt=""
        loading="lazy"
        onerror={() => (heroBroken = true)}
      />
    {/if}
    <div class="titles">
      <h2>{$tx(site.name)}</h2>
      <p class="sub">
        {$tx(site.country)} · {$tx(regionById.get(site.region)?.name)}
        {#if !site.verified}<span class="badge">{$t('card.unverified')}</span>{/if}
      </p>
    </div>
  </header>

  <section>
    <h3>{$t('card.bestSeason')}</h3>
    <div class="months" role="list">
      {#each MONTH_KEYS as key, i}
        {@const m = i + 1}
        {@const best = site.bestMonths.length === 0 || site.bestMonths.includes(m)}
        <span class="m" class:best class:current={$month === m} role="listitem">{$t(key)}</span>
      {/each}
    </div>
    {#if site.bestMonths.length === 0}<p class="muted">{$t('card.yearRound')}</p>{/if}
  </section>

  <section>
    <h3>{$t('card.species')}</h3>
    <div class="chips">
      {#each site.species as id}
        {@const sp = speciesById.get(id)}
        {@const thumb = sp && spriteUrl(sp.sprite, 192)}
        <button
          class="chip"
          bind:this={chipEls[id]}
          aria-expanded={openSp === id}
          aria-controls="sp-panel"
          onclick={() => (openSp = openSp === id ? null : id)}
        >
          {#if thumb}<img src={thumb} alt="" loading="lazy" decoding="async" />{:else}<span class="disc"></span>{/if}
          {sp ? $tx(sp.name) : id}
        </button>
      {/each}
    </div>
    {#if openInfo}
      {@const big = spriteUrl(openInfo.sprite, 512)}
      <div id="sp-panel" class="sp-wrap"><div class="sp">
        <button class="sp-close" onclick={collapse} aria-label={$t('species.collapse')}>×</button>
        {#if big}<img class="sp-img" src={big} alt="" decoding="async" />{:else}<span class="disc"></span>{/if}
        <h4>{$tx(openInfo.name)} <small>{openInfo.name[$lang === 'zh' ? 'en' : 'zh']}</small></h4>
        {#if openInfo.sci}<p class="sci">{openInfo.sci}</p>{/if}
        {#if openInfo.lengthM && !openInfo.tags?.some((x) => NO_LENGTH.has(x))}
          <p class="len"><span>{$t('species.length')}</span> {$t('species.about')} {lengthText(openInfo.lengthM)}</p>
        {/if}
        {#if openInfo.blurb}<p class="blurb">{$tx(openInfo.blurb)}</p>{/if}
      </div></div>
    {/if}
  </section>

  <dl class="facts">
    <div><dt>{$t('card.waterTemp')}</dt><dd>{site.waterTempC[0]}–{site.waterTempC[1]} °C</dd></div>
    <div><dt>{$t('card.visibility')}</dt><dd>{site.visibilityM[0]}–{site.visibilityM[1]} m</dd></div>
    <div><dt>{$t('card.level')}</dt><dd>{$t(`level.${site.level}`)}</dd></div>
    <div>
      <dt>{$t('card.types')}</dt>
      <dd>{site.types.map((x) => $t(`type.${x}`)).join(' · ')}</dd>
    </div>
    <div>
      <dt>{$t('card.access')}</dt>
      <dd>{site.access.map((x) => $t(`access.${x}`)).join(' · ')}</dd>
    </div>
  </dl>

  {#if details}
    <section>
      <p class="summary">{$tx(details.summary)}</p>
      {#if details.highlights.length}
        <h3>{$t('card.highlights')}</h3>
        <ul class="highlights">
          {#each details.highlights as h}<li>{$tx(h)}</li>{/each}
        </ul>
      {/if}
    </section>

    <section class="sources">
      <h3>{$t('card.sources')}</h3>
      {#if details.sources.length}
        <ul>
          {#each details.sources as url (url)}
            <li><a href={url} target="_blank" rel="noopener noreferrer">{hostOf(url)}</a></li>
          {/each}
        </ul>
      {/if}
      <p class="muted">{$t('card.reference')}</p>
    </section>
  {/if}

  <footer>
    <div class="marks">
      <button
        class="mark"
        class:on={mark === 'dived'}
        aria-pressed={mark === 'dived'}
        onclick={() => setMark(site.id, mark === 'dived' ? null : 'dived')}
      >
        {$t('footprint.dived')}
      </button>
      <button
        class="mark wish"
        class:on={mark === 'wish'}
        aria-pressed={mark === 'wish'}
        onclick={() => setMark(site.id, mark === 'wish' ? null : 'wish')}
      >
        {$t('footprint.wish')}
      </button>
    </div>
    <button class="primary" onclick={copyLink}>{copied ? $t('card.copied') : $t('card.copyLink')}</button>
    {#if copyFailed}
      <p class="muted">{$t('card.longPressCopy')}</p>
      <input class="url" readonly value={shareUrl()} onclick={(e) => e.currentTarget.setSelectionRange(0, 9999)} />
    {/if}
  </footer>
</aside>

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
  header {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-bottom: 12px;
    padding-right: 36px;
  }
  .hero {
    width: 84px;
    height: 84px;
    object-fit: contain;
    flex: none;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 22px;
    letter-spacing: 0.01em;
  }
  .sub {
    margin: 0;
    color: var(--ink-soft);
    font-size: 13px;
  }
  .badge {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--sun);
    color: var(--ocean-deep);
    font-size: 11px;
    font-weight: 600;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 3px;
  }
  .m {
    text-align: center;
    font-size: 10px;
    padding: 6px 0;
    border-radius: 6px;
    background: var(--paper-2);
    color: var(--ink-soft);
  }
  .m.best {
    background: var(--ocean-shallow);
    color: var(--ocean-deep);
    font-weight: 600;
  }
  .m.current {
    outline: 2px solid var(--coral);
    outline-offset: -2px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 4px 12px 4px 4px;
    border-radius: 999px;
    background: var(--paper-2);
    font-size: 13px;
  }
  .chip[aria-expanded='true'] {
    box-shadow: inset 0 0 0 2px var(--coral);
  }
  .chip img {
    width: 32px;
    height: 32px;
    object-fit: contain;
  }
  .disc {
    display: block;
    flex: none;
    border-radius: 50%;
    background: var(--line);
  }
  .chip .disc {
    width: 20px;
    height: 20px;
    margin: 0 6px; /* same 32 px slot as a thumbnail */
  }
  /* Expands by animating its one grid row 0fr → 1fr; app.css drops the animation for reduced motion. */
  .sp-wrap {
    display: grid;
    grid-template-rows: 1fr;
    margin-top: 8px;
    overflow: hidden;
    animation: sp-open 0.18s ease-out;
  }
  @keyframes sp-open {
    from {
      grid-template-rows: 0fr;
      opacity: 0;
    }
  }
  .sp {
    position: relative;
    min-height: 0;
    padding: 12px 14px 14px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--paper);
  }
  .sp-close {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 20px;
    color: var(--ink-soft);
    background: var(--paper-2);
  }
  .sp-img {
    display: block;
    width: 100%;
    height: 160px; /* fixed box: no reflow when the image arrives */
    object-fit: contain;
  }
  .sp .disc {
    width: 48px;
    height: 48px;
  }
  h4 {
    margin: 10px 0 0;
    padding-right: 36px;
    font-size: 18px;
  }
  h4 small {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-soft);
  }
  .sci {
    margin: 2px 0 0;
    font-size: 13px;
    font-style: italic;
    color: var(--ink-soft);
  }
  .len {
    margin: 8px 0 0;
    font-size: 14px;
    font-weight: 600;
  }
  .len span {
    margin-right: 4px;
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-soft);
  }
  .blurb {
    margin: 8px 0 0;
    font-size: 13px;
    line-height: 1.6;
  }
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 14px;
    margin-top: 14px;
  }
  .facts div {
    display: contents;
  }
  dt {
    font-size: 11px;
    color: var(--ink-soft);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .facts > div:nth-child(n + 3) {
    grid-column: span 2;
  }
  .summary {
    margin: 14px 0 0;
    line-height: 1.6;
    font-size: 14px;
  }
  .highlights {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    line-height: 1.55;
  }
  .sources ul {
    margin: 0;
    padding-left: 18px;
    font-size: 12px;
  }
  .sources a {
    display: inline-block;
    padding: 9px 0; /* ≥ 40 px tap rows: a mis-tap here leaves the app for an external site */
  }
  .muted {
    color: var(--ink-soft);
    font-size: 12px;
    margin: 8px 0 0;
  }
  footer {
    margin-top: 16px;
  }
  .marks {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .mark {
    flex: 1;
    height: 44px;
    border-radius: 10px;
    background: var(--paper-2);
    color: var(--ink);
    font-weight: 600;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .mark.on {
    background: var(--coral);
    color: #fff;
  }
  .mark.wish.on {
    background: var(--sun);
    color: var(--ocean-deep);
  }
  .primary {
    width: 100%;
    padding: 11px;
    border-radius: 10px;
    background: var(--coral);
    color: #fff;
    font-weight: 600;
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
</style>
