import { BloomFilter, BloomFilterParameters } from './bloom-filter';

interface PathMapConfig {
  version: string;
  bloom?:
    | {
        p: number;
        n?: number;
        m?: number;
        k?: number;
        s?: number;
      }
    | true;
  trie?: string | boolean;
}
/*
// Sample Input
{

    // global config data that will be passed through to the final doc untouched
    config: {
        version: "redirects-v1", // This field is mandatory and must be a string

        // Optional config field to trigger generation of a bloom filter
        // If `bloom` is used, it must fit this version
        bloom: {
            p: 1e-7 // required false positive probability (1-in-10M false positive rate)
            // `n` is optional and defaults to the number of items in the map
            // `m` is optional and defaults to the optimal value
            // `k` is optional and defaults to the optimal value
            // `s` is optional and defaults to 0 (the seed for the first xxhash64)
        },

        // Optional config field to trigger generation of prefix trie
        trie: "/", // if a string, prefixes are split by this string as a delimeter
        trie: true, // If true, then prefixes are split optimally based on the codepoints present

        // Everything else is arbitrary and defined by the version
        status: 308,
        normalize: true
    },

    // We want to enable a bloom filter so we can skip fully default entries

    // The main data as a flat map from key to payload
    data: { 
        "/foo": "/foo.html", // redirect to add .html extension, uses default
        "/foo/bar": ["/foo/bar.html", 307], // redirect to add html, but use 307
        "/foo/baz/": null, // this uses defaults and does a 308 redirect to strip the slash
        "/apple/pie": null, // this also uses defaults, but does a 308 to add the slash
                            // since the source string does not have one
    }
}
*/
class PathMap {
  constructor(config: PathMapConfig & {}, data: Record<string, unknown>) {
    // Initialize the path map with the provided config and data
    if (config.bloom) {
    }
  }
}
