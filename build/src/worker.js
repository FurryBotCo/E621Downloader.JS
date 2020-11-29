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
const worker_threads_1 = require("worker_threads");
const fs = __importStar(require("fs-extra"));
const https = __importStar(require("https"));
const url_1 = __importDefault(require("url"));
const pkg = __importStar(require("../package.json"));
const perf_hooks_1 = require("perf_hooks");
require("source-map-support/register");
class DownloaderThread {
    static init(iOpt) {
        this.id = iOpt.id;
        this.total = iOpt.total;
        this.tags = iOpt.tags;
        this.folder = iOpt.folder;
        this.options = iOpt.options;
        this.dir = iOpt.dir;
        this.posts = []; // we get these in start
        this.sendToParent("ready");
    }
    static async start(posts, range) {
        this.posts = posts;
        this.sendToParent("start-recieved", posts.length);
        const start = perf_hooks_1.performance.now();
        for (const [i, p] of posts.entries())
            await this.download(p, [range[0] + i, range[1]]);
        const end = perf_hooks_1.performance.now();
        this.sendToParent("thread-done", posts.length, parseFloat((end - start).toFixed(3)));
    }
    static async download(info, range) {
        const { id, url, md5, ext } = info;
        // so we can make the url if absent
        let v = url;
        if (v === null)
            v = this.constructURLFromMd5(md5);
        return new Promise((a, b) => {
            const start = perf_hooks_1.performance.now();
            https
                .request({
                ...url_1.default.parse(v),
                headers: {
                    "User-Agent": `E621Downloader.JS/${pkg.version} (https://github.com/FurryBotCo/E621Downloader.JS)`
                }
            }, (res) => {
                const data = [];
                res
                    .on("error", b)
                    .on("data", (d) => data.push(d))
                    .on("end", () => {
                    const end = perf_hooks_1.performance.now();
                    fs.writeFileSync(`${this.dir}/${id}.${ext}`, Buffer.concat(data));
                    this.sendToParent("post-finish", id, parseFloat((end - start).toFixed(3)), range[0], range[1]);
                    return a();
                });
            })
                .end();
        });
    }
    static constructURLFromMd5(md5) {
        return `https://static1.e621.net/data/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.png`;
    }
    static sendToParent(event, ...data) {
        worker_threads_1.parentPort.postMessage({
            event,
            data,
            fromId: this.id
        });
    }
}
// figure out if we're actually in a worker
if (!worker_threads_1.isMainThread) {
    worker_threads_1.parentPort.on("message", (value) => {
        switch (value.event) {
            case "init": return DownloaderThread.init(value.data);
            case "start": return DownloaderThread.start(value.data, value.range);
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3dvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxtREFBMEQ7QUFFMUQsNkNBQStCO0FBQy9CLDZDQUErQjtBQUMvQiw4Q0FBc0I7QUFDdEIscURBQXVDO0FBQ3ZDLDJDQUF5QztBQUV6Qyx1Q0FBcUM7QUFZckMsTUFBTSxnQkFBZ0I7SUFRckIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFtQjtRQUM5QixJQUFJLENBQUMsRUFBRSxHQUFHLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQztRQUN0QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDMUIsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDO1FBQzVCLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUNwQixJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUUsQ0FBQyxDQUFDLHdCQUF3QjtRQUN6QyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVCLENBQUM7SUFFRCxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFhLEVBQUUsS0FBbUM7UUFDcEUsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFlBQVksQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEQsTUFBTSxLQUFLLEdBQUcsd0JBQVcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNoQyxLQUFLLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLE9B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