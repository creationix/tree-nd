# PathMap: Optimized Storage for Large Path-Value Datasets

PathMap is a file format designed for applications that need to store and query millions of small key-value mappings efficiently while maintaining human debuggability. 

**Use PathMap when you have:**
- 100K+ URL paths, API routes, or similar string keys
- Small, often similar payloads (configs, redirects, metadata)
- Need for both fast machine queries AND human inspection
- Memory/storage constraints

**Common use cases:**
- CDN redirect configurations (millions of URL mappings)
- API routing tables
- Feature flags by URL pattern  
- Static site generators with large datasets
- Microservice configuration maps

## Semantics

This is able to encode a dataset that is a large number of keys (usually URL paths) mapping to many small payloads of arbitrary JSON data.

As an optimization it includes the ability to have default values for all payloads stored once at the top of the file.  Also at the top is a dictionary of shared values that can be referenced from payloads.

In order to save space a bloom filter can be used instead of listing all the paths.  Then paths that are 100% default don't need to be listed in the prefix trie at all, but ensure you can tolerate the false positive rate if you use this option.

For example, consider this tiny sample dataset that we wish to encode:

```js
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
```

Notice that the payloads are not uniform in shape and also don't match the defaults.  This is fine, the library consumer is given both the raw payload and the raw defaults object as a result and it can interpret the meaning however it sees fit.  This enables some nice optimizations here.  For example, most redirects will use the default redirect status code and so the only unique information is the new `Location` value for the redirect.  So a simple string represents this just fine in the context of a redirects file (this sample file).  Then in the case of a custom status, we use a simple array instead of an object with two keys.  For paths that are fully default the value can be null.  In this particular configuration `version: "redirects-v1"`, fully default paths add or remove trailing slashes with a 308 redirect.

## Encoding

The encoded file is newline delimted JSON.  This means it is a text file and can usually be transmitted via copy-paste.  But it's a read-only textfile.  Do not edit or reformat the file or you will break the byte-offset based pointers.  Always encode as normalized UTF-8 when possible to reduce the chance of some system changing the length of the encoding.

### Config Line

The first line in the file is the config line.  It's the `config` value the user provided as plain JSON, except the `bloom` becomes a `true` if set.

```json
{"version":"redirects-v1","bloom":{"n":4,"p":1e-7,"m":138,"k":23,"s":0},"trie":true,"status":308,"normalize":true}
```

### Bloom Filter Config and Body

If a bloom filter is used, the bloom filter config will be inline the first line and the second line will be the bloom filter itself.  It will be base64 encoded and wrapped in double quotes so that it is a valid JSON value.  Readers won't actually JSON parse or base64 decode it, they can simply read the bytes directly when doing filter lookups.

```json
"/qqpVeKKgABfaKAFV6qqii/A"
```

### Optimal Prefix Trie

Finally the prefix trie will be written using depth-first traversal with leaves interleaved with nodes.  

Each node is an array of alternating path segments and pointers.  Negative pointers are byte offsets to the next internal trie node.  Zero is the payload `null`.  Positive pointers are byte offsets to the leaf node.  When a line starts with a pointer, that means that prefix is both a leaf and an internal node.

The example document from before would be encoded like this (excluding the comments)

```jsonc
["/foo/bar.html",307]     // LEAF: /foo/bar
"/foo.html"               // LEAF: /foo
[12,"/bar",34]            // NODE: /foo (both a leaf and node)
["/foo",-15]              // ROOT NODE: largest common prefix was "/foo"
```

And we're done!  Since the bloom filter option was used, we don't encode the entries with `null` for a payload.  This is read by scanning backwards from the end of the file to find the start of the last line. Then from there everything is relative byte offsets jumping backwards.

But if there was no bloom filter, it would encode all entries like this:

```jsonc
["/foo/bar.html",307]     // LEAF: /foo/bar
["r",22,"z/",0]           // NODE: /foo/ba (null is encoded as offset 0)
"/foo.html"               // LEAF: /foo
[12,"/ba",-28]            // NODE: /foo (both a leaf and node)
["foo",-15,"apple/pie",0] // NODE: /
["/",-26]                 // ROOT NODE: largest common prefix was "/"
```

### Final Sample Document

Combining these 3 sections we get the following document:

```jsonc
// Config
{"version":"redirects-v1","bloom":{"n":4,"p":1e-7,"m":138,"k":23,"s":0},"trie":true,"status":308,"normalize":true}
// Bloom Filter
"/qqpVeKKgABfaKAFV6qqii/A"
// Prefix Trie
["/foo/bar.html",307]
"/foo.html"
[12,"/bar",34]
["/foo",-15]
```

If we opted out of the bloom filter (because it's silly for such a tiny document), it would look like:

```jsonc
// Config
{"version":"redirects-v1","trie":true,"status":308,"normalize":true}
// Prefix Trie
["/foo/bar.html",307]
["r",22,"z/",0]
"/foo.html"
[12,"/ba",-28]
["foo",-15,"apple/pie",0]
["/",-26]
```

### Segmented Prefix Trie

Sometimes you may want a simpler prefix trie that's segmented on some delimeter.

Let's go back and change our config to not use a bloom filter and to split the tree on `/`.

```js
{ version: "redirects-v1",
  trie: "/",
  status: 308,
  normalize: true }
```

The resulting prefix trie:

```jsonc
["/foo/bar.html",307]       // LEAF: /foo/bar
"/foo.html"                 // LEAF: /foo
[12,"bar",34,"baz",0]       // NODE: /foo
["foo",-22,"apple","pie",0] // NODE: /
```

Note that the `"apple"` and `"pie"` segments were merged to simplify the trie.
## Algorithms

For anyone interested in the details, this should help understanding or reimpleenting this format.

### Bloom Filter Algorithm

The default optimal bit size is the typical formula, but then rounded up to the nearest multiple of 24 to use all those base64 bits without padding.

$$m = \left\lceil \frac{-n \ln(p)}{\ln(2)^2 \cdot 24} \right\rceil \cdot 24$$

```c
int m = (int)ceil((-n * log(p)) / (M_LN2 * M_LN2 * 24)) * 24;
```

The default optimal hash count is the normal formula:

$$k = \lfloor -\log_2(p) + 0.5 \rfloor$$

```c
int k = (int)round(-log2(p));
```

Double hashing is used to speed up the `k` lookups.


```c
uint64_t hash1 = xxhash64(key, s);
uint64_t hash2 = xxhash64(key, s + 1);
for (int i = 0; i < k; i++) {
    int bit = (hash1 + i * hash2) % m;
    // ...
}
```

Little-endian bit-order is used to match base64 encoding so that either 8-bit or 6-bit per byte representations can be used.

```c
// 8-bit per byte addressing
int byteOffset = bit >> 3;
int bitOffset = 7 - (bit & 7); // little-endian

// 6-bit per byte addressing
int byteOffset = bit / 6;
int bitOffset = 5 - (bit % 6); // little-endian
```

