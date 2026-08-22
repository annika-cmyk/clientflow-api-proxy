#!/usr/bin/env node
const { loadStrukturellaLuckor } = require('./strukturella-luckor-common');

loadStrukturellaLuckor().then((report) => {
  if (report.skipped) {
    console.log(report.reason + ' — hoppar över live-rapport.');
    return;
  }
  console.log(JSON.stringify(report.dimensioner, null, 2));
}).catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
