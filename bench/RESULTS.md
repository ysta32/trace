# Benchmark results

SSIM is computed per R/G/B channel (averaged) between the source and the SVG rasterized at source size on white (higher is better). Winner per row (bold) is the highest SSIM; ties and errored tools excluded. `vtracer` is skipped (no usable npm/WASM build). potrace uses `trace` for lineart and `posterize` otherwise.

## logos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9726** | 5.3 | 403 | 11288 | 83.0 | 4/4 |
| imagetracer | 0.9708 | 50.0 | 269 | 7843 | 83.3 | 4/4 |
| potrace | 0.9142 | 4.0 | 139 | 4533 | 2531.5 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| logo-circles | ours | **0.9771** | 6 | 405 | 11604 | 96.6 |
| logo-circles | imagetracer | 0.9744 | 64 | 325 | 9868 | 155.6 |
| logo-circles | potrace | 0.9422 | 4 | 123 | 5387 | 2629.1 |
| logo-shield | ours | **0.9908** | 4 | 502 | 14024 | 149.1 |
| logo-shield | imagetracer | 0.9727 | 51 | 272 | 8073 | 101.4 |
| logo-shield | potrace | 0.8963 | 4 | 110 | 4056 | 2508.9 |
| logo-swoosh | ours | 0.9415 | 3 | 408 | 11409 | 43.7 |
| logo-swoosh | imagetracer | **0.9870** | 66 | 323 | 9917 | 45.1 |
| logo-swoosh | potrace | 0.8646 | 4 | 90 | 3988 | 2204.1 |
| logo-text | ours | **0.9812** | 8 | 296 | 8113 | 42.7 |
| logo-text | imagetracer | 0.9493 | 19 | 155 | 3512 | 31 |
| logo-text | potrace | 0.9536 | 4 | 233 | 4701 | 2784 |

## icons

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9859** | 2.8 | 285 | 2558 | 14.3 | 4/4 |
| imagetracer | 0.9630 | 30.3 | 179 | 4818 | 24.8 | 4/4 |
| potrace | 0.9134 | 4.0 | 142 | 4584 | 1977.2 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| icon-cloud | ours | **0.9862** | 4 | 270 | 7647 | 51.3 |
| icon-cloud | imagetracer | 0.9752 | 39 | 228 | 6403 | 87.8 |
| icon-cloud | potrace | 0.9345 | 4 | 134 | 5190 | 1309.7 |
| icon-gear | ours | 0.9835 | 2 | 432 | 1218 | 2.8 |
| icon-gear | imagetracer | 0.9499 | 47 | 281 | 7307 | 6.3 |
| icon-gear | potrace | **0.9852** | 4 | 263 | 8003 | 1324.9 |
| icon-heart | ours | **0.9773** | 2 | 246 | 757 | 1.3 |
| icon-heart | imagetracer | 0.9682 | 32 | 148 | 4641 | 2 |
| icon-heart | potrace | 0.8708 | 4 | 70 | 3185 | 2360.1 |
| icon-home | ours | **0.9967** | 3 | 190 | 611 | 1.7 |
| icon-home | imagetracer | 0.9589 | 3 | 57 | 921 | 3.2 |
| icon-home | potrace | 0.8631 | 4 | 99 | 1959 | 2914.2 |

## lineart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9849** | 2.3 | 543 | 14972 | 78.6 | 3/3 |
| imagetracer | 0.9524 | 10.7 | 419 | 6307 | 77.3 | 3/3 |
| potrace | 0.9845 | 1.0 | 118 | 5196 | 62.0 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| line-flower | ours | 0.9701 | 2 | 809 | 21319 | 76.4 |
| line-flower | imagetracer | 0.9364 | 27 | 634 | 10441 | 162.9 |
| line-flower | potrace | **0.9780** | 1 | 217 | 8926 | 63.1 |
| line-scribble | ours | **0.9926** | 3 | 353 | 10533 | 79.8 |
| line-scribble | imagetracer | 0.9640 | 3 | 351 | 4488 | 38.3 |
| line-scribble | potrace | 0.9897 | 1 | 87 | 4040 | 55.1 |
| line-spiral | ours | **0.9921** | 2 | 468 | 13064 | 79.5 |
| line-spiral | imagetracer | 0.9568 | 2 | 273 | 3992 | 30.8 |
| line-spiral | potrace | 0.9858 | 1 | 50 | 2621 | 67.7 |

## pixelart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9767** | 19.3 | 173 | 1116 | 1.3 | 3/3 |
| imagetracer | 0.8944 | 8.7 | 265 | 3136 | 4.3 | 3/3 |
| potrace | 0.8817 | 4.0 | 624 | 5501 | 1729.8 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| pixel-heart | ours | **0.9441** | 24 | 164 | 1230 | 1.1 |
| pixel-heart | imagetracer | 0.9166 | 6 | 247 | 2721 | 3.4 |
| pixel-heart | potrace | 0.8431 | 4 | 534 | 5070 | 1149 |
| pixel-mushroom | ours | **1.0000** | 17 | 140 | 985 | 1.2 |
| pixel-mushroom | imagetracer | 0.8670 | 12 | 218 | 3071 | 4.6 |
| pixel-mushroom | potrace | 0.8645 | 4 | 483 | 4627 | 876.4 |
| pixel-sword | ours | **0.9860** | 17 | 214 | 1133 | 1.5 |
| pixel-sword | imagetracer | 0.8995 | 8 | 330 | 3617 | 4.8 |
| pixel-sword | potrace | 0.9376 | 4 | 855 | 6807 | 3164.1 |

## photos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | 0.7327 | 34.7 | 3470 | 94792 | 238.7 | 3/3 |
| imagetracer | 0.7032 | 1252.0 | 17011 | 314434 | 165.1 | 3/3 |
| potrace | **0.7419** | 5.0 | 3998 | 169484 | 81189.1 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| photo-landscape | ours | 0.7107 | 19 | 2868 | 78959 | 461.6 |
| photo-landscape | imagetracer | 0.7126 | 1008 | 14250 | 261063 | 156.5 |
| photo-landscape | potrace | **0.7214** | 5 | 3186 | 135196 | 57180.5 |
| photo-portrait | ours | 0.7950 | 21 | 2435 | 65423 | 149.8 |
| photo-portrait | imagetracer | 0.7207 | 1269 | 19677 | 345960 | 286.4 |
| photo-portrait | potrace | **0.8074** | 5 | 3368 | 144295 | 86273.3 |
| photo-texture | ours | 0.6923 | 64 | 5107 | 139994 | 104.6 |
| photo-texture | imagetracer | 0.6762 | 1479 | 17105 | 336278 | 52.5 |
| photo-texture | potrace | **0.6969** | 5 | 5440 | 228960 | 100113.5 |

