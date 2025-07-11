import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import defaultConfig from './defaultConfig.json' assert { type: 'json' };

/**
 * RainbowAutoFramingConfig defines the configuration options for the RainbowAutoFramingLibrary.
 * It includes settings for Mediapipe, framing parameters, canvas dimensions, and prediction intervals.
 */
export interface RainbowAutoFramingConfig {

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

/**
 * RainbowAutoFramingLibrary is a class that provides autoframing functionality using face detection.
 * It uses the Mediapipe library to detect faces in a video stream and adjusts the framing accordingly.
 */
export class RainbowAutoFramingLibrary {

	// CONTINUOUS FACE DETECTION
	private faceDetector: FaceDetector;
	private canvas = document.createElement("canvas");
	private ctx = this.canvas.getContext("2d");

	// VALS FOR SMOOTHING
	private smoothedX = 0;
	private smoothedY = 0;
	private smoothedZoom = 0;
	private firstDetection = true;
	private refFace: any = null;

	// VARS IN processLoop
	private track: MediaStreamTrack;
	private trackSettings: MediaTrackSettings;
	private lastDetectionTime = 0;
	private sourceFrame;
	private newFace;

	private constructor() { }

	public config: RainbowAutoFramingConfig = defaultConfig as RainbowAutoFramingConfig;

	/* ***************************************************** */
	/* ** PUBLIC API                                      ** */
	/* ***************************************************** */

	/**
	 * Creates an instance of the RainbowAutoFramingLibrary.
	 * @returns A new instance of the library.
	 */
	public static create(): RainbowAutoFramingLibrary { return new RainbowAutoFramingLibrary(); }

	/**
	 * Initializes the RainbowAutoFramingLibrary with a configuration.
	 * @param config - Optional configuration object to override default settings.
	 */
	public async start(config?: RainbowAutoFramingConfig): Promise<void> {
		try {
			if (config) this.config = config; 
			await this.initializefaceDetector();
			console.info(`[RainbowAutoFramingLibrary] start -- success`);
		}
		catch (error) {
			console.error(`[RainbowAutoFramingLibrary] start -- failure -- ${error?.message}`);
			throw error;
		}
	}

	public async stop(): Promise<void> {
		try {
			this.faceDetector.close();
			console.info(`[RainbowAutoFramingLibrary] stop -- success`);
		}
		catch (error) {
			console.error(`[RainbowAutoFramingLibrary] stop -- failure -- ${error?.message}`);
			throw error;
		}
	}

	/**
	 * Start the autoframing process with a MediaStream input.
	 * @param inputStream - The MediaStream to be processed for autoframing.
	 * @returns A MediaStream with the autoframed video.
	 */
	public autoframe(inputStream: MediaStream): MediaStream {
		try {
			this.track = inputStream.getVideoTracks()[0];
			if (!this.track) return inputStream;

			this.trackSettings = this.track.getSettings();

			// Store live settings in config so canvas size = video size
			this.config.canvas.width = this.trackSettings.width;
			this.config.canvas.height = this.trackSettings.height;
			this.config.canvas.frameRate = this.trackSettings.frameRate;

			this.canvas.width = this.config.canvas.width; // 640;
			this.canvas.height = this.config.canvas.height; // 480;

			console.log(`canvas width: ${this.canvas.width}, canvas height: ${this.canvas.height}`); 
			// this works, returns 640 x 480

			this.predictionLoop(inputStream);

			// Return canvas width and height so app can access. 
			// Should def make this more efficient later w config, just not sure how.
			return this.canvas.captureStream();
		}
		catch (error) {
			console.error(`[RainbowAutoFramingLibrary] autoframe -- failure -- ${error?.message}`);
			throw error;
		}
	}


	/* ***************************************************** */
	/* ** PRIVATE METHOD                                  ** */
	/* ***************************************************** */
	
