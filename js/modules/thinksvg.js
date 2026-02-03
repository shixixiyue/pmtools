/**
 * 思维导图模块
 *
 * 功能：基于用户输入生成 SVG 格式的思维导图
 * 特性：
 * - 支持多层级树形结构展示
 * - 通过提示词引导 AI 生成布局和样式
 * - 支持 SVG/PNG 导出
 * - 历史记录持久化
 */

(function registerThinkSvgModule(global) {
  'use strict';

  // 确保 ModuleRegistry 已初始化
  if (!global.ModuleRegistry) {
    throw new Error('ModuleRegistry 未初始化');
  }

  /**
   * 解析 AI 响应，提取 SVG 内容
   * @param {string} content - AI 返回的原始内容
   * @returns {Object} 解析结果对象，包含 svgContent、beforeText、afterText 等字段
   */
  const parseResponse = (content) => Utils.parseSVGResponse(content);

  // 注册思维导图模块
  global.ModuleRegistry.register({
    // 模块标识
    id: 'thinksvg',

    // 显示名称
    label: '思维导图',

    // 图标（使用 Phosphor Icons 的树形结构图标）
    icon: 'ph:tree-structure-duotone',

    // 渲染器类型
    renderer: 'svg',

    // 提示词键名（对应 prompts/thinksvg-prompt.txt）
    promptKey: 'thinksvg',

    // 本地存储命名空间
    storageNamespace: 'module:thinksvg',

    // 聊天配置
    chat: {
      // 输入框占位符
      placeholder: '输入要梳理的主题或问题，我来生成思维导图…',

      // 流式响应开始标记
      streamStartToken: '```svg',

      // 上下文窗口大小（保留最近 10 条消息）
      contextWindow: 10
    },

    // 产物配置
    artifact: {
      // 产物类型
      type: 'svg',

      // 代码围栏标识
      fence: 'svg',

      // SVG 开始模式匹配（兼容 ```svg、```xml、``` xml 等格式）
      startPattern: /```\s*(?:svg|xml)?\s*<svg/i,

      // 内容解析器
      parser: parseResponse
    },

    // 生命周期钩子（预留扩展）
    hooks: {},

    // 导出功能配置
    exports: {
      // 允许导出为 SVG 文件
      allowSvg: true,

      // 允许导出为 PNG 图片
      allowPng: true,

      // 允许复制到剪贴板
      allowClipboard: true,

      // 允许查看源代码
      allowCode: true
    },

    // UI 配置
    ui: {
      // 预览区占位文本
      placeholderText: '生成的思维导图将在此处显示'
    }
  });
})(window);
