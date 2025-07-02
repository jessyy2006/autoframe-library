import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export interface AutoFramingConfig {
  apiBaseUrl?: string;
}

// Global variables
let CONFIG: any = {}; // object to hold config
let faceDetector; // type: FaceDetector

// defined in config
let TARGET_FACE_RATIO;
let SMOOTHING_FACTOR;
let keepZoomReset;
// add public export method of lib which accepts input stream and returns output stream.
async function loadConfig() {
  try {
    // 1. Use fetch to get the JSON file
    const response = await fetch("./config.json");

    // 2. Check if the network request was successful
    if (!response.ok) {
      // if not ok
      throw new Error(
        `HTTP error! status: ${response.status} while fetching config.json`
      );
    }

    // 3. json() parses the JSON response into a JavaScript object
    CONFIG = await response.json();

    console.log("Config loaded successfully:", CONFIG);
    console.log("API Base URL:", CONFIG.apiBaseUrl);
  } catch (error) {
    console.error("Error loading or parsing config.json:", error);
    // might want to initialize with default settings if the config fails to load (should i?)
  }
}

// Initialize the object detector
const initializefaceDetector = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    // use await to pause the async func and temporarily return to main thread until promise resolves: force js to finish this statement first before moving onto the second, as the second is dependent on the first. however, browser can still load animations, etc during this time
    CONFIG.mediapipe.visionTasksWasm
  ); // "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm" // location of the WebAssembly (WASM) files and other essential assets that the Mediapipe FilesetResolver needs to load to function correctly.

  faceDetector = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: CONFIG.mediapipe.faceDetector.modelAssetPath, // `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/ blaze_face_short_range.tflite`, // ML model that detects faces at close range (path to the specific model) // update these based on config
      delegate: CONFIG.mediapipe.faceDetector.delegate, // "GPU", // update these based on config
    },
    runningMode: CONFIG.mediapipe.faceDetector.runningMode, // runningMode, update these based on config
    minDetectionConfidence:
      CONFIG.mediapipe.faceDetector.minDetectionConfidence, // 0.7, update these based on config
  });
};

/*************************************************/
// CONTINUOUS FACE DETECTION
/*************************************************/
let videoFull: HTMLVideoElement = document.getElementById(
  "webcamFull"
) as HTMLVideoElement; // html element, empty frame for video
let videoZoom: HTMLVideoElement = document.getElementById(
  "webcamMask"
) as HTMLVideoElement; // empty frame for masked video png

// canvas setup
// const canvas = new OffscreenCanvas(320, 200);
const canvas = document.createElement("canvas");
// document.getElementById("framedOutput");
const ctx = canvas.getContext("2d");

// video setup
const liveFullView = document.getElementById("liveFullView"); // can't change constant vars
const liveMaskView = document.getElementById("liveMaskView"); // div holding the video screen and face detection graphics.
let enableWebcamButton; // type: HTMLButtonElement
let children = []; // Keep a reference of all the child elements we create on video stream so we can remove them easily on each render.

// Check if webcam access is supported.
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia; // !! converts the result to true or false

/**
 * Enable live webcam view and start detection.
 * @param {event} event - event = click.
 */
async function enableCam(event) {
  if (!faceDetector) {
    alert("Face Detector is still loading. Please try again..");
    return;
  }

  // Remove the button.
  enableWebcamButton.remove();

  // getUsermedia parameters
  const constraints = {
    video: true,
  };

  // Activate the webcam stream.
  navigator.mediaDevices
    .getUserMedia(constraints) // returns a Promise — meaning it's asynchronous
    .then(function (stream) {
      // stream = a MediaStream object created by getUserMedia()= the actual webcam feed
      // runs when the user accepts cam permissions and the webcam stream is ready.
      // .then(func ()): waits for the Promise by getUserMedia to finish. Once it’s ready, .then() runs the function you write below w the parameter as the thing getUserMedia returns/the thing you're waiting for (ex. When the webcam is ready, run this function and give it the video stream)

      videoFull.srcObject = stream; // link stream to video html element, which until now was just empty frame
      // videoZoom.srcObject = stream;
      videoZoom.srcObject = exportFramedStream();

      videoFull.addEventListener("loadeddata", () => {
        predictWebcam();
      }); // When the video finishes loading and is ready to play, run the predictWebcam function.
      videoZoom.addEventListener("loadeddata", predictWebcam);

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();

      // Store live settings in config so canvas size = video size
      // CONFIG.canvas.width = settings.width;
      // CONFIG.canvas.height = settings.height;
      // CONFIG.canvas.frameRate = settings.frameRate;

      canvas.width = 320;
      // CONFIG.canvas.width; // 640;
      canvas.height = 200;
      // CONFIG.canvas.height; // 480;
    })
    .catch((err) => {
      console.error(err);
    });
}

let lastVideoTime = -1; // to make sure the func can start (-1 will never be equal to the video time)
/**
 * Recursive function to continuously track face
 */
