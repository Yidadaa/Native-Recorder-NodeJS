const { AudioRecorder, SYSTEM_AUDIO_DEVICE_ID } = require('../dist/index');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const RECORD_DURATION = 5000; // 5 seconds

async function main() {
  console.log("=== Native Audio SDK Manual Test ===\n");

  try {
    // Refresh devices list at start
    const allDevices = AudioRecorder.getDevices();
    const inputDevices = AudioRecorder.getDevices('input');
    const outputDevices = AudioRecorder.getDevices('output');

    while (true) {
      console.log("\n----------------------------------------");
      console.log("Available Actions:");
      console.log("1. List All Devices");
      console.log("2. List Input Devices (Microphones)");
      console.log("3. List Output Devices (System Audio)");
      console.log("4. Record from Default Microphone");
      console.log("5. Record from Selected Microphone");
      console.log("6. Record System Audio");
      console.log("7. Get Device Format");
      console.log("8. Check Permissions");
      console.log("9. Request Microphone Permission");
      console.log("10. Request System Audio Permission");
      console.log("0. Exit");
      console.log("----------------------------------------");

      const answer = await new Promise(resolve => rl.question("Select an option (0-10): ", resolve));

      switch (answer.trim()) {
        case '1':
          console.log("\nAll Devices:");
          allDevices.forEach((d, i) => {
            console.log(`${i + 1}. [${d.type}] [${d.id}] ${d.name} ${d.isDefault ? '(Default)' : ''}`);
          });
          break;
        case '2':
          console.log("\nInput Devices (Microphones):");
          inputDevices.forEach((d, i) => {
            console.log(`${i + 1}. [${d.id}] ${d.name} ${d.isDefault ? '(Default)' : ''}`);
          });
          break;
        case '3':
          console.log("\nOutput Devices (System Audio):");
          outputDevices.forEach((d, i) => {
            console.log(`${i + 1}. [${d.id}] ${d.name} ${d.isDefault ? '(Default)' : ''}`);
          });
          break;
        case '4':
          {
            const defaultMic = inputDevices.find(d => d.isDefault);
            if (defaultMic) {
              await recordAudio('input', defaultMic.id, defaultMic.name);
            } else if (inputDevices.length > 0) {
              await recordAudio('input', inputDevices[0].id, inputDevices[0].name);
            } else {
              console.log("No input devices found.");
            }
          }
          break;
        case '5':
          console.log("\nSelect microphone number:");
          inputDevices.forEach((d, i) => {
            console.log(`${i + 1}. ${d.name}`);
          });
          {
            const idxStr = await new Promise(resolve => rl.question("Device #: ", resolve));
            const idx = parseInt(idxStr) - 1;
            if (idx >= 0 && idx < inputDevices.length) {
              await recordAudio('input', inputDevices[idx].id, inputDevices[idx].name);
            } else {
              console.log("Invalid selection.");
            }
          }
          break;
        case '6':
          {
            if (outputDevices.length > 0) {
              // On macOS, there's only one output device (system)
              // On Windows, let user choose
              if (outputDevices.length === 1) {
                await recordAudio('output', outputDevices[0].id, outputDevices[0].name);
              } else {
                console.log("\nSelect output device number:");
                outputDevices.forEach((d, i) => {
                  console.log(`${i + 1}. ${d.name}`);
                });
                const idxStr = await new Promise(resolve => rl.question("Device #: ", resolve));
                const idx = parseInt(idxStr) - 1;
                if (idx >= 0 && idx < outputDevices.length) {
                  await recordAudio('output', outputDevices[idx].id, outputDevices[idx].name);
                } else {
                  console.log("Invalid selection.");
                }
              }
            } else {
              console.log("No output devices found.");
            }
          }
          break;
        case '7':
          console.log("\nSelect device number to get format:");
          allDevices.forEach((d, i) => {
            console.log(`${i + 1}. [${d.type}] ${d.name}`);
          });
          {
            const fmtIdxStr = await new Promise(resolve => rl.question("Device #: ", resolve));
            const fmtIdx = parseInt(fmtIdxStr) - 1;
            if (fmtIdx >= 0 && fmtIdx < allDevices.length) {
              try {
                const format = AudioRecorder.getDeviceFormat(allDevices[fmtIdx].id);
                console.log("\nDevice Format:");
                console.log(`Sample Rate: ${format.sampleRate} Hz`);
                console.log(`Channels: ${format.channels}`);
                console.log(`Output Bit Depth: ${format.bitDepth} bits`);
                console.log(`Native Bit Depth: ${format.rawBitDepth} bits`);
              } catch (e) {
                console.error("Failed to get format:", e);
              }
            } else {
              console.log("Invalid selection.");
            }
          }
          break;
        case '8':
          {
            console.log("\nChecking permissions...");
            const status = AudioRecorder.checkPermission();
            console.log("\nPermission Status:");
            console.log(`  Microphone: ${status.mic ? '✅ Granted' : '❌ Not Granted'}`);
            console.log(`  System Audio: ${status.system ? '✅ Granted' : '❌ Not Granted'}`);
            if (process.platform === 'win32') {
              console.log("\n(Note: Windows does not require explicit permissions)");
            }
          }
          break;
        case '9':
          {
            console.log("\nRequesting microphone permission...");
            const granted = AudioRecorder.requestPermission('mic');
            console.log(`\nMicrophone permission: ${granted ? '✅ Granted' : '❌ Denied'}`);
          }
          break;
        case '10':
          {
            console.log("\nRequesting system audio permission...");
            console.log("(On macOS, this will prompt for Screen Recording permission)");
            const granted = AudioRecorder.requestPermission('system');
            console.log(`\nSystem audio permission: ${granted ? '✅ Granted' : '❌ Denied'}`);
          }
          break;
        case '0':
          rl.close();
          return;
        default:
          console.log("Invalid option.");
      }
    }
  } catch (err) {
    console.error("Error:", err);
    rl.close();
  }
}

