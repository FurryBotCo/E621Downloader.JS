import * as fs from "fs-extra";
import { EventEmitter } from "tsee";
import E621Downloader from "..";
export interface Cache {
	version: typeof CacheManager["VERSION"];
	data: {
		tags: string[];
		lastDownloaded: number;
		lastFolder: string;
		posts: {
			id: number;
			md5: string;
		}[];
	}[];
}

class OwOError extends Error {
	constructor(message?: string) {
		super(message);
		this.name = "OwOError";
	}
}

export default class CacheManager extends EventEmitter<{
	"error": (err: Error | string, extra?: any, threadId?: number) => void;
	"warn": (info: string, threadId?: number) => void;
	"debug": (info: string, threadId?: number) => void;
}> {
	static VERSION = 1 as const;
	file: string;
	constructor(file: string) {
		super();
		this.file = file;
	}

	get(): Cache {
		if (!this.file) throw new TypeError("Invalid cache file.");
		let o: Cache;
		try {
			o = fs.readJSONSync(this.file)
			if (typeof o.version !== "number") throw new OwOError("OwO *notices your invalid cache file*");
		} catch (e) {

			if (e.message.indexOf("ENOENT") !== -1) this.emit("warn", "Cache file does not exist, creating it..");
			else console.error("Error parsing cache file:", e);
			if (fs.existsSync(this.file)) fs.renameSync(this.file, `${this.file.replace(/\.json/, "")}-${Date.now()}.old.json`);
			let d: Cache["data"];
			// this assumes the file is using the old `{ key: string[] }` format
			if (e instanceof OwOError && o!) d = Object.keys(o as any).map(v => ({
				tags: v.split(" "),
				lastDownloaded: 0, // we could *maybe* figure this out but it's easier to just not
				lastFolder: E621Downloader.sanitizeFolderName(v.split(" ")[0]), // we make it the tags because we don't know what it was
				posts: [] // we throw away old posts because we don't have the md5
			}));
			o = {
				version: 1,
				data: d! ?? []
			};
			// if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, "");
			const fd = fs.openSync(this.file, "w+");
			fs.writeFileSync(fd, JSON.stringify(o));
			fs.fsyncSync(fd);
			fs.closeSync(fd);
		}

		return o;
	}

	update(tags: string[], posts: Cache["data"][number]["posts"], folder: string) {
		if (!tags || tags.length === 0 || tags.join(" ").length === 0) {
			const e = new Error(`[CacheManager] Zero tag cache update recieved.`)
			this.emit("error", e);
			throw e;
			return;
		}
		// remove extraneous properties
		posts = posts.map(p => ({
			id: p.id,
			md5: p.md5
		}));
		const c = this.get();
		const o = JSON.parse(JSON.stringify(c));
		const j = c.data.find(v => v.tags.join(" ") === tags.join(" "));
		// if (j) c.data.splice(c.data.indexOf(j), 1);
		const v = j || {
			tags,
			lastDownloaded: 0,
			lastFolder: folder,
			posts: []
		};
		// v.lastDownloaded = Date.now();
		v.lastFolder = folder;
		v.posts = this.unique(...[
			...v.posts,
			...posts
		]);
		let i: number;
		if (j) {
			i = c.data.indexOf(j);
			c.data[c.data.indexOf(j)] = v;
		}
		else i = (c.data.push(v)) - 1;
		// just in case
		c.data = this.unique(...c.data);
		// don't touch the file if we don't need to
		if (JSON.stringify(c) === JSON.stringify(o)) {
			this.emit("debug", "[CacheManager] Skipping file write due to no changes");
			return;
		}
		c.data[i].lastDownloaded = Date.now();
		const fd = fs.openSync(this.file, "w+");
		fs.writeFileSync(fd, JSON.stringify(c));
		fs.fsyncSync(fd);
		fs.closeSync(fd);
	}

	unique<T>(...v: T[]): T[] {
		// we have to stringify & parse because of objects and such
		return Array.from(new Set(v.map(j => JSON.stringify(j)))).map(v => JSON.parse(v));
	}
}
