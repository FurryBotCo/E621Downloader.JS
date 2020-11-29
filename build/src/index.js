"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.E621Downloader = void 0;
const fs = __importStar(require("fs-extra"));
const tsee_1 = require("tsee");
const worker_threads_1 = require("worker_threads");
const path_1 = __importDefault(require("path"));
const https = __importStar(require("https"));
const chunk_1 = __importDefault(require("chunk"));
const package_json_1 = __importDefault(require("../package.json"));
require("source-map-support/register");
const perf_hooks_1 = require("perf_hooks");
;
;
class E621Downloader extends tsee_1.EventEmitter {
    constructor(opts) {
        super();
        if (!opts)
            throw new TypeError("Missing options.");
        if (!opts.saveDirectory)
            throw new TypeError("Missing \"saveDirectory\" option.");
        this.options = {
            saveDirectory: path_1.default.resolve(opts.saveDirectory),
            auth: opts.auth || null,
            overwriteExisting: !!opts.overwriteExisting,
            skipVideo: !!opts.skipVideo,
            skipFlash: !!opts.skipFlash,
            tagBlacklist: opts.tagBlacklist || []
        };
        if (!fs.existsSync(this.options.saveDirectory))
            throw new TypeError(`saveDirectory "${this.options.saveDirectory}" does not exist on disk.`);
        this.threads = new Map();
        this.current = {
            active: false,
            resolve: null,
            reject: null,
            total: 0,
            processed: 0,
            postsPerWorker: new Map(),
            start: 0,
            end: 0
        };
    }
    get auth() { return this.options.auth === null ? null : (this.options.auth.basic || Buffer.from(`${this.options.auth.username}:${this.options.auth.apiKey}`).toString("base64")) || null; }
    /**
     * Start a download.
     * @param {string[]} tags - The tags to use.
     * @param {string} [folder] - The folder to save files to. (not a full path, put inside the Options.saveDirectory folder)
     * @param {(1 | 2 | 3)} [threads=1] - The number of simultaneous downloads to run. Hard limit of 3 maximum. This is the limit an e621 admin {@link https://e621.download/threads.png|asked us to use}. If you manually edit the code and get blocked, we do not take responsibility for that.
     */
    async startDownload(tags, folder, threads = 1) {
        if (this.current.active)
            throw new TypeError("A download is already active. If this is an issue, run the `reset` function.");
        if (threads > 3)
            throw new TypeError("You cannot use more than 3 threads. This is a limit that an e621 admin asked us to put in place. See https://e621.download/threads.png");
        folder = this.sanitizeFolderName(folder || tags[0]);
        const dir = path_1.default.resolve(`${this.options.saveDirectory}/${folder}`);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir);
        this.emit("download-start", tags, folder, dir, threads);
        this.reset();
        for (let i = 0; i < threads; i++) {
            const w = new worker_threads_1.Worker(`${__dirname}/worker.${__filename.split(".").slice(-1)[0]}`);
            this.threads.set(i, w);
            w
                .on("message", this.handleWorkerMessage.bind(this))
                .postMessage({
                event: "init",
                data: {
                    id: i,
                    total: threads,
                    tags,
                    folder,
                    options: this.options,
                    dir
                }
            });
            this.emit("thread-spawn", i, w.threadId);
        }
        this.current.start = perf_hooks_1.performance.now();
        const list = await this.fetchPosts(tags, this.auth, 1, null);
        if (list.length === 0)
            throw new TypeError(`No posts were found for the tag(s) "${tags.join(" ")}".`);
        this.current.total = list.length;
        const posts = chunk_1.default(list, Math.ceil(list.length / threads));
        for (const [i, w] of this.threads) {
            this.current.postsPerWorker.set(i, posts[i].length);
            w.postMessage({
                event: "start",
                data: posts[i],
                range: this.count(posts, i)
            });
        }
        await new Promise((resolve, reject) => Object.assign(this.current, { resolve, reject }));
        return list.length;
    }
    count(arr, num) {
        let a = 0, b = 0;
        for (let i = 0; i < num; i++)
            a += arr[i].length;
        for (let i = 0; i <= num; i++)
            b += arr[i].length;
        return [a + 1, b];
    }
    reset() {
        for (const [i, w] of this.threads) {
            w.terminate();
            this.threads.delete(i);
        }
        this.current = {
            active: false,
            resolve: null,
            reject: null,
            total: 0,
            processed: 0,
            postsPerWorker: new Map(),
            start: 0,
            end: 0
        };
    }
    handleWorkerMessage(value) {
        if (value.event === "thread-done")
            this.endHandler(value.fromId);
        this.emit(value.event, value.fromId, ...value.data);
    }
    endHandler(id) {
        const p = this.current.postsPerWorker.get(id);
        if (p === undefined) {
            this.emit("error", `Worker done without post amount in Main (Worker #${id})`);
            return;
        }
        else {
            this.current.processed += p;
            if (this.current.processed === this.current.total) {
                this.current.end = perf_hooks_1.performance.now();
                this.emit("download-done", this.current.total, parseFloat((this.current.end - this.current.start).toFixed(3)));
                this.current.resolve();
                this.reset();
            }
        }
    }
    sanitizeFolderName(name) {
        return name.replace(/[^a-z0-9_\-]/gi, "_").replace(/_{2,}/g, "_").toLowerCase().trim();
    }
    async fetchPosts(tags, auth, page, lastId) {
        const posts = [];
        return new Promise((a, b) => {
            const start = perf_hooks_1.performance.now();
            https.request({
                method: "GET",
                hostname: "e621.net",
                path: `/posts.json?tags=${encodeURIComponent(tags.join(" "))}${lastId ? `&page=b${lastId}` : ""}&limit=320`,
                headers: {
                    "User-Agent": `E621Downloader.JS/${package_json_1.default.version} (https://github.com/FurryBotCo/E621Downloader.JS)`,
                    ...(auth ? ({
                        Authorization: `Basic ${auth}`
                    }) : ({}))
                }
            }, (res) => {
                const data = [];
                res
                    .on("data", (d) => data.push(d))
                    .on("error", (err) => b(err))
                    .on("end", async () => {
                    const d = JSON.parse(Buffer.concat(data).toString());
                    if (d.success === false) {
                        if (d.message === "SessionLoader::AuthenticationFailure")
                            return this.emit("error", "Authentication failed.");
                        else
                            return this.emit("error", d.message, d);
                    }
                    posts.push(...d.posts.map(p => ({
                        id: p.id,
                        url: p.file.url,
                        ext: p.file.ext,
                        md5: p.file.md5,
                        tags: Object.keys(p.tags).map(v => p.tags[v]).reduce((a, b) => a.concat(b))
                    })));
                    this.emit("fetch-page", page, d.posts.length, parseFloat((perf_hooks_1.performance.now() - start).toFixed(3)));
                    if (d.posts.length === 320) {
                        await new Promise((c, d) => setTimeout(c, 1e3)); // wait for 1 second (more than needed)
                        await this.fetchPosts(tags, auth, page + 1, d.posts[d.posts.length - 1].id).then(v => posts.push(...v));
                    }
                    if (page === 1)
                        this.emit("fetch-finish", posts.length, parseFloat((perf_hooks_1.performance.now() - start).toFixed(3)));
                    return a(posts);
                });
            })
                .end();
        });
    }
}
exports.E621Downloader = E621Downloader;
module.exports = E621Downloader;
exports.default = E621Downloader;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDZDQUErQjtBQUMvQiwrQkFBb0M7QUFDcEMsbURBQXdDO0FBQ3hDLGdEQUF3QjtBQUN4Qiw2Q0FBK0I7QUFDL0Isa0RBQTBCO0FBQzFCLG1FQUFrQztBQUNsQyx1Q0FBcUM7QUFFckMsMkNBQXlDO0FBSXhDLENBQUM7QUFPRCxDQUFDO0FBRUYsTUFBTSxjQUFlLFNBQVEsbUJBVzNCO0lBNERELFlBQVksSUFBYTtRQUN4QixLQUFLLEVBQUUsQ0FBQztRQUNSLElBQUksQ0FBQyxJQUFJO1lBQUUsTUFBTSxJQUFJLFNBQVMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYTtZQUFFLE1BQU0sSUFBSSxTQUFTLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNsRixJQUFJLENBQUMsT0FBTyxHQUFHO1lBQ2QsYUFBYSxFQUFFLGNBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUMvQyxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJO1lBQ3ZCLGlCQUFpQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCO1lBQzNDLFNBQVMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVM7WUFDM0IsU0FBUyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUztZQUMzQixZQUFZLEVBQUUsSUFBSSxDQUFDLFlBQVksSUFBSSxFQUFFO1NBQ3JDLENBQUE7UUFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQztZQUFFLE1BQU0sSUFBSSxTQUFTLENBQUMsa0JBQWtCLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSwyQkFBMkIsQ0FBQyxDQUFDO1FBQzdJLElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUN6QixJQUFJLENBQUMsT0FBTyxHQUFHO1lBQ2QsTUFBTSxFQUFFLEtBQUs7WUFDYixPQUFPLEVBQUUsSUFBSTtZQUNiLE1BQU0sRUFBRSxJQUFJO1lBQ1osS0FBSyxFQUFFLENBQUM7WUFDUixTQUFTLEVBQUUsQ0FBQztZQUNaLGNBQWMsRUFBRSxJQUFJLEdBQUcsRUFBRTtZQUN6QixLQUFLLEVBQUUsQ0FBQztZQUNSLEdBQUcsRUFBRSxDQUFDO1NBQ04sQ0FBQztJQUNILENBQUM7SUFFRCxJQUFZLElBQUksS0FBSyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBWSxDQUFDLEtBQWUsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFZLENBQUMsUUFBUSxJQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFBLENBQUMsQ0FBQztJQUV2Tzs7Ozs7T0FLRztJQUNILEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBYyxFQUFFLE1BQWUsRUFBRSxVQUF1QixDQUFDO1FBQzVFLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNO1lBQUUsTUFBTSxJQUFJLFNBQVMsQ0FBQyw4RUFBOEUsQ0FBQyxDQUFDO1FBQzdILElBQUksT0FBTyxHQUFHLENBQUM7WUFBRSxNQUFNLElBQUksU0FBUyxDQUFDLHdJQUF3SSxDQUFDLENBQUE7UUFDOUssTUFBTSxHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEQsTUFBTSxHQUFHLEdBQUcsY0FBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsYUFBYSxJQUFJLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDcEUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDO1lBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRXhELElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNiLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDakMsTUFBTSxDQUFDLEdBQUcsSUFBSSx1QkFBTSxDQUFDLEdBQUcsU0FBUyxXQUFXLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ2xGLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUN2QixDQUFDO2lCQUNDLEVBQUUsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDbEQsV0FBVyxDQUFDO2dCQUNaLEtBQUssRUFBRSxNQUFNO2dCQUNiLElBQUksRUFBRTtvQkFDTCxFQUFFLEVBQUUsQ0FBQztvQkFDTCxLQUFLLEVBQUUsT0FBTztvQkFDZCxJQUFJO29CQUNKLE1BQU07b0JBQ04sT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO29CQUNyQixHQUFHO2lCQUNIO2FBQ0QsQ0FBQyxDQUFDO1lBRUosSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQztTQUN6QztRQUVELElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLHdCQUFXLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdkMsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RCxJQUFJLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQztZQUFFLE1BQU0sSUFBSSxTQUFTLENBQUMsdUNBQXVDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDakMsTUFBTSxLQUFLLEdBQUcsZUFBSyxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUM1RCxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNsQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNwRCxDQUFDLENBQUMsV0FBVyxDQUFDO2dCQUNiLEtBQUssRUFBRSxPQUFPO2dCQUNkLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNkLEtBQUssRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7YUFDM0IsQ0FBQyxDQUFDO1NBQ0g7UUFFRCxNQUFNLElBQUksT0FBTyxDQUFPLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUUvRixPQUFPLElBQUksQ0FBQyxNQUFNLENBQUM7SUFDcEIsQ0FBQztJQUVELEtBQUssQ0FBQyxHQUFVLEVBQUUsR0FBVztRQUM1QixJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRTtZQUFFLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDO1FBQ2pELEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxHQUFHLEVBQUUsQ0FBQyxFQUFFO1lBQUUsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7UUFDbEQsT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkIsQ0FBQztJQUVELEtBQUs7UUFDSixLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNsQyxDQUFDLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDZCxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUN2QjtRQUVELElBQUksQ0FBQyxPQUFPLEdBQUc7WUFDZCxNQUFNLEVBQUUsS0FBSztZQUNiLE9BQU8sRUFBRSxJQUFJO1lBQ2IsTUFBTSxFQUFFLElBQUk7WUFDWixLQUFLLEVBQUUsQ0FBQztZQUNSLFNBQVMsRUFBRSxDQUFDO1lBQ1osY0FBYyxFQUFFLElBQUksR0FBRyxFQUFFO1lBQ3pCLEtBQUssRUFBRSxDQUFDO1lBQ1IsR0FBRyxFQUFFLENBQUM7U0FDTixDQUFDO0lBQ0gsQ0FBQztJQUVPLG1CQUFtQixDQUFDLEtBSTNCO1FBQ0EsSUFBSSxLQUFLLENBQUMsS0FBSyxLQUFLLGFBQWE7WUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFZLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM1RCxDQUFDO0lBRU8sVUFBVSxDQUFDLEVBQVU7UUFDNUIsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzlDLElBQUksQ0FBQyxLQUFLLFNBQVMsRUFBRTtZQUNwQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxvREFBb0QsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM5RSxPQUFPO1NBQ1A7YUFBTTtZQUNOLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQztZQUM1QixJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxLQUFLLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFO2dCQUNsRCxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBRyx3QkFBVyxDQUFDLEdBQUcsRUFBRSxDQUFDO2dCQUNyQyxJQUFJLENBQUMsSUFBSSxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQy9HLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBUSxFQUFFLENBQUM7Z0JBQ3hCLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQzthQUNiO1NBQ0Q7SUFDRixDQUFDO0lBRU8sa0JBQWtCLENBQUMsSUFBWTtRQUN0QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUN4RixDQUFDO0lBRU8sS0FBSyxDQUFDLFVBQVUsQ0FBQyxJQUFjLEVBQUUsSUFBbUIsRUFBRSxJQUFZLEVBQUUsTUFBc0I7UUFDakcsTUFBTSxLQUFLLEdBQVcsRUFBRSxDQUFDO1FBQ3pCLE9BQU8sSUFBSSxPQUFPLENBQVMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUU7WUFDbkMsTUFBTSxLQUFLLEdBQUcsd0JBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNoQyxLQUFLLENBQUMsT0FBTyxDQUFDO2dCQUNiLE1BQU0sRUFBRSxLQUFLO2dCQUNiLFFBQVEsRUFBRSxVQUFVO2dCQUNwQixJQUFJLEVBQUUsb0JBQW9CLGtCQUFrQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLFVBQVUsTUFBTSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsWUFBWTtnQkFDM0csT0FBTyxFQUFFO29CQUNSLFlBQVksRUFBRSxxQkFBcUIsc0JBQUcsQ0FBQyxPQUFPLG9EQUFvRDtvQkFDbEcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDWCxhQUFhLEVBQUUsU0FBUyxJQUFJLEVBQUU7cUJBQzlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztpQkFDVjthQUNELEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRTtnQkFDVixNQUFNLElBQUksR0FBVSxFQUFFLENBQUM7Z0JBRXZCLEdBQUc7cUJBQ0QsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztxQkFDL0IsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO3FCQUM1QixFQUFFLENBQUMsS0FBSyxFQUFFLEtBQUssSUFBSSxFQUFFO29CQUNyQixNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztvQkFDckQsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLEtBQUssRUFBRTt3QkFDeEIsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLHNDQUFzQzs0QkFBRSxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLHdCQUF3QixDQUFDLENBQUM7OzRCQUN6RyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7cUJBQzdDO29CQUVELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7d0JBQy9CLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRTt3QkFDUixHQUFHLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHO3dCQUNmLEdBQUcsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUc7d0JBQ2YsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRzt3QkFDZixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7cUJBQzNFLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ0wsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLHdCQUFXLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbEcsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxHQUFHLEVBQUU7d0JBQzNCLE1BQU0sSUFBSSxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyx1Q0FBdUM7d0JBQ3hGLE1BQU0sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztxQkFDeEc7b0JBRUQsSUFBSSxJQUFJLEtBQUssQ0FBQzt3QkFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLFVBQVUsQ0FBQyxDQUFDLHdCQUFXLENBQUMsR0FBRyxFQUFFLEdBQUcsS0FBSyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFFNUcsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2pCLENBQUMsQ0FBQyxDQUFDO1lBQ0wsQ0FBQyxDQUFDO2lCQUNBLEdBQUcsRUFBRSxDQUFDO1FBQ1QsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0NBQ0Q7QUFFUSx3Q0FBYztBQUN2QixNQUFNLENBQUMsT0FBTyxHQUFHLGNBQWMsQ0FBQztBQUNoQyxrQkFBZSxjQUFjLENBQUMifQ==