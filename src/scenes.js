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

export const SCENE_ACTIONS = {
  async run_measurement(monitor, { fields }) {
    const server = monitor.serverOfDevice(fields.device);
    if (!server) {
      throw new Error('This iperf3 server is no longer in the configuration');
    }
    const result = await monitor.enqueue(server, { priority: true });
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
