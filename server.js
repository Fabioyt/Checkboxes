const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Verbinde mit MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Mit MongoDB verbunden');
}).catch(err => {
  console.error('MongoDB-Verbindung fehlgeschlagen:', err.message);
});

const checkboxSchema = new mongoose.Schema({
  id: Number,
  color: String
});

const Checkbox = mongoose.model('Checkbox', checkboxSchema);

// Statischer Dateiserver für das öffentliche Verzeichnis
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden');
  
  socket.on('checkboxClicked', async (data) => {
    const color = getRandomColor();
    await Checkbox.findOneAndUpdate({ id: data.id }, { color }, { upsert: true });
    io.emit('checkboxUpdate', { id: data.id, color });
  });

  socket.on('getInitialData', async () => {
    const checkboxes = await Checkbox.find({});
    socket.emit('initialData', checkboxes);
  });

  socket.on('disconnect', () => {
    console.log('Ein Benutzer hat die Verbindung getrennt');
  });
});

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i
