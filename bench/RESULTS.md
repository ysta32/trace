# Benchmark results

SSIM is computed per R/G/B channel (averaged) between the source and the SVG rasterized at source size on white (higher is better). Winner per row (bold) is the highest SSIM; ties and errored tools excluded. `vtracer` is skipped (no usable npm/WASM build). potrace uses `trace` for lineart and `posterize` otherwise.

## logos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9907** | 5.8 | 78 | 1883 | 29.0 | 4/4 |
| imagetracer | 0.9708 | 50.0 | 269 | 7843 | 15.2 | 4/4 |
| potrace | 0.9142 | 4.0 | 139 | 4533 | 691.4 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| logo-circles | ours | **0.9909** | 6 | 78 | 1978 | 33.2 |
| logo-circles | imagetracer | 0.9744 | 64 | 325 | 9868 | 22.1 |
| logo-circles | potrace | 0.9422 | 4 | 123 | 5387 | 680 |
| logo-shield | ours | **0.9960** | 4 | 62 | 1497 | 31.8 |
| logo-shield | imagetracer | 0.9727 | 51 | 272 | 8073 | 13.9 |
| logo-shield | potrace | 0.8963 | 4 | 110 | 4056 | 630.6 |
| logo-swoosh | ours | **0.9918** | 5 | 89 | 2425 | 27.8 |
| logo-swoosh | imagetracer | 0.9870 | 66 | 323 | 9917 | 14.3 |
| logo-swoosh | potrace | 0.8646 | 4 | 90 | 3988 | 634.4 |
| logo-text | ours | **0.9841** | 8 | 84 | 1633 | 23.2 |
| logo-text | imagetracer | 0.9493 | 19 | 155 | 3512 | 10.5 |
| logo-text | potrace | 0.9536 | 4 | 233 | 4701 | 820.7 |

## icons

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9929** | 3.0 | 48 | 1171 | 22.6 | 4/4 |
| imagetracer | 0.9630 | 30.3 | 179 | 4818 | 10.7 | 4/4 |
| potrace | 0.9134 | 4.0 | 142 | 4584 | 838.6 | 4/4 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| icon-cloud | ours | **0.9911** | 4 | 83 | 2025 | 51.7 |
| icon-cloud | imagetracer | 0.9752 | 39 | 228 | 6403 | 26.7 |
| icon-cloud | potrace | 0.9345 | 4 | 134 | 5190 | 1126.9 |
| icon-gear | ours | **0.9890** | 2 | 53 | 1334 | 10.1 |
| icon-gear | imagetracer | 0.9499 | 47 | 281 | 7307 | 5.1 |
| icon-gear | potrace | 0.9852 | 4 | 263 | 8003 | 737.6 |
| icon-heart | ours | **0.9948** | 3 | 21 | 676 | 16.7 |
| icon-heart | imagetracer | 0.9682 | 32 | 148 | 4641 | 2.9 |
| icon-heart | potrace | 0.8708 | 4 | 70 | 3185 | 763.8 |
| icon-home | ours | **0.9968** | 3 | 33 | 648 | 12.1 |
| icon-home | imagetracer | 0.9589 | 3 | 57 | 921 | 8 |
| icon-home | potrace | 0.8631 | 4 | 99 | 1959 | 726.1 |

## lineart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.9920** | 2.3 | 142 | 3691 | 47.2 | 3/3 |
| imagetracer | 0.9524 | 10.7 | 419 | 6307 | 37.7 | 3/3 |
| potrace | 0.9845 | 1.0 | 118 | 5196 | 20.5 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| line-flower | ours | **0.9889** | 2 | 233 | 5746 | 44.6 |
| line-flower | imagetracer | 0.9364 | 27 | 634 | 10441 | 56.6 |
| line-flower | potrace | 0.9780 | 1 | 217 | 8926 | 21.4 |
| line-scribble | ours | **0.9944** | 3 | 112 | 3060 | 49.1 |
| line-scribble | imagetracer | 0.9640 | 3 | 351 | 4488 | 31.4 |
| line-scribble | potrace | 0.9897 | 1 | 87 | 4040 | 11.7 |
| line-spiral | ours | **0.9928** | 2 | 81 | 2267 | 47.9 |
| line-spiral | imagetracer | 0.9568 | 2 | 273 | 3992 | 25 |
| line-spiral | potrace | 0.9858 | 1 | 50 | 2621 | 28.4 |

## pixelart

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **1.0000** | 20.0 | 198 | 1201 | 1.5 | 3/3 |
| imagetracer | 0.8944 | 8.7 | 265 | 3136 | 15.9 | 3/3 |
| potrace | 0.8817 | 4.0 | 624 | 5501 | 3991.8 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| pixel-heart | ours | **1.0000** | 25 | 208 | 1371 | 1.5 |
| pixel-heart | imagetracer | 0.9166 | 6 | 247 | 2721 | 7.9 |
| pixel-heart | potrace | 0.8431 | 4 | 534 | 5070 | 3278.6 |
| pixel-mushroom | ours | **1.0000** | 17 | 140 | 985 | 1.5 |
| pixel-mushroom | imagetracer | 0.8670 | 12 | 218 | 3071 | 33.3 |
| pixel-mushroom | potrace | 0.8645 | 4 | 483 | 4627 | 4105.7 |
| pixel-sword | ours | **1.0000** | 18 | 246 | 1246 | 1.4 |
| pixel-sword | imagetracer | 0.8995 | 8 | 330 | 3617 | 6.5 |
| pixel-sword | potrace | 0.9376 | 4 | 855 | 6807 | 4591.2 |

## photos

**Averages**

| tool | SSIM | paths | nodes | bytes | ms | ok/total |
|---|---:|---:|---:|---:|---:|---:|
| ours | **0.7678** | 57.3 | 1913 | 39712 | 121.4 | 3/3 |
| imagetracer | 0.7032 | 1252.0 | 17011 | 314434 | 33.0 | 3/3 |
| potrace | 0.7419 | 5.0 | 3998 | 169484 | 55255.6 | 3/3 |

**Per image**

| image | tool | SSIM | paths | nodes | bytes | ms |
|---|---|---:|---:|---:|---:|---:|
| photo-landscape | ours | **0.7461** | 30 | 1100 | 23993 | 172.1 |
| photo-landscape | imagetracer | 0.7126 | 1008 | 14250 | 261063 | 29.5 |
| photo-landscape | potrace | 0.7214 | 5 | 3186 | 135196 | 52741.2 |
| photo-portrait | ours | **0.8215** | 25 | 1360 | 27355 | 97.1 |
| photo-portrait | imagetracer | 0.7207 | 1269 | 19677 | 345960 | 41.3 |
| photo-portrait | potrace | 0.8074 | 5 | 3368 | 144295 | 51780.6 |
| photo-texture | ours | **0.7359** | 117 | 3280 | 67788 | 95 |
| photo-texture | imagetracer | 0.6762 | 1479 | 17105 | 336278 | 28.3 |
| photo-texture | potrace | 0.6969 | 5 | 5440 | 228960 | 61245.1 |

