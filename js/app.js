(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.apiClient) {
      console.error('APIClient 未初始化，无法启动应用');
      return;
    }

    try {
      const storageService = new StorageService('tool-engine');
      const conversationService = new ConversationService(storageService);
      const moduleRuntime = new ModuleRuntime({
        registry: ModuleRegistry,
        storageService,
        conversationService
      });

      window.app = new AppShell({
        apiClient: window.apiClient,
        moduleRuntime
      });
    } catch (error) {
      console.error('初始化应用失败:', error);
    }
  });
})();
