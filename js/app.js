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
    this.currentStreamingMessage = null;
    
    this.initElements();
    this.initEventListeners();
    this.loadSavedData();
    this.updateModeUI();
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
    this.placeholderText = document.getElementById('placeholder-text');
    
    // 底部操作按钮
    this.downloadSvgBtn = document.getElementById('download-svg-btn');
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
    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.clearHistoryBtn.addEventListener('click', () => this.clearCurrentConversation());
    
    // 输入框事件
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // 自动调整输入框高度
    this.chatInput.addEventListener('input', () => {
      Utils.autoResizeTextarea(this.chatInput);
    });
    
    // 底部操作按钮
    this.downloadSvgBtn.addEventListener('click', () => this.downloadSVG());
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
    this.updateModeUI();
  }

  // 更新模式UI
  updateModeUI() {
    if (this.currentMode === 'canvas') {
      this.canvasBtn.classList.add('mode-btn-active');
      this.canvasBtn.classList.remove('mode-btn-inactive');
      this.swotBtn.classList.remove('mode-btn-active');
      this.swotBtn.classList.add('mode-btn-inactive');
      this.pageTitle.textContent = '产品画布';
      if (!this.currentSvgId) {
        this.placeholderText.textContent = '生成的产品画布将在此处显示';
      }
    } else {
      this.swotBtn.classList.add('mode-btn-active');
      this.swotBtn.classList.remove('mode-btn-inactive');
      this.canvasBtn.classList.remove('mode-btn-active');
      this.canvasBtn.classList.add('mode-btn-inactive');
      this.pageTitle.textContent = 'SWOT分析';
      if (!this.currentSvgId) {
        this.placeholderText.textContent = '生成的SWOT分析将在此处显示';
      }
    }
  }

  // 发送消息
  async sendMessage() {
    const message = this.chatInput.value.trim();
    if (!message || this.isProcessing) return;
    
    // 检查API配置
    if (!window.apiClient.isConfigValid()) {
      alert('⚠️ 请先配置API设置！点击右上角齿轮图标进行配置。');
      this.openConfigModal();
      return;
    }
    
    this.isProcessing = true;
    this.sendButton.disabled = true;
    this.sendButton.innerHTML = '<iconify-icon icon="ph:spinner-gap" class="text-3xl animate-spin"></iconify-icon>';
    
    // 添加用户消息
    this.addUserMessage(message);
    this.chatInput.value = '';
    Utils.autoResizeTextarea(this.chatInput);
    
    try {
      // 获取对话上下文
      const contextMessages = this.conversationHistory[this.currentMode]
        .slice(-10) // 只取最近10条消息作为上下文
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.content
        }));
      
      // 开始流式接收消息
      await this.startStreamingMessage(message, contextMessages);
      
    } catch (error) {
      console.error('发送消息失败:', error);
      this.addErrorMessage(error.message);
      this.isProcessing = false;
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<iconify-icon icon="ph:paper-plane-tilt-fill" class="text-3xl"></iconify-icon>';
    }
  }

  // 开始流式接收消息
  async startStreamingMessage(userMessage, contextMessages) {
    // 创建流式消息容器
    const messageId = Utils.generateId('msg');
    const messageContainer = this.createStreamingMessageContainer(messageId);
    this.chatHistory.appendChild(messageContainer);
    Utils.scrollToBottom(this.chatHistory);
    
    let fullContent = '';
    let svgStarted = false;
    let svgContent = '';
    let svgId = null;
    let beforeText = '';
    
    const onChunk = (chunk) => {
      if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
        const content = chunk.choices[0].delta.content || '';
        fullContent += content;
        
        // 检测SVG开始标记
        if (!svgStarted) {
          // 使用正则表达式更准确地检测SVG代码块开始
          const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
          if (svgStartMatch) {
            svgStarted = true;
            svgId = Utils.generateId('svg');
            
            // 提取SVG开始前的文本
            const svgStartIndex = svgStartMatch.index;
            beforeText = fullContent.substring(0, svgStartIndex);
            
            // 显示绘制中占位符
            this.updateStreamingMessageWithPlaceholder(messageContainer, beforeText, svgId);
            
            // 初始化SVG显示区域
            this.svgViewer.innerHTML = `
              <div class="flex items-center justify-center h-full">
                <div class="text-center">
                  <iconify-icon icon="ph:spinner-gap" class="text-6xl text-purple-500 animate-spin"></iconify-icon>
                  <p class="mt-4 font-bold text-gray-600">正在绘制${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}...</p>
                </div>
              </div>
            `;
          }
        }
        
        // 如果SVG已经开始，收集SVG内容
        if (svgStarted) {
          // 检查是否有SVG结束标记
          if (fullContent.includes('</svg>')) {
            const svgEndIndex = fullContent.indexOf('</svg>') + 6; // +6 是 '</svg>' 的长度
            
            // 提取完整的SVG内容
            const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
            if (svgStartMatch) {
              const svgStartIndex = svgStartMatch.index;
              let svgWithMarkers = fullContent.substring(svgStartIndex, svgEndIndex);
              
              // 移除代码块标记
              svgContent = svgWithMarkers.replace(/```(?:svg)?\s*/, '').replace(/```$/, '').trim();
              
              // 补全SVG结束标签（如果没有的话）
              if (!svgContent.endsWith('</svg>')) {
                svgContent += '</svg>';
              }
              
              // 实时显示SVG
              this.svgViewer.innerHTML = svgContent;
              
              // 存储SVG内容
              this.svgStorage[this.currentMode][svgId] = {
                content: svgContent,
                messageId: messageId,
                mode: this.currentMode,
                timestamp: new Date().toISOString()
              };
              
              // 更新占位符为可点击状态
              this.updatePlaceholderToClickable(messageContainer, svgId);
              
              // 重置SVG状态，继续接收剩余文本
              svgStarted = false;
              const afterText = fullContent.substring(svgEndIndex);
              this.updateStreamingMessageAfterSVG(messageContainer, beforeText, svgId, afterText);
            }
          } else {
            // SVG还在继续，更新内容
            const svgStartMatch = fullContent.match(/```(?:svg)?\s*<svg[\s\S]*?>/i);
            if (svgStartMatch) {
              const svgStartIndex = svgStartMatch.index;
              let svgWithMarkers = fullContent.substring(svgStartIndex);
              
              // 移除代码块标记
              svgContent = svgWithMarkers.replace(/```(?:svg)?\s*/, '').replace(/```$/, '').trim();
              
              // 补全SVG结束标签以便实时显示
              let tempSvgContent = svgContent;
              if (!tempSvgContent.endsWith('</svg>')) {
                tempSvgContent += '</svg>';
              }
              
              // 实时更新SVG显示
              this.svgViewer.innerHTML = tempSvgContent;
            }
          }
        } else {
          // 普通文本更新
          this.updateStreamingMessage(messageContainer, fullContent);
        }
      }
    };
    
    const onComplete = () => {
      // 流式接收完成，处理完整消息
      this.finalizeStreamingMessage(messageId, fullContent, svgId, beforeText);
      
      this.isProcessing = false;
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<iconify-icon icon="ph:paper-plane-tilt-fill" class="text-3xl"></iconify-icon>';
    };
    
    // 调用流式API
    if (this.currentMode === 'canvas') {
      await window.apiClient.generateProductCanvasStream(userMessage, contextMessages, onChunk, onComplete);
    } else {
      await window.apiClient.generateSWOTAnalysisStream(userMessage, contextMessages, onChunk, onComplete);
    }
  }

  // 创建流式消息容器
  createStreamingMessageContainer(messageId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-start';
    messageDiv.innerHTML = `
      <div class="chat-bubble-ai relative group streaming-text" data-message-id="${messageId}">
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
      <div class="chat-bubble-ai relative group streaming-text" data-message-id="${container.dataset.messageId}">
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
      placeholder.innerHTML = `📊 点击查看${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG`;
      placeholder.setAttribute('onclick', `app.viewSVG('${svgId}')`);
    }
  }
  
  // 更新SVG后的消息内容
  updateStreamingMessageAfterSVG(container, beforeText, svgId, afterText) {
    // 使用Markdown解析文本
    const parsedBeforeText = typeof marked !== 'undefined' ? marked.parse(beforeText) : Utils.escapeHtml(beforeText);
    const parsedAfterText = typeof marked !== 'undefined' ? marked.parse(afterText) : Utils.escapeHtml(afterText);
    
    container.innerHTML = `
      <div class="chat-bubble-ai relative group streaming-text" data-message-id="${container.dataset.messageId}">
        <div>
          ${parsedBeforeText}
          <div class="svg-placeholder-block" data-svg-id="${svgId}" onclick="app.viewSVG('${svgId}')">
            📊 点击查看${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
          </div>
          <div class="typing-cursor">${parsedAfterText}</div>
        </div>
      </div>
    `;
    Utils.scrollToBottom(this.chatHistory);
  }

  // 完成流式消息
  finalizeStreamingMessage(messageId, fullContent, svgId = null, beforeText = '') {
    const container = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!container) return;
    
    const message = {
      id: messageId,
      type: 'ai',
      content: fullContent,
      timestamp: new Date().toISOString()
    };
    
    this.conversationHistory[this.currentMode].push(message);
    
    // 如果已经有SVG ID（从流式处理中获得），直接使用
    if (svgId && this.svgStorage[this.currentMode][svgId]) {
      // 提取SVG后的文本
      let afterText = '';
      if (fullContent.includes('</svg>')) {
        const svgEndIndex = fullContent.indexOf('</svg>') + 6;
        afterText = fullContent.substring(svgEndIndex);
      }
      
      // 使用Markdown解析文本
      const parsedBeforeText = typeof marked !== 'undefined' ? marked.parse(beforeText) : Utils.escapeHtml(beforeText);
      const parsedAfterText = typeof marked !== 'undefined' ? marked.parse(afterText) : Utils.escapeHtml(afterText);
      
      // 更新容器内容为包含SVG的消息
      container.innerHTML = `
        <div>
          ${parsedBeforeText}
          <div class="svg-placeholder-block" data-svg-id="${svgId}" onclick="app.viewSVG('${svgId}')">
            📊 点击查看 ${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
          </div>
          ${parsedAfterText}
        </div>
        
        <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" onclick="app.rollbackToMessage('${messageId}')">
            <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
            <span>退回</span>
          </button>
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" onclick="app.regenerateMessage('${messageId}')">
            <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
            <span>重新生成</span>
          </button>
        </div>
      `;
    } else {
      // 使用原有的解析方法作为后备
      const parsed = Utils.parseSVGResponse(fullContent);
      
      // 如果包含SVG，存储SVG内容
      if (parsed.svgContent) {
        const newSvgId = Utils.generateId('svg');
        this.svgStorage[this.currentMode][newSvgId] = {
          content: parsed.svgContent,
          messageId: messageId,
          mode: this.currentMode,
          timestamp: new Date().toISOString()
        };
        
        this.viewSVG(newSvgId);
        
        // 使用Markdown解析文本
        const parsedBeforeText = typeof marked !== 'undefined' ? marked.parse(parsed.beforeText) : Utils.escapeHtml(parsed.beforeText);
        const parsedAfterText = typeof marked !== 'undefined' ? marked.parse(parsed.afterText) : Utils.escapeHtml(parsed.afterText);
        
        // 更新容器内容为包含SVG的消息
        container.innerHTML = `
          <div>
            ${parsedBeforeText}
            <div class="svg-placeholder-block" data-svg-id="${newSvgId}" onclick="app.viewSVG('${newSvgId}')">
              📊 点击查看 ${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
            </div>
            ${parsedAfterText}
          </div>
          
          <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" onclick="app.rollbackToMessage('${messageId}')">
              <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
              <span>退回</span>
            </button>
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" onclick="app.regenerateMessage('${messageId}')">
              <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
              <span>重新生成</span>
            </button>
          </div>
        `;
      } else {
        // 使用Markdown解析内容
        const parsedContent = typeof marked !== 'undefined' ? marked.parse(fullContent) : Utils.escapeHtml(fullContent);
        
        // 更新容器内容为普通消息
        container.innerHTML = `
          <div class="mb-1">
            ${parsedContent}
          </div>
          
          <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" onclick="app.rollbackToMessage('${messageId}')">
              <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
              <span>退回</span>
            </button>
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" onclick="app.regenerateMessage('${messageId}')">
              <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
              <span>重新生成</span>
            </button>
          </div>
        `;
      }
    }
    
    // 保存数据
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);
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
    
    // 如果当前显示的是被清空的模式的SVG，清空显示
    if (this.currentSvgId && this.svgStorage[this.currentMode][this.currentSvgId]) {
      this.currentSvgId = null;
      this.svgViewer.innerHTML = `
        <div id="svg-placeholder" class="text-center text-gray-400">
          <iconify-icon icon="ph:image-square" class="text-6xl mx-auto text-purple-400"></iconify-icon>
          <p class="mt-2 font-bold" id="placeholder-text">生成的${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}将在此处显示</p>
        </div>
      `;
    }
    
    // 保存数据
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
    Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
    Utils.storage.set('swotSVGs', this.svgStorage.swot);
    
    // 重新渲染对话历史
    this.renderConversationHistory();
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
    
    // 如果包含SVG，存储SVG内容
    if (parsed.svgContent) {
      const svgId = Utils.generateId('svg');
      this.svgStorage[this.currentMode][svgId] = {
        content: parsed.svgContent,
        messageId: messageId,
        mode: this.currentMode,
        timestamp: new Date().toISOString()
      };
      
      Utils.storage.set('canvasSVGs', this.svgStorage.canvas);
      Utils.storage.set('swotSVGs', this.svgStorage.swot);
      this.viewSVG(svgId);
      
      // 渲染包含SVG占位符的消息
      this.renderMessageWithSVG(message, parsed, svgId);
    } else {
      // 渲染普通消息
      this.renderMessage(message);
    }
    
    Utils.scrollToBottom(this.chatHistory);
    Utils.storage.set('canvasHistory', this.conversationHistory.canvas);
    Utils.storage.set('swotHistory', this.conversationHistory.swot);
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
  renderMessage(message) {
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
    } else {
      messageDiv.className = 'flex justify-start';
      messageDiv.innerHTML = `
        <div class="chat-bubble-ai relative group" data-message-id="${message.id}">
          <div class="mb-1">
            ${typeof marked !== 'undefined' ? marked.parse(message.content) : Utils.escapeHtml(message.content)}
          </div>
          
          <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" onclick="app.rollbackToMessage('${message.id}')">
              <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
              <span>退回</span>
            </button>
            <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" onclick="app.regenerateMessage('${message.id}')">
              <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
              <span>重新生成</span>
            </button>
          </div>
        </div>
      `;
    }
    
    this.chatHistory.appendChild(messageDiv);
  }

  // 渲染包含SVG的消息
  renderMessageWithSVG(message, parsed, svgId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'flex justify-start';
    messageDiv.innerHTML = `
      <div class="chat-bubble-ai relative group" data-message-id="${message.id}">
        <div>
          ${typeof marked !== 'undefined' ? marked.parse(parsed.beforeText) : Utils.escapeHtml(parsed.beforeText)}
          <div class="svg-placeholder-block" data-svg-id="${svgId}" onclick="app.viewSVG('${svgId}')">
            📊 点击查看 ${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'} SVG
          </div>
          ${typeof marked !== 'undefined' ? marked.parse(parsed.afterText) : Utils.escapeHtml(parsed.afterText)}
        </div>
        
        <div class="flex gap-2 mt-2 pt-2 border-t border-gray-200">
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-blue-600 transition-colors" onclick="app.rollbackToMessage('${message.id}')">
            <iconify-icon icon="ph:arrow-u-up-left-bold"></iconify-icon>
            <span>退回</span>
          </button>
          <button class="bubble-action-btn flex items-center gap-1 text-xs text-gray-600 hover:text-green-600 transition-colors" onclick="app.regenerateMessage('${message.id}')">
            <iconify-icon icon="ph:arrow-clockwise-bold"></iconify-icon>
            <span>重新生成</span>
          </button>
        </div>
      </div>
    `;
    
    this.chatHistory.appendChild(messageDiv);
  }

  // 渲染对话历史
  renderConversationHistory() {
    this.chatHistory.innerHTML = '';
    
    // 获取当前模式的对话历史
    const currentHistory = this.conversationHistory[this.currentMode] || [];
    
    for (const message of currentHistory) {
      if (message.type === 'ai') {
        const parsed = Utils.parseSVGResponse(message.content);
        
        // 查找对应的SVG
        let svgId = null;
        const currentSvgStorage = this.svgStorage[this.currentMode] || {};
        for (const [id, svg] of Object.entries(currentSvgStorage)) {
          if (svg.messageId === message.id) {
            svgId = id;
            break;
          }
        }
        
        if (svgId && parsed.svgContent) {
          this.renderMessageWithSVG(message, parsed, svgId);
        } else {
          this.renderMessage(message);
        }
      } else {
        this.renderMessage(message);
      }
    }
  }

  // 显示SVG
  viewSVG(svgId) {
    if (!this.svgStorage[this.currentMode][svgId]) {
      console.error('SVG not found:', svgId);
      return;
    }
    
    this.currentSvgId = svgId;
    const svgContent = this.svgStorage[this.currentMode][svgId].content;
    this.svgViewer.innerHTML = svgContent;
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
            this.currentSvgId = null;
            this.svgViewer.innerHTML = `
              <div id="svg-placeholder" class="text-center text-gray-400">
                <iconify-icon icon="ph:image-square" class="text-6xl mx-auto text-purple-400"></iconify-icon>
                <p class="mt-2 font-bold" id="placeholder-text">生成的${this.currentMode === 'canvas' ? '产品画布' : 'SWOT分析'}将在此处显示</p>
              </div>
            `;
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
  }

  // 重新生成消息
  async regenerateMessage(messageId) {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.sendButton.disabled = true;
    this.sendButton.innerHTML = '<iconify-icon icon="ph:spinner-gap" class="text-3xl animate-spin"></iconify-icon>';
    
    try {
      // 重新生成响应
      const response = await window.apiClient.regenerateResponse(messageId, this.conversationHistory[this.currentMode]);
      
      // 退回到指定消息
      this.rollbackToMessage(messageId);
      
      // 添加新的AI回复
      this.addAIMessage(response);
      
    } catch (error) {
      console.error('重新生成失败:', error);
      this.addErrorMessage(error.message);
    } finally {
      this.isProcessing = false;
      this.sendButton.disabled = false;
      this.sendButton.innerHTML = '<iconify-icon icon="ph:paper-plane-tilt-fill" class="text-3xl"></iconify-icon>';
    }
  }

  // 下载SVG
  downloadSVG() {
    if (!this.currentSvgId) {
      alert('请先生成SVG图表');
      return;
    }
    
    const svgContent = this.svgStorage[this.currentMode][this.currentSvgId].content;
    const filename = `${this.currentMode}-${Utils.formatDateTime().replace(/[/:]/g, '-')}.svg`;
    Utils.downloadFile(svgContent, filename, 'image/svg+xml');
  }

  // 导出为图片
  exportAsImage() {
    if (!this.currentSvgId) {
      alert('请先生成SVG图表');
      return;
    }
    
    // 这里可以实现SVG转PNG的功能
    // 由于需要额外的库，这里先提示用户
    alert('SVG转PNG功能需要额外的库支持，您可以使用下载SVG功能，然后使用在线工具转换。');
  }

  // 查看SVG代码
  viewSVGCode() {
    if (!this.currentSvgId) {
      alert('请先生成SVG图表');
      return;
    }
    
    const svgContent = this.svgStorage[this.currentMode][this.currentSvgId].content;
    
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