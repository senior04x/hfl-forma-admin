import OBSWebSocket from 'obs-websocket-js';

class OBSService {
  constructor() {
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.connectionSettings = {
      address: 'ws://localhost:4455',
      password: ''
    };
    this.onStatusChangeCallbacks = [];
  }

  onStatusChange(callback) {
    this.onStatusChangeCallbacks.push(callback);
    return () => {
      this.onStatusChangeCallbacks = this.onStatusChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  notifyStatusChange(status, error = null) {
    this.onStatusChangeCallbacks.forEach(cb => cb(status, error));
  }

  async connect(address = 'ws://localhost:4455', password = '') {
    try {
      this.connectionSettings = { address, password };
      await this.obs.connect(address, password);
      this.connected = true;
      this.notifyStatusChange(true);
      console.log('OBS WebSocket-ga muvaffaqiyatli ulandi');

      this.obs.on('ConnectionClosed', () => {
        this.connected = false;
        this.notifyStatusChange(false, 'Ulanish uzildi');
      });

      return { success: true };
    } catch (error) {
      this.connected = false;
      this.notifyStatusChange(false, error.message || 'OBS WebSocket ulanishida xatolik');
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.obs.disconnect();
      this.connected = false;
      this.notifyStatusChange(false);
    }
  }

  isConnected() {
    return this.connected;
  }

  /**
   * Start Replay Buffer if it's not active
   */
  async ensureReplayBufferActive() {
    if (!this.connected) return;
    try {
      const status = await this.obs.call('GetReplayBufferStatus');
      if (!status.outputActive) {
        await this.obs.call('StartReplayBuffer');
        console.log('OBS Replay Buffer ishga tushirildi');
      }
    } catch (err) {
      console.warn('Replay Buffer statusini olishda xatolik:', err);
    }
  }

  /**
   * Main function: Triggers a 20s Goal Replay with optional custom organization Stinger transition
   */
  async triggerGoalReplay({
    stingerUrl = null,
    mainScene = 'MainScene',
    replayScene = 'ReplayScene',
    replaySource = 'ReplaySource',
    fallbackDurationMs = 20000
  } = {}) {
    if (!this.connected) {
      throw new Error('OBS ulanmagan. Iltimos, OBS ulanishini tekshiring.');
    }

    // Auto-detect scene and source names if user used defaults like 'Media Source'
    try {
      const sceneList = await this.obs.call('GetSceneList');
      const sceneNames = (sceneList.scenes || []).map(s => s.sceneName);
      if (!sceneNames.includes(replayScene) && sceneNames.includes('ReplayBuffer')) {
        replayScene = 'ReplayBuffer';
      }

      // Check inputs in the target scene
      const sceneItems = await this.obs.call('GetSceneItemList', { sceneName: replayScene });
      const inputNames = (sceneItems.sceneItems || []).map(i => i.sourceName);
      if (!inputNames.includes(replaySource)) {
        if (inputNames.includes('Media Source')) {
          replaySource = 'Media Source';
        } else if (inputNames.length > 0) {
          replaySource = inputNames[0];
        }
      }
    } catch (e) {}

    return new Promise(async (resolve, reject) => {
      let replaySavedUnsub = null;
      let playbackFinishedUnsub = null;
      let timeoutId = null;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (replaySavedUnsub) this.obs.off('ReplayBufferSaved', replaySavedUnsub);
        if (playbackFinishedUnsub) this.obs.off('MediaInputPlaybackFinished', playbackFinishedUnsub);
      };

      try {
        // 1. If dynamic organization stinger URL provided, switch transition to Stinger & update path
        if (stingerUrl) {
          try {
            const transitions = await this.obs.call('GetSceneTransitionList');
            const stingerTrans = (transitions.transitions || []).find(t => t.transitionKind === 'stinger' || t.transitionName.toLowerCase().includes('stinger'));
            if (stingerTrans) {
              await this.obs.call('SetCurrentSceneTransition', { transitionName: stingerTrans.transitionName });
              await this.obs.call('SetCurrentSceneTransitionSettings', {
                transitionSettings: {
                  path: stingerUrl
                }
              });
            }
          } catch (stingerErr) {
            console.warn('Stinger animatsiya sozlamalarini yangilashda xatolik:', stingerErr);
          }
        }

        // 2. Listen for ReplayBufferSaved event from OBS
        replaySavedUnsub = async (data) => {
          const savedFilePath = data.savedReplayPath;
          console.log('Replay fayli saqlandi:', savedFilePath);

          try {
            // Update media input source file path in OBS and ensure loop is disabled
            await this.obs.call('SetInputSettings', {
              inputName: replaySource,
              inputSettings: {
                local_file: savedFilePath,
                loop: false
              }
            });

            // Restart media playback
            await this.obs.call('TriggerMediaInputAction', {
              inputName: replaySource,
              mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
            });

            // Switch program scene to ReplayScene
            await this.obs.call('SetCurrentProgramScene', {
              sceneName: replayScene
            });

            // Return to MainScene 2.2 seconds earlier (at 17.8s) so Stinger transition finishes exactly as replay ends
            const returnDelay = Math.max(5000, fallbackDurationMs - 2200);

            const triggerReturnToMain = async () => {
              console.log(`Replay vaqti tugadi (${returnDelay}ms), MainScene-ga qaytilmoqda...`);
              try {
                await this.obs.call('SetCurrentProgramScene', {
                  sceneName: mainScene
                });
              } catch (e) {}
              cleanup();
              resolve({ success: true, filePath: savedFilePath });
            };

            // Listen for media playback completion
            playbackFinishedUnsub = async (finishData) => {
              if (finishData.inputName === replaySource) {
                triggerReturnToMain();
              }
            };

            this.obs.on('MediaInputPlaybackFinished', playbackFinishedUnsub);

            // Precise return timer shortened by 2.2 seconds
            timeoutId = setTimeout(triggerReturnToMain, returnDelay);

          } catch (err) {
            cleanup();
            reject(err);
          }
        };

        this.obs.once('ReplayBufferSaved', replaySavedUnsub);

        // 3. Trigger SaveReplay in OBS
        await this.obs.call('SaveReplayBuffer');

      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }
}

export const obsService = new OBSService();
export default obsService;
