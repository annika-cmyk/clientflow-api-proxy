#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');

const URL = process.env.UTSATTA_OMRADEN_SOURCE_URL
  || 'https://polisen.se/33a4eb398c9ca7879ac47049931a252f/contentassets/1f86e17354294629b5b66559eef35972/uso_2025_geojson.zip';
const OUT = path.join(__dirname, '../data/utsatta-omraden/uso_2025.geojson');

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`Kunde inte ladda GeoJSON (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries().find((e) => /\.geojson$/i.test(e.entryName));
  if (!entry) throw new Error('Ingen .geojson i zip-filen');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, entry.getData());
  const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  console.log(`Sparade ${OUT} (${data.features?.length || 0} områden)`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
