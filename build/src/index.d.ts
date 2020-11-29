/// <reference types="node" />
import { EventEmitter } from "tsee";
import { Worker } from "worker_threads";
import "source-map-support/register";
export interface Options extends Partial<Omit<E621Downloader["options"], "saveDirectory">> {
    saveDirectory: E621Downloader["options"]["saveDirectory"];
}
export interface Post {
    id: number;
    url: string | null;
    ext: string;
    md5: string;
    tags: string[];
}
declare class E621Downloader extends EventEmitter<{
    "error": (err: Error | string, extra?: any) => void;
    "ready": (threadId: number) => void;
    "start-recieved": (threadId: number, amount: number) => void;
    "thread-done": (threadId: number, amount: number, time: number) => void;
    "post-finish": (threadId: number, id: number, time: number, current: number, total: number) => void;
    "download-done": (total: number, time: number) => void;
    "fetch-page": (page: number, count: number, time: number) => void;
    "fetch-finish": (total: number, time: number) => void;
    "download-start": (tags: string[], folder: string, dir: string, threads: 1 | 2 | 3) => void;
    "thread-spawn": (internalId: number, nodeId: number) => void;
}> {
    options: {
        /**
         * The directory to download images to (they will be in subdirectories)
         *
         * The directory MUST already exist.
         */
        saveDirectory: string;
        /**
         * Authentication for e621's api
         *
         * May be required if you are downloading images on e621's {@link https://e621.net/help/global_blacklist|Global Blacklist}
         */
        auth: {
            /**
             * Your e621 username
             */
            username: string;
            /**
             * Your e621 api key
             *
             * Go to {@link https://e621.net/users/home|Account} -> Manage API Access for this
             */
            apiKey: string;
        } | {
            /**
             * Premade basic authentication string
             *
             * Use username & apiKey if you don't know what this is
             */
            basic: string;
        } | null;
        /**
         * If we should overwrite existing files
         */
        overwriteExisting: boolean;
        /**
         * If we should skip video files
         */
        skipVideo: boolean;
        /**
         * If we should skip flash files
         */
        skipFlash: boolean;
        /**
         * Tags to skip while downloading posts
         */
        tagBlacklist: string[];
    };
    threads: Map<number, Worker>;
    private current;
    constructor(opts: Options);
    private get auth();
    /**
     * Start a download.
     * @param {string[]} tags - The tags to use.
     * @param {string} [folder] - The folder to save files to. (not a full path, put inside the Options.saveDirectory folder)
     * @param {(1 | 2 | 3)} [threads=1] - The number of simultaneous downloads to run. Hard limit of 3 maximum. This is the limit an e621 admin {@link https://e621.download/threads.png|asked us to use}. If you manually edit the code and get blocked, we do not take responsibility for that.
     */
    startDownload(tags: string[], folder?: string, threads?: (1 | 2 | 3)): Promise<number>;
    count(arr: any[], num: number): [start: number, end: number];
    reset(): void;
    private handleWorkerMessage;
    private endHandler;
    private sanitizeFolderName;
    private fetchPosts;
}
export { E621Downloader };
export default E621Downloader;
