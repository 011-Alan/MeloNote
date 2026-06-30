// print_debug_info.js
const { JSDOM } = require("jsdom");
const fs = require("fs");

const htmlContent = fs.readFileSync("score.html", "utf-8");
const dom = new JSDOM(htmlContent, {
  resources: "usable",
  runScripts: "dangerously",
  pretendToBeVisual: true
});

dom.window.structuredClone = (val) => JSON.parse(JSON.stringify(val));

setTimeout(() => {
  try {
    const document = dom.window.document;
    const debugDiv = document.getElementById("debug-info");
    if (debugDiv) {
      console.log("DEBUG DIV CONTENT:\n", debugDiv.textContent);
    } else {
      console.log("No debug div found!");
    }
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}, 5000);
