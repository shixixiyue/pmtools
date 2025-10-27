(function registerProductCanvasModule(global) {
  'use strict';

  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  const parseResponse = (content) => Utils.parseSVGResponse(content);

  global.ModuleRegistry.register({
    id: 'product-canvas',
    label: '产品画布',
    icon: 'ph:pen-nib-duotone',
    renderer: 'svg',
    promptKey: 'canvas',
    storageNamespace: 'module:product-canvas',
    chat: {
      placeholder: '描述你的产品定位、用户画像、价值主张等内容…',
      streamStartToken: '```svg',
      contextWindow: 10
    },
    artifact: {
      type: 'svg',
      fence: 'svg',
      startPattern: /```(?:svg)?\s*<svg/i,
      parser: parseResponse
    },
    hooks: {
      onActivate() {
        // 保留扩展点，后续可追加自定义逻辑
      }
    },
    exports: {
      allowSvg: true,
      allowPng: true,
      allowClipboard: true,
      allowCode: true
    },
    ui: {
      placeholderText: '生成的产品画布将在此处显示'
    }
  });
})(window);
