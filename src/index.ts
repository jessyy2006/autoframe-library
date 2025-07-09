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

export class AutoFramingLibrary {
  /*************************************************/
  // Private variable declarations
  /*************************************************/
  private CONFIG: AutoFramingConfig;

  // DEFINED IN CONFIG
  private TARGET_FACE_RATIO;
  private SMOOTHING_FACTOR;
  private keepZoomReset;

  // CONTINUOUS FACE DETECTION
  private faceDetector: FaceDetector;
  private exportStream: MediaStream;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d");

  public constructor() {} // default constructor

  // VALS FOR SMOOTHING
  private smoothedX = 0;
  private smoothedY = 0;
  private smoothedZoom = 0;
  private firstDetection = true;
  private refFace: any = null;

  // VARS IN processLoop
  private track: MediaStreamTrack;
  private settings: MediaTrackSettings;
  private lastDetectionTime = 0;
  private sourceFrame;
  private newFace;

  public async init(config_path: string) {
    await this.loadConfig(config_path);
    console.log("Config loaded successfully:", this.CONFIG);

    this.TARGET_FACE_RATIO = this.CONFIG.framing.TARGET_FACE_RATIO;
    this.SMOOTHING_FACTOR = this.CONFIG.framing.SMOOTHING_FACTOR;
    this.keepZoomReset = this.CONFIG.framing.keepZoomReset;

    await this.initializefaceDetector(); // returns promises
  }

  /*******************************************************/
  // FUNCTIONS CALLED IN init():
  /*******************************************************/

