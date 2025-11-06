(function registerOnepageModule(global) {
  'use strict';

  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  const HTML_FENCE = /```(?:html|htm)?\s*([\s\S]*?)```/i;
  const START_PATTERN = /```(?:html|htm)/i;

  const parseResponse = (content = '') => {
    const text =
      typeof content === 'string' ? content : String(content || '');
    const match = text.match(HTML_FENCE);
    if (match) {
      const beforeText = text.substring(0, match.index).trim();
      const afterText = text
        .substring(match.index + match[0].length)
        .trim();
      return {
        htmlContent: match[1].trim(),
        beforeText,
        afterText
      };
    }
    const fallback = text.trim();
    if (!fallback) {
      return {
        htmlContent: '',
        beforeText: '',
        afterText: ''
      };
    }
    const htmlIndex = text.search(/<!DOCTYPE|<html|<body/i);
    if (htmlIndex !== -1) {
      return {
        htmlContent: text.substring(htmlIndex).trim(),
        beforeText: text.substring(0, htmlIndex).trim(),
        afterText: ''
      };
    }
    return {
      htmlContent: fallback,
      beforeText: '',
      afterText: ''
    };
  };

  global.ModuleRegistry.register({
    id: 'onepage',
    label: '落地页生成',
    icon: 'ph:browser-duotone',
    renderer: 'html',
    promptKey: 'onepage',
    storageNamespace: 'module:onepage',
    chat: {
      placeholder:
        '请输入品牌定位、目标客群、核心卖点等信息，我会生成完整的落地页 HTML…',
      streamStartToken: '```html',
      contextWindow: 6
    },
    artifact: {
      type: 'html',
      fence: 'html',
      startPattern: START_PATTERN,
      parser: parseResponse
    },
    hooks: {},
    exports: {
      allowSvg: false,
      allowPng: false,
      allowClipboard: false,
      allowCode: true
    },
    ui: {
      placeholderText: '生成的落地页预览将在此处显示',
      quickActions: [
        { label: 'SaaS 产品页', value: '为 B2B SaaS 产品生成官方落地页；' },
        { label: '新品发布', value: '为科技新品发布会设计预告落地页；' },
        { label: '在线课程', value: '为在线课程制作报名落地页；' },
        { label: '活动报名', value: '为线下品牌活动创建报名落地页；' }
      ]
    }
  });
})(window);
