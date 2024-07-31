const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Verbinde mit der MySQL-Datenbank von InfinityFree
const db = mysql.createConnection({
  host: 'sql208.infinityfree.com',  
  user: 'if0_37015942',
  password: '7S12OTN8XfpTJk',
  database: 'if0_37015942_checkboxes'
});

db.connect(err => {
  if (err) {
    console.error('MySQL-Verbindung fehlgeschlagen:', err.message);
  } else {
    console.log('Mit MySQL verbunden');
  }
});

const createTableQuery = `
  CREATE TABLE IF NOT EXISTS checkboxes (
    id INT PRIMARY KEY,
    color VARCHAR(7)
  )
`;

db.query(createTableQuery, (err, results) => {
  if (err) {
    console.error('Fehler beim Erstellen der Tabelle:', err.message);
  }
});

// Statischer Dateiserver für das öffentliche Verzeichnis
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('Ein Benutzer hat sich verbunden');
  
  socket.on('checkboxClicked', (data) => {
    const color = getRandomColor();
    const query = `
      INSERT INTO checkboxes (id, color) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE color = VALUES(color)
    `;
    db.query(query, [data.id, color], (err, results) => {
      if (err) {
        console.error('Fehler beim Aktualisieren der Checkbox:', err.message);
      } else {
        io.emit('checkboxUpdate', { id: data.id, color });
      }
    });
  });

  socket.on('getInitialData', () => {
    const query = 'SELECT * FROM checkboxes';
    db.query(query, (err, results) => {
      if (err) {
        console.error('Fehler beim Abrufen der Daten:', err.message);
      } else {
        socket.emit('initialData', results);
      }
    });
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
