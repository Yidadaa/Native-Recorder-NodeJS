const { AudioRecorder } = require('../dist/index');
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
    const devices = await AudioRecorder.getDevices();

    while (true) {
      console.log("\n----------------------------------------");
      console.log("Available Actions:");
      console.log("1. List Devices");
      console.log("2. Record from Microphone (Default Device)");
      console.log("3. Record from Microphone (Select Device)");
      console.log("4. Record System Audio (Loopback)");
      console.log("5. Get Device Format");
      console.log("6. Exit");
      console.log("----------------------------------------");

      const answer = await new Promise(resolve => rl.question("Select an option (1-6): ", resolve));

      switch (answer.trim()) {
        case '1':
          console.log("\nDevices:");
          devices.forEach((d, i) => {
            console.log(`${i + 1}. [${d.id}] ${d.name} ${d.isDefault ? '(Default)' : ''}`);
          });
          break;
        case '2':
          await recordAudio(undefined, false);
          break;
        case '3':
          console.log("\nSelect device number:");
          devices.forEach((d, i) => {
            console.log(`${i + 1}. ${d.name}`);
          });
          const idxStr = await new Promise(resolve => rl.question("Device #: ", resolve));
          const idx = parseInt(idxStr) - 1;
          if (idx >= 0 && idx < devices.length) {
            await recordAudio(devices[idx].id, false);
          } else {
            console.log("Invalid selection.");
          }
          break;
        case '4':
          await recordAudio(undefined, true);
          break;
        case '5':
          console.log("\nSelect device number to get format:");
          devices.forEach((d, i) => {
            console.log(`${i + 1}. ${d.name}`);
          });
          const fmtIdxStr = await new Promise(resolve => rl.question("Device #: ", resolve));
          const fmtIdx = parseInt(fmtIdxStr) - 1;
          if (fmtIdx >= 0 && fmtIdx < devices.length) {
            try {
              const format = await AudioRecorder.getDeviceFormat(devices[fmtIdx].id);
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
          break;
        case '6':
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

async function recordAudio(deviceId, isLoopback) {
  const typeStr = isLoopback ? "System Audio" : "Microphone";
  const filename = isLoopback ? "loopback_test.raw" : "mic_test.raw";
  const filePath = path.join(__dirname, filename);

  console.log(`\nStarting recording (${typeStr})...`);
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
    // Scale RMS (0-32768) to 0-50 bars. Log scale is better visually.
    // Simple log-ish mapping
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
      format = await AudioRecorder.getDeviceFormat(deviceId || "");
    } catch (e) {
      console.warn("Warning: Could not get device format for display.");
    }

    await recorder.start({
      deviceId: deviceId,
      type: isLoopback ? 'system' : 'microphone'
    });

    await new Promise(resolve => setTimeout(resolve, RECORD_DURATION));

    await recorder.stop();
    console.log(`\n\nStopped. Total bytes: ${totalBytes}`);
    console.log(`Note: The output file contains raw PCM 16-bit LE audio.`);
    console.log(`Format: ${format.sampleRate} Hz, ${format.channels} Channels`);
    console.log(`Use 'ffplay -f s16le -ar ${format.sampleRate} -ac ${format.channels} ${filename}' to play.`);
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
