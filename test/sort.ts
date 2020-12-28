import * as fs from "fs-extra";
import { Cache } from "../src/util/CacheManager";

const v: Cache = fs.readJSONSync("/home/donovan/Documents/E621Downloader/cache.json");

v.data = v.data.sort((a, b) => (a.tags[0] as any) - (b.tags[0] as any));

fs.writeJSONSync("/home/donovan/Documents/E621Downloader/cache.json", v);