async function recordAudio(deviceType, deviceId, deviceName) {
  const typeStr = deviceType === 'output' ? "System Audio" : "Microphone";
  const filename = deviceType === 'output' ? "loopback_test.raw" : "mic_test.raw";
  const filePath = path.join(__dirname, filename);

  console.log(`\nStarting recording (${typeStr}: ${deviceName})...`);
  console.log(`Duration: ${RECORD_DURATION / 1000} seconds`);
  console.log(`Output: ${filePath}`);

  const recorder = new AudioRecorder();
  const fileStream = fs.createWriteStream(filePath);

  let totalBytes = 0;

  recorder.on('data', (data) => {
    totalBytes += data.length;
    fileStream.write(data);

    // Simple VU Meter
    const rms = calculateRMS(data);
    const val = Math.min(1, rms / 10000);
    const numBars = Math.floor(val * 50);
    const bars = '#'.repeat(numBars);

    process.stdout.write(`\rRecording... [${bars.padEnd(50, ' ')}] RMS: ${Math.floor(rms)}   `);
  });

  recorder.on('error', (err) => {
    console.error("\nRecording Error:", err);
  });

  try {
    let format = { sampleRate: 48000, channels: 2 };
    try {
      format = AudioRecorder.getDeviceFormat(deviceId);
    } catch (e) {
      console.warn("Warning: Could not get device format for display.");
    }

    // Use new API with deviceType and deviceId
    await recorder.start({
      deviceType: deviceType,
      deviceId: deviceId
    });

    await new Promise(resolve => setTimeout(resolve, RECORD_DURATION));

    await recorder.stop();
    console.log(`\n\nStopped. Total bytes: ${totalBytes}`);
    console.log(`Note: The output file contains raw PCM 16-bit LE audio.`);
    console.log(`Format: ${format.sampleRate} Hz, ${format.channels} Channels`);
    // Use full path and proper escaping for cross-platform compatibility
    const escapedPath = filePath.includes(' ') ? `"${filePath}"` : filePath;
    console.log(`Use the following command to play:`);
    console.log(`  ffplay -f s16le -ar ${format.sampleRate} -ch_layout ${format.channels === 1 ? 'mono' : 'stereo'} ${escapedPath}`);
  } catch (e) {
    console.error("\nFailed:", e);
  } finally {
    fileStream.end();
  }
}

function calculateRMS(buffer) {
  let sum = 0;
  const numSamples = buffer.length / 2;
  for (let i = 0; i < buffer.length; i += 2) {
    const val = buffer.readInt16LE(i);
    sum += val * val;
  }
  return Math.sqrt(sum / numSamples);
}

main();