async function predictWebcam() {
  let startTimeMs = performance.now();
  // Detect faces using detectForVideo
  if (videoFull.currentTime !== lastVideoTime) {
    lastVideoTime = videoFull.currentTime;
    const detections = faceDetector.detectForVideo(
      videoFull,
      startTimeMs
    ).detections;
    // above line returns an object w params: {
    //   detections: [/* array of detected faces */],
    //   timestampMs: 123456789 // processing timestamp
    // } and extracts JUST THE DETECTIONS (1st param), which are objects that contain: {
    //   boundingBox: { /* x,y,width,height */ },
    //   keypoints: [ /* facial landmarks */ ],
    //   confidence: 0.98 // detection certainty
    // }
    displayVideoDetections(detections); // calling func below using the face positions/landmarks in pixel coordinates stored in "detections" => VISUALIZES DETECTIONS. since mediapipe orders the most prominently detected face first, detections[0] is the most obvious face.

    processFrame(detections);
  }

  // Call this function again to keep predicting when the browser is ready
  window.requestAnimationFrame(predictWebcam);
}

/**
 * VISUALIZES DETECTIONS for each frame on video element. Detects multiple people.
 * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
 */
function displayVideoDetections(detections) {
  // Remove any highlighting from previous frame (constantly updating each frame).
  for (let child of children) {
    liveFullView.removeChild(child);
  }
  children.splice(0);

  // Iterate through predictions and draw them to the live view
  for (let detection of detections) {
    // create % sign
    const p = document.createElement("p");
    p.innerText =
      "Confidence: " +
      Math.round(parseFloat(detection.categories[0].score) * 100) +
      "%"; // gets score as float, turns into percent, rounds to whole number

    p.style = // style position of the percent
      "left: " +
      (videoFull.offsetWidth -
        detection.boundingBox.width -
        detection.boundingBox.originX) +
      "px;" +
      "top: " +
      (detection.boundingBox.originY - 30) +
      "px; " +
      "width: " +
      (detection.boundingBox.width - 10) +
      "px;";

    // create box
    const highlighter = document.createElement("div");
    highlighter.setAttribute("class", "highlighter"); // assign css class styling "highlighter"
    highlighter.style =
      "left: " +
      (videoFull.offsetWidth -
        detection.boundingBox.width -
        detection.boundingBox.originX) +
      "px;" +
      "top: " +
      detection.boundingBox.originY +
      "px;" +
      "width: " +
      (detection.boundingBox.width - 10) +
      "px;" +
      "height: " +
      detection.boundingBox.height +
      "px;";

    // add both objects to livestream
    liveFullView.appendChild(highlighter);
    liveFullView.appendChild(p);

    // Store drawn objects in memory so they are queued to delete at next call
    children.push(highlighter);
    children.push(p);

    for (let keypoint of detection.keypoints) {
      const keypointEl = document.createElement("span"); // make an element to represent the keypoint
      keypointEl.className = "key-point"; // assign it a styling class in css
      keypointEl.style.top = `${keypoint.y * videoFull.offsetHeight - 3}px`; // adjust its location to fit the video
      keypointEl.style.left = `${
        videoFull.offsetWidth - keypoint.x * videoFull.offsetWidth - 3
      }px`;
      liveFullView.appendChild(keypointEl); // add to liveFullView
      children.push(keypointEl); // add to children so that it can be deleted on the next frame
    }
  }
}

/*************************************************/
// FACE TRACKING + ZOOM
/*************************************************/

// smoothing and drawing declarations
let smoothedX = 0,
  smoothedY = 0,
  smoothedZoom = 0,
  firstDetection = true,
  canvasStarted = false, // debugging only, remove
  oldFace = null;

/**
 * Processes each frame's autoframe crop box and draws it to canvas.
 * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
 */
function processFrame(detections) {
  if (detections && detections.length > 0) {
    // if there is a face
    const newFace = detections[0].boundingBox; // most prom face -> get box. maybe delete this and just make oldFace = face

    // 1. initialize oldFace to first EVER face to set anchor to track rest of face movements
    if (!oldFace) {
      oldFace = newFace;
    }

    // 2. has there been a significant jump or not?
    if (didPositionChange(newFace, oldFace)) {
      // if true, track newFace
      faceFrame(newFace);
      oldFace = newFace; // if face moved a lot, now new pos = "old" pos as the reference.
    } else {
      // track oldFace
      faceFrame(oldFace);
    }
  } else {
    if (keepZoomReset) {
      // if user wants camera to zoom out if no face detected
      zoomReset();
    } // ALSO: make the transition between this smoother. if detected, then not detected, then detected (usntable detection), make sure it doesn't jump between zooms weirdly
  }

  // Edgecase 1: avoid image stacking/black space when crop is smaller than canvas
  let cropWidth = canvas.width / smoothedZoom;
  let cropHeight = canvas.height / smoothedZoom;
  let topLeftX = smoothedX - cropWidth / 2,
    topLeftY = smoothedY - cropHeight / 2;

  topLeftX = Math.max(0, Math.min(topLeftX, videoFull.videoWidth - cropWidth));
  topLeftY = Math.max(
    0,
    Math.min(topLeftY, videoFull.videoHeight - cropHeight)
  );

  ctx.drawImage(
    videoFull, // source video

    // cropped from source
    topLeftX, // top left corner of crop in og vid. no mirroring in this math because want to cam to center person, not just track.
    topLeftY,
    cropWidth, // how wide a piece we're cropping from original vid
    cropHeight, // how tall

    // destination
    0, // x coord for where on canvas to start drawing (left->right)
    0, // y coord
    canvas.width, // since canvas width/height is hardcoded to my video resolution, this maintains aspect ratio. should change this to update to whatever cam resolution rainbow uses.
    canvas.height
  );
  // if (!canvasStarted) {
  //   console.log("canvas hasn't started being drawn");
  //   videoZoom.srcObject = exportFramedStream();
  //   console.log("Assigned stream to videoZoom:", videoZoom.srcObject);
  //   canvasStarted = true;
  // } // display captured stream
}
/******************************************************************** */
// FUNCTIONS USED IN processFrame():
/******************************************************************** */
/**
 * Sets up smoothed bounding parameters to autoframe face
 * @param {detection.boundingBox} face - bounding box of tracked face
 */
