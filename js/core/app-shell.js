(function (global) {
  'use strict';

  const STREAM_DEFAULT_OPTIONS = {
    maxTokens: 13000,
    temperature: 0.7
  };

  class AppShell {
    constructor({ apiClient, moduleRuntime }) {
      if (!apiClient) throw new Error('AppShell 初始化失败：缺少 apiClient');
      if (!moduleRuntime)
        throw new Error('AppShell 初始化失败：缺少 moduleRuntime');

      this.apiClient = apiClient;
      this.runtime = moduleRuntime;
      this.conversationService = moduleRuntime.getConversationService();

      this.el = {};
      this.moduleButtons = new Map();
      this.copyClipboardSupported =
        typeof ClipboardItem !== 'undefined' && !!navigator.clipboard;

      const deviceScale =
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      this.imageExportScale = Math.min(4, Math.max(2, deviceScale));

      this.isProcessing = false;
      this.activeStreamHandle = null;
      this.pendingCancel = false;
      this.streamState = null;
      this.echartsInstance = null;
      this.mermaidPanZoom = null;
      this.mermaidInitialized = false;

      this.globalStore = moduleRuntime.storageService.global();
      this.activeModuleId = null;

      this.initElements();
      this.bindGlobalEvents();
      this.setupModuleSwitcher();
      this.restoreLastModule();
      this.setSendButtonState('idle');
    }

    initElements() {
      this.el.pageTitle = document.getElementById('page-title');
      this.el.moduleButtonGroup = document.getElementById(
        'module-button-group'
      );

      // 对话相关
      this.el.chatInput = document.getElementById('chat-input');
      this.el.chatQuickActions = document.getElementById('chat-quick-actions');
      this.el.sendButton = document.getElementById('send-button');
      this.el.clearHistoryBtn = document.getElementById('clear-history-btn');
      this.el.chatHistory = document.getElementById('chat-history');

      // 视图区域
      this.el.viewer = document.getElementById('svg-viewer');
      this.el.placeholderText =
        this.el.viewer && this.el.viewer.querySelector('#placeholder-text');

      // 工具栏
      this.el.zoomOutBtn = document.getElementById('zoom-out-btn');
      this.el.zoomInBtn = document.getElementById('zoom-in-btn');
      this.el.zoomResetBtn = document.getElementById('zoom-reset-btn');
      this.el.downloadSvgBtn = document.getElementById('download-svg-btn');
      this.el.copyImageBtn = document.getElementById('copy-image-btn');
      this.el.exportImageBtn = document.getElementById('export-image-btn');
      this.el.viewCodeBtn = document.getElementById('view-code-btn');

      // 配置模态框
      this.el.settingsBtn = document.getElementById('settings-btn');
      this.el.configModal = document.getElementById('config-modal');
      this.el.closeModalBtn = document.getElementById('close-modal-btn');
      this.el.apiUrlInput = document.getElementById('api-url');
      this.el.apiKeyInput = document.getElementById('api-key');
      this.el.apiModelInput = document.getElementById('api-model');
      this.el.testApiBtn = document.getElementById('test-api-btn');
      this.el.saveConfigBtn = document.getElementById('save-config-btn');
      this.el.configStatus = document.getElementById('config-status');
      this.el.statusText = document.getElementById('status-text');
      this.el.codeModal = document.getElementById('code-modal');
      this.el.codeContent = document.getElementById('code-content');
      this.el.copyCodeBtn = document.getElementById('copy-code-btn');
      this.el.closeCodeModalBtn = document.getElementById('close-code-modal-btn');

      // 复制按钮可用性
      if (this.el.copyImageBtn && !this.copyClipboardSupported) {
        this.el.copyImageBtn.disabled = true;
        this.el.copyImageBtn.title = '当前浏览器不支持复制图片到剪贴板';
      }
    }

    bindGlobalEvents() {
      if (this.el.sendButton) {
        this.el.sendButton.addEventListener('click', () => {
          if (this.isProcessing) {
            this.cancelActiveStream();
          } else {
            this.sendMessage();
          }
        });
      }

      if (this.el.chatInput) {
        this.el.chatInput.addEventListener('keypress', (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!this.isProcessing) {
              this.sendMessage();
            }
          }
        });

        this.el.chatInput.addEventListener('input', () => {
          Utils.autoResizeTextarea(this.el.chatInput);
        });
      }

      if (this.el.chatQuickActions) {
        this.el.chatQuickActions.addEventListener('click', (event) => {
          const actionBtn = event.target.closest('[data-quick-value]');
          if (!actionBtn) return;
          event.preventDefault();
          const quickValue = actionBtn.dataset.quickValue || '';
          if (this.el.chatInput) {
            this.el.chatInput.value = quickValue;
            Utils.autoResizeTextarea(this.el.chatInput);
            this.el.chatInput.focus();
          }
        });
      }

      if (this.el.clearHistoryBtn) {
        this.el.clearHistoryBtn.addEventListener('click', () =>
          this.clearCurrentConversation()
        );
      }

      if (this.el.zoomInBtn) {
        this.el.zoomInBtn.addEventListener('click', () => this.adjustZoom(0.25));
      }
      if (this.el.zoomOutBtn) {
        this.el.zoomOutBtn.addEventListener('click', () =>
          this.adjustZoom(-0.25)
        );
      }
      if (this.el.zoomResetBtn) {
        this.el.zoomResetBtn.addEventListener('click', () =>
          this.resetZoom()
        );
      }

      if (this.el.downloadSvgBtn) {
        this.el.downloadSvgBtn.addEventListener('click', () =>
          this.downloadArtifact().catch((error) =>
            console.error('下载SVG失败:', error)
          )
        );
      }
      if (this.el.copyImageBtn) {
        this.el.copyImageBtn.addEventListener('click', () =>
          this.copyArtifactImage().catch((error) =>
            console.error('复制图片失败:', error)
          )
        );
      }
      if (this.el.exportImageBtn) {
        this.el.exportImageBtn.addEventListener('click', () =>
          this.exportArtifactAsImage().catch((error) =>
            console.error('导出图片失败:', error)
          )
        );
      }
      if (this.el.viewCodeBtn) {
        this.el.viewCodeBtn.addEventListener('click', () =>
          this.viewArtifactCode()
        );
      }

      if (this.el.settingsBtn) {
        this.el.settingsBtn.addEventListener('click', () =>
          this.openConfigModal()
        );
      }
      if (this.el.closeModalBtn) {
        this.el.closeModalBtn.addEventListener('click', () =>
          this.closeConfigModal()
        );
      }
      if (this.el.configModal) {
        this.el.configModal.addEventListener('click', (event) => {
          if (event.target === this.el.configModal) {
            this.closeConfigModal();
          }
        });
      }
      if (this.el.testApiBtn) {
        this.el.testApiBtn.addEventListener('click', () => this.testAPI());
      }
      if (this.el.saveConfigBtn) {
        this.el.saveConfigBtn.addEventListener('click', () => this.saveAPI());
      }

      if (this.el.chatHistory) {
        this.el.chatHistory.addEventListener('click', (event) => {
          const actionBtn = event.target.closest('[data-action]');
          if (!actionBtn) return;
          event.preventDefault();
          const action = actionBtn.dataset.action;
          const messageId = actionBtn.dataset.messageId;
          this.handleMessageAction(action, messageId);
        });
      }

      if (this.el.copyCodeBtn) {
        this.el.copyCodeBtn.addEventListener('click', () =>
          this.copyCodeContent()
        );
      }
      if (this.el.closeCodeModalBtn) {
        this.el.closeCodeModalBtn.addEventListener('click', () =>
          this.closeCodeModal()
        );
      }
      if (this.el.codeModal) {
        this.el.codeModal.addEventListener('click', (event) => {
          if (event.target === this.el.codeModal) {
            this.closeCodeModal();
          }
        });
      }
    }

    setupModuleSwitcher() {
      const manifests = this.runtime.listManifests();
      if (!manifests.length) {
        throw new Error('未找到可用模块，请确认模块清单是否注册');
      }

      if (!this.el.moduleButtonGroup) {
        console.warn('模块按钮容器缺失，无法渲染模块切换按钮');
        return;
      }
      this.el.moduleButtonGroup.innerHTML = '';
      this.moduleButtons.clear();

      manifests.forEach((manifest) => {
        const button = document.createElement('button');
        button.className =
          'module-btn bg-white text-gray-700 px-4 py-2 font-bold border-2 border-black hover:bg-gray-100 transition-all duration-200 flex items-center gap-1';
        button.dataset.moduleId = manifest.id;
        button.innerHTML = `
          <iconify-icon icon="${manifest.icon ||
            'ph:squares-four'}" class="text-xl"></iconify-icon>
          <span>${manifest.label}</span>
        `;
        button.addEventListener('click', () =>
          this.activateModule(manifest.id)
        );
        this.el.moduleButtonGroup.appendChild(button);
        this.moduleButtons.set(manifest.id, button);
      });
    }

    restoreLastModule() {
      const manifests = this.runtime.listManifests();
      const preferredId =
        this.globalStore.get('activeModuleId', null) ||
        (manifests[0] && manifests[0].id);
      const fallbackId = manifests[0].id;
      this.activateModule(
        this.runtime.registry.has(preferredId) ? preferredId : fallbackId
      );
    }

    activateModule(moduleId) {
      if (this.activeModuleId === moduleId) {
        return;
      }
      const context = this.runtime.activate(moduleId);
      this.activeModuleId = moduleId;
      this.globalStore.set('activeModuleId', moduleId);

      this.highlightActiveModuleButton();
      this.updateModuleUI(context.manifest);
      this.loadApiConfig();
      this.renderConversationHistory();
      this.renderActiveArtifact();
      this.updateToolbarState();
    }

    highlightActiveModuleButton() {
      this.moduleButtons.forEach((button, id) => {
        if (id === this.activeModuleId) {
          button.classList.add('mode-btn-active');
          button.classList.remove('mode-btn-inactive');
        } else {
          button.classList.add('mode-btn-inactive');
          button.classList.remove('mode-btn-active');
        }
      });
    }

    updateModuleUI(manifest) {
      if (this.el.pageTitle) {
        this.el.pageTitle.textContent = manifest.label;
      }
      if (this.el.chatInput && manifest.chat?.placeholder) {
        this.el.chatInput.placeholder = manifest.chat.placeholder;
      }
      this.renderQuickActions(manifest.ui?.quickActions || []);
      this.showViewerPlaceholder(manifest.ui?.placeholderText || '');
    }

    showViewerPlaceholder(text) {
      if (!this.el.viewer) return;
      this.el.viewer.innerHTML = `
        <div id="svg-placeholder" class="text-center text-gray-400">
          <iconify-icon icon="ph:image-square" class="text-6xl mx-auto text-purple-400"></iconify-icon>
          <p class="mt-2 font-bold" id="placeholder-text">${text ||
            '生成的内容将在此处显示'}</p>
        </div>
      `;
      this.el.placeholderText =
        this.el.viewer && this.el.viewer.querySelector('#placeholder-text');
    }

    renderQuickActions(actions = []) {
      if (!this.el.chatQuickActions) return;
      const container = this.el.chatQuickActions;
      container.innerHTML = '';
      if (!actions.length) {
        container.classList.add('hidden');
        return;
      }
      container.classList.remove('hidden');
      actions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className =
          'quick-action-btn bg-white text-gray-700 px-3 py-1 text-sm border-2 border-black font-semibold hover:bg-gray-100 transition-all duration-200';
        button.dataset.quickValue = action.value || '';
        button.textContent = action.label || action.value || '快捷选项';
        container.appendChild(button);
      });
    }

    getActiveManifest() {
      return this.runtime.getManifest(this.activeModuleId);
    }

    getCurrentHistory() {
      return this.conversationService.getHistory(this.getActiveManifest());
    }

    renderConversationHistory() {
      if (!this.el.chatHistory) return;
      const history = this.getCurrentHistory();
      this.el.chatHistory.innerHTML = '';
      const manifest = this.getActiveManifest();

      if (!history.length) {
        const welcome = document.createElement('div');
        welcome.className = 'flex justify-start';
        welcome.innerHTML = `
          <div class="chat-bubble-ai">
            👋 欢迎使用 ${manifest.label} 助手！请输入需求，我会结合模块特性生成图表与分析。
          </div>
        `;
        this.el.chatHistory.appendChild(welcome);
        return;
      }

      let lastAiMessageId = null;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        if (history[i].type === 'ai') {
          lastAiMessageId = history[i].id;
          break;
        }
      }

      history.forEach((message) => {
        const bubble = this.buildMessageBubble(message, {
          allowRollback: message.type === 'ai',
          allowRegenerate:
            message.type === 'ai' && message.id === lastAiMessageId,
          allowDelete: true
        });
        this.el.chatHistory.appendChild(bubble);
      });

      this.highlightActivePlaceholder();
      Utils.scrollToBottom(this.el.chatHistory);
    }

    buildMessageBubble(message, options = {}) {
      const wrapper = document.createElement('div');
      const manifest = this.getActiveManifest();
      const actionsHtml = this.buildMessageActions(message, options);
      if (message.type === 'user') {
        wrapper.className = 'flex justify-end';
        wrapper.innerHTML = `
          <div class="chat-bubble-user message-with-delete" data-message-id="${message.id}">
            <div>${Utils.escapeHtml(message.content)}</div>
            ${actionsHtml}
          </div>
        `;
      } else if (message.type === 'error') {
        wrapper.className = 'flex justify-start';
        wrapper.innerHTML = `
          <div class="chat-bubble-ai message-with-delete border-red-500" data-message-id="${message.id}">
            <div class="flex items-start gap-2">
              <iconify-icon icon="ph:warning-circle" class="text-red-500 mt-0.5"></iconify-icon>
              <span>${Utils.escapeHtml(message.content)}</span>
            </div>
            ${actionsHtml}
          </div>
        `;
      } else {
        wrapper.className = 'flex justify-start';
        const parsedContent =
          typeof marked !== 'undefined'
            ? marked.parse(message.content)
            : Utils.escapeHtml(message.content);
        const artifactLabel = manifest.label || '图表';
        const artifactHtml = message.artifactId
          ? `<div class="svg-placeholder-block" data-artifact-id="${message.artifactId}" data-module-id="${manifest.id}">
              📊 点击查看${artifactLabel}
            </div>`
          : '';
        wrapper.innerHTML = `
          <div class="chat-bubble-ai message-with-delete" data-message-id="${message.id}">
            <div class="message-body">${parsedContent}</div>
            ${artifactHtml}
            ${actionsHtml}
          </div>
        `;
        if (message.artifactId) {
          const placeholder = wrapper.querySelector('.svg-placeholder-block');
          placeholder?.addEventListener('click', () =>
            this.renderArtifact(message.artifactId)
          );
        }
      }
      return wrapper;
    }

    buildMessageActions(message, options = {}) {
      const {
        allowRollback = false,
        allowRegenerate = false,
        allowDelete = true
      } = options;

      const actions = [];

      if (allowRollback) {
        actions.push(`
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors"
            data-action="rollback-message" data-message-id="${message.id}">
            <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
            <span>退回</span>
          </button>
        `);
      }

      if (allowRegenerate) {
        actions.push(`
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors"
            data-action="regenerate-message" data-message-id="${message.id}">
            <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
            <span>重新生成</span>
          </button>
        `);
      }

      if (allowDelete) {
        actions.push(`
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-red-600 transition-colors"
            data-action="delete-message" data-message-id="${message.id}">
            <iconify-icon icon="ph:trash-simple-bold"></iconify-icon>
            <span>删除</span>
          </button>
        `);
      }

      if (!actions.length) {
        return '';
      }

      return `
        <div class="message-actions flex gap-2 mt-2 pt-2 border-t border-gray-200">
          ${actions.join('')}
        </div>
      `;
    }

    handleMessageAction(action, messageId) {
      if (!action || !messageId) return;
      switch (action) {
        case 'delete-message':
          this.deleteMessage(messageId);
          break;
        case 'rollback-message':
          this.rollbackMessage(messageId);
          break;
        case 'regenerate-message':
          this.regenerateMessage(messageId);
          break;
        default:
          break;
      }
    }

    deleteMessage(messageId) {
      const manifest = this.getActiveManifest();
      const history = this.conversationService.getHistory(manifest);
      const index = history.findIndex((msg) => msg.id === messageId);
      if (index === -1) {
        alert('未找到要删除的消息，请重试。');
        return;
      }

      const target = history[index];
      const typeLabel =
        target.type === 'user'
          ? '这条用户消息'
          : target.type === 'ai'
            ? '这条AI回复'
            : '这条提示';
      if (
        !confirm(
          `${typeLabel}删除后无法恢复，确定要删除吗？`
        )
      ) {
        return;
      }

      const removed = history.splice(index, 1);
      this.conversationService.saveHistory(manifest, history);
      this.removeArtifactsForMessages(manifest.id, removed);
      this.ensureActiveArtifact(manifest);
      this.renderConversationHistory();
      this.renderActiveArtifact();
    }

    rollbackMessage(messageId) {
      const manifest = this.getActiveManifest();
      const history = this.conversationService.getHistory(manifest);
      const index = history.findIndex((msg) => msg.id === messageId);
      if (index === -1) {
        alert('未找到指定消息，请重试。');
        return;
      }
      const target = history[index];
      if (target.type !== 'ai') {
        alert('只能退回到AI生成的消息。');
        return;
      }
      if (index === history.length - 1) {
        alert('该消息已是最新内容，无需退回。');
        return;
      }
      if (
        !confirm(
          '退回将删除此消息之后的所有对话与图形，是否继续？'
        )
      ) {
        return;
      }
      const removed = history.splice(index + 1);
      if (!removed.length) {
        return;
      }
      this.conversationService.saveHistory(manifest, history);
      this.removeArtifactsForMessages(manifest.id, removed);
      this.ensureActiveArtifact(manifest);
      this.renderConversationHistory();
      this.renderActiveArtifact();
    }

    regenerateMessage(messageId) {
      if (this.isProcessing) {
        alert('当前仍在生成中，请稍后再试。');
        return;
      }
      const manifest = this.getActiveManifest();
      const history = this.conversationService.getHistory(manifest);
      const index = history.findIndex((msg) => msg.id === messageId);
      if (index === -1) {
        alert('未找到指定的AI消息。');
        return;
      }
      const target = history[index];
      if (target.type !== 'ai') {
        alert('只能对AI回复执行重新生成。');
        return;
      }
      if (index !== history.length - 1) {
        alert('请先使用退回功能，确保该AI回复位于对话末尾后再重新生成。');
        return;
      }

      let userIndex = -1;
      for (let i = index - 1; i >= 0; i -= 1) {
        if (history[i].type === 'user') {
          userIndex = i;
          break;
        }
      }
      if (userIndex === -1) {
        alert('未找到对应的用户消息，无法重新生成。');
        return;
      }
      const userMessage = history[userIndex];

      const removed = history.splice(index, 1);
      this.conversationService.saveHistory(manifest, history);
      this.removeArtifactsForMessages(manifest.id, removed);
      this.ensureActiveArtifact(manifest);
      this.renderConversationHistory();
      this.renderActiveArtifact();

      const contextMessages = history
        .slice(0, userIndex)
        .filter((msg) => msg.type === 'user' || msg.type === 'ai')
        .map((msg) => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));

      this.isProcessing = true;
      this.pendingCancel = false;
      this.setSendButtonState('streaming');
      this.el.sendButton.disabled = false;

      this.beginStreaming(manifest, {
        userMessage,
        contextMessages
      });
    }

    removeArtifactsForMessages(moduleId, messages = []) {
      if (!messages.length) return;
      const artifacts = this.runtime.getArtifacts(moduleId);
      const idsToRemove = new Set();
      messages.forEach((msg) => {
        if (msg.artifactId && artifacts[msg.artifactId]) {
          idsToRemove.add(msg.artifactId);
        }
      });

      const messageIdSet = new Set(messages.map((msg) => msg.id));
      Object.entries(artifacts).forEach(([id, artifact]) => {
        if (artifact.messageId && messageIdSet.has(artifact.messageId)) {
          idsToRemove.add(id);
        }
      });

      idsToRemove.forEach((id) => this.runtime.removeArtifact(moduleId, id));
    }

    ensureActiveArtifact(manifest) {
      const state = this.runtime.getState(manifest.id);
      const artifacts = state.artifacts || {};
      if (state.currentArtifactId && artifacts[state.currentArtifactId]) {
        return state.currentArtifactId;
      }
      const history = this.conversationService.getHistory(manifest);
      let nextId = null;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const candidateId = history[i].artifactId;
        if (candidateId && artifacts[candidateId]) {
          nextId = candidateId;
          break;
        }
      }
      this.runtime.setActiveArtifact(manifest.id, nextId);
      return nextId;
    }

    sendMessage() {
      if (!this.el.chatInput) return;
      const message = this.el.chatInput.value.trim();
      if (!message || this.isProcessing) return;

      if (!this.apiClient.isConfigValid()) {
        alert('⚠️ 请先配置API设置！点击右上角齿轮图标进行配置。');
        this.openConfigModal();
        return;
      }

      const manifest = this.getActiveManifest();
      const userMessage = {
        id: Utils.generateId('msg'),
        type: 'user',
        content: message,
        timestamp: new Date().toISOString()
      };

      this.conversationService.appendMessage(manifest, userMessage);
      this.renderConversationHistory();
      this.el.chatInput.value = '';
      Utils.autoResizeTextarea(this.el.chatInput);

      const context = this.conversationService.buildContext(manifest);
      if (!context) {
        console.warn('无法构建上下文，终止发送');
        return;
      }

      this.isProcessing = true;
      this.pendingCancel = false;
      this.setSendButtonState('streaming');
      this.el.sendButton.disabled = false;

      this.beginStreaming(manifest, {
        userMessage: context.userMessage,
        contextMessages: context.contextMessages
      });
    }

    beginStreaming(manifest, payload) {
      const messageId = Utils.generateId('msg');
      const container = this.createStreamingContainer(messageId);
      this.el.chatHistory.appendChild(container);
      Utils.scrollToBottom(this.el.chatHistory);

      let fullContent = '';
      const streamState = {
        manifestId: manifest.id,
        messageId,
        container,
        svg: null
      };
      this.streamState = streamState;

      const finalize = ({ aborted = false } = {}) => {
        if (!this.isProcessing) return;
        this.isProcessing = false;
        this.setSendButtonState('idle');
        this.el.sendButton.disabled = false;
        this.activeStreamHandle = null;
        this.pendingCancel = false;
        this.streamState = null;

        if (aborted) {
          container.remove();
          return;
        }

        this.finalizeAssistantMessage(
          manifest,
          messageId,
          fullContent,
          streamState
        );
      };

      const handleChunk = (chunk) => {
        const delta = chunk?.choices?.[0]?.delta?.content || '';
        if (!delta) return;
        fullContent += delta;
        this.updateStreamingContent(container, fullContent);
        if (manifest.artifact?.type === 'svg') {
          this.processSvgStreamChunk(manifest, fullContent, streamState);
        } else if (manifest.artifact?.type === 'mermaid') {
          this.processMermaidStreamChunk(manifest, fullContent, streamState);
        }
      };

      const handleComplete = (info) => {
        finalize(info);
      };

      this.apiClient
        .generateModuleStream(
          manifest,
          payload.userMessage.content,
          payload.contextMessages,
          handleChunk,
          handleComplete,
          STREAM_DEFAULT_OPTIONS
        )
        .then((streamHandle) => {
          this.activeStreamHandle = streamHandle;
          if (this.pendingCancel) {
            this.pendingCancel = false;
            this.cancelActiveStream();
          }
          return streamHandle.finished;
        })
        .then(() => finalize({ aborted: false }))
        .catch((error) => {
          console.error('发送消息失败:', error);
          if (this.streamState && this.streamState === streamState) {
            this.streamState = null;
          }
          finalize({ aborted: true });
          this.addErrorMessage(
            error.message || '生成失败，请稍后再试',
            manifest
          );
        });
    }

    createStreamingContainer(messageId) {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'flex justify-start';
      messageDiv.dataset.messageId = messageId;
      messageDiv.innerHTML = `
        <div class="chat-bubble-ai relative streaming-text" data-message-id="${messageId}">
          <div class="typing-cursor"></div>
        </div>
      `;
      return messageDiv;
    }

    updateStreamingContent(container, content) {
      const cursor = container.querySelector('.typing-cursor');
      if (!cursor) return;
      if (typeof marked !== 'undefined') {
        cursor.innerHTML = marked.parse(content);
      } else {
        cursor.textContent = content;
      }
      Utils.scrollToBottom(this.el.chatHistory);
    }

    finalizeAssistantMessage(
      manifest,
      messageId,
      fullContent,
      streamContext = null
    ) {
      const container = this.el.chatHistory.querySelector(
        `[data-message-id="${messageId}"]`
      );
      if (container) {
        container.remove();
      }

      const timestamp = new Date().toISOString();
      let artifactId = streamContext?.svg?.artifactId || null;
      let artifactPayload = null;
      let parsedResult = null;

      if (manifest.artifact?.parser) {
        try {
          parsedResult = manifest.artifact.parser(fullContent);
          if (manifest.artifact.type === 'svg' && parsedResult.svgContent) {
            artifactId = Utils.generateId('svg');
            const svgBody = parsedResult.svgContent.trim().endsWith('</svg>')
              ? parsedResult.svgContent.trim()
              : `${parsedResult.svgContent.trim()}\n</svg>`;
            artifactPayload = {
              id: artifactId,
              type: manifest.artifact.type,
              content: svgBody,
              messageId,
              timestamp
            };
          } else if (
            manifest.artifact.type === 'mermaid' &&
            parsedResult.code
          ) {
            artifactId = Utils.generateId('mermaid');
            artifactPayload = {
              id: artifactId,
              type: manifest.artifact.type,
              code: parsedResult.code,
              svgContent: streamContext?.mermaid?.svgContent || null,
              messageId,
              timestamp
            };
          } else if (
            manifest.artifact.type === 'echarts-option' &&
            parsedResult.option
          ) {
            artifactId = Utils.generateId('chart');
            artifactPayload = {
              id: artifactId,
              type: manifest.artifact.type,
              option: parsedResult.option,
              optionText:
                parsedResult.optionText ||
                JSON.stringify(parsedResult.option),
              messageId,
              timestamp
            };
          }
        } catch (error) {
          console.warn('解析助手内容失败:', error);
        }
      }

      const messageContent = this.buildAssistantDisplayContent(
        manifest,
        fullContent,
        parsedResult,
        artifactId
      );

      const messageRecord = {
        id: messageId,
        type: 'ai',
        content: messageContent,
        timestamp,
        artifactId
      };
      this.conversationService.appendMessage(manifest, messageRecord);

      if (artifactId && artifactPayload) {
        this.runtime.saveArtifact(manifest.id, artifactId, artifactPayload);
        this.renderArtifact(artifactId);
      }

      this.renderConversationHistory();
    }

    parseMarkdownContent(text) {
      if (!text) return '';
      if (typeof marked !== 'undefined') {
        return marked.parse(text);
      }
      return Utils.escapeHtml(text);
    }

    addErrorMessage(errorText, manifest) {
      const message = {
        id: Utils.generateId('msg'),
        type: 'error',
        content: errorText,
        timestamp: new Date().toISOString()
      };
      this.conversationService.appendMessage(manifest, message);
      this.renderConversationHistory();
    }

    buildAssistantDisplayContent(manifest, rawContent, parsedResult, artifactId) {
      const trim = (text) => (typeof text === 'string' ? text.trim() : '');
      const segments = [];

      if (parsedResult) {
        if (manifest.artifact?.type === 'svg') {
          const before = trim(parsedResult.beforeText);
          const after = trim(parsedResult.afterText);
          if (before) segments.push(before);
          if (after) segments.push(after);
        } else if (manifest.artifact?.type === 'mermaid') {
          const before = trim(parsedResult.beforeText);
          const after = trim(parsedResult.afterText);
          if (before) segments.push(before);
          if (after) segments.push(after);
        } else if (manifest.artifact?.type === 'echarts-option') {
          const before = trim(parsedResult.beforeText);
          const after = trim(parsedResult.afterText);
          if (before) segments.push(before);
          if (after) segments.push(after);
        }
      }

      const content = segments.filter(Boolean).join('\n\n').trim();
      if (content) {
        return content;
      }

      if (artifactId) {
        return `已生成 ${manifest.label} 图表，请点击占位卡片查看。`;
      }

      return rawContent.trim();
    }

    processSvgStreamChunk(manifest, fullContent, streamState) {
      if (!streamState) {
        return;
      }
      if (!streamState.svg) {
        streamState.svg = {
          started: false,
          completed: false,
          artifactId: null,
          latestMarkup: ''
        };
      }
      const svgCtx = streamState.svg;
      const startPattern =
        manifest.artifact?.startPattern || /```(?:svg)?\s*<svg/i;
      if (!svgCtx.started) {
        const match = fullContent.match(startPattern);
        if (match) {
          svgCtx.started = true;
          svgCtx.startIndex = match.index;
          svgCtx.artifactId = svgCtx.artifactId || Utils.generateId('svg');
          svgCtx.beforeText = fullContent.substring(0, svgCtx.startIndex);
          this.updateStreamingBubbleSvgPlaceholder(
            streamState.container,
            manifest,
            svgCtx
          );
          this.showViewerStreaming(manifest);
        }
      }
      if (!svgCtx.started) {
        return;
      }

      const svgSection = fullContent.substring(svgCtx.startIndex);
      let cleaned = svgSection.replace(/```(?:svg)?\s*/i, '');
      cleaned = cleaned.replace(/```$/, '');
      const closingIndex = cleaned.indexOf('</svg>');
      if (closingIndex !== -1) {
        svgCtx.completed = true;
        cleaned = cleaned.substring(0, closingIndex + 6);
        svgCtx.latestMarkup = cleaned;
        this.renderTemporarySvg(cleaned, false, manifest);
      } else if (cleaned.trim()) {
        const temporaryMarkup = cleaned.endsWith('</svg>')
          ? cleaned
          : `${cleaned}\n</svg>`;
        svgCtx.latestMarkup = temporaryMarkup;
        this.renderTemporarySvg(temporaryMarkup, true, manifest);
      }
    }

    updateStreamingBubbleSvgPlaceholder(container, manifest, svgCtx) {
      if (!container) return;
      const beforeHtml = this.parseMarkdownContent(svgCtx.beforeText || '');
      const label = manifest.label || '图表';
      container.innerHTML = `
        <div class="chat-bubble-ai relative streaming-text" data-message-id="${container.dataset.messageId}">
          <div>
            ${beforeHtml}
            <div class="svg-drawing-placeholder" data-temp-id="${svgCtx.artifactId}">
              🎨 正在绘制${label}...
            </div>
            <div class="typing-cursor"></div>
          </div>
        </div>
      `;
      Utils.scrollToBottom(this.el.chatHistory);
    }

    showViewerStreaming(manifest) {
      if (!this.el.viewer) return;
      const label = manifest.label || '图表';
      this.el.viewer.innerHTML = `
        <div class="flex items-center justify-center w-full h-full">
          <div class="text-center text-gray-600">
            <iconify-icon icon="ph:spinner-gap" class="text-5xl text-purple-500 animate-spin"></iconify-icon>
            <p class="mt-4 font-bold">正在绘制${label}...</p>
          </div>
        </div>
      `;
    }

    renderTemporarySvg(svgMarkup, isPartial = false, manifest = null) {
      const moduleId = manifest?.id || this.activeModuleId;
      this.renderSvgMarkup(svgMarkup, moduleId, {
        opacity: isPartial ? 0.9 : 1
      });
    }

    getCurrentEChartsSvgElement() {
      if (!this.echartsInstance) return null;
      const dom = this.echartsInstance.getDom();
      if (!dom) return null;
      return dom.querySelector('svg');
    }

    getSvgStringFromElement(svgElement) {
      if (!svgElement) return null;
      const serializer = new XMLSerializer();
      let svgContent = serializer.serializeToString(svgElement);
      if (!svgContent.match(/^<svg[^>]+xmlns=/)) {
        svgContent = svgContent.replace(
          '<svg',
          '<svg xmlns="http://www.w3.org/2000/svg"'
        );
      }
      return svgContent;
    }

    initializeMermaidPanZoom(svgElementid, manifest) {
      let svgElement = document.getElementById(svgElementid);
      if (!svgElement) return;
      if (!window.svgPanZoom) {
        console.warn('svgPanZoom 脚本未加载，无法提供平移缩放');
        return;
      }
      this.destroyMermaidPanZoom();
      let doPan = false;
      let mousePos = { x: 0, y: 0 };
      let panZoomInstance = null;

      const onMouseDown = (ev) => {
        if (!ev) return;
        doPan = true;
        mousePos = { x: ev.clientX, y: ev.clientY };
      };
      const onMouseMove = (ev) => {
        if (!doPan || !panZoomInstance) return;
        panZoomInstance.panBy({
          x: ev.clientX - mousePos.x,
          y: ev.clientY - mousePos.y
        });
        mousePos = { x: ev.clientX, y: ev.clientY };
        const selection = window.getSelection && window.getSelection();
        if (selection && selection.removeAllRanges) {
          selection.removeAllRanges();
        }
      };
      const onMouseUp = () => {
        doPan = false;
      };

      const eventsHandler = {
        haltEventListeners: ['mousedown', 'mousemove', 'mouseup'],
        init(options) {
          options.svgElement.addEventListener('mousedown', onMouseDown, false);
          options.svgElement.addEventListener('mousemove', onMouseMove, false);
          options.svgElement.addEventListener('mouseup', onMouseUp, false);
        },
        destroy(options) {
          options.svgElement.removeEventListener('mousedown', onMouseDown, false);
          options.svgElement.removeEventListener('mousemove', onMouseMove, false);
          options.svgElement.removeEventListener('mouseup', onMouseUp, false);
        }
      };

      this.mermaidPanZoom = window.svgPanZoom(`#${svgElementid}`, {
        zoomEnabled: true,
        controlIconsEnabled: true,
        fit: true,
        center: true,
        minZoom: 0.25,
        maxZoom: 3,
        customEventsHandler: eventsHandler
      });
      panZoomInstance = this.mermaidPanZoom;

      const uiState = this.runtime.getUiState(manifest.id, { zoom: 1 });
      const initialZoom = uiState.zoom || 1;
      this.mermaidPanZoom.zoom(initialZoom);
      this.mermaidPanZoom.setOnZoom((zoomLevel) => {
        this.runtime.updateUiState(manifest.id, { zoom: zoomLevel });
      });
    }

    destroyMermaidPanZoom() {
      if (this.mermaidPanZoom && typeof this.mermaidPanZoom.destroy === 'function') {
        this.mermaidPanZoom.destroy();
      }
      this.mermaidPanZoom = null;
    }

    isZoomableManifest(manifest) {
      const type = manifest?.artifact?.type;
      return type === 'svg' || type === 'mermaid';
    }

    processMermaidStreamChunk(manifest, fullContent, streamState) {
      if (!streamState) return;
      if (!streamState.mermaid) {
        streamState.mermaid = {
          started: false,
          artifactId: null,
          beforeText: ''
        };
      }
      const ctx = streamState.mermaid;
      const startPattern = manifest.artifact?.startPattern || /```mermaid/i;
      if (!ctx.started) {
        const match = fullContent.match(startPattern);
        if (match) {
          ctx.started = true;
          ctx.artifactId = ctx.artifactId || Utils.generateId('mermaid');
          ctx.beforeText = fullContent.substring(0, match.index);
          this.updateMermaidPlaceholder(streamState.container, manifest, ctx);
          this.showViewerStreaming(manifest);
        }
      }
    }

    updateMermaidPlaceholder(container, manifest, ctx) {
      if (!container) return;
      const beforeHtml = this.parseMarkdownContent(ctx.beforeText || '');
      const label = manifest.label || '图表';
      container.innerHTML = `
        <div class="chat-bubble-ai relative streaming-text" data-message-id="${container.dataset.messageId}">
          <div>
            ${beforeHtml}
            <div class="svg-drawing-placeholder" data-temp-id="${ctx.artifactId}">
              🧠 正在生成${label}代码...
            </div>
            <div class="typing-cursor"></div>
          </div>
        </div>
      `;
      Utils.scrollToBottom(this.el.chatHistory);
    }

    async ensureMermaidReady() {
      if (this.mermaidInitialized) return;
      if (!window.mermaid) {
        throw new Error('Mermaid 脚本未加载，请检查资源引入');
      }
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default'
      });
      this.mermaidInitialized = true;
    }

    async renderMermaidArtifact(artifact, manifest) {
      if (!this.el.viewer) return;
      this.showViewerStreaming(manifest);
      try {
        const svgContent = await this.getMermaidSvgContent(
          artifact,
          manifest
        );
        this.destroyMermaidPanZoom();
        this.renderSvgMarkup(svgContent, this.activeModuleId, {
          applyTransform: false,
          wrapperClasses: ['svg-content-wrapper--mermaid']
        });
        const svgElement = this.el.viewer.querySelector('svg');
        if (svgElement) {
          const svgid = svgElement.getAttribute('id', 'mermaidSvg');
          this.initializeMermaidPanZoom(svgid, manifest);
        }
      } catch (error) {
        this.destroyMermaidPanZoom();
        console.error('Mermaid 渲染失败:', error);
        this.el.viewer.innerHTML = `
          <div class="p-4 text-center text-red-500 font-bold">
            Mermaid 渲染失败：${Utils.escapeHtml(error.message || '未知错误')}
          </div>
        `;
      }
    }

    async getMermaidSvgContent(artifact, manifest) {
      if (artifact.svgContent) {
        return artifact.svgContent;
      }
      await this.ensureMermaidReady();
      const renderId = `mermaid-${artifact.id || Utils.generateId('mermaid')}-${Date.now()}`;
      const code = artifact.code || artifact.content || '';
      if (!code.trim()) {
        throw new Error('缺少 Mermaid 代码，无法渲染');
      }
      const { svg } = await window.mermaid.render("mermaidSvg", code);
      const updatedArtifact = {
        ...artifact,
        svgContent: svg
      };
      this.runtime.saveArtifact(
        manifest?.id || this.activeModuleId,
        updatedArtifact.id,
        updatedArtifact
      );
      return svg;
    }

    getMermaidCode(artifact) {
      if (!artifact) return '';
      const code = artifact.code || artifact.content || '';
      return typeof code === 'string' ? code : String(code || '');
    }

    getMermaidImageWidth(svgElement, svgMarkup) {
      if (!svgElement) return null;
      let width = null;
      try {
        if (typeof svgElement.getBBox === 'function') {
          width = svgElement.getBBox().width;
        }
      } catch (error) {
        console.warn('计算 Mermaid 图宽度失败，回退到外框尺寸:', error);
      }
      if (!width || Number.isNaN(width) || width <= 0) {
        const viewBox = svgElement.viewBox?.baseVal;
        if (viewBox && viewBox.width > 0) {
          width = viewBox.width;
        }
      }
      if (!width || Number.isNaN(width) || width <= 0) {
        const rect = svgElement.getBoundingClientRect?.();
        if (rect && rect.width > 0) {
          width = rect.width;
        }
      }
      if ((!width || Number.isNaN(width) || width <= 0) && svgMarkup) {
        const dims = this.parseSvgDimensions(svgMarkup);
        if (dims.width && dims.width > 0) {
          width = dims.width;
        }
      }
      return width && width > 0 ? width : null;
    }

    encodeMermaidState(code) {
      if (!window.pako) {
        throw new Error('缺少 Pako 压缩依赖，无法导出 Mermaid 图片');
      }
      if (typeof TextEncoder === 'undefined') {
        throw new Error('当前浏览器不支持 TextEncoder，无法导出 Mermaid 图片');
      }
      this.textEncoder = this.textEncoder || new TextEncoder();
      const payload = {
        code,
        mermaid: {
          theme: 'default'
        },
        autoSync: true,
        updateDiagram: true,
        editorMode: 'code'
      };
      const json = JSON.stringify(payload);
      const compressed = window.pako.deflate(this.textEncoder.encode(json), {
        level: 9
      });
      const chunkSize = 0x8000;
      let binary = '';
      for (let i = 0; i < compressed.length; i += chunkSize) {
        const slice = compressed.subarray(i, Math.min(i + chunkSize, compressed.length));
        binary += String.fromCharCode.apply(null, slice);
      }
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    buildMermaidImageUrl(code, { type = 'png', width } = {}) {
      const encoded = this.encodeMermaidState(code);
      const params = new URLSearchParams();
      params.set('type', type);
      if (width && Number.isFinite(width) && width > 0) {
        params.set('width', Math.round(width));
      }
      return `https://mermaid.ink/img/pako:${encoded}?${params.toString()}`;
    }

    getMermaidExportScale() {
      return Math.max(6, this.imageExportScale);
    }

    parseSvgNumeric(value) {
      if (value == null) return null;
      const raw = String(value).trim();
      if (!raw || raw.toLowerCase() === 'auto') {
        return null;
      }
      const compact = raw.replace(/\s+/g, '');
      const normalized = compact.replace(/!important$/i, '');
      const lower = normalized.toLowerCase();
      if (
        lower.includes('calc(') ||
        lower.includes('min(') ||
        lower.includes('max(') ||
        lower.includes('var(') ||
        lower.endsWith('%')
      ) {
        return null;
      }
      const unitMatch = normalized.match(/[a-zA-Z]+$/);
      if (unitMatch && unitMatch[0].toLowerCase() !== 'px') {
        // 相对单位缺乏参照，留给 viewBox 等信息推导
        return null;
      }
      const numeric = parseFloat(normalized.replace(/[^0-9.\-eE]/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
    }

    parseSvgDimensions(svgMarkup) {
      if (!svgMarkup) return {};
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
        const svgElement = doc.querySelector('svg');
        if (!svgElement) {
          return {};
        }
        const widthAttr = svgElement.getAttribute('width');
        const heightAttr = svgElement.getAttribute('height');
        const styleAttr = svgElement.getAttribute('style') || '';
        let width = this.parseSvgNumeric(widthAttr);
        let height = this.parseSvgNumeric(heightAttr);

        if ((!width || !height) && styleAttr) {
          const stylePairs = styleAttr
            .split(';')
            .map((item) => item.trim())
            .filter(Boolean);
          for (const pair of stylePairs) {
            const [keyRaw, valRaw] = pair.split(':');
            if (!keyRaw || !valRaw) continue;
            const key = keyRaw.trim().toLowerCase();
            const val = valRaw.trim();
            if (!width && key === 'width') {
              width = this.parseSvgNumeric(val);
            } else if (!height && key === 'height') {
              height = this.parseSvgNumeric(val);
            }
          }
        }

        if ((!width || !height) && svgElement.hasAttribute('viewBox')) {
          const viewBox = svgElement.getAttribute('viewBox');
          const parts = viewBox
            .trim()
            .split(/\s+/)
            .map((part) => this.parseSvgNumeric(part));
          if (parts.length === 4) {
            const [, , vbWidth, vbHeight] = parts;
            if (!width || width <= 0) width = vbWidth;
            if (!height || height <= 0) height = vbHeight;
          }
        }

        if (!width || width <= 0 || !height || height <= 0) {
          return {};
        }

        return { width, height };
      } catch (error) {
        console.warn('解析 SVG 尺寸失败，将使用默认尺寸:', error);
        return {};
      }
    }

    computeExportSize(svgMarkup, image, artifactType) {
      const defaultSize = 1024;
      const dims = this.parseSvgDimensions(svgMarkup);
      const naturalWidth = (image && (image.naturalWidth || image.width)) || null;
      const naturalHeight = (image && (image.naturalHeight || image.height)) || null;
      const baseWidth = dims.width || naturalWidth || defaultSize;
      const baseHeight = dims.height || naturalHeight || defaultSize;
      const safeHeight = baseHeight > 0 ? baseHeight : baseWidth;
      const exportScale =
        artifactType === 'mermaid' ? this.getMermaidExportScale() : this.imageExportScale;
      const targetWidth = Math.max(1, Math.round(baseWidth * exportScale));
      const targetHeight = Math.max(1, Math.round(safeHeight * exportScale));
      return {
        baseWidth,
        baseHeight: safeHeight,
        exportScale,
        targetWidth,
        targetHeight
      };
    }

    async fetchMermaidImageBlob(artifact, options = {}) {
      const code = this.getMermaidCode(artifact);
      if (!code.trim()) {
        throw new Error('缺少 Mermaid 代码，无法导出图像');
      }
      const manifest = this.getActiveManifest();
      const svgContent = await this.getMermaidSvgContent(artifact, manifest);
      const svgElement = this.el.viewer?.querySelector('svg');
      const baseWidth = this.getMermaidImageWidth(svgElement, svgContent);
      const exportMetrics = this.computeExportSize(svgContent, null, artifact.type);
      const exportScale =
        exportMetrics && Number.isFinite(exportMetrics.exportScale)
          ? exportMetrics.exportScale
          : this.getMermaidExportScale();
      const scaledBaseWidth = baseWidth ? Math.round(baseWidth * exportScale) : 0;
      const computedTargetWidth =
        exportMetrics && exportMetrics.targetWidth ? exportMetrics.targetWidth : 0;
      const widthCandidate = Math.max(computedTargetWidth, scaledBaseWidth) || null;
      // 限制远程渲染服务的宽度参数，避免请求过大导致失败
      const MAX_MERMAID_WIDTH = 8192;
      const width =
        widthCandidate && Number.isFinite(widthCandidate)
          ? Math.min(widthCandidate, MAX_MERMAID_WIDTH)
          : null;
      width = width * exportScale;

      const url = this.buildMermaidImageUrl(code, {
        type: options.type || 'png',
        width
      });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('远程生成 Mermaid 图片失败');
      }
      return await response.blob();
    }

    async getSvgMarkupForArtifact(artifact, manifest) {
      if (!artifact) return null;
      if (artifact.type === 'svg') {
        return artifact.content;
      }
      if (artifact.type === 'mermaid') {
        return await this.getMermaidSvgContent(
          artifact,
          manifest || this.getActiveManifest()
        );
      }
      if (artifact.type === 'echarts-option') {
        const svgElement = this.getCurrentEChartsSvgElement();
        if (!svgElement) return null;
        return this.getSvgStringFromElement(svgElement);
      }
      return null;
    }

    openCodeModal(content = '') {
      if (!this.el.codeModal) return;
      if (this.el.codeContent) {
        this.el.codeContent.textContent = content || '';
      }
      this.el.codeModal.classList.add('active');
      this.el.codeModal.style.display = 'flex';
    }

    closeCodeModal() {
      if (!this.el.codeModal) return;
      this.el.codeModal.classList.remove('active');
      this.el.codeModal.style.display = 'none';
    }

    async copyCodeContent() {
      if (!this.el.codeContent) return;
      const text = this.el.codeContent.textContent || '';
      if (!text) {
        alert('没有可复制的内容');
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          alert('代码已复制到剪贴板');
          return;
        } catch (error) {
          console.warn('复制到剪贴板失败:', error);
        }
      }
      // 兼容处理
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        alert('代码已复制到剪贴板');
      } catch (error) {
        console.warn('备用复制失败:', error);
        alert('复制失败，请手动复制');
      } finally {
        document.body.removeChild(textarea);
      }
    }


    cancelActiveStream() {
      if (!this.activeStreamHandle || typeof this.activeStreamHandle.cancel !== 'function') {
        this.pendingCancel = true;
        this.setSendButtonState('terminating');
        return;
      }
      this.pendingCancel = false;
      this.setSendButtonState('terminating');
      try {
        this.activeStreamHandle.cancel();
      } catch (error) {
        console.warn('终止流式请求失败:', error);
      }
    }

    renderActiveArtifact() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const activeId = state.currentArtifactId;
      if (activeId) {
        this.renderArtifact(activeId);
      } else {
        this.showViewerPlaceholder(manifest.ui?.placeholderText || '');
      }
    }

    renderArtifact(artifactId) {
      const manifest = this.getActiveManifest();
      const artifacts = this.runtime.getArtifacts(manifest.id);
      const artifact = artifacts[artifactId];
      if (!artifact) {
        console.warn('未找到图形资源', artifactId);
        return;
      }
      this.runtime.setActiveArtifact(manifest.id, artifactId);
      if (artifact.type === 'svg') {
        this.destroyMermaidPanZoom();
        this.renderSvgArtifact(artifact);
      } else if (artifact.type === 'mermaid') {
        this.renderMermaidArtifact(artifact, manifest);
      } else if (artifact.type === 'echarts-option') {
        this.destroyMermaidPanZoom();
        this.renderEChartsArtifact(artifact);
      }
      this.highlightActivePlaceholder();
      this.updateToolbarState();
    }

    renderSvgArtifact(artifact) {
      this.renderSvgMarkup(artifact.content, this.activeModuleId);
    }

    renderSvgMarkup(svgMarkup, moduleId = this.activeModuleId, options = {}) {
      if (!this.el.viewer || !svgMarkup) return;
      const {
        opacity = 1,
        applyTransform = true,
        wrapperClasses = []
      } = options;
      this.el.viewer.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'svg-content-wrapper';
      if (Array.isArray(wrapperClasses)) {
        wrapperClasses.filter(Boolean).forEach((className) =>
          wrapper.classList.add(className)
        );
      } else if (typeof wrapperClasses === 'string' && wrapperClasses.trim()) {
        wrapper.classList.add(wrapperClasses.trim());
      }
      wrapper.innerHTML = svgMarkup;
      wrapper.style.opacity = opacity;
      this.el.viewer.appendChild(wrapper);
      const uiState = this.runtime.getUiState(moduleId, {
        zoom: 1
      });
      if (applyTransform) {
        wrapper.style.transform = `scale(${uiState.zoom})`;
      } else {
        wrapper.style.transform = '';
      }
      wrapper.style.transformOrigin = 'center top';
    }

    renderEChartsArtifact(artifact) {
      if (!this.el.viewer) return;
      this.el.viewer.innerHTML = '';
      const chartContainer = document.createElement('div');
      chartContainer.id = 'echarts-container';
      chartContainer.style.width = '100%';
      chartContainer.style.height = '100%';
      this.el.viewer.appendChild(chartContainer);

      if (!window.echarts) {
        chartContainer.innerHTML =
          '<p class="text-center text-red-500 font-bold">未加载 ECharts 库</p>';
        return;
      }

      if (this.echartsInstance) {
        this.echartsInstance.dispose();
      }
      this.echartsInstance = window.echarts.init(chartContainer, null, {
        renderer: 'svg',
        useDirtyRect: false
      });
      this.echartsInstance.setOption(artifact.option, true);
    }

    adjustZoom(delta) {
      const manifest = this.getActiveManifest();
      if (!this.isZoomableManifest(manifest)) return;
      const uiState = this.runtime.getUiState(manifest.id, { zoom: 1 });
      const nextZoom = Math.min(
        3,
        Math.max(0.25, parseFloat((uiState.zoom + delta).toFixed(2)))
      );
      this.runtime.updateUiState(manifest.id, { zoom: nextZoom });

      if (manifest.artifact?.type === 'mermaid') {
        if (this.mermaidPanZoom) {
          this.mermaidPanZoom.zoom(nextZoom);
        }
      } else {
        this.renderActiveArtifact();
      }
    }

    resetZoom() {
      const manifest = this.getActiveManifest();
      if (!this.isZoomableManifest(manifest)) return;
      this.runtime.updateUiState(manifest.id, { zoom: 1 });
      if (manifest.artifact?.type === 'mermaid') {
        if (this.mermaidPanZoom) {
          this.mermaidPanZoom.zoom(1);
          this.mermaidPanZoom.resetPan();
        }
      } else {
        this.renderActiveArtifact();
      }
    }

    async downloadArtifact() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      const svgMarkup = await this.getSvgMarkupForArtifact(artifact, manifest);
      if (!svgMarkup) {
        alert('当前图表不支持导出 SVG，请使用导出图片功能');
        return;
      }
      Utils.downloadFile(svgMarkup, `${manifest.id}.svg`, 'image/svg+xml');
    }

    async copyArtifactImage() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      if (artifact.type === 'mermaid') {
        if (!this.copyClipboardSupported) {
          alert('当前环境不支持复制图片到剪贴板');
        } else {
          try {
            const blob = await this.fetchMermaidImageBlob(artifact, {
              type: 'png'
            });
            const clipboardItem = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([clipboardItem]);
            alert('图像已复制到剪贴板');
            return;
          } catch (error) {
            console.warn('远程复制 Mermaid 图片失败，改用本地渲染回退:', error);
          }
        }
      }

      const svgContent = await this.getSvgMarkupForArtifact(artifact, manifest);
      if (!svgContent) {
        alert('暂不支持复制此类型图表到剪贴板');
        return;
      }

      const svgBlob = new Blob([svgContent], {
        type: 'image/svg+xml'
      });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = svgUrl;

      image.onload = async () => {
        const canvas = document.createElement('canvas');
        const { targetWidth, targetHeight } = this.computeExportSize(
          svgContent,
          image,
          artifact.type
        );
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

        const finalize = () => URL.revokeObjectURL(svgUrl);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            finalize();
            alert('复制失败，请稍后再试');
            return;
          }
          try {
            const clipboardItem = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([clipboardItem]);
            alert('图像已复制到剪贴板');
          } catch (error) {
            console.error('复制失败:', error);
            alert('复制失败，请稍后再试');
          } finally {
            finalize();
          }
        });
      };
      image.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        alert('复制失败，请稍后再试');
      };
    }

    async exportArtifactAsImage() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      if (artifact.type === 'mermaid') {
        try {
          const blob = await this.fetchMermaidImageBlob(artifact, {
            type: 'png'
          });
          const url = URL.createObjectURL(blob);
          console.log('url :>> ', url);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${manifest.id}-${Utils.formatDateTime()
            .replace(/\W/g, '')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        } catch (error) {
          console.warn('远程导出 Mermaid 图片失败，改用本地渲染回退:', error);
        }
      }

      const svgContent = await this.getSvgMarkupForArtifact(artifact, manifest);
      if (svgContent) {
        const svgBlob = new Blob([svgContent], {
          type: 'image/svg+xml'
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = svgUrl;
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const { targetWidth, targetHeight } = this.computeExportSize(
            svgContent,
            image,
            artifact.type
          );
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${manifest.id}-${Utils.formatDateTime().replace(/\W/g, '')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(svgUrl);
        };
        image.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          alert('导出图片失败，请稍后再试');
        };
        return;
      }

      if (artifact.type === 'echarts-option') {
        if (!this.echartsInstance) {
          alert('图表实例未准备好，无法导出');
          return;
        }
        const url = this.echartsInstance.getDataURL({
          type: 'png',
          pixelRatio: 2,
          backgroundColor: '#fff'
        });
        const link = document.createElement('a');
        link.href = url;
        link.download = `${manifest.id}-${Utils.formatDateTime().replace(/\\W/g, '')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }

    viewArtifactCode() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      let content = '';
      if (artifact.type === 'svg') {
        content = artifact.content;
      } else if (artifact.type === 'mermaid') {
        content = artifact.code || artifact.content || '';
      } else if (artifact.type === 'echarts-option') {
        content = artifact.optionText || JSON.stringify(artifact.option, null, 2);
      }

      this.openCodeModal(content);
    }

    setSendButtonState(state) {
      if (!this.el.sendButton) return;
      if (state === 'streaming') {
        this.el.sendButton.innerHTML = `
          <span class="flex items-center gap-1 text-red-600 font-bold">
            <iconify-icon icon="ph:hand-palm-bold" class="text-2xl"></iconify-icon>
            <span>终止</span>
          </span>
        `;
        this.el.sendButton.classList.add('terminate-mode');
        this.el.sendButton.title = '终止当前生成';
      } else if (state === 'terminating') {
        this.el.sendButton.innerHTML = `
          <span class="flex items-center gap-1 text-orange-500 font-bold">
            <iconify-icon icon="ph:hourglass-medium-bold" class="text-2xl"></iconify-icon>
            <span>终止中</span>
          </span>
        `;
        this.el.sendButton.classList.add('terminate-mode');
        this.el.sendButton.title = '正在终止生成';
      } else if (state === 'busy') {
        this.el.sendButton.innerHTML = `
          <span class="flex items-center gap-1 text-blue-600 font-bold">
            <iconify-icon icon="ph:clock-bold" class="text-2xl"></iconify-icon>
            <span>处理中</span>
          </span>
        `;
        this.el.sendButton.classList.add('terminate-mode');
        this.el.sendButton.title = '正在处理请求';
      } else {
        this.el.sendButton.innerHTML =
          '<iconify-icon icon="ph:paper-plane-tilt-fill" class="text-3xl"></iconify-icon>';
        this.el.sendButton.classList.remove('terminate-mode');
        this.el.sendButton.title = '发送';
      }
    }

    updateToolbarState() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const hasArtifact = !!state.currentArtifactId;

      const isZoomable = this.isZoomableManifest(manifest);
      if (!isZoomable) {
        this.el.zoomInBtn && (this.el.zoomInBtn.disabled = true);
        this.el.zoomOutBtn && (this.el.zoomOutBtn.disabled = true);
        this.el.zoomResetBtn && (this.el.zoomResetBtn.disabled = true);
      } else {
        const uiState = this.runtime.getUiState(manifest.id, { zoom: 1 });
        if (this.el.zoomInBtn) {
          this.el.zoomInBtn.disabled = !hasArtifact || uiState.zoom >= 3;
        }
        if (this.el.zoomOutBtn) {
          this.el.zoomOutBtn.disabled = !hasArtifact || uiState.zoom <= 0.25;
        }
        if (this.el.zoomResetBtn) {
          this.el.zoomResetBtn.disabled =
            !hasArtifact || Math.abs(uiState.zoom - 1) < 0.01;
        }
      }

      if (this.el.downloadSvgBtn) {
        this.el.downloadSvgBtn.disabled =
          !hasArtifact || !manifest.exports?.allowSvg;
      }
      if (this.el.copyImageBtn) {
        this.el.copyImageBtn.disabled =
          !hasArtifact ||
          !this.copyClipboardSupported ||
          manifest.exports?.allowClipboard === false;
      }
      if (this.el.exportImageBtn) {
        this.el.exportImageBtn.disabled =
          !hasArtifact || !manifest.exports?.allowPng;
      }
      if (this.el.viewCodeBtn) {
        this.el.viewCodeBtn.disabled =
          !hasArtifact || !manifest.exports?.allowCode;
      }
    }

    clearCurrentConversation() {
      const manifest = this.getActiveManifest();
      if (
        !confirm(`确定要清空当前的 ${manifest.label} 对话和图形吗？`)
      ) {
        return;
      }
      this.conversationService.clearHistory(manifest);
      this.runtime.clearArtifacts(manifest.id);
      if (this.echartsInstance) {
        this.echartsInstance.dispose();
        this.echartsInstance = null;
      }
      this.destroyMermaidPanZoom();
      this.renderConversationHistory();
      this.showViewerPlaceholder(manifest.ui?.placeholderText || '');
      this.updateToolbarState();
    }

    highlightActivePlaceholder() {
      if (!this.el.chatHistory) return;
      const placeholders = this.el.chatHistory.querySelectorAll(
        '.svg-placeholder-block'
      );
      placeholders.forEach((node) =>
        node.classList.remove('svg-placeholder-active')
      );
      const activeArtifactId = this.runtime.getActiveArtifactId(
        this.activeModuleId
      );
      if (!activeArtifactId) {
        return;
      }
      const activeNode = this.el.chatHistory.querySelector(
        `.svg-placeholder-block[data-artifact-id="${activeArtifactId}"]`
      );
      if (activeNode) {
        activeNode.classList.add('svg-placeholder-active');
      }
    }

    openConfigModal() {
      if (!this.el.configModal) return;
      this.el.configModal.classList.add('active');
      this.el.configModal.style.display = 'flex';
    }

    closeConfigModal() {
      if (!this.el.configModal) return;
      this.el.configModal.classList.remove('active');
      this.el.configModal.style.display = 'none';
    }

    loadApiConfig() {
      const config = this.apiClient.getConfig();
      if (this.el.apiUrlInput) this.el.apiUrlInput.value = config.url || '';
      if (this.el.apiKeyInput) this.el.apiKeyInput.value = config.key || '';
      if (this.el.apiModelInput) this.el.apiModelInput.value = config.model || '';
    }

    async testAPI() {
      try {
        this.setConfigStatus('loading', '正在测试连接...');
        await this.apiClient.testConnection();
        this.setConfigStatus('success', '连接成功，可以开始生成图表');
      } catch (error) {
        this.setConfigStatus('error', error.message);
      }
    }

    saveAPI() {
      const config = {
        url: this.el.apiUrlInput?.value.trim(),
        key: this.el.apiKeyInput?.value.trim(),
        model: this.el.apiModelInput?.value.trim()
      };
      if (!config.url || !config.key || !config.model) {
        this.setConfigStatus('error', '请填写完整的配置');
        return;
      }
      this.apiClient.saveConfig(config);
      this.setConfigStatus('success', '配置已保存');
      setTimeout(() => this.closeConfigModal(), 600);
    }

    setConfigStatus(type, message) {
      if (!this.el.configStatus || !this.el.statusText) return;
      this.el.configStatus.classList.remove('hidden');
      this.el.statusText.textContent = message;
      this.el.configStatus.classList.remove(
        'border-gray-300',
        'bg-gray-50',
        'text-gray-600',
        'border-green-500',
        'bg-green-50',
        'text-green-700',
        'border-red-500',
        'bg-red-50',
        'text-red-700',
        'border-blue-500',
        'bg-blue-50',
        'text-blue-700'
      );
      if (type === 'success') {
        this.el.configStatus.classList.add(
          'border-green-500',
          'bg-green-50',
          'text-green-700'
        );
      } else if (type === 'error') {
        this.el.configStatus.classList.add(
          'border-red-500',
          'bg-red-50',
          'text-red-700'
        );
      } else if (type === 'loading') {
        this.el.configStatus.classList.add(
          'border-blue-500',
          'bg-blue-50',
          'text-blue-700'
        );
      } else {
        this.el.configStatus.classList.add(
          'border-gray-300',
          'bg-gray-50',
          'text-gray-600'
        );
      }
    }
  }

  global.AppShell = AppShell;
})(window);
