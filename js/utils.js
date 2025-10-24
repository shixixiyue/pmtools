/**
 * 工具函数集合
 */

// HTML转义，防止XSS攻击
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 滚动到指定元素的底部
function scrollToBottom(element) {
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

// 生成唯一ID
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 解析SVG响应，提取SVG内容和前后文本，容错缺失的结束反引号
function parseSVGResponse(response = '') {
  const content = typeof response === 'string' ? response : String(response || '');
  const svgFenceRegex = /```(?:svg)?\s*([\s\S]*?)```/i;
  const fenceMatch = content.match(svgFenceRegex);

  if (fenceMatch) {
    const svgBody = fenceMatch[1].trim();
    const beforeText = content.substring(0, fenceMatch.index).trim();
    let afterText = content.substring(fenceMatch.index + fenceMatch[0].length).trim();
    afterText = afterText.replace(/^\s*```/, '').trim();

    return {
      svgContent: svgBody,
      beforeText,
      afterText
    };
  }

  // 兼容缺失结束反引号的情况
  const svgStartRegex = /```(?:svg)?\s*<svg[\s\S]*$/i;
  const startMatch = content.match(svgStartRegex);

  if (startMatch) {
    const startIndex = startMatch.index;
    const beforeText = content.substring(0, startIndex).trim();
    let svgSection = content.substring(startIndex).replace(/```(?:svg)?\s*/i, '').trim();

    // 去掉尾部残留的反引号
    svgSection = svgSection.replace(/```$/, '').trim();

    // 拆分 SVG 正文与额外文本
    let afterText = '';
    const svgEndIndex = svgSection.lastIndexOf('</svg>');
    if (svgEndIndex !== -1) {
      afterText = svgSection.substring(svgEndIndex + 6).replace(/```/, '').trim();
      svgSection = svgSection.substring(0, svgEndIndex + 6).trim();
    }

    // 补齐缺失的结束标签
    if (svgSection && !svgSection.endsWith('</svg>')) {
      svgSection += '\n</svg>';
    }

    return {
      svgContent: svgSection || null,
      beforeText,
      afterText
    };
  }

  return {
    svgContent: null,
    beforeText: content.trim(),
    afterText: ''
  };
}

// 下载文件
function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 显示状态信息
function showStatus(element, message, type = 'info') {
  if (!element) return;
  
  element.classList.remove('hidden');
  element.textContent = message;
  
  // 移除所有状态类
  element.classList.remove('border-gray-300', 'bg-gray-50', 'text-gray-600');
  element.classList.remove('border-green-500', 'bg-green-50', 'text-green-700');
  element.classList.remove('border-red-500', 'bg-red-50', 'text-red-700');
  element.classList.remove('border-blue-500', 'bg-blue-50', 'text-blue-700');
  
  // 根据类型添加相应的样式类
  switch (type) {
    case 'success':
      element.classList.add('border-green-500', 'bg-green-50', 'text-green-700');
      break;
    case 'error':
      element.classList.add('border-red-500', 'bg-red-50', 'text-red-700');
      break;
    case 'loading':
      element.classList.add('border-blue-500', 'bg-blue-50', 'text-blue-700');
      break;
    default:
      element.classList.add('border-gray-300', 'bg-gray-50', 'text-gray-600');
  }
}

// 本地存储操作
const storage = {
  // 保存数据到本地存储
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('保存到本地存储失败:', error);
      return false;
    }
  },
  
  // 从本地存储获取数据
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('从本地存储获取数据失败:', error);
      return defaultValue;
    }
  },
  
  // 删除本地存储中的数据
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('删除本地存储数据失败:', error);
      return false;
    }
  }
};

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 格式化日期时间
function formatDateTime(date = new Date()) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// 深拷贝对象
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

// 检查对象是否为空
function isEmpty(obj) {
  if (obj == null) return true;
  if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

// 自动调整文本域高度
function autoResizeTextarea(textarea) {
  if (!textarea) return;
  
  // 重置高度以获取正确的scrollHeight
  textarea.style.height = 'auto';
  
  // 计算新高度，限制最大高度
  const newHeight = Math.min(textarea.scrollHeight, 120); // 最大120px（约5行）
  textarea.style.height = newHeight + 'px';
}

// 流式文本处理
class StreamProcessor {
  constructor(onChunk, onComplete) {
    this.onChunk = onChunk;
    this.onComplete = onComplete;
    this.buffer = '';
    this.completed = false;
  }

  complete(info = {}) {
    if (this.completed) return;
    this.completed = true;
    if (typeof this.onComplete === 'function') {
      this.onComplete(info);
    }
  }

  // 处理数据块
  processChunk(chunk) {
    this.buffer += chunk;
    
    // 尝试解析完整的JSON行
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // 保留不完整的行
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          // 处理SSE格式
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              this.complete({ aborted: false });
              return;
            }
            
            const parsed = JSON.parse(data);
            this.onChunk(parsed);
          }
        } catch (error) {
          console.warn('解析流数据失败:', error, line);
        }
      }
    }
  }
}

// 创建流式请求
function createStreamRequest(url, options, onChunk, onComplete) {
  const processor = new StreamProcessor(onChunk, onComplete);
  const controller = new AbortController();

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...options.headers,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        processor.processChunk(chunk);
        if (processor.completed) {
          break;
        }
      }

      if (!processor.completed) {
        processor.complete({ aborted: false });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        processor.complete({ aborted: true });
        return;
      }
      throw error;
    }
  })();

  return {
    cancel: () => controller.abort(),
    finished: fetchPromise
  };
}

// 导出工具函数
window.Utils = {
  escapeHtml,
  scrollToBottom,
  generateId,
  parseSVGResponse,
  downloadFile,
  showStatus,
  storage,
  debounce,
  throttle,
  formatDateTime,
  deepClone,
  isEmpty,
  autoResizeTextarea,
  StreamProcessor,
  createStreamRequest
};
