# Benchmark results

SSIM is computed on luminance between the source and the SVG rasterized at source size on white (higher is better). Winner per row (bold) is the highest SSIM; ties and errored tools excluded. `vtracer` is skipped (no usable npm/WASM build). potrace uses `trace` for lineart and `posterize` otherwise.

## logos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | - | - | - | - | - | 0/4 |
| imagetracer | 0.9704 | 50.0 | 322 | 7843 | 120.8 | 4/4 |
| potrace | **0.9907** | 4.0 | 109 | 4533 | 4746.4 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| logo-circles | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| logo-circles | imagetracer | 0.9766 | 64 | 392 | 9868 | 133.2 |
| logo-circles | potrace | **0.9879** | 4 | 117 | 5387 | 3624.9 |
| logo-shield | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| logo-shield | imagetracer | 0.9701 | 51 | 325 | 8073 | 92.5 |
| logo-shield | potrace | **0.9885** | 4 | 87 | 4056 | 3543.6 |
| logo-swoosh | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| logo-swoosh | imagetracer | 0.9867 | 66 | 390 | 9917 | 242.5 |
| logo-swoosh | potrace | **0.9918** | 4 | 80 | 3988 | 7010.4 |
| logo-text | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| logo-text | imagetracer | 0.9484 | 19 | 179 | 3512 | 14.8 |
| logo-text | potrace | **0.9947** | 4 | 151 | 4701 | 4806.9 |

## icons

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | - | - | - | - | - | 0/4 |
| imagetracer | 0.9613 | 30.3 | 210 | 4818 | 48.1 | 4/4 |
| potrace | **0.9873** | 4.0 | 110 | 4584 | 3580.1 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| icon-cloud | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| icon-cloud | imagetracer | 0.9784 | 39 | 268 | 6403 | 65.2 |
| icon-cloud | potrace | **0.9904** | 4 | 115 | 5190 | 4849.9 |
| icon-gear | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| icon-gear | imagetracer | 0.9519 | 47 | 330 | 7307 | 65.6 |
| icon-gear | potrace | **0.9861** | 4 | 201 | 8003 | 3248.6 |
| icon-heart | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| icon-heart | imagetracer | 0.9676 | 32 | 182 | 4641 | 56.6 |
| icon-heart | potrace | **0.9876** | 4 | 68 | 3185 | 2899.2 |
| icon-home | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| icon-home | imagetracer | 0.9474 | 3 | 61 | 921 | 4.9 |
| icon-home | potrace | **0.9850** | 4 | 57 | 1959 | 3322.7 |

## lineart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | - | - | - | - | - | 0/3 |
| imagetracer | 0.9503 | 10.7 | 440 | 6307 | 106.8 | 3/3 |
| potrace | **0.9853** | 1.0 | 111 | 5196 | 118.9 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| line-flower | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| line-flower | imagetracer | 0.9364 | 27 | 687 | 10441 | 151.2 |
| line-flower | potrace | **0.9811** | 1 | 203 | 8926 | 157.4 |
| line-scribble | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| line-scribble | imagetracer | 0.9620 | 3 | 356 | 4488 | 22.7 |
| line-scribble | potrace | **0.9896** | 1 | 81 | 4040 | 191.6 |
| line-spiral | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| line-spiral | imagetracer | 0.9526 | 2 | 276 | 3992 | 146.5 |
| line-spiral | potrace | **0.9853** | 1 | 50 | 2621 | 7.7 |

## pixelart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | - | - | - | - | - | 0/3 |
| imagetracer | 0.9215 | 8.7 | 276 | 3136 | 6.9 | 3/3 |
| potrace | **0.9773** | 4.0 | 327 | 5501 | 2703.9 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| pixel-heart | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| pixel-heart | imagetracer | 0.9365 | 6 | 254 | 2721 | 8.2 |
| pixel-heart | potrace | **0.9696** | 4 | 282 | 5070 | 2413.3 |
| pixel-mushroom | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| pixel-mushroom | imagetracer | 0.9028 | 12 | 236 | 3071 | 8.7 |
| pixel-mushroom | potrace | **0.9833** | 4 | 265 | 4627 | 2553.1 |
| pixel-sword | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| pixel-sword | imagetracer | 0.9251 | 8 | 339 | 3617 | 3.7 |
| pixel-sword | potrace | **0.9791** | 4 | 433 | 6807 | 3145.2 |

## photos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | - | - | - | - | - | 0/3 |
| imagetracer | 0.7120 | 1252.0 | 19130 | 314434 | 92.5 | 3/3 |
| potrace | **0.7782** | 5.0 | 3944 | 169484 | 122750.1 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| photo-landscape | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| photo-landscape | imagetracer | 0.7244 | 1008 | 15959 | 261063 | 140.1 |
| photo-landscape | potrace | **0.7468** | 5 | 3142 | 135196 | 135942.3 |
| photo-portrait | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| photo-portrait | imagetracer | 0.6938 | 1269 | 22076 | 345960 | 91.5 |
| photo-portrait | potrace | **0.8168** | 5 | 3327 | 144295 | 118389.7 |
| photo-texture | ours | error: trace-vectorizer not available: Cannot find package '/Users/stanley/dev/trace/node_modules/trace-vectorizer/index.js' imported from /Users/stanley/dev/trace/.orch/wt/t07/bench/run.ts | | | | |
| photo-texture | imagetracer | 0.7179 | 1479 | 19354 | 336278 | 45.8 |
| photo-texture | potrace | **0.7710** | 5 | 5362 | 228960 | 113918.2 |

