import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

export interface AutoFramingConfig {
  apiBaseUrl?: string; // what is this for again

  mediapipe: {
    visionTasksWasm: string;

    faceDetector: {
      modelAssetPath: string;
      delegate: "GPU" | "CPU";
      runningMode: "VIDEO" | "IMAGE";
      minDetectionConfidence: number;
    };
  };

  framing: {
    TARGET_FACE_RATIO: number;
    SMOOTHING_FACTOR: number;
    keepZoomReset: boolean;

    percentThresholdX: number;
    percentThresholdY: number;
    percentZoomThreshold: number;
  };

  canvas: {
    width: number;
    height: number;
    frameRate: number;
  };

  predictionInterval: number;
}

// Global variables
let CONFIG: any = {}; // object to hold config
let faceDetector: FaceDetector; // type: FaceDetector
let exportStream: MediaStream;

// defined in config
let TARGET_FACE_RATIO;
let SMOOTHING_FACTOR;
let keepZoomReset;

// init -> set config as param
// add public export method of lib which accepts input stream and returns output stream.
async function loadConfig(config_path: string) {
  // rejig so tht it takes autoframing config object as param, so that init() can access width/heigt
  try {
    // 1. Use fetch to get the JSON file
    const response = await fetch(config_path);

    // 2. Check if the network request was successful
    if (!response.ok) {
      // if not ok
      throw new Error(
        `HTTP error! status: ${response.status} while fetching config.json`
      );
    }

    // 3. json() parses the JSON response into a JavaScript object
    CONFIG = (await response.json()) as AutoFramingConfig;

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
    CONFIG.mediapipe.visionTasksWasm // do i still need this if using mediapipe import
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

// canvas setup
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

// // video setup
// let enableWebcamButton; // type: HTMLButtonElement

// // Check if webcam access is supported.
// const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia; // !! converts the result to true or false

// update video element parameter

/**
 * Enable live webcam view and start detection.
 * @param {event} event - event = click.
 */
// export async function enableCam(event: Event, inputStream: MediaStream) {
//   if (!faceDetector) {
//     alert("Face Detector is still loading. Please try again..");
//     return;
//   }

//   // // Remove the button.
//   // enableWebcamButton.remove();

//   // getUsermedia parameters
//   const constraints = {
//     video: true,
//   };

//   // Activate the webcam stream.
//   navigator.mediaDevices
//     .getUserMedia(constraints) // returns a Promise — meaning it's asynchronous
//     .then(function (stream) {
//       inputStream.srcObject = exportFramedStream();

//       // When the video finishes loading and is ready to play, run the autoframe function.
//       inputStream.addEventListener("loadeddata", (event) => {
//         autoframe(inputStream);
//       });

//       const videoTrack = stream.getVideoTracks()[0];
//       // const settings = videoTrack.getSettings();

//       // Store live settings in config so canvas size = video size
//       // CONFIG.canvas.width = settings.width;
//       // CONFIG.canvas.height = settings.height;
//       // CONFIG.canvas.frameRate = settings.frameRate;

//       canvas.width = 320;
//       // CONFIG.canvas.width; // 640;
//       canvas.height = 200;
//       // CONFIG.canvas.height; // 480;
//     })
//     .catch((err) => {
//       console.error(err);
//     });
// }

// FUNCTION CALLED IN ENABLECAM
let lastVideoTime = -1; // to make sure the func can start (-1 will never be equal to the video time)

let track: MediaStreamTrack;
let settings: MediaTrackSettings;
let lastDetectionTime = 0;
let sourceFrame;
/**
 *  function to continuously track face. WANT THIS TO BE ONLY CALLED ONCE,
 */
export function autoframe(inputStream: MediaStream): {
  framedStream: MediaStream;
  width: number;
  height;
} {
  console.log("inside autoframe");
  track = inputStream.getVideoTracks()[0];
  settings = track.getSettings();

  // Store live settings in config so canvas size = video size
  CONFIG.canvas.width = settings.width;
  CONFIG.canvas.height = settings.height;
  CONFIG.canvas.frameRate = settings.frameRate;
  console.log("Config loaded successfully:", CONFIG);

  canvas.width = CONFIG.canvas.width; // 640;
  canvas.height = CONFIG.canvas.height; // 480;

  console.log(`canvas width: ${canvas.width}, canvas height: ${canvas.height}`); // this works, returns 640 x 480

  predictionLoop(inputStream);

  exportStream = canvas.captureStream();
  console.log(exportStream);

  // return canvas width and height so app can access. should def make this more efficient later w config, just not sure how.
  return {
    framedStream: exportStream,
    width: canvas.width,
    height: canvas.height,
  };
}

// helper functions called by autoframe, processframe to capture frame
async function predictionLoop(inputStream: MediaStream) {
  console.log("inside predictionLoop");
  let now = performance.now();
  // draw every frame, but ony check face position every 500 ms. would sitll need pos change. add threshold to config file

  // Grab an ImageBitmap from the video track (snapshot frame). will draw no matter what
  sourceFrame = await videoFrame(inputStream);
  console.log(`diff in time ${performance.now() - now}`);

  if (now - lastDetectionTime >= CONFIG.predictionInterval) {
    lastDetectionTime = now;
    try {
      // // Grab an ImageBitmap from the video track (snapshot frame)
      // sourceFrame = await videoFrame(inputStream);

      // // does sourceFrame exist?
      // let test = document.createElement("canvas");
      // test.width = sourceFrame.width; // set canvas width
      // test.height = sourceFrame.height; // set canvas height
      // let draw = test.getContext("2d");
      // document.body.appendChild(test);

      // draw.drawImage(sourceFrame, 0, 0);

      // Run face detection on the ImageBitmap frame
      const detections = faceDetector.detectForVideo(
        sourceFrame,
        now
      ).detections;

      processFrame(detections, inputStream);

      // Remember to close the ImageBitmap to free memory (do this when everything else fs works)
      // sourceFrame.close();
    } catch (err) {
      console.error("Error grabbing frame or detecting face:", err);
    }
  }
  drawCurrentFrame(sourceFrame);
  // Schedule next run using requestAnimationFrame for smooth looping
  window.requestAnimationFrame(() => predictionLoop(inputStream));
}

let videoFrame = async (inputStream: MediaStream): Promise<ImageBitmap> => {
  const imageCapture = new (window as any).ImageCapture(track);

  return await imageCapture.grabFrame();
};

/*************************************************/
// FACE TRACKING + ZOOM
/*************************************************/
// smoothing and drawing declarations
let smoothedX = 0,
  smoothedY = 0,
  smoothedZoom = 0,
  firstDetection = true,
  oldFace = null;

/**
 * Processes each frame's autoframe crop box and draws it to canvas.
 * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
 */
function processFrame(detections, inputStream: MediaStream) {
  if (detections && detections.length > 0) {
    // if there is a face
    console.log("there is a face");
    const newFace = detections[0].boundingBox; // most prom face -> get box. maybe delete this and just make oldFace = face

    // 1. initialize oldFace to first EVER face to set anchor to track rest of face movements
    if (!oldFace) {
      oldFace = newFace;
    }

    // 2. has there been a significant jump or not?
    if (didPositionChange(newFace, oldFace)) {
      // if true, track newFace
      faceFrame(newFace, inputStream);
      oldFace = newFace; // if face moved a lot, now new pos = "old" pos as the reference.
    } else {
      // track oldFace
      faceFrame(oldFace, inputStream);
    }
  } else {
    if (keepZoomReset) {
      console.log("no face"); // if user wants camera to zoom out if no face detected
      zoomReset(inputStream);
    } // ALSO: make the transition between this smoother. if detected, then not detected, then detected (usntable detection), make sure it doesn't jump between zooms weirdly
  }

  // // Edgecase 1: avoid image stacking/black space when crop is smaller than canvas
  // let cropWidth = canvas.width / smoothedZoom;
  // let cropHeight = canvas.height / smoothedZoom;
  // let topLeftX = smoothedX - cropWidth / 2,
  //   topLeftY = smoothedY - cropHeight / 2;

  // topLeftX = Math.max(0, Math.min(topLeftX, CONFIG.canvas.width - cropWidth));
  // topLeftY = Math.max(0, Math.min(topLeftY, CONFIG.canvas.height - cropHeight));

  // console.log("ctx draw image will draw with params:", {
  //   source: sourceFrame,
  //   sx: topLeftX,
  //   sy: topLeftY,
  //   sWidth: cropWidth,
  //   sHeight: cropHeight,
  //   dx: 0,
  //   dy: 0,
  //   dWidth: canvas.width,
  //   dHeight: canvas.height,
  // });

  // ctx.drawImage(
  //   // doesnt take mediastream obj so trying with image bitmap instead
  //   sourceFrame, // source video

  //   // cropped from source
  //   topLeftX, // top left corner of crop in og vid. no mirroring in this math because want to cam to center person, not just track.
  //   topLeftY,
  //   cropWidth, // how wide a piece we're cropping from original vid
  //   cropHeight, // how tall

  //   // destination
  //   0, // x coord for where on canvas to start drawing (left->right)
  //   0, // y coord
  //   canvas.width, // since canvas width/height is hardcoded to my video resolution, this maintains aspect ratio. should change this to update to whatever cam resolution rainbow uses.
  //   canvas.height
  // );
  // console.log("finished drawing image");
}
/**
 * draws the current frame
 */
function drawCurrentFrame(sourceFrame: ImageBitmap) {
  // Edgecase 1: avoid image stacking/black space when crop is smaller than canvas
  let cropWidth = canvas.width / smoothedZoom;
  let cropHeight = canvas.height / smoothedZoom;
  let topLeftX = smoothedX - cropWidth / 2,
    topLeftY = smoothedY - cropHeight / 2;

  topLeftX = Math.max(0, Math.min(topLeftX, CONFIG.canvas.width - cropWidth));
  topLeftY = Math.max(0, Math.min(topLeftY, CONFIG.canvas.height - cropHeight));

  console.log("ctx draw image will draw with params:", {
    source: sourceFrame,
    sx: topLeftX,
    sy: topLeftY,
    sWidth: cropWidth,
    sHeight: cropHeight,
    dx: 0,
    dy: 0,
    dWidth: canvas.width,
    dHeight: canvas.height,
  });

  ctx.drawImage(
    // doesnt take mediastream obj so trying with image bitmap instead
    sourceFrame, // source video

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
  console.log("finished drawing image");
}

/******************************************************************** */
// FUNCTIONS USED IN processFrame():
/******************************************************************** */
/**
 * Sets up smoothed bounding parameters to autoframe face
 * @param {detection.boundingBox} face - bounding box of tracked face
 */
function faceFrame(face, inputStream: MediaStream) {
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
    zoomReset(inputStream); // reset zoom to 1
  }

  // Edge case 2: first detection of face = avoid blooming projection onto canvas
  if (firstDetection) {
    smoothedX = CONFIG.canvas.width / 2;
    smoothedY = CONFIG.canvas.height / 2;
    smoothedZoom = 1;
    firstDetection = false;
  }
}

/**
 * When face isn't detected, optional framing reset to default stream determined by keepZoomReset boolean.
 */
function zoomReset(inputStream: MediaStream) {
  smoothedX =
    (CONFIG.canvas.width / 2) * SMOOTHING_FACTOR +
    (1 - SMOOTHING_FACTOR) * smoothedX;

  smoothedY =
    (CONFIG.canvas.height / 2) * SMOOTHING_FACTOR +
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
  const thresholdX = canvas.width * CONFIG.framing.percentThresholdX; // set to 7% of the width rn
  const thresholdY = canvas.height * CONFIG.framing.percentThresholdY; // 7% of the height

  const zoomRatio = newFace.width / oldFace.width;
  // const zoomThreshold = 0.1; // allow 10% zoom change before reacting

  if (
    // if zoom/position changed a lot.
    Math.abs(newFace.originX - oldFace.originX) > thresholdX ||
    Math.abs(newFace.originY - oldFace.originY) > thresholdY ||
    Math.abs(1 - zoomRatio) > CONFIG.framing.percentZoomThreshold
  ) {
    return true;
  } else {
    return false;
  }
}

export async function init(config_path: string) {
  await loadConfig(config_path);
  console.log("Config loaded successfully:", CONFIG);

  TARGET_FACE_RATIO = CONFIG.framing.TARGET_FACE_RATIO;
  SMOOTHING_FACTOR = CONFIG.framing.SMOOTHING_FACTOR;
  keepZoomReset = CONFIG.framing.keepZoomReset;

  await initializefaceDetector(); // returns promises
}
