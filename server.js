const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Mit MongoDB verbunden');
}).catch(err => {
  console.error('MongoDB-Verbindung fehlgeschlagen:', err.message);
});

const gridSchema = new mongoose.Schema({
  id: Number,
  color: String
});

const metaSchema = new mongoose.Schema({
  lastDoubled: Date,
  columns: Number,
  rows: Number
});

const Checkbox = mongoose.model('Checkbox', gridSchema);
const Meta = mongoose.model('Meta', metaSchema);

// Initialisieren Sie die Meta-Daten, falls sie nicht existieren
async function initializeMeta() {
  let meta = await Meta.findOne({});
  if (!meta) {
    meta = new Meta({
      lastDoubled: new Date(),
      columns: 50,
      rows: 20
    });
    await meta.save();
  }
}

initializeMeta();

// Middleware für statische Dateien
app.use(express.static(path.join(__dirname)));

// Route für die Startseite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Funktion zur Verdopplung der Leinwand
async function doubleCanvas() {
  const meta = await Meta.findOne({});
  const currentTime = new Date();
  const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

  if (currentTime - new Date(meta.lastDoubled) > twoDaysInMs) {
    meta.columns *= 2;
    meta.rows *= 2;
    meta.lastDoubled = currentTime;
    await meta.save();

    // Duplizieren Sie die bestehenden Zellen
    const checkboxes = await Checkbox.find({});
    for (const checkbox of checkboxes) {
      const newCheckbox1 = new Checkbox({
        id: checkbox.id + meta.columns,
        color: checkbox.color
      });
      const newCheckbox2 = new Checkbox({
        id: checkbox.id + meta.columns * meta.rows,
        color: checkbox.color
      });
      const newCheckbox3 = new Checkbox({
        id: checkbox.id + meta.columns + meta.columns * meta.rows,
        color: checkbox.color
      });

      await newCheckbox1.save();
      await newCheckbox2.save();
      await newCheckbox3.save();
    }
  }
}

// Überprüfen und Verdoppeln der Leinwand alle 30 Minuten
setInterval(doubleCanvas, 30 * 60 * 1000);

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden');

  socket.on('checkboxClicked', async (data) => {
    const color = data.color;
    await Checkbox.findOneAndUpdate({ id: data.id }, { color }, { upsert: true });
    io.emit('checkboxUpdate', { id: data.id, color });
  });

  socket.on('getInitialData', async () => {
    const meta = await Meta.findOne({});
    const checkboxes = await Checkbox.find({});
    socket.emit('initialData', { checkboxes, columns: meta.columns, rows: meta.rows });
  });

  socket.on('disconnect', () => {
    console.log('Ein Benutzer hat die Verbindung getrennt');
  });
});

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
