const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const CheckboxSchema = new mongoose.Schema({
  id: Number,
  x: Number,
  y: Number,
  color: String
});

const MetadataSchema = new mongoose.Schema({
  width: Number,
  height: Number,
  timeLeft: Number
});

const Checkbox = mongoose.model('Checkbox', CheckboxSchema);
const Metadata = mongoose.model('Metadata', MetadataSchema);

const PORT = process.env.PORT || 10000;

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
});

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('A user connected');

  socket.on('getInitialData', async () => {
    const metadata = await Metadata.findOne();
    const checkboxes = await Checkbox.find();
    socket.emit('initialData', {
      width: metadata ? metadata.width : 50,
      height: metadata ? metadata.height : 50,
      timeLeft: metadata ? metadata.timeLeft : 0,
      checkboxes
    });
  });

  socket.on('checkboxClicked', async data => {
    let checkbox = await Checkbox.findOne({ id: data.id });
    if (checkbox) {
      checkbox.color = data.color;
      await checkbox.save();
    } else {
      checkbox = new Checkbox(data);
      await checkbox.save();
    }
    io.emit('checkboxUpdate', data);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

async function doubleCanvas() {
  const metadata = await Metadata.findOne();
  if (!metadata) {
    const newMetadata = new Metadata({ width: 50, height: 50, timeLeft: 120 });
    await newMetadata.save();
    return;
  }

  const newWidth = metadata.width * 2;
  const newHeight = metadata.height * 2;

  for (let x = 0; x < metadata.width; x++) {
    for (let y = 0; y < metadata.height; y++) {
      const originalCheckbox = await Checkbox.findOne({ x, y });
      if (originalCheckbox) {
        await new Checkbox({ id: getNextId(), x: x + metadata.width, y, color: originalCheckbox.color }).save();
        await new Checkbox({ id: getNextId(), x, y: y + metadata.height, color: originalCheckbox.color }).save();
        await new Checkbox({ id: getNextId(), x: x + metadata.width, y: y + metadata.height, color: originalCheckbox.color }).save();
      }
    }
  }

  metadata.width = newWidth;
  metadata.height = newHeight;
  metadata.timeLeft = 120; // Set timeLeft to 2 minutes for testing
  await metadata.save();

  io.emit('initialData', {
    width: metadata.width,
    height: metadata.height,
    timeLeft: metadata.timeLeft,
    checkboxes: await Checkbox.find()
  });
}

function getNextId() {
  return Math.floor(Math.random() * 1000000000);
}

setInterval(async () => {
  const metadata = await Metadata.findOne();
  if (metadata && metadata.timeLeft > 0) {
    metadata.timeLeft -= 1;
    await metadata.save();
  } else if (metadata && metadata.timeLeft === 0) {
    await doubleCanvas();
  }
}, 1000);

setInterval(async () => {
  const metadata = await Metadata.findOne();
  if (!metadata) {
    return;
  }
  const totalCheckboxes = metadata.width * metadata.height;
  const currentCheckboxes = await Checkbox.countDocuments();
  if (currentCheckboxes < totalCheckboxes) {
    const x = Math.floor(Math.random() * metadata.width);
    const y = Math.floor(Math.random() * metadata.height);
    const color = getRandomColor();
    const id = getNextId();
    await new Checkbox({ id, x, y, color }).save();
    io.emit('checkboxUpdate', { id, x, y, color });
  }
}, 30000);

function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}
