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
      placeholderText: '生成的 Mermaid 图示将在此处显示',
      quickActions: [
        { label: '流程图', value: '使用flowchart视图;' },
        { label: '序列图', value: '使用sequenceDiagram视图;' },
        { label: '类图', value: '使用classDiagram视图;' },
        { label: '状态图', value: '使用stateDiagram-v2视图;' },
        { label: 'ER图', value: '使用erDiagram视图;' },
        { label: '甘特图', value: '使用gantt视图;' }
      ]
    }
  });
})(window);
