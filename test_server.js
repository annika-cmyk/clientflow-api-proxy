const express = require('express');
const app = express();
const PORT = 3001;

app.use(express.json());

// Test endpoints
app.get('/test', (req, res) => {
  res.json({ message: 'GET test works!' });
});

app.post('/test', (req, res) => {
  res.json({ message: 'POST test works!', body: req.body });
});

app.get('/api/bolagsverket/test', (req, res) => {
  res.json({ message: 'Bolagsverket GET test works!' });
});

app.post('/api/bolagsverket/test', (req, res) => {
  res.json({ message: 'Bolagsverket POST test works!', body: req.body });
});

app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test GET: http://localhost:${PORT}/test`);
  console.log(`Test POST: http://localhost:${PORT}/test`);
  console.log(`Bolagsverket GET: http://localhost:${PORT}/api/bolagsverket/test`);
  console.log(`Bolagsverket POST: http://localhost:${PORT}/api/bolagsverket/test`);
});
