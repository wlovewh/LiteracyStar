import { onMounted, onBeforeUnmount, ref } from 'vue';
import { cheatApi } from '@/api';

/**
 * 答题防作弊 (project.md 7.4 防复制 / 7.5 切屏检测)
 *
 * 防复制：禁用 copy / cut / contextmenu / dragstart / selectstart
 * 切屏检测：监听 visibilitychange 与 blur，累计次数与时长；
 *          超过阈值（3 次或累计 30 秒）时上报 cheat_logs。
 */
export function useAntiCheat(stageId, options = {}) {
  const maxSwitchCount = options.maxSwitchCount ?? 3;
  const maxSwitchSeconds = options.maxSwitchSeconds ?? 30;

  const switchCount = ref(0);
  const switchSeconds = ref(0);
  const reported = ref(false);

  let hiddenAt = 0;
  let disposed = false;

  // ---------------- 防复制 ----------------
  const blockEvent = (e) => {
    e.preventDefault();
    return false;
  };

  const blockSelectStart = (e) => {
    // 允许输入框内的选择，避免影响正常作答
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
    e.preventDefault();
    return false;
  };

  // ---------------- 切屏检测 ----------------
  const handleVisibility = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      switchCount.value += 1;
    } else if (hiddenAt) {
      const secs = Math.round((Date.now() - hiddenAt) / 1000);
      switchSeconds.value += secs;
      hiddenAt = 0;
      report('切屏', secs);
    }
    checkThreshold();
  };

  const handleBlur = () => {
    // visibilitychange 已覆盖的场景不重复计数
    if (!document.hidden) {
      switchCount.value += 1;
      report('窗口失焦', 0);
    }
    checkThreshold();
  };

  async function report(eventType, duration) {
    if (!stageId) return;
    try {
      await cheatApi.report({ stageId: Number(stageId), eventType, duration });
    } catch (e) {
      /* 上报失败不打断答题 */
    }
  }

  function checkThreshold() {
    if (reported.value) return;
    if (switchCount.value >= maxSwitchCount || switchSeconds.value >= maxSwitchSeconds) {
      reported.value = true;
      report('超过阈值', switchSeconds.value);
    }
  }

  onMounted(() => {
    document.body.classList.add('exam-mode');

    document.addEventListener('copy', blockEvent);
    document.addEventListener('cut', blockEvent);
    document.addEventListener('contextmenu', blockEvent);
    document.addEventListener('dragstart', blockEvent);
    document.addEventListener('selectstart', blockSelectStart);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
  });

  onBeforeUnmount(() => {
    disposed = true;
    document.body.classList.remove('exam-mode');

    document.removeEventListener('copy', blockEvent);
    document.removeEventListener('cut', blockEvent);
    document.removeEventListener('contextmenu', blockEvent);
    document.removeEventListener('dragstart', blockEvent);
    document.removeEventListener('selectstart', blockSelectStart);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('blur', handleBlur);
  });

  return { switchCount, switchSeconds, reported, disposed };
}
