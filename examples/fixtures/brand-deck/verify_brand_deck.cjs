#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");

const deckPath = path.resolve("launch-deck.pptx");
const sourcePath = path.resolve("deck.js");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function xmlText(xml) {
  const matches = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)];
  return matches.map((match) => match[1].replace(/&amp;/g, "&")).join(" ");
}

if (!fs.existsSync(deckPath)) fail("launch-deck.pptx is missing");
if (!fs.existsSync(sourcePath)) fail("deck.js is missing");

const source = fs.readFileSync(sourcePath, "utf8");
for (const required of ["pptxgenjs", "1B4D89", "F2C94C", "0B1F33"]) {
  if (!source.includes(required)) fail(`deck.js missing ${required}`);
}

const zip = new AdmZip(deckPath);
const slideEntries = zip.getEntries()
  .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName))
  .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

if (slideEntries.length !== 5) {
  fail(`expected 5 slides, found ${slideEntries.length}`);
}

const slideXml = slideEntries.map((entry) => entry.getData().toString("utf8"));
const combinedXml = slideXml.join("\n");
const combinedText = slideXml.map(xmlText).join("\n");

for (const title of [
  "Nimbus Analytics",
  "Churn signals arrive too late",
  "From scattered notes to renewal focus",
  "Trusted rollout, measurable lift",
  "Book the pilot",
]) {
  if (!combinedText.includes(title)) fail(`missing slide text: ${title}`);
}

for (const token of ["1B4D89", "F2C94C", "0B1F33"]) {
  if (!combinedXml.includes(token)) fail(`deck XML missing brand color ${token}`);
}

for (const [index, xml] of slideXml.entries()) {
  const text = xmlText(xml).trim();
  if (text.length < 12) fail(`slide ${index + 1} has too little editable text`);
}

console.log("brand deck verified");
