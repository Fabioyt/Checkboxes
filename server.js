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
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection failed:', err.message);
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

// Initialize Meta data if not exist
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

app.use(express.static(path.join(__dirname)));

// Route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let userCooldowns = {};

async function doubleCanvas() {
  const meta = await Meta.findOne({});
  const currentTime = new Date();
  const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

  if (currentTime - new Date(meta.lastDoubled) > twoDaysInMs) {
    meta.columns *= 2;
    meta.rows *= 2;
    meta.lastDoubled = currentTime;
    await meta.save();

    // Duplicate existing cells
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

// Check and double the canvas every 30 minutes
setInterval(doubleCanvas, 30 * 60 * 1000);

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('checkboxClicked', async (data) => {
    const userId = socket.id;
    if (userCooldowns[userId] && userCooldowns[userId] > Date.now()) {
      const timeLeft = Math.ceil((userCooldowns[userId] - Date.now()) / 1000);
      socket.emit('cooldown', { timeLeft });
      return;
    }

    const color = data.color;
    await Checkbox.findOneAndUpdate({ id: data.id }, { color }, { upsert: true });
    io.emit('checkboxUpdate', { id: data.id, color });

    userCooldowns[userId] = Date.now() + 5000; // 5 seconds cooldown
  });

  socket.on('getInitialData', async () => {
    const meta = await Meta.findOne({});
    const checkboxes = await Checkbox.find({});
    const timeLeft = Math.ceil((new Date(meta.lastDoubled).getTime() + (2 * 24 * 60 * 60 * 1000) - new Date().getTime()) / 1000);
    socket.emit('initialData', { checkboxes, columns: meta.columns, rows: meta.rows, timeLeft });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    delete userCooldowns[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
