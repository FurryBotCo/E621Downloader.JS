import { Options } from ".";
import "source-map-support/register";
export declare type ThreadOptions = {
    id: number;
    total: number;
    tags: string[];
    folder: string;
    options: Options;
    dir: string;
};
