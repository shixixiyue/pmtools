(function (global) {
  'use strict';

  /**
   * 管理模块化对话历史及上下文构建
   */
  class ConversationService {
    constructor(storageService, defaultOptions = {}) {
      if (!storageService) {
        throw new Error('ConversationService 需要 StorageService 实例');
      }
      this.storageService = storageService;
      this.defaultOptions = {
        historyKey: 'history',
        contextWindow: 10,
        ...defaultOptions
      };
      this.cache = new Map();
    }

    _getHistoryKey(moduleConfig) {
      return moduleConfig.storageKeys?.history || this.defaultOptions.historyKey;
    }

    _getNamespace(moduleConfig) {
      const namespace =
        moduleConfig.storageNamespace || `module:${moduleConfig.id}`;
      return this.storageService.namespace(namespace);
    }

    _getCacheKey(moduleId) {
      return `history:${moduleId}`;
    }

    getHistory(moduleConfig) {
      const cacheKey = this._getCacheKey(moduleConfig.id);
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const store = this._getNamespace(moduleConfig);
      const history =
        store.get(this._getHistoryKey(moduleConfig), []).map((msg) => ({
          ...msg
        }));

      this.cache.set(cacheKey, history);
      return history;
    }

    saveHistory(moduleConfig, history) {
      const cacheKey = this._getCacheKey(moduleConfig.id);
      const clonedHistory = history.map((msg) => ({ ...msg }));
      this.cache.set(cacheKey, clonedHistory);

      const store = this._getNamespace(moduleConfig);
      store.set(this._getHistoryKey(moduleConfig), clonedHistory);
    }

    appendMessage(moduleConfig, message) {
      const history = this.getHistory(moduleConfig);
      history.push({ ...message });
      this.saveHistory(moduleConfig, history);
      return history;
    }

    replaceHistory(moduleConfig, history) {
      this.saveHistory(moduleConfig, history);
    }

    clearHistory(moduleConfig) {
      this.saveHistory(moduleConfig, []);
    }

    /**
     * 构建流式上下文，为最后一个用户消息提供所需历史
     */
    buildContext(moduleConfig, tailMessages = null) {
      const history = this.getHistory(moduleConfig);
      if (!history.length) return null;

      let targetIndex = history.length - 1;
      if (tailMessages != null) {
        targetIndex = Math.max(0, history.length - tailMessages);
      }

      // 确保目标是用户消息
      while (targetIndex >= 0 && history[targetIndex].type !== 'user') {
        targetIndex -= 1;
      }

      if (targetIndex < 0) {
        return null;
      }

      const contextWindow =
        moduleConfig.chat?.contextWindow || this.defaultOptions.contextWindow;
      const start = Math.max(0, targetIndex - contextWindow);
      const contextSlice = history.slice(start, targetIndex);

      const contextMessages = contextSlice
        .filter((msg) => msg.type === 'user' || msg.type === 'ai')
        .map((msg) => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));

      return {
        history,
        userMessage: history[targetIndex],
        contextMessages,
        targetIndex
      };
    }
  }

  global.ConversationService = ConversationService;
})(window);
