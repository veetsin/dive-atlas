<script lang="ts">
  import { t } from '../lib/i18n';
  import { theme, toggleTheme } from '../lib/stores';
</script>

<button class="theme" onclick={toggleTheme} aria-pressed={$theme === 'night'}>
  {$theme === 'day' ? $t('theme.night') : $t('theme.day')}
</button>

<style>
  .theme {
    height: 40px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--glass);
    color: var(--ink);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .theme:hover {
    background: var(--paper);
  }
</style>
