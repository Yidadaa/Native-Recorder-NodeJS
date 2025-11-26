const { AudioRecorder, SYSTEM_AUDIO_DEVICE_ID } = require('../dist/index');

async function testPermissions() {
  console.log("=== Permission Test ===\n");

  // 1. 检查当前权限状态
  console.log("1. Checking current permission status...");
  const status = AudioRecorder.checkPermission();
  console.log(`   Microphone: ${status.mic ? '✅ Granted' : '❌ Not Granted'}`);
  console.log(`   System Audio: ${status.system ? '✅ Granted' : '❌ Not Granted'}`);

  // 2. 如果系统音频权限未授予，尝试请求
  if (!status.system) {
    console.log("\n2. System audio permission not granted. Requesting...");
    console.log("   (This should trigger the Screen Recording permission dialog on macOS)");
    const granted = AudioRecorder.requestPermission('system');
    console.log(`   Result: ${granted ? '✅ Granted' : '❌ Denied'}`);

    // 再次检查
    const newStatus = AudioRecorder.checkPermission();
    console.log(`   After request - System Audio: ${newStatus.system ? '✅ Granted' : '❌ Not Granted'}`);
  }

  // 3. 列出所有设备
  console.log("\n3. Listing all devices...");
  const allDevices = AudioRecorder.getDevices();
  allDevices.forEach((d, i) => {
    console.log(`   ${i + 1}. [${d.type}] ${d.name} (id: ${d.id}) ${d.isDefault ? '(Default)' : ''}`);
  });

  // 4. 尝试录制系统音频
  const outputDevices = AudioRecorder.getDevices('output');
  if (outputDevices.length > 0) {
    console.log("\n4. Attempting to record system audio for 3 seconds...");
    console.log(`   Device: ${outputDevices[0].name} (id: ${outputDevices[0].id})`);

    const recorder = new AudioRecorder();
    let totalBytes = 0;
    let dataReceived = false;

    recorder.on('data', (data) => {
      if (!dataReceived) {
        console.log("   ✅ Receiving audio data!");
        dataReceived = true;
      }
      totalBytes += data.length;
    });

    recorder.on('error', (err) => {
      console.log(`   ❌ Error: ${err.message}`);
    });

    try {
      await recorder.start({
        deviceType: 'output',
        deviceId: outputDevices[0].id
      });

      // 等待3秒
      await new Promise(resolve => setTimeout(resolve, 3000));

      await recorder.stop();

      console.log(`\n5. Recording finished.`);
      console.log(`   Total bytes received: ${totalBytes}`);
      if (totalBytes === 0) {
        console.log("   ⚠️  No data received! This might indicate a permission issue.");
        console.log("   Please check System Preferences > Privacy & Security > Screen Recording");
        console.log("   and ensure your terminal app has permission.");
      }
    } catch (e) {
      console.log(`   ❌ Failed to start recording: ${e.message}`);
    }
  } else {
    console.log("\n4. No output devices found!");
  }
}

testPermissions().catch(console.error);
