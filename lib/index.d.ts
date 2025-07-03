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
    };
    canvas: {
        width: number;
        height: number;
        frameRate: number;
    };
    predictionInterval: number;
}
/**
 *  function to continuously track face. WANT THIS TO BE ONLY CALLED ONCE,
 */
export declare function autoframe(inputStream: MediaStream): {
    stream: MediaStream;
    width: number;
    height: any;
};
export declare function init(config_path: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map