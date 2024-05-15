// REQUIRES
require("./utils.js");
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const Joi = require("joi");
const app = express();
app.use(express.json());

const fs = require("fs");

// DECLARATIONS
const port = process.env.PORT || 4000;

// SERVER

//env variables
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_database_plantepedia = process.env.MONGODB_DATABASE_PLANTEPEDIA;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;

//mongodb database
var { database } = require("./databaseConnection");

const userCollection = database.db(mongodb_database).collection("users");


const plantSummaryCollection = database.db(mongodb_database_plantepedia).collection('plantSummary');
const plantDetailsCollection = database.db(mongodb_database_plantepedia).collection('plantDetails');



app.use(express.urlencoded({extended: false}));

//mongo store
var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

//session
app.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);

//salt rounds for hashing
const saltRounds = 12;

//Expiration for cookie
const expireTime = 1 * 60 * 60 * 1000;

// EXPRESS STATIC PATHS
app.use(express.json());
app.set("view engine", "ejs");

app.use("/img", express.static("./assets/img"));
app.use("/font", express.static("./assets/font"));
app.use("/components", express.static("./components"));
app.use("/views", express.static("./views"));
app.use("/modules", express.static("./modules"));
app.use("/landing", express.static("./views/landing"));
app.use("/home", express.static("./views/home"));
app.use("/community", express.static("./views/community"));
app.use("/settings", express.static("./views/settings"));
app.use("/signup", express.static("./views/signup"));
app.use("/login", express.static("./views/login"));
app.use("/plantepediaSummary", express.static("./views/plantepedia/summary"));

// LANDING PAGE
app.get("/", (req, res) => {
  if(req.session.authenticated){
    res.render("home/home");
  } else {
    res.render("landing/landing");
  }
});


// SIGNUP PAGE
app.get("/signup", async (req, res) => {
  res.render("signup/signup");
});

//SUBMITTING USER
app.post("/signup/submitUser", async (req, res) => {
  var name = req.body.name;
  var username = req.body.username;
  var password = req.body.password;
  var email = req.body.email;

  const schema = Joi.object({
    name: Joi.string().max(40).required(),
    username: Joi.string().alphanum().max(20).required(),
    email: Joi.string().email().max(255).required(),
    password: Joi.string().max(20).required(),
  });

  const validationResult = schema.validate({ name, username, password , email});
  if (validationResult.error != null) {
    console.log(validationResult.error);
    res.redirect("/signup");
    return;
  }

  var hashedPassword = await bcrypt.hash(password, saltRounds);

  await userCollection.insertOne({
    name: name,
    username: username,
    email: email,
    password: hashedPassword,
  });

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, password: 1, _id: 1, username: 1, name: 1 })
    .toArray();
  console.log("user submitted" + result);
  req.session.authenticated = true;
  req.session.username = result[0].username;
  req.session.email = result[0].email;
  req.session.cookie.maxAge = expireTime;
  res.redirect("/");
});

//LOGIN PAGE
app.get("/login", async (req, res) => {
  res.render("login/login");
});

app.post("/login/logging", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;
  const schema = Joi.string().max(255).required();
	const validationResult = schema.validate(email);
	if (validationResult.error != null) {
	   console.log(validationResult.error);
	   res.redirect("/login");
	   return;
	}
  const result = await userCollection.find({email: email}).project({email: 1, password: 1, _id: 1, username: 1}).toArray();


  if (result.length != 1) {
    res.redirect("/login");
    return;
  }

  if (await bcrypt.compare(password, result[0].password)) {
    req.session.authenticated = true;
    req.session.username = result[0].username;
    req.session.email = email;
    req.session.cookie.maxAge = expireTime;
    res.redirect("/");
    console.log("logged in");
    return;
  } else {
    res.redirect("/login");
    return;
  }
});

//reset password
app.get("/login/resetPassword", async (req, res) => {
  res.render("login/resetPassword");
});

app.post("/login/reset", async (req, res) => {
  var email = req.body.email;
  var newPassword = req.body.newPassword;

  var newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, password: 1, _id: 1, username: 1 })
    .toArray();

  for (let i = 0; i < result.length; i++) {
    if (result[i].email == email) {
      await userCollection.updateOne(
        { email: email },
        { $set: { password: newHashedPassword } }
      );
    }
  }

  res.redirect("/login");
});

// SETTINGS PAGE
app.get("/settings", (req, res) => {
  res.render("settings/settings");
});

// PLANTEPEDIA Summary PAGE
app.get("/plantepediaSummary", async (req, res) => {
  // TODO Need to Image column later
  const result = await plantSummaryCollection.find().project({plant_name: 1, summary: 1, type: 1, season: 1, difficulty: 1, nutrition: 1}).toArray();
  res.render("plantepedia/summary/plantepedia", {summaries: result});
});

// TODO Need to add plantepediaDetail page 
// // PLANTEPEDIA Plant's Detail PAGE
// app.get("/plantepediaDetail", async (req, res) => {
//   res.render("")
// });

// COMUNITY PAGE
app.get("/community", (req, res) => {
  res.render("community/community");
});

// LOGOUT ROUTE that destroys session document in database
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// PORT
app.listen(port, () => {
  console.log(`app listening on port ${port}`);
});
