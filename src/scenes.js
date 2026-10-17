// -----------------------------------------------------------------------------
// Scene action (manifest `scene_actions`, Gladys 5.1+): `run_measurement`.
//
// Measures one server now (before any scheduled measurement waiting in the
// queue) and returns the speeds, for the next steps of the scene: "Continue
// only if" on `success`, a message with {{download_mbps}}...
//
// Outputs are numbers (1/0 for success), not booleans: the core's "Continue
// only if" compares with ===, and its value field only produces numbers and
// strings (Gladys 5.2.0). A failed measurement is an output, not an error, so
// the scene can react to it.
// -----------------------------------------------------------------------------

import { MESSAGES } from './texts.js';

// The core waits 120 s at most (manifest timeout_seconds): answer before, with
// success 0, when the queue or a slow server would make the action time out.
// The measurement itself goes on and still updates the device.
export const SCENE_WAIT_MS = 110_000;

export const SCENE_ACTIONS = {
  async run_measurement(monitor, { fields }) {
    const server = monitor.serverOfDevice(fields.device);
    if (!server) {
      const texts = MESSAGES[monitor.config.language] ?? MESSAGES.en;
      throw new Error(texts.unknownServer);
    }
    let timer;
    const result = await Promise.race([
      monitor.enqueue(server, { priority: true }),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), monitor.sceneWaitMs ?? SCENE_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
    if (!result?.ok) {
      return { success: 0 };
    }
    return {
      success: 1,
      download_mbps: result.values.download,
      upload_mbps: result.values.upload,
    };
  },
};
