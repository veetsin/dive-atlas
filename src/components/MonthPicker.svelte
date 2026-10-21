<script lang="ts">
  import { t, MONTH_KEYS } from '../lib/i18n';
  import { month } from '../lib/stores';

  let el: HTMLDivElement | undefined = $state();
  // A deep-linked month can sit off-screen in the scrolling strip; bring it into view once.
  $effect(() => {
    el?.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
</script>

<div class="months" role="radiogroup" aria-label={$t('card.bestSeason')} bind:this={el}>
  <button
    class="m"
    class:active={$month === 0}
    role="radio"
    aria-checked={$month === 0}
    onclick={() => month.set(0)}
  >
    {$t('month.all')}
  </button>
  {#each MONTH_KEYS as key, i}
    {@const m = i + 1}
    <button
      class="m"
      class:active={$month === m}
      role="radio"
      aria-checked={$month === m}
      onclick={() => month.set($month === m ? 0 : m)}
    >
      {$t(key)}
    </button>
  {/each}
</div>

<style>
  .months {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--glass);
    overflow-x: auto;
    scrollbar-width: none;
    max-width: 100%;
  }
  .months::-webkit-scrollbar {
    display: none;
  }
  .m {
    flex: none;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .m:hover {
    background: var(--paper-2);
    color: var(--ink);
  }
  .m.active {
    background: var(--coral);
    color: #fff;
  }
</style>