	/**
	 * Initializes the face detector using Mediapipe's FaceDetector.
	 * This method sets up the face detection model and its options.
	 * @returns A promise that resolves when the face detector is initialized.
	 */
	private async initializefaceDetector() {
		const vision = await FilesetResolver.forVisionTasks(
			// use await to pause the async func and temporarily return to main thread until promise resolves: force js to finish this statement first before moving onto the second, as the second is dependent on the first. however, browser can still load animations, etc during this time
			this.config.mediapipe.visionTasksWasm // do i still need this if using mediapipe import
		); // "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm" // location of the WebAssembly (WASM) files and other essential assets that the Mediapipe FilesetResolver needs to load to function correctly.

		this.faceDetector = await FaceDetector.createFromOptions(vision, {
			baseOptions: {
				modelAssetPath: this.config.mediapipe.faceDetector.modelAssetPath, // `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/ blaze_face_short_range.tflite`, // ML model that detects faces at close range (path to the specific model) // update these based on config
				delegate: this.config.mediapipe.faceDetector.delegate, // "GPU", // update these based on config
			},
			runningMode: this.config.mediapipe.faceDetector.runningMode, // runningMode, update these based on config
			minDetectionConfidence: this.config.mediapipe.faceDetector.minDetectionConfidence, // 0.7, update these based on config
		});
	}

	/*************************************************/
	// FACE TRACKING + ZOOM
	/*************************************************/

	/**
	 * Main loop for face detection and autoframing.
	 * This method continuously captures frames from the input stream, detects faces, and adjusts the framing accordingly.
	 * @param inputStream - The MediaStream to be processed for autoframing.
	 */
	private async predictionLoop(inputStream: MediaStream): Promise<void> {
		let now = performance.now();
		// draw every frame, but ony check face position every 500 ms. would sitll need pos change. add threshold to config file

		// Grab an ImageBitmap from the video track (snapshot frame). will draw no matter what
		this.sourceFrame = await this.videoFrame();
		//console.log(`diff in time ${performance.now() - now}`);

		if (now - this.lastDetectionTime >= this.config.predictionInterval) {
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
				const detections = this.faceDetector.detectForVideo(this.sourceFrame, now).detections;
				this.processFrame(detections, inputStream);
			} 
			catch (error) {
				console.error(`[RainbowAutoFramingLibrary] predictionLoop -- failure -- Error grabbing frame or detecting face ${error?.message}`);
			}
		}

		this.faceFrame(this.refFace, inputStream);
		this.drawCurrentFrame(this.sourceFrame);

		// Schedule next run using requestAnimationFrame for smooth looping
		window.requestAnimationFrame(() => this.predictionLoop(inputStream));
	}
	
	/**
	 * Captures a video frame from the MediaStream track.
	 * @param inputStream - The MediaStream from which to capture the frame.
	 * @returns A promise that resolves to an ImageBitmap of the captured frame.
	 */
	private async videoFrame(): Promise<ImageBitmap> {
		const imageCapture = new (window as any).ImageCapture(this.track);
		return await imageCapture.grabFrame();
	}

