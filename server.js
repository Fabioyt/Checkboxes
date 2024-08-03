const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const requestIp = require('request-ip');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(requestIp.mw());

const CheckboxSchema = new mongoose.Schema({
  id: String,  // ID als String speichern
  x: Number,
  y: Number,
  color: String,
  ip: String  // Neues Feld für die IP-Adresse des Erstellers
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
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000 // Timeout auf 30 Sekunden erhöhen
}).then(() => {
  console.log('Connected to MongoDB');
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
});

// Serve the index.html file from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', socket => {
  console.log('A user connected');

  socket.on('getInitialData', async () => {
    try {
      const metadata = await Metadata.findOne();
      const checkboxes = await Checkbox.find();
      console.log('Metadata:', metadata);
      console.log('Checkboxes:', checkboxes);
      socket.emit('initialData', {
        width: metadata ? metadata.width : 250,
        height: metadata ? metadata.height : 250,
        timeLeft: metadata ? metadata.timeLeft : 0,
        checkboxes
      });
    } catch (error) {
      console.error('Error fetching initial data:', error);
      socket.emit('error', 'Failed to fetch initial data');
    }
  });

  socket.on('checkboxClicked', async data => {
    const clientIp = socket.handshake.address;
    try {
      let checkbox = await Checkbox.findOne({ id: data.id });
      if (checkbox) {
        checkbox.color = data.color;
        checkbox.ip = clientIp;
        await checkbox.save();
      } else {
        checkbox = new Checkbox({ ...data, ip: clientIp });
        await checkbox.save();
      }
      io.emit('checkboxUpdate', { ...data, ip: clientIp });
    } catch (error) {
      console.error('Error updating checkbox:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

async function doubleCanvas() {
  try {
    const metadata = await Metadata.findOne();
    if (!metadata) {
      const newMetadata = new Metadata({ width: 250, height: 250, timeLeft: 120 });
      await newMetadata.save();
      return;
    }

    const newWidth = metadata.width * 2;
    const newHeight = metadata.height * 2;

    // Temporäres Array, um neue Checkboxen zu speichern
    const newCheckboxes = [];

    for (let x = 0; x < metadata.width; x++) {
      for (let y = 0; y < metadata.height; y++) {
        const originalCheckbox = await Checkbox.findOne({ x, y });
        if (originalCheckbox) {
          newCheckboxes.push({ id: getNextId(), x: x + metadata.width, y, color: originalCheckbox.color, ip: originalCheckbox.ip });
          newCheckboxes.push({ id: getNextId(), x, y: y + metadata.height, color: originalCheckbox.color, ip: originalCheckbox.ip });
          newCheckboxes.push({ id: getNextId(), x: x + metadata.width, y: y + metadata.height, color: originalCheckbox.color, ip: originalCheckbox.ip });
        }
      }
    }

    // Speichern der neuen Checkboxen
    await Checkbox.insertMany(newCheckboxes);

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
  } catch (error) {
    console.error('Error doubling canvas:', error);
  }
}

function getNextId() {
  return Math.floor(Math.random() * 1000000000).toString();
}

setInterval(async () => {
  try {
    const metadata = await Metadata.findOne();
    if (metadata && metadata.timeLeft > 0) {
      metadata.timeLeft -= 1;
      await metadata.save();
    } else if (metadata && metadata.timeLeft === 0) {
      await doubleCanvas();
    }
  } catch (error) {
    console.error('Error updating timer or doubling canvas:', error);
  }
}, 1000);

setInterval(async () => {
  try {
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
      const ip = "server";  // Kennzeichnung für zufällige Checkboxen
      await new Checkbox({ id, x, y, color, ip }).save();
      io.emit('checkboxUpdate', { id, x, y, color });
    }
  } catch (error) {
    console.error('Error generating random checkbox:', error);
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
