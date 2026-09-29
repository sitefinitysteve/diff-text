#!/usr/bin/env bash
# Builds the static demo site into _site/: /vue/ and /react/ (Vite builds) and /php/
# (the PHP demo rendered to static HTML). Used by .github/workflows/pages.yml.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/_site"
mkdir -p "$out/vue" "$out/react" "$out/php"

(cd "$root/packages/vue/demo" && npm run build -- --outDir "$out/vue" --emptyOutDir)
(cd "$root/packages/react/demo" && npm run build -- --outDir "$out/react" --emptyOutDir)

cp "$root/demo/demo.css" "$root/demo/content.json" "$root/packages/php/demo/"
php "$root/packages/php/demo/index.php" > "$out/php/index.html"
cp "$root/packages/php/demo/demo.css" "$out/php/"

cat > "$out/index.html" <<'HTML'
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>diff-text demo</title>
<meta http-equiv="refresh" content="0; url=vue/">
<link rel="canonical" href="vue/">
</head>
<body><p><a href="vue/">Vue</a> · <a href="react/">React</a> · <a href="php/">PHP</a></p></body>
</html>
HTML
echo "Built $out"
