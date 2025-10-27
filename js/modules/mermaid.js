(function registerMermaidModule(global) {
  'use strict';

  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  const MERMAID_FENCE = /```mermaid\s*([\s\S]*?)```/i;

  const parseResponse = (content = '') => {
    const match = content.match(MERMAID_FENCE);
    if (match) {
      const beforeText = content.substring(0, match.index).trim();
      const afterText = content.substring(match.index + match[0].length).trim();
      const code = match[1].trim();
      return {
        code,
        beforeText,
        afterText
      };
    }
    return {
      code: '',
      beforeText: content.trim(),
      afterText: ''
    };
  };

  global.ModuleRegistry.register({
    id: 'mermaid',
    label: 'Mermaid 图示',
    icon: 'ph:circles-three-plus-duotone',
    renderer: 'mermaid',
    promptKey: 'mermaid',
    storageNamespace: 'module:mermaid',
    chat: {
      placeholder: '描述你想生成的流程图、时序图或思维导图…',
      streamStartToken: '```mermaid',
      contextWindow: 8
    },
    artifact: {
      type: 'mermaid',
      fence: 'mermaid',
      startPattern: /```mermaid/i,
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
      placeholderText: '生成的 Mermaid 图示将在此处显示'
    }
  });
})(window);
