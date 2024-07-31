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

// Statischer Dateiserver für das Hauptverzeichnis
app.use(express.static(path.join(__dirname)));

// Route für die Startseite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden');
  
  socket.on('checkboxClicked', async (data) => {
    const color = data.color;
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
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));

let userCooldowns = {};

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden');
  
  socket.on('checkboxClicked', async (data) => {
    const userId = socket.id;
    if (userCooldowns[userId] && userCooldowns[userId] > Date.now()) {
      socket.emit('cooldown', { timeLeft: userCooldowns[userId] - Date.now() });
      return;
    }
    
    const color = data.color;
    await Checkbox.findOneAndUpdate({ id: data.id }, { color }, { upsert: true });
    io.emit('checkboxUpdate', { id: data.id, color });
    
    // Set cooldown for user
    userCooldowns[userId] = Date.now() + 5000; // 5 seconds cooldown
  });

  socket.on('getInitialData', async () => {
    const checkboxes = await Checkbox.find({});
    socket.emit('initialData', checkboxes);
  });

  socket.on('disconnect', () => {
    console.log('Ein Benutzer hat die Verbindung getrennt');
    delete userCooldowns[socket.id];
  });
});