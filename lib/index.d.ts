export interface AutoFramingConfig {
    apiBaseUrl?: string;
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
export declare class AutoFramingLibrary {
    /*************************************************/
    /*************************************************/
    private CONFIG;
    private TARGET_FACE_RATIO;
    private SMOOTHING_FACTOR;
    private keepZoomReset;
    private faceDetector;
    private exportStream;
    private canvas;
    private ctx;
    constructor();
    private smoothedX;
    private smoothedY;
    private smoothedZoom;
    private firstDetection;
    private refFace;
    private track;
    private settings;
    private lastDetectionTime;
    private sourceFrame;
    private newFace;
    init(config_path: string): Promise<void>;
    /*******************************************************/
    /*******************************************************/
    private loadConfig;
    private initializefaceDetector;
    /*************************************************/
    /*************************************************/
    /**
     *  function to continuously track face. WANT THIS TO BE ONLY CALLED ONCE,
     */
    autoframe(inputStream: MediaStream): {
        framedStream: MediaStream;
        width: number;
        height: any;
    };
    predictionLoop(inputStream: MediaStream): Promise<void>;
    private videoFrame;
    /**
     * Processes each frame's autoframe crop box and draws it to canvas.
     * @param {detections[]} detections - array of detection objects (detected faces), from most high confidence to least.
     */
    private processFrame;
    /**
     * draws the current frame
     */
    private drawCurrentFrame;
    /******************************************************************** */
    /******************************************************************** */
    /**
     * Sets up smoothed bounding parameters to autoframe face
     * @param {detection.boundingBox} face - bounding box of tracked face
     */
    private faceFrame;
    /**
     * When face isn't detected, optional framing reset to default stream determined by keepZoomReset boolean.
     */
    private zoomReset;
    /**
     * Every frame, check if face position has changed enough to warrant tracking.
     * @param {detection.boundingBox} newFace - current frame's face bounding box
     * @param {detection.boundingBox} refFace - most recent "still" frame's face bounding box (anchor)
     * @return {boolean} true = track new, false = track old
     */
    private didPositionChange;
}
//# sourceMappingURL=index.d.ts.map