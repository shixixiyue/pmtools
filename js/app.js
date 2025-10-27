/**
 * 应用核心逻辑
 */

// 配置Markdown解析器
if (typeof marked !== 'undefined') {
  marked.setOptions({
    breaks: true, // 支持换行
    gfm: true, // 支持GitHub风格的Markdown
    sanitize: false, // 允许HTML（因为我们自己处理SVG）
    smartLists: true, // 智能列表
    smartypants: true // 智能标点
  });
}

class ProductCanvasApp {
  constructor() {
    this.currentMode = 'canvas'; // 'canvas' 或 'swot'
    this.svgStorage = {};
    this.currentSvgId = null;
    this.conversationHistory = {};
    this.isProcessing = false;
    this.activeStreamHandle = null;
    this.svgZoom = { canvas: 1, swot: 1 };
    this.activeSvgPlaceholder = null;
    this.pendingSvgId = null;
    this.pendingCancel = false;
    this.copyClipboardSupported = typeof ClipboardItem !== 'undefined' && !!navigator.clipboard;
    const deviceScale = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    this.imageExportScale = Math.min(4, Math.max(2, deviceScale));
    
    this.initElements();
    this.initEventListeners();
    this.loadSavedData();
    this.updateModeUI();
    this.setSendButtonState('idle');
  }

  getModeDisplayName(mode = this.currentMode) {
    return mode === 'canvas' ? '产品画布' : 'SWOT分析';
  }

  // 初始化DOM元素引用
  initElements() {
    // 模式切换按钮
    this.canvasBtn = document.getElementById('canvas-mode-btn');
    this.swotBtn = document.getElementById('swot-mode-btn');
    this.pageTitle = document.getElementById('page-title');
    
    // 对话相关
    this.chatInput = document.getElementById('chat-input');
    this.sendButton = document.getElementById('send-button');
    this.clearHistoryBtn = document.getElementById('clear-history-btn');
    this.chatHistory = document.getElementById('chat-history');
    
    // SVG显示
    this.svgViewer = document.getElementById('svg-viewer');
    this.placeholderText = this.svgViewer.querySelector('#placeholder-text');
    
    // 底部操作按钮
    this.zoomOutBtn = document.getElementById('zoom-out-btn');
    this.zoomInBtn = document.getElementById('zoom-in-btn');
    this.zoomResetBtn = document.getElementById('zoom-reset-btn');
    this.downloadSvgBtn = document.getElementById('download-svg-btn');
    this.copyImageBtn = document.getElementById('copy-image-btn');
    this.exportImageBtn = document.getElementById('export-image-btn');
    this.viewCodeBtn = document.getElementById('view-code-btn');
    
    // API配置模态窗
    this.settingsBtn = document.getElementById('settings-btn');
    this.configModal = document.getElementById('config-modal');
    this.closeModalBtn = document.getElementById('close-modal-btn');
    this.apiUrlInput = document.getElementById('api-url');
    this.apiKeyInput = document.getElementById('api-key');
    this.apiModelInput = document.getElementById('api-model');
    this.testApiBtn = document.getElementById('test-api-btn');
    this.saveConfigBtn = document.getElementById('save-config-btn');
    this.configStatus = document.getElementById('config-status');
    this.statusText = document.getElementById('status-text');
  }

