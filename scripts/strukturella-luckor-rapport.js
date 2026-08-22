#!/usr/bin/env node
/**
 * Samlad granskningslista: tjänster utanför katalogen, riskfaktorer utan PT/TF
 * och kunder som saknar obligatoriska riskdimensioner. Ingen automatisk skrivning.
 */
const { loadStrukturellaLuckor } = require('./strukturella-luckor-common');

loadStrukturellaLuckor().then((report) => {
  if (report.skipped) {
    console.log(report.reason + ' — hoppar över live-rapport.');
    return;
  }
  console.log(JSON.stringify(report, null, 2));
}).catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
