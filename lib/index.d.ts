export interface AutoFramingConfig {
    apiBaseUrl?: string;
}
/**
 * Enable live webcam view and start detection.
 * @param {event} event - event = click.
 */
export declare function enableCam(event: Event, videoElement: HTMLVideoElement): Promise<void>;
export declare function init(config_path: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map