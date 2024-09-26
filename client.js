const express = require("express");
const path = require("path");
const fs = require("fs");
const socketIOClient = require("socket.io-client");

// Express setup
const app = express();
const router = express.Router();

const binaryFilePath = path.join(__dirname, "twilio_output.bin");
const base64EncodedFilePath = path.join(__dirname, "twilio_output.rawb64");
const jsonFilePath = path.join(__dirname, "twilio_output.json");

// Socket.io connection to your FastAPI WebSocket server
const socket = socketIOClient(
  "http://localhost:8088/audio?src_language=es-CO&tgt_language=en&input_format=twilio",
  {
    transports: ["websocket"],
  },
);

// Serve the HTML file on the root endpoint
router.get("/", (req, resp) => {
  resp.sendFile(path.join(__dirname + "/index.html"));
});

app.use("/", router);

// Read binary file and send chunks over the WebSocket
function sendBinaryFileOverSocket() {
  const BUFFER_SIZE_THRESHOLD = 4500; // Adjust the buffer size to your needs
  let buffer = Buffer.alloc(0); // Initialize empty buffer

  // Read the file stream in chunks
  const readStream = fs.createReadStream(binaryFilePath);

  readStream.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    // When the buffer reaches the threshold, send the data
    if (buffer.length >= BUFFER_SIZE_THRESHOLD) {
      console.log(`Sending accumulated buffer: ${buffer.length} bytes`);
      socket.emit("audio_chunk", buffer);
      buffer = Buffer.alloc(0); // Reset the buffer after sending
    }
  });

  // Send remaining data after reading the file
  readStream.on("end", () => {
    if (buffer.length > 0) {
      console.log(`Sending final buffer: ${buffer.length} bytes`);
      socket.emit("audio_chunk", buffer);
    }
  });

  readStream.on("error", (err) => {
    console.error("Error reading binary file:", err);
  });
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function sendJSONFileOverSocket() {
  const BUFFER_SIZE_THRESHOLD = 60000;
  let buffer = Buffer.alloc(0);

  var file = fs.readFileSync(jsonFilePath, "utf8");

  const jsonData = JSON.parse(file);

  for (const event of jsonData) {
    if (event.event === "media") {
      // console.log(`Media payload: ${event.media.payload}`);

      var stringPayload = event.media.payload.toString();
      console.log(typeof stringPayload);
      // var encodedBase64Payload = event.media.payload.toString("base64");
      // var decodedPayload = base64ToBytes(event.media.payload);

      var decodedPayload = Buffer.from(stringPayload, "base64");
      console.log(`Decoded media payload: ${decodedPayload}`);

      // Add decoded bytes to buffer
      buffer = Buffer.concat([buffer, decodedPayload]);
      console.log(`Current buffer length: ${buffer.length}`);

      if (buffer.length >= BUFFER_SIZE_THRESHOLD) {
        console.log(`Sending accumulated buffer: ${buffer.length} bytes`);
        socket.emit("audio_chunk", buffer);
        buffer = Buffer.alloc(0); // Reset the buffer after sending
      }
      await delay(100);
    }
  }

  // Send remaining data
  if (buffer.length > 0) {
    console.log(`Sending final buffer: ${buffer.length} bytes`);
    socket.emit("audio_chunk", buffer);
  }
}

async function sendJSONFileRawOverSocket() {
  var file = fs.readFileSync(jsonFilePath, "utf8");

  const jsonData = JSON.parse(file);

  for (const event of jsonData) {
    if (event.event === "media") {
      // console.log(`Media payload: ${event.media.payload}`);

      var stringPayload = event.media.payload.toString();

      console.log(`Sending String Payload: ${stringPayload}`);

      socket.emit("twilio_audio_chunk", stringPayload);
      await delay(100);
    }
  }
}

// From https://developer.mozilla.org/en-US/docs/Glossary/Base64#the_unicode_problem.
function base64ToBytes(base64) {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0));
}

// Read base64 file, decode it and send chunks over to the WebSocket
function decodeAndSendBinaryOverSocket() {
  const BUFFER_SIZE_THRESHOLD = 4500;
  let buffer = Buffer.alloc(0);

  const readStream = fs.createReadStream(base64EncodedFilePath);

  const fileContents = fs.readFileSync(base64EncodedFilePath);

  var encodedFileStringContents = fileContents.toString("base64");
  // console.log(`File contents: ${encodedFileStringContents.split(0, 20)}`);

  var decodedBase64Contents = base64ToBytes(encodedFileStringContents);

  // console.log(`Decoded file contents: ${decodedBase64Contents}`);

  // Add the bytes to the buffer
  Buffer.concat([buffer, decodedBase64Contents]);

  // Emit the buffer to FASTAPI
  socket.emit("audio_chunk", buffer);
  buffer = Buffer.alloc(0);
}

function handleErrors(err) {
  console.error(err);
}

// Connect to the WebSocket and start sending binary data
socket.on("connect", () => {
  console.log("Connected to WebSocket server");
  // sendBinaryFileOverSocket();

  // decodeAndSendBinaryOverSocket();

  sendJSONFileOverSocket();
  // sendJSONFileRawOverSocket();
});

socket.on("connect_error", (err) => handleErrors(err));
socket.on("connect_failed", (err) => handleErrors(err));

socket.on("disconnect", () => {
  console.log("Disconnected from WebSocket server");
});

app.listen(3000, () => console.log("Example app is listening on port 3000"));
