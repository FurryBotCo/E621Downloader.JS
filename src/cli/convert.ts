#!/usr/bin/env node

import * as fs from "fs-extra";
import CacheConverter from "../util/CacheConverter";

export default function convert(o: { [k: string]: any; }) {
	if (!o.dir) throw new Error("dir is required.");
	if (!fs.existsSync(o.dir)) throw new Error("Provided directory does not exist.");
	let v: number = Number(o.version);
	if (isNaN(v)) CacheConverter.fromUnknown(o.dir);
	else CacheConverter.useVersion(o.dir, v);
}
