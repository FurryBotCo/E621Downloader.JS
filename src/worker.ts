import { parentPort, isMainThread } from "worker_threads";
import { Options, Post } from ".";
import * as fs from "fs-extra";
import * as https from "https";
import URL from "url";
import * as pkg from "../package.json";
import { performance } from "perf_hooks";
import "source-map-support/register";

export type ThreadOptions = {
	id: number;
	total: number;
	tags: string[];
	folder: string;
	options: Options;
	dir: string;
};

class DownloaderThread {
	static id: number;
	static total: number;
	static tags: string[];
	static folder: string;
	static options: Options;
	static dir: string;
	static posts: Post[];
	static init(iOpt: ThreadOptions) {
		this.id = iOpt.id;
		this.total = iOpt.total;
		this.tags = iOpt.tags;
		this.folder = iOpt.folder;
		this.options = iOpt.options;
		this.dir = iOpt.dir;
		this.posts = []; // we get these in start
		this.sendToParent("ready");
	}

	static async start(posts: Post[], range: [start: number, end: number]) {
		this.posts = posts;
		this.sendToParent("start-recieved", posts.length);
		const start = performance.now();
		for (const [i, p] of posts.entries()) await this.download(p, [range[0] + i, range[1]]);
		const end = performance.now();
		this.sendToParent("thread-done", posts.length, parseFloat((end - start).toFixed(3)));
	}

	static async download(info: Post, range: [start: number, end: number]) {
		const { id, url, md5, ext } = info;
		// so we can make the url if absent
		let v = url;
		if (v === null) v = this.constructURLFromMd5(md5);
		return new Promise<void>((a, b) => {
			const start = performance.now();
			https
				.request({
					...URL.parse(v!),
					headers: {
						"User-Agent": `E621Downloader.JS/${pkg.version} (https://github.com/FurryBotCo/E621Downloader.JS)`
					}
				}, (res) => {
					const data: Buffer[] = [];
					res
						.on("error", b)
						.on("data", (d) => data.push(d))
						.on("end", () => {
							const end = performance.now();
							fs.writeFileSync(`${this.dir}/${id}.${ext}`, Buffer.concat(data));
							this.sendToParent("post-finish", id, parseFloat((end - start).toFixed(3)), range[0], range[1]);
							return a();
						})
				})
				.end();
		});
	}

	static constructURLFromMd5(md5: string) {
		return `https://static1.e621.net/data/${md5.slice(0, 2)}/${md5.slice(2, 4)}/${md5}.png`;
	}

	static sendToParent(event: string, ...data: any[]) {
		parentPort!.postMessage({
			event,
			data,
			fromId: this.id
		});
	}
}

// figure out if we're actually in a worker
if (!isMainThread) {
	parentPort!.on("message", (value) => {
		switch (value.event) {
			case "init": return DownloaderThread.init(value.data);
			case "start": return DownloaderThread.start(value.data, value.range);
		}
	});
}
