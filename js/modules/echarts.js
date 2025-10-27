(function registerEChartsModule(global) {
  'use strict';

  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  const CODE_FENCE_REGEX = /```(?:json|js|javascript|echarts|option)?\s*([\s\S]*?)```/i;

  const parseOptionText = (text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      try {
        // 尝试处理 JS 对象语法
        // eslint-disable-next-line no-new-func
        return new Function(`return (${text});`)();
      } catch (innerError) {
        console.warn('解析 ECharts 配置失败:', innerError);
        return null;
      }
    }
  };

  const parseResponse = (content) => {
    const match = content.match(CODE_FENCE_REGEX);
    if (match) {
      const optionText = match[1].trim();
      return {
        optionText,
        option: parseOptionText(optionText),
        beforeText: content.substring(0, match.index).trim(),
        afterText: content.substring(match.index + match[0].length).trim()
      };
    }
    return {
      optionText: '',
      option: null,
      beforeText: content.trim(),
      afterText: ''
    };
  };

  global.ModuleRegistry.register({
    id: 'echarts',
    label: 'ECharts 图表',
    icon: 'ph:chart-line-up-duotone',
    renderer: 'echarts',
    promptKey: 'echarts',
    storageNamespace: 'module:echarts',
    chat: {
      placeholder: '描述想生成的图表或调整需求，我会输出 ECharts 配置…',
      streamStartToken: '```json',
      contextWindow: 8
    },
    artifact: {
      type: 'echarts-option',
      fence: ['json', 'js', 'javascript', 'echarts', 'option'],
      startPattern: /```(?:json|js|javascript|echarts|option)/i,
      parser: parseResponse
    },
    hooks: {
      onActivate() {
        // 预留钩子，可在此初始化额外资源
      }
    },
    exports: {
      allowSvg: false,
      allowPng: true,
      allowClipboard: false,
      allowCode: true
    },
    ui: {
      placeholderText: '生成的 ECharts 图表将在此处显示'
    }
  });
})(window);
