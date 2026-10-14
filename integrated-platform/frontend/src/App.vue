<template>
  <div class="app-page">
    <AppNav />
    <router-view v-slot="{ Component }">
      <component :is="Component" />
    </router-view>
    <AppFooter />
  </div>
</template>

<script setup>
import AppNav from '@/components/AppNav.vue';
import AppFooter from '@/components/AppFooter.vue';
</script>
