const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;  // Add this line instead of const PORT = 3000;

// Supported stocks
const SUPPORTED_STOCKS = ['GOOG', 'TSLA', 'AMZN', 'META', 'NVDA'];

// Store user subscriptions, current prices, and history
let users = {}; // { socketId: { email: string, subscriptions: Set<string> } }
let stockPrices = {}; // { ticker: number }
let stockHistory = {}; // { ticker: [array of last 10 prices] }

// Initialize random prices and history for supported stocks
SUPPORTED_STOCKS.forEach(stock => {
  const initialPrice = Math.floor(Math.random() * 400) + 100;
  stockPrices[stock] = initialPrice;
  stockHistory[stock] = [initialPrice]; // Start with one price
});

app.get("/", (req, res) => {
  res.status(200).send("Stock Dashboard backend is running 🚀");
});

// Update prices every second
setInterval(() => {
  SUPPORTED_STOCKS.forEach(stock => {
    // Random fluctuation: ±1 to 5
    const change = (Math.random() - 0.5) * 10;
    const newPrice = Math.max(0, stockPrices[stock] + change);
    stockPrices[stock] = newPrice;

    // Update history (keep last 10)
    if (!stockHistory[stock]) stockHistory[stock] = [];
    stockHistory[stock].push(newPrice);
    if (stockHistory[stock].length > 10) stockHistory[stock].shift();
  });

  // Broadcast updates to all connected clients for their subscribed stocks
  io.sockets.sockets.forEach(socket => {
    const user = users[socket.id];
    if (user && user.subscriptions.size > 0) {
      const updates = {};
      const histories = {};
      user.subscriptions.forEach(stock => {
        if (stockPrices[stock] !== undefined) {
          updates[stock] = stockPrices[stock].toFixed(2);
          histories[stock] = stockHistory[stock].map(p => parseFloat(p.toFixed(2)));
        }
      });
      if (Object.keys(updates).length > 0) {
        socket.emit('priceUpdate', { prices: updates, histories });
      }
    }
  });
}, 1000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle login
  socket.on('login', (email) => {
    users[socket.id] = { email, subscriptions: new Set() };
    socket.emit('loginSuccess', { supportedStocks: SUPPORTED_STOCKS });
  });

  // Handle subscription
  socket.on('subscribe', (ticker) => {
    if (users[socket.id] && SUPPORTED_STOCKS.includes(ticker)) {
      users[socket.id].subscriptions.add(ticker);
      socket.emit('subscribed', ticker);
      // Send current price and history immediately
      socket.emit('priceUpdate', {
        prices: { [ticker]: stockPrices[ticker].toFixed(2) },
        histories: { [ticker]: stockHistory[ticker].map(p => parseFloat(p.toFixed(2))) }
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    delete users[socket.id];
    console.log('User disconnected:', socket.id);
  });
});

app.use(express.static('public'));

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
