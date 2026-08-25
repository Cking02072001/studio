#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]])
  );
}

function tokenizePath(pathData) {
  return pathData.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
}

function pathToPostScript(pathData) {
  const parameterCounts = { M: 2, L: 2, H: 1, V: 1, C: 6 };
  const tokens = tokenizePath(pathData);
  const output = [];
  let command = null;
  let index = 0;

  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) {
      command = tokens[index++];
      if (command === 'Z') {
        output.push('closepath');
        command = null;
        continue;
      }
    }

    if (!parameterCounts[command]) {
      throw new Error(`Unsupported SVG path command: ${command || tokens[index]}`);
    }

    const count = parameterCounts[command];
    if (index + count > tokens.length) {
      throw new Error(`Incomplete SVG path command: ${command}`);
    }

    const values = tokens.slice(index, index + count);
    index += count;

    if (command === 'M') {
      output.push(`${values.join(' ')} moveto`);
      command = 'L';
    } else if (command === 'L') {
      output.push(`${values.join(' ')} lineto`);
    } else if (command === 'H') {
      output.push(`${values[0]} currentpoint exch pop lineto`);
    } else if (command === 'V') {
      output.push(`currentpoint pop ${values[0]} lineto`);
    } else if (command === 'C') {
      output.push(`${values.join(' ')} curveto`);
    }
  }

  return output.join('\n');
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function convertSvg(svgPath) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  const rootTag = svg.match(/<svg\b[^>]*>/)?.[0];
  if (!rootTag) throw new Error(`Missing SVG root in ${svgPath}`);

  const root = parseAttributes(rootTag);
  const viewBox = (root.viewBox || `0 0 ${root.width} ${root.height}`).split(/\s+/).map(Number);
  const [minX, minY, width, height] = viewBox;
  const paths = [...svg.matchAll(/<path\b[^>]*>/g)].map((match) => parseAttributes(match[0]));
  const epsPath = svgPath.replace(/\.svg$/i, '.eps');
  const lines = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    `%%Title: ${path.basename(epsPath)}`,
    '%%Creator: Brandhub SVG to EPS converter',
    `%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}`,
    `%%HiResBoundingBox: 0 0 ${width} ${height}`,
    '%%LanguageLevel: 2',
    '%%Pages: 1',
    '%%EndComments',
    'gsave',
    `0 ${height} translate`,
    '1 -1 scale',
    `${-minX} ${-minY} translate`
  ];

  for (const item of paths) {
    if (!item.d || !item.fill || item.fill === 'none') continue;
    const [red, green, blue] = hexToRgb(item.fill);
    lines.push('newpath');
    lines.push(pathToPostScript(item.d));
    lines.push(`${red.toFixed(6)} ${green.toFixed(6)} ${blue.toFixed(6)} setrgbcolor`);
    lines.push('fill');
  }

  lines.push('grestore', 'showpage', '%%EOF', '');
  fs.writeFileSync(epsPath, lines.join('\n'));
  return epsPath;
}

const inputDir = process.argv[2];
if (!inputDir) {
  console.error('Usage: node scripts/convert-svg-to-eps.js <directory>');
  process.exit(1);
}

const svgFiles = fs.readdirSync(inputDir)
  .filter((name) => name.toLowerCase().endsWith('.svg'))
  .sort();

for (const file of svgFiles) {
  console.log(convertSvg(path.join(inputDir, file)));
}

console.log(`Converted ${svgFiles.length} SVG files to EPS.`);
