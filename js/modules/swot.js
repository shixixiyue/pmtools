(function registerSwotModule(global) {
  'use strict';

  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  const parseResponse = (content) => Utils.parseSVGResponse(content);

  global.ModuleRegistry.register({
    id: 'swot',
    label: 'SWOT分析',
    icon: 'ph:chart-bar-duotone',
    renderer: 'svg',
    promptKey: 'swot',
    storageNamespace: 'module:swot',
    chat: {
      placeholder: '输入业务背景或问题，我来生成 SWOT 分析…',
      streamStartToken: '```svg',
      contextWindow: 10
    },
    artifact: {
      type: 'svg',
      fence: 'svg',
      startPattern: /```(?:svg)?\s*<svg/i,
      parser: parseResponse
    },
    hooks: {},
    exports: {
      allowSvg: true,
      allowPng: true,
      allowClipboard: true,
      allowCode: true
    },
    ui: {
      placeholderText: '生成的SWOT分析将在此处显示'
    }
  });
})(window);