  private async loadConfig(config_path: string): Promise<void> {
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
      this.CONFIG = (await response.json()) as AutoFramingConfig;

      console.log("Config loaded successfully:", this.CONFIG);
      console.log("API Base URL:", this.CONFIG.apiBaseUrl);
    } catch (error) {
      console.error("Error loading or parsing config.json:", error);
      // might want to initialize with default settings if the config fails to load (should i?)
    }
  }

  // Initialize the object detector
  private async initializefaceDetector() {
    const vision = await FilesetResolver.forVisionTasks(
      // use await to pause the async func and temporarily return to main thread until promise resolves: force js to finish this statement first before moving onto the second, as the second is dependent on the first. however, browser can still load animations, etc during this time
      this.CONFIG.mediapipe.visionTasksWasm // do i still need this if using mediapipe import
    ); // "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm" // location of the WebAssembly (WASM) files and other essential assets that the Mediapipe FilesetResolver needs to load to function correctly.

    this.faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: this.CONFIG.mediapipe.faceDetector.modelAssetPath, // `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/ blaze_face_short_range.tflite`, // ML model that detects faces at close range (path to the specific model) // update these based on config
        delegate: this.CONFIG.mediapipe.faceDetector.delegate, // "GPU", // update these based on config
      },
      runningMode: this.CONFIG.mediapipe.faceDetector.runningMode, // runningMode, update these based on config
      minDetectionConfidence:
        this.CONFIG.mediapipe.faceDetector.minDetectionConfidence, // 0.7, update these based on config
    });
  }

  /*************************************************/
  // FACE TRACKING + ZOOM
  /*************************************************/

  /**
   *  function to continuously track face. WANT THIS TO BE ONLY CALLED ONCE,
   */
  public autoframe(inputStream: MediaStream): {
    framedStream: MediaStream;
    width: number;
    height;
  } {
    console.log("inside autoframe");
    this.track = inputStream.getVideoTracks()[0];
    this.settings = this.track.getSettings();

    // Store live settings in config so canvas size = video size
    this.CONFIG.canvas.width = this.settings.width;
    this.CONFIG.canvas.height = this.settings.height;
    this.CONFIG.canvas.frameRate = this.settings.frameRate;
    console.log("Config loaded successfully:", this.CONFIG);

    this.canvas.width = this.CONFIG.canvas.width; // 640;
    this.canvas.height = this.CONFIG.canvas.height; // 480;

    console.log(
      `canvas width: ${this.canvas.width}, canvas height: ${this.canvas.height}`
    ); // this works, returns 640 x 480

    this.predictionLoop(inputStream);

    this.exportStream = this.canvas.captureStream();
    console.log(this.exportStream);

    // return canvas width and height so app can access. should def make this more efficient later w config, just not sure how.
    return {
      framedStream: this.exportStream,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  // helper functions called by autoframe, processframe to capture frame
  async predictionLoop(inputStream: MediaStream): Promise<void> {
    console.log("inside predictionLoop");
    let now = performance.now();
    // draw every frame, but ony check face position every 500 ms. would sitll need pos change. add threshold to config file

    // Grab an ImageBitmap from the video track (snapshot frame). will draw no matter what
    this.sourceFrame = await this.videoFrame(inputStream);
    console.log(`diff in time ${performance.now() - now}`);

    if (now - this.lastDetectionTime >= this.CONFIG.predictionInterval) {
      this.lastDetectionTime = now;
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
        const detections = this.faceDetector.detectForVideo(
          this.sourceFrame,
          now
        ).detections;

        this.processFrame(detections, inputStream);
      } catch (err) {
        console.error("Error grabbing frame or detecting face:", err);
      }
    }

    this.faceFrame(this.refFace, inputStream);
    this.drawCurrentFrame(this.sourceFrame);
    // Schedule next run using requestAnimationFrame for smooth looping
    window.requestAnimationFrame(() => this.predictionLoop(inputStream));
  }

  private videoFrame = async (
    inputStream: MediaStream
  ): Promise<ImageBitmap> => {
    const imageCapture = new (window as any).ImageCapture(this.track);
    return await imageCapture.grabFrame();
  };

  /**
   * Processes each frame's autoframe crop box and draws it to canvas.
   * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
   */
  private processFrame(detections, inputStream: MediaStream) {
    if (detections && detections.length > 0) {
      // if there is a face
      console.log("there is a face");
      this.newFace = detections[0].boundingBox; // most prom face -> get box. maybe delete this and just make refFace = face

      // 1. initialize refFace to first EVER face to set anchor to track rest of face movements
      if (!this.refFace) {
        this.refFace = this.newFace;
      }

      // 2. has there been a significant jump or not?
      if (this.didPositionChange(this.newFace, this.refFace)) {
        // if true, track newFace
        // faceFrame(newFace, inputStream);
        this.refFace = this.newFace; // if face moved a lot, now new pos = "old" pos as the reference.
      } else {
        // track refFace
        // faceFrame(refFace, inputStream);
      }
    } else {
      if (this.keepZoomReset) {
        console.log("no face"); // if user wants camera to zoom out if no face detected
        this.zoomReset(inputStream);
      } // ALSO: make the transition between this smoother. if detected, then not detected, then detected (usntable detection), make sure it doesn't jump between zooms weirdly
    }
  }
  /**
   * draws the current frame
   */
  private drawCurrentFrame(sourceFrame: ImageBitmap) {
    // Edgecase 1: avoid image stacking/black space when crop is smaller than canvas
    let cropWidth = this.canvas.width / this.smoothedZoom;
    let cropHeight = this.canvas.height / this.smoothedZoom;
    let topLeftX = this.smoothedX - cropWidth / 2,
      topLeftY = this.smoothedY - cropHeight / 2;

    topLeftX = Math.max(
      0,
      Math.min(topLeftX, this.CONFIG.canvas.width - cropWidth)
    );
    topLeftY = Math.max(
      0,
      Math.min(topLeftY, this.CONFIG.canvas.height - cropHeight)
    );

    console.log("ctx draw image will draw with params:", {
      source: sourceFrame,
      sx: topLeftX,
      sy: topLeftY,
      sWidth: cropWidth,
      sHeight: cropHeight,
      dx: 0,
      dy: 0,
      dWidth: this.canvas.width,
      dHeight: this.canvas.height,
    });

    this.ctx.drawImage(
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
      this.canvas.width, // since canvas width/height is hardcoded to my video resolution, this maintains aspect ratio. should change this to update to whatever cam resolution rainbow uses.
      this.canvas.height
    );
    console.log("finished drawing image");
    // Remember to close the ImageBitmap to free memory (do this when everything else fs works)
    this.sourceFrame.close();
  }

  /******************************************************************** */
  // FUNCTIONS USED IN processFrame():
  /******************************************************************** */
  /**
   * Sets up smoothed bounding parameters to autoframe face
   * @param {detection.boundingBox} face - bounding box of tracked face
   */
  private faceFrame(face, inputStream: MediaStream) {
    // EMA formula: smoothedY = targetY * α + smoothedY * (1 - α)
    let xCenter = face.originX + face.width / 2; // x center of face
    let yCenter = face.originY + face.height / 2; // current raw value

    // 1. Smooth face position (EMA)
    this.smoothedX =
      xCenter * this.SMOOTHING_FACTOR +
      (1 - this.SMOOTHING_FACTOR) * this.smoothedX;
    this.smoothedY =
      yCenter * this.SMOOTHING_FACTOR +
      (1 - this.SMOOTHING_FACTOR) * this.smoothedY; // use old smoothed value to get new smoothed value. this gets a "ratio" where new smoothedY is made up w a little bit of the new value and most of the old

    // 2. calc zoom level
    let targetFacePixels = this.TARGET_FACE_RATIO * this.canvas.height; // % of the canvas u wanna take up * height of canvas
    let zoomScale = targetFacePixels / face.width; // how much should our face be scaled based on its current bounding box width

    // Edge case 1: locking zoom at 1 when face comes really close.
    if (zoomScale >= 1) {
      this.smoothedZoom =
        zoomScale * this.SMOOTHING_FACTOR +
        (1 - this.SMOOTHING_FACTOR) * this.smoothedZoom;
    } else {
      this.zoomReset(inputStream); // reset zoom to 1
    }

    // Edge case 2: first detection of face = avoid blooming projection onto canvas
    if (this.firstDetection) {
      this.smoothedX = this.CONFIG.canvas.width / 2;
      this.smoothedY = this.CONFIG.canvas.height / 2;
      this.smoothedZoom = 1;
      this.firstDetection = false;
    }
  }

  /**
   * When face isn't detected, optional framing reset to default stream determined by keepZoomReset boolean.
   */
  private zoomReset(inputStream: MediaStream) {
    this.smoothedX =
      (this.CONFIG.canvas.width / 2) * this.SMOOTHING_FACTOR +
      (1 - this.SMOOTHING_FACTOR) * this.smoothedX;

    this.smoothedY =
      (this.CONFIG.canvas.height / 2) * this.SMOOTHING_FACTOR +
      (1 - this.SMOOTHING_FACTOR) * this.smoothedY;

    this.smoothedZoom =
      1 * this.SMOOTHING_FACTOR +
      (1 - this.SMOOTHING_FACTOR) * this.smoothedZoom;
  }
  /**
   * Every frame, check if face position has changed enough to warrant tracking.
   * @param {detection.boundingBox} newFace - current frame's face bounding box
   * @param {detection.boundingBox} refFace - most recent "still" frame's face bounding box (anchor)
   * @return {boolean} true = track new, false = track old
   */
  private didPositionChange(newFace, refFace) {
    console.log("inside did pos change fx");
    const thresholdX =
      this.canvas.width * this.CONFIG.framing.percentThresholdX; // set to 7% of the width rn
    const thresholdY =
      this.canvas.height * this.CONFIG.framing.percentThresholdY; // 7% of the height

    const zoomRatio = newFace.width / refFace.width;

    if (
      // if zoom/position changed a lot.
      Math.abs(newFace.originX - refFace.originX) > thresholdX ||
      Math.abs(newFace.originY - refFace.originY) > thresholdY ||
      Math.abs(1 - zoomRatio) > this.CONFIG.framing.percentZoomThreshold
    ) {
      return true;
    } else {
      return false;
    }
  }
}

/* TODOS:
1. make default config and only update to user's config if that value exists
2. fix uncaught promise error at the end of process frame
3. make tracking less jittery with smooth tracking from one place to the next without intermediate stops + abrupt changes
*/
