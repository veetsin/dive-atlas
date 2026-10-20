<script lang="ts">
  import { t, tx } from '../lib/i18n';
  import { openSite } from '../lib/stores';
  import { searchSites, regionById } from '../lib/data';

  let { onclose }: { onclose: () => void } = $props();

  let query = $state('');
  let input: HTMLInputElement | undefined = $state();
  const results = $derived(searchSites(query));

  $effect(() => {
    input?.focus();
  });

  function pick(id: string) {
    openSite(id);
    onclose();
  }
</script>

<aside class="card" aria-label={$t('nav.search')}>
  <button class="close" onclick={onclose} aria-label={$t('card.close')}>×</button>
  <h2>{$t('nav.search')}</h2>
  <input
    bind:this={input}
    bind:value={query}
    type="search"
    placeholder={$t('search.placeholder')}
    autocomplete="off"
    enterkeyhint="search"
    onkeydown={(e) => {
      // Enter that merely commits a pinyin IME composition must not pick a result.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter' && results[0]) pick(results[0].id);
      if (e.key === 'Escape') onclose();
    }}
  />
  {#if query.trim() && results.length === 0}
    <p class="muted">{$t('search.empty')}</p>
  {:else}
    <ul>
      {#each results as s (s.id)}
        <li>
          <button class="row" onclick={() => pick(s.id)}>
            <span class="name">{$tx(s.name)}</span>
            <span class="sub">{$tx(s.country)} · {$tx(regionById.get(s.region)?.name)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .card {
    position: relative;
    background: var(--paper);
    color: var(--ink);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px 20px 12px;
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
  input {
    width: 100%;
    height: 44px;
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper-2);
    color: var(--ink);
    font: inherit;
    font-size: 16px; /* ≥ 16px keeps iOS from zooming the page on focus */
  }
  input:focus {
    outline: 2px solid var(--coral);
    outline-offset: -1px;
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
  }
  .row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    min-height: 44px;
    padding: 8px 10px;
    border-radius: 8px;
    text-align: left;
  }
  .row:hover,
  .row:focus-visible {
    background: var(--paper-2);
  }
  .name {
    font-weight: 600;
    font-size: 15px;
  }
  .sub {
    font-size: 12px;
    color: var(--ink-soft);
  }
  .muted {
    color: var(--ink-soft);
    font-size: 12px;
    margin: 10px 0 0;
  }
</style>
