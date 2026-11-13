const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "creator.html");
const cssPath = path.join(__dirname, "creator.css");
const jsPath = path.join(__dirname, "creator.js");
const outPath = path.join(__dirname, "gas_creator.html");

const html = fs.readFileSync(htmlPath, "utf8");
const css = fs.readFileSync(cssPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");

// <link rel="stylesheet" href="creator.css"> をインライン展開
let bundled = html.replace(
  /<link\s+rel=["']stylesheet["']\s+href=["']creator\.css["']\s*\/?>/i,
  "<style>\n" + css + "\n</style>"
);

// <script src="creator.js"></script> をインライン展開
bundled = bundled.replace(
  /<script\s+src=["']creator\.js["']\s*><\/script>/i,
  "<script>\n" + js + "\n</script>"
);

fs.writeFileSync(outPath, bundled, "utf8");
console.log("SUCCESS: gas_creator.html bundled successfully! Size:", bundled.length, "bytes");
