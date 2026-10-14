/** 秒 -> mm:ss */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

/** 秒 -> 中文描述，如 1分30秒 */
export function humanDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return s + '秒';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec ? m + '分' + sec + '秒' : m + '分钟';
}

/** 日期时间格式化 */
export function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

export const QUESTION_TYPE_LABEL = { 1: '单选', 2: '多选', 3: '判断' };

export const STAGE_STATUS = {
  0: { label: '未开启', type: 'info' },
  1: { label: '已开启', type: 'primary' },
  2: { label: '已结束', type: 'warning' }
};

/** 触发浏览器下载 */
export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * 从响应头的 Content-Disposition 解析文件名。
 * 后端返回的是 ASCII 文件名，直接取值即可。
 */
export function filenameFromHeaders(headers, fallback) {
  const cd = headers && (headers['content-disposition'] || headers['Content-Disposition']);
  if (!cd) return fallback;
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return m ? decodeURIComponent(m[1]) : fallback;
}
