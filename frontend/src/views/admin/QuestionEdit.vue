<template>
  <div v-loading="loading">
    <div class="page-header">
      <h2 class="page-title">{{ isNew ? '新增题目' : '编辑题目' }}</h2>
      <div class="toolbar">
        <el-button :icon="ArrowLeft" @click="router.push('/admin/questions')">返回列表</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="handleSave">保存</el-button>
      </div>
    </div>

    <div class="app-card">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="题型" prop="type">
          <el-radio-group v-model="form.type" @change="onTypeChange">
            <el-radio :label="1">单选题</el-radio>
            <el-radio :label="2">多选题</el-radio>
            <el-radio :label="3">判断题</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="题干" prop="content">
          <el-input v-model="form.content" type="textarea" :rows="3" placeholder="请输入题干" />
        </el-form-item>

        <!-- 判断题自动生成正确/错误选项 (project.md 5.2) -->
        <template v-if="form.type === 3">
          <el-alert type="info" :closable="false" show-icon class="type-alert" title="判断题自动生成「正确 / 错误」两个选项，正确答案请选择 A 或 B。" />
          <el-form-item label="选项A">
            <el-input v-model="form.option_a" disabled />
          </el-form-item>
          <el-form-item label="选项B">
            <el-input v-model="form.option_b" disabled />
          </el-form-item>
        </template>

        <template v-else>
          <el-form-item v-for="(letter, i) in ['A','B','C','D','E','F']" :key="letter" :label="'选项' + letter">
            <el-input v-model="form['option_' + letter.toLowerCase()]" :placeholder="i < 2 ? '必填' : '选填'" />
          </el-form-item>
        </template>

        <el-form-item label="正确答案" prop="answer">
          <el-radio-group v-if="form.type === 1 || form.type === 3" v-model="form.answer">
            <el-radio v-for="l in singleLetters" :key="l" :label="l">{{ l }}</el-radio>
          </el-radio-group>
          <el-checkbox-group v-else v-model="multipleAnswer">
            <el-checkbox v-for="l in singleLetters" :key="l" :label="l">{{ l }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="解析">
          <el-input v-model="form.analysis" type="textarea" :rows="3" placeholder="请输入答案解析" />
        </el-form-item>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="知识模块">
              <el-input v-model="form.module" placeholder="如：信息检索" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="难度">
              <el-rate v-model="form.difficulty" :max="5" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="来源">
              <el-input v-model="form.source" placeholder="如：示例题库" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="标签">
          <el-input v-model="form.tags" placeholder="多个标签用逗号分隔" />
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check } from '@element-plus/icons-vue';
import { questionApi } from '@/api';

const route = useRoute();
const router = useRouter();

const isNew = computed(() => route.params.id === 'new');

const loading = ref(false);
const saving = ref(false);
const formRef = ref();

const form = reactive({
  type: 1, content: '', option_a: '', option_b: '', option_c: '', option_d: '', option_e: '', option_f: '',
  answer: '', analysis: '', module: '', difficulty: 3, source: '', tags: ''
});

const multipleAnswer = ref([]);

// 多选题答案以数组形式绑定，保存时拼接
watch(multipleAnswer, (val) => {
  if (form.type === 2) form.answer = [...val].sort().join('');
});

const singleLetters = computed(() => {
  const letters = [];
  ['a', 'b', 'c', 'd', 'e', 'f'].forEach((k, i) => {
    const v = form['option_' + k];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      letters.push(String.fromCharCode(65 + i));
    }
  });
  // 判断题固定 A/B
  if (form.type === 3) return ['A', 'B'];
  return letters.length ? letters : ['A', 'B', 'C', 'D'];
});

function onTypeChange() {
  if (form.type === 3) {
    form.option_a = form.option_a || '正确';
    form.option_b = form.option_b || '错误';
    form.option_c = ''; form.option_d = ''; form.option_e = ''; form.option_f = '';
    form.answer = '';
  } else {
    if (form.option_a === '正确' && form.option_b === '错误') {
      form.option_a = ''; form.option_b = '';
    }
    form.answer = '';
    multipleAnswer.value = [];
  }
}

const rules = {
  content: [{ required: true, message: '请输入题干', trigger: 'blur' }],
  answer: [{ required: true, message: '请选择正确答案', trigger: 'change' }]
};

async function load() {
  if (isNew.value) return;
  loading.value = true;
  try {
    const data = await questionApi.get(route.params.id);
    Object.assign(form, data);
    if (data.type === 2) multipleAnswer.value = String(data.answer).split('');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  if (form.type === 2) form.answer = [...multipleAnswer.value].sort().join('');
  if (!form.answer) {
    ElMessage.warning('请选择正确答案');
    return;
  }

  saving.value = true;
  try {
    if (isNew.value) await questionApi.create({ ...form });
    else await questionApi.update(route.params.id, { ...form });
    ElMessage.success('保存成功');
    router.push('/admin/questions');
  } catch (e) {
    /* 拦截器已提示 */
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.type-alert {
  margin-bottom: 18px;
  border-radius: var(--r-btn);
}
</style>
