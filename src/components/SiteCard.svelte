<script lang="ts">
  import { t, tx, MONTH_KEYS } from '../lib/i18n';
  import { month, shareUrl } from '../lib/stores';
  import { speciesById, regionById, spriteUrl } from '../lib/data';
  import { copyText } from '../lib/clipboard';
  import type { DiveSite } from '../lib/types';

  // App.svelte wraps this in {#key site.id}, so transient state resets per site for free.
  let { site, onclose }: { site: DiveSite; onclose: () => void } = $props();

  let copied = $state(false);
  let copyFailed = $state(false);
  let heroBroken = $state(false);

  const heroSprite = $derived.by(() => {
    const first = site.species[0];
    return first ? speciesById.get(first)?.sprite : undefined;
  });

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
        src={spriteUrl(heroSprite, 512)}
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
        <span class="chip">{sp ? $tx(sp.name) : id}</span>
      {/each}
    </div>
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

  <section>
    <p class="summary">{$tx(site.summary)}</p>
    {#if site.highlights?.length}
      <h3>{$t('card.highlights')}</h3>
      <ul class="highlights">
        {#each site.highlights as h}<li>{$tx(h)}</li>{/each}
      </ul>
    {/if}
  </section>

  <section class="sources">
    <h3>{$t('card.sources')}</h3>
    {#if site.sources.length}
      <ul>
        {#each site.sources as url}
          <li><a href={url} target="_blank" rel="noopener noreferrer">{new URL(url).hostname}</a></li>
        {/each}
      </ul>
    {/if}
    <p class="muted">{$t('card.reference')}</p>
  </section>

  <footer>
    <button class="primary" onclick={copyLink}>{copied ? $t('card.copied') : $t('card.copyLink')}</button>
    {#if copyFailed}
      <p class="muted">{$t('card.longPressCopy')}</p>
      <input class="url" readonly value={shareUrl()} onfocus={(e) => e.currentTarget.select()} />
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
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--paper-2);
    font-size: 13px;
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