	/**
	 * Processes each frame's autoframe crop box and draws it to canvas.
	 * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
	 */
	private processFrame(detections: any, inputStream: MediaStream): void {
		if (detections && detections.length > 0) {
			// if there is a face
			//console.log("there is a face");
			this.newFace = detections[0].boundingBox; // most prom face -> get box. maybe delete this and just make refFace = face

			// 1. initialize refFace to first EVER face to set anchor to track rest of face movements
			if (!this.refFace) this.refFace = this.newFace;

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
			if (this.config.framing.keepZoomReset) {
				console.log("no face"); // if user wants camera to zoom out if no face detected
				this.zoomReset();
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
		let topLeftX = this.smoothedX - cropWidth / 2
		let topLeftY = this.smoothedY - cropHeight / 2;

		topLeftX = Math.max(0, Math.min(topLeftX, this.config.canvas.width - cropWidth));
		topLeftY = Math.max(0, Math.min(topLeftY, this.config.canvas.height - cropHeight));

		/*console.log("ctx draw image will draw with params:", {
			source: sourceFrame,
			sx: topLeftX,
			sy: topLeftY,
			sWidth: cropWidth,
			sHeight: cropHeight,
			dx: 0,
			dy: 0,
			dWidth: this.canvas.width,
			dHeight: this.canvas.height,
		});*/

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
		//console.log("finished drawing image");
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
	private faceFrame(face: any , inputStream: MediaStream): void {
		const smoothingFactor = this.config.framing.SMOOTHING_FACTOR;

		// EMA formula: smoothedY = targetY * α + smoothedY * (1 - α)
		let xCenter = face.originX + face.width / 2; // x center of face
		let yCenter = face.originY + face.height / 2; // current raw value

		// 1. Smooth face position (EMA)
		this.smoothedX = xCenter * smoothingFactor + (1 - smoothingFactor) * this.smoothedX;
		this.smoothedY = yCenter * smoothingFactor + (1 - smoothingFactor) * this.smoothedY;
		// use old smoothed value to get new smoothed value. this gets a "ratio" where new smoothedY is made up w a little bit of the new value and most of the old

		// 2. calc zoom level
		let targetFacePixels = this.config.framing.TARGET_FACE_RATIO * this.canvas.height; // % of the canvas u wanna take up * height of canvas
		let zoomScale = targetFacePixels / face.width; // how much should our face be scaled based on its current bounding box width

		// Edge case 1: locking zoom at 1 when face comes really close.
		if (zoomScale >= 1) this.smoothedZoom = zoomScale * smoothingFactor + (1 - smoothingFactor) * this.smoothedZoom;
		else this.zoomReset(); // reset zoom to 1

		// Edge case 2: first detection of face = avoid blooming projection onto canvas
		if (this.firstDetection) {
			this.smoothedX = this.config.canvas.width / 2;
			this.smoothedY = this.config.canvas.height / 2;
			this.smoothedZoom = 1;
			this.firstDetection = false;
		}
	}

	/**
	 * When face isn't detected, optional framing reset to default stream determined by keepZoomReset boolean.
	 */
	private zoomReset() {
		const smoothingFactor = this.config.framing.SMOOTHING_FACTOR;
		this.smoothedX = (this.config.canvas.width / 2) * smoothingFactor + (1 - smoothingFactor) * this.smoothedX;
		this.smoothedY = (this.config.canvas.height / 2) * smoothingFactor + (1 - smoothingFactor) * this.smoothedY;
		this.smoothedZoom = smoothingFactor + (1 - smoothingFactor) * this.smoothedZoom;
	}

	/**
	 * Every frame, check if face position has changed enough to warrant tracking.
	 * @param newFace - current frame's face bounding box
	 * @param refFace - most recent "still" frame's face bounding box (anchor)
	 * @return true = track new, false = track old
	 */
	private didPositionChange(newFace, refFace): boolean {
		//console.log("inside did pos change fx");
		const thresholdX = this.canvas.width * this.config.framing.percentThresholdX; // set to 7% of the width rn
		const thresholdY = this.canvas.height * this.config.framing.percentThresholdY; // 7% of the height
		const zoomRatio = newFace.width / refFace.width;

		// if zoom/position changed a lot.
		return (
			Math.abs(newFace.originX - refFace.originX) > thresholdX ||
			Math.abs(newFace.originY - refFace.originY) > thresholdY ||
			Math.abs(1 - zoomRatio) > this.config.framing.percentZoomThreshold
		) 
	}
}

/* TODOS:
1. make default config and only update to user's config if that value exists
2. fix uncaught promise error at the end of process frame
3. make tracking less jittery with smooth tracking from one place to the next without intermediate stops + abrupt changes
*/
