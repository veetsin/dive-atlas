<script lang="ts">
  import { tick } from 'svelte';
  import { t, MONTH_KEYS } from '../lib/i18n';
  import { month } from '../lib/stores';

  /** Collapsed: one pill with the current choice. Expanded: that pill (now just a caret) + the strip. */
  let open = $state(false);
  let el: HTMLDivElement | undefined = $state();
  let pill: HTMLButtonElement | undefined = $state();
  const current = $derived($month ? $t(MONTH_KEYS[$month - 1]!) : $t('month.all'));

  async function expand() {
    open = true;
    await tick();
    // the chosen month can sit off-screen in the scrolling strip
    const active = el?.querySelector<HTMLElement>('.active');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
    active?.focus({ preventScroll: true });
  }
  function collapse(refocus = true) {
    open = false;
    if (refocus) tick().then(() => pill?.focus({ preventScroll: true }));
  }
  function choose(m: number) {
    month.set(m);
    collapse();
  }
</script>

<svelte:window
  onpointerdowncapture={(e) => {
    if (open && !el?.contains(e.target as Node)) collapse(false);
  }}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="months"
  class:open
  bind:this={el}
  onkeydown={(e) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation(); // only the strip: App's Escape would close the card too
    collapse();
  }}
>
  <button
    class="toggle"
    class:active={!open && $month !== 0}
    bind:this={pill}
    aria-expanded={open}
    aria-label={`${$t('card.bestSeason')} · ${current}`}
    onclick={() => (open ? collapse() : expand())}
  >
    {#if !open}<span>{current}</span>{/if}
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" class:up={open}>
      <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  {#if open}
    <div class="strip" role="radiogroup" aria-label={$t('card.bestSeason')}>
      <button class="m" class:active={$month === 0} role="radio" aria-checked={$month === 0} onclick={() => choose(0)}>
        {$t('month.all')}
      </button>
      {#each MONTH_KEYS as key, i}
        {@const m = i + 1}
        <button class="m" class:active={$month === m} role="radio" aria-checked={$month === m} onclick={() => choose($month === m ? 0 : m)}>
          {$t(key)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .months {
    display: flex;
    flex: none;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--glass);
    max-width: 100%;
  }
  /* collapsed it is one 40 px pill like its neighbours, not a pill in a tray */
  .months:not(.open) {
    padding: 0;
  }
  .months.open {
    flex: 0 1 auto;
    min-width: 0;
  }
  .strip {
    display: flex;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .strip::-webkit-scrollbar {
    display: none;
  }
  .toggle,
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
  .toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--ink);
  }
  .months:not(.open) .toggle {
    padding: 0 14px;
    font-size: 13px;
    font-weight: 700;
  }
  .open .toggle {
    padding: 0;
  }
  .toggle svg {
    transition: transform 0.15s ease;
  }
  .toggle svg.up {
    transform: rotate(180deg);
  }
  .toggle:hover,
  .m:hover {
    background: var(--paper-2);
    color: var(--ink);
  }
  .toggle.active,
  .m.active {
    background: var(--coral);
    color: #fff;
  }
</style>
