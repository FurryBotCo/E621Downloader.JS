import * as fs from "fs-extra";
import { Cache } from "../src/util/CacheManager";

const v: Cache = fs.readJSONSync("/home/donovan/Documents/E621Downloader/cache.json");

v.data = v.data.map(v => ({
	...v,
	tags: v.tags.map(t => t.toLowerCase())
})).sort((a, b) => a.tags[0] < b.tags[0] ? -1 : a.tags[0] > b.tags[0] ? 1 : 0);

fs.writeJSONSync("/home/donovan/Documents/E621Downloader/cache.json", v);