function faceFrame(face) {
  // EMA formula: smoothedY = targetY * α + smoothedY * (1 - α)
  let xCenter = face.originX + face.width / 2; // x center of face
  let yCenter = face.originY + face.height / 2; // current raw value

  // 1. Smooth face position (EMA)
  smoothedX = xCenter * SMOOTHING_FACTOR + (1 - SMOOTHING_FACTOR) * smoothedX;
  smoothedY = yCenter * SMOOTHING_FACTOR + (1 - SMOOTHING_FACTOR) * smoothedY; // use old smoothed value to get new smoothed value. this gets a "ratio" where new smoothedY is made up w a little bit of the new value and most of the old

  // 2. calc zoom level
  let targetFacePixels = TARGET_FACE_RATIO * canvas.height; // % of the canvas u wanna take up * height of canvas
  let zoomScale = targetFacePixels / face.width; // how much should our face be scaled based on its current bounding box width

  // Edge case 1: locking zoom at 1 when face comes really close.
  if (zoomScale >= 1) {
    smoothedZoom =
      zoomScale * SMOOTHING_FACTOR + (1 - SMOOTHING_FACTOR) * smoothedZoom;
  } else {
    zoomReset(); // reset zoom to 1
  }

  // Edge case 2: first detection of face = avoid blooming projection onto canvas
  if (firstDetection) {
    smoothedX = videoFull.videoWidth / 2;
    smoothedY = videoFull.videoHeight / 2;
    smoothedZoom = 1;
    firstDetection = false;
  }
}
/**
 * When face isn't detected, optional framing reset to default stream determined by keepZoomReset boolean.
 */
function zoomReset() {
  smoothedX =
    (videoFull.videoWidth / 2) * SMOOTHING_FACTOR +
    (1 - SMOOTHING_FACTOR) * smoothedX;
  smoothedY =
    (videoFull.videoHeight / 2) * SMOOTHING_FACTOR +
    (1 - SMOOTHING_FACTOR) * smoothedY;
  smoothedZoom = 1 * SMOOTHING_FACTOR + (1 - SMOOTHING_FACTOR) * smoothedZoom;
}
/**
 * Every frame, check if face position has changed enough to warrant tracking.
 * @param {detection.boundingBox} newFace - current frame's face bounding box
 * @param {detection.boundingBox} oldFace - most recent "still" frame's face bounding box (anchor)
 * @return {boolean} true = track new, false = track old
 */
function didPositionChange(newFace, oldFace) {
  console.log("inside did pos change fx");
  const thresholdX = canvas.width * 0.07; // 7% of the width
  const thresholdY = canvas.height * 0.07; // 7% of the height

  const zoomRatio = newFace.width / oldFace.width;
  const zoomThreshold = 0.1; // allow 10% zoom change before reacting

  if (
    // if zoom/position changed a lot.
    Math.abs(newFace.originX - oldFace.originX) > thresholdX ||
    Math.abs(newFace.originY - oldFace.originY) > thresholdY ||
    Math.abs(1 - zoomRatio) > zoomThreshold
  ) {
    return true;
  } else {
    return false;
  }
}

async function main() {
  await loadConfig();

  TARGET_FACE_RATIO = CONFIG.framing.TARGET_FACE_RATIO;
  SMOOTHING_FACTOR = CONFIG.framing.SMOOTHING_FACTOR;
  keepZoomReset = CONFIG.framing.keepZoomReset;

  await initializefaceDetector(); // returns promises

  if (hasGetUserMedia()) {
    enableWebcamButton = document.getElementById("webcamButton");
    enableWebcamButton.addEventListener("click", enableCam); // When someone clicks this button, run the enableCam function
  } else {
    console.warn("getUserMedia() is not supported by your browser");
  }
}
main();

function exportFramedStream() {
  console.log("inside exportFramedStream");
  return canvas.captureStream(); //CONFIG.canvas.frameRate
}
