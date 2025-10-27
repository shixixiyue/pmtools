(function (global) {
  'use strict';

  const DEFAULT_STORAGE_KEYS = {
    history: 'history',
    artifacts: 'artifacts',
    ui: 'uiState'
  };

  class ModuleRuntime {
    constructor({ registry, storageService, conversationService }) {
      if (!registry) throw new Error('ModuleRuntime 需要 ModuleRegistry');
      if (!storageService) throw new Error('ModuleRuntime 需要 StorageService');
      if (!conversationService)
        throw new Error('ModuleRuntime 需要 ConversationService');

      this.registry = registry;
      this.storageService = storageService;
      this.conversationService = conversationService;
      this.moduleStates = new Map();
      this.activeModuleId = null;
    }

    _storageKeys(manifest) {
      return {
        ...DEFAULT_STORAGE_KEYS,
        ...(manifest.storageKeys || {})
      };
    }

    _namespace(manifest) {
      const namespace =
        manifest.storageNamespace || `module:${manifest.id || 'unknown'}`;
      return this.storageService.namespace(namespace);
    }

    _ensureState(manifest) {
      if (this.moduleStates.has(manifest.id)) {
        return this.moduleStates.get(manifest.id);
      }

      const store = this._namespace(manifest);
      const keys = this._storageKeys(manifest);

      const state = {
        artifacts: store.get(keys.artifacts, {}),
        uiState: store.get(keys.ui, {}),
        currentArtifactId: null
      };
      if (state.uiState && state.uiState.__activeArtifact) {
        state.currentArtifactId = state.uiState.__activeArtifact;
      }

      this.moduleStates.set(manifest.id, state);
      return state;
    }

    _persistState(manifest) {
      const store = this._namespace(manifest);
      const keys = this._storageKeys(manifest);
      const state = this._ensureState(manifest);

      if (state.uiState) {
        state.uiState.__activeArtifact = state.currentArtifactId;
      }
      store.set(keys.artifacts, state.artifacts);
      store.set(keys.ui, state.uiState);
    }

    getManifest(moduleId) {
      const manifest = this.registry.get(moduleId);
      if (!manifest) {
        throw new Error(`未找到模块 ${moduleId}`);
      }
      return manifest;
    }

    listManifests() {
      return this.registry.list();
    }

    activate(moduleId) {
      const manifest = this.getManifest(moduleId);
      this.activeModuleId = moduleId;
      const state = this._ensureState(manifest);
      const context = {
        manifest,
        state,
        history: this.conversationService.getHistory(manifest)
      };
      if (manifest.hooks && typeof manifest.hooks.onActivate === 'function') {
        try {
          manifest.hooks.onActivate(context);
        } catch (error) {
          console.warn(`执行模块 ${moduleId} onActivate 时出错:`, error);
        }
      }
      return context;
    }

    getActiveModule() {
      if (!this.activeModuleId) return null;
      return this.getManifest(this.activeModuleId);
    }

    getState(moduleId) {
      const manifest = this.getManifest(moduleId);
      return this._ensureState(manifest);
    }

    getArtifacts(moduleId) {
      const state = this.getState(moduleId);
      return state.artifacts;
    }

    saveArtifact(moduleId, artifactId, payload) {
      const manifest = this.getManifest(moduleId);
      const state = this._ensureState(manifest);
      state.artifacts[artifactId] = payload;
      state.currentArtifactId = artifactId;
      this._persistState(manifest);
      return payload;
    }

    removeArtifact(moduleId, artifactId) {
      const manifest = this.getManifest(moduleId);
      const state = this._ensureState(manifest);
      if (state.artifacts[artifactId]) {
        delete state.artifacts[artifactId];
        if (state.currentArtifactId === artifactId) {
          state.currentArtifactId = null;
        }
        this._persistState(manifest);
      }
    }

    setActiveArtifact(moduleId, artifactId) {
      const manifest = this.getManifest(moduleId);
      const state = this._ensureState(manifest);
      state.currentArtifactId = artifactId;
      this._persistState(manifest);
    }

    getActiveArtifactId(moduleId) {
      const state = this.getState(moduleId);
      return state.currentArtifactId || null;
    }

    updateUiState(moduleId, patch) {
      const manifest = this.getManifest(moduleId);
      const state = this._ensureState(manifest);
      state.uiState = {
        ...state.uiState,
        ...patch
      };
      this._persistState(manifest);
      return state.uiState;
    }

    getUiState(moduleId, defaultValue = {}) {
      const state = this.getState(moduleId);
      const uiState = { ...(state.uiState || {}) };
      delete uiState.__activeArtifact;
      return { ...defaultValue, ...uiState };
    }

    getConversationService() {
      return this.conversationService;
    }

    clearArtifacts(moduleId) {
      const manifest = this.getManifest(moduleId);
      const state = this._ensureState(manifest);
      state.artifacts = {};
      state.currentArtifactId = null;
      this._persistState(manifest);
    }
  }

  global.ModuleRuntime = ModuleRuntime;
})(window);
