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
          this.downloadArtifact()
        );
      }
      if (this.el.copyImageBtn) {
        this.el.copyImageBtn.addEventListener('click', () =>
          this.copyArtifactImage()
        );
      }
      if (this.el.exportImageBtn) {
        this.el.exportImageBtn.addEventListener('click', () =>
          this.exportArtifactAsImage()
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

      history.forEach((message) => {
        const bubble = this.buildMessageBubble(message);
        this.el.chatHistory.appendChild(bubble);
      });

      Utils.scrollToBottom(this.el.chatHistory);
    }

    buildMessageBubble(message) {
      const wrapper = document.createElement('div');
      const manifest = this.getActiveManifest();
      if (message.type === 'user') {
        wrapper.className = 'flex justify-end';
        wrapper.innerHTML = `
          <div class="chat-bubble-user message-with-delete" data-message-id="${message.id}">
            <div>${Utils.escapeHtml(message.content)}</div>
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
          </div>
        `;
      } else {
        wrapper.className = 'flex justify-start';
        const parsedContent =
          typeof marked !== 'undefined'
            ? marked.parse(message.content)
            : Utils.escapeHtml(message.content);
        const artifactHtml = message.artifactId
          ? `<div class="svg-placeholder-block" data-artifact-id="${message.artifactId}" data-module-id="${manifest.id}">
              📊 点击查看最新图表
            </div>`
          : '';
        wrapper.innerHTML = `
          <div class="chat-bubble-ai message-with-delete" data-message-id="${message.id}">
            <div class="message-body">${parsedContent}</div>
            ${artifactHtml}
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

      this.startStreaming(manifest, context);
    }

    startStreaming(manifest, context) {
      const messageId = Utils.generateId('msg');
      const container = this.createStreamingContainer(messageId);
      this.el.chatHistory.appendChild(container);
      Utils.scrollToBottom(this.el.chatHistory);

      let fullContent = '';

      const finalize = ({ aborted = false } = {}) => {
        if (!this.isProcessing) return;
        this.isProcessing = false;
        this.setSendButtonState('idle');
        this.el.sendButton.disabled = false;
        this.activeStreamHandle = null;
        this.pendingCancel = false;

        if (aborted) {
          container.remove();
          return;
        }

        this.finalizeAssistantMessage(manifest, messageId, fullContent);
      };

      const handleChunk = (chunk) => {
        const delta = chunk?.choices?.[0]?.delta?.content || '';
        if (!delta) return;
        fullContent += delta;
        this.updateStreamingContent(container, fullContent);
      };

      const handleComplete = (info) => {
        finalize(info);
      };

      this.apiClient
        .generateModuleStream(
          manifest,
          context.userMessage.content,
          context.contextMessages,
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

    finalizeAssistantMessage(manifest, messageId, fullContent) {
      const container = this.el.chatHistory.querySelector(
        `[data-message-id="${messageId}"]`
      );
      if (container) {
        container.remove();
      }

      const timestamp = new Date().toISOString();
      let artifactId = null;
      let artifactPayload = null;

      if (manifest.artifact?.parser) {
        try {
          const parsed = manifest.artifact.parser(fullContent);
          if (manifest.artifact.type === 'svg' && parsed.svgContent) {
            artifactId = Utils.generateId('svg');
            const svgBody = parsed.svgContent.trim().endsWith('</svg>')
              ? parsed.svgContent.trim()
              : `${parsed.svgContent.trim()}\n</svg>`;
            artifactPayload = {
              id: artifactId,
              type: manifest.artifact.type,
              content: svgBody,
              messageId,
              timestamp
            };
          } else if (
            manifest.artifact.type === 'echarts-option' &&
            parsed.option
          ) {
            artifactId = Utils.generateId('chart');
            artifactPayload = {
              id: artifactId,
              type: manifest.artifact.type,
              option: parsed.option,
              optionText: parsed.optionText || JSON.stringify(parsed.option),
              messageId,
              timestamp
            };
          }
        } catch (error) {
          console.warn('解析助手内容失败:', error);
        }
      }

      const messageRecord = {
        id: messageId,
        type: 'ai',
        content: fullContent,
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
        this.renderSvgArtifact(artifact);
      } else if (artifact.type === 'echarts-option') {
        this.renderEChartsArtifact(artifact);
      }
      this.updateToolbarState();
    }

    renderSvgArtifact(artifact) {
      if (!this.el.viewer) return;
      this.el.viewer.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'svg-content-wrapper';
      wrapper.innerHTML = artifact.content;
      this.el.viewer.appendChild(wrapper);
      const uiState = this.runtime.getUiState(this.activeModuleId, {
        zoom: 1
      });
      wrapper.style.transform = `scale(${uiState.zoom})`;
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
        renderer: 'canvas'
      });
      this.echartsInstance.setOption(artifact.option, true);
    }

    adjustZoom(delta) {
      const manifest = this.getActiveManifest();
      if (manifest.artifact?.type !== 'svg') return;
      const uiState = this.runtime.getUiState(manifest.id, { zoom: 1 });
      const nextZoom = Math.min(
        3,
        Math.max(0.25, parseFloat((uiState.zoom + delta).toFixed(2)))
      );
      this.runtime.updateUiState(manifest.id, { zoom: nextZoom });
      this.renderActiveArtifact();
    }

    resetZoom() {
      const manifest = this.getActiveManifest();
      if (manifest.artifact?.type !== 'svg') return;
      this.runtime.updateUiState(manifest.id, { zoom: 1 });
      this.renderActiveArtifact();
    }

    downloadArtifact() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      if (artifact.type === 'svg') {
        Utils.downloadFile(artifact.content, `${manifest.id}.svg`, 'image/svg+xml');
      } else {
        alert('当前图表不支持导出 SVG，请使用导出图片功能');
      }
    }

    async copyArtifactImage() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      if (artifact.type !== 'svg') {
        alert('暂不支持复制此类型图表到剪贴板');
        return;
      }

      const svgBlob = new Blob([artifact.content], {
        type: 'image/svg+xml'
      });
      const svgUrl = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = svgUrl;

      image.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width * this.imageExportScale;
        canvas.height = image.height * this.imageExportScale;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(this.imageExportScale, 0, 0, this.imageExportScale, 0, 0);
        ctx.drawImage(image, 0, 0);

        canvas.toBlob(async (blob) => {
          try {
            const clipboardItem = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([clipboardItem]);
            alert('图像已复制到剪贴板');
          } catch (error) {
            console.error('复制失败:', error);
            alert('复制失败，请稍后再试');
          } finally {
            URL.revokeObjectURL(svgUrl);
          }
        });
      };
    }

    exportArtifactAsImage() {
      const manifest = this.getActiveManifest();
      const state = this.runtime.getState(manifest.id);
      const id = state.currentArtifactId;
      if (!id) return;
      const artifact = state.artifacts[id];
      if (!artifact) return;

      if (artifact.type === 'svg') {
        const svgBlob = new Blob([artifact.content], {
          type: 'image/svg+xml'
        });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = svgUrl;
        image.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = image.width * this.imageExportScale;
          canvas.height = image.height * this.imageExportScale;
          const ctx = canvas.getContext('2d');
          ctx.setTransform(this.imageExportScale, 0, 0, this.imageExportScale, 0, 0);
          ctx.drawImage(image, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = pngUrl;
          link.download = `${manifest.id}-${Utils.formatDateTime().replace(/\\W/g, '')}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(svgUrl);
        };
      } else if (artifact.type === 'echarts-option') {
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
      } else if (artifact.type === 'echarts-option') {
        content = artifact.optionText || JSON.stringify(artifact.option, null, 2);
      }

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      setTimeout(() => URL.revokeObjectURL(url), 1000 * 30);
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

      if (manifest.artifact?.type !== 'svg') {
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
          manifest.artifact?.type !== 'svg' ||
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
      this.renderConversationHistory();
      this.showViewerPlaceholder(manifest.ui?.placeholderText || '');
      this.updateToolbarState();
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
