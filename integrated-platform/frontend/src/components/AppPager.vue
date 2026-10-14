<template>
  <el-pagination
    v-if="total > 0"
    background
    layout="total, prev, pager, next, sizes"
    :total="total"
    :current-page="page"
    :page-size="pageSize"
    :page-sizes="[10, 20, 50, 100]"
    @current-change="$emit('update:page', $event)"
    @size-change="$emit('update:pageSize', $event)"
  />
</template>

<script setup>
defineProps({
  total: { type: Number, default: 0 },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 }
});
defineEmits(['update:page', 'update:pageSize']);
</script>
