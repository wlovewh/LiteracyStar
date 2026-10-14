<template>
  <div class="site-icon">
    <img v-if="src && !failed" :src="src" :alt="name" @error="failed = true" />
    <span v-else>{{ initial }}</span>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  name: { type: String, default: '' },
  url: { type: String, default: '' },
  iconUrl: { type: String, default: '' }
});

const failed = ref(false);

/** 优先使用管理员上传的图标，否则回退到站点 favicon */
const src = computed(() => {
  if (props.iconUrl) return props.iconUrl;
  if (!props.url) return '';
  try {
    const u = new URL(props.url);
    return u.origin + '/favicon.ico';
  } catch (e) {
    return '';
  }
});

const initial = computed(() => (props.name || '?').trim().charAt(0));
</script>