  // 初始化事件监听器
  initEventListeners() {
    // 模式切换
    this.canvasBtn.addEventListener('click', () => this.switchMode('canvas'));
    this.swotBtn.addEventListener('click', () => this.switchMode('swot'));
    
    // 发送消息
    this.sendButton.addEventListener('click', () => {
      if (this.isProcessing) {
        this.cancelActiveStream();
      } else {
        this.sendMessage();
      }
    });
    this.clearHistoryBtn.addEventListener('click', () => this.clearCurrentConversation());
    
    // 输入框事件
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.isProcessing) {
          this.sendMessage();
        }
      }
    });
    
    // 自动调整输入框高度
    this.chatInput.addEventListener('input', () => {
      Utils.autoResizeTextarea(this.chatInput);
    });
    
    // 底部操作按钮
    if (this.zoomOutBtn) this.zoomOutBtn.addEventListener('click', () => this.adjustSvgZoom(-0.25));
    if (this.zoomInBtn) this.zoomInBtn.addEventListener('click', () => this.adjustSvgZoom(0.25));
    if (this.zoomResetBtn) this.zoomResetBtn.addEventListener('click', () => this.resetSvgZoom());
    this.downloadSvgBtn.addEventListener('click', () => this.downloadSVG());
    if (this.copyImageBtn) {
      if (this.copyClipboardSupported) {
        this.copyImageBtn.addEventListener('click', () => this.copySvgToClipboard());
      } else {
        this.copyImageBtn.disabled = true;
        this.copyImageBtn.title = '当前浏览器不支持复制图片到剪贴板';
      }
    }
    this.exportImageBtn.addEventListener('click', () => this.exportAsImage());
    this.viewCodeBtn.addEventListener('click', () => this.viewSVGCode());
    
    // API配置模态窗
    this.settingsBtn.addEventListener('click', () => this.openConfigModal());
    this.closeModalBtn.addEventListener('click', () => this.closeConfigModal());
    this.configModal.addEventListener('click', (e) => {
      if (e.target === this.configModal) {
        this.closeConfigModal();
      }
    });
    
    this.testApiBtn.addEventListener('click', () => this.testAPIConnection());
    this.saveConfigBtn.addEventListener('click', () => this.saveAPIConfig());
  }

  // 加载保存的数据
  loadSavedData() {
    // 加载模式
    const savedMode = Utils.storage.get('currentMode', 'canvas');
    this.currentMode = savedMode;
    
    // 加载对话历史（按模式分别存储）
    const savedCanvasHistory = Utils.storage.get('canvasHistory', []);
    const savedSwotHistory = Utils.storage.get('swotHistory', []);
    this.conversationHistory = {
      canvas: savedCanvasHistory,
      swot: savedSwotHistory
    };
    this.renderConversationHistory();
    
    // 加载SVG存储（按模式分别存储）
    const savedCanvasSVGs = Utils.storage.get('canvasSVGs', {});
    const savedSwotSVGs = Utils.storage.get('swotSVGs', {});
    this.svgStorage = {
      canvas: savedCanvasSVGs,
      swot: savedSwotSVGs
    };

    this.renderSvgViewerForMode();
    this.setSendButtonState('idle');
    
    // 加载API配置
    const apiConfig = window.apiClient.getConfig();
    this.apiUrlInput.value = apiConfig.url || '';
    this.apiKeyInput.value = apiConfig.key || '';
    this.apiModelInput.value = apiConfig.model || '';
  }

  // 切换模式
  switchMode(mode) {
    if (this.currentMode === mode) return;
    
    this.currentMode = mode;
    Utils.storage.set('currentMode', mode);
    this.currentSvgId = null;
    this.showSvgPlaceholder();
    this.updateModeUI();
    this.renderConversationHistory();
    this.renderSvgViewerForMode();
  }

  // 更新模式UI
  updateModeUI() {
    const isCanvas = this.currentMode === 'canvas';

    if (isCanvas) {
      this.canvasBtn.classList.add('mode-btn-active');
      this.canvasBtn.classList.remove('mode-btn-inactive');
      this.swotBtn.classList.remove('mode-btn-active');
      this.swotBtn.classList.add('mode-btn-inactive');
    } else {
      this.swotBtn.classList.add('mode-btn-active');
      this.swotBtn.classList.remove('mode-btn-inactive');
      this.canvasBtn.classList.remove('mode-btn-active');
      this.canvasBtn.classList.add('mode-btn-inactive');
    }

    this.pageTitle.textContent = isCanvas ? '产品画布' : 'SWOT分析';

    if (!this.currentSvgId) {
      const placeholder = this.svgViewer.querySelector('#placeholder-text');
      if (placeholder) {
        placeholder.textContent = `生成的${this.getModeDisplayName()}将在此处显示`;
      }
    }
  }

  setSendButtonState(state) {
    this.sendButtonState = state;
    if (!this.sendButton) return;

    if (state === 'streaming') {
      this.sendButton.innerHTML = `
        <span class="flex items-center gap-1 text-red-600 font-bold">
          <iconify-icon icon="ph:hand-palm-bold" class="text-2xl"></iconify-icon>
          <span>终止</span>
        </span>
      `;
      this.sendButton.classList.add('terminate-mode');
      this.sendButton.title = '终止当前生成';
    } else if (state === 'terminating') {
      this.sendButton.innerHTML = `
        <span class="flex items-center gap-1 text-orange-500 font-bold">
          <iconify-icon icon="ph:hourglass-medium-bold" class="text-2xl"></iconify-icon>
          <span>终止中</span>
        </span>
      `;
      this.sendButton.classList.add('terminate-mode');
      this.sendButton.title = '正在终止生成';
    } else if (state === 'busy') {
      this.sendButton.innerHTML = `
        <span class="flex items-center gap-1 text-blue-600 font-bold">
          <iconify-icon icon="ph:clock-bold" class="text-2xl"></iconify-icon>
          <span>处理中</span>
        </span>
      `;
      this.sendButton.classList.add('terminate-mode');
      this.sendButton.title = '正在处理请求';
    } else {
      this.sendButton.innerHTML = '<iconify-icon icon="ph:paper-plane-tilt-fill" class="text-3xl"></iconify-icon>';
      this.sendButton.classList.remove('terminate-mode');
      this.sendButton.title = '发送';
    }
  }

  showSvgPlaceholder() {
    const label = this.getModeDisplayName();
    this.currentSvgId = null;
    this.svgViewer.innerHTML = `
      <div id="svg-placeholder" class="text-center text-gray-400">
        <iconify-icon icon="ph:image-square" class="text-6xl mx-auto text-purple-400"></iconify-icon>
        <p class="mt-2 font-bold" id="placeholder-text">生成的${label}将在此处显示</p>
      </div>
    `;
    this.placeholderText = this.svgViewer.querySelector('#placeholder-text');
    this.setActivePlaceholder(null);
    this.updateZoomButtons();
  }

  renderSvgViewerForMode() {
    const svgStore = this.svgStorage[this.currentMode] || {};
    const history = this.conversationHistory[this.currentMode] || [];

    let latestSvgId = null;
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];
      if (message.type !== 'ai') continue;
      for (const [svgId, svg] of Object.entries(svgStore)) {
        if (svg.messageId === message.id) {
          latestSvgId = svgId;
          break;
        }
      }
      if (latestSvgId) break;
    }

    if (latestSvgId && svgStore[latestSvgId]) {
      this.currentSvgId = latestSvgId;
      this.mountSvgMarkup(svgStore[latestSvgId].content);
      this.setActivePlaceholder(latestSvgId);
    } else {
      this.currentSvgId = null;
      this.showSvgPlaceholder();
    }

    this.updateZoomButtons();
  }

  adjustSvgZoom(delta) {
    const current = this.svgZoom[this.currentMode] || 1;
    const next = Math.min(3, Math.max(0.25, parseFloat((current + delta).toFixed(2))));
    this.svgZoom[this.currentMode] = next;
    this.applySvgZoom();
  }

  resetSvgZoom() {
    this.svgZoom[this.currentMode] = 1;
    this.applySvgZoom();
  }

  applySvgZoom() {
    const zoom = this.svgZoom[this.currentMode] || 1;
    const wrapper = this.svgViewer.querySelector('.svg-content-wrapper');
    if (wrapper) {
      wrapper.style.transform = `scale(${zoom})`;
      wrapper.style.transformOrigin = 'center top';
    }
    this.updateZoomButtons();
  }

  updateZoomButtons() {
    if (!this.zoomInBtn || !this.zoomOutBtn || !this.zoomResetBtn) return;
    const hasActiveSvg = !!this.currentSvgId && !!(this.svgStorage[this.currentMode] || {})[this.currentSvgId];
    const zoom = this.svgZoom[this.currentMode] || 1;

    const disableControls = !hasActiveSvg;
    this.zoomInBtn.disabled = disableControls || zoom >= 3;
    this.zoomOutBtn.disabled = disableControls || zoom <= 0.25;
    this.zoomResetBtn.disabled = disableControls || Math.abs(zoom - 1) < 0.01;

    if (!hasActiveSvg) {
      if (this.copyImageBtn) this.copyImageBtn.disabled = true;
      this.downloadSvgBtn.disabled = true;
      this.exportImageBtn.disabled = true;
      this.viewCodeBtn.disabled = true;
    } else {
      if (this.copyImageBtn) this.copyImageBtn.disabled = !this.copyClipboardSupported;
      this.downloadSvgBtn.disabled = false;
      this.exportImageBtn.disabled = false;
      this.viewCodeBtn.disabled = false;
    }
  }

  setActivePlaceholder(svgId) {
    const previousActive = this.chatHistory.querySelectorAll('.svg-placeholder-active');
    previousActive.forEach(el => el.classList.remove('svg-placeholder-active'));
    if (svgId) {
      const next = this.chatHistory.querySelector(`.svg-placeholder-block[data-svg-id="${svgId}"], .svg-drawing-placeholder[data-svg-id="${svgId}"]`);
      if (next) {
        next.classList.add('svg-placeholder-active');
        this.activeSvgPlaceholder = svgId;
      } else {
        this.activeSvgPlaceholder = null;
      }
    } else {
      this.activeSvgPlaceholder = null;
    }
  }

  mountSvgMarkup(svgMarkup, temporary = false) {
    this.svgViewer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'svg-content-wrapper';
    wrapper.innerHTML = svgMarkup;
    this.svgViewer.appendChild(wrapper);
    this.placeholderText = null;
    if (!temporary) {
      this.applySvgZoom();
    } else {
      const zoom = this.svgZoom[this.currentMode] || 1;
      wrapper.style.transform = `scale(${zoom})`;
      wrapper.style.transformOrigin = 'center top';
    }
  }

  renderSvgContent(svgId) {
    const store = this.svgStorage[this.currentMode] || {};
    if (!svgId || !store[svgId]) {
      this.showSvgPlaceholder();
      return;
    }
    this.currentSvgId = svgId;
    this.mountSvgMarkup(store[svgId].content);
    this.setActivePlaceholder(svgId);
    this.applySvgZoom();
  }

  renderTemporarySvg(svgMarkup) {
    this.mountSvgMarkup(svgMarkup, true);
  }

  buildContextForUserMessage(userIndex) {
    const history = this.conversationHistory[this.currentMode] || [];
    if (userIndex < 0 || userIndex >= history.length) {
      return null;
    }

    const target = history[userIndex];
    if (!target || target.type !== 'user') {
      return null;
    }

    const start = Math.max(0, userIndex - 10);
    const contextSlice = history.slice(start, userIndex);
    const contextMessages = contextSlice
      .filter(msg => msg.type === 'user' || msg.type === 'ai')
      .map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

    return {
      userMessage: target.content,
      contextMessages
    };
  }

  // 发送消息
  async sendMessage() {
    const message = this.chatInput.value.trim();
    if (!message || this.isProcessing) return;

    if (!window.apiClient.isConfigValid()) {
      alert('⚠️ 请先配置API设置！点击右上角齿轮图标进行配置。');
      this.openConfigModal();
      return;
    }

    this.pendingCancel = false;
    this.isProcessing = true;

    this.addUserMessage(message);
    this.chatInput.value = '';
    Utils.autoResizeTextarea(this.chatInput);

    const history = this.conversationHistory[this.currentMode] || [];
    const targetIndex = history.length - 1;
    const payload = this.buildContextForUserMessage(targetIndex);
    if (!payload) {
      console.warn('无法构建上下文，终止发送');
      this.isProcessing = false;
      this.setSendButtonState('idle');
      return;
    }

    this.setSendButtonState('streaming');
    this.sendButton.disabled = false;

    try {
      await this.startStreamingMessage(payload.userMessage, payload.contextMessages);
    } catch (error) {
      console.error('发送消息失败:', error);
      this.addErrorMessage(error.message);
      this.isProcessing = false;
      this.setSendButtonState('idle');
      this.activeStreamHandle = null;
      this.sendButton.disabled = false;
    }
  }

  // 开始流式接收消息
  async startStreamingMessage(userMessage, contextMessages) {
    const messageId = Utils.generateId('msg');
    const messageContainer = this.createStreamingMessageContainer(messageId);
    this.chatHistory.appendChild(messageContainer);
    Utils.scrollToBottom(this.chatHistory);

    let fullContent = '';
    let svgStarted = false;
    let svgContent = '';
    let svgId = null;
    let beforeText = '';

    let streamClosed = false;
    this.activeStreamHandle = null;

    const finalizeStream = (info = {}) => {
      if (streamClosed) return;
      streamClosed = true;

      const trimmedContent = fullContent.trim();
      if (!trimmedContent && !svgId) {
        const bubble = this.chatHistory.querySelector(`[data-message-id="${messageId}"]`);
        if (bubble) {
          const wrapper = bubble.closest('.flex');
          if (wrapper) wrapper.remove();
        }
      } else {
        this.finalizeStreamingMessage(messageId, fullContent, svgId);
      }

      this.isProcessing = false;
      this.setSendButtonState('idle');
      this.sendButton.disabled = false;
      this.activeStreamHandle = null;
      this.pendingCancel = false;
    };

    const onChunk = (chunk) => {
      if (
        streamClosed ||
        !chunk ||
        !chunk.choices ||
        !chunk.choices[0] ||
        !chunk.choices[0].delta
      ) {
        return;
      }

      const content = chunk.choices[0].delta.content || '';
      if (!content) return;

      fullContent += content;

      if (!svgStarted) {
        const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
        if (svgStartMatch) {
          svgStarted = true;
          svgId = svgId || Utils.generateId('svg');
          this.pendingSvgId = svgId;

          const svgStartIndex = svgStartMatch.index;
          beforeText = fullContent.substring(0, svgStartIndex);

          this.updateStreamingMessageWithPlaceholder(messageContainer, beforeText, svgId);
          this.setActivePlaceholder(svgId);

          this.svgViewer.innerHTML = `
            <div class="flex items-center justify-center h-full">
              <div class="text-center">
                <iconify-icon icon="ph:spinner-gap" class="text-6xl text-purple-500 animate-spin"></iconify-icon>
                <p class="mt-4 font-bold text-gray-600">正在绘制${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}...</p>
              </div>
            </div>
          `;
          this.updateZoomButtons();
        }
      }

      if (svgStarted) {
        if (fullContent.includes('</svg>')) {
          const svgEndIndex = fullContent.indexOf('</svg>') + 6;
          const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
          if (svgStartMatch) {
            const svgStartIndex = svgStartMatch.index;
            let svgWithMarkers = fullContent.substring(svgStartIndex, svgEndIndex);

            svgContent = svgWithMarkers.replace(/```(?:svg)?\s*/, '').replace(/```$/, '').trim();
            if (!svgContent.endsWith('</svg>')) {
              svgContent += '</svg>';
            }

            this.svgStorage[this.currentMode][svgId] = {
              content: svgContent,
              messageId,
              mode: this.currentMode,
              timestamp: new Date().toISOString()
            };

            this.pendingSvgId = null;
            this.renderSvgContent(svgId);
            this.updatePlaceholderToClickable(messageContainer, svgId);

            svgStarted = false;
            const afterText = fullContent.substring(svgEndIndex);
            this.updateStreamingMessageAfterSVG(messageContainer, beforeText, svgId, afterText);
          }
        } else {
          const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
          if (svgStartMatch) {
            const svgStartIndex = svgStartMatch.index;
            let svgWithMarkers = fullContent.substring(svgStartIndex);

            svgContent = svgWithMarkers.replace(/```(?:svg)?\s*/, '').replace(/```$/, '').trim();
            let tempSvgContent = svgContent;
            if (!tempSvgContent.endsWith('</svg>')) {
              tempSvgContent += '</svg>';
            }

            this.renderTemporarySvg(tempSvgContent);
          }
        }
      } else {
        this.updateStreamingMessage(messageContainer, fullContent);
      }
    };

    const onComplete = (info = {}) => {
      finalizeStream(info);
    };

    try {
      const streamHandle = await (
        this.currentMode === 'canvas'
          ? window.apiClient.generateProductCanvasStream(userMessage, contextMessages, onChunk, onComplete)
          : window.apiClient.generateSWOTAnalysisStream(userMessage, contextMessages, onChunk, onComplete)
      );

      this.activeStreamHandle = streamHandle;

      if (this.pendingCancel) {
        const shouldCancel = this.pendingCancel;
        this.pendingCancel = false;
        this.cancelActiveStream();
      }

      await streamHandle.finished;

      if (!streamClosed) {
        finalizeStream({ aborted: false });
      }
    } catch (error) {
      streamClosed = true;
      this.activeStreamHandle = null;
      this.isProcessing = false;
      this.setSendButtonState('idle');
      this.sendButton.disabled = false;
      this.pendingCancel = false;

      const bubble = this.chatHistory.querySelector(`[data-message-id="${messageId}"]`);
      if (bubble) {
        const wrapper = bubble.closest('.flex');
        if (wrapper) wrapper.remove();
      }

      if (error && error.name === 'AbortError') {
        return;
      }

      console.error('发送消息失败:', error);
      this.addErrorMessage(error.message || '生成失败');
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

  // 创建流式消息容器
  createStreamingMessageContainer(messageId) {
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

  // 更新流式消息内容
  updateStreamingMessage(container, content) {
    const contentDiv = container.querySelector('.typing-cursor');
    if (contentDiv) {
      // 使用Markdown解析内容
      if (typeof marked !== 'undefined') {
        contentDiv.innerHTML = marked.parse(content);
      } else {
        contentDiv.textContent = content;
      }
      Utils.scrollToBottom(this.chatHistory);
    }
  }
  
  // 更新流式消息内容并显示SVG占位符
  updateStreamingMessageWithPlaceholder(container, beforeText, svgId) {
    // 使用Markdown解析beforeText
    const parsedBeforeText = typeof marked !== 'undefined' ? marked.parse(beforeText) : Utils.escapeHtml(beforeText);
    
    container.innerHTML = `
      <div class="chat-bubble-ai relative streaming-text" data-message-id="${container.dataset.messageId}">
        <div>
          ${parsedBeforeText}
          <div class="svg-drawing-placeholder" data-svg-id="${svgId}">
            <span class="svg-drawing-text">🎨 正在绘制${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}...</span>
          </div>
          <div class="typing-cursor"></div>
        </div>
      </div>
    `;
    Utils.scrollToBottom(this.chatHistory);
  }
  
  // 更新占位符为可点击状态
  updatePlaceholderToClickable(container, svgId) {
    const placeholder = container.querySelector('.svg-drawing-placeholder');
    if (placeholder) {
      placeholder.classList.remove('svg-drawing-placeholder');
      placeholder.classList.add('svg-placeholder-block');
      placeholder.setAttribute('data-svg-id', svgId);
      placeholder.innerHTML = `📊 点击查看${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG`;
      placeholder.setAttribute('onclick', `app.viewSVG('${svgId}')`);
      if (this.currentSvgId === svgId) {
        placeholder.classList.add('svg-placeholder-active');
      }
    }
  }
  
  // 更新SVG后的消息内容
  updateStreamingMessageAfterSVG(container, beforeText, svgId, afterText) {
    const parsedBeforeText = typeof marked !== 'undefined' ? marked.parse(beforeText) : Utils.escapeHtml(beforeText);
    const parsedAfterText = typeof marked !== 'undefined' ? marked.parse(afterText) : Utils.escapeHtml(afterText);
    const placeholderClass = this.currentSvgId === svgId ? 'svg-placeholder-block svg-placeholder-active' : 'svg-placeholder-block';

    container.innerHTML = `
      <div class="chat-bubble-ai relative streaming-text" data-message-id="${container.dataset.messageId}">
        <div>
          ${parsedBeforeText}
          <div class="${placeholderClass}" data-svg-id="${svgId}" onclick="app.viewSVG('${svgId}')">
            📊 点击查看${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
          </div>
          <div class="typing-cursor">${parsedAfterText}</div>
        </div>
      </div>
    `;
    Utils.scrollToBottom(this.chatHistory);
  }

  buildActionToolbar(messageId, { allowRegenerate = false, allowRollback = true } = {}) {
    const actions = [];

    if (allowRollback) {
      actions.push(`
        <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" data-action="rollback" onclick="app.rollbackToMessage('${messageId}')">
          <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
          <span>退回</span>
        </button>
      `);
    }

    if (allowRegenerate) {
      actions.push(`
        <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" data-action="regenerate" onclick="app.regenerateMessage('${messageId}')">
          <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
          <span>重新生成</span>
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

  // 组装标准化的SVG消息字符串
  buildSVGMessageContent(beforeText = '', svgBody = '', afterText = '') {
    const segments = [];
    const trimmedBefore = (beforeText || '').trim();
    const trimmedAfter = (afterText || '').trim();
    const trimmedSvg = (svgBody || '').trim();

    if (trimmedBefore) {
      segments.push(trimmedBefore);
    }

    if (trimmedSvg) {
      segments.push('```svg');
      segments.push(trimmedSvg);
      segments.push('```');
    }

    if (trimmedAfter) {
      segments.push(trimmedAfter);
    }

    return segments.join('\n\n').trim();
  }

  // 完成流式消息
  finalizeStreamingMessage(messageId, fullContent, svgId = null) {
    this.pendingSvgId = null;
    const parsed = Utils.parseSVGResponse(fullContent);
    const timestamp = new Date().toISOString();

    const message = {
      id: messageId,
      type: 'ai',
      content: '',
      timestamp
    };

    let targetSvgId = svgId || null;

    if (parsed.svgContent && parsed.svgContent.includes('<svg')) {
      const svgBody = parsed.svgContent.trim().endsWith('</svg>')
        ? parsed.svgContent.trim()
        : `${parsed.svgContent.trim()}
</svg>`;

      if (!targetSvgId || !this.svgStorage[this.currentMode][targetSvgId]) {
        targetSvgId = targetSvgId || Utils.generateId('svg');
      }

      this.svgStorage[this.currentMode][targetSvgId] = {
        content: svgBody,
        messageId,
        mode: this.currentMode,
        timestamp
      };

      this.currentSvgId = targetSvgId;
      this.svgViewer.innerHTML = svgBody;

      message.content = this.buildSVGMessageContent(parsed.beforeText, svgBody, parsed.afterText);
    } else {
      const sanitizedText = fullContent.replace(/^[\s`]+/, '').replace(/[\s`]+$/, '').trim();
      message.content = sanitizedText;
    }

    this.conversationHistory[this.currentMode].push(message);

    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);

    this.renderConversationHistory();
    this.renderSvgViewerForMode();
    Utils.scrollToBottom(this.chatHistory);
  }

  // 清空当前对话
  clearCurrentConversation() {
    if (!confirm(`确定要清空当前的${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}对话吗？`)) {
      return;
    }
    
    // 清空当前模式的对话历史
    this.conversationHistory[this.currentMode] = [];
    
    // 清空当前模式的SVG存储
    this.svgStorage[this.currentMode] = {};
    this.svgZoom[this.currentMode] = 1;
    this.showSvgPlaceholder();

    // 保存数据
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);
    
    // 重新渲染对话历史
    this.renderConversationHistory();
    this.renderSvgViewerForMode();
  }

  // 添加用户消息
  addUserMessage(text) {
    const messageId = Utils.generateId('msg');
    const message = {
      id: messageId,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };
    
    this.conversationHistory[this.currentMode].push(message);
    this.renderMessage(message);
    Utils.scrollToBottom(this.chatHistory);
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
  }

  // 添加AI消息（非流式，保留用于错误情况）
  addAIMessage(text) {
    const messageId = Utils.generateId('msg');
    const parsed = Utils.parseSVGResponse(text);
    
    const message = {
      id: messageId,
      type: 'ai',
      content: text,
      timestamp: new Date().toISOString()
    };
    
    this.conversationHistory[this.currentMode].push(message);

    let svgId = null;
    if (parsed.svgContent) {
      svgId = Utils.generateId('svg');
      this.svgStorage[this.currentMode][svgId] = {
        content: parsed.svgContent,
        messageId,
        mode: this.currentMode,
        timestamp: new Date().toISOString()
      };
      this.viewSVG(svgId);
    }

    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);

    this.renderConversationHistory();
    this.renderSvgViewerForMode();
  }

  // 添加错误消息
  addErrorMessage(errorText) {
    const messageId = Utils.generateId('msg');
    const message = {
      id: messageId,
      type: 'error',
      content: errorText,
      timestamp: new Date().toISOString()
    };
    
    this.conversationHistory[this.currentMode].push(message);
    this.renderMessage(message);
    Utils.scrollToBottom(this.chatHistory);
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
  }

  // 渲染消息
  renderMessage(message, options = {}) {
    const { allowRegenerate = false, allowRollback = message.type === 'ai' } = options;
    const messageDiv = document.createElement('div');

    if (message.type === 'user') {
      messageDiv.className = 'flex justify-end';
      messageDiv.innerHTML = `
        <div class="chat-bubble-user">
          ${Utils.escapeHtml(message.content)}
        </div>
      `;
    } else if (message.type === 'error') {
      messageDiv.className = 'flex justify-start';
      messageDiv.innerHTML = `
        <div class="chat-bubble-ai border-red-500">
          <iconify-icon icon="ph:warning-circle" class="text-red-500 mr-2"></iconify-icon>
          ${Utils.escapeHtml(message.content)}
        </div>
      `;
    } else if (message.type === 'ai') {
      const parsedContent = typeof marked !== 'undefined' ? marked.parse(message.content) : Utils.escapeHtml(message.content);
      const actions = this.buildActionToolbar(message.id, { allowRegenerate, allowRollback });
      messageDiv.className = 'flex justify-start';
      messageDiv.innerHTML = `
        <div class="chat-bubble-ai relative" data-message-id="${message.id}">
          <div class="mb-1">
            ${parsedContent}
          </div>
          ${actions}
        </div>
      `;
    }

    this.chatHistory.appendChild(messageDiv);
  }

  // 渲染包含SVG的消息
  renderMessageWithSVG(message, parsed, svgId, options = {}) {
    const { allowRegenerate = false, allowRollback = true } = options;
    const messageDiv = document.createElement('div');
    const beforeHtml = parsed.beforeText ? (typeof marked !== 'undefined' ? marked.parse(parsed.beforeText) : Utils.escapeHtml(parsed.beforeText)) : '';
    const afterHtml = parsed.afterText ? (typeof marked !== 'undefined' ? marked.parse(parsed.afterText) : Utils.escapeHtml(parsed.afterText)) : '';
    const actions = this.buildActionToolbar(message.id, { allowRegenerate, allowRollback });

    messageDiv.className = 'flex justify-start';
    const placeholderClass = this.currentSvgId === svgId ? 'svg-placeholder-block svg-placeholder-active' : 'svg-placeholder-block';
    messageDiv.innerHTML = `
      <div class="chat-bubble-ai relative" data-message-id="${message.id}">
        <div>
          ${beforeHtml}
          <div class="${placeholderClass}" data-svg-id="${svgId}" onclick="app.viewSVG('${svgId}')">
            📊 点击查看 ${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
          </div>
          ${afterHtml}
        </div>
        ${actions}
      </div>
    `;

    this.chatHistory.appendChild(messageDiv);
  }

  // 渲染对话历史
  renderConversationHistory() {
    this.chatHistory.innerHTML = '';
    
    // 获取当前模式的对话历史
    const currentHistory = this.conversationHistory[this.currentMode] || [];
    const currentSvgStorage = this.svgStorage[this.currentMode] || {};
    let hasStorageUpdate = false;
    let hasHistoryUpdate = false;

    let lastAiMessageId = null;
    for (let i = currentHistory.length - 1; i >= 0; i--) {
      if (currentHistory[i].type === 'ai') {
        lastAiMessageId = currentHistory[i].id;
        break;
      }
    }

    for (const message of currentHistory) {
      if (message.type === 'ai') {
        const parsed = Utils.parseSVGResponse(message.content);
        
        // 查找或补建对应的SVG
        let svgId = null;
        for (const [id, svg] of Object.entries(currentSvgStorage)) {
          if (svg.messageId === message.id) {
            svgId = id;
            break;
          }
        }

        const hasSvgContent = parsed.svgContent && parsed.svgContent.includes('<svg');
        if (hasSvgContent) {
          if (!svgId) {
            const normalizedSvg = parsed.svgContent.trim().endsWith('</svg>')
              ? parsed.svgContent.trim()
              : `${parsed.svgContent.trim()}\n</svg>`;
            svgId = Utils.generateId('svg');
            currentSvgStorage[svgId] = {
              content: normalizedSvg,
              messageId: message.id,
              mode: this.currentMode,
              timestamp: message.timestamp || new Date().toISOString()
            };
            parsed.svgContent = normalizedSvg;
            message.content = this.buildSVGMessageContent(parsed.beforeText, normalizedSvg, parsed.afterText);
            hasStorageUpdate = true;
            hasHistoryUpdate = true;
          }
          this.renderMessageWithSVG(message, parsed, svgId, { allowRegenerate: message.id === lastAiMessageId });
          continue;
        }

        this.renderMessage(message, { allowRegenerate: message.id === lastAiMessageId });
      } else {
        this.renderMessage(message);
      }
    }

    if (hasStorageUpdate) {
      this.svgStorage[this.currentMode] = currentSvgStorage;
      Utils.storage.set('canvasSVGs', this.svgStorage.canvas || {});
      Utils.storage.set('swotSVGs', this.svgStorage.swot || {});
    }
    if (hasHistoryUpdate) {
      Utils.storage.set('canvasHistory', this.conversationHistory.canvas || []);
      Utils.storage.set('swotHistory', this.conversationHistory.swot || []);
    }

    this.setActivePlaceholder(this.currentSvgId);
    Utils.scrollToBottom(this.chatHistory);
  }

  // 显示SVG
  viewSVG(svgId) {
    const store = this.svgStorage[this.currentMode] || {};
    if (!store[svgId]) {
      console.error('SVG not found:', svgId);
      return;
    }

    this.renderSvgContent(svgId);
  }

  // 退回到指定消息
  rollbackToMessage(messageId) {
    const messageIndex = this.conversationHistory[this.currentMode].findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;
    
    // 删除指定消息之后的所有消息
    const messagesToRemove = this.conversationHistory[this.currentMode].slice(messageIndex + 1);
    
    // 删除相关的SVG
    for (const message of messagesToRemove) {
      for (const [svgId, svg] of Object.entries(this.svgStorage[this.currentMode])) {
        if (svg.messageId === message.id) {
          delete this.svgStorage[this.currentMode][svgId];
          
          // 如果当前显示的是被删除的SVG，清空显示
          if (this.currentSvgId === svgId) {
            this.showSvgPlaceholder();
          }
        }
      }
    }
    
    // 更新对话历史
    this.conversationHistory[this.currentMode] = this.conversationHistory[this.currentMode].slice(0, messageIndex + 1);
    
    // 保存数据
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);
    
    // 重新渲染对话历史
    this.renderConversationHistory();
    this.renderSvgViewerForMode();
  }

  // 重新生成消息
  async regenerateMessage(messageId) {
    if (this.isProcessing) return;

    const history = this.conversationHistory[this.currentMode] || [];
    const targetIndex = history.findIndex(msg => msg.id === messageId && msg.type === 'ai');
    if (targetIndex === -1) {
      console.warn('未找到可重新生成的消息');
      return;
    }

    let userIndex = -1;
    for (let i = targetIndex - 1; i >= 0; i--) {
      if (history[i].type === 'user') {
        userIndex = i;
        break;
      }
    }

    if (userIndex === -1) {
      alert('未找到对应的用户消息，无法重新生成');
      return;
    }

    const payload = this.buildContextForUserMessage(userIndex);
    if (!payload) {
      alert('无法构建对话上下文，请稍后重试');
      return;
    }

    this.pendingCancel = false;
    this.isProcessing = true;
    this.setSendButtonState('streaming');
    this.sendButton.disabled = false;

    try {
      await this.startStreamingMessage(payload.userMessage, payload.contextMessages);
    } catch (error) {
      console.error('重新生成失败:', error);
      this.addErrorMessage(error.message);
      this.isProcessing = false;
      this.setSendButtonState('idle');
      this.activeStreamHandle = null;
      this.sendButton.disabled = false;
    }
  }

  getActiveSvgRecord(showWarning = true) {
    const store = this.svgStorage[this.currentMode] || {};
    if (this.currentSvgId && store[this.currentSvgId]) {
      return { id: this.currentSvgId, ...store[this.currentSvgId] };
    }

    if (showWarning) {
      alert('请先生成并选择一个图表');
    }
    return null;
  }

  parseSvgDimensions(svgContent) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgContent, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) {
        return { width: 1024, height: 768 };
      }

      const parseLength = (value) => {
        if (!value) return null;
        const match = /([0-9.]+)/.exec(value);
        return match ? parseFloat(match[1]) : null;
      };

      let width = parseLength(svgEl.getAttribute('width'));
      let height = parseLength(svgEl.getAttribute('height'));
      const viewBox = svgEl.getAttribute('viewBox');

      if ((!width || !height) && viewBox) {
        const parts = viewBox.split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
        if (parts.length === 4) {
          width = width || parts[2];
          height = height || parts[3];
        }
      }

      return {
        width: width || 1024,
        height: height || 768
      };
    } catch (error) {
      console.warn('解析SVG尺寸失败:', error);
      return { width: 1024, height: 768 };
    }
  }

  loadImageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = url;
    });
  }

  async convertSvgToPngBlob(svgContent, options = {}) {
    const { width, height } = this.parseSvgDimensions(svgContent);
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = await this.loadImageFromUrl(url);
      const canvas = document.createElement('canvas');
      const baseWidth = Math.max(1, img.naturalWidth || width || 1024);
      const baseHeight = Math.max(1, img.naturalHeight || height || 768);
      const preferredScale = options.scale || this.imageExportScale || 1;
      const exportScale = Math.min(4, Math.max(1, preferredScale));
      canvas.width = Math.round(baseWidth * exportScale);
      canvas.height = Math.round(baseHeight * exportScale);

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('无法生成PNG图像'));
          }
        }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async copySvgToClipboard() {
    const record = this.getActiveSvgRecord();
    if (!record) return;

    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      alert('当前浏览器不支持复制图片到剪贴板，请使用下载功能。');
      return;
    }

    try {
      const blob = await this.convertSvgToPngBlob(record.content);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      alert('图像已复制到剪贴板');
    } catch (error) {
      console.error('复制图片失败:', error);
      alert('复制失败，请稍后重试。');
    }
  }

  // 下载SVG
  downloadSVG() {
    const record = this.getActiveSvgRecord();
    if (!record) return;

    const filename = `${this.currentMode}-${Utils.formatDateTime().replace(/[/:]/g, '-')}.svg`;
    Utils.downloadFile(record.content, filename, 'image/svg+xml');
  }

  // 导出为图片
  async exportAsImage() {
    const record = this.getActiveSvgRecord();
    if (!record) return;

    try {
      const blob = await this.convertSvgToPngBlob(record.content);
      const filename = `${this.currentMode}-${Utils.formatDateTime().replace(/[/:]/g, '-')}.png`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('导出图片失败:', error);
      alert('导出图片失败，请稍后重试。');
    }
  }

  // 查看SVG代码
  viewSVGCode() {
    const record = this.getActiveSvgRecord();
    if (!record) return;

    const svgContent = record.content;

    // 创建代码查看模态窗
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="bg-gradient-to-r from-blue-600 to-purple-600 p-4 border-b-4 border-black flex items-center justify-between">
          <div class="flex items-center gap-2">
            <iconify-icon icon="ph:code-bold" class="text-3xl text-white"></iconify-icon>
            <h2 class="text-xl font-black text-white">SVG 源代码</h2>
          </div>
          <button class="close-modal text-white hover:bg-white/20 p-2 transition-all">
            <iconify-icon icon="ph:x-bold" class="text-2xl"></iconify-icon>
          </button>
        </div>
        <div class="p-4">
          <pre class="bg-gray-100 p-4 border-2 border-gray-300 rounded overflow-auto max-h-96 text-sm"><code>${Utils.escapeHtml(svgContent)}</code></pre>
          <div class="mt-4 flex gap-2 justify-end">
            <button class="copy-btn px-4 py-2 bg-blue-500 text-white font-bold border-2 border-black hover:bg-blue-600 transition-all flex items-center gap-2">
              <iconify-icon icon="ph:copy-bold"></iconify-icon>
              复制代码
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 关闭模态窗
    const closeModal = () => {
      document.body.removeChild(modal);
    };
    
    modal.querySelector('.close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    
    // 复制代码
    modal.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(svgContent).then(() => {
        const btn = modal.querySelector('.copy-btn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '<iconify-icon icon="ph:check-bold"></iconify-icon> 已复制';
        btn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
        btn.classList.add('bg-green-500', 'hover:bg-green-600');
        
        setTimeout(() => {
          btn.innerHTML = originalHTML;
          btn.classList.remove('bg-green-500', 'hover:bg-green-600');
          btn.classList.add('bg-blue-500', 'hover:bg-blue-600');
        }, 2000);
      });
    });
  }

  // 打开API配置模态窗
  openConfigModal() {
    this.configModal.classList.add('active');
    const apiConfig = window.apiClient.getConfig();
    this.apiUrlInput.value = apiConfig.url || '';
    this.apiKeyInput.value = apiConfig.key || '';
    this.apiModelInput.value = apiConfig.model || '';
  }

  // 关闭API配置模态窗
  closeConfigModal() {
    this.configModal.classList.remove('active');
  }

  // 保存API配置
  saveAPIConfig() {
    const config = {
      url: this.apiUrlInput.value.trim(),
      key: this.apiKeyInput.value.trim(),
      model: this.apiModelInput.value.trim()
    };
    
    if (!config.url || !config.key || !config.model) {
      Utils.showStatus(this.configStatus, '⚠️ 请填写所有字段', 'error');
      return;
    }
    
    window.apiClient.saveConfig(config);
    Utils.showStatus(this.configStatus, '✅ 配置已保存成功！', 'success');
    
    setTimeout(() => {
      this.closeConfigModal();
    }, 1500);
  }

  // 测试API连接
  async testAPIConnection() {
    const config = {
      url: this.apiUrlInput.value.trim(),
      key: this.apiKeyInput.value.trim(),
      model: this.apiModelInput.value.trim()
    };
    
    if (!config.url || !config.key || !config.model) {
      Utils.showStatus(this.configStatus, '⚠️ 请先填写所有字段', 'error');
      return;
    }
    
    Utils.showStatus(this.configStatus, '🔄 正在测试连接...', 'loading');
    
    try {
      // 临时保存配置进行测试
      window.apiClient.saveConfig(config);
      await window.apiClient.testConnection();
      Utils.showStatus(this.configStatus, '✅ 连接测试成功！', 'success');
    } catch (error) {
      Utils.showStatus(this.configStatus, `❌ 连接失败: ${error.message}`, 'error');
    }
  }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ProductCanvasApp();
});
