#!/usr/bin/env sh
# Rasterises the home-screen icons from assets/icons/croche-app-icon.svg.
#
# The PNGs are committed, so this is not part of the build: a contributor who
# never touches the icon never needs rsvg-convert installed. Run it only after
# editing the source SVG.
#
# The alpha channel is stripped rather than merely unused. iOS composites a
# home-screen icon over black, so a stray transparent pixel shows up as a black
# one on the child's iPad.

set -eu

cd "$(dirname "$0")/.."

source_svg='assets/icons/croche-app-icon.svg'
target_dir='public/icons'

mkdir -p "$target_dir"

for size in 180 192 512; do
    rsvg-convert --width="$size" --height="$size" "$source_svg" \
        | magick png:- -background '#6d3a8e' -alpha remove -alpha off \
            "$target_dir/croche-$size.png"

    echo "$target_dir/croche-$size.png"
done
