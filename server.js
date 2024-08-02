const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

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
  x: Number,
  y: Number,
  color: String
});

const metaSchema = new mongoose.Schema({
  lastDoubled: Date,
  width: Number,
  height: Number
});

const Checkbox = mongoose.model('Checkbox', gridSchema);
const Meta = mongoose.model('Meta', metaSchema);

async function initializeMetaAndGrid() {
  let meta = await Meta.findOne({});
  if (!meta) {
    meta = new Meta({
      lastDoubled: new Date(),
      width: 50,
      height: 50
    });
    await meta.save();
  }

  const checkboxCount = await Checkbox.countDocuments();
  if (checkboxCount === 0) {
    // Create initial 50x50 grid
    const initialCheckboxes = [];
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        initialCheckboxes.push(new Checkbox({
          id: y * 50 + x,
          x: x,
          y: y,
          color: '#FFFFFF' // initial color
        }));
      }
    }
    await Checkbox.insertMany(initialCheckboxes);
  }
}

initializeMetaAndGrid();

app.use(express.static(path.join(__dirname)));

// Route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let userCooldowns = {};

async function doubleCanvas() {
  const meta = await Meta.findOne({});
  const currentTime = new Date();
  const oneHourInMs = 60 * 60 * 1000;

  if (currentTime - new Date(meta.lastDoubled) > oneHourInMs) {
    const newWidth = meta.width * 2;
    const newHeight = meta.height * 2;
    meta.lastDoubled = currentTime;
    meta.width = newWidth;
    meta.height = newHeight;
    await meta.save();

    const checkboxes = await Checkbox.find({});
    const newCheckboxes = [];

    for (const checkbox of checkboxes) {
      const x = checkbox.x;
      const y = checkbox.y;
      const color = checkbox.color;

      // Create new checkboxes in the four quadrants
      newCheckboxes.push(new Checkbox({
        id: checkbox.id,
        x: x,
        y: y,
        color: color
      }));
      newCheckboxes.push(new Checkbox({
        id: checkbox.id + meta.width / 2,
        x: x + meta.width / 2,
        y: y,
        color: color
      }));
      newCheckboxes.push(new Checkbox({
        id: checkbox.id + meta.height * meta.width / 2,
        x: x,
        y: y + meta.height / 2,
        color: color
      }));
      newCheckboxes.push(new Checkbox({
        id: checkbox.id + meta.width / 2 + meta.height * meta.width / 2,
        x: x + meta.width / 2,
        y: y + meta.height / 2,
        color: color
      }));
    }

    await Checkbox.insertMany(newCheckboxes);
  }
}

// Check and double the canvas every 30 minutes
setInterval(doubleCanvas, 30 * 60 * 1000);

// Function to set a random pixel every 30 seconds
async function setRandomPixel() {
  const meta = await Meta.findOne({});
  if (!meta) return;

  const randomX = Math.floor(Math.random() * meta.width);
  const randomY = Math.floor(Math.random() * meta.height);
  const randomColor = getRandomColor();

  const id = randomY * meta.width + randomX;
  await Checkbox.findOneAndUpdate({ id: id }, { x: randomX, y: randomY, color: randomColor }, { upsert: true });
  io.emit('checkboxUpdate', { id: id, color: randomColor });
}

// Function to generate a random color
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Set a random pixel every 30 seconds
setInterval(setRandomPixel, 30 * 1000);

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
    console.log('Sending initial data:', checkboxes.length, 'checkboxes');
    const timeLeft = Math.ceil((new Date(meta.lastDoubled).getTime() + (60 * 60 * 1000) - new Date().getTime()) / 1000);
    socket.emit('initialData', { checkboxes, width: meta.width, height: meta.height, timeLeft });
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    delete userCooldowns[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
