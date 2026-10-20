<script lang="ts">
  import { t } from '../lib/i18n';
  import { toggleLang } from '../lib/stores';
</script>

<button class="lang" onclick={toggleLang}>
  {$t('nav.lang')}
</button>

<style>
  .lang {
    height: 36px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--glass);
    color: var(--ink);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .lang:hover {
    background: var(--paper);
  }
</style>
