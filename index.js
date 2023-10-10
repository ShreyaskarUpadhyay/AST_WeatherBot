const TelegramBot = require("node-telegram-bot-api");
const weather = require("weather-js");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const port = 3000;

// Passport Configuration
passport.use(
  new GoogleStrategy(
    {
      clientID:
        "1068367171765-quu1d902o26pmppohofqurn6g9a2gkjl.apps.googleusercontent.com",
      clientSecret: "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",
      callbackURL: "http://localhost:3000/auth/google/callback",
    },
    function (accessToken, refreshToken, profile, cb) {
      const user = {
        email: profile.emails[0].value,
        name: profile.displayName,
        photo: profile.photos[0].value,
      };
      cb(null, user);
    }
  )
);

// Express Configuration
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "keyboard cat",
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.json());

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (user, done) {
  done(null, user);
});

// MongoDB Connection
const mainDB = mongoose.connect(
  "mongodb+srv://085shreyaskar:SEOdd5M3cQPofowr@cluster0.lrtzym9.mongodb.net/main"
);

// User Schema
const userSchema = new mongoose.Schema({
  chatId: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
});

const blokedSchema = new mongoose.Schema({
  chatId: {
    type: Number,
    required: true,
  },
});

const configSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
  },
  interval: {
    type: Number,
    required: true,
  },
});

const User = mongoose.model("User", userSchema);
const Blocked = mongoose.model("Block", blokedSchema);
const Config = mongoose.model("Config", configSchema);

// Telegram Bot Configuration
const token = "6477244093:AAFXWOJvsLO3p7NGzU6BV14mdbJDua72qEo";
let bot = new TelegramBot(token, { polling: true });

// Middleware for Authentication
function requireAuthenticated(req, res, next) {
  if (!req.user) {
    res.redirect("/auth");
  } else {
    next();
  }
}

// Routes
app.get("/", requireAuthenticated, (req, res) => {
  User.find({}).then((users) => {
    res.render("index", { user: req.user, users });
  });
});

app.post("/update-token", requireAuthenticated, async (req, res) => {
  try {
    const { newToken } = req.body;
    const config = await Config.findOneAndUpdate(
      {},
      { token: newToken },
      { new: true }
    );
    setupBot();
    res.status(200).send("Bot token updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update-interval/:newInterval", async (req, res) => {
  try {
    const { newInterval } = req.params;
    const config = await Config.findOneAndUpdate(
      {},
      { interval: parseInt(newInterval) },
      { new: true }
    );
    console.log(config);
    setupBot();
    res.status(200).send("Bot interval updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/remove", requireAuthenticated, (req, res) => {
  const { id } = req.body;

  User.findOne({ id }).then((user) => {
    bot.sendMessage(user.chatId, "You were unsubscribed by admin");
    User.deleteOne({ id }).then((user) => {
      res.sendStatus(200);
    });
  });
});

app.post("/block", requireAuthenticated, (req, res) => {
  const { id } = req.body;

  User.findOne({ id }).then((user) => {
    blockedUser = new Blocked({
      chatId: user.chatId,
    });
    blockedUser.save().then(() => {
      bot.sendMessage(user.chatId, `You have been blocked by admin`);
      User.deleteOne({ id }).then((user) => {
        res.sendStatus(200);
      });
    });
  });
});

app.get("/auth", (req, res) => {
  res.render("auth");
});

app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    successRedirect: "/",
    failureRedirect: "/auth",
  })
);

app.listen(port, (err) => {
  if (err) {
    console.log(err);
    return;
  }
  console.log(`Server online on port ${port}`);
});

// Telegram Bot Commands
bot.onText(/\/subscribe (.+)/, (msg, match) => {
  const userId = msg.chat.id;
  const userLocation = match[1];

  Blocked.findOne({ chatId: userId }).then((block) => {
    if (block !== null) {
      bot.sendMessage(
        userId,
        `Cannot subscribe to location updates. Reason: Blocked By Admin`
      );
    } else {
      User.findOne({ chatId: userId }).then((user) => {
        if (user === null) {
          newUser = new User({
            chatId: userId,
            location: userLocation,
          });

          newUser.save().then(() => {
            bot.sendMessage(
              userId,
              `Subscribed for weather updates in ${userLocation}`
            );
          });
        } else {
          if (user.location === userLocation) {
            bot.sendMessage(
              userId,
              `You are already subscribed to ${userLocation}`
            );
          } else {
            User.updateOne({ chatId: userId }, { location: userLocation }).then(
              () => {
                bot.sendMessage(userId, `Location updated to ${userLocation}`);
              }
            );
          }
        }
      });
    }
  });
});

bot.onText(/\/unsubscribe/, (msg, match) => {
  const userId = msg.chat.id;

  User.findOne({ chatId: userId }).then((user) => {
    if (user === null) {
      bot.sendMessage(userId, `You are not subscribed to any locations`);
    } else {
      User.deleteOne({ chatId: userId }).then(() => {
        bot.sendMessage(
          userId,
          `You are now unsubscribed from ${user.location}`
        );
      });
    }
  });
});

bot.onText(/\/weather (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const location = match[1];

  weather.find({ search: location, degreeType: "C" }, function (err, result) {
    if (err) {
      console.log(err);
    } else {
      if (result && result[0]) {
        const weatherData = result[0].current;
        const message = `
Weather in ${weatherData.observationpoint} (${weatherData.date}):
Temperature: ${weatherData.temperature}°C
Sky: ${weatherData.skytext}
Feels Like: ${weatherData.feelslike}°C
Humidity: ${weatherData.humidity}%
Wind: ${weatherData.winddisplay}
				`;

        bot.sendMessage(chatId, message);
      } else {
        bot.sendMessage(chatId, "No weather data found for that location.");
      }
    }
  });
});

// Function to send weather updates
function sendWeatherUpdate() {
  User.find({}).then((users) => {
    try {
      for (const chat of users) {
        weather.find(
          { search: chat.location, degreeType: "C" },
          function (err, result) {
            if (err) {
              console.log(err);
            } else {
              if (result && result[0]) {
                const weatherData = result[0].current;
                const message = `
Weather in ${weatherData.observationpoint} (${weatherData.date}):
Temperature: ${weatherData.temperature}°C
Sky: ${weatherData.skytext}
Feels Like: ${weatherData.feelslike}°C
Humidity: ${weatherData.humidity}%
Wind: ${weatherData.winddisplay}
								`;

                bot.sendMessage(chat.chatId, message);
              } else {
                bot.sendMessage(
                  chat.id,
                  "No weather data found for that location."
                );
              }
            }
          }
        );
      }
    } catch (err) {
      console.log(err);
    }
  });
}

let cronJob;

async function setupBot() {
  // Telegram Bot Configuration
  try {
    const config = await Config.findOne();

    clearInterval(cronJob);

    cronJob = setInterval(() => {
      sendWeatherUpdate();
    }, config.interval * 1000);

    sendWeatherUpdate();
  } catch (err) {
    console.error(err);
  }
}

setupBot();
